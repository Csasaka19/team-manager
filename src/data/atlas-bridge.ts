/**
 * Atlas ↔ Team Manager bridge.
 *
 * Two responsibilities:
 *   1. Load a complete domain snapshot from Atlas in parallel and return it
 *      as the existing internal types. Failures per source are isolated so
 *      one bad endpoint doesn't take the whole load down.
 *   2. Maintain a "local overlay" — a localStorage-backed cache of any
 *      mutation the user makes while in apiMode. The overlay lets local
 *      edits survive the periodic API refresh that would otherwise revert
 *      them, since Atlas itself is read-only and never accepts writes.
 *
 * Overlay model per entity type:
 *   - `overrides`: id → entity. Wins over the same-id API entity at merge
 *     time. Locally-created entities (id not in the API set) are appended.
 *   - `tombstones`: ids that the user deleted; filtered out of the merged
 *     set on every refresh.
 */

import {
  fetchAtlasFeed,
  fetchAtlasManifest,
  fetchAtlasProjects,
  fetchAtlasSummary,
  fetchAtlasTasks,
} from '@/services/atlas/client'
import {
  UNASSIGNED_PROJECT_ID,
  buildProjectResolver,
  buildUnassignedProject,
  extractTeamMembers,
  inferDecidedBy,
  mapAtlasFeedItemToActivity,
  mapAtlasManifestToMeeting,
  mapAtlasProjectToProject,
  mapAtlasTaskToTask,
  normalizeAtlasSlug,
  populateProjectMemberIds,
} from '@/services/atlas-mapper'
import type {
  Activity,
  Meeting,
  Project,
  Task,
  TeamMember,
} from './types'
import type { AtlasManifest, AtlasSummary } from '@/services/atlas/types'

// ── Snapshot loading ─────────────────────────────────────────────────────

export interface AtlasSnapshot {
  projects: Project[]
  tasks: Task[]
  teamMembers: TeamMember[]
  activities: Activity[]
  meetings: Meeting[]
  /** ISO timestamp when this snapshot was assembled. */
  loadedAt: string
  /** Per-source errors so the UI can surface partial loads. */
  errors: Array<{ source: string; message: string }>
}

export interface LoadOptions {
  /** Skip manifest enumeration. The 60s refresh uses this — manifests
   *  change much less often than tasks or feed. */
  includeMeetings?: boolean
  /** Override `now` for deterministic tests. */
  now?: string
  /** How many days back from today (inclusive) to probe for manifests.
   *  We iterate `projects × dates` explicitly so today's manifests get
   *  picked up even when the `/summaries` index hasn't caught up yet,
   *  and so older meetings don't disappear behind the index's
   *  recency window. Default 30 — about a calendar month. */
  manifestDaysBack?: number
  /** Atlas project slugs to drop from the result before mapping. The
   *  store passes `['contracting-com']` here when Google Sheets is
   *  configured, so the sheet becomes the canonical source for that
   *  project and Atlas's copy is suppressed. Cascades through tasks,
   *  manifests, and meetings as well. */
  excludeProjectIds?: string[]
}

/** Build a list of YYYY-MM-DD strings (local time) from `today`
 *  inclusive going back `daysBack` days. */
function buildDateList(daysBack: number, now: Date = new Date()): string[] {
  const out: string[] = []
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push(`${yyyy}-${mm}-${dd}`)
  }
  return out
}

/** Heuristic: did this rejection come from a 404 (no manifest for that
 *  date)? Atlas surfaces missing manifests as 404s, which we treat as
 *  "no meeting that day" rather than as an error worth warning about. */
function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b404\b/.test(msg) || /not found/i.test(msg)
}

interface ManifestFetchResult {
  manifests: AtlasManifest[]
  summaries: Map<string, AtlasSummary>
  errors: AtlasSnapshot['errors']
}

/**
 * Fetch every (project, date) pair in parallel batches, dedupe the
 * resulting manifests by `manifest_id`, and return both the manifests
 * and the paired summaries needed for decision-text resolution.
 *
 * Concurrency cap (CHUNK) keeps us from firing ~600 simultaneous
 * requests at the local Atlas server on a 30-day initial load —
 * batches of 30 means ~20 sequential rounds, which is fast enough
 * for the user's wait but easy on the host.
 */
async function fetchManifestsForPairs(
  pairs: Array<{ project: string; date: string }>,
): Promise<ManifestFetchResult> {
  const manifests: AtlasManifest[] = []
  const summaries = new Map<string, AtlasSummary>()
  const errors: AtlasSnapshot['errors'] = []
  const seenManifestIds = new Set<string>()
  const CHUNK = 30

  for (let i = 0; i < pairs.length; i += CHUNK) {
    const slice = pairs.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      slice.map(async (p) => {
        const [manifest, summary] = await Promise.allSettled([
          fetchAtlasManifest(p.project, p.date),
          fetchAtlasSummary(p.project, p.date),
        ])
        return { pair: p, manifest, summary }
      }),
    )
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const { pair, manifest, summary } = r.value

      if (summary.status === 'fulfilled' && summary.value) {
        summaries.set(`${pair.project}__${pair.date}`, summary.value)
      } else if (
        summary.status === 'rejected' &&
        !isNotFoundError(summary.reason)
      ) {
        // Non-404 summary errors aren't fatal — the manifest can still
        // render, just without rationale/decision-text fallback.
        // eslint-disable-next-line no-console
        console.warn(
          `[atlas-bridge] summary fetch error: ${pair.project}/${pair.date}`,
          summary.reason,
        )
      }

      if (manifest.status === 'rejected') {
        if (!isNotFoundError(manifest.reason)) {
          const msg =
            manifest.reason instanceof Error
              ? manifest.reason.message
              : String(manifest.reason)
          errors.push({
            source: `manifest:${pair.project}/${pair.date}`,
            message: msg,
          })
          // eslint-disable-next-line no-console
          console.warn(
            `[atlas-bridge] manifest fetch error: ${pair.project}/${pair.date}`,
            manifest.reason,
          )
        }
        continue
      }
      const m = manifest.value
      if (!m) continue
      const toAdd: AtlasManifest[] =
        'manifests' in m && Array.isArray(m.manifests)
          ? m.manifests
          : 'manifest_id' in m
            ? [m as AtlasManifest]
            : []
      for (const one of toAdd) {
        // De-dup by manifest_id — the same manifest can surface from
        // both a (project, date) probe and a `/summaries` discovery
        // call (kept around for compatibility with older callers).
        if (seenManifestIds.has(one.manifest_id)) continue
        seenManifestIds.add(one.manifest_id)
        manifests.push(one)
      }
    }
  }
  return { manifests, summaries, errors }
}

/** Fetch every needed endpoint in parallel and return a fully-mapped
 *  snapshot. Partial failures are recorded, never thrown. */
export async function loadFromAtlas(
  opts: LoadOptions = {},
): Promise<AtlasSnapshot> {
  const includeMeetings = opts.includeMeetings ?? true
  const now = opts.now ?? new Date().toISOString()
  const errors: AtlasSnapshot['errors'] = []

  const record = (source: string) => (err: unknown) => {
    errors.push({
      source,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }

  const [projectsRawAll, tasksRawAll, feedRawAll] = await Promise.all([
    fetchAtlasProjects().catch(record('projects')),
    fetchAtlasTasks().catch(record('tasks')),
    fetchAtlasFeed(50).catch(record('feed')),
  ])

  // Apply the project-exclusion filter once, then thread the filtered
  // results to every downstream mapper. Exclusion cascades: tasks for an
  // excluded project are dropped, and same-project manifests are
  // suppressed too so we don't render orphaned data.
  // Normalize on both sides so a caller passing "Contracting-com" still
  // matches an API value of "contracting-com".
  const excluded = new Set(
    (opts.excludeProjectIds ?? []).map((s) => normalizeAtlasSlug(s)),
  )
  const isExcluded = (raw: string) => excluded.has(normalizeAtlasSlug(raw))
  const projectsRaw = projectsRawAll
    ? projectsRawAll.filter((p) => !isExcluded(p.slug))
    : projectsRawAll
  const tasksRaw = tasksRawAll
    ? tasksRawAll.filter((t) => !isExcluded(t.project))
    : tasksRawAll
  const feedRaw = feedRawAll
    ? feedRawAll.filter((f) => !isExcluded(f.project))
    : feedRawAll

  // Manifest fetch — explicit `projects × dates` iteration rather
  // than `/summaries`-driven. Two reasons:
  //   1. Today's manifest exists before the `/summaries` index
  //      catches up, so a summary-driven fetch misses it.
  //   2. `/summaries` caps recency to N entries; older manifests
  //      fall off the index even though their files are still
  //      queryable directly.
  //
  // We still fetch the paired summary alongside each manifest because
  // the manifest's `extractions.decisions[]` only carries decision IDs
  // — the actual prose lives in the summary markdown's bullets.
  const manifestSummaries = new Map<string, AtlasSummary>()
  let manifests: AtlasManifest[] = []
  if (includeMeetings && projectsRaw && projectsRaw.length > 0) {
    const daysBack = opts.manifestDaysBack ?? 30
    const dates = buildDateList(daysBack)
    const pairs = projectsRaw.flatMap((p) =>
      dates.map((date) => ({ project: p.slug, date })),
    )
    const fetched = await fetchManifestsForPairs(pairs)
    manifests = fetched.manifests
    for (const [k, v] of fetched.summaries) manifestSummaries.set(k, v)
    if (fetched.errors.length > 0) errors.push(...fetched.errors)
  }

  // Resolver maps a raw task.project (possibly an alias, possibly
  // miscased) onto the canonical lowercased slug we use as Project.id.
  // Tasks / activities / meetings that don't resolve get routed to a
  // synthetic Unassigned project so they never disappear silently.
  const resolveProjectId = buildProjectResolver(projectsRaw ?? [])
  const resolvedTasks = (tasksRaw ?? []).map((task) => ({
    task,
    projectId: resolveProjectId(task.project) ?? UNASSIGNED_PROJECT_ID,
  }))

  const tasks = resolvedTasks.map(({ task, projectId }) =>
    mapAtlasTaskToTask(task, projectId, { now }),
  )
  const activities = (feedRaw ?? []).map((f) =>
    mapAtlasFeedItemToActivity(f, { now, resolveProjectId }),
  )
  const meetings = manifests.map((m) =>
    mapAtlasManifestToMeeting(m, {
      now,
      resolveProjectId,
      summary: manifestSummaries.get(`${m.project}__${m.date}`) ?? null,
    }),
  )

  const orphanTaskCount = tasks.filter(
    (t) => t.projectId === UNASSIGNED_PROJECT_ID,
  ).length
  const hasOrphans =
    orphanTaskCount > 0 ||
    activities.some((a) => a.projectId === UNASSIGNED_PROJECT_ID) ||
    meetings.some((m) => m.projectId === UNASSIGNED_PROJECT_ID)

  if (orphanTaskCount > 0) {
    const sample = resolvedTasks.find(
      (rt) => rt.projectId === UNASSIGNED_PROJECT_ID,
    )
    // Log once per snapshot so silent drift is visible in dev tools.
    // eslint-disable-next-line no-console
    console.warn(
      `[atlas-bridge] ${orphanTaskCount} Atlas task(s) didn't match any project slug or alias — routed to "${UNASSIGNED_PROJECT_ID}". First orphan: ${sample?.task.id} (project="${sample?.task.project}")`,
    )
  }

  let projects: Project[] = (projectsRaw ?? []).map((p) =>
    mapAtlasProjectToProject(p, { now }),
  )
  if (hasOrphans) {
    projects = [...projects, buildUnassignedProject({ now })]
  }
  if (tasksRaw) projects = populateProjectMemberIds(projects, resolvedTasks)
  const teamMembers = extractTeamMembers(tasksRaw ?? [], { manifests, now })

  // Now that we know the full team roster, infer `decidedBy` for any
  // decision whose text starts with a recognisable name + decision
  // verb. The mapper can't do this in isolation — it sees one manifest
  // at a time and has no member context.
  const meetingsWithDecidedBy = meetings.map((m) => {
    if (m.decisions.length === 0) return m
    let changed = false
    const decisions = m.decisions.map((d) => {
      if (d.decidedBy !== null) return d
      const inferred = inferDecidedBy(d.text, teamMembers)
      if (!inferred) return d
      changed = true
      return { ...d, decidedBy: inferred }
    })
    return changed ? { ...m, decisions } : m
  })

  return {
    projects,
    tasks,
    teamMembers,
    activities,
    meetings: meetingsWithDecidedBy,
    loadedAt: now,
    errors,
  }
}

/**
 * Fetch manifests across every known project for the last `daysBack`
 * days (inclusive of today) and return them as fully-mapped `Meeting`
 * entities. Lighter than the full `loadFromAtlas` because it skips
 * projects/tasks/feed and only hits the manifest+summary endpoints.
 *
 * Used by:
 *   - The store's 5-min today-only timer (`daysBack: 0`) to catch
 *     meetings processed mid-workday.
 *   - The Meetings page's on-mount refresh (`daysBack: 30`) so a user
 *     navigating there always sees the latest Atlas state without
 *     waiting for the next background tick.
 *
 * Returns an empty array if Atlas isn't reachable or projects can't
 * be listed; the caller treats "nothing new" and "couldn't reach
 * Atlas" identically (the next tick will retry).
 */
export async function fetchMeetingsForRange(
  daysBack: number,
  opts: { excludeProjectIds?: string[] } = {},
): Promise<Meeting[]> {
  let projectsRaw
  try {
    projectsRaw = await fetchAtlasProjects()
  } catch {
    return []
  }
  const excluded = new Set(
    (opts.excludeProjectIds ?? []).map((s) => normalizeAtlasSlug(s)),
  )
  const projectsFiltered = projectsRaw.filter(
    (p) => !excluded.has(normalizeAtlasSlug(p.slug)),
  )
  if (projectsFiltered.length === 0) return []
  const dates = buildDateList(daysBack)
  if (dates.length === 0) return []
  const pairs = projectsFiltered.flatMap((p) =>
    dates.map((date) => ({ project: p.slug, date })),
  )
  const fetched = await fetchManifestsForPairs(pairs)
  if (fetched.manifests.length === 0) return []
  const resolveProjectId = buildProjectResolver(projectsFiltered)
  const now = new Date().toISOString()
  return fetched.manifests.map((m) =>
    mapAtlasManifestToMeeting(m, {
      now,
      resolveProjectId,
      summary: fetched.summaries.get(`${m.project}__${m.date}`) ?? null,
    }),
  )
}

/** Today-only variant — preserved for callers that explicitly want
 *  the fast single-date fetch. Thin wrapper over `fetchMeetingsForRange(0)`. */
export async function fetchTodaysMeetings(
  opts: { excludeProjectIds?: string[] } = {},
): Promise<Meeting[]> {
  return fetchMeetingsForRange(0, opts)
}

// ── Local overlay ───────────────────────────────────────────────────────

export interface LocalOverlay {
  tasks: Record<string, Task>
  taskTombstones: string[]
  activities: Record<string, Activity>
  activityTombstones: string[]
  projects: Record<string, Project>
  projectTombstones: string[]
  meetings: Record<string, Meeting>
  meetingTombstones: string[]
}

const OVERLAY_KEY = 'team-manager.atlas-overlay'

export function emptyOverlay(): LocalOverlay {
  return {
    tasks: {},
    taskTombstones: [],
    activities: {},
    activityTombstones: [],
    projects: {},
    projectTombstones: [],
    meetings: {},
    meetingTombstones: [],
  }
}

export function loadOverlay(): LocalOverlay {
  if (typeof window === 'undefined') return emptyOverlay()
  try {
    const raw = window.localStorage.getItem(OVERLAY_KEY)
    if (!raw) return emptyOverlay()
    const parsed = JSON.parse(raw) as Partial<LocalOverlay>
    return {
      tasks: parsed.tasks ?? {},
      taskTombstones: parsed.taskTombstones ?? [],
      activities: parsed.activities ?? {},
      activityTombstones: parsed.activityTombstones ?? [],
      projects: parsed.projects ?? {},
      projectTombstones: parsed.projectTombstones ?? [],
      meetings: parsed.meetings ?? {},
      meetingTombstones: parsed.meetingTombstones ?? [],
    }
  } catch {
    return emptyOverlay()
  }
}

export function saveOverlay(overlay: LocalOverlay): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))
  } catch {
    // Quota or private-mode storage — silently degrade. The overlay still
    // works in-memory for the session.
  }
}

export function clearOverlay(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(OVERLAY_KEY)
}

/**
 * Diff live state against a raw API snapshot. React's structural sharing
 * means untouched entities keep their original reference, so reference
 * equality on the same id is the cleanest signal that the user edited it.
 *
 *   - Live items whose reference differs from the snapshot's same-id item
 *     → override. (Includes locally-created items absent from the snapshot.)
 *   - Snapshot items whose id is missing from live → tombstone.
 */
export function diffOverlayPair<T extends { id: string }>(
  live: T[],
  snapshot: T[],
): { overrides: Record<string, T>; tombstones: string[] } {
  const snapById = new Map(snapshot.map((s) => [s.id, s]))
  const liveById = new Map(live.map((l) => [l.id, l]))
  const overrides: Record<string, T> = {}
  for (const [id, item] of liveById) {
    if (snapById.get(id) !== item) overrides[id] = item
  }
  const tombstones: string[] = []
  for (const id of snapById.keys()) {
    if (!liveById.has(id)) tombstones.push(id)
  }
  return { overrides, tombstones }
}

/** Merge a freshly-computed diff into the existing overlay. New overrides
 *  win over older ones; tombstones are deduped. Pure. */
export function mergeDiffIntoOverlay(
  overlay: LocalOverlay,
  liveTasks: Task[],
  liveActivities: Activity[],
  liveProjects: Project[],
  liveMeetings: Meeting[],
  snapshot: AtlasSnapshot,
): LocalOverlay {
  const taskDiff = diffOverlayPair(liveTasks, snapshot.tasks)
  const activityDiff = diffOverlayPair(liveActivities, snapshot.activities)
  const projectDiff = diffOverlayPair(liveProjects, snapshot.projects)
  const meetingDiff = diffOverlayPair(liveMeetings, snapshot.meetings)
  const dedupe = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]))
  return {
    tasks: { ...overlay.tasks, ...taskDiff.overrides },
    taskTombstones: dedupe(overlay.taskTombstones, taskDiff.tombstones),
    activities: { ...overlay.activities, ...activityDiff.overrides },
    activityTombstones: dedupe(
      overlay.activityTombstones,
      activityDiff.tombstones,
    ),
    projects: { ...overlay.projects, ...projectDiff.overrides },
    projectTombstones: dedupe(
      overlay.projectTombstones,
      projectDiff.tombstones,
    ),
    meetings: { ...overlay.meetings, ...meetingDiff.overrides },
    meetingTombstones: dedupe(
      overlay.meetingTombstones,
      meetingDiff.tombstones,
    ),
  }
}

/** Apply overrides + tombstones to a list of API entities. Pure. */
export function applyOverlayList<T extends { id: string }>(
  incoming: T[],
  overrides: Record<string, T>,
  tombstones: string[],
): T[] {
  const tombSet = new Set(tombstones)
  const overrideIds = new Set(Object.keys(overrides))
  const seen = new Set<string>()
  const out: T[] = []

  for (const item of incoming) {
    if (tombSet.has(item.id)) continue
    if (overrideIds.has(item.id)) {
      out.push(overrides[item.id] as T)
    } else {
      out.push(item)
    }
    seen.add(item.id)
  }
  // Locally-created entities (id not in API).
  for (const id of overrideIds) {
    if (seen.has(id)) continue
    out.push(overrides[id] as T)
  }
  return out
}

/** Apply every per-entity overlay to a full Atlas snapshot. Returns a new
 *  snapshot with mutations layered in — does not mutate either input. */
export function mergeSnapshotWithOverlay(
  snapshot: AtlasSnapshot,
  overlay: LocalOverlay,
): AtlasSnapshot {
  return {
    ...snapshot,
    tasks: applyOverlayList(snapshot.tasks, overlay.tasks, overlay.taskTombstones),
    activities: applyOverlayList(
      snapshot.activities,
      overlay.activities,
      overlay.activityTombstones,
    ),
    projects: applyOverlayList(
      snapshot.projects,
      overlay.projects,
      overlay.projectTombstones,
    ),
    meetings: applyOverlayList(
      snapshot.meetings,
      overlay.meetings,
      overlay.meetingTombstones,
    ),
  }
}

// ── Overlay mutation helpers ────────────────────────────────────────────
// Each returns a NEW LocalOverlay so callers can use them inside a React
// setState. None mutate the input.

export function setOverlayEntity<K extends EntityKey>(
  overlay: LocalOverlay,
  kind: K,
  entity: EntityFor<K>,
): LocalOverlay {
  const next: LocalOverlay = { ...overlay }
  const overridesKey = OVERRIDES_KEY[kind]
  const tombKey = TOMBSTONES_KEY[kind]
  // Drop a matching tombstone if present (un-delete by re-create with same id).
  const tombs = next[tombKey] as string[]
  if (tombs.includes(entity.id)) {
    next[tombKey] = tombs.filter((id) => id !== entity.id) as never
  }
  next[overridesKey] = {
    ...(next[overridesKey] as Record<string, unknown>),
    [entity.id]: entity,
  } as never
  return next
}

export function deleteOverlayEntity<K extends EntityKey>(
  overlay: LocalOverlay,
  kind: K,
  id: string,
): LocalOverlay {
  const next: LocalOverlay = { ...overlay }
  const overridesKey = OVERRIDES_KEY[kind]
  const tombKey = TOMBSTONES_KEY[kind]
  // Strip any override and add the tombstone.
  const overrides = { ...(next[overridesKey] as Record<string, unknown>) }
  delete overrides[id]
  next[overridesKey] = overrides as never
  const tombs = next[tombKey] as string[]
  if (!tombs.includes(id)) {
    next[tombKey] = [...tombs, id] as never
  }
  return next
}

type EntityKey = 'task' | 'activity' | 'project' | 'meeting'
type EntityFor<K extends EntityKey> = K extends 'task'
  ? Task
  : K extends 'activity'
    ? Activity
    : K extends 'project'
      ? Project
      : K extends 'meeting'
        ? Meeting
        : never

const OVERRIDES_KEY = {
  task: 'tasks',
  activity: 'activities',
  project: 'projects',
  meeting: 'meetings',
} as const

const TOMBSTONES_KEY = {
  task: 'taskTombstones',
  activity: 'activityTombstones',
  project: 'projectTombstones',
  meeting: 'meetingTombstones',
} as const

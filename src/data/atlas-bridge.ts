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
  fetchAtlasSummaries,
  fetchAtlasTasks,
} from '@/services/atlas/client'
import {
  UNASSIGNED_PROJECT_ID,
  buildProjectResolver,
  buildUnassignedProject,
  extractTeamMembers,
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
import type { AtlasManifest } from '@/services/atlas/types'

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
  /** Manifest enumeration ceiling. Default 25 — high enough to cover a
   *  couple of weeks of daily standups across all projects, low enough
   *  not to thrash the API on every refresh. */
  manifestLimit?: number
  /** Atlas project slugs to drop from the result before mapping. The
   *  store passes `['contracting-com']` here when Google Sheets is
   *  configured, so the sheet becomes the canonical source for that
   *  project and Atlas's copy is suppressed. Cascades through tasks,
   *  manifests, and meetings as well. */
  excludeProjectIds?: string[]
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

  const [projectsRawAll, tasksRawAll, feedRawAll, summariesRawAll] = await Promise.all([
    fetchAtlasProjects().catch(record('projects')),
    fetchAtlasTasks().catch(record('tasks')),
    fetchAtlasFeed(50).catch(record('feed')),
    includeMeetings
      ? fetchAtlasSummaries({ limit: opts.manifestLimit ?? 25 }).catch(
          record('summaries'),
        )
      : Promise.resolve(null),
  ])

  // Apply the project-exclusion filter once, then thread the filtered
  // results to every downstream mapper. Exclusion cascades: tasks for an
  // excluded project are dropped, and same-project summaries/manifests
  // are suppressed too so we don't render orphaned data.
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
  const summariesRaw = summariesRawAll
    ? summariesRawAll.filter((s) => !isExcluded(s.project))
    : summariesRawAll

  // Manifests are 1:1 with summary day-files. Issue them in parallel only
  // after we know which (project, date) pairs exist — saves us blindly
  // probing all-projects × last-N-days (9 × 7 = 63 calls) every refresh.
  let manifests: AtlasManifest[] = []
  if (includeMeetings && summariesRaw) {
    const limit = opts.manifestLimit ?? 25
    const pairs = summariesRaw.slice(0, limit)
    const results = await Promise.allSettled(
      pairs.map((p) => fetchAtlasManifest(p.project, p.date)),
    )
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const value = r.value
      if ('manifests' in value && Array.isArray(value.manifests)) {
        manifests.push(...value.manifests)
      } else if ('manifest_id' in value) {
        manifests.push(value as AtlasManifest)
      }
    }
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
    mapAtlasManifestToMeeting(m, { now, resolveProjectId }),
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

  return {
    projects,
    tasks,
    teamMembers,
    activities,
    meetings,
    loadedAt: now,
    errors,
  }
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

/**
 * Atlas → Team Manager data mapping layer.
 *
 * Every function here is a pure transformer: it takes raw Atlas API data
 * and returns the existing internal types from `src/data/types.ts`. No
 * fetches, no global state, no clock reads (callers can pass `now` for
 * deterministic tests; otherwise the current ISO string is used as the
 * default).
 *
 * Field-level decisions worth flagging:
 *
 *  - `Atlas state === 'inbox'` (where all live tasks currently sit) is not
 *    in the user's spec but is the canonical "newly captured" state on the
 *    Atlas side. It maps to `'todo'` here.
 *  - `Atlas state === 'blocked'` is in the spec but our `TaskStatus` enum
 *    does not have a Blocked column. It maps to `'in_progress'` (still
 *    active work, just stuck) and we tag the task so the UI could later
 *    surface a Blocked filter if you want one.
 *  - Atlas tasks can have multiple owners (`assignee_slugs: [...]`). Our
 *    `Task.assigneeId` is single-valued, so we pick the first slug as the
 *    canonical assignee. `extractTeamMembers` still picks up every slug.
 *  - The Atlas API has NO `/activity` endpoint — the closest equivalent is
 *    `/feed` (block-level summaries). `mapAtlasFeedItemToActivity` maps
 *    those to Activity rows with `type: 'comment'`, which is the only
 *    existing activity type loose enough to fit free-form markdown.
 *  - `createdBy` is required on Project / Task / Meeting but Atlas doesn't
 *    expose creator. We use the canonical assignee where present, falling
 *    back to the synthetic `'atlas'` actor.
 */

import type {
  ActionItem,
  Activity,
  Decision,
  MeetingLink,
  MeetingQuestion,
  Meeting,
  Priority,
  Project,
  Role,
  Subtask,
  Task,
  TaskStatus,
  TeamMember,
} from '@/data/types'
import type {
  AtlasFeedItem,
  AtlasManifest,
  AtlasManifestTask,
  AtlasProject,
  AtlasSummary,
  AtlasTask,
} from './atlas/types'

// ── Constants ────────────────────────────────────────────────────────────

/** Project color palette matching `ProjectFormModal`'s picker. */
const PROJECT_PALETTE = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
] as const

/** Synthetic actor id used when Atlas doesn't expose a creator. The UI
 *  will render "Atlas" wherever a TeamMember with this id isn't found. */
export const ATLAS_SYSTEM_ACTOR = 'atlas'

/** Synthetic project id for tasks whose `project` field doesn't resolve
 *  to any known Atlas project (case mismatch, alias drift, deleted
 *  parent project). Kept obviously-synthetic so it can never collide
 *  with a real slug. The `buildUnassignedProject` helper produces a
 *  full Project object using this id. */
export const UNASSIGNED_PROJECT_ID = '__atlas_unassigned__'

/** Normalize an Atlas slug so case differences between the `/projects`
 *  and `/tasks` payloads don't strand tasks. Trim + lowercase — that
 *  matches Atlas's documented slug shape ("trp", "contracting-com")
 *  and is a no-op when the API is already consistent. */
export function normalizeAtlasSlug(slug: string | undefined | null): string {
  return (slug ?? '').trim().toLowerCase()
}

/**
 * Build a resolver that turns a raw `task.project` value into the
 * canonical (lowercased) project slug used as `Project.id`. The
 * resolver also consults each project's `aliases[]` so a task that
 * references a project by alias (e.g. "trip" → "trp") still lands in
 * the right bucket. Returns `null` when no project matches; the
 * caller decides whether to drop the task or route it to the
 * unassigned bucket.
 */
export function buildProjectResolver(
  projects: Array<{ slug: string; aliases?: string[] }>,
): (rawTaskProject: string | undefined | null) => string | null {
  const bySlug = new Map<string, string>()
  for (const p of projects) {
    const canonical = normalizeAtlasSlug(p.slug)
    if (!canonical) continue
    bySlug.set(canonical, canonical)
    for (const alias of p.aliases ?? []) {
      const norm = normalizeAtlasSlug(alias)
      if (!norm) continue
      // Don't let an alias from one project shadow another project's
      // canonical slug if they collide — canonical wins.
      if (bySlug.has(norm) && bySlug.get(norm) !== canonical) continue
      bySlug.set(norm, canonical)
    }
  }
  return (raw) => {
    const norm = normalizeAtlasSlug(raw)
    if (!norm) return null
    return bySlug.get(norm) ?? null
  }
}

/**
 * Synthetic project used as a catch-all for tasks whose `project`
 * doesn't match any known Atlas project. Without this, orphaned tasks
 * silently disappear from the board — the user assumes the API
 * dropped them.
 */
export function buildUnassignedProject(
  options: { now?: string } = {},
): Project {
  const now = options.now ?? new Date().toISOString()
  return {
    id: UNASSIGNED_PROJECT_ID,
    name: 'Unassigned Tasks',
    description: "Tasks not associated with a specific Atlas project.",
    color: '#6B7280', // neutral gray
    memberIds: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: ATLAS_SYSTEM_ACTOR,
  }
}

/** Edit this to give known team members real display names and roles when
 *  their Atlas slug shows up. Any slug not listed gets an auto-generated
 *  display name (title-cased slug) and the `'member'` role. */
export const KNOWN_MEMBERS: Record<
  string,
  { name: string; role: Role; email: string }
> = {
  brian: { name: 'Brian', role: 'pm', email: 'brian@team.com' },
  chris: { name: 'Chris', role: 'member', email: 'chris@team.com' },
  clive: { name: 'Clive', role: 'member', email: 'clive@team.com' },
  elion: { name: 'Elion', role: 'member', email: 'elion@team.com' },
  rahim: { name: 'Rahim', role: 'member', email: 'rahim@team.com' },
  moses: { name: 'Moses', role: 'member', email: 'moses@team.com' },
  sabit: { name: 'Sabit', role: 'member', email: 'sabit@team.com' },
  rebeccah: { name: 'Rebeccah Fuaco', role: 'member', email: 'rebeccah@team.com' },
  alice: { name: 'Alice', role: 'member', email: 'alice@team.com' },
  bob: { name: 'Bob', role: 'member', email: 'bob@team.com' },
  kosir: { name: 'Brian Kosir', role: 'member', email: 'kosir@team.com' },
}

const PRIORITY_MAP: Record<string, Priority> = {
  critical: 'critical',
  urgent: 'critical',
  high: 'high',
  medium: 'medium',
  normal: 'medium',
  low: 'low',
}

/** Atlas `state` / `status` → our `TaskStatus`. Both `state` (directory)
 *  and `status` (frontmatter) flow through the same table; the caller picks
 *  whichever the API provided. */
const STATUS_MAP: Record<string, TaskStatus> = {
  inbox: 'todo',
  todo: 'todo',
  open: 'todo',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  active: 'in_progress',
  blocked: 'in_progress',
  review: 'in_review',
  'in-review': 'in_review',
  in_review: 'in_review',
  done: 'done',
  closed: 'done',
  complete: 'done',
  completed: 'done',
}

// ── Project ──────────────────────────────────────────────────────────────

/**
 * Atlas project → Team Manager project. `memberIds` is left empty —
 * populate after mapping tasks via `populateProjectMemberIds`.
 */
export function mapAtlasProjectToProject(
  atlas: AtlasProject,
  options: { now?: string } = {},
): Project {
  const now = options.now ?? new Date().toISOString()
  const id = normalizeAtlasSlug(atlas.slug)
  return {
    id,
    name: atlas.name && atlas.name.trim() ? atlas.name : slugToTitle(id),
    description: atlas.description ?? '',
    color: pickProjectColor(id),
    memberIds: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: ATLAS_SYSTEM_ACTOR,
  }
}

/**
 * Fills `memberIds` on every project based on the tasks attached to it.
 * Pure function — returns a new array, never mutates the inputs. Member
 * ids are deduplicated and stable (sorted alphabetically) so React keys
 * stay consistent across reruns.
 *
 * Callers must hand in pre-resolved (raw task, canonical projectId)
 * pairs so orphaned tasks attribute their members to the synthetic
 * unassigned project rather than back to a non-existent slug.
 */
export function populateProjectMemberIds(
  projects: Project[],
  resolvedTasks: ReadonlyArray<{ task: AtlasTask; projectId: string }>,
): Project[] {
  const byProject = new Map<string, Set<string>>()
  for (const { task, projectId } of resolvedTasks) {
    const set = byProject.get(projectId) ?? new Set<string>()
    for (const slug of allAssigneeSlugs(task)) set.add(slug)
    byProject.set(projectId, set)
  }
  return projects.map((p) => {
    const members = byProject.get(p.id)
    if (!members) return p
    return { ...p, memberIds: Array.from(members).sort() }
  })
}

// ── Task ─────────────────────────────────────────────────────────────────

/**
 * Atlas task → Team Manager task. `projectId` is passed in (typically the
 * Atlas `slug`, which is our `Project.id` after mapping).
 */
export function mapAtlasTaskToTask(
  atlas: AtlasTask,
  projectId: string,
  options: { now?: string } = {},
): Task {
  const now = options.now ?? new Date().toISOString()
  const slugs = allAssigneeSlugs(atlas)
  const primaryAssignee = slugs[0] ?? null

  return {
    id: atlas.id,
    title: extractTaskTitle(atlas),
    description: atlas.description ?? '',
    projectId,
    assigneeId: primaryAssignee,
    priority: mapPriority(atlas.priority),
    status: mapTaskStatus(atlas),
    // Route through the same sentinel-rejecting normaliser the
    // manifest action-item path uses — Atlas sometimes ships "due",
    // "unknown", etc. as a real `deadline` value on task rows and we
    // want them collapsed to null before they reach the UI.
    dueDate: normalizeManifestDeadline(atlas.deadline),
    tags: Array.isArray(atlas.tags) ? atlas.tags : [],
    subtasks: mapSubtasks(atlas),
    createdAt: dateFromAtlasTask(atlas) ?? now,
    updatedAt: atlas.updated ? toIsoDate(atlas.updated) : now,
    createdBy: primaryAssignee ?? ATLAS_SYSTEM_ACTOR,
  }
}

// ── Team members ────────────────────────────────────────────────────────

/**
 * Walks every task and collects unique assignee slugs into a TeamMember
 * list. Members in KNOWN_MEMBERS get their full profile; unknown slugs
 * get an auto-generated display name and the `'member'` role.
 *
 * Promotion rule for the synthetic PM: if any KNOWN_MEMBERS entry in the
 * set has `role: 'pm'`, that's the PM. Otherwise the FIRST member in
 * alphabetical order is promoted — deterministic across reruns, easy to
 * override by adding an entry to KNOWN_MEMBERS.
 *
 * Optionally accepts manifest task lists so the team gathered from
 * `/tasks` is widened by people who appear in `/manifests` extractions but
 * may not yet have their own task file.
 */
export function extractTeamMembers(
  tasks: AtlasTask[],
  options: { manifests?: AtlasManifest[]; now?: string } = {},
): TeamMember[] {
  const now = options.now ?? new Date().toISOString()

  const slugs = new Set<string>()
  for (const t of tasks) {
    for (const s of allAssigneeSlugs(t)) slugs.add(s)
  }
  for (const m of options.manifests ?? []) {
    for (const t of m.extractions.tasks) {
      for (const s of manifestTaskSlugs(t)) slugs.add(s)
    }
  }

  const ordered = Array.from(slugs).sort()
  const hasKnownPm = ordered.some((s) => KNOWN_MEMBERS[s]?.role === 'pm')

  return ordered.map((slug, index) => {
    const known = KNOWN_MEMBERS[slug]
    if (known) {
      return {
        id: slug,
        name: known.name,
        email: known.email,
        role: known.role,
        avatarUrl: null,
        createdAt: now,
      }
    }
    const role: Role = !hasKnownPm && index === 0 ? 'pm' : 'member'
    return {
      id: slug,
      name: slugToDisplayName(slug),
      email: `${slug}@team.com`,
      role,
      avatarUrl: null,
      createdAt: now,
    }
  })
}

// ── Meeting (from manifest) ──────────────────────────────────────────────

/**
 * Atlas manifest → Team Manager meeting. Manifests are post-processed
 * extractions of a discussion, so each one is treated as a completed
 * meeting on the project's timeline.
 */
export function mapAtlasManifestToMeeting(
  manifest: AtlasManifest,
  options: {
    now?: string
    /** Optional resolver so the meeting's `projectId` matches the
     *  canonical Project.id even when the manifest references the
     *  project by alias or in a different case. */
    resolveProjectId?: (raw: string) => string | null
    /** Day-summary doc paired with this manifest. The manifest's
     *  `extractions.decisions[]` is bare IDs in the current Atlas API;
     *  the prose lives in the summary markdown's "## Decisions"
     *  bullets. When supplied, we resolve decision text by index from
     *  those bullets. */
    summary?: AtlasSummary | null
  } = {},
): Meeting {
  const now = options.now ?? new Date().toISOString()
  const createdAt = manifest.processed_at ?? toIsoDate(manifest.date) ?? now
  // Mirrors the activity mapper: if the bridge supplied a resolver,
  // unmatched manifests route to UNASSIGNED rather than to a stable
  // but unmatched slug that would silently orphan the meeting.
  const resolvedProject = options.resolveProjectId
    ? options.resolveProjectId(manifest.project) ?? UNASSIGNED_PROJECT_ID
    : normalizeAtlasSlug(manifest.project) || UNASSIGNED_PROJECT_ID

  const attendees = collectAttendees(manifest)

  // Each `extractions.decisions[i]` is either a bare ID string (current
  // API) or an inline object (legacy / future shape). When we get IDs,
  // the actual prose is in the day-summary markdown under `## Decisions`
  // — fall back to the bullet at the same index. If the summary has
  // more bullets than the manifest has refs, surface those too so a
  // misaligned manifest doesn't drop user-visible content.
  const summaryDecisions = options.summary
    ? parseSummarySectionBullets(options.summary.content, 'Decisions')
    : []
  const refs = manifest.extractions.decisions
  const maxLen = Math.max(refs.length, summaryDecisions.length)
  const decisions: Decision[] = []
  for (let i = 0; i < maxLen; i += 1) {
    const ref = refs[i]
    const refIsObject = typeof ref === 'object' && ref !== null
    const inlineText = refIsObject ? ref.description : undefined
    const inlineId = refIsObject
      ? (typeof ref.id === 'string' && ref.id ? ref.id : null)
      : typeof ref === 'string' && ref
        ? ref
        : null
    const text = (inlineText ?? summaryDecisions[i] ?? '').trim()
    if (!text) continue
    const decision: Decision = {
      id: inlineId ?? `dec-${manifest.manifest_id}-${i}`,
      text,
      decidedBy: null,
    }
    if (refIsObject && typeof ref.rationale === 'string' && ref.rationale.trim()) {
      decision.rationale = ref.rationale.trim()
    }
    decisions.push(decision)
  }

  const actionItems: ActionItem[] = manifest.extractions.tasks.map((t, i) => ({
    id: typeof t.id === 'string' && t.id ? t.id : `act-${manifest.manifest_id}-${i}`,
    text: t.description,
    assigneeId: manifestTaskSlugs(t)[0] ?? null,
    dueDate: normalizeManifestDeadline(t.deadline),
    done: false,
    linkedTaskId: null,
  }))

  // Questions, blockers, and detected conflicts all surface in the same
  // "Questions & Blockers" UI section but keep their semantic kind so
  // the renderer can colour-code conflicts differently from open
  // questions. Empty entries are dropped.
  const questions: MeetingQuestion[] = []
  for (let i = 0; i < manifest.extractions.questions_blockers.length; i += 1) {
    const q = manifest.extractions.questions_blockers[i]
    if (!q) continue
    const text = (q.description ?? '').trim()
    if (!text) continue
    const kind: MeetingQuestion['kind'] = /\b(block|blocker|stuck|waiting)\b/i.test(text)
      ? 'blocker'
      : 'question'
    questions.push({
      id: typeof q.id === 'string' && q.id ? q.id : `qb-${manifest.manifest_id}-${i}`,
      text,
      kind,
    })
  }
  for (let i = 0; i < manifest.extractions.conflicts_detected.length; i += 1) {
    const c = manifest.extractions.conflicts_detected[i]
    if (!c) continue
    const text = (c.description ?? '').trim()
    if (!text) continue
    questions.push({
      id: typeof c.id === 'string' && c.id ? c.id : `conf-${manifest.manifest_id}-${i}`,
      text,
      kind: 'conflict',
    })
  }

  const links: MeetingLink[] = manifest.sources.map((s, i) => ({
    id: `link-${manifest.manifest_id}-${i}`,
    label: s.filename,
    url: s.summary_block ?? '',
  }))

  return {
    id: manifest.manifest_id ?? `${resolvedProject}-${manifest.date}`,
    title: deriveMeetingTitle(manifest, options.summary ?? null),
    projectId: resolvedProject || UNASSIGNED_PROJECT_ID,
    date: manifest.date,
    startTime: null,
    duration: null,
    attendeeIds: Array.from(attendees).sort(),
    status: 'completed',
    location: 'Atlas — Auto-extracted',
    agenda: null,
    notes: buildMeetingNotes(manifest, options.summary ?? null),
    decisions,
    actionItems,
    questions,
    links,
    createdBy: ATLAS_SYSTEM_ACTOR,
    createdAt,
    updatedAt: createdAt,
    lastEditedBy: null,
    lastEditedAt: null,
  }
}

// ── Activity (from feed) ────────────────────────────────────────────────

/**
 * The Atlas API has no `/activity` endpoint — the closest live signal is
 * `/feed` (block-level summary items). We map each feed item to an
 * `Activity` row with `type: 'comment'` (the only flexible-content type
 * in our ActivityType union).
 *
 * Unknown fields on the incoming object are surfaced via console.warn so
 * a future API change is noticed during development rather than silently
 * dropped.
 */
export function mapAtlasFeedItemToActivity(
  feedItem: AtlasFeedItem,
  options: {
    now?: string
    /** Same resolver the bridge uses for tasks. When supplied, the
     *  activity's projectId lands on the canonical slug (or
     *  UNASSIGNED_PROJECT_ID if it can't be resolved) instead of the
     *  raw feed value — keeps feed cross-links consistent with tasks. */
    resolveProjectId?: (raw: string) => string | null
  } = {},
): Activity {
  const now = options.now ?? new Date().toISOString()
  warnUnknownFeedFields(feedItem)

  const createdAt = toIsoDate(feedItem.date) ?? now
  // If a resolver is supplied (atlas-bridge path), unmatched activities
  // route to UNASSIGNED — same treatment as orphaned tasks so they
  // never disappear. Without a resolver (callers that haven't loaded
  // the project list yet), keep the normalized raw value as a
  // best-effort id.
  const projectId = options.resolveProjectId
    ? options.resolveProjectId(feedItem.project) ?? UNASSIGNED_PROJECT_ID
    : normalizeAtlasSlug(feedItem.project) || UNASSIGNED_PROJECT_ID
  const activity: Activity = {
    id: `atlas-feed-${feedItem.source_slug}`,
    taskId: null,
    actorId: ATLAS_SYSTEM_ACTOR,
    type: 'comment',
    content: feedItem.content,
    mentions: [],
    createdAt,
    projectId,
  }
  return activity
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Stable-color hash so the same Atlas slug always picks the same color
 *  from `PROJECT_PALETTE`. Uses a 32-bit FNV-1a so swapping the palette
 *  order doesn't visually shuffle existing projects until you intend it to. */
function pickProjectColor(slug: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < slug.length; i += 1) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const idx = Math.abs(h) % PROJECT_PALETTE.length
  return PROJECT_PALETTE[idx] ?? PROJECT_PALETTE[0]
}

/** "trp" → "TRP" (treated as acronym), "water-vending" → "Water Vending". */
function slugToTitle(slug: string): string {
  if (!slug) return ''
  const parts = slug.split(/[-_]/).filter(Boolean)
  return parts
    .map((p) => {
      // Short all-lowercase tokens are likely acronyms (trp, gtlv, ci).
      if (p.length <= 4 && p === p.toLowerCase()) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
}

/** Person-name slug → display name. Simple capitalisation; KNOWN_MEMBERS
 *  takes precedence wherever this is the fallback. */
function slugToDisplayName(slug: string): string {
  if (!slug) return ''
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function mapPriority(input: AtlasTask['priority']): Priority {
  if (!input) return 'medium'
  return PRIORITY_MAP[String(input).toLowerCase()] ?? 'medium'
}

function mapTaskStatus(atlas: AtlasTask): TaskStatus {
  const candidates: Array<string | undefined> = [atlas.status, atlas.state]
  for (const c of candidates) {
    if (!c) continue
    const mapped = STATUS_MAP[String(c).toLowerCase()]
    if (mapped) return mapped
  }
  return 'todo'
}

/** Collect every assignee slug from a task. Atlas multi-owner tasks
 *  populate `assignee_slugs`; older entries only carry `assignee` as a
 *  display string, so we slugify it as a fallback. */
function allAssigneeSlugs(task: AtlasTask): string[] {
  if (Array.isArray(task.assignee_slugs) && task.assignee_slugs.length > 0) {
    return task.assignee_slugs.map((s) => String(s).toLowerCase()).filter(Boolean)
  }
  if (task.assignee && task.assignee.trim()) {
    // Split on "&" / "and" / "," for the rare "Alice & Bob" string with no slugs.
    return task.assignee
      .split(/&| and |,/i)
      .map((s) => slugify(s))
      .filter(Boolean)
  }
  return []
}

function manifestTaskSlugs(t: AtlasManifestTask): string[] {
  const raw = t['assignee_slugs']
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((s) => String(s).toLowerCase()).filter(Boolean)
  }
  if (typeof t.assignee === 'string' && t.assignee.trim()) {
    return t.assignee
      .split(/&| and |,/i)
      .map((s) => slugify(s))
      .filter(Boolean)
  }
  return []
}

/** Title heuristic for tasks:
 *   1. First markdown heading in `description` (most reliable).
 *   2. Filename stem stripped of the leading YYYY-MM-DD, the assignee
 *      slug(s), and the literal "task" — converted to title case.
 *   3. The raw id as a last resort.
 */
function extractTaskTitle(task: AtlasTask): string {
  const heading = firstHeading(task.description ?? '')
  if (heading) return heading

  const id = task.id ?? ''
  const slugs = new Set(allAssigneeSlugs(task))
  // Strip leading YYYY-MM-DD-
  let stem = id.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  // Remove the literal "task" and any slug tokens.
  const tokens = stem
    .split('-')
    .filter((t) => t && t !== 'task' && !slugs.has(t.toLowerCase()))
  const joined = tokens.join(' ').trim()
  if (joined) {
    return joined
      .split(' ')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ')
  }
  return id || 'Untitled task'
}

function mapSubtasks(_task: AtlasTask): Subtask[] {
  // Atlas tasks don't currently expose subtasks on the public API. Reserved
  // for when the shape grows — until then, every task has an empty list.
  return []
}

/** Parse the `YYYY-MM-DD-...` prefix from the Atlas task id and return an
 *  ISO string. Returns `null` if there's no recognisable date prefix. */
function dateFromAtlasTask(task: AtlasTask): string | null {
  if (task.created) return toIsoDate(task.created)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(task.id ?? '')
  if (!m) return null
  return toIsoDate(`${m[1]}-${m[2]}-${m[3]}`)
}

function toIsoDate(input: string): string {
  // Already a full ISO datetime → trust it.
  if (/T\d{2}:\d{2}:\d{2}/.test(input)) return input
  // YYYY-MM-DD only → anchor at midnight UTC so it sorts correctly with
  // the rest of the app's ISO timestamps.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return `${input}T00:00:00.000Z`
  return input
}

function firstHeading(content: string): string | null {
  for (const line of content.split('\n')) {
    const m = /^#{1,3}\s+(.+)$/.exec(line.trim())
    if (m && m[1]) return m[1].trim()
  }
  return null
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Names that show up in source filenames but represent ZoomBot /
 *  transcription bots, not human participants. Anything containing
 *  "digital" or matching one of these slugs is dropped from the
 *  attendee roster. */
const KNOWN_BOT_SLUGS = new Set([
  'digitalbrian',
  'digital-brian',
  'zoombot',
  'zoom-bot',
  'otter',
  'fireflies',
])

function isBotSlug(slug: string): boolean {
  const lc = slug.toLowerCase()
  if (KNOWN_BOT_SLUGS.has(lc)) return true
  return lc.includes('digital') || lc.includes('bot')
}

/** Pull participant slugs out of a source filename.
 *
 *  Filenames look like
 *  "Room_2_Brian_P_DigitalBrian_2026-06-24_15-04-00.txt"
 *  Tokenize on `_`, drop the leading "Room_N" prefix, drop the trailing
 *  date+time, then walk the remaining tokens. Two-token names that
 *  match KNOWN_MEMBERS as a pair (e.g. `Brian_P` → "brian-p") get
 *  preferred over the single-token form.
 */
function attendeesFromFilename(filename: string): string[] {
  if (typeof filename !== 'string') return []
  const stem = filename.replace(/\.[a-z0-9]+$/i, '')
  // Strip trailing YYYY-MM-DD[_HH-MM-SS].
  const noDate = stem.replace(/_+\d{4}-\d{2}-\d{2}(?:_\d{2}-\d{2}-\d{2})?$/, '')
  // Strip leading "Room_N" / "Room_NN".
  const noRoom = noDate.replace(/^Room_\d+_/i, '')
  const tokens = noRoom.split(/_+/).filter(Boolean)

  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]!
    if (isBotSlug(tok)) {
      i += 1
      continue
    }
    // Combine an initial suffix with the previous name: "Brian_P" →
    // "brian-p". A token of ≤2 alphabetic characters following a
    // longer name is interpreted as an initial (matches what Zoom
    // does to disambiguate same-first-name participants).
    if (i + 1 < tokens.length) {
      const next = tokens[i + 1]!
      const isInitial = /^[A-Za-z]{1,2}$/.test(next) && tok.length > 2
      const pair = `${tok}-${next}`.toLowerCase()
      if (KNOWN_MEMBERS[pair] || isInitial) {
        if (!isBotSlug(pair)) out.push(pair)
        i += 2
        continue
      }
    }
    const single = tok.toLowerCase()
    if (single && !isBotSlug(single)) out.push(single)
    i += 1
  }
  return out
}

/** Union of task-assignee slugs and filename-derived participant slugs,
 *  minus known bots. Returns a sorted Set for stable ordering. */
function collectAttendees(manifest: AtlasManifest): Set<string> {
  const out = new Set<string>()
  for (const t of manifest.extractions.tasks) {
    for (const s of manifestTaskSlugs(t)) {
      if (!isBotSlug(s)) out.add(s)
    }
  }
  for (const src of manifest.sources) {
    for (const s of attendeesFromFilename(src.filename ?? '')) out.add(s)
  }
  return out
}

/** Treat the literal strings Atlas uses for "no deadline known"
 *  ("unknown", "tbd", "n/a", "due", empty, ...) as null so the UI
 *  doesn't render them as a real due date. We do NOT validate the
 *  date format here — downstream renderers already cope with
 *  arbitrary date-ish strings; we just refuse the sentinel
 *  non-dates. "due" landed in this list after we saw it leak from
 *  Atlas as a column-header artefact into actual task rows. */
function normalizeManifestDeadline(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const lc = trimmed.toLowerCase()
  if (
    lc === 'unknown' ||
    lc === 'tbd' ||
    lc === 'n/a' ||
    lc === 'none' ||
    lc === 'null' ||
    lc === 'due'
  ) {
    return null
  }
  return trimmed
}

/** Pull the first `# Headline` line out of a summary markdown body and
 *  trim the boilerplate "— Daily Summary YYYY-MM-DD" suffix that Atlas
 *  appends to the heading. */
function summaryHeadline(summary: AtlasSummary | null): string | null {
  if (!summary) return null
  for (const raw of summary.content.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.*)$/.exec(raw.trim())
    if (m && m[1]) {
      const heading = m[1].trim()
      if (/^daily\s+summary/i.test(heading)) continue
      // "Foo Sync — Daily Summary 2026-06-24" → "Foo Sync"
      const stripped = heading
        .replace(/\s*[—–-]\s*Daily Summary\s+\d{4}-\d{2}-\d{2}\s*$/i, '')
        .trim()
      return stripped || heading
    }
  }
  return null
}

function deriveMeetingTitle(
  m: AtlasManifest,
  summary: AtlasSummary | null,
): string {
  const headline = summaryHeadline(summary)
  if (headline) return headline
  const first = m.sources[0]
  if (first && typeof first.filename === 'string') {
    // "Room_2_Clive_Chris_Brian_P_2026-06-10_14-23-00.txt" → strip ext and
    // separators, drop the date suffix so the title reads as a name.
    const stem = first.filename
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+\d{4}-\d{2}-\d{2}.*$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
    if (stem) return `${stem} — ${m.date}`
  }
  return `Meeting — ${m.date}`
}

/**
 * Best-effort: infer who made a decision when the source data didn't
 * carry a `decidedBy`. We look at the head of the decision text for a
 * known member name followed by a decision verb ("agreed", "decided",
 * "confirmed", "approved", "chose", "committed", "will"). Returns the
 * member's id, or `null` when no confident match exists.
 *
 * Tries the two-token prefix first (so "Brian P agreed…" matches
 * "Brian P" rather than partial-matching "Brian") before falling back
 * to the single-token prefix.
 */
export function inferDecidedBy(
  text: string,
  members: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  if (!text) return null
  const verb = /^\s*([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)\s+(agreed|decided|confirmed|approved|chose|committed|will)\b/
  const m = verb.exec(text)
  if (!m || !m[1]) return null
  const candidate = m[1].trim().toLowerCase()
  // Two-token candidate ("Brian P") — match in full first.
  const exact = members.find((mem) => mem.name.toLowerCase() === candidate)
  if (exact) return exact.id
  // Fall back to the first token only ("Brian") — but require the
  // first token to be at least 3 chars so we don't match initials.
  const firstToken = candidate.split(/\s+/)[0] ?? ''
  if (firstToken.length < 3) return null
  const singleMatches = members.filter(
    (mem) => mem.name.toLowerCase().split(/\s+/)[0] === firstToken,
  )
  // Only accept a single-token match when it's unambiguous — two
  // "Brian"s on the roster means we punt to "(group)".
  if (singleMatches.length === 1) return singleMatches[0]!.id
  return null
}

/**
 * Pull bullet lines out of a named section of an Atlas summary's
 * markdown. The bridge uses this to recover decision prose from
 * `## Decisions` because manifests only carry decision IDs.
 *
 * Accepts `-`, `*`, or `+` bullets, optional leading whitespace, and
 * stops at the next heading. Returns trimmed bullet text in document
 * order. Returns `[]` if the section isn't present or has no bullets.
 */
export function parseSummarySectionBullets(
  content: string,
  sectionTitle: string,
): string[] {
  const lines = content.split(/\r?\n/)
  const titleLc = sectionTitle.trim().toLowerCase()
  const out: string[] = []
  let inSection = false
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      if (inSection) break
      if (heading[2]?.trim().toLowerCase() === titleLc) {
        inSection = true
      }
      continue
    }
    if (!inSection) continue
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (bullet && bullet[1]) {
      const text = bullet[1].trim()
      if (text) out.push(text)
    }
  }
  return out
}

/**
 * Discussion-notes body for a meeting.
 *
 * Priority order:
 *   1. Use the day-summary markdown verbatim when available — it
 *      already has Headline / Decisions / Progress / Blockers / Source
 *      sections written by Atlas. We strip a leading `# Title` line so
 *      it doesn't duplicate the meeting title that's rendered above.
 *      Decision and action-item content is intentionally kept (their
 *      dedicated sections reuse the same data, but seeing it in the
 *      narrative gives readers the surrounding paragraphs that the
 *      structured rows can't carry).
 *   2. Fall back to synthesising structured markdown from the manifest
 *      extractions when no summary is attached.
 */
function buildMeetingNotes(
  m: AtlasManifest,
  summary: AtlasSummary | null,
): string {
  if (summary && summary.content && summary.content.trim()) {
    return stripLeadingTitle(summary.content).trim()
  }
  const ext = m.extractions
  const sections: string[] = []
  if (ext.status_updates.length > 0) {
    sections.push(
      ['## Progress', ...ext.status_updates.map((s) => `- ${s.description}`)].join('\n'),
    )
  }
  if (ext.knowledge_artifacts.length > 0) {
    sections.push(
      ['## Knowledge', ...ext.knowledge_artifacts.map((k) => `- ${k.description}`)].join(
        '\n',
      ),
    )
  }
  if (ext.questions_blockers.length > 0) {
    sections.push(
      [
        '## Questions & Blockers',
        ...ext.questions_blockers.map((q) => `- ${q.description}`),
      ].join('\n'),
    )
  }
  return sections.join('\n\n').trim()
}

/** Drop the first `# Heading` line from a markdown body. Used to avoid
 *  duplicating the summary's headline in the discussion-notes panel
 *  when the page header already shows it as the meeting title. */
function stripLeadingTitle(content: string): string {
  const lines = content.split(/\r?\n/)
  let i = 0
  // Skip leading blanks
  while (i < lines.length && lines[i] !== undefined && lines[i]!.trim() === '') i += 1
  if (i < lines.length && /^#\s+/.test(lines[i]!)) {
    i += 1
    // Skip the blank line that usually follows a heading
    while (i < lines.length && lines[i] !== undefined && lines[i]!.trim() === '') i += 1
  }
  return lines.slice(i).join('\n')
}

const KNOWN_FEED_FIELDS = new Set([
  'project',
  'source_slug',
  'type',
  'date',
  'tags',
  'content',
])

function warnUnknownFeedFields(item: AtlasFeedItem): void {
  // Best-effort: scans each call's own keys, not its prototype, and only
  // logs the unfamiliar names once per session per name so a noisy field
  // doesn't drown stdout.
  for (const key of Object.keys(item)) {
    if (KNOWN_FEED_FIELDS.has(key)) continue
    if (warnedKeys.has(key)) continue
    warnedKeys.add(key)
    // eslint-disable-next-line no-console
    console.warn(
      `[atlas-mapper] unrecognized field "${key}" on /feed item — extend AtlasFeedItem + this mapper to surface it.`,
    )
  }
}

const warnedKeys = new Set<string>()

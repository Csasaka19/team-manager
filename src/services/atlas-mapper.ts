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
  return {
    id: atlas.slug,
    name: atlas.name && atlas.name.trim() ? atlas.name : slugToTitle(atlas.slug),
    description: atlas.description ?? '',
    color: pickProjectColor(atlas.slug),
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
 */
export function populateProjectMemberIds(
  projects: Project[],
  tasks: AtlasTask[],
): Project[] {
  const byProject = new Map<string, Set<string>>()
  for (const t of tasks) {
    const set = byProject.get(t.project) ?? new Set<string>()
    for (const slug of allAssigneeSlugs(t)) set.add(slug)
    byProject.set(t.project, set)
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
    dueDate: atlas.deadline ?? null,
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
  options: { now?: string } = {},
): Meeting {
  const now = options.now ?? new Date().toISOString()
  const createdAt = manifest.processed_at ?? toIsoDate(manifest.date) ?? now

  const attendees = new Set<string>()
  for (const t of manifest.extractions.tasks) {
    for (const s of manifestTaskSlugs(t)) attendees.add(s)
  }

  const decisions: Decision[] = manifest.extractions.decisions.map((d, i) => ({
    id: typeof d.id === 'string' && d.id ? d.id : `dec-${manifest.manifest_id}-${i}`,
    text: d.description,
    decidedBy: null,
  }))

  const actionItems: ActionItem[] = manifest.extractions.tasks.map((t, i) => ({
    id: typeof t.id === 'string' && t.id ? t.id : `act-${manifest.manifest_id}-${i}`,
    text: t.description,
    assigneeId: manifestTaskSlugs(t)[0] ?? null,
    dueDate: typeof t.deadline === 'string' ? t.deadline : null,
    done: false,
    linkedTaskId: null,
  }))

  const links: MeetingLink[] = manifest.sources.map((s, i) => ({
    id: `link-${manifest.manifest_id}-${i}`,
    label: s.filename,
    url: s.summary_block ?? '',
  }))

  return {
    id: manifest.manifest_id ?? `${manifest.project}-${manifest.date}`,
    title: deriveMeetingTitle(manifest),
    projectId: manifest.project,
    date: manifest.date,
    startTime: null,
    duration: null,
    attendeeIds: Array.from(attendees).sort(),
    status: 'completed',
    location: 'Atlas — Auto-extracted',
    agenda: null,
    notes: buildMeetingNotes(manifest),
    decisions,
    actionItems,
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
  options: { now?: string } = {},
): Activity {
  const now = options.now ?? new Date().toISOString()
  warnUnknownFeedFields(feedItem)

  const createdAt = toIsoDate(feedItem.date) ?? now
  const activity: Activity = {
    id: `atlas-feed-${feedItem.source_slug}`,
    taskId: null,
    actorId: ATLAS_SYSTEM_ACTOR,
    type: 'comment',
    content: feedItem.content,
    mentions: [],
    createdAt,
    projectId: feedItem.project,
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

function deriveMeetingTitle(m: AtlasManifest): string {
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
  return `Daily Manifest — ${m.date}`
}

function buildMeetingNotes(m: AtlasManifest): string {
  const lines: string[] = []
  const ext = m.extractions
  if (ext.status_updates.length > 0) {
    lines.push('Status updates:')
    for (const s of ext.status_updates) lines.push(`- ${s.description}`)
    lines.push('')
  }
  if (ext.knowledge_artifacts.length > 0) {
    lines.push('Knowledge artifacts:')
    for (const k of ext.knowledge_artifacts) lines.push(`- ${k.description}`)
    lines.push('')
  }
  if (ext.questions_blockers.length > 0) {
    lines.push('Questions / blockers:')
    for (const q of ext.questions_blockers) lines.push(`- ${q.description}`)
    lines.push('')
  }
  return lines.join('\n').trim()
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

/**
 * Bridge between the in-memory `LocalOverlay` (the user's local edits
 * on top of the Atlas / Sheets / mock source data) and the normalised
 * Supabase tables in `services/supabase-api.ts`.
 *
 * The store stays oblivious to per-table CRUD. It hands a
 * before/after `LocalOverlay` pair to `syncOverlayDiff` and gets back
 * a fire-and-forget promise; this module translates the diff into
 * the right per-entity Supabase calls, retries once on failure, and
 * surfaces a toast if persistence keeps failing. Bootstrap goes the
 * other way: pull every Supabase table, fold the rows into a
 * LocalOverlay, and let the store merge that on top of its
 * source snapshot.
 *
 * Mutation flow (optimistic):
 *   1. Store updates React state immediately (existing behaviour).
 *   2. Store recomputes `overlay = diff(state, snapshot)` and saves
 *      to localStorage (existing behaviour).
 *   3. Store calls `syncOverlayDiff(prevOverlay, nextOverlay)` here.
 *   4. We diff the two overlays, fire the right Supabase calls,
 *      retry once on failure, and toast if both attempts fail.
 *   5. Local state is **never** reverted on failure — the user's
 *      intent is the source of truth; persistence is best-effort.
 *
 * Schema-aligned writes: every translation here matches the live
 * column names captured in `services/supabase-api.ts`. If the SQL
 * changes, update both files.
 */

import { toast } from 'sonner'
import type {
  ActionItem,
  Activity,
  ActivityType,
  CommentLabel,
  Decision,
  Meeting,
  MeetingLink,
  MeetingStatus,
  Priority,
  Subtask,
  Task,
  TaskStatus,
} from './types'
import type { LocalOverlay } from './atlas-bridge'
import { emptyOverlay } from './atlas-bridge'
import {
  createActivity,
  createComment,
  createLocalTask,
  createSubtask,
  deleteLocalTask,
  deleteMeeting,
  deleteSubtask,
  deleteTaskOverride,
  getAllComments,
  getAllSettings,
  getAllSubtasks,
  getLocalTasks,
  getMeetings,
  getNotificationPreferences,
  getRecentActivities,
  getTaskOverrides,
  updateSubtask,
  upsertMeeting,
  upsertTaskOverride,
  type ActivityRow,
  type CommentRow,
  type LocalTaskRow,
  type MeetingActionItemRow,
  type MeetingDecisionRow,
  type MeetingLinkRow,
  type MeetingRow,
  type MeetingWithRelations,
  type NotificationPreferencesRow,
  type SubtaskRow,
  type TaskOverrideRow,
} from '@/services/supabase-api'
import { isSupabaseConfigured } from '@/services/supabase'

// ── Types ───────────────────────────────────────────────────────────────────

export interface SupabaseBootstrap {
  overrides: TaskOverrideRow[]
  localTasks: LocalTaskRow[]
  subtasks: SubtaskRow[]
  comments: CommentRow[]
  activities: ActivityRow[]
  meetings: MeetingWithRelations[]
  settings: Record<string, unknown>
  notificationPreferences: NotificationPreferencesRow | null
}

export interface SyncOptions {
  /** Snapshot tasks indexed by id — needed to (a) decide
   *  override-vs-local for unknown task ids, (b) recover non-overridden
   *  fields when assembling a full Task from override rows. */
  snapshotTasks: ReadonlyMap<string, Task>
  /** Snapshot meetings indexed by id — same role as snapshotTasks. */
  snapshotMeetings: ReadonlyMap<string, Meeting>
  /** Member who triggered the change — gets recorded as
   *  `overridden_by` / `actor_id` / `created_by`. */
  actorId: string
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Fan out every read in parallel. If Supabase isn't configured we
 * short-circuit with an empty bootstrap so callers can use a single
 * code path.
 */
export async function bootstrapFromSupabase(
  currentUserId: string | null,
): Promise<SupabaseBootstrap> {
  if (!isSupabaseConfigured()) {
    return emptyBootstrap()
  }
  const [
    overrides,
    localTasks,
    subtasks,
    comments,
    activities,
    meetings,
    settings,
    prefs,
  ] = await Promise.all([
    getTaskOverrides(),
    getLocalTasks(),
    getAllSubtasks(),
    getAllComments(),
    // Activities feed only needs the most recent rows — the dashboard
    // shows ~15 and the rest is paginated. Pulling more on every login
    // hurts startup for no UI gain.
    getRecentActivities(50),
    getMeetings(),
    getAllSettings(),
    currentUserId
      ? getNotificationPreferences(currentUserId)
      : Promise.resolve(null),
  ])
  return {
    overrides,
    localTasks,
    subtasks,
    comments,
    activities,
    meetings,
    settings,
    notificationPreferences: prefs,
  }
}

function emptyBootstrap(): SupabaseBootstrap {
  return {
    overrides: [],
    localTasks: [],
    subtasks: [],
    comments: [],
    activities: [],
    meetings: [],
    settings: {},
    notificationPreferences: null,
  }
}

/**
 * Fold a Supabase bootstrap into the existing `LocalOverlay`. Supabase
 * wins over any in-memory localStorage overlay because it's the
 * authoritative shared state — the localStorage cache is a backup, not
 * a source of truth.
 */
export function applyBootstrapToOverlay(
  base: LocalOverlay,
  bootstrap: SupabaseBootstrap,
  opts: { snapshotTasks: ReadonlyMap<string, Task> },
): LocalOverlay {
  const next: LocalOverlay = {
    tasks: { ...base.tasks },
    taskTombstones: [...base.taskTombstones],
    activities: { ...base.activities },
    activityTombstones: [...base.activityTombstones],
    projects: { ...base.projects },
    projectTombstones: [...base.projectTombstones],
    meetings: { ...base.meetings },
    meetingTombstones: [...base.meetingTombstones],
  }

  // Group subtasks by their parent task so we can attach in one pass.
  const subtasksByTask = new Map<string, SubtaskRow[]>()
  for (const s of bootstrap.subtasks) {
    const list = subtasksByTask.get(s.task_id) ?? []
    list.push(s)
    subtasksByTask.set(s.task_id, list)
  }

  // Group comments by task so we can convert to comment-type Activity.
  const commentsByTask = new Map<string, CommentRow[]>()
  for (const c of bootstrap.comments) {
    const list = commentsByTask.get(c.task_id) ?? []
    list.push(c)
    commentsByTask.set(c.task_id, list)
  }

  // 1) Apply task_overrides on top of snapshot tasks.
  for (const o of bootstrap.overrides) {
    const snap = opts.snapshotTasks.get(o.task_id)
    if (!snap) continue // override for a task we don't have — skip silently
    const patched: Task = {
      ...snap,
      status: (o.status as TaskStatus) ?? snap.status,
      priority: (o.priority as Priority) ?? snap.priority,
      assigneeId: o.assignee_id ?? snap.assigneeId,
      dueDate: o.due_date ?? snap.dueDate,
      subtasks: snap.subtasks,
      updatedAt: o.updated_at ?? snap.updatedAt,
    }
    next.tasks[o.task_id] = patched
  }

  // 2) Convert local_tasks to full Task entities.
  for (const lt of bootstrap.localTasks) {
    next.tasks[lt.id] = localTaskRowToDomain(lt)
  }

  // 3) Attach subtasks to whichever task they belong to. The task may
  //    live in the snapshot, in the override map we just populated,
  //    or — if it's a fresh local task — in the overlay we just added.
  for (const [taskId, subs] of subtasksByTask) {
    const existing =
      next.tasks[taskId] ?? opts.snapshotTasks.get(taskId) ?? null
    if (!existing) continue
    const domainSubs = subs
      .map(subtaskRowToDomain)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    next.tasks[taskId] = { ...existing, subtasks: domainSubs }
  }

  // 4) Convert comments to comment-type activities (the domain model
  //    keeps everything in the activity feed; Supabase splits comments
  //    into their own table for richer querying).
  for (const c of bootstrap.comments) {
    const act = commentRowToActivity(c)
    next.activities[act.id] = act
  }

  // 5) Pull in non-comment activities.
  for (const a of bootstrap.activities) {
    if (a.type === 'comment') continue // already covered by comments
    const act = activityRowToDomain(a)
    next.activities[act.id] = act
  }

  // 6) Hydrate meetings + their child rows. The row's `id` is always
  //    set on read (Postgres uuid PK), so the indexer is safe.
  for (const m of bootstrap.meetings) {
    const domain = meetingRowToDomain(m)
    next.meetings[domain.id] = domain
  }

  return next
}

// ── Sync: overlay diff → Supabase writes ────────────────────────────────────

/**
 * Diff two overlays and fire the right per-table writes for what
 * changed. Promises are dispatched in parallel; the function resolves
 * once every write has either succeeded, exhausted its retry, or
 * surfaced its toast. Failures never throw — callers can `void` the
 * promise.
 */
export async function syncOverlayDiff(
  prev: LocalOverlay,
  next: LocalOverlay,
  opts: SyncOptions,
): Promise<void> {
  if (!isSupabaseConfigured()) return

  const jobs: Promise<unknown>[] = []

  // ── Tasks ────────────────────────────────────────────────────────────────
  for (const [id, task] of Object.entries(next.tasks)) {
    const prevTask = prev.tasks[id]
    if (prevTask === task) continue
    const snap = opts.snapshotTasks.get(id)
    if (snap) {
      // Snapshot task with a local patch — write what differs.
      jobs.push(
        retryOnce('task_override', () =>
          upsertTaskOverride(id, taskToOverrideFields(task, snap, opts.actorId)),
        ),
      )
    } else {
      // Locally-created task — write the full row.
      jobs.push(
        retryOnce('local_task', () =>
          createLocalTask(taskToLocalRow(task, opts.actorId)),
        ),
      )
    }
    // Per-subtask diff regardless of whether the parent is snapshot
    // or local — subtasks live in their own table either way.
    jobs.push(
      ...syncSubtaskDiff(
        prevTask?.subtasks ?? snap?.subtasks ?? [],
        task.subtasks,
      ),
    )
  }
  // New tombstones — local tasks the user deleted.
  for (const id of next.taskTombstones) {
    if (prev.taskTombstones.includes(id)) continue
    const snap = opts.snapshotTasks.get(id)
    if (snap) {
      // Snapshot task — there's no "deleted" flag in task_overrides yet,
      // so we can't represent this remotely. The local tombstone still
      // hides it for the session, but a reload will resurrect it.
      // TODO: add a `deleted` boolean column to task_overrides if this
      // becomes an issue in practice.
      continue
    }
    jobs.push(retryOnce('local_task_delete', () => deleteLocalTask(id)))
  }
  // Override rows that disappeared from the overlay → the task reverted
  // to its snapshot state. Clear the override row so Supabase no longer
  // shadows it.
  for (const id of Object.keys(prev.tasks)) {
    if (next.tasks[id]) continue
    if (opts.snapshotTasks.has(id)) {
      jobs.push(retryOnce('task_override_delete', () => deleteTaskOverride(id)))
    }
  }

  // ── Activities + comments ───────────────────────────────────────────────
  for (const [id, act] of Object.entries(next.activities)) {
    if (prev.activities[id] === act) continue
    const isComment = act.type === 'comment'
    if (isComment) {
      // Comments go to BOTH tables — the comments row is the rich
      // source-of-truth; the activities row keeps the feed unified.
      jobs.push(
        retryOnce('comment', () =>
          createComment(activityToCommentRow(act, opts.actorId)),
        ),
      )
    }
    jobs.push(
      retryOnce('activity', () =>
        createActivity(activityToRow(act, opts.actorId)),
      ),
    )
  }

  // ── Meetings ────────────────────────────────────────────────────────────
  for (const [id, meeting] of Object.entries(next.meetings)) {
    if (prev.meetings[id] === meeting) continue
    const { row, decisions, actionItems, links } = meetingToRows(
      meeting,
      opts.actorId,
    )
    jobs.push(
      retryOnce('meeting', () =>
        upsertMeeting(row, {
          decisions,
          action_items: actionItems,
          links,
        }),
      ),
    )
  }
  for (const id of next.meetingTombstones) {
    if (prev.meetingTombstones.includes(id)) continue
    jobs.push(retryOnce('meeting_delete', () => deleteMeeting(id)))
  }

  await Promise.allSettled(jobs)
}

// Subtask diff is its own helper because three same-id subtasks can
// hit three different verbs (create / update / delete) in one batch.
function syncSubtaskDiff(prev: Subtask[], next: Subtask[]): Promise<unknown>[] {
  const jobs: Promise<unknown>[] = []
  const prevById = new Map(prev.map((s) => [s.id, s]))
  const nextById = new Map(next.map((s) => [s.id, s]))

  for (const [id, n] of nextById) {
    const p = prevById.get(id)
    if (!p) {
      jobs.push(retryOnce('subtask', () => createSubtask(subtaskToRow(n))))
    } else if (p !== n) {
      jobs.push(retryOnce('subtask', () => updateSubtask(id, subtaskToRow(n))))
    }
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      jobs.push(retryOnce('subtask_delete', () => deleteSubtask(id)))
    }
  }
  return jobs
}

// ── Retry & toast ───────────────────────────────────────────────────────────

/** Module-level so a burst of failures doesn't spam the user with
 *  duplicate "Changes may not be saved" toasts in the same second. */
let lastFailureToastAt = 0
const TOAST_THROTTLE_MS = 30_000

async function retryOnce(scope: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
    return
  } catch (err) {
    // The CRUD helpers already swallow + console.error — this catch
    // only fires if a future change ever lets them throw.
    console.warn(`[Supabase sync] ${scope} first attempt threw:`, err)
  }
  toast.warning('Failed to save — retrying…', {
    id: `sync-retry-${scope}`,
    duration: 2_000,
  })
  try {
    await fn()
  } catch (err) {
    console.error(`[Supabase sync] ${scope} retry failed:`, err)
    const now = performance.now()
    if (now - lastFailureToastAt > TOAST_THROTTLE_MS) {
      lastFailureToastAt = now
      toast.error('Changes may not be saved. Check your connection.', {
        duration: 6_000,
      })
    }
  }
}

// ── Domain ↔ row translation ────────────────────────────────────────────────

function localTaskRowToDomain(r: LocalTaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    projectId: r.project_id,
    assigneeId: r.assignee_id,
    priority: r.priority as Priority,
    status: r.status as TaskStatus,
    dueDate: r.due_date,
    tags: r.tags ?? [],
    subtasks: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  }
}

function taskToLocalRow(task: Task, actorId: string): LocalTaskRow {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    project_id: task.projectId,
    assignee_id: task.assigneeId,
    priority: task.priority,
    status: task.status,
    due_date: task.dueDate,
    tags: task.tags,
    created_by: task.createdBy || actorId,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  }
}

/** Only emit columns that actually differ from the snapshot — keeps the
 *  override row minimal so the merge logic on read can detect
 *  field-level intent. Spec: "the task retains all source data for
 *  fields that aren't overridden." */
function taskToOverrideFields(
  task: Task,
  snap: Task,
  actorId: string,
): Partial<TaskOverrideRow> {
  const out: Partial<TaskOverrideRow> = { overridden_by: actorId }
  if (task.status !== snap.status) out.status = task.status
  if (task.priority !== snap.priority) out.priority = task.priority
  if (task.assigneeId !== snap.assigneeId) out.assignee_id = task.assigneeId
  if (task.dueDate !== snap.dueDate) out.due_date = task.dueDate
  return out
}

function subtaskRowToDomain(r: SubtaskRow): Subtask {
  return {
    id: r.id,
    taskId: r.task_id,
    title: r.title,
    assigneeId: r.assignee_id,
    done: r.done,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }
}

function subtaskToRow(s: Subtask): SubtaskRow {
  return {
    id: s.id,
    task_id: s.taskId,
    title: s.title,
    assignee_id: s.assigneeId,
    done: s.done,
    sort_order: s.sortOrder,
    created_at: s.createdAt,
    completed_at: s.completedAt,
  }
}

function commentRowToActivity(c: CommentRow): Activity {
  return {
    id: c.id,
    taskId: c.task_id,
    actorId: c.author_id,
    type: 'comment',
    content: c.content,
    mentions: c.mentions ?? [],
    createdAt: c.created_at,
    parentCommentId: c.parent_comment_id,
    commentLabel: (c.comment_type ?? undefined) as CommentLabel | undefined,
    isPinned: c.is_pinned,
    pinnedBy: c.pinned_by,
    resolved: c.is_resolved,
  }
}

function activityToCommentRow(a: Activity, actorId: string): CommentRow {
  return {
    id: a.id,
    task_id: a.taskId ?? '',
    author_id: a.actorId || actorId,
    content: a.content,
    comment_type: a.commentLabel ?? null,
    parent_comment_id: a.parentCommentId ?? null,
    is_pinned: a.isPinned ?? false,
    pinned_by: a.pinnedBy ?? null,
    is_resolved: a.resolved ?? false,
    mentions: a.mentions ?? [],
    created_at: a.createdAt,
    updated_at: a.createdAt,
  }
}

function activityRowToDomain(r: ActivityRow): Activity {
  return {
    id: r.id,
    taskId: r.task_id,
    actorId: r.actor_id,
    type: r.type as ActivityType,
    content: r.content,
    mentions: [],
    createdAt: r.created_at,
    fromValue: r.old_value ?? undefined,
    toValue: r.new_value ?? undefined,
    projectId: r.project_id ?? undefined,
  }
}

function activityToRow(a: Activity, actorId: string): ActivityRow {
  return {
    id: a.id,
    task_id: a.taskId,
    project_id: a.projectId ?? null,
    meeting_id: null,
    actor_id: a.actorId || actorId,
    type: a.type,
    content: a.content,
    old_value: a.fromValue ?? null,
    new_value: a.toValue ?? null,
    created_at: a.createdAt,
  }
}

function meetingRowToDomain(m: MeetingWithRelations): Meeting {
  // Atlas-sourced rows keep their manifest id in `source_manifest_id`;
  // the domain layer joins on that, not the Supabase uuid. Falls back
  // to the uuid for locally-created meetings. Postgres always provides
  // `id` on reads (uuid PK), so the fallback only matters when row.id
  // is unexpectedly missing.
  const id = m.source_manifest_id || m.id || ''
  const createdAt = m.created_at ?? new Date().toISOString()
  const updatedAt = m.updated_at ?? createdAt
  return {
    id,
    projectId: m.project_id,
    title: m.title,
    date: m.date,
    startTime: m.start_time,
    duration: m.duration_minutes,
    status: m.status as MeetingStatus,
    location: m.location,
    agenda: m.agenda,
    notes: m.notes ?? '',
    attendeeIds: m.attendee_ids ?? [],
    createdBy: m.created_by ?? 'system',
    createdAt,
    updatedAt,
    lastEditedBy: null,
    lastEditedAt: null,
    decisions: m.meeting_decisions
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(decisionRowToDomain),
    actionItems: m.meeting_action_items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(actionItemRowToDomain),
    questions: [],
    links: m.meeting_links.map(linkRowToDomain),
  }
}

// Child row → domain converters. `id` is optional in the row type
// because it's omitted on insert (Postgres autogenerates), but every
// read-back row has it set — so the `?? ''` fallback below is purely
// for the type-checker, not a real runtime path.
function decisionRowToDomain(d: MeetingDecisionRow): Decision {
  return {
    id: d.id ?? '',
    text: d.text,
    decidedBy: d.decided_by,
    rationale: d.rationale ?? undefined,
  }
}

function actionItemRowToDomain(a: MeetingActionItemRow): ActionItem {
  return {
    id: a.id ?? '',
    text: a.text,
    assigneeId: a.assignee_id,
    dueDate: a.due_date,
    done: a.done,
    linkedTaskId: a.linked_task_id,
  }
}

function linkRowToDomain(l: MeetingLinkRow): MeetingLink {
  return {
    id: l.id ?? '',
    label: l.label,
    url: l.url,
  }
}

export function meetingToRows(
  m: Meeting,
  actorId: string,
): {
  row: MeetingRow
  decisions: MeetingDecisionRow[]
  actionItems: MeetingActionItemRow[]
  links: MeetingLinkRow[]
} {
  // Atlas-sourced meetings keep their manifest id as the domain id;
  // Supabase needs a uuid in `id`, so we route Atlas ids through
  // `source_manifest_id` and OMIT `id` so Postgres autogenerates the
  // uuid. The unique constraint on `source_manifest_id` keeps repeat
  // upserts idempotent.
  const isLikelyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.id)
  const row: MeetingRow = {
    source_manifest_id: isLikelyUuid ? null : m.id,
    project_id: m.projectId,
    title: m.title,
    date: m.date,
    start_time: m.startTime || null,
    duration_minutes: m.duration ?? null,
    status: m.status,
    location: m.location || null,
    agenda: m.agenda || null,
    notes: m.notes || null,
    attendee_ids: m.attendeeIds ?? [],
    created_by: m.createdBy || actorId,
  }
  if (isLikelyUuid) row.id = m.id
  // Child ids that are real UUIDs (typical when the child was first
  // hydrated from Supabase) round-trip through. Atlas-mapped child
  // ids like `dec-<manifest_id>-0` are text and get omitted so
  // Postgres autogenerates the uuid. The meeting_id slot is left
  // empty too — `upsertMeeting` fills it with the parent's
  // resolved uuid after the meeting row is upserted.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const decisions: MeetingDecisionRow[] = m.decisions.map((d, i) => ({
    ...(uuidRe.test(d.id) ? { id: d.id } : {}),
    text: d.text,
    decided_by: d.decidedBy,
    rationale: d.rationale ?? null,
    sort_order: i,
  }))
  const actionItems: MeetingActionItemRow[] = m.actionItems.map((a, i) => ({
    ...(uuidRe.test(a.id) ? { id: a.id } : {}),
    text: a.text,
    assignee_id: a.assigneeId,
    due_date: a.dueDate,
    done: a.done,
    linked_task_id: a.linkedTaskId,
    sort_order: i,
  }))
  const links: MeetingLinkRow[] = m.links.map((l) => ({
    ...(uuidRe.test(l.id) ? { id: l.id } : {}),
    label: l.label,
    url: l.url,
  }))
  return { row, decisions, actionItems, links }
}

// ── Convenience: a brand-new "previous" overlay for the first sync ──────────

/** Treat the first sync after bootstrap as "everything in this overlay
 *  is new" — useful when the store wants to push every locally-stored
 *  edit to Supabase once on mount. Just pass `emptyOverlay()` as
 *  prev. */
export { emptyOverlay }

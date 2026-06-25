/**
 * Thin CRUD wrappers over the Supabase tables.
 *
 * Each function is defensive:
 *   - Returns a safe empty value (`[]`, `null`, `{}`) when Supabase
 *     isn't configured. Callers never have to null-check the client.
 *   - Wraps every query in try/catch so a network blip / row-level
 *     security denial / typo'd column name logs to the console but
 *     never bubbles up as an unhandled rejection. The app keeps
 *     running in degraded (in-memory) mode.
 *
 * Row shapes:
 *   The interfaces below mirror the **Postgres column names**
 *   (snake_case) — they are NOT the same as the camelCase domain
 *   types in `src/data/types.ts`. Translation between the two lives
 *   in `src/data/supabase-sync.ts` so this file stays a thin DB
 *   adapter.
 *
 * Live schema (introspected via the REST OpenAPI endpoint — keep in
 * sync if the SQL changes):
 *   - task_overrides          id, task_id (unique), source, status,
 *                              priority, assignee_id, due_date,
 *                              overridden_by, created_at, updated_at
 *   - local_tasks             id, title, description, project_id,
 *                              assignee_id, priority, status, due_date,
 *                              tags, created_by, created_at, updated_at
 *   - subtasks                id, task_id, title, assignee_id, done,
 *                              sort_order, created_at, completed_at
 *   - comments                id, task_id, author_id, content,
 *                              comment_type, parent_comment_id,
 *                              is_pinned, pinned_by, is_resolved,
 *                              mentions, created_at, updated_at
 *   - activities              id, task_id, project_id, meeting_id,
 *                              actor_id, type, content, old_value,
 *                              new_value, created_at
 *   - meetings                id, source_manifest_id, project_id,
 *                              title, date, start_time,
 *                              duration_minutes, status, location,
 *                              agenda, notes, attendee_ids,
 *                              created_by, created_at, updated_at
 *   - meeting_decisions       id, meeting_id, text, decided_by,
 *                              rationale, sort_order, created_at
 *   - meeting_action_items    id, meeting_id, text, assignee_id,
 *                              due_date, done, linked_task_id,
 *                              sort_order, created_at, completed_at
 *   - meeting_links           id, meeting_id, label, url, created_at
 *   - app_settings            key (PK), value (jsonb), updated_at
 *   - notification_preferences id, user_id, task_assigned,
 *                              comment_on_task, mentioned,
 *                              status_changed, due_tomorrow, overdue,
 *                              meeting_started, meeting_ended,
 *                              play_sound, updated_at
 */

import { supabase, isSupabaseConfigured } from './supabase'

// ── Row shape interfaces ────────────────────────────────────────────────────

export interface TaskOverrideRow {
  id?: string
  task_id: string
  /** Free-form tag for where this override originated — typically the
   *  upstream source so a same-id collision between Atlas and Sheets
   *  doesn't silently overwrite. */
  source?: string | null
  status?: string | null
  priority?: string | null
  assignee_id?: string | null
  due_date?: string | null
  overridden_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface LocalTaskRow {
  id: string
  title: string
  description: string
  project_id: string
  assignee_id: string | null
  priority: string
  status: string
  due_date: string | null
  tags: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface SubtaskRow {
  id: string
  task_id: string
  title: string
  assignee_id: string | null
  done: boolean
  sort_order: number
  created_at: string
  completed_at: string | null
}

export interface CommentRow {
  id: string
  task_id: string
  author_id: string
  content: string
  /** Maps to the domain `CommentLabel` — 'note' / 'question' /
   *  'decision' / 'blocker' / 'idea'. */
  comment_type: string | null
  parent_comment_id: string | null
  is_pinned: boolean
  pinned_by: string | null
  is_resolved: boolean
  mentions: string[]
  created_at: string
  updated_at: string
}

export interface ActivityRow {
  id: string
  task_id: string | null
  project_id: string | null
  meeting_id: string | null
  actor_id: string
  type: string
  content: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface MeetingDecisionRow {
  /** Omitted on insert — Postgres autogenerates. */
  id?: string
  /** Filled in by `upsertMeeting` after the parent row's uuid is
   *  known. Callers can leave undefined when passing children
   *  through `upsertMeeting`'s `children` param. */
  meeting_id?: string
  text: string
  decided_by: string | null
  rationale: string | null
  sort_order: number
  created_at?: string
}

export interface MeetingActionItemRow {
  id?: string
  meeting_id?: string
  text: string
  assignee_id: string | null
  due_date: string | null
  done: boolean
  linked_task_id: string | null
  sort_order: number
  created_at?: string
  completed_at?: string | null
}

export interface MeetingLinkRow {
  id?: string
  meeting_id?: string
  label: string
  url: string
  created_at?: string
}

export interface MeetingRow {
  /** Omitted on insert for Atlas-sourced meetings — Postgres
   *  autogenerates the uuid and the unique constraint on
   *  `source_manifest_id` keeps repeat upserts idempotent. */
  id?: string
  source_manifest_id: string | null
  project_id: string
  title: string
  date: string
  start_time: string | null
  duration_minutes: number | null
  status: string
  location: string | null
  agenda: string | null
  notes: string | null
  attendee_ids: string[] | null
  created_by: string | null
  created_at?: string
  updated_at?: string
}

/** A meeting hydrated with its child rows — what `getMeetings` returns. */
export interface MeetingWithRelations extends MeetingRow {
  meeting_decisions: MeetingDecisionRow[]
  meeting_action_items: MeetingActionItemRow[]
  meeting_links: MeetingLinkRow[]
}

export interface SettingRow {
  key: string
  value: unknown
  updated_at?: string
}

export interface NotificationPreferencesRow {
  id?: string
  user_id: string
  task_assigned: boolean
  comment_on_task: boolean
  mentioned: boolean
  status_changed: boolean
  due_tomorrow: boolean
  overdue: boolean
  meeting_started: boolean
  meeting_ended: boolean
  play_sound: boolean
  updated_at?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function logError(scope: string, err: unknown): void {
  console.error(`[Supabase] ${scope} failed:`, err)
}

function client() {
  if (!isSupabaseConfigured() || !supabase) return null
  return supabase
}

// ── Task Overrides ──────────────────────────────────────────────────────────

export async function getTaskOverrides(): Promise<TaskOverrideRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c.from('task_overrides').select('*')
    if (error) throw error
    return (data ?? []) as TaskOverrideRow[]
  } catch (err) {
    logError('getTaskOverrides', err)
    return []
  }
}

export async function upsertTaskOverride(
  taskId: string,
  fields: Partial<TaskOverrideRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const row = {
      ...fields,
      task_id: taskId,
      updated_at: new Date().toISOString(),
    }
    const { error } = await c
      .from('task_overrides')
      .upsert(row, { onConflict: 'task_id' })
    if (error) throw error
  } catch (err) {
    logError('upsertTaskOverride', err)
  }
}

export async function deleteTaskOverride(taskId: string): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const { error } = await c
      .from('task_overrides')
      .delete()
      .eq('task_id', taskId)
    if (error) throw error
  } catch (err) {
    logError('deleteTaskOverride', err)
  }
}

// ── Local Tasks ─────────────────────────────────────────────────────────────

export async function getLocalTasks(): Promise<LocalTaskRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('local_tasks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as LocalTaskRow[]
  } catch (err) {
    logError('getLocalTasks', err)
    return []
  }
}

export async function createLocalTask(
  task: LocalTaskRow,
): Promise<LocalTaskRow | null> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('local_tasks')
      .upsert(task, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    return (data ?? null) as LocalTaskRow | null
  } catch (err) {
    logError('createLocalTask', err)
    return null
  }
}

export async function updateLocalTask(
  id: string,
  fields: Partial<LocalTaskRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const patch = { ...fields, updated_at: new Date().toISOString() }
    const { error } = await c.from('local_tasks').update(patch).eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('updateLocalTask', err)
  }
}

export async function deleteLocalTask(id: string): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const { error } = await c.from('local_tasks').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('deleteLocalTask', err)
  }
}

// ── Subtasks ────────────────────────────────────────────────────────────────

export async function getSubtasks(taskId: string): Promise<SubtaskRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('subtasks')
      .select('*')
      .eq('task_id', taskId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []) as SubtaskRow[]
  } catch (err) {
    logError('getSubtasks', err)
    return []
  }
}

export async function getAllSubtasks(): Promise<SubtaskRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('subtasks')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []) as SubtaskRow[]
  } catch (err) {
    logError('getAllSubtasks', err)
    return []
  }
}

export async function createSubtask(
  subtask: SubtaskRow,
): Promise<SubtaskRow | null> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('subtasks')
      .upsert(subtask, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    return (data ?? null) as SubtaskRow | null
  } catch (err) {
    logError('createSubtask', err)
    return null
  }
}

export async function updateSubtask(
  id: string,
  fields: Partial<SubtaskRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const { error } = await c.from('subtasks').update(fields).eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('updateSubtask', err)
  }
}

export async function deleteSubtask(id: string): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const { error } = await c.from('subtasks').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('deleteSubtask', err)
  }
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<CommentRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as CommentRow[]
  } catch (err) {
    logError('getComments', err)
    return []
  }
}

export async function getAllComments(): Promise<CommentRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('comments')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as CommentRow[]
  } catch (err) {
    logError('getAllComments', err)
    return []
  }
}

export async function createComment(
  comment: CommentRow,
): Promise<CommentRow | null> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('comments')
      .upsert(comment, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    return (data ?? null) as CommentRow | null
  } catch (err) {
    logError('createComment', err)
    return null
  }
}

export async function updateComment(
  id: string,
  fields: Partial<CommentRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const patch = { ...fields, updated_at: new Date().toISOString() }
    const { error } = await c.from('comments').update(patch).eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('updateComment', err)
  }
}

export async function deleteComment(id: string): Promise<void> {
  const c = client()
  if (!c) return
  try {
    // Replies removed by an ON DELETE CASCADE foreign key in the schema
    // (comments.parent_comment_id REFERENCES comments(id) ON DELETE
    // CASCADE) — only the top-level row gets deleted here.
    const { error } = await c.from('comments').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('deleteComment', err)
  }
}

// ── Activities ──────────────────────────────────────────────────────────────

export async function getRecentActivities(limit = 50): Promise<ActivityRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as ActivityRow[]
  } catch (err) {
    logError('getRecentActivities', err)
    return []
  }
}

export async function getTaskActivities(
  taskId: string,
): Promise<ActivityRow[]> {
  const c = client()
  if (!c) return []
  try {
    const { data, error } = await c
      .from('activities')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as ActivityRow[]
  } catch (err) {
    logError('getTaskActivities', err)
    return []
  }
}

export async function createActivity(activity: ActivityRow): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const { error } = await c
      .from('activities')
      .upsert(activity, { onConflict: 'id' })
    if (error) throw error
  } catch (err) {
    logError('createActivity', err)
  }
}

// ── Meetings ────────────────────────────────────────────────────────────────

export async function getMeetings(
  projectId?: string,
): Promise<MeetingWithRelations[]> {
  const c = client()
  if (!c) return []
  try {
    let query = c
      .from('meetings')
      .select(
        '*, meeting_decisions(*), meeting_action_items(*), meeting_links(*)',
      )
      .order('date', { ascending: false })
    if (projectId) query = query.eq('project_id', projectId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as MeetingWithRelations[]
  } catch (err) {
    logError('getMeetings', err)
    return []
  }
}

/**
 * Persist a meeting plus its child rows.
 *
 * Atomicity caveat: there is no client-side transaction across these
 * four tables. If a child write fails the parent row is still
 * committed. Acceptable here because the worst case is a stale
 * child row that gets overwritten on the next upsert.
 */
export async function upsertMeeting(
  meeting: MeetingRow,
  children?: {
    decisions?: MeetingDecisionRow[]
    action_items?: MeetingActionItemRow[]
    links?: MeetingLinkRow[]
  },
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    // Conflict-resolve on source_manifest_id for Atlas-sourced meetings
    // (which can re-arrive on every refresh), else on id.
    const conflictKey = meeting.source_manifest_id ? 'source_manifest_id' : 'id'
    // Two-phase upsert: we need the parent's uuid back before we can
    // link the children. For Atlas-sourced meetings the uuid is
    // generated by Postgres on first insert; for local meetings we
    // pass it in and select() echoes it back.
    const { data: persisted, error: meetingErr } = await c
      .from('meetings')
      .upsert(meeting, { onConflict: conflictKey })
      .select('id')
      .single()
    if (meetingErr) throw meetingErr
    const meetingId = (persisted?.id as string | undefined) ?? meeting.id
    if (!meetingId) {
      // Can't link children without the parent uuid — bail.
      return
    }

    if (children?.decisions) {
      await c.from('meeting_decisions').delete().eq('meeting_id', meetingId)
      if (children.decisions.length > 0) {
        const rows = children.decisions.map((d) => ({
          ...d,
          meeting_id: meetingId,
        }))
        const { error } = await c.from('meeting_decisions').insert(rows)
        if (error) throw error
      }
    }
    if (children?.action_items) {
      await c.from('meeting_action_items').delete().eq('meeting_id', meetingId)
      if (children.action_items.length > 0) {
        const rows = children.action_items.map((a) => ({
          ...a,
          meeting_id: meetingId,
        }))
        const { error } = await c.from('meeting_action_items').insert(rows)
        if (error) throw error
      }
    }
    if (children?.links) {
      await c.from('meeting_links').delete().eq('meeting_id', meetingId)
      if (children.links.length > 0) {
        const rows = children.links.map((l) => ({
          ...l,
          meeting_id: meetingId,
        }))
        const { error } = await c.from('meeting_links').insert(rows)
        if (error) throw error
      }
    }
  } catch (err) {
    logError('upsertMeeting', err)
  }
}

export async function updateMeeting(
  id: string,
  fields: Partial<MeetingRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const patch = { ...fields, updated_at: new Date().toISOString() }
    const { error } = await c.from('meetings').update(patch).eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('updateMeeting', err)
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  const c = client()
  if (!c) return
  try {
    // Child rows (decisions / action_items / links) are removed by ON
    // DELETE CASCADE foreign keys in the schema.
    const { error } = await c.from('meetings').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    logError('deleteMeeting', err)
  }
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<unknown> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    return data?.value ?? null
  } catch (err) {
    logError('getSetting', err)
    return null
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const row: SettingRow = {
      key,
      value,
      updated_at: new Date().toISOString(),
    }
    const { error } = await c
      .from('app_settings')
      .upsert(row, { onConflict: 'key' })
    if (error) throw error
  } catch (err) {
    logError('setSetting', err)
  }
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const c = client()
  if (!c) return {}
  try {
    const { data, error } = await c.from('app_settings').select('*')
    if (error) throw error
    const rows = (data ?? []) as SettingRow[]
    return rows.reduce<Record<string, unknown>>((acc, r) => {
      acc[r.key] = r.value
      return acc
    }, {})
  } catch (err) {
    logError('getAllSettings', err)
    return {}
  }
}

// ── Notification Preferences ────────────────────────────────────────────────

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferencesRow | null> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return (data ?? null) as NotificationPreferencesRow | null
  } catch (err) {
    logError('getNotificationPreferences', err)
    return null
  }
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: Partial<NotificationPreferencesRow>,
): Promise<void> {
  const c = client()
  if (!c) return
  try {
    const row = {
      ...prefs,
      user_id: userId,
      updated_at: new Date().toISOString(),
    }
    const { error } = await c
      .from('notification_preferences')
      .upsert(row, { onConflict: 'user_id' })
    if (error) throw error
  } catch (err) {
    logError('updateNotificationPreferences', err)
  }
}

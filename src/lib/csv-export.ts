/**
 * CSV export helpers. Three top-level builders feed the Projects /
 * Team page export menus. RFC 4180 quoting (CRLF separators, fields
 * with comma/quote/newline get wrapped in double-quotes with internal
 * quotes doubled).
 *
 * All builders return a plain string; `downloadCSV(filename, csv)`
 * does the Blob + anchor dance to trigger the browser download.
 */

import {
  endOfWeek,
  isOverdue,
  now,
  startOfDay,
  startOfWeek,
} from '@/lib/date-utils'
import {
  PRIORITY_LABELS,
  type Project,
  type Tag,
  type Task,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

// ---- Primitives ------------------------------------------------------------

function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCSVRow(values: Array<string | number | null | undefined>): string {
  return values.map(escapeField).join(',')
}

/**
 * Serialise a header row + body rows into a CRLF-separated CSV string.
 * Header column names are passed in (not derived from row keys) so the
 * caller can control labelling.
 */
export function toCSV(
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  return [toCSVRow(header), ...rows.map(toCSVRow)].join('\r\n')
}

/**
 * Trigger a browser download for a CSV string. Creates a Blob, a
 * temporary object URL, and a click-triggered anchor; cleans up the
 * URL on the next event loop tick.
 */
export function downloadCSV(filename: string, csv: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // Prepend a UTF-8 BOM so Excel opens the file with the right encoding
  // when the user double-clicks the download.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer the revoke so the click-driven download fully kicks off first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** YYYY-MM-DD filename stamp based on the demo `now()` clock. */
export function filenameDateStamp(): string {
  const d = now()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ---- Builders --------------------------------------------------------------

interface AllTasksInput {
  tasks: Task[]
  projects: Project[]
  members: TeamMember[]
  tags: Tag[]
  statusLabels: Record<TaskStatus, string>
}

/**
 * Every task in the workspace, including those under archived projects.
 * One row per task; subtasks roll up to a `total / complete` count pair.
 */
export function buildAllTasksCSV(input: AllTasksInput): string {
  const { tasks, projects, members, tags, statusLabels } = input
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const memberById = new Map(members.map((m) => [m.id, m]))
  const tagById = new Map(tags.map((t) => [t.id, t]))

  const rows = tasks.map((t) => {
    const project = projectById.get(t.projectId)
    const assignee = t.assigneeId ? memberById.get(t.assigneeId) : null
    const subtaskTotal = t.subtasks.length
    const subtaskDone = t.subtasks.filter((s) => s.done).length
    const tagNames = t.tags
      .map((id) => tagById.get(id)?.name)
      .filter((n): n is string => Boolean(n))
      .join(', ')
    return [
      t.title,
      project?.name ?? '(unknown)',
      statusLabels[t.status],
      PRIORITY_LABELS[t.priority],
      assignee?.name ?? 'Unassigned',
      t.dueDate ?? '',
      subtaskTotal,
      subtaskDone,
      t.createdAt.slice(0, 10),
      tagNames,
    ]
  })

  return toCSV(
    [
      'Task Title',
      'Project',
      'Status',
      'Priority',
      'Assignee',
      'Due Date',
      'Subtasks Total',
      'Subtasks Complete',
      'Created Date',
      'Tags',
    ],
    rows,
  )
}

interface ProjectSummaryInput {
  projects: Project[]
  tasks: Task[]
}

/**
 * Per-project counts: total / open (not done) / by-status / overdue /
 * completion percentage. Archived projects included so the report
 * captures the full history.
 */
export function buildProjectSummaryCSV(input: ProjectSummaryInput): string {
  const { projects, tasks } = input

  const rows = projects.map((p) => {
    const projectTasks = tasks.filter((t) => t.projectId === p.id)
    const total = projectTasks.length
    const counts: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    }
    let overdue = 0
    for (const t of projectTasks) {
      counts[t.status] += 1
      if (t.status !== 'done' && isOverdue(t.dueDate)) overdue += 1
    }
    const open = total - counts.done
    const completion =
      total === 0 ? 0 : Math.round((counts.done / total) * 100)
    return [
      p.name,
      total,
      open,
      counts.in_progress,
      counts.in_review,
      counts.done,
      overdue,
      `${completion}%`,
    ]
  })

  return toCSV(
    [
      'Project Name',
      'Total Tasks',
      'Open',
      'In Progress',
      'In Review',
      'Done',
      'Overdue',
      'Completion Percentage',
    ],
    rows,
  )
}

interface TeamReportInput {
  members: TeamMember[]
  tasks: Task[]
}

/**
 * Per-member counts. "This week" = current calendar Mon–Sun (matches
 * the dashboard's bucket convention). "This month" = since the 1st of
 * the current calendar month (relative to the demo `now()`).
 */
export function buildTeamReportCSV(input: TeamReportInput): string {
  const { members, tasks } = input

  const today = now()
  const weekStartMs = startOfWeek(today).getTime()
  const weekEndMs = endOfWeek(today).getTime()
  const monthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthStartMs = monthStart.getTime()

  const rows = members.map((m) => {
    const mine = tasks.filter((t) => t.assigneeId === m.id)
    const active = mine.filter((t) => t.status !== 'done').length
    let weekDone = 0
    let monthDone = 0
    for (const t of mine) {
      if (t.status !== 'done') continue
      const updatedMs = new Date(t.updatedAt).getTime()
      if (updatedMs >= weekStartMs && updatedMs <= weekEndMs) weekDone += 1
      if (updatedMs >= monthStartMs) monthDone += 1
    }
    return [
      m.name,
      m.role === 'pm' ? 'Project Manager' : 'Member',
      active,
      weekDone,
      monthDone,
    ]
  })

  return toCSV(
    [
      'Team Member',
      'Role',
      'Active Tasks',
      'Completed This Week',
      'Completed This Month',
    ],
    rows,
  )
}

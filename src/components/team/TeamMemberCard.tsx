import { useMemo } from 'react'
import { CheckCircle2, ChevronRight, ListTodo } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import {
  isInThisWeek,
  isOverdue,
  now,
  parseLocalDate,
  startOfDay,
  startOfWeek,
} from '@/lib/date-utils'
import {
  STATUS_LABELS,
  type Priority,
  type Task,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

// ── Shared helpers ──────────────────────────────────────────────────────────
//
// TeamMemberCard renders the collapsed view; TeamMemberPanel
// renders the expanded slide-over. The helpers below are the common
// vocabulary — sort comparators, filter shape, status accounting,
// stat computation — and are exported so the panel imports them
// without us reaching for a third "shared" module.

/** Ranking used everywhere we sort tasks by urgency — lower = more
 *  urgent. */
export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const ACTIVE_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
]

/** Order of status groups when sort === 'priority' — In Progress / In
 *  Review surface first (most urgent), then To Do, then Done. */
export const GROUPED_STATUSES: TaskStatus[] = [
  'in_progress',
  'in_review',
  'todo',
  'done',
]

/** Which status groups start collapsed in the panel. Done buckets sit
 *  closed by default; the user can expand to audit recent completions
 *  without those rows dominating the list. */
export const DEFAULT_COLLAPSED: ReadonlySet<TaskStatus> = new Set(['done'])

export const WORKLOAD_COLOR_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}

export const WORKLOAD_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'done',
]

// ── Filters & sort state ────────────────────────────────────────────────────

export type DueFilter =
  | 'all'
  | 'overdue'
  | 'today'
  | 'week'
  | 'month'
  | 'none'

export type SortMode = 'priority' | 'dueDate' | 'newest'

export interface MemberFilters {
  /** 'all' or a real project id. */
  projectId: string
  priority: 'all' | Priority
  due: DueFilter
  sort: SortMode
}

export const DEFAULT_FILTERS: MemberFilters = {
  projectId: 'all',
  priority: 'all',
  due: 'all',
  sort: 'priority',
}

/** Persist per-member so the PM doesn't lose their narrowing when
 *  closing → re-opening the panel. sessionStorage (not localStorage)
 *  is the right scope — these are working state, not durable prefs. */
function filtersStorageKey(memberId: string): string {
  return `team_filters_${memberId}`
}

export function loadFilters(memberId: string): MemberFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.sessionStorage.getItem(filtersStorageKey(memberId))
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function saveFilters(memberId: string, filters: MemberFilters): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      filtersStorageKey(memberId),
      JSON.stringify(filters),
    )
  } catch {
    // private-mode / quota — silently degrade
  }
}

/** True iff `dueDate` is the current calendar day (local time). */
function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  return (
    startOfDay(parseLocalDate(dueDate)).getTime() ===
    startOfDay(now()).getTime()
  )
}

/** True iff `dueDate` falls in the same calendar month + year as today. */
function isInThisMonth(dueDate: string | null): boolean {
  if (!dueDate) return false
  const d = parseLocalDate(dueDate)
  const ref = now()
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  )
}

function matchesDueFilter(t: Task, due: DueFilter): boolean {
  switch (due) {
    case 'all':
      return true
    case 'overdue':
      return isOverdue(t.dueDate)
    case 'today':
      return isDueToday(t.dueDate)
    case 'week':
      return isInThisWeek(t.dueDate)
    case 'month':
      return isInThisMonth(t.dueDate)
    case 'none':
      return t.dueDate === null
  }
}

export function applyFilters(tasks: Task[], filters: MemberFilters): Task[] {
  return tasks.filter((t) => {
    if (filters.projectId !== 'all' && t.projectId !== filters.projectId)
      return false
    if (filters.priority !== 'all' && t.priority !== filters.priority)
      return false
    if (!matchesDueFilter(t, filters.due)) return false
    return true
  })
}

/** Sort comparator used inside each status group when sort === 'priority'.
 *  Critical/high first; ties broken by due-soon then by has-date. */
export function compareByPriority(a: Task, b: Task): number {
  const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (r !== 0) return r
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return 0
}

/** Soonest-due first across all statuses. Tasks without a due date
 *  sink to the bottom; ties among them fall back to priority. */
export function compareByDueDate(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

export function compareByNewest(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt)
}

/** Count the filters that aren't on their default value. Sort doesn't
 *  count because it always carries a value. */
export function activeFilterCount(f: MemberFilters): number {
  let n = 0
  if (f.projectId !== 'all') n += 1
  if (f.priority !== 'all') n += 1
  if (f.due !== 'all') n += 1
  return n
}

// ── Stats + velocity ────────────────────────────────────────────────────────

export interface MemberStats {
  active: number
  completedThisWeek: number
}

export function computeStats(tasks: Task[]): MemberStats {
  let active = 0
  let completedThisWeek = 0
  const weekStart = startOfWeek().getTime()
  const today = now().getTime()
  for (const t of tasks) {
    if (ACTIVE_STATUSES.includes(t.status)) active += 1
    if (t.status === 'done') {
      const u = new Date(t.updatedAt).getTime()
      if (u >= weekStart && u <= today) completedThisWeek += 1
    }
  }
  return { active, completedThisWeek }
}

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const empty: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  }
  for (const t of tasks) {
    empty[t.status].push(t)
  }
  return empty
}

export interface WeekBucket {
  label: string
  count: number
}

export function computeVelocity(tasks: Task[]): WeekBucket[] {
  const today = now()
  const startThisWeek = startOfWeek(today)
  const buckets: WeekBucket[] = []
  for (let i = 3; i >= 0; i--) {
    const start = new Date(startThisWeek)
    start.setDate(start.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    end.setMilliseconds(-1)
    const label = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    let count = 0
    for (const t of tasks) {
      if (t.status !== 'done') continue
      const u = new Date(t.updatedAt).getTime()
      if (u >= start.getTime() && u <= end.getTime()) count += 1
    }
    buckets.push({ label, count })
  }
  return buckets
}

// ── MiniWorkloadBar ─────────────────────────────────────────────────────────

/**
 * 4px, segmented, label-less workload bar shown inside every member
 * card. Segments are proportional to per-status task counts and use
 * the same status colour vars the board columns do, so the bar reads
 * as a tiny mirror of the board distribution.
 *
 * When the member has no tasks at all we render a single flat strip
 * in the elevated background colour so the card still has a footer
 * line — a missing bar would make the header height jump between
 * members.
 */
export function MiniWorkloadBar({
  tasks,
  className,
}: {
  tasks: Task[]
  className?: string
}) {
  const total = tasks.length
  const trackClass =
    'flex h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]'

  if (total === 0) {
    return (
      <div
        className={cn(trackClass, className)}
        role="img"
        aria-label="No tasks assigned"
      />
    )
  }

  const counts = WORKLOAD_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }))
  const label = counts
    .filter((c) => c.count > 0)
    .map((c) => `${STATUS_LABELS[c.status]}: ${c.count}`)
    .join(', ')

  return (
    <div
      className={cn(trackClass, className)}
      role="img"
      aria-label={`Workload — ${label}`}
    >
      {counts.map(({ status, count }) => {
        if (count === 0) return null
        return (
          <div
            key={status}
            className="h-full transition-[width] duration-200"
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: `var(${WORKLOAD_COLOR_VAR[status]})`,
            }}
            title={`${STATUS_LABELS[status]}: ${count}`}
          />
        )
      })}
    </div>
  )
}

// ── TeamMemberCard ──────────────────────────────────────────────────────────

interface TeamMemberCardProps {
  member: TeamMember
  tasks: Task[]
  onOpen: () => void
}

export function TeamMemberCard({ member, tasks, onOpen }: TeamMemberCardProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks])
  const isPM = member.role === 'pm'

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${member.name}'s details`}
      // The whole card is a single button — keeps the click surface
      // unambiguous and lets keyboard users tab to a member and Enter.
      // The hover ring uses a 40%-tinted accent so the card "lifts"
      // visually without recoloring its border the full accent hue.
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left transition-all duration-150',
        'hover:border-[var(--border-default)] hover:ring-1 hover:ring-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
      )}
    >
      <Avatar name={member.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {member.name}
          </h3>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              isPM
                ? 'bg-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] text-[var(--accent-primary)]'
                : 'bg-[color-mix(in_srgb,var(--text-secondary)_20%,transparent)] text-[var(--text-secondary)]',
            )}
          >
            {isPM ? 'PM' : 'Member'}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {member.email}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] tabular-nums">
          <span className="inline-flex items-center gap-1">
            <ListTodo
              className="h-3.5 w-3.5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <span className="font-semibold text-[var(--text-primary)]">
              {stats.active}
            </span>{' '}
            active
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2
              className="h-3.5 w-3.5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <span className="font-semibold text-[var(--text-primary)]">
              {stats.completedThisWeek}
            </span>{' '}
            this week
          </span>
        </div>
        <MiniWorkloadBar tasks={tasks} className="mt-3" />
      </div>
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5"
      >
        <ChevronRight className="h-4 w-4" />
      </span>
    </button>
  )
}

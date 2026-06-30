import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  ListTodo,
  Trash2,
} from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { TeamTaskListRow, TeamTaskRow } from './TeamTaskCard'
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
  type Project,
  type Task,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

// ── Shared helpers ──────────────────────────────────────────────────────────
//
// TeamMemberCard owns the collapsed-header preview AND the expanded
// inline detail. MyTasksPage also imports the filter/sort vocabulary
// from here, so the exports below are part of a small shared
// vocabulary across the app.

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

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  return (
    startOfDay(parseLocalDate(dueDate)).getTime() ===
    startOfDay(now()).getTime()
  )
}

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

export function compareByPriority(a: Task, b: Task): number {
  const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (r !== 0) return r
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return 0
}

export function compareByDueDate(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

export function compareByNewest(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt)
}

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
//
// Two visual states share the same article:
//
//   - Collapsed: header + a 3-task preview list. Click anywhere on
//     the header (or a +N more link) to expand.
//   - Expanded: header + full-width body (workload, filter toolbar,
//     grouped task list, velocity, remove). The body is scrollable
//     independently — max-h-[60vh] overflow-y-auto — so the page
//     scroll doesn't carry the user past the controls.
//
// The card lives in a 1- or 2-column grid; when expanded it takes the
// full grid row via `md:col-span-2` (driven from TeamPage).

interface TeamMemberCardProps {
  member: TeamMember
  tasks: Task[]
  /** Project lookup so each task can render its color + name chip. */
  projectsById: ReadonlyMap<string, Project>
  expanded: boolean
  onToggle: () => void
  canRemove: boolean
  onRemove: () => void
}

const PREVIEW_LIMIT = 3

/** 3-task preview shown on collapsed cards. Sorting layers (1)
 *  priority rank, (2) overdue beats not-overdue within the same
 *  priority, (3) earlier due date, (4) has-date beats no-date. */
function pickPreviewTasks(tasks: Task[]): Task[] {
  const active = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const sorted = [...active].sort((a, b) => {
    const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (r !== 0) return r
    const oa = isOverdue(a.dueDate) ? 0 : 1
    const ob = isOverdue(b.dueDate) ? 0 : 1
    if (oa !== ob) return oa - ob
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return 0
  })
  return sorted.slice(0, PREVIEW_LIMIT)
}

export function TeamMemberCard({
  member,
  tasks,
  projectsById,
  expanded,
  onToggle,
  canRemove,
  onRemove,
}: TeamMemberCardProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks])
  const velocity = useMemo(() => computeVelocity(tasks), [tasks])
  const isPM = member.role === 'pm'

  const activeTasks = useMemo(
    () => tasks.filter((t) => ACTIVE_STATUSES.includes(t.status)),
    [tasks],
  )
  const previewTasks = useMemo(() => pickPreviewTasks(tasks), [tasks])
  const moreCount = Math.max(0, activeTasks.length - previewTasks.length)

  // Per-status collapse state inside the expanded task list. Done
  // bucket starts collapsed.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(DEFAULT_COLLAPSED),
  )
  const toggleGroup = (status: TaskStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  // Filter + sort state — persisted per member via sessionStorage so
  // expand/collapse cycles don't lose the user's narrowing.
  const [filters, setFilters] = useState<MemberFilters>(() =>
    loadFilters(member.id),
  )
  useEffect(() => {
    saveFilters(member.id, filters)
  }, [member.id, filters])
  const setFilter = <K extends keyof MemberFilters>(
    key: K,
    value: MemberFilters[K],
  ) => setFilters((prev) => ({ ...prev, [key]: value }))
  const clearFilters = () =>
    setFilters((prev) => ({ ...DEFAULT_FILTERS, sort: prev.sort }))

  const memberProjects = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tasks) ids.add(t.projectId)
    const out: Project[] = []
    for (const id of ids) {
      const p = projectsById.get(id)
      if (p) out.push(p)
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [tasks, projectsById])

  const filteredTasks = useMemo(
    () => applyFilters(tasks, filters),
    [tasks, filters],
  )
  const filteredGrouped = useMemo(
    () => groupByStatus(filteredTasks),
    [filteredTasks],
  )
  const filteredFlat = useMemo(() => {
    const cmp =
      filters.sort === 'dueDate'
        ? compareByDueDate
        : filters.sort === 'newest'
          ? compareByNewest
          : compareByPriority
    return [...filteredTasks].sort(cmp)
  }, [filteredTasks, filters.sort])
  const filterCount = activeFilterCount(filters)
  const anyFilterActive = filterCount > 0

  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[border-color,box-shadow]',
        expanded
          ? 'border-[var(--border-default)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
          : 'hover:border-[var(--border-default)] hover:ring-1 hover:ring-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)]',
      )}
    >
      {/* Header — clicking anywhere toggles expansion. Same content in
          both states; the chevron rotates between Right and Down. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
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
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Collapsed preview — 3-task teaser list. Outside the header
          button so each row's open-task click doesn't bubble into a
          card toggle. */}
      {!expanded && (
        <div className="px-2 pb-3">
          {activeTasks.length === 0 ? (
            <p className="px-2 py-1 text-xs italic text-[var(--text-muted)]">
              No tasks assigned
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {previewTasks.map((t) => (
                <li key={t.id}>
                  <TeamTaskRow task={t} />
                </li>
              ))}
              {moreCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={onToggle}
                    className="rounded px-2 py-1 text-xs text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                  >
                    + {moreCount} more
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Expanded — workload, filter toolbar, task list, velocity,
          remove. Scrolls inside its own 60vh box so the user can
          flip through a long task list without losing the controls
          at the top. */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] max-h-[60vh] overflow-y-auto px-4 py-4 md:px-5 md:py-5">
          <WorkloadBar tasks={tasks} />

          <div className="mt-4 rounded-lg bg-[var(--bg-elevated)] p-3">
            <FilterBar
              filters={filters}
              onChange={setFilter}
              projects={memberProjects}
              filterCount={filterCount}
            />
          </div>

          {anyFilterActive && (
            <p className="mt-2 px-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </p>
          )}

          <div className="mt-4 space-y-4">
            {filteredTasks.length === 0 ? (
              tasks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <Inbox
                    className="h-5 w-5 text-[var(--text-muted)]"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  <p className="text-sm text-[var(--text-muted)]">
                    No active tasks
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-6 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">
                    No tasks match your filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 inline-flex items-center text-xs text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] focus-visible:rounded"
                  >
                    Clear filters
                  </button>
                </div>
              )
            ) : filters.sort === 'priority' ? (
              GROUPED_STATUSES.map((status) => {
                const list = filteredGrouped[status]
                if (list.length === 0) return null
                const isCollapsed = collapsedGroups.has(status)
                const sortedList = [...list].sort(compareByPriority)
                return (
                  <section key={status}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(status)}
                      aria-expanded={!isCollapsed}
                      className="mb-2 inline-flex items-center gap-1.5 rounded px-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                    >
                      {isCollapsed ? (
                        <ChevronRight
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      )}
                      {STATUS_LABELS[status]} ({sortedList.length})
                    </button>
                    {!isCollapsed && (
                      <ul className="flex flex-col">
                        {sortedList.map((t) => (
                          <li key={t.id}>
                            <TeamTaskListRow
                              task={t}
                              project={projectsById.get(t.projectId)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })
            ) : (
              <ul className="flex flex-col">
                {filteredFlat.map((t) => (
                  <li key={t.id}>
                    <TeamTaskListRow
                      task={t}
                      project={projectsById.get(t.projectId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Velocity (last 4 weeks)
            </h4>
            <VelocityChart weeks={velocity} />
          </section>

          {canRemove && (
            <div className="mt-6 flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-3 text-sm text-[var(--destructive)] transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove from workspace
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ── WorkloadBar (expanded view) ─────────────────────────────────────────────

function WorkloadBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length
  const counts = WORKLOAD_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }))

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Workload
      </p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        {total > 0 &&
          counts.map(({ status, count }) => {
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
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
        {counts.map(({ status, count }) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: `var(${WORKLOAD_COLOR_VAR[status]})`,
              }}
              aria-hidden="true"
            />
            <span>{STATUS_LABELS[status]}</span>
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">
              {count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── FilterBar (expanded view) ───────────────────────────────────────────────

interface FilterBarProps {
  filters: MemberFilters
  onChange: <K extends keyof MemberFilters>(
    key: K,
    value: MemberFilters[K],
  ) => void
  projects: Project[]
  filterCount: number
}

const PRIORITY_OPTIONS: Array<{ value: 'all' | Priority; label: string }> = [
  { value: 'all', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const DUE_OPTIONS: Array<{ value: MemberFilters['due']; label: string }> = [
  { value: 'all', label: 'All Dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'week', label: 'Due This Week' },
  { value: 'month', label: 'Due This Month' },
  { value: 'none', label: 'No Due Date' },
]

const SORT_OPTIONS: Array<{ value: MemberFilters['sort']; label: string }> = [
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'newest', label: 'Newest' },
]

function FilterBar({
  filters,
  onChange,
  projects,
  filterCount,
}: FilterBarProps) {
  const selectClass =
    'h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Filter
      </span>

      <select
        aria-label="Filter by project"
        value={filters.projectId}
        onChange={(e) => onChange('projectId', e.target.value)}
        className={cn(selectClass, 'min-w-[140px]')}
      >
        <option value="all">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by priority"
        value={filters.priority}
        onChange={(e) =>
          onChange('priority', e.target.value as 'all' | Priority)
        }
        className={cn(selectClass, 'min-w-[130px]')}
      >
        {PRIORITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by due date"
        value={filters.due}
        onChange={(e) =>
          onChange('due', e.target.value as MemberFilters['due'])
        }
        className={cn(selectClass, 'min-w-[130px]')}
      >
        {DUE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {filterCount > 0 && (
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
          ({filterCount} filter{filterCount === 1 ? '' : 's'})
        </span>
      )}

      <div
        role="tablist"
        aria-label="Sort tasks"
        className="ml-auto flex items-center gap-2 text-xs"
      >
        <span className="text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          Sort
        </span>
        {SORT_OPTIONS.map((o, i) => {
          const active = filters.sort === o.value
          return (
            <span key={o.value} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-[var(--text-muted)]" aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange('sort', o.value)}
                className={cn(
                  'rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                  active
                    ? 'text-[var(--text-primary)] underline underline-offset-2'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                {o.label}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Velocity chart ──────────────────────────────────────────────────────────

function VelocityChart({ weeks }: { weeks: WeekBucket[] }) {
  const hasAny = weeks.some((w) => w.count > 0)
  if (!hasAny) {
    return (
      <p className="py-2 text-center text-sm italic text-[var(--text-muted)]">
        No history yet.
      </p>
    )
  }
  const max = Math.max(...weeks.map((w) => w.count), 1)
  return (
    <div className="flex items-end gap-2">
      {weeks.map((w, i) => {
        const pct = (w.count / max) * 100
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">
              {w.count}
            </span>
            <div className="flex h-16 w-full items-end rounded bg-[var(--bg-elevated)]">
              <div
                className="w-full rounded bg-[var(--accent-primary)] transition-[height] duration-200"
                style={{ height: `${Math.max(pct, w.count > 0 ? 8 : 0)}%` }}
                aria-label={`${w.count} completed week of ${w.label}`}
              />
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {w.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

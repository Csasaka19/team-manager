import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
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

/** Ranking used everywhere we sort tasks by urgency — lower = more
 *  urgent. Both the compact preview and the expanded "By priority"
 *  view read from this. */
const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

// ── Filters & sort state ────────────────────────────────────────────────────

type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'month' | 'none'
type SortMode = 'priority' | 'dueDate' | 'newest'

interface MemberFilters {
  /** 'all' or a real project id. */
  projectId: string
  priority: 'all' | Priority
  due: DueFilter
  sort: SortMode
}

const DEFAULT_FILTERS: MemberFilters = {
  projectId: 'all',
  priority: 'all',
  due: 'all',
  sort: 'priority',
}

/** Persist per-member so the PM doesn't lose their narrowing when
 *  collapsing → re-expanding a card. sessionStorage (not localStorage)
 *  is the right scope — these filters are working state, not a
 *  durable preference. */
function filtersStorageKey(memberId: string): string {
  return `team_filters_${memberId}`
}

function loadFilters(memberId: string): MemberFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.sessionStorage.getItem(filtersStorageKey(memberId))
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(memberId: string, filters: MemberFilters): void {
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

function applyFilters(tasks: Task[], filters: MemberFilters): Task[] {
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
function compareByPriority(a: Task, b: Task): number {
  const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (r !== 0) return r
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return 0
}

/** Soonest-due first across all statuses. Overdue is grouped with
 *  earliest dates (they're already past), so a string compare on
 *  YYYY-MM-DD does the right thing. Tasks without a due date sink
 *  to the bottom. */
function compareByDueDate(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  // Tie among no-date tasks: fall back to priority so it's at least
  // deterministic.
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

function compareByNewest(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt)
}

/** Count the filters that aren't on their default value. Used by the
 *  "(N filter)" indicator next to the bar — `sort` doesn't count
 *  because it always has a value. */
function activeFilterCount(f: MemberFilters): number {
  let n = 0
  if (f.projectId !== 'all') n += 1
  if (f.priority !== 'all') n += 1
  if (f.due !== 'all') n += 1
  return n
}

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

const ACTIVE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review']
/** Order of status groups in the expanded view — In Progress / Review
 *  first (most urgent for the member), then To Do, then Done. */
const GROUPED_STATUSES: TaskStatus[] = [
  'in_progress',
  'in_review',
  'todo',
  'done',
]
const DEFAULT_COLLAPSED: ReadonlySet<TaskStatus> = new Set(['done'])

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
  // 3-task urgency preview shown when the card is collapsed.
  // Ranking layers: (1) priority rank (critical/high first), (2)
  // overdue beats not-overdue within the same priority, (3) earlier
  // due date wins, (4) has-date beats no-date. Catches the case
  // where a medium-priority overdue task should surface above a
  // medium-priority task due next month.
  const previewTasks = useMemo(() => {
    const sorted = [...activeTasks].sort((a, b) => {
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
    return sorted.slice(0, 3)
  }, [activeTasks])
  const moreCount = Math.max(0, activeTasks.length - previewTasks.length)

  // Per-member collapsed status groups in the expanded view. Done is
  // collapsed by default per spec; everything else is expanded.
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(
    () => new Set(DEFAULT_COLLAPSED),
  )

  // Filter + sort state, persisted to sessionStorage. We initialise
  // from storage on every mount so re-expanding a card restores the
  // last narrowing the PM was working with.
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

  // Projects this member actually has tasks in. The filter dropdown
  // shows ONLY these — surfacing the full workspace project list
  // would offer empty selections.
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

  // Apply the three AND-combined filters once; downstream views
  // (grouped + flat) both consume the same filtered set.
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
  const toggleGroup = (status: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[border-color,box-shadow]',
        expanded
          ? 'border-[var(--border-default)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
          : 'hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
      )}
    >
      {/* Member header — toggles the expanded view. Pulled out as its
          own button so we don't end up with task <Link>s nested inside
          a <button>, which is invalid HTML and breaks keyboard nav. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <Avatar name={member.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {member.name}
            </h3>
            <span
              className={cn(
                'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.5px]',
                isPM
                  ? 'bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] text-[var(--accent-primary)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}
            >
              {isPM ? 'PM' : 'Member'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {member.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] tabular-nums">
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                {stats.active}
              </span>{' '}
              active {stats.active === 1 ? 'task' : 'tasks'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="font-semibold text-[var(--text-primary)]">
                {stats.completedThisWeek}
              </span>{' '}
              completed this week
            </span>
          </div>
        </div>
        <span
          aria-hidden="true"
          className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Collapsed preview — separate from the header button so each
          row is its own clickable Link without nesting interactive
          elements. */}
      {!expanded && (
        <div className="px-4 pb-4">
          {activeTasks.length === 0 ? (
            <p className="text-xs italic text-[var(--text-muted)]">
              No active tasks assigned
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {previewTasks.map((t, i) => (
                <li key={t.id}>
                  <TeamTaskRow
                    task={t}
                    project={projectsById.get(t.projectId)}
                    index={i}
                  />
                </li>
              ))}
              {moreCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={onToggle}
                    className="rounded text-xs text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                  >
                    + {moreCount} more
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Expanded — full task lists grouped by status, plus workload + velocity. */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-4 md:px-5 md:py-5">
          <WorkloadBar tasks={tasks} />

          <FilterBar
            filters={filters}
            onChange={setFilter}
            projects={memberProjects}
            filterCount={filterCount}
          />

          {anyFilterActive && (
            <p className="mt-2 px-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </p>
          )}

          <div className="mt-4 space-y-4">
            {filteredTasks.length === 0 ? (
              tasks.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No tasks assigned to {member.name.split(' ')[0]}.
                </p>
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
                const isCollapsed = collapsed.has(status)
                const sortedList = [...list].sort(compareByPriority)
                return (
                  <section key={status}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(status)}
                      aria-expanded={!isCollapsed}
                      // px-2 matches the row's px-2 so the chevron lines
                      // up with the checkbox column below.
                      className="mb-2 inline-flex items-center gap-1.5 rounded px-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                      )}
                      {STATUS_LABELS[status]} ({sortedList.length})
                    </button>
                    {!isCollapsed && (
                      <ul className="flex flex-col gap-1">
                        {sortedList.map((t, i) => (
                          <li key={t.id}>
                            <TeamTaskListRow
                              task={t}
                              project={projectsById.get(t.projectId)}
                              index={i}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })
            ) : (
              // Flat sort — no status grouping. The status dot on each
              // row still communicates the column, and the explicit
              // sort the user picked drives ordering.
              <ul className="flex flex-col gap-1">
                {filteredFlat.map((t, i) => (
                  <li key={t.id}>
                    <TeamTaskListRow
                      task={t}
                      project={projectsById.get(t.projectId)}
                      index={i}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Velocity (last 4 weeks)
            </h4>
            <VelocityChart weeks={velocity} />
          </div>

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

interface MemberStats {
  active: number
  completedThisWeek: number
}

function computeStats(tasks: Task[]): MemberStats {
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

function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
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

const WORKLOAD_COLOR_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}
const WORKLOAD_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

function WorkloadBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length
  if (total === 0) {
    return (
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          Workload
        </h4>
        <p className="text-sm text-[var(--text-muted)]">No tasks assigned.</p>
      </div>
    )
  }
  const counts = WORKLOAD_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }))
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Workload
      </h4>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
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
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
        {counts.map(({ status, count }) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(${WORKLOAD_COLOR_VAR[status]})` }}
              aria-hidden="true"
            />
            {STATUS_LABELS[status]} <span className="tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface WeekBucket {
  label: string
  count: number
}

function computeVelocity(tasks: Task[]): WeekBucket[] {
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

// ── FilterBar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: MemberFilters
  /** Granular setter — narrows the type on the value to avoid `any`. */
  onChange: <K extends keyof MemberFilters>(
    key: K,
    value: MemberFilters[K],
  ) => void
  /** Projects this member has tasks in — the dropdown only lists these.
   *  Empty array = "All Projects" is the sole option. */
  projects: Project[]
  /** Count of non-default filter values, surfaced as "(N filter)". */
  filterCount: number
}

const PRIORITY_OPTIONS: Array<{ value: 'all' | Priority; label: string }> = [
  { value: 'all', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const DUE_OPTIONS: Array<{ value: DueFilter; label: string }> = [
  { value: 'all', label: 'All Dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'week', label: 'Due This Week' },
  { value: 'month', label: 'Due This Month' },
  { value: 'none', label: 'No Due Date' },
]

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'newest', label: 'Newest' },
]

function FilterBar({ filters, onChange, projects, filterCount }: FilterBarProps) {
  const selectClass =
    'h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]'

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
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
        onChange={(e) => onChange('priority', e.target.value as 'all' | Priority)}
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
        onChange={(e) => onChange('due', e.target.value as DueFilter)}
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
    return <p className="text-sm text-[var(--text-muted)]">No history yet.</p>
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
            <span className="text-[10px] text-[var(--text-muted)]">{w.label}</span>
          </div>
        )
      })}
    </div>
  )
}

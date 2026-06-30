import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Trash2,
} from 'lucide-react'
import { TeamTaskListRow } from './TeamTaskCard'
import {
  applyFilters,
  compareByDueDate,
  compareByNewest,
  compareByPriority,
  computeVelocity,
  DEFAULT_COLLAPSED,
  DEFAULT_FILTERS,
  GROUPED_STATUSES,
  WORKLOAD_COLOR_VAR,
  WORKLOAD_STATUSES,
  activeFilterCount,
  groupByStatus,
  loadFilters,
  saveFilters,
  type MemberFilters,
  type WeekBucket,
} from './TeamMemberCard'
import { cn } from '@/lib/utils'
import {
  STATUS_LABELS,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

/**
 * Full-width expanded section for a team member. Renders below the
 * row containing the clicked card (TeamPage handles the grid
 * placement via `grid-flow-row-dense` + `md:col-span-2`).
 *
 * Owns the per-member filter / sort state, the workload bar, the
 * filter toolbar, the grouped or flat task list, the velocity
 * chart, and the optional remove-from-workspace action.
 */
interface TeamMemberExpandedProps {
  member: TeamMember
  tasks: Task[]
  projectsById: ReadonlyMap<string, Project>
  canRemove: boolean
  onRemove: () => void
}

export function TeamMemberExpanded({
  member,
  tasks,
  projectsById,
  canRemove,
  onRemove,
}: TeamMemberExpandedProps) {
  const velocity = useMemo(() => computeVelocity(tasks), [tasks])

  // Per-status collapse state inside the task list. Done bucket
  // starts collapsed. Resets per member since this component
  // re-mounts when a different member is expanded.
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
    // 60vh scroll cap so the user can flick through a long task list
    // without losing the filter toolbar at the top. Border-top + a
    // slightly different background separate the section from the
    // card grid above.
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
      <div className="max-h-[60vh] overflow-y-auto px-4 py-4 md:px-5 md:py-5">
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
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
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
    </div>
  )
}

// ── WorkloadBar ─────────────────────────────────────────────────────────────

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

// ── FilterBar ───────────────────────────────────────────────────────────────

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

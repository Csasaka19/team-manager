import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { StatusPill } from '@/components/shared/StatusPill'
import { cn } from '@/lib/utils'
import { now, startOfWeek } from '@/lib/date-utils'
import { STATUS_LABELS, type Task, type TaskStatus, type TeamMember } from '@/data/types'

interface TeamMemberCardProps {
  member: TeamMember
  tasks: Task[]
  expanded: boolean
  onToggle: () => void
  canRemove: boolean
  onRemove: () => void
}

const ACTIVE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review']
const GROUPED_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

export function TeamMemberCard({
  member,
  tasks,
  expanded,
  onToggle,
  canRemove,
  onRemove,
}: TeamMemberCardProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks])
  const grouped = useMemo(() => groupByStatus(tasks), [tasks])
  const velocity = useMemo(() => computeVelocity(tasks), [tasks])
  const isPM = member.role === 'pm'

  const previewTasks = tasks
    .filter((t) => ACTIVE_STATUSES.includes(t.status))
    .slice(0, 3)
  const moreCount = Math.max(
    0,
    tasks.filter((t) => ACTIVE_STATUSES.includes(t.status)).length - previewTasks.length,
  )

  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[border-color,box-shadow]',
        expanded
          ? 'border-[var(--border-default)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
          : 'hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded-lg"
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
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{member.email}</p>

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

          {previewTasks.length === 0 ? (
            <p className="mt-3 text-xs italic text-[var(--text-muted)]">
              No tasks assigned
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {previewTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <StatusPill status={t.status} />
                  <span className="truncate text-xs text-[var(--text-secondary)]">
                    {t.title}
                  </span>
                </li>
              ))}
              {moreCount > 0 && (
                <li className="text-xs text-[var(--text-muted)]">
                  + {moreCount} more
                </li>
              )}
            </ul>
          )}
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

      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-4 md:px-5 md:py-5">
          <WorkloadBar tasks={tasks} />

          <div className="mt-5 space-y-4">
            {GROUPED_STATUSES.map((status) => {
              const list = grouped[status]
              if (list.length === 0) return null
              return (
                <section key={status}>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                    {STATUS_LABELS[status]} ({list.length})
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {list.map((t) => (
                      <li key={t.id}>
                        <Link
                          to={`/tasks/${t.id}`}
                          className="block truncate rounded px-2 py-1 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                        >
                          {t.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
            {tasks.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                No tasks assigned to {member.name.split(' ')[0]}.
              </p>
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
  const counts = GROUPED_STATUSES.map((status) => ({
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
  // Build 4 buckets ending with the current week.
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

import { useMemo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { useTaskPanel } from '@/data/task-panel'
import { isOverdue, now, startOfDay, startOfWeek } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Priority, Task, TeamMember } from '@/data/types'

interface WeekTimelineProps {
  tasks: Task[]
  members: TeamMember[]
}

interface DayCell {
  date: Date
  iso: string
  label: string
  /** Tasks DUE on this calendar day. */
  tasks: Task[]
  isToday: boolean
  isPast: boolean
  /** Past day where every task due that day is `done`. */
  pastClear: boolean
  /** Past day where at least one task is still open (counts as overdue). */
  pastOverdue: boolean
}

const PRIORITY_COLOR_VAR: Record<Priority, string> = {
  critical: '--priority-critical',
  high: '--priority-high',
  medium: '--priority-medium',
  low: '--priority-low',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toYYYYMMDD(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function WeekTimeline({ tasks, members }: WeekTimelineProps) {
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  const cells = useMemo<DayCell[]>(() => {
    const today = now()
    const todayMid = startOfDay(today).getTime()
    const weekStart = startOfWeek(today)

    // Index tasks by their dueDate (the stored YYYY-MM-DD) for O(1) lookup.
    const byDate = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const list = byDate.get(t.dueDate) ?? []
      list.push(t)
      byDate.set(t.dueDate, list)
    }

    const out: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      const iso = toYYYYMMDD(date)
      const dayTasks = byDate.get(iso) ?? []
      const dayMid = startOfDay(date).getTime()
      const isToday = dayMid === todayMid
      const isPast = dayMid < todayMid
      const pastClear =
        isPast &&
        dayTasks.length > 0 &&
        dayTasks.every((t) => t.status === 'done')
      const pastOverdue =
        isPast && dayTasks.some((t) => t.status !== 'done' && isOverdue(iso))
      out.push({
        date,
        iso,
        label: DAY_LABELS[i] ?? '',
        tasks: dayTasks,
        isToday,
        isPast,
        pastClear,
        pastOverdue,
      })
    }
    return out
  }, [tasks])

  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="grid auto-cols-[minmax(160px,1fr)] grid-flow-col gap-2 lg:grid-cols-7 lg:auto-cols-auto">
        {cells.map((cell) => (
          <DayColumn
            key={cell.iso}
            cell={cell}
            memberById={memberById}
          />
        ))}
      </ul>
    </div>
  )
}

function DayColumn({
  cell,
  memberById,
}: {
  cell: DayCell
  memberById: Map<string, TeamMember>
}) {
  const dayNumber = cell.date.getDate()
  const monthShort = cell.date.toLocaleDateString(undefined, {
    month: 'short',
  })

  // Card list — skip done tasks; the header indicator carries the "all
  // cleared" signal so the column body stays focused on outstanding work.
  const visibleTasks = cell.tasks.filter((t) => t.status !== 'done')

  return (
    <li
      className={cn(
        'flex min-h-[140px] flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2',
        // Today gets a bold left edge as the spec requests.
        cell.isToday && 'border-l-[3px] border-l-[var(--accent-primary)]',
        // Past days fade slightly so the eye scans toward today and forward.
        cell.isPast && !cell.pastOverdue && 'opacity-80',
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-[11px] font-semibold uppercase tracking-[0.5px]',
              cell.isToday
                ? 'text-[var(--accent-primary)]'
                : 'text-[var(--text-secondary)]',
            )}
          >
            {cell.label}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {monthShort} {dayNumber}
          </span>
        </div>
        <DayIndicator cell={cell} />
      </header>

      {visibleTasks.length === 0 ? (
        <p className="px-1 py-3 text-center text-[11px] text-[var(--text-muted)]">
          {cell.pastClear ? 'All done' : 'Nothing due'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibleTasks.map((t) => (
            <li key={t.id}>
              <MiniTaskCard
                task={t}
                assignee={
                  t.assigneeId
                    ? memberById.get(t.assigneeId) ?? null
                    : null
                }
                isPast={cell.isPast}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function DayIndicator({ cell }: { cell: DayCell }) {
  if (cell.pastOverdue) {
    return (
      <span
        title="Past day with open work"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--priority-critical)_18%,transparent)] text-[var(--priority-critical)]"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Has overdue work</span>
      </span>
    )
  }
  if (cell.pastClear) {
    return (
      <span
        title="All cleared"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--status-done)_18%,transparent)] text-[var(--status-done)]"
      >
        <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />
        <span className="sr-only">All done</span>
      </span>
    )
  }
  return null
}

function MiniTaskCard({
  task,
  assignee,
  isPast,
}: {
  task: Task
  assignee: TeamMember | null
  isPast: boolean
}) {
  const { openTask } = useTaskPanel()
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className="flex w-full items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-left transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: `var(${PRIORITY_COLOR_VAR[task.priority]})`,
        }}
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[12px] leading-snug text-[var(--text-primary)]',
          isPast && 'text-[var(--priority-critical)]',
        )}
        title={task.title}
      >
        {task.title}
      </span>
      {assignee ? (
        <Avatar name={assignee.name} size="xs" title={assignee.name} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[9px] text-[var(--text-muted)]"
        >
          —
        </span>
      )}
    </button>
  )
}

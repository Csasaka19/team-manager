import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { useTaskPanel } from '@/data/task-panel'
import { isOverdue, now, startOfDay, startOfWeek } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Priority, Task, TeamMember } from '@/data/types'

interface WeekTimelineProps {
  tasks: Task[]
  members: TeamMember[]
}

/** Cap on task chips rendered per day before the "+N more" overflow
 *  chip takes over. Matches the Team page preview limit. */
const TASK_DISPLAY_LIMIT = 3

/** Hard cap on how many characters of the task title fit on the chip
 *  before we slice + ellipsise. `truncate` would clip by width which
 *  is fine for wide cards, but on a 160px day column with an avatar
 *  next to it 20 chars reads consistently across themes/fonts. */
const TITLE_CHAR_LIMIT = 20

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

  // Weeks the user has paged to: 0 = this week (default), -1 = last
  // week, +1 = next week. Lets the PM scan backward without leaving
  // the dashboard.
  const [weekOffset, setWeekOffset] = useState(0)
  // Which day (if any) the user has clicked "+N more" on. Only one
  // day can be expanded at a time — clicking another closes the
  // first.
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const { cells, rangeLabel } = useMemo(() => {
    const today = now()
    const todayMid = startOfDay(today).getTime()
    const baseWeekStart = startOfWeek(today)
    const weekStart = new Date(baseWeekStart)
    weekStart.setDate(baseWeekStart.getDate() + weekOffset * 7)

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

    // Range label — "Jun 22 – Jun 28" / "Jun 29 – Jul 5". Used in the
    // nav header so the user knows which week they're paging through.
    const first = out[0]?.date
    const last = out[6]?.date
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const label =
      first && last
        ? weekOffset === 0
          ? 'This week'
          : `${fmt(first)} – ${fmt(last)}`
        : ''

    return { cells: out, rangeLabel: label }
  }, [tasks, weekOffset])

  // Clear expanded-day when the visible week changes — otherwise the
  // iso of an expanded day from another week would render nothing
  // here but still keep state pinned.
  const visibleDayIsos = new Set(cells.map((c) => c.iso))
  const effectiveExpanded =
    expandedDay && visibleDayIsos.has(expandedDay) ? expandedDay : null

  return (
    <div className="space-y-3">
      {/* Week navigation header — prev / range label + today / next.
          "Today" jumps back to weekOffset 0 (current week). */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
          {rangeLabel}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="Previous week"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="Next week"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="grid auto-cols-[minmax(160px,1fr)] grid-flow-col gap-2 lg:grid-cols-7 lg:auto-cols-auto">
          {cells.map((cell) => (
            <DayColumn
              key={cell.iso}
              cell={cell}
              memberById={memberById}
              expanded={effectiveExpanded === cell.iso}
              onToggleExpand={() =>
                setExpandedDay((prev) => (prev === cell.iso ? null : cell.iso))
              }
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

function DayColumn({
  cell,
  memberById,
  expanded,
  onToggleExpand,
}: {
  cell: DayCell
  memberById: Map<string, TeamMember>
  /** True when the user has clicked "+N more" to see the whole list. */
  expanded: boolean
  onToggleExpand: () => void
}) {
  const dayNumber = cell.date.getDate()
  const monthShort = cell.date.toLocaleDateString(undefined, {
    month: 'short',
  })

  // Card list — skip done tasks; the header indicator carries the
  // "all cleared" signal so the column body stays focused on
  // outstanding work.
  const visibleTasks = cell.tasks.filter((t) => t.status !== 'done')
  const overflow = Math.max(0, visibleTasks.length - TASK_DISPLAY_LIMIT)
  const shownTasks = expanded
    ? visibleTasks
    : visibleTasks.slice(0, TASK_DISPLAY_LIMIT)

  return (
    <li
      className={cn(
        'flex min-h-[140px] flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 transition-colors',
        // Today: accent ring + light primary tint replaces the old
        // left-bar treatment, per spec.
        cell.isToday &&
          'ring-2 ring-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,var(--bg-surface))]',
        // All-done past day: green-tinted bg so the all-clear reads
        // without needing to scan the (hidden) task list.
        cell.pastClear &&
          'bg-[color-mix(in_srgb,var(--status-done)_10%,var(--bg-surface))]',
        // Past days fade slightly so the eye scans toward today and
        // forward — unless they're all-done (already tinted green).
        cell.isPast && !cell.pastOverdue && !cell.pastClear && 'opacity-80',
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-[11px] uppercase tracking-[0.5px]',
              cell.isToday
                ? 'font-bold text-[var(--accent-primary)]'
                : 'font-semibold text-[var(--text-secondary)]',
            )}
          >
            {cell.label}
          </span>
          <span
            className={cn(
              'text-[11px] tabular-nums',
              cell.isToday
                ? 'font-bold text-[var(--accent-primary)]'
                : 'text-[var(--text-muted)]',
            )}
          >
            {monthShort} {dayNumber}
          </span>
        </div>
        <DayIndicator cell={cell} />
      </header>

      {visibleTasks.length === 0 ? (
        cell.pastClear ? (
          // All-done body — single centred green check. The header
          // also carries an indicator chip, so the body just reads
          // visually as "cleared".
          <div className="flex flex-1 items-center justify-center py-3">
            <Check
              className="h-6 w-6 text-[var(--status-done)]"
              strokeWidth={2.5}
              aria-hidden="true"
            />
            <span className="sr-only">All tasks done</span>
          </div>
        ) : (
          <p className="px-1 py-3 text-center text-[11px] text-[var(--text-muted)]">
            Nothing due
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shownTasks.map((t) => (
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
          {overflow > 0 && (
            <li>
              {/* Same pattern as the Team page's "+N more" affordance:
                  clicking expands the day inline. Click again (or
                  click another day's "+N more") collapses. */}
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                className="inline-flex w-full items-center justify-center rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,var(--bg-elevated))] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                {expanded ? 'Show less' : `+${overflow} more`}
              </button>
            </li>
          )}
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
  // Character-bound truncation (not just `truncate` width-clipping)
  // so the row reads consistently across themes/fonts. Native `title`
  // still carries the full string for hover.
  const shortTitle =
    task.title.length > TITLE_CHAR_LIMIT
      ? task.title.slice(0, TITLE_CHAR_LIMIT - 1).trimEnd() + '…'
      : task.title
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      title={task.title}
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
      >
        {shortTitle}
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

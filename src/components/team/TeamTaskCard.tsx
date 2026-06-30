/**
 * Task rows rendered under a team member on the /team page.
 *
 *   - `TeamTaskListRow` (variant="expanded") — two-line card used in
 *     the expanded member section. Title wraps fully; project /
 *     priority / due-date sit on a second line. Never truncates so
 *     readers can scan the whole task without hovering.
 *
 *   - `TeamTaskRow` (variant="preview") — one-line teaser used in the
 *     collapsed-member preview. Truncates the title with an ellipsis
 *     and only shows the priority dot, since the user gets the full
 *     story by expanding.
 *
 * The checkbox in column 1 toggles the task between its current
 * status and "Done". Completion delays the store update by 1.5s so
 * the row stays in place under a strikethrough before sliding into
 * the Done group — that window is also when the toast's Undo cancels
 * the pending update without a state round-trip.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { useData } from '@/data/store'
import { useTaskPanel } from '@/data/task-panel'
import { cn } from '@/lib/utils'
import { DUE_TONE_CLASS, formatRelativeDueDate } from '@/lib/date-utils'
import type { Priority, Project, Task, TaskStatus } from '@/data/types'

type Variant = 'preview' | 'expanded'

interface RowProps {
  task: Task
  project?: Project | undefined
  /** Zero-based index — left in for callers that previously passed it
   *  for zebra striping. The new card layout doesn't zebra, so the
   *  prop is accepted-but-unused. */
  index?: number
  variant?: Variant
}

const STATUS_DOT_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}

const PRIORITY_DOT_VAR: Record<Priority, string> = {
  critical: '--priority-critical',
  high: '--priority-high',
  medium: '--priority-medium',
  low: '--priority-low',
}

/** Window after a check-click during which the row stays put under a
 *  strikethrough before the store actually flips it to "done". */
const COMPLETION_DELAY_MS = 1500
/** How long Undo stays visible. */
const UNDO_DURATION_MS = 5000

// ── Shared completion hook ──────────────────────────────────────────────────

function useTaskCheckbox(task: Task) {
  const { updateTask } = useData()
  const [completing, setCompleting] = useState(false)
  const completionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
      }
    }
  }, [])

  const isDone = task.status === 'done'
  const showAsDone = isDone || completing

  const handleCheckboxClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const prevStatus = task.status

    if (isDone) {
      void updateTask(task.id, { status: 'todo' }).catch(() => {})
      toast.success('Task reopened', {
        action: {
          label: 'Undo',
          onClick: () => {
            void updateTask(task.id, { status: prevStatus }).catch(() => {})
          },
        },
        duration: UNDO_DURATION_MS,
      })
      return
    }

    setCompleting(true)
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      void updateTask(task.id, { status: 'done' }).catch(() => {
        setCompleting(false)
      })
    }, COMPLETION_DELAY_MS)

    toast.success('Task completed', {
      action: {
        label: 'Undo',
        onClick: () => {
          if (completionTimerRef.current !== null) {
            window.clearTimeout(completionTimerRef.current)
            completionTimerRef.current = null
            setCompleting(false)
          } else {
            void updateTask(task.id, { status: prevStatus }).catch(() => {})
          }
        },
      },
      duration: UNDO_DURATION_MS,
    })
  }

  return { showAsDone, handleCheckboxClick }
}

// ── Expanded two-line task card ─────────────────────────────────────────────

/**
 * Two-line task card used in the expanded member view.
 *
 *   Line 1 — checkbox + status dot + full task title (wraps, never
 *            truncates).
 *   Line 2 — project label (clickable Link) + priority badge + due
 *            date + overdue indicator. Indented 34 px so it aligns
 *            with the title, past the checkbox column.
 */
export function TeamTaskListRow({
  task,
  project,
  variant = 'expanded',
}: RowProps) {
  const { openTask } = useTaskPanel()
  const { showAsDone, handleCheckboxClick } = useTaskCheckbox(task)

  const due = formatRelativeDueDate(task.dueDate)
  const overdue = task.status !== 'done' && (due?.overdue ?? false)

  // Compact preview rows route through the dedicated TeamTaskRow
  // variant below — keeps the two layouts cleanly separated.
  if (variant === 'preview') {
    return <PreviewRow task={task} />
  }

  const handleRowClick = () => openTask(task.id)
  const handleRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openTask(task.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      aria-label={`Open task ${task.title}`}
      className={cn(
        'group flex flex-col gap-1.5 rounded-md border-b border-[var(--border-subtle)] px-2.5 py-3 text-left transition-colors duration-100 md:px-4',
        'hover:bg-[var(--bg-elevated)] cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        overdue && 'border-l-2 border-l-[var(--priority-critical)] pl-2 md:pl-3.5',
        showAsDone && 'opacity-60',
      )}
    >
      {/* Line 1 — checkbox + status dot + full title (never truncates). */}
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={handleCheckboxClick}
          aria-label={
            showAsDone
              ? `Mark task ${task.title} as not done`
              : `Mark task ${task.title} as done`
          }
          aria-pressed={showAsDone}
          className={cn(
            'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
            showAsDone
              ? 'border-[var(--status-done)] bg-[var(--status-done)]'
              : 'border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)]',
          )}
        >
          {showAsDone && (
            <Check
              className="h-3 w-3 text-white"
              strokeWidth={3}
              aria-hidden="true"
              style={{ animation: 'checkboxPop 200ms ease-out' }}
            />
          )}
        </button>
        <span
          aria-hidden="true"
          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${STATUS_DOT_VAR[task.status]})` }}
          title={task.status.replace('_', ' ')}
        />
        <span
          className={cn(
            'flex-1 text-sm leading-snug break-words',
            showAsDone
              ? 'text-[var(--text-muted)] line-through'
              : 'text-[var(--text-primary)]',
          )}
        >
          {task.title}
        </span>
      </div>

      {/* Line 2 — metadata row, indented to align with the title past
          the checkbox + status dot column. Wraps when narrow. */}
      <div
        className="flex flex-wrap items-center gap-3 pl-[34px]"
        style={{ paddingLeft: '34px' }}
      >
        {project && (
          <Link
            to={`/projects/${project.id}`}
            onClick={(e) => e.stopPropagation()}
            title={project.name}
            className="inline-flex min-w-0 items-center gap-1.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </Link>
        )}
        <PriorityBadge priority={task.priority} />
        {due && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
              overdue
                ? 'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]'
                : DUE_TONE_CLASS[due.tone],
            )}
          >
            {overdue && (
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            {due.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Compact preview row ─────────────────────────────────────────────────────

/**
 * One-line teaser shown on each collapsed member card — title
 * (truncated) + priority dot. Three of these stack under the
 * header, with a "+N more" affordance when the member has more
 * tasks; the full details are in the expanded view.
 */
function PreviewRow({ task }: { task: Task }) {
  const { openTask } = useTaskPanel()
  const { showAsDone, handleCheckboxClick } = useTaskCheckbox(task)

  const handleRowClick = () => openTask(task.id)
  const handleRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openTask(task.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      aria-label={`Open task ${task.title}`}
      title={task.title}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100',
        'hover:bg-[var(--bg-elevated)] cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        showAsDone && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={handleCheckboxClick}
        aria-label={
          showAsDone
            ? `Mark task ${task.title} as not done`
            : `Mark task ${task.title} as done`
        }
        aria-pressed={showAsDone}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          showAsDone
            ? 'border-[var(--status-done)] bg-[var(--status-done)]'
            : 'border-[var(--border-default)] bg-transparent',
        )}
      >
        {showAsDone && (
          <Check
            className="h-2.5 w-2.5 text-white"
            strokeWidth={3}
            aria-hidden="true"
          />
        )}
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          showAsDone
            ? 'text-[var(--text-muted)] line-through'
            : 'text-[var(--text-secondary)]',
        )}
      >
        {task.title}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: `var(${PRIORITY_DOT_VAR[task.priority]})` }}
        title={`Priority: ${task.priority}`}
      />
    </div>
  )
}

/** Public wrapper — preserves the previous `TeamTaskRow` API so older
 *  call sites don't need to thread a `variant` prop. */
export function TeamTaskRow(props: Omit<RowProps, 'variant'>) {
  return <TeamTaskListRow {...props} variant="preview" />
}

/** Back-compat alias — the file previously exported a board-style
 *  card by this name. New code should call `TeamTaskListRow` directly. */
export const TeamTaskCard = TeamTaskListRow

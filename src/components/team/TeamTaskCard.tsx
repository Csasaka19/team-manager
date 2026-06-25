/**
 * Task rows rendered under a team member on the /team page.
 *
 * Layout is a fixed CSS grid so every row in a list aligns on the
 * same column boundaries regardless of content length:
 *
 *   40px      1fr               160px       80px       90px
 *   ──────────────────────────────────────────────────────────
 *   Checkbox  Title (truncate)  Project     Priority   Due
 *
 * Below `md` the project column is dropped (the row becomes
 * `40px 1fr 80px 90px`) and the due date is mirrored under the title
 * so it still surfaces on narrow widths.
 *
 *   - `TeamTaskListRow` (variant="expanded") — used inside the
 *     grouped lists in the expanded member view. All five columns.
 *   - `TeamTaskRow` (variant="preview") — used in the collapsed
 *     member preview. Drops the project column on every breakpoint
 *     so the row fits comfortably above the "+ N more" link.
 *
 * The checkbox in column 1 toggles the task between its current
 * status and "Done". Completion delays the store update by 1.5s so
 * the row stays in place under a strikethrough before sliding into
 * the Done group — that window is also when the toast's Undo cancels
 * the pending update without a state round-trip. The status remains
 * visible as a 6px colored dot next to the checkbox.
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
import type { Project, Task, TaskStatus } from '@/data/types'

type Variant = 'preview' | 'expanded'

interface RowProps {
  task: Task
  project?: Project | undefined
  /** Zero-based index within the parent list — drives zebra striping
   *  so odd rows get the tinted background. */
  index?: number
  variant?: Variant
}

/** Tiny status-dot palette — keeps the row's status legible after the
 *  pill was replaced by an interactive checkbox. */
const STATUS_DOT_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}

/** Window after a check-click during which the row stays put under a
 *  strikethrough before the store actually flips it to "done". Long
 *  enough to feel intentional, short enough that nobody waits on it. */
const COMPLETION_DELAY_MS = 1500
/** How long Undo stays visible. Matches the spec. */
const UNDO_DURATION_MS = 5000

export function TeamTaskListRow({
  task,
  project,
  index = 0,
  variant = 'expanded',
}: RowProps) {
  const { openTask } = useTaskPanel()
  const { updateTask } = useData()

  // `completing` drives the local strikethrough/checked state during
  // the COMPLETION_DELAY_MS window between click and store commit.
  const [completing, setCompleting] = useState(false)
  const completionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
      }
    }
  }, [])

  const due = formatRelativeDueDate(task.dueDate)
  const isDone = task.status === 'done'
  const overdue = !isDone && (due?.overdue ?? false)
  const isPreview = variant === 'preview'
  const zebra = index % 2 === 1
  const showAsDone = isDone || completing

  const handleCheckboxClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const prevStatus = task.status

    if (isDone) {
      // Already done — uncheck moves the task back to To Do, with
      // Undo restoring whatever it was before.
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

    // Defer the store update so the row stays visually present under
    // the strikethrough for ~1.5s. If Undo is clicked inside that
    // window we cancel the timer and the row never moves.
    setCompleting(true)
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      void updateTask(task.id, { status: 'done' }).catch(() => {
        // If the update failed, clear the local state so the row
        // doesn't get stuck "completing".
        setCompleting(false)
      })
    }, COMPLETION_DELAY_MS)

    toast.success('Task completed', {
      action: {
        label: 'Undo',
        onClick: () => {
          if (completionTimerRef.current !== null) {
            // Still within the grace window — cancel the pending update.
            window.clearTimeout(completionTimerRef.current)
            completionTimerRef.current = null
            setCompleting(false)
          } else {
            // Already committed — restore the prior status.
            void updateTask(task.id, { status: prevStatus }).catch(() => {})
          }
        },
      },
      duration: UNDO_DURATION_MS,
    })
  }

  const handleRowClick = () => {
    openTask(task.id)
  }
  const handleRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openTask(task.id)
    }
  }

  // Grid template:
  //   - expanded: 40 / 1fr / 160 / 80 / 90 on md+, drops project below md
  //   - preview:  40 / 1fr / 80 / 90 on every breakpoint (no project column)
  const gridClass = isPreview
    ? 'grid-cols-[40px_1fr_80px_90px]'
    : 'grid-cols-[40px_1fr_80px_90px] md:grid-cols-[40px_1fr_160px_80px_90px]'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      aria-label={`Open task ${task.title}`}
      title={task.title}
      className={cn(
        'group grid w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100',
        gridClass,
        isPreview ? 'min-h-[36px]' : 'min-h-[56px] md:min-h-[40px]',
        zebra && 'bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]',
        'hover:bg-[var(--bg-elevated)] cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        overdue && 'border-l-2 border-l-[var(--priority-critical)] pl-1.5',
        showAsDone && 'opacity-50',
      )}
    >
      {/* Column 1 — checkbox + status dot. The checkbox is the only
          interactive control inside the row; its onClick stops
          propagation so it doesn't also fire the row's open-task. */}
      <div className="flex items-center gap-1.5">
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
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
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
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${STATUS_DOT_VAR[task.status]})` }}
          title={task.status.replace('_', ' ')}
        />
      </div>

      {/* Column 2 — title. On narrow screens the due date is
          duplicated under the title because the date column is
          hidden below md. */}
      <div className="min-w-0">
        <span
          className={cn(
            'block truncate text-sm',
            showAsDone
              ? 'text-[var(--text-muted)] line-through'
              : 'text-[var(--text-primary)]',
          )}
        >
          {task.title}
        </span>
        {due && (
          <span
            className={cn(
              'mt-0.5 block truncate text-[11px] tabular-nums md:hidden',
              overdue
                ? 'text-[var(--priority-critical)]'
                : 'text-[var(--text-secondary)]',
            )}
          >
            {due.label}
          </span>
        )}
      </div>

      {/* Column 3 — project. Hidden in the preview variant and
          below md in the expanded variant. The project name itself
          is a Link to the project page; clicking it must NOT also
          fire the row's open-task handler. */}
      {!isPreview && (
        <div className="hidden min-w-0 items-center md:flex">
          {project ? (
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
          ) : null}
        </div>
      )}

      {/* Column 4 — priority, centered in its cell. */}
      <div className="flex justify-center">
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Column 5 — due date, right-aligned. Hidden below md (it's
          mirrored under the title there). Empty cell if no date. */}
      <div className="hidden justify-end md:flex">
        {due && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
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

/**
 * Compact row used in the collapsed-member preview. Wraps
 * `TeamTaskListRow` with the `preview` variant pre-selected so call
 * sites that previously rendered `<TeamTaskRow />` don't need to
 * change their prop shape.
 */
export function TeamTaskRow(props: Omit<RowProps, 'variant'>) {
  return <TeamTaskListRow {...props} variant="preview" />
}

/**
 * Back-compat alias — the file previously exported a board-style
 * card by this name. New code should call `TeamTaskListRow` directly.
 */
export const TeamTaskCard = TeamTaskListRow

import { useState } from 'react'
import { useTaskPanel } from '@/data/task-panel'
import { AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { cn } from '@/lib/utils'
import {
  DUE_TONE_CLASS,
  daysBetween,
  formatRelativeDueDate,
  isOverdue,
  now,
} from '@/lib/date-utils'
import { useData } from '@/data/store'
import type { Project, Task } from '@/data/types'

interface TaskRowProps {
  task: Task
  project: Project | undefined
  /** When true, render in a "completed" muted style with strikethrough. */
  completed?: boolean
  /** True when the user only sees this task because a subtask is assigned
   *  to them — renders a small "(subtask assigned to you)" caption. */
  viaSubtaskOnly?: boolean
}

export function TaskRow({
  task,
  project,
  completed = false,
  viaSubtaskOnly = false,
}: TaskRowProps) {
  const { toggleSubtask, updateTask } = useData()
  const { openTask } = useTaskPanel()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [subtaskBusy, setSubtaskBusy] = useState<string | null>(null)

  const subtaskTotal = task.subtasks.length
  const subtaskDone = task.subtasks.filter((s) => s.done).length

  const overdueDays =
    !completed && isOverdue(task.dueDate) && task.dueDate
      ? Math.max(1, daysBetween(task.dueDate, now()))
      : 0
  const overdue = overdueDays > 0
  // Non-overdue dates still get the relative label ("Tomorrow", "Wednesday"…)
  // shown next to the priority badge.
  const due = !completed && !overdue ? formatRelativeDueDate(task.dueDate) : null

  const handleCheckTask = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await updateTask(task.id, {
        status: completed ? 'todo' : 'done',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleToggleSubtask = async (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (subtaskBusy) return
    setSubtaskBusy(subtaskId)
    try {
      await toggleSubtask(task.id, subtaskId)
    } finally {
      setSubtaskBusy(null)
    }
  }

  const toggleExpand = () => {
    if (subtaskTotal === 0) return
    setExpanded((e) => !e)
  }

  return (
    <li
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors',
        !completed && 'hover:border-[var(--border-default)]',
        completed && 'opacity-70',
        // Soft red tint behind the row when overdue. 5% alpha keeps text
        // readable; the explicit Overdue chip carries the louder signal.
        overdue &&
          'bg-[color-mix(in_srgb,var(--priority-critical)_5%,var(--bg-surface))]',
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 p-3 md:gap-4 md:p-4',
          subtaskTotal > 0 && 'cursor-pointer',
        )}
        onClick={toggleExpand}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && subtaskTotal > 0) {
            e.preventDefault()
            toggleExpand()
          }
        }}
        role={subtaskTotal > 0 ? 'button' : undefined}
        tabIndex={subtaskTotal > 0 ? 0 : undefined}
        aria-expanded={subtaskTotal > 0 ? expanded : undefined}
      >
        <button
          type="button"
          onClick={handleCheckTask}
          disabled={busy || viaSubtaskOnly}
          title={
            viaSubtaskOnly
              ? 'Only the task assignee can mark the parent task done'
              : undefined
          }
          aria-label={completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          aria-pressed={completed}
          className={cn(
            'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
            completed
              ? 'border-[var(--status-done)] bg-[var(--status-done)] text-[var(--text-inverse)]'
              : 'border-[var(--border-default)] bg-transparent hover:border-[var(--status-done)] hover:bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)]',
            (busy || viaSubtaskOnly) && 'opacity-50',
          )}
        >
          {completed && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          {viaSubtaskOnly && (
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--accent-primary)]">
              Subtask assigned to you
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openTask(task.id)
              }}
              className={cn(
                'truncate text-left text-[15px] font-medium text-[var(--text-primary)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none',
                completed && 'line-through',
              )}
            >
              {task.title}
            </button>
            {project && (
              <span className="text-xs text-[var(--text-secondary)]">
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: project.color }}
                  aria-hidden="true"
                />
                {project.name}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {overdueDays > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--priority-critical)]">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Overdue — {overdueDays} {overdueDays === 1 ? 'day' : 'days'}
              </span>
            )}
            {due && (
              <span
                className={cn(
                  'text-[11px] font-medium',
                  DUE_TONE_CLASS[due.tone],
                )}
              >
                {due.label}
              </span>
            )}
            <PriorityBadge priority={task.priority} />
            {subtaskTotal > 0 && (
              <span className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                {subtaskDone}/{subtaskTotal}
                <span
                  className="h-1 w-16 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={subtaskTotal}
                  aria-valuenow={subtaskDone}
                  aria-label={`${subtaskDone} of ${subtaskTotal} subtasks complete`}
                >
                  <span
                    className="block h-full bg-[var(--accent-primary)] transition-[width] duration-200"
                    style={{ width: `${(subtaskDone / subtaskTotal) * 100}%` }}
                  />
                </span>
              </span>
            )}
          </div>
        </div>

        {subtaskTotal > 0 && (
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
        )}
      </div>

      {expanded && subtaskTotal > 0 && (
        <ul className="border-t border-[var(--border-subtle)] px-3 py-2 md:px-4">
          {[...task.subtasks]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-1.5">
                <button
                  type="button"
                  onClick={(e) => handleToggleSubtask(s.id, e)}
                  disabled={subtaskBusy === s.id}
                  aria-pressed={s.done}
                  aria-label={s.done ? `Mark subtask ${s.title} as not done` : `Mark subtask ${s.title} as done`}
                  className={cn(
                    'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                    s.done
                      ? 'border-[var(--status-done)] bg-[var(--status-done)] text-[var(--text-inverse)]'
                      : 'border-[var(--border-default)] bg-transparent hover:border-[var(--status-done)]',
                    subtaskBusy === s.id && 'opacity-50',
                  )}
                >
                  {s.done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                </button>
                <span
                  className={cn(
                    'text-sm text-[var(--text-primary)]',
                    s.done && 'text-[var(--text-secondary)] line-through',
                  )}
                >
                  {s.title}
                </span>
              </li>
            ))}
        </ul>
      )}
    </li>
  )
}

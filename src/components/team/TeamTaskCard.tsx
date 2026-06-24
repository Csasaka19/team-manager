/**
 * Task cards rendered under a team member on the /team page.
 *
 * Two variants share the same data + click target (a Link to
 * /tasks/:id), differing only in layout density:
 *   - `TeamTaskRow` — one-line layout for the collapsed-member preview.
 *     Title takes flex-1, then a priority badge, due-date pill, and
 *     status pill packed on the right.
 *   - `TeamTaskCard` — multi-line card layout matching the board
 *     kanban card (project chip, big title, priority+due row, subtask
 *     progress, status pill in the corner).
 *
 * Both expose the same hover + focus affordances as the board's
 * TaskCard so a user clicking around between Board and Team feels
 * the same interaction grammar.
 */

import { AlertTriangle } from 'lucide-react'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { StatusPill } from '@/components/shared/StatusPill'
import { useTaskPanel } from '@/data/task-panel'
import { cn } from '@/lib/utils'
import { DUE_TONE_CLASS, formatRelativeDueDate } from '@/lib/date-utils'
import type { Project, Task } from '@/data/types'

interface BaseProps {
  task: Task
  project?: Project | undefined
}

// ── Card (used inside the expanded member view) ─────────────────────────

export function TeamTaskCard({ task, project }: BaseProps) {
  const { openTask } = useTaskPanel()
  const due = formatRelativeDueDate(task.dueDate)
  const overdue = task.status !== 'done' && (due?.overdue ?? false)
  const completed = task.subtasks.filter((s) => s.done).length
  const total = task.subtasks.length

  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      aria-label={`Open task ${task.title}`}
      className={cn(
        'group relative block w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left transition-[border-color,box-shadow] duration-150',
        'hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
        'focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        // Same 2px red left border as the board card when overdue.
        overdue && 'border-l-2 border-l-[var(--priority-critical)]',
      )}
    >
      {/* Project chip + status pill */}
      <header className="mb-2 flex items-center gap-2">
        {project && (
          <>
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              {project.name}
            </span>
          </>
        )}
        <span className="ml-auto">
          <StatusPill status={task.status} />
        </span>
      </header>

      <h3
        className="line-clamp-2 text-[14px] font-medium leading-snug text-[var(--text-primary)]"
        title={task.title}
      >
        {task.title}
      </h3>

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {due && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium',
              overdue
                ? 'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]'
                : DUE_TONE_CLASS[due.tone],
            )}
          >
            {overdue && (
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            )}
            {due.label}
          </span>
        )}

        {total > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
            <span>
              {completed}/{total}
            </span>
            <span
              className="h-1 w-16 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
            >
              <span
                className="block h-full bg-[var(--accent-primary)] transition-[width] duration-200"
                style={{
                  width: total === 0 ? '0%' : `${(completed / total) * 100}%`,
                }}
              />
            </span>
          </span>
        )}
      </footer>
    </button>
  )
}

// ── Single-row (used inside the collapsed member preview) ───────────────

export function TeamTaskRow({ task, project }: BaseProps) {
  const { openTask } = useTaskPanel()
  const due = formatRelativeDueDate(task.dueDate)
  const overdue = task.status !== 'done' && (due?.overdue ?? false)

  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      aria-label={`Open task ${task.title}`}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-left transition-[border-color,box-shadow] duration-150',
        'hover:border-[var(--border-default)] hover:shadow-[0_1px_4px_rgba(0,0,0,0.15)]',
        'focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        overdue && 'border-l-2 border-l-[var(--priority-critical)] pl-2',
      )}
    >
      {project && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
          title={project.name}
        />
      )}
      <span
        className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]"
        title={task.title}
      >
        {task.title}
      </span>
      <PriorityBadge priority={task.priority} className="shrink-0" />
      {due && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
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
      <StatusPill status={task.status} className="shrink-0" />
    </button>
  )
}

/**
 * Task rows rendered under a team member on the /team page.
 *
 * Two variants share the same data + click target (opens the task
 * detail panel), differing only in which columns are visible:
 *   - `TeamTaskRow` (variant="preview") — used in the collapsed
 *     member preview. Hides the project and subtask-progress columns
 *     so the row fits a few items above the "+ N more" link without
 *     looking crowded.
 *   - `TeamTaskListRow` (variant="expanded") — used inside the
 *     grouped lists in the expanded member view. Shows every column,
 *     with the project column dropping out below `md` and the
 *     subtask-progress column dropping out below `lg`.
 *
 * Hover, focus, and the alternating-row background are handled here;
 * the parent supplies the `index` so the zebra striping is stable
 * regardless of how the parent slices the list.
 */

import { AlertTriangle } from 'lucide-react'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { StatusPill } from '@/components/shared/StatusPill'
import { useTaskPanel } from '@/data/task-panel'
import { cn } from '@/lib/utils'
import { DUE_TONE_CLASS, formatRelativeDueDate } from '@/lib/date-utils'
import type { Project, Task } from '@/data/types'

type Variant = 'preview' | 'expanded'

interface RowProps {
  task: Task
  project?: Project | undefined
  /** Zero-based index within the parent list — drives zebra striping
   *  so odd rows get the tinted background. */
  index?: number
  variant?: Variant
}

/**
 * Compact single-line row for a member's task. Same click target as
 * the board's task card (opens the slide-over panel via the
 * TaskPanelContext).
 */
export function TeamTaskListRow({
  task,
  project,
  index = 0,
  variant = 'expanded',
}: RowProps) {
  const { openTask } = useTaskPanel()
  const due = formatRelativeDueDate(task.dueDate)
  const overdue = task.status !== 'done' && (due?.overdue ?? false)
  const completed = task.subtasks.filter((s) => s.done).length
  const total = task.subtasks.length
  const isPreview = variant === 'preview'
  const zebra = index % 2 === 1

  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      aria-label={`Open task ${task.title}`}
      title={task.title}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100',
        // 40px row height on desktop, 56px on mobile per spec.
        'min-h-[40px] md:min-h-[40px]',
        isPreview ? 'min-h-[36px]' : 'min-h-[56px] md:min-h-[40px]',
        zebra && 'bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]',
        'hover:bg-[var(--bg-elevated)] cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        overdue && 'border-l-2 border-l-[var(--priority-critical)] pl-1.5',
      )}
    >
      {/* Status pill — anchors the row on the left and gives an
          at-a-glance lane the reader can scan down by colour. */}
      <StatusPill status={task.status} className="shrink-0" />

      {/* Title — takes the available width. On mobile the title and
          its meta wrap to two lines so the touch target stays tall
          enough; on md+ everything stays single-line. */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--text-primary)]">
          {task.title}
        </span>
        {/* Mobile-only second line — due date duplicated under the
            title because the date column is hidden in narrow widths. */}
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

      {/* Project — color dot + name. Hidden in preview variant entirely;
          hidden on small screens in the expanded variant. */}
      {!isPreview && project && (
        <span
          className="hidden w-[140px] shrink-0 items-center gap-1.5 text-xs text-[var(--text-secondary)] md:inline-flex"
          title={project.name}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="truncate">{project.name}</span>
        </span>
      )}

      <PriorityBadge priority={task.priority} className="shrink-0" />

      {/* Due date — hidden on mobile (it's mirrored under the title). */}
      {due && (
        <span
          className={cn(
            'hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums md:inline-flex',
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

      {/* Subtask progress — desktop-only in expanded variant. */}
      {!isPreview && total > 0 && (
        <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-secondary)] tabular-nums lg:inline-flex">
          <span>
            {completed}/{total}
          </span>
          <span
            className="h-1 w-12 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
          >
            <span
              className="block h-full bg-[var(--accent-primary)] transition-[width] duration-200"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </span>
        </span>
      )}
    </button>
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

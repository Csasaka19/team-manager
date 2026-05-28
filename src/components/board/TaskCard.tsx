import { useNavigate } from 'react-router-dom'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '@/components/shared/Avatar'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { cn } from '@/lib/utils'
import { isOverdue, now } from '@/lib/date-utils'
import type { Project, Task, TeamMember } from '@/data/types'

interface TaskCardProps {
  task: Task
  project: Project | undefined
  assignee: TeamMember | undefined
  draggable: boolean
  /** True when this card is the one currently being dragged (so the source slot can be visually muted). */
  isDragging?: boolean
  /** When true, render as an "overlay" preview (used inside DragOverlay) — no draggable handle. */
  overlay?: boolean
  /** Renders the keyboard-navigation highlight ring. */
  selected?: boolean
  /** Called on click so the page can sync mouse and keyboard selection. */
  onSelect?: (taskId: string) => void
}

export function TaskCard({
  task,
  project,
  assignee,
  draggable,
  isDragging = false,
  overlay = false,
  selected = false,
  onSelect,
}: TaskCardProps) {
  const navigate = useNavigate()
  const draggableState = useDraggable({
    id: task.id,
    disabled: !draggable || overlay,
    data: { taskId: task.id, fromStatus: task.status },
  })

  const completed = task.subtasks.filter((s) => s.done).length
  const total = task.subtasks.length
  const overdue = task.status !== 'done' && isOverdue(task.dueDate)
  const due = formatDueLabel(task.dueDate)

  const handleClick = (e: React.MouseEvent) => {
    if (overlay) return
    // Don't navigate while dragging or right after a drag pointer-up.
    if (draggableState.isDragging) {
      e.preventDefault()
      return
    }
    onSelect?.(task.id)
    navigate(`/tasks/${task.id}`)
  }

  const style: React.CSSProperties = overlay
    ? {}
    : {
        transform: CSS.Translate.toString(draggableState.transform),
        cursor: draggable ? (draggableState.isDragging ? 'grabbing' : 'grab') : 'default',
        opacity: isDragging ? 0.4 : 1,
      }

  return (
    <article
      ref={overlay ? undefined : draggableState.setNodeRef}
      style={style}
      data-task-id={overlay ? undefined : task.id}
      {...(overlay ? {} : draggableState.attributes)}
      {...(overlay ? {} : draggableState.listeners)}
      onClick={overlay ? undefined : handleClick}
      onKeyDown={
        overlay
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // Don't trigger nav from the drag activation keys; only on Enter without modifier-drag.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  navigate(`/tasks/${task.id}`)
                }
              }
            }
      }
      tabIndex={overlay ? -1 : 0}
      role={overlay ? undefined : 'button'}
      aria-label={`Open task ${task.title}`}
      aria-selected={selected || undefined}
      className={cn(
        'group select-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left transition-[border-color,box-shadow] duration-150',
        'hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
        'focus-visible:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        selected && 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-focus)]',
        overlay && 'rotate-2 opacity-90 shadow-[0_8px_24px_rgba(0,0,0,0.3)] cursor-grabbing',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {project && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden="true"
          />
        )}
        <span className="truncate text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          {project?.name ?? 'Unknown project'}
        </span>
      </div>

      <h3
        className="line-clamp-2 text-[15px] font-medium leading-snug text-[var(--text-primary)]"
        title={task.title}
      >
        {task.title}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {due && (
          <span
            className={cn(
              'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium',
              overdue
                ? 'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]'
                : 'text-[var(--text-secondary)]',
            )}
          >
            {overdue ? 'Overdue' : due}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {total > 0 ? (
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
            <span className="shrink-0">
              {completed}/{total}
            </span>
            <div
              className="h-1 w-20 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
            >
              <div
                className="h-full bg-[var(--accent-primary)] transition-[width] duration-200"
                style={{ width: total === 0 ? '0%' : `${(completed / total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <span aria-hidden="true" />
        )}

        {assignee ? (
          <Avatar name={assignee.name} size="sm" title={assignee.name} />
        ) : (
          <span className="inline-flex h-6 items-center rounded-full bg-[var(--bg-elevated)] px-2 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--text-muted)]">
            Unassigned
          </span>
        )}
      </div>
    </article>
  )
}

function formatDueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = now()
  const todayMid = new Date(today)
  todayMid.setHours(0, 0, 0, 0)
  const dueMid = new Date(due)
  dueMid.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dueMid.getTime() - todayMid.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) {
    return due.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

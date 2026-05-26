import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { cn } from '@/lib/utils'
import type { Project, Task, TaskStatus, TeamMember } from '@/data/types'
import { useData } from '@/data/store'
import { daysBetween, now } from '@/lib/date-utils'

const DONE_RECENT_DAYS = 7

interface BoardColumnProps {
  status: TaskStatus
  tasks: Task[]
  projectById: Map<string, Project>
  memberById: Map<string, TeamMember>
  /** True when the active drag started anywhere (used to draw drop-target hint). */
  draggingTaskId: string | null
  /** Function deciding whether the current user can drag a given task. */
  canDragTask: (task: Task) => boolean
}

export function BoardColumn({
  status,
  tasks,
  projectById,
  memberById,
  draggingTaskId,
  canDragTask,
}: BoardColumnProps) {
  const { statusLabels } = useData()
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { status },
  })
  const [showOlder, setShowOlder] = useState(false)

  const sorted = [...tasks].sort(sortTasks)

  // For the Done column, split into recent (≤7 days since updatedAt) and older.
  let recent: Task[] = sorted
  let older: Task[] = []
  if (status === 'done') {
    const today = now()
    recent = []
    older = []
    for (const t of sorted) {
      if (daysBetween(t.updatedAt, today) <= DONE_RECENT_DAYS) {
        recent.push(t)
      } else {
        older.push(t)
      }
    }
  }

  // Show drop hint when something is being dragged from somewhere else.
  const isDraggingFromElsewhere =
    draggingTaskId !== null && !tasks.some((t) => t.id === draggingTaskId)
  const showDropHint = isOver && isDraggingFromElsewhere

  return (
    <section
      aria-label={`${statusLabels[status]} column`}
      className="flex w-[280px] shrink-0 flex-col md:w-auto md:min-w-[280px] md:flex-1"
    >
      <header className="mb-2 flex items-center gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          {statusLabels[status]}
        </h2>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          ({tasks.length})
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[140px] flex-1 flex-col gap-2 rounded-lg p-1.5 transition-colors duration-150',
          showDropHint
            ? 'border-2 border-dashed border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,transparent)]'
            : 'border-2 border-dashed border-transparent',
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex h-full min-h-[80px] items-center justify-center px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            {showDropHint ? 'Drop here' : 'No tasks'}
          </div>
        ) : (
          <>
            {recent.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                project={projectById.get(task.projectId)}
                assignee={task.assigneeId ? memberById.get(task.assigneeId) : undefined}
                draggable={canDragTask(task)}
                isDragging={draggingTaskId === task.id}
              />
            ))}

            {status === 'done' && older.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowOlder((s) => !s)}
                  className="mt-1 flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                  aria-expanded={showOlder}
                >
                  {showOlder ? (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {showOlder ? 'Hide' : `+ ${older.length} older ${older.length === 1 ? 'task' : 'tasks'}`}
                </button>
                {showOlder &&
                  older.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      project={projectById.get(task.projectId)}
                      assignee={task.assigneeId ? memberById.get(task.assigneeId) : undefined}
                      draggable={canDragTask(task)}
                      isDragging={draggingTaskId === task.id}
                    />
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

const PRIORITY_RANK: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function sortTasks(a: Task, b: Task): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (p !== 0) return p
  // Tasks without a due date go after tasks with one.
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return a.createdAt.localeCompare(b.createdAt)
}

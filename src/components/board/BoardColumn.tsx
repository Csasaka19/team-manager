import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TaskCard, type SelectModifiers } from './TaskCard'
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
  /** Unresolved-question count per task — flows through to TaskCard's
   *  small "❓ N" badge. */
  unresolvedQuestionsByTask?: Map<string, number>
  /** Ids of tasks edited locally in Atlas mode — drives TaskCard's
   *  CloudOff badge. */
  locallyModifiedTaskIds?: ReadonlySet<string>
  /** True when the active drag started anywhere (used to draw drop-target hint). */
  draggingTaskId: string | null
  /** Function deciding whether the current user can drag a given task. */
  canDragTask: (task: Task) => boolean
  /** Task ID that's keyboard-selected (renders with a stronger ring). */
  selectedTaskId?: string | null
  /** Called when the user clicks a card — keeps keyboard selection in sync with mouse selection. */
  onSelect?: (taskId: string) => void
  /** Set of task IDs in the multi-select set. */
  bulkSelection?: ReadonlySet<string>
  /** Whether multi-select mode is active (disables drag on every card). */
  selectionActive?: boolean
  /** Modifier-click handler — fired by TaskCard when ctrl/cmd/shift is held. */
  onSelectToggle?: (taskId: string, mods: SelectModifiers) => void
}

export function BoardColumn({
  status,
  tasks,
  projectById,
  memberById,
  unresolvedQuestionsByTask,
  locallyModifiedTaskIds,
  draggingTaskId,
  canDragTask,
  selectedTaskId,
  onSelect,
  bulkSelection,
  selectionActive,
  onSelectToggle,
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
    // Column is `h-full flex-col` so its body can fill the parent board
    // row. Mobile pins width to 300px (with horizontal scroll on the parent);
    // md+ grows evenly with `flex-1` and a 280px minimum so 4 columns either
    // distribute across the viewport or overflow horizontally together.
    <section
      aria-label={`${statusLabels[status]} column`}
      className="flex h-full w-[300px] shrink-0 flex-col md:w-auto md:min-w-[280px] md:flex-1"
    >
      {/* Header doesn't scroll with the cards — it sits above the
          scrollable card list as a flex sibling. The `sticky top-0` is
          belt-and-suspenders in case a future container introduces scroll
          inside the column. */}
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-[var(--bg-base)] px-1 pb-2 pt-1">
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
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1.5 pt-1 transition-colors duration-150',
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
                selected={selectedTaskId === task.id}
                onSelect={onSelect}
                bulkSelected={bulkSelection?.has(task.id) ?? false}
                selectionActive={selectionActive}
                onSelectToggle={onSelectToggle}
                unresolvedQuestions={unresolvedQuestionsByTask?.get(task.id) ?? 0}
                isLocallyModified={locallyModifiedTaskIds?.has(task.id) ?? false}
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
                      selected={selectedTaskId === task.id}
                      onSelect={onSelect}
                      bulkSelected={bulkSelection?.has(task.id) ?? false}
                      selectionActive={selectionActive}
                      onSelectToggle={onSelectToggle}
                      unresolvedQuestions={unresolvedQuestionsByTask?.get(task.id) ?? 0}
                      isLocallyModified={locallyModifiedTaskIds?.has(task.id) ?? false}
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

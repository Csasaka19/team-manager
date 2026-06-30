import { useCallback, useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { TaskCard, type SelectModifiers } from './TaskCard'
import { cn } from '@/lib/utils'
import type { Project, Task, TaskStatus, TeamMember } from '@/data/types'
import { useData } from '@/data/store'
import { daysBetween, now } from '@/lib/date-utils'

const DONE_RECENT_DAYS = 7

/** Maps a status to the CSS variable name carrying its accent colour.
 *  Same names the workload bar + task-row status dots already use, so
 *  the column header dot reads as the canonical column colour. */
const STATUS_COLOR_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}

/** Threshold (px) for "the user is essentially at the bottom" — within
 *  this distance we hide the scroll-indicator so it doesn't blink at
 *  the very edge of the column. */
const SCROLL_BOTTOM_THRESHOLD_PX = 8

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
  /** Map of task id → display label of the Atlas-side status, when the
   *  local status differs. Drives TaskCard's "Atlas still shows: X"
   *  tooltip. */
  atlasOriginalStatusLabelsByTask?: ReadonlyMap<string, string>
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
  /** Show a "+ Add task" CTA in the empty-column placeholder. The
   *  caller (BoardView) owns the actual create-task flow; passing
   *  `undefined` hides the CTA (e.g. for non-PM viewers). */
  onAddTask?: () => void
}

export function BoardColumn({
  status,
  tasks,
  projectById,
  memberById,
  unresolvedQuestionsByTask,
  locallyModifiedTaskIds,
  atlasOriginalStatusLabelsByTask,
  draggingTaskId,
  canDragTask,
  selectedTaskId,
  onSelect,
  bulkSelection,
  selectionActive,
  onSelectToggle,
  onAddTask,
}: BoardColumnProps) {
  const { statusLabels } = useData()
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { status },
  })
  const [showOlder, setShowOlder] = useState(false)

  // Scroll-indicator state. The bottom fade + chevron only renders
  // when the column body actually overflows AND the user isn't already
  // at the bottom — otherwise it'd be misleading noise for short
  // columns and a flicker at the scroll terminus.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  const refreshScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflow = el.scrollHeight - el.clientHeight > 1
    const bottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <=
      SCROLL_BOTTOM_THRESHOLD_PX
    setHasOverflow(overflow)
    setAtBottom(!overflow || bottom)
  }, [])

  // Recompute when cards change (new tasks pushed in, filter narrowed,
  // 60s refresh, etc.) and when the column resizes. ResizeObserver
  // covers both window resize and the column flexing as siblings
  // expand/contract on drag-over.
  useEffect(() => {
    refreshScrollState()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => refreshScrollState())
    ro.observe(el)
    return () => ro.disconnect()
  }, [refreshScrollState, tasks.length, showOlder])

  // Compose dnd-kit's droppable ref with our local one. Both want the
  // same node; the callback runs both setters on attach/detach.
  const setScrollAndDroppableRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

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
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-1.5 bg-[var(--bg-base)] px-1 pb-2 pt-1">
        {/* Status dot — same colour vars as the workload bar and the
            board's row-level status indicators, so the column reads as
            the canonical anchor for that status. */}
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${STATUS_COLOR_VAR[status]})` }}
        />
        <h2 className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          {statusLabels[status]}
        </h2>
        <span className="ml-1 inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
          {tasks.length}
        </span>
      </header>

      {/* Wrapper carries the scroll-indicator fade (absolute child).
          Keeps the gradient inside the column footprint without
          affecting drop targeting or the cards' click areas. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={setScrollAndDroppableRef}
        onScroll={refreshScrollState}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1.5 pt-1 transition-colors duration-150',
          showDropHint
            ? 'border-2 border-dashed border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,transparent)]'
            : 'border-2 border-dashed border-transparent',
        )}
      >
        {tasks.length === 0 ? (
          // Empty column — dashed-border placeholder with an "+ Add
          // task" CTA when the caller wires one in. Drop-hint state
          // takes precedence so the visual matches what dnd-kit is
          // about to do.
          <div
            className={cn(
              'flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-md border border-dashed px-2 py-6 text-center text-xs text-[var(--text-muted)]',
              showDropHint
                ? 'border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)]'
                : 'border-[color-mix(in_srgb,var(--text-muted)_30%,transparent)]',
            )}
          >
            {showDropHint ? (
              <span>Drop here</span>
            ) : onAddTask ? (
              <button
                type="button"
                onClick={onAddTask}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add task
              </button>
            ) : (
              <span>No tasks</span>
            )}
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
                atlasOriginalStatusLabel={
                  atlasOriginalStatusLabelsByTask?.get(task.id) ?? null
                }
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
                      atlasOriginalStatusLabel={
                        atlasOriginalStatusLabelsByTask?.get(task.id) ?? null
                      }
                    />
                  ))}
              </>
            )}
          </>
        )}
      </div>
        {/* Bottom fade + chevron — hints at more content below.
            Pointer-events-none so it never steals clicks from the
            cards or interferes with drop targeting. */}
        {hasOverflow && !atBottom && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/80 to-transparent pb-1"
          >
            <ChevronDown
              className="h-4 w-4 animate-bounce text-[var(--text-muted)]"
              aria-hidden="true"
            />
          </div>
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

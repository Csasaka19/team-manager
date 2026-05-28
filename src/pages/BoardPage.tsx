import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { LayoutGrid, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { BoardColumn } from '@/components/board/BoardColumn'
import { BulkActionBar } from '@/components/board/BulkActionBar'
import {
  FilterBar,
  emptyFilters,
  hasActiveFilters,
  type BoardFilters,
} from '@/components/board/FilterBar'
import { TaskCard, type SelectModifiers } from '@/components/board/TaskCard'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { LayoutOutletContext } from '@/components/layout/Layout'
import type { Priority, Task, TaskStatus } from '@/data/types'

const PRIORITY_BY_KEY: Record<string, Priority> = {
  '1': 'critical',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
}

export default function BoardPage() {
  const { currentUser, isPM } = useAuth()
  const {
    tasks,
    projects,
    teamMembers,
    updateTask,
    bulkUpdateTasks,
    bulkDeleteTasks,
    columnOrder,
    statusLabels,
  } = useData()
  const [searchParams] = useSearchParams()
  const { openCreateTask } = useOutletContext<LayoutOutletContext>()

  const [filters, setFilters] = useState<BoardFilters>(emptyFilters)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Bulk multi-select. The anchor is the last card the user toggled — used
  // as the start point for Shift+Click range selection within the same column.
  const [bulkSelection, setBulkSelection] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [bulkAnchor, setBulkAnchor] = useState<{
    id: string
    column: TaskStatus
  } | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  // Pre-filter by project from ?project= so deep-links from /projects work.
  const projectParam = searchParams.get('project')
  useEffect(() => {
    if (!projectParam) return
    const exists = projects.some((p) => p.id === projectParam)
    if (!exists) return
    setFilters((f) =>
      f.projectId === projectParam ? f : { ...f, projectId: projectParam },
    )
  }, [projectParam, projects])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )
  const memberById = useMemo(
    () => new Map(teamMembers.map((m) => [m.id, m])),
    [teamMembers],
  )

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filters),
    [tasks, filters],
  )

  const tasksByStatus = useMemo(() => {
    const buckets: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    }
    for (const t of filteredTasks) buckets[t.status].push(t)
    for (const s of Object.keys(buckets) as TaskStatus[]) {
      buckets[s].sort(sortTasks)
    }
    return buckets
  }, [filteredTasks])

  // If the previously selected card has been filtered out (or doesn't exist),
  // clear the selection so arrow nav restarts from the first visible card.
  useEffect(() => {
    if (!selectedId) return
    const stillVisible = filteredTasks.some((t) => t.id === selectedId)
    if (!stillVisible) setSelectedId(null)
  }, [filteredTasks, selectedId])

  // Scroll the newly selected card into view when selection changes.
  useEffect(() => {
    if (!selectedId) return
    const el = document.querySelector<HTMLElement>(
      `[data-task-id="${selectedId}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const canDragTask = (task: Task): boolean => {
    if (!currentUser) return false
    if (isPM) return true
    return task.assigneeId === currentUser.id
  }

  const activeTask = activeDragId
    ? tasks.find((t) => t.id === activeDragId)
    : undefined

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setActiveDragId(null)
    if (!over) return

    const taskId = String(active.id)
    const overData = over.data.current as { status?: TaskStatus } | undefined
    const targetStatus = overData?.status
    if (!targetStatus) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.status === targetStatus) return
    if (!canDragTask(task)) return

    updateTask(taskId, { status: targetStatus }).catch(() => {
      toast.error('Could not move task. Please try again.')
    })
  }

  // Keyboard navigation across cards. We model the board as a 2D grid where the
  // outer axis is column (in `columnOrder`) and the inner axis is the task's
  // index in its sorted column. Up/Down move within a column; Left/Right move
  // across columns, preserving row-index where possible.
  const moveSelection = (dir: 'left' | 'right' | 'up' | 'down') => {
    const firstCard = (col: TaskStatus): string | null =>
      tasksByStatus[col][0]?.id ?? null

    if (!selectedId) {
      const startCol = columnOrder.find((c) => tasksByStatus[c].length > 0)
      if (startCol) setSelectedId(firstCard(startCol))
      return
    }

    let col: TaskStatus | undefined
    let row = -1
    for (const c of columnOrder) {
      const idx = tasksByStatus[c].findIndex((t) => t.id === selectedId)
      if (idx >= 0) {
        col = c
        row = idx
        break
      }
    }
    if (!col || row < 0) return

    if (dir === 'up' || dir === 'down') {
      const list = tasksByStatus[col]
      const next = dir === 'up' ? row - 1 : row + 1
      if (next < 0 || next >= list.length) return
      const target = list[next]
      if (target) setSelectedId(target.id)
      return
    }

    // Horizontal — scan the next/prev non-empty column.
    const colIdx = columnOrder.indexOf(col)
    const step = dir === 'left' ? -1 : 1
    for (let i = colIdx + step; i >= 0 && i < columnOrder.length; i += step) {
      const target = columnOrder[i]
      if (!target) break
      const list = tasksByStatus[target]
      if (list.length === 0) continue
      const clampedRow = Math.min(row, list.length - 1)
      const next = list[clampedRow]
      if (next) setSelectedId(next.id)
      return
    }
  }

  const openSelected = () => {
    if (!selectedId) return
    const el = document.querySelector<HTMLElement>(
      `[data-task-id="${selectedId}"]`,
    )
    el?.click()
  }

  const setPriorityForSelected = (priority: Priority) => {
    if (!selectedId || !isPM) return
    updateTask(selectedId, { priority }).catch(() => {
      toast.error('Could not change priority.')
    })
  }

  // --- Multi-select ------------------------------------------------------
  const clearBulkSelection = useCallback(() => {
    setBulkSelection((prev) => (prev.size === 0 ? prev : new Set()))
    setBulkAnchor(null)
  }, [])

  const findTaskColumn = useCallback(
    (id: string): TaskStatus | null => {
      for (const c of columnOrder) {
        if (tasksByStatus[c].some((t) => t.id === id)) return c
      }
      return null
    },
    [columnOrder, tasksByStatus],
  )

  const handleSelectToggle = useCallback(
    (id: string, mods: SelectModifiers) => {
      if (!isPM) return // Bulk actions are PM-only; matches '+ New Task' gating.
      const column = findTaskColumn(id)
      if (!column) return

      if (mods.shift && bulkAnchor && bulkAnchor.column === column) {
        // Range select within a single column.
        const list = tasksByStatus[column]
        const a = list.findIndex((t) => t.id === bulkAnchor.id)
        const b = list.findIndex((t) => t.id === id)
        if (a < 0 || b < 0) return
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const ids = list.slice(lo, hi + 1).map((t) => t.id)
        setBulkSelection((prev) => {
          const next = new Set(prev)
          ids.forEach((tid) => next.add(tid))
          return next
        })
        setBulkAnchor({ id, column })
        return
      }

      // Toggle membership (ctrl/cmd-click, or shift-click across columns).
      setBulkSelection((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setBulkAnchor({ id, column })
    },
    [bulkAnchor, findTaskColumn, isPM, tasksByStatus],
  )

  // Background click clears multi-select. The bulk bar and cards opt out via
  // dedicated data attributes so a click on them doesn't dismiss the mode.
  useEffect(() => {
    if (bulkSelection.size === 0) return
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (
        t.closest('[data-task-id]') ||
        t.closest('[data-bulk-bar="true"]') ||
        t.closest('[role="dialog"]')
      ) {
        return
      }
      clearBulkSelection()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bulkSelection.size, clearBulkSelection])

  // Drop selected IDs that disappeared from the filtered set.
  useEffect(() => {
    if (bulkSelection.size === 0) return
    const visible = new Set(filteredTasks.map((t) => t.id))
    let changed = false
    const next = new Set<string>()
    bulkSelection.forEach((id) => {
      if (visible.has(id)) next.add(id)
      else changed = true
    })
    if (changed) {
      setBulkSelection(next)
      if (bulkAnchor && !visible.has(bulkAnchor.id)) setBulkAnchor(null)
    }
  }, [filteredTasks, bulkSelection, bulkAnchor])

  const selectionActive = bulkSelection.size > 0
  const selectedIds = useMemo(() => Array.from(bulkSelection), [bulkSelection])

  const runBulk = async (
    label: string,
    op: () => Promise<void>,
  ) => {
    try {
      await op()
      const n = selectedIds.length
      toast.success(`Updated ${n} task${n === 1 ? '' : 's'}.`)
      clearBulkSelection()
    } catch {
      toast.error(`Could not ${label}.`)
    }
  }

  const handleBulkSetPriority = (priority: Priority) =>
    runBulk('change priority', () => bulkUpdateTasks(selectedIds, { priority }))
  const handleBulkAssign = (assigneeId: string | null) =>
    runBulk('reassign tasks', () =>
      bulkUpdateTasks(selectedIds, { assigneeId }),
    )
  const handleBulkSetDueDate = (dueDate: string | null) =>
    runBulk('change due date', () => bulkUpdateTasks(selectedIds, { dueDate }))
  const handleBulkMoveTo = (status: TaskStatus) =>
    runBulk('move tasks', () => bulkUpdateTasks(selectedIds, { status }))
  const handleBulkDelete = async () => {
    const n = selectedIds.length
    setBulkConfirmOpen(false)
    try {
      await bulkDeleteTasks(selectedIds)
      toast.success(`Deleted ${n} task${n === 1 ? '' : 's'}.`)
      clearBulkSelection()
    } catch {
      toast.error('Could not delete tasks.')
    }
  }

  useKeyboardShortcuts([
    {
      key: 'Escape',
      handler: () => {
        if (selectionActive) clearBulkSelection()
      },
    },
    {
      key: 'ArrowLeft',
      handler: () => moveSelection('left'),
    },
    {
      key: 'ArrowRight',
      handler: () => moveSelection('right'),
    },
    {
      key: 'ArrowUp',
      handler: () => moveSelection('up'),
    },
    {
      key: 'ArrowDown',
      handler: () => moveSelection('down'),
    },
    {
      key: 'Enter',
      handler: openSelected,
    },
    {
      key: ['1', '2', '3', '4'],
      handler: (e) => {
        const p = PRIORITY_BY_KEY[e.key]
        if (p) setPriorityForSelected(p)
      },
    },
  ])

  const hasAnyTasks = tasks.length > 0
  const filtersActive = hasActiveFilters(filters)
  const filtersMatchNothing = filtersActive && filteredTasks.length === 0
  const sortedMembersForFilter = useMemo(
    () => [...teamMembers].sort((a, b) => a.name.localeCompare(b.name)),
    [teamMembers],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Board</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Drag cards between columns to update status.
          </p>
        </div>
        {isPM && projects.some((p) => !p.archived) && (
          <button
            type="button"
            onClick={() =>
              openCreateTask(
                filters.projectId !== 'all' ? filters.projectId : undefined,
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Task
          </button>
        )}
      </header>

      <FilterBar
        projects={projects}
        members={sortedMembersForFilter}
        filters={filters}
        onChange={setFilters}
      />

      {!hasAnyTasks ? (
        <EmptyBoard />
      ) : filtersMatchNothing ? (
        <NoMatches onClear={() => setFilters(emptyFilters())} />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <div className="flex gap-3 md:gap-4">
              {columnOrder.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status]}
                  projectById={projectById}
                  memberById={memberById}
                  draggingTaskId={activeDragId}
                  canDragTask={canDragTask}
                  selectedTaskId={selectedId}
                  onSelect={setSelectedId}
                  bulkSelection={bulkSelection}
                  selectionActive={selectionActive}
                  onSelectToggle={handleSelectToggle}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                project={projectById.get(activeTask.projectId)}
                assignee={
                  activeTask.assigneeId
                    ? memberById.get(activeTask.assigneeId)
                    : undefined
                }
                draggable={false}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {bulkSelection.size >= 2 && (
        <BulkActionBar
          count={bulkSelection.size}
          members={sortedMembersForFilter}
          statusLabels={statusLabels}
          columnOrder={columnOrder}
          onSetPriority={handleBulkSetPriority}
          onAssign={handleBulkAssign}
          onSetDueDate={handleBulkSetDueDate}
          onMoveTo={handleBulkMoveTo}
          onDelete={() => setBulkConfirmOpen(true)}
          onClear={clearBulkSelection}
        />
      )}

      <ConfirmModal
        open={bulkConfirmOpen}
        title={`Delete ${bulkSelection.size} task${bulkSelection.size === 1 ? '' : 's'}?`}
        message={
          <>
            This will permanently delete the selected task
            {bulkSelection.size === 1 ? '' : 's'}, along with their activity
            and notifications. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </div>
  )
}

function EmptyBoard() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
      <LayoutGrid
        className="h-12 w-12 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="mt-4 text-base font-medium text-[var(--text-secondary)]">
        No tasks on the board
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        Create a task in a project to get started.
      </p>
      <Link
        to="/projects"
        className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        Browse projects
      </Link>
    </div>
  )
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
      <p className="text-sm text-[var(--text-secondary)]">No tasks match your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-sm font-medium text-[var(--accent-primary)] underline-offset-2 transition-colors hover:text-[var(--accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded"
      >
        Clear filters
      </button>
    </div>
  )
}

function filterTasks(tasks: Task[], f: BoardFilters): Task[] {
  const query = f.search.trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.projectId !== 'all' && t.projectId !== f.projectId) return false
    if (f.assigneeId === 'unassigned') {
      if (t.assigneeId !== null) return false
    } else if (f.assigneeId !== 'all') {
      if (t.assigneeId !== f.assigneeId) return false
    }
    if (f.priority !== 'all' && t.priority !== f.priority) return false
    if (query && !t.title.toLowerCase().includes(query)) return false
    return true
  })
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
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return a.createdAt.localeCompare(b.createdAt)
}

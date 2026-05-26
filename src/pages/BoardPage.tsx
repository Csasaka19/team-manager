import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { BoardColumn } from '@/components/board/BoardColumn'
import {
  FilterBar,
  emptyFilters,
  hasActiveFilters,
  type BoardFilters,
} from '@/components/board/FilterBar'
import { TaskCard } from '@/components/board/TaskCard'
import {
  CreateTaskModal,
  type CreateTaskValues,
} from '@/components/task-detail/CreateTaskModal'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import type { Task, TaskStatus } from '@/data/types'

export default function BoardPage() {
  const { currentUser, isPM } = useAuth()
  const { tasks, projects, teamMembers, updateTask, createTask, columnOrder } = useData()
  const [searchParams] = useSearchParams()

  const [filters, setFilters] = useState<BoardFilters>(emptyFilters)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

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
    // 6px distance avoids triggering drag on simple card clicks (which navigate).
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
    return buckets
  }, [filteredTasks])

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

    // Optimistic — updateTask resolves after 800ms but the local setState inside
    // it runs synchronously, so the card moves immediately.
    updateTask(taskId, { status: targetStatus }).catch(() => {
      toast.error('Could not move task. Please try again.')
    })
  }

  const hasAnyTasks = tasks.length > 0
  const filtersActive = hasActiveFilters(filters)
  const filtersMatchNothing = filtersActive && filteredTasks.length === 0
  const sortedMembersForFilter = useMemo(
    () => [...teamMembers].sort((a, b) => a.name.localeCompare(b.name)),
    [teamMembers],
  )

  const handleCreate = async (values: CreateTaskValues) => {
    await createTask(values)
    setCreateOpen(false)
    toast.success('Task created.')
  }

  const activeProjectId =
    filters.projectId !== 'all' ? filters.projectId : undefined

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
            onClick={() => setCreateOpen(true)}
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

      <CreateTaskModal
        open={createOpen}
        projects={projects}
        members={teamMembers}
        defaultProjectId={activeProjectId}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
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

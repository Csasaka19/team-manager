import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Inbox } from 'lucide-react'
import {
  TaskSection,
  type MyTaskEntry,
} from '@/components/my-tasks/TaskSection'
import { SkeletonCard, SkeletonLine } from '@/components/shared/Skeleton'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { Project, Task } from '@/data/types'
import {
  daysBetween,
  endOfWeek,
  isOverdue,
  now,
  startOfDay,
  startOfWeek,
} from '@/lib/date-utils'

const COMPLETED_WINDOW_DAYS = 7

const PRIORITY_RANK: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export default function MyTasksPage() {
  useDocumentTitle('My Tasks')
  const { currentUser } = useAuth()
  const { tasks, projects, isInitialLoading } = useData()
  const [showCompleted, setShowCompleted] = useState(false)

  const projectById = useMemo<Map<string, Project>>(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  // "My tasks" pulls in both (a) tasks the user is the parent assignee of
  // and (b) tasks where the user has a subtask assignment but isn't the
  // parent assignee. The second case carries viaSubtaskOnly=true so the
  // UI can render the "Subtask assigned to you" caption.
  const myTasks = useMemo<MyTaskEntry[]>(() => {
    if (!currentUser) return []
    const out: MyTaskEntry[] = []
    for (const t of tasks) {
      if (t.assigneeId === currentUser.id) {
        out.push({ task: t, viaSubtaskOnly: false })
        continue
      }
      if (t.subtasks.some((s) => s.assigneeId === currentUser.id)) {
        out.push({ task: t, viaSubtaskOnly: true })
      }
    }
    return out
  }, [tasks, currentUser])

  const { dueToday, thisWeek, upcoming, completed } = useMemo(
    () => bucketTasks(myTasks),
    [myTasks],
  )

  if (!currentUser) {
    return null
  }

  if (isInitialLoading) {
    return <MyTasksSkeleton />
  }

  // "My tasks" excludes Done from the main buckets, so the no-tasks-assigned
  // state is judged against the full assigned list.
  if (myTasks.length === 0) {
    return <EmptyMyTasks />
  }

  return (
    <div data-tour="my-tasks-list" className="space-y-6 md:space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">My Tasks</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            What&apos;s on your plate this week.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--accent-primary)]"
          />
          Show completed
        </label>
      </header>

      <TaskSection
        title="Due Today"
        tasks={dueToday}
        projectById={projectById}
        emptyMessage="Nothing due today"
        emptyIcon={
          <CheckCircle2
            className="h-5 w-5 text-[var(--status-done)]"
            aria-hidden="true"
          />
        }
      />

      <TaskSection
        title="This Week"
        tasks={thisWeek}
        projectById={projectById}
        emptyMessage="Clear week ahead."
      />

      <TaskSection
        title="Upcoming"
        tasks={upcoming}
        projectById={projectById}
      />

      {showCompleted && (
        <TaskSection
          title={`Completed (last ${COMPLETED_WINDOW_DAYS} days)`}
          tasks={completed}
          projectById={projectById}
          emptyMessage="No tasks completed in the last 7 days."
          completedStyle
        />
      )}
    </div>
  )
}

function MyTasksSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      <SkeletonLine width="w-32" height="h-7" />
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section}>
          <SkeletonLine width="w-28" height="h-5" className="mb-3" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((__, row) => (
              <SkeletonCard key={row}>
                <div className="flex items-start gap-3">
                  <SkeletonLine width="w-5" height="h-5" className="rounded" />
                  <div className="flex-1 space-y-2">
                    <SkeletonLine height="h-4" />
                    <SkeletonLine width="w-32" height="h-3" />
                  </div>
                </div>
              </SkeletonCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyMyTasks() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Inbox
        className="h-12 w-12 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="mt-4 text-base font-medium text-[var(--text-secondary)]">
        No tasks assigned to you yet.
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        Check with your PM or browse the board.
      </p>
      <Link
        to="/board"
        className="mt-5 inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        Browse the board
      </Link>
    </div>
  )
}

interface Buckets {
  dueToday: MyTaskEntry[]
  thisWeek: MyTaskEntry[]
  upcoming: MyTaskEntry[]
  completed: MyTaskEntry[]
}

function bucketTasks(entries: MyTaskEntry[]): Buckets {
  const today = now()
  const todayMid = startOfDay(today).getTime()
  const weekStart = startOfWeek(today).getTime()
  const weekEnd = endOfWeek(today).getTime()
  const completedCutoff = todayMid - COMPLETED_WINDOW_DAYS * 86_400_000

  const dueToday: MyTaskEntry[] = []
  const thisWeek: MyTaskEntry[] = []
  const upcoming: MyTaskEntry[] = []
  const completed: MyTaskEntry[] = []

  for (const entry of entries) {
    const t = entry.task
    if (t.status === 'done') {
      const finishedAt = new Date(t.updatedAt).getTime()
      if (finishedAt >= completedCutoff) completed.push(entry)
      continue
    }

    if (!t.dueDate) {
      upcoming.push(entry)
      continue
    }

    const dueMid = startOfDay(new Date(t.dueDate)).getTime()
    if (dueMid === todayMid || isOverdue(t.dueDate)) {
      dueToday.push(entry)
    } else if (dueMid >= weekStart && dueMid <= weekEnd) {
      thisWeek.push(entry)
    } else if (dueMid > weekEnd) {
      upcoming.push(entry)
    } else {
      upcoming.push(entry)
    }
  }

  // Sort: overdue first (most days overdue first), then today, then by priority.
  dueToday.sort((a, b) => sortByOverdueThenPriority(a.task, b.task, today))
  thisWeek.sort((a, b) => sortByDueThenPriority(a.task, b.task))
  upcoming.sort((a, b) => sortByDueThenPriority(a.task, b.task))
  completed.sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt))

  return { dueToday, thisWeek, upcoming, completed }
}

function sortByOverdueThenPriority(a: Task, b: Task, today: Date): number {
  const aOver = a.dueDate && isOverdue(a.dueDate) ? daysBetween(a.dueDate, today) : 0
  const bOver = b.dueDate && isOverdue(b.dueDate) ? daysBetween(b.dueDate, today) : 0
  if (aOver !== bOver) return bOver - aOver
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

function sortByDueThenPriority(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) {
    const cmp = a.dueDate.localeCompare(b.dueDate)
    if (cmp !== 0) return cmp
  } else if (a.dueDate) {
    return -1
  } else if (b.dueDate) {
    return 1
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

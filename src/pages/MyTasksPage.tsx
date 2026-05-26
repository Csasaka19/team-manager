import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Inbox } from 'lucide-react'
import { TaskSection } from '@/components/my-tasks/TaskSection'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
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
  const { currentUser } = useAuth()
  const { tasks, projects } = useData()
  const [showCompleted, setShowCompleted] = useState(false)

  const projectById = useMemo<Map<string, Project>>(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const myTasks = useMemo(() => {
    if (!currentUser) return []
    return tasks.filter((t) => t.assigneeId === currentUser.id)
  }, [tasks, currentUser])

  const { dueToday, thisWeek, upcoming, completed } = useMemo(
    () => bucketTasks(myTasks),
    [myTasks],
  )

  if (!currentUser) {
    return null
  }

  // "My tasks" excludes Done from the main buckets, so the no-tasks-assigned
  // state is judged against the full assigned list.
  if (myTasks.length === 0) {
    return <EmptyMyTasks />
  }

  return (
    <div className="space-y-6 md:space-y-8">
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
  dueToday: Task[]
  thisWeek: Task[]
  upcoming: Task[]
  completed: Task[]
}

function bucketTasks(tasks: Task[]): Buckets {
  const today = now()
  const todayMid = startOfDay(today).getTime()
  const weekStart = startOfWeek(today).getTime()
  const weekEnd = endOfWeek(today).getTime()
  const completedCutoff = todayMid - COMPLETED_WINDOW_DAYS * 86_400_000

  const dueToday: Task[] = []
  const thisWeek: Task[] = []
  const upcoming: Task[] = []
  const completed: Task[] = []

  for (const t of tasks) {
    if (t.status === 'done') {
      const finishedAt = new Date(t.updatedAt).getTime()
      if (finishedAt >= completedCutoff) completed.push(t)
      continue
    }

    if (!t.dueDate) {
      upcoming.push(t)
      continue
    }

    const dueMid = startOfDay(new Date(t.dueDate)).getTime()
    if (dueMid === todayMid || isOverdue(t.dueDate)) {
      // Overdue tasks float to the top of "Due Today" per spec.
      dueToday.push(t)
    } else if (dueMid >= weekStart && dueMid <= weekEnd) {
      thisWeek.push(t)
    } else if (dueMid > weekEnd) {
      upcoming.push(t)
    } else {
      // dueMid < weekStart but also not overdue → shouldn't happen, but handle gracefully.
      upcoming.push(t)
    }
  }

  // Sort: overdue first (most days overdue first), then today, then by priority.
  dueToday.sort((a, b) => {
    const aOver = a.dueDate && isOverdue(a.dueDate) ? daysBetween(a.dueDate, today) : 0
    const bOver = b.dueDate && isOverdue(b.dueDate) ? daysBetween(b.dueDate, today) : 0
    if (aOver !== bOver) return bOver - aOver
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  })

  // This week: sort by due date ascending, then priority.
  thisWeek.sort((a, b) => {
    const d = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    if (d !== 0) return d
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  })

  // Upcoming: tasks with a due date sorted by date asc; no-date tasks at the bottom.
  upcoming.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  })

  // Completed: most recently completed first.
  completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return { dueToday, thisWeek, upcoming, completed }
}

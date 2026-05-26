import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  FolderOpen,
  LayoutGrid,
} from 'lucide-react'
import { SummaryCard } from '@/components/dashboard/SummaryCard'
import {
  NeedsAttention,
  type AttentionItem,
} from '@/components/dashboard/NeedsAttention'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { STATUS_LABELS, type Task } from '@/data/types'
import {
  daysBetween,
  endOfWeek,
  isInThisWeek,
  isOverdue,
  now,
  startOfWeek,
} from '@/lib/date-utils'

const STALE_DAYS = 5
const QUESTION_WINDOW_HOURS = 48
const ACTIVITY_FEED_LIMIT = 20

export default function DashboardPage() {
  const { currentUser } = useAuth()
  const { tasks, projects, activities, teamMembers } = useData()

  const summary = useMemo(() => computeSummary(tasks), [tasks])
  const attention = useMemo(
    () => computeAttention(tasks, activities, projects, teamMembers),
    [tasks, activities, projects, teamMembers],
  )
  const recentActivities = useMemo(
    () =>
      [...activities]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, ACTIVITY_FEED_LIMIT),
    [activities],
  )

  if (projects.length === 0) {
    return <EmptyDashboard />
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {currentUser ? `Welcome back, ${currentUser.name.split(' ')[0]}.` : 'Welcome back.'}{' '}
          Here&apos;s what&apos;s happening across your team.
        </p>
      </header>

      <section aria-label="Summary">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          <SummaryCard icon={LayoutGrid} label="Open Tasks" value={summary.open} />
          <SummaryCard
            icon={AlertTriangle}
            label="Overdue"
            value={summary.overdue}
            highlightWhenPositive
          />
          <SummaryCard icon={Calendar} label="Due This Week" value={summary.dueThisWeek} />
          <SummaryCard
            icon={CheckCircle}
            label="Completed This Week"
            value={summary.completedThisWeek}
          />
        </div>
      </section>

      <section aria-labelledby="needs-attention-heading">
        <h2
          id="needs-attention-heading"
          className="mb-3 text-lg font-semibold text-[var(--text-primary)]"
        >
          Needs Attention
        </h2>
        <NeedsAttention items={attention} />
      </section>

      <section aria-labelledby="activity-heading">
        <h2
          id="activity-heading"
          className="mb-3 text-lg font-semibold text-[var(--text-primary)]"
        >
          This Week&apos;s Activity
        </h2>
        <ActivityFeed
          activities={recentActivities}
          tasks={tasks}
          projects={projects}
          members={teamMembers}
        />
      </section>
    </div>
  )
}

function EmptyDashboard() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <FolderOpen
        className="h-12 w-12 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="mt-4 text-base font-medium text-[var(--text-secondary)]">
        No projects yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        Create your first project to get started organizing work.
      </p>
      <Link
        to="/projects"
        className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)]"
      >
        Create your first project
      </Link>
    </div>
  )
}

interface Summary {
  open: number
  overdue: number
  dueThisWeek: number
  completedThisWeek: number
}

function computeSummary(tasks: Task[]): Summary {
  const weekStart = startOfWeek().getTime()
  const weekEnd = endOfWeek().getTime()
  let open = 0
  let overdue = 0
  let dueThisWeek = 0
  let completedThisWeek = 0
  for (const t of tasks) {
    if (t.status !== 'done') {
      open += 1
      if (isOverdue(t.dueDate)) overdue += 1
    }
    if (isInThisWeek(t.dueDate)) dueThisWeek += 1
    if (t.status === 'done') {
      const updated = new Date(t.updatedAt).getTime()
      if (updated >= weekStart && updated <= weekEnd) {
        completedThisWeek += 1
      }
    }
  }
  return { open, overdue, dueThisWeek, completedThisWeek }
}

function computeAttention(
  tasks: Task[],
  activities: import('@/data/types').Activity[],
  projects: import('@/data/types').Project[],
  members: import('@/data/types').TeamMember[],
): AttentionItem[] {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const memberById = new Map(members.map((m) => [m.id, m]))
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // Pre-index latest status_change per task for stale detection.
  const lastStatusChangeByTask = new Map<string, string>()
  for (const a of activities) {
    if (a.type !== 'status_change') continue
    const prev = lastStatusChangeByTask.get(a.taskId)
    if (!prev || a.createdAt > prev) {
      lastStatusChangeByTask.set(a.taskId, a.createdAt)
    }
  }

  const items: AttentionItem[] = []

  // 1. Overdue (red)
  const overdueTasks = tasks
    .filter((t) => t.status !== 'done' && isOverdue(t.dueDate))
    .map((t) => ({ task: t, days: -daysBetween(t.dueDate!, now()) }))
    .sort((a, b) => b.days - a.days)
  for (const { task, days } of overdueTasks) {
    items.push({
      kind: 'overdue',
      key: `overdue-${task.id}`,
      taskId: task.id,
      title: task.title,
      project: projectById.get(task.projectId)?.name ?? 'Unknown project',
      days,
      assignee: task.assigneeId
        ? memberById.get(task.assigneeId)?.name ?? null
        : null,
    })
  }

  // 2. Unassigned high/critical (orange)
  const priorityRank: Record<string, number> = { critical: 0, high: 1 }
  const unassigned = tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.assigneeId === null &&
        (t.priority === 'critical' || t.priority === 'high'),
    )
    .sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        b.createdAt.localeCompare(a.createdAt),
    )
  for (const task of unassigned) {
    items.push({
      kind: 'unassigned',
      key: `unassigned-${task.id}`,
      taskId: task.id,
      title: task.title,
      project: projectById.get(task.projectId)?.name ?? 'Unknown project',
    })
  }

  // 3. Recent questions (blue) — comments ending in "?" in the last 48 hours.
  const refTime = now().getTime()
  const questionComments = activities
    .filter(
      (a) =>
        a.type === 'comment' &&
        a.content.trim().endsWith('?') &&
        refTime - new Date(a.createdAt).getTime() <=
          QUESTION_WINDOW_HOURS * 3_600_000,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const activity of questionComments) {
    const task = taskById.get(activity.taskId)
    if (!task) continue
    items.push({
      kind: 'question',
      key: `question-${activity.id}`,
      taskId: task.id,
      title: task.title,
      commenter: memberById.get(activity.actorId)?.name ?? 'Someone',
      preview: stripMention(activity.content),
    })
  }

  // 4. Stale (gray) — no status change in 5+ days, excluding Done.
  const staleTasks = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const ref = lastStatusChangeByTask.get(t.id) ?? t.createdAt
      return { task: t, days: daysBetween(ref, now()) }
    })
    .filter(({ days }) => days > STALE_DAYS)
    .sort((a, b) => b.days - a.days)
  for (const { task, days } of staleTasks) {
    items.push({
      kind: 'stale',
      key: `stale-${task.id}`,
      taskId: task.id,
      title: task.title,
      status: STATUS_LABELS[task.status],
      days,
    })
  }

  return items
}

/** Strip a leading "@Name" mention so the preview starts with the actual question. */
function stripMention(text: string): string {
  return text.replace(/^@[\w\s.-]+?[—,:]\s*/, '').replace(/^@\S+\s+/, '').trim()
}

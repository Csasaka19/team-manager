import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  FolderOpen,
  LayoutGrid,
} from 'lucide-react'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'
import { ProjectsGlance } from '@/components/dashboard/ProjectsGlance'
import { RecentMeetings } from '@/components/dashboard/RecentMeetings'
import { SummaryCard } from '@/components/dashboard/SummaryCard'
import { WeekTimeline } from '@/components/dashboard/WeekTimeline'
import {
  NeedsAttention,
  type AttentionItem,
} from '@/components/dashboard/NeedsAttention'
import {
  ActivityFeed,
  type ActivityFilter,
} from '@/components/dashboard/ActivityFeed'
import { SkeletonCard, SkeletonLine } from '@/components/shared/Skeleton'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
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
const ACTIVITY_FEED_INITIAL = 30
const ACTIVITY_FEED_PAGE = 30

const FILTER_OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'status', label: 'Status changes' },
  { value: 'comments', label: 'Comments' },
  { value: 'assignments', label: 'Assignments' },
]

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { currentUser } = useAuth()
  const { tasks, projects, activities, teamMembers, meetings, isInitialLoading } =
    useData()

  const summary = useMemo(() => computeSummary(tasks), [tasks])
  const attention = useMemo(
    () => computeAttention(tasks, activities, projects, teamMembers),
    [tasks, activities, projects, teamMembers],
  )
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_FEED_INITIAL)

  const sortedActivities = useMemo(
    () =>
      [...activities].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [activities],
  )
  // The filter applies before pagination — picking "Comments" first then
  // pressing "Load more" should reveal the next 30 comments, not be diluted
  // by the 30 most-recent of any type.
  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return sortedActivities
    const allow: Record<Exclude<ActivityFilter, 'all'>, string> = {
      status: 'status_change',
      comments: 'comment',
      assignments: 'assignment',
    }
    return sortedActivities.filter((a) => a.type === allow[activityFilter])
  }, [sortedActivities, activityFilter])
  const visibleActivities = useMemo(
    () => filteredActivities.slice(0, activityLimit),
    [filteredActivities, activityLimit],
  )
  const canLoadMore = filteredActivities.length > visibleActivities.length

  if (isInitialLoading) {
    return <DashboardSkeleton />
  }

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

      <CollapsibleSection id="summary" title="Summary">
        <div
          data-tour="summary"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4"
        >
          <SummaryCard icon={LayoutGrid} label="Open Tasks" value={summary.open} />
          <SummaryCard
            icon={AlertTriangle}
            label="Overdue"
            value={summary.overdue}
            highlightWhenPositive
            pulseWhenPositive
          />
          <SummaryCard icon={Calendar} label="Due This Week" value={summary.dueThisWeek} />
          <SummaryCard
            icon={CheckCircle}
            label="Completed This Week"
            value={summary.completedThisWeek}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="projects-glance"
        title="Projects at a Glance"
        subtitle="Health across every active project — click a card to filter the board."
      >
        <ProjectsGlance projects={projects} tasks={tasks} />
      </CollapsibleSection>

      <CollapsibleSection
        id="week-timeline"
        title="This Week"
        subtitle="Tasks due each day, Mon–Sun."
      >
        <WeekTimeline tasks={tasks} members={teamMembers} />
      </CollapsibleSection>

      <CollapsibleSection
        id="recent-meetings"
        title="Recent Meetings"
        subtitle="The last three across every project."
        controls={
          <Link
            to="/projects"
            className="text-xs font-medium text-[var(--accent-primary)] hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            View all
          </Link>
        }
      >
        <RecentMeetings meetings={meetings} projects={projects} />
      </CollapsibleSection>

      <CollapsibleSection id="needs-attention" title="Needs Attention">
        <NeedsAttention items={attention} />
      </CollapsibleSection>

      <CollapsibleSection
        id="activity"
        title="This Week's Activity"
        controls={
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="sr-only">Filter activity</span>
            <select
              value={activityFilter}
              onChange={(e) => {
                setActivityFilter(e.target.value as ActivityFilter)
                setActivityLimit(ACTIVITY_FEED_INITIAL)
              }}
              aria-label="Filter activity"
              className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <ActivityFeed
          activities={visibleActivities}
          tasks={tasks}
          projects={projects}
          members={teamMembers}
        />
        {canLoadMore && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setActivityLimit((n) => n + ACTIVITY_FEED_PAGE)
              }
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Load more
            </button>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <SkeletonLine width="w-40" height="h-7" />
        <SkeletonLine width="w-72" height="h-3" className="mt-2" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="md:p-5">
            <SkeletonLine width="w-6" height="h-6" />
            <SkeletonLine width="w-12" height="h-7" className="mt-3" />
            <SkeletonLine width="w-24" height="h-3" className="mt-3" />
          </SkeletonCard>
        ))}
      </div>
      <div className="space-y-2">
        <SkeletonLine width="w-32" height="h-5" />
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} className="w-[200px] shrink-0">
                <SkeletonLine width="w-28" height="h-4" />
                <SkeletonLine width="w-14" height="h-14" className="mx-auto mt-3 rounded-full" />
                <SkeletonLine width="w-20" height="h-3" className="mx-auto mt-3" />
              </SkeletonCard>
            ))}
          </div>
        </div>
      </div>
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
    if (a.type !== 'status_change' || a.taskId === null) continue
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
    if (activity.taskId === null) continue
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

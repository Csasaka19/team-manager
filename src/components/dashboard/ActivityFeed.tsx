import { Link } from 'react-router-dom'
import { Avatar } from '@/components/shared/Avatar'
import { relativeTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Activity, Project, Task, TeamMember } from '@/data/types'

interface ActivityFeedProps {
  activities: Activity[]
  tasks: Task[]
  projects: Project[]
  members: TeamMember[]
}

export function ActivityFeed({ activities, tasks, projects, members }: ActivityFeedProps) {
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const memberById = new Map(members.map((m) => [m.id, m]))

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No activity yet. Updates from your team will show up here.
        </p>
      </div>
    )
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
      {activities.map((activity, idx) => {
        const task = taskById.get(activity.taskId)
        const project = task ? projectById.get(task.projectId) : undefined
        const actor = memberById.get(activity.actorId)

        const actorName = actor?.name ?? 'Someone'
        const taskTitle = task?.title ?? '(deleted task)'
        const projectName = project?.name ?? null

        const description = describeActivity(activity, taskTitle)

        return (
          <li
            key={activity.id}
            className={cn(
              idx % 2 === 0 ? 'bg-transparent' : 'bg-[var(--bg-surface)]',
              idx !== activities.length - 1 && 'border-b border-[var(--border-subtle)]',
            )}
          >
            <FeedRow
              actorName={actorName}
              description={description}
              projectName={projectName}
              taskId={activity.taskId}
              createdAt={activity.createdAt}
              hasTask={Boolean(task)}
            />
          </li>
        )
      })}
    </ul>
  )
}

interface FeedRowProps {
  actorName: string
  description: string
  projectName: string | null
  taskId: string
  createdAt: string
  hasTask: boolean
}

function FeedRow({
  actorName,
  description,
  projectName,
  taskId,
  createdAt,
  hasTask,
}: FeedRowProps) {
  const body = (
    <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
      <Avatar name={actorName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--text-primary)]">
          <span className="font-medium">{actorName}</span>{' '}
          <span className="text-[var(--text-secondary)]">{description}</span>
          {projectName && (
            <span className="text-[var(--text-secondary)]"> in {projectName}</span>
          )}
        </p>
      </div>
      <span className="shrink-0 text-xs text-[var(--text-secondary)] tabular-nums">
        {relativeTime(createdAt)}
      </span>
    </div>
  )

  if (!hasTask) {
    return <div className="cursor-default opacity-60">{body}</div>
  }
  return (
    <Link to={`/tasks/${taskId}`} className="block transition-colors hover:bg-[var(--bg-elevated)]">
      {body}
    </Link>
  )
}

/**
 * Convert an Activity into a verb phrase referencing the task.
 *
 * Activity.content is stored with "this" as a placeholder for the task title
 * (e.g. "moved this to In Review"); the feed renders it with the real title
 * substituted, so the line reads "Alex moved Foo to In Review in Project X".
 */
function describeActivity(activity: Activity, taskTitle: string): string {
  switch (activity.type) {
    case 'creation':
      return `created ${taskTitle}`
    case 'status_change':
      // "moved this to In Review"
      return activity.content.replace(/\bthis\b/, taskTitle)
    case 'assignment':
      // "assigned this to Sam Chen" / "unassigned this task"
      return activity.content.replace(/\bthis task\b/, taskTitle).replace(/\bthis\b/, taskTitle)
    case 'comment':
      return `commented on ${taskTitle}`
    case 'subtask_complete':
      return `${activity.content} on ${taskTitle}`
    case 'priority_change':
      return `${activity.content} on ${taskTitle}`
  }
}

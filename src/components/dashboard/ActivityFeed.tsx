import { useMemo } from 'react'
import { ActivityItem } from '@/components/shared/ActivityItem'
import { cn } from '@/lib/utils'
import type {
  Activity,
  ActivityType,
  Project,
  Task,
  TeamMember,
} from '@/data/types'

export type ActivityFilter = 'all' | 'status' | 'comments' | 'assignments'

interface ActivityFeedProps {
  activities: Activity[]
  tasks: Task[]
  projects: Project[]
  members: TeamMember[]
  /** Defaults to `all`. */
  filter?: ActivityFilter
}

/** Types that survive each filter setting. */
const FILTER_TYPES: Record<ActivityFilter, ActivityType[] | null> = {
  all: null,
  status: ['status_change'],
  comments: ['comment'],
  assignments: ['assignment'],
}

export function ActivityFeed({
  activities,
  tasks,
  projects,
  members,
  filter = 'all',
}: ActivityFeedProps) {
  const taskById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks],
  )
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  const visible = useMemo(() => {
    const allow = FILTER_TYPES[filter]
    if (!allow) return activities
    return activities.filter((a) => allow.includes(a.type))
  }, [activities, filter])

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {filter === 'all'
            ? 'No activity yet. Updates from your team will show up here.'
            : 'No activity matching this filter yet.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
      {visible.map((activity, idx) => (
        <li
          key={activity.id}
          className={cn(
            idx % 2 === 0 ? 'bg-transparent' : 'bg-[var(--bg-surface)]',
            idx !== visible.length - 1 &&
              'border-b border-[var(--border-subtle)]',
          )}
        >
          <ActivityItem
            activity={activity}
            taskById={taskById}
            projectById={projectById}
            memberById={memberById}
            members={members}
            variant="feed"
          />
        </li>
      ))}
    </ul>
  )
}

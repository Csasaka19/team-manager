import { useMemo } from 'react'
import { ActivityItem } from '@/components/shared/ActivityItem'
import type { Activity, TeamMember } from '@/data/types'

interface ActivityLogTabProps {
  /** Pre-filtered activities for this task — both comments and system
   *  events. The tab strips out comments and renders only the audit
   *  trail. */
  activities: Activity[]
  members: TeamMember[]
}

export function ActivityLogTab({ activities, members }: ActivityLogTabProps) {
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  const ordered = useMemo(
    () =>
      activities
        .filter((a) => a.type !== 'comment')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [activities],
  )

  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No activity recorded yet for this task.
        </p>
      </div>
    )
  }

  // Empty maps for task/project lookup — the detail-page activity rows
  // don't need cross-task linking (every entry is on the current task).
  const taskById = new Map()
  const projectById = new Map()

  return (
    <ol className="flex flex-col gap-0.5">
      {ordered.map((activity) => (
        <li key={activity.id}>
          <ActivityItem
            activity={activity}
            taskById={taskById}
            projectById={projectById}
            memberById={memberById}
            members={members}
            variant="detail"
          />
        </li>
      ))}
    </ol>
  )
}

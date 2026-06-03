import { useMemo } from 'react'
import { ActivityItem } from '@/components/shared/ActivityItem'
import type { Activity, TeamMember } from '@/data/types'

interface ActivityCommentFeedProps {
  activities: Activity[]
  members: TeamMember[]
}

/**
 * Task-detail activity feed. Comments are rendered as large left-bordered
 * cards via `ActivityItem`'s `detail` variant; system events (status,
 * assignment, priority, due-date changes, subtask events) render as
 * compact single-line rows between them.
 */
export function ActivityCommentFeed({
  activities,
  members,
}: ActivityCommentFeedProps) {
  // No task/project lookups needed at this depth — task detail already knows
  // its own task. We pass empty maps; `ActivityItem` handles them fine
  // because the comment card branch and the system-row phrase both fall back
  // to the activity's stored content / metadata when a task lookup misses.
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )
  const taskById = useMemo(() => new Map(), [])
  const projectById = useMemo(() => new Map(), [])

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No activity yet. Be the first to leave a comment.
        </p>
      </div>
    )
  }

  // Most recent at the bottom so the comment input flows naturally below.
  const ordered = useMemo(
    () =>
      [...activities].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [activities],
  )

  return (
    <ol className="flex flex-col gap-3">
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

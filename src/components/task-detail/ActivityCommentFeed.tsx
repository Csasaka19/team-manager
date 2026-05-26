import { Fragment } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { relativeTime } from '@/lib/date-utils'
import type { Activity, TeamMember } from '@/data/types'

interface ActivityCommentFeedProps {
  activities: Activity[]
  members: TeamMember[]
}

export function ActivityCommentFeed({ activities, members }: ActivityCommentFeedProps) {
  const memberById = new Map(members.map((m) => [m.id, m]))

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
  const ordered = [...activities].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )

  return (
    <ol className="flex flex-col gap-3">
      {ordered.map((activity) => (
        <li key={activity.id}>
          {activity.type === 'comment' ? (
            <CommentEntry
              activity={activity}
              actor={memberById.get(activity.actorId)}
              members={members}
            />
          ) : (
            <EventEntry
              activity={activity}
              actor={memberById.get(activity.actorId)}
            />
          )}
        </li>
      ))}
    </ol>
  )
}

function CommentEntry({
  activity,
  actor,
  members,
}: {
  activity: Activity
  actor: TeamMember | undefined
  members: TeamMember[]
}) {
  const name = actor?.name ?? 'Someone'
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 md:px-4">
      <Avatar name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {name}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {relativeTime(activity.createdAt)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">
          <CommentBody text={activity.content} members={members} />
        </p>
      </div>
    </div>
  )
}

function EventEntry({
  activity,
  actor,
}: {
  activity: Activity
  actor: TeamMember | undefined
}) {
  const name = actor?.name ?? 'Someone'
  const description = describeEvent(activity)
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <Avatar name={name} size="xs" />
      <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">{name}</span>{' '}
        {description}
      </p>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">
        {relativeTime(activity.createdAt)}
      </span>
    </div>
  )
}

function describeEvent(activity: Activity): string {
  switch (activity.type) {
    case 'creation':
      return 'created this task'
    case 'status_change':
      // Stored as "moved this to In Review"
      return activity.content
    case 'assignment':
      // Stored as "assigned this to Sam Chen" or "unassigned this task"
      return activity.content
    case 'priority_change':
      return activity.content
    case 'subtask_complete':
      return activity.content
    case 'comment':
      return 'commented'
  }
}

/** Render a comment's text with @mention spans highlighted. */
function CommentBody({ text, members }: { text: string; members: TeamMember[] }) {
  // Split into runs preserving any @Handle tokens. A "handle" is the member's
  // name with whitespace removed — matches how CommentInput inserts mentions.
  const handles = new Map<string, TeamMember>()
  for (const m of members) {
    handles.set(m.name.replace(/\s+/g, '').toLowerCase(), m)
  }

  const parts = text.split(/(@[A-Za-z][A-Za-z0-9_-]*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const handle = part.slice(1).toLowerCase()
          const member = handles.get(handle)
          if (member) {
            return (
              <span
                key={i}
                className="rounded bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] px-1 font-medium text-[var(--accent-primary)]"
              >
                @{member.name}
              </span>
            )
          }
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

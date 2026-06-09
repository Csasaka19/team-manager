import { useMemo, useState } from 'react'
import { ListChecks, MessageSquare } from 'lucide-react'
import { ActivityLogTab } from './ActivityLogTab'
import { CommentsTab } from './CommentsTab'
import { cn } from '@/lib/utils'
import type { Activity, Task, TeamMember } from '@/data/types'

interface ActivityCommentFeedProps {
  task: Task
  activities: Activity[]
  members: TeamMember[]
}

type Tab = 'comments' | 'activity'

/**
 * Tab container at the bottom of the task detail page. Comments are now
 * separated from system activities — the Comments tab carries the
 * conversation (with labels, pins, threading, filters) and the
 * Activity Log tab carries the audit trail.
 */
export function ActivityCommentFeed({
  task,
  activities,
  members,
}: ActivityCommentFeedProps) {
  const [tab, setTab] = useState<Tab>('comments')

  const counts = useMemo(() => {
    let comments = 0
    let events = 0
    for (const a of activities) {
      if (a.type === 'comment') comments += 1
      else events += 1
    }
    return { comments, events }
  }, [activities])

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Activity tabs" className="-mb-px flex gap-1 border-b border-[var(--border-subtle)]">
        <TabButton
          active={tab === 'comments'}
          onClick={() => setTab('comments')}
          icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Comments"
          count={counts.comments}
        />
        <TabButton
          active={tab === 'activity'}
          onClick={() => setTab('activity')}
          icon={<ListChecks className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Activity Log"
          count={counts.events}
        />
      </div>

      {tab === 'comments' ? (
        <CommentsTab task={task} activities={activities} members={members} />
      ) : (
        <ActivityLogTab activities={activities} members={members} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        active
          ? 'border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      )}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          ({count})
        </span>
      )}
    </button>
  )
}

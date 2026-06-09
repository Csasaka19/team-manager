import { Link } from 'react-router-dom'
import { CheckCircle2, ListChecks, MessageSquare } from 'lucide-react'
import { AvatarStack } from '@/components/shared/AvatarStack'
import { daysBetween, now } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Meeting, TeamMember } from '@/data/types'

/** Past meetings shouldn't read as "overdue" — they happened, that's
 *  fine. Today / Yesterday for the recent two days; weekday name for the
 *  rest of the current week (in either direction); full date otherwise. */
function meetingDateLabel(isoDate: string): string {
  const d = new Date(isoDate)
  const diff = daysBetween(d, now())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  if (Math.abs(diff) < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface MeetingListRowProps {
  meeting: Meeting
  members: TeamMember[]
  /** URL to navigate to when the row is clicked. */
  to: string
}

const STATUS_STYLE: Record<
  Meeting['status'],
  { label: string; bg: string; fg: string }
> = {
  scheduled: {
    label: 'Scheduled',
    bg: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
    fg: 'var(--accent-primary)',
  },
  completed: {
    label: 'Completed',
    bg: 'color-mix(in srgb, var(--status-done) 15%, transparent)',
    fg: 'var(--status-done)',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'color-mix(in srgb, var(--text-muted) 20%, transparent)',
    fg: 'var(--text-muted)',
  },
}

export function MeetingListRow({ meeting, members, to }: MeetingListRowProps) {
  const attendees = meeting.attendeeIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is TeamMember => Boolean(m))

  const totalActions = meeting.actionItems.length
  const doneActions = meeting.actionItems.filter((a) => a.done).length
  const allActionsDone = totalActions > 0 && doneActions === totalActions

  const dateLabel = meetingDateLabel(meeting.date)

  const status = STATUS_STYLE[meeting.status]
  const isCancelled = meeting.status === 'cancelled'

  return (
    <Link
      to={to}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:flex-row md:items-center md:gap-4 md:p-4',
        isCancelled && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              'truncate text-[15px] font-medium text-[var(--text-primary)]',
              isCancelled && 'line-through',
            )}
            title={meeting.title}
          >
            {meeting.title}
          </h3>
          <span
            className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.5px]"
            style={{ backgroundColor: status.bg, color: status.fg }}
          >
            {status.label}
          </span>
          {allActionsDone && !isCancelled && (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] px-2 text-[10px] font-medium text-[var(--status-done)]"
              title="All action items complete"
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              All actions done
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{dateLabel}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)] tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <ListChecks
              className="h-3.5 w-3.5 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            {totalActions === 0
              ? 'No action items'
              : `${totalActions} action item${totalActions === 1 ? '' : 's'} (${doneActions} done)`}
          </span>
          {meeting.decisions.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare
                className="h-3.5 w-3.5 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              {meeting.decisions.length} decision
              {meeting.decisions.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {attendees.length > 0 ? (
          <AvatarStack
            names={attendees.map((a) => a.name)}
            max={4}
            size="sm"
          />
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">
            No attendees
          </span>
        )}
      </div>
    </Link>
  )
}

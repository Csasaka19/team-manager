import { CalendarRange } from 'lucide-react'
import { MeetingListRow } from './MeetingListRow'
import type { Meeting, TeamMember } from '@/data/types'

interface MeetingListProps {
  meetings: Meeting[]
  members: TeamMember[]
  /** Builds the route for each meeting row (`/projects/:p/meetings/:m`). */
  hrefForMeeting: (meeting: Meeting) => string
}

export function MeetingList({ meetings, members, hrefForMeeting }: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
        <CalendarRange
          className="h-10 w-10 text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h3 className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
          No meetings yet
        </h3>
        <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">
          Capture discussions, decisions, and action items for this project.
        </p>
      </div>
    )
  }

  // Newest first — date descending, then createdAt as the tiebreaker so a
  // pair of same-day meetings stay in deterministic order.
  const sorted = [...meetings].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((m) => (
        <li key={m.id}>
          <MeetingListRow
            meeting={m}
            members={members}
            to={hrefForMeeting(m)}
          />
        </li>
      ))}
    </ul>
  )
}

import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { useData } from '@/data/store'

/**
 * Renders above the task description on tasks that were converted from a
 * meeting's action item. Links back to the meeting detail. Falls back to a
 * muted "Source meeting was deleted" line if the meeting is gone — the
 * task is independent at that point, but the lineage still shows.
 */
export function MeetingSourceBanner({
  sourceMeetingId,
}: {
  sourceMeetingId: string
}) {
  const { meetings } = useData()
  const meeting = meetings.find((m) => m.id === sourceMeetingId)

  if (!meeting) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-muted)]">
        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Source meeting was deleted.
      </div>
    )
  }

  return (
    <Link
      to={`/projects/${meeting.projectId}/meetings/${meeting.id}`}
      className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      <span>
        Created from meeting:{' '}
        <span className="font-medium text-[var(--text-primary)]">
          {meeting.title}
        </span>{' '}
        · {meeting.date}
      </span>
    </Link>
  )
}

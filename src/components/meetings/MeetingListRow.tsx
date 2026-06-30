import { Link } from 'react-router-dom'
import { CheckCircle2, ListChecks, MessageSquare } from 'lucide-react'
import { AvatarStack } from '@/components/shared/AvatarStack'
import { daysBetween, formatMeetingDate, now, parseLocalDate } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Meeting, TeamMember } from '@/data/types'

/** Past meetings shouldn't read as "overdue" — they happened, that's
 *  fine. Today / Yesterday / Tomorrow for the immediate window;
 *  "Mon, Jun 22" weekday + abbreviated date for the rest of the
 *  current week (gives both relative and absolute context per
 *  feedback); full "Jun 22, 2026" beyond that. */
function meetingDateLabel(isoDate: string): string {
  // parseLocalDate keeps YYYY-MM-DD strings on the user's calendar day —
  // `new Date(isoDate)` would UTC-midnight them and shift back a day
  // in negative-offset timezones.
  const d = parseLocalDate(isoDate)
  const diff = daysBetween(d, now())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  if (Math.abs(diff) < 7) {
    // "Sun, Jun 22" — weekday + abbreviated date so the reader sees
    // both the day-of-week and the calendar number without scanning.
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }
  return formatMeetingDate(isoDate)
}

/** CSS-variable colour mapping for the left-edge accent + status pill.
 *  Same vars the board / task-card use, so the meeting palette stays
 *  in lockstep with the rest of the app. */
const STATUS_ACCENT_VAR: Record<Meeting['status'], string> = {
  scheduled: '--accent-primary',
  completed: '--status-done',
  cancelled: '--text-muted',
}

interface MeetingListRowProps {
  meeting: Meeting
  members: TeamMember[]
  /** URL to navigate to when the row is clicked. */
  to: string
  /** Optional project context — rendered as a small coloured chip above
   *  the title. Used by the cross-project Meetings index so each row
   *  carries its project label; per-project lists omit it. */
  projectChip?: { name: string; color: string }
  /** True when a ZoomBot recording exists for the same date as the
   *  meeting. Renders a "Recordings available" pill in the row header. */
  hasRecordings?: boolean
}

/** Status pill — bg/fg/border each derive from a single accent var so
 *  the three states stay visually consistent (15% tint bg, 30% tint
 *  border, full-strength text). Cancelled uses the muted text colour
 *  instead of an accent so it visually recedes. */
const STATUS_STYLE: Record<
  Meeting['status'],
  { label: string; bg: string; fg: string; border: string }
> = {
  scheduled: {
    label: 'Scheduled',
    bg: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
    fg: 'var(--accent-primary)',
    border: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
  },
  completed: {
    label: 'Completed',
    bg: 'color-mix(in srgb, var(--status-done) 15%, transparent)',
    fg: 'var(--status-done)',
    border: 'color-mix(in srgb, var(--status-done) 30%, transparent)',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'var(--bg-elevated)',
    fg: 'var(--text-muted)',
    border: 'transparent',
  },
}

export function MeetingListRow({
  meeting,
  members,
  to,
  projectChip,
  hasRecordings = false,
}: MeetingListRowProps) {
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
      // 4px left accent border + right-rounded corners read like a
      // status-anchored card. `pl-4` ensures the inner content is
      // padded away from the accent strip (the border eats 4px on the
      // left edge). Hover swaps to the elevated bg for clear feedback.
      style={{
        borderLeftColor: `var(${STATUS_ACCENT_VAR[meeting.status]})`,
        opacity: isCancelled ? 0.6 : undefined,
      }}
      className={cn(
        'flex flex-col gap-3 rounded-r-lg border border-[var(--border-subtle)] border-l-4 bg-[var(--bg-surface)] py-3 pl-4 pr-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:flex-row md:items-center md:gap-4 md:py-4 md:pr-4',
      )}
    >
      <div className="min-w-0 flex-1">
        {projectChip && (
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: projectChip.color }}
              aria-hidden="true"
            />
            <span className="truncate text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              {projectChip.name}
            </span>
          </div>
        )}
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
            className="inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.5px]"
            style={{
              backgroundColor: status.bg,
              color: status.fg,
              borderColor: status.border,
            }}
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
          {hasRecordings && (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] px-2 text-[10px] font-medium text-[var(--accent-primary)]"
              title="ZoomBot recordings available for this date"
            >
              Recordings available
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
            {totalActions === 0 ? (
              'No action items'
            ) : (
              <>
                <span>
                  {totalActions} action item{totalActions === 1 ? '' : 's'} (
                  {doneActions} done)
                </span>
                {/* Mini progress bar — 16px wide, 4px tall. Green
                    `--status-done` fill so it reads as completion. */}
                <span
                  className="block h-1 w-16 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={totalActions}
                  aria-valuenow={doneActions}
                  aria-label={`${doneActions} of ${totalActions} action items done`}
                >
                  <span
                    className="block h-full rounded-full bg-[var(--status-done)] transition-[width] duration-200"
                    style={{
                      width: `${(doneActions / totalActions) * 100}%`,
                    }}
                  />
                </span>
              </>
            )}
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
      {attendees.length > 0 && (
        <div className="shrink-0">
          <AvatarStack
            names={attendees.map((a) => a.name)}
            max={4}
            size="sm"
          />
        </div>
      )}
    </Link>
  )
}

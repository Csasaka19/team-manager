import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { daysBetween, now } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Meeting, Project } from '@/data/types'

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

interface RecentMeetingsProps {
  meetings: Meeting[]
  projects: Project[]
  /** Max rows to show. Defaults to 3 per spec. */
  limit?: number
}

export function RecentMeetings({
  meetings,
  projects,
  limit = 3,
}: RecentMeetingsProps) {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  // Newest first by date, then createdAt as the tiebreaker.
  const sorted = [...meetings].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.createdAt.localeCompare(a.createdAt)
  })
  const visible = sorted.slice(0, limit)

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No meetings yet across any project.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {visible.map((m) => {
        const project = projectById.get(m.projectId)
        const total = m.actionItems.length
        const done = m.actionItems.filter((a) => a.done).length
        const dateLabel = meetingDateLabel(m.date)
        return (
          <li key={m.id}>
            <Link
              to={`/projects/${m.projectId}/meetings/${m.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:bg-[var(--bg-elevated)]"
            >
              <FileText
                className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {m.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  {project && (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="truncate">{project.name}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{dateLabel}</span>
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-xs tabular-nums',
                  total > 0 && done === total
                    ? 'text-[var(--status-done)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {total === 0
                  ? 'No actions'
                  : `${done} of ${total} done`}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

import { useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { MeetingListRow } from '@/components/meetings/MeetingListRow'
import { SkeletonLine } from '@/components/shared/Skeleton'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'
import type { Meeting, MeetingStatus } from '@/data/types'

type StatusFilter = 'all' | MeetingStatus

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function MeetingsPage() {
  useDocumentTitle('Meetings')
  const { meetings, projects, teamMembers, isInitialLoading } = useData()

  const [status, setStatus] = useState<StatusFilter>('all')
  const [projectId, setProjectId] = useState<string>('all')

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = {
      all: meetings.length,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const m of meetings) out[m.status] += 1
    return out
  }, [meetings])

  const visible = useMemo(() => {
    const filtered = meetings.filter((m) => {
      if (status !== 'all' && m.status !== status) return false
      if (projectId !== 'all' && m.projectId !== projectId) return false
      return true
    })
    return filtered.sort((a: Meeting, b: Meeting) => {
      const d = b.date.localeCompare(a.date)
      if (d !== 0) return d
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [meetings, status, projectId])

  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <SkeletonLine className="h-8 w-40" />
        <SkeletonLine className="h-9 w-full max-w-md" />
        <div className="space-y-2">
          <SkeletonLine className="h-20 w-full" />
          <SkeletonLine className="h-20 w-full" />
          <SkeletonLine className="h-20 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Meetings
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every discussion across every project — open a row to see its notes,
          decisions, and action items.
        </p>
      </header>

      {meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Filter meetings by status"
              className="flex flex-wrap items-center gap-1"
            >
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((key) => {
                const active = status === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(key)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                      active
                        ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {STATUS_LABEL[key]}
                    <span className="text-[10px] tabular-nums opacity-80">
                      {counts[key]}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label
                htmlFor="meetings-project-filter"
                className="text-xs text-[var(--text-secondary)]"
              >
                Project
              </label>
              <select
                id="meetings-project-filter"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-8 min-w-[160px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <option value="all">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                No meetings match the current filter.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((m) => {
                const project = projectById.get(m.projectId)
                return (
                  <li key={m.id}>
                    <MeetingListRow
                      meeting={m}
                      members={teamMembers}
                      to={`/projects/${m.projectId}/meetings/${m.id}`}
                      projectChip={
                        project
                          ? { name: project.name, color: project.color }
                          : undefined
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-12 text-center">
      <CalendarRange
        className="h-10 w-10 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
        No meetings yet
      </h2>
      <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">
        Open a project to schedule a meeting — discussions, decisions, and
        action items all live under the project they belong to.
      </p>
    </div>
  )
}

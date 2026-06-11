import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileText } from 'lucide-react'
import { useAtlas } from '@/hooks/useAtlas'
import { fetchAtlasSummaries } from '@/services/atlas/client'
import type { AtlasProject } from '@/services/atlas/types'
import { SkeletonLine } from '@/components/shared/Skeleton'
import { AtlasErrorState } from './AtlasErrorState'

interface AtlasSummariesTabProps {
  projects: AtlasProject[] | null
}

const LIMIT_OPTIONS = [20, 50, 100, 200] as const
type LimitOption = (typeof LIMIT_OPTIONS)[number]

export function AtlasSummariesTab({ projects }: AtlasSummariesTabProps) {
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [limit, setLimit] = useState<LimitOption>(20)

  const loader = useCallback(
    (signal: AbortSignal) =>
      fetchAtlasSummaries(
        {
          ...(projectFilter !== 'all' ? { project: projectFilter } : {}),
          ...(dateFilter ? { date: dateFilter } : {}),
          limit,
        },
        { signal },
      ),
    [projectFilter, dateFilter, limit],
  )
  const { data, error, loading, reload } = useAtlas(loader, [
    projectFilter,
    dateFilter,
    limit,
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="atlas-summaries-project"
              className="text-xs text-[var(--text-secondary)]"
            >
              Project
            </label>
            <select
              id="atlas-summaries-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-8 min-w-[160px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label
            htmlFor="atlas-summaries-date"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Date
          </label>
          <input
            id="atlas-summaries-date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="atlas-summaries-limit"
            className="text-xs text-[var(--text-secondary)]"
          >
            Show
          </label>
          <select
            id="atlas-summaries-limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as LimitOption)}
            className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <p className="ml-auto text-xs text-[var(--text-muted)] tabular-nums">
          {loading
            ? 'Loading…'
            : data
              ? `${data.length} summary${data.length === 1 ? '' : ' files'}`
              : ''}
        </p>
      </div>

      {loading ? (
        <SummariesSkeleton />
      ) : error ? (
        <AtlasErrorState error={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No summaries match the current filter.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.map((row, idx) => {
            const project = projects?.find((p) => p.slug === row.project)
            return (
              <li key={`${row.project}-${row.date}-${idx}`}>
                <Link
                  to={`/atlas/summaries/${encodeURIComponent(row.project)}/${encodeURIComponent(row.date)}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                >
                  <FileText
                    className="h-5 w-5 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {row.date}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {project?.name ?? row.project}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SummariesSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
        >
          <SkeletonLine className="h-5 w-5 rounded" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-3 w-24" />
            <SkeletonLine className="h-3 w-32" />
          </div>
        </li>
      ))}
    </ul>
  )
}

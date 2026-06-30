import { useMemo, useState } from 'react'
import { Loader2, RefreshCw, Database } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'

/**
 * Visible in apiMode only. Summarises what the store currently knows
 * about — project slugs, task count, team member names, meeting count,
 * last sync — and exposes a manual "Refresh now" button.
 */
export function AtlasDataOverview() {
  const {
    dataSource,
    projects,
    tasks,
    teamMembers,
    meetings,
    lastSynced,
    isRefreshing,
    syncError,
    refreshFromAtlas,
  } = useData()
  const [pending, setPending] = useState(false)

  if (dataSource !== 'atlas') return null

  const projectSlugs = useMemo(
    () => projects.map((p) => p.id).sort(),
    [projects],
  )
  const memberNames = useMemo(
    () =>
      [...teamMembers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => m.name),
    [teamMembers],
  )

  const handleRefresh = async () => {
    setPending(true)
    try {
      await refreshFromAtlas()
      toast.success('Refreshed from Atlas.')
    } catch (err) {
      toast.error(
        `Refresh failed: ${err instanceof Error ? err.message : 'unknown error'}.`,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="atlas-data-overview-heading">
      <div className="border-b border-[var(--border-subtle)] pb-3 mb-4">
        <h2
          id="atlas-data-overview-heading"
          className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
        >
          <Database className="h-4 w-4" aria-hidden="true" />
          Atlas Data Overview
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          What the app currently sees from the configured Atlas vault.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatTile label="Projects" value={String(projects.length)}>
            {projectSlugs.length > 0 && (
              <p className="mt-2 truncate font-mono text-xs text-[var(--text-muted)]">
                {projectSlugs.join(', ')}
              </p>
            )}
          </StatTile>
          <StatTile label="Tasks" value={String(tasks.length)}>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              across all projects
            </p>
          </StatTile>
          <StatTile
            label="Team members detected"
            value={String(teamMembers.length)}
          >
            {memberNames.length > 0 && (
              <p className="mt-2 truncate font-mono text-xs text-[var(--text-muted)]">
                {memberNames.join(', ')}
              </p>
            )}
          </StatTile>
          <StatTile label="Manifests loaded" value={String(meetings.length)}>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              one per (project, date) with extractions
            </p>
          </StatTile>
        </div>

        {/* Footer pinned at the bottom of the card body — last-sync
            line on the left, refresh action on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
          <span>
            Last sync:{' '}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {lastSynced
                ? lastSynced.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'never'}
            </span>
            {syncError && (
              <span
                className="ml-2 inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--priority-medium)]"
                title={syncError}
              >
                last attempt had errors
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pending || isRefreshing}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending || isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh now
          </button>
        </div>
      </div>
    </section>
  )
}

interface StatTileProps {
  label: string
  value: string
  children?: React.ReactNode
}

function StatTile({ label, value, children }: StatTileProps) {
  return (
    <div
      className={cn(
        // Per spec: rounded-lg, border, muted bg, generous p-4. The
        // tile reads as its own surface inside the section card.
        'rounded-lg border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-elevated)_30%,transparent)] p-4',
      )}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-[var(--text-primary)] tabular-nums">
        {value}
      </p>
      {children}
    </div>
  )
}

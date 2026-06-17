import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'

/**
 * Small live/demo/sync-error pill next to the workspace name. Conveys the
 * data source at a glance and lets the user jump straight to Settings →
 * Atlas API Connection when a sync error needs attention.
 */
export function DataSourceBadge() {
  const navigate = useNavigate()
  const {
    dataSource,
    syncError,
    isRefreshing,
    lastSynced,
    projects,
    tasks,
    sheetsConnected,
    projectDataSources,
  } = useData()

  const atlasActive = dataSource === 'atlas'
  const sheetsActive = sheetsConnected
  const live = atlasActive || sheetsActive || dataSource === 'google-sheets'

  const tone = syncError ? 'error' : live ? 'live' : 'mock'

  const label =
    tone === 'live' ? 'Live' : tone === 'error' ? 'Sync error' : 'Demo'

  const dotClass = cn(
    'inline-block h-2 w-2 shrink-0 rounded-full',
    isRefreshing && 'animate-pulse',
    tone === 'live' && 'bg-[var(--status-done)]',
    tone === 'error' && 'bg-[var(--priority-medium)]',
    tone === 'mock' && 'bg-[var(--text-muted)]',
  )

  // Sheets-sourced task count (for the per-source breakdown in the tip).
  const sheetsTaskCount = useMemo(() => {
    const sheetProjectIds = new Set(
      projectDataSources
        .filter((p) => p.source === 'google-sheets')
        .map((p) => p.projectId),
    )
    if (sheetProjectIds.size === 0) return 0
    return tasks.filter((t) => sheetProjectIds.has(t.projectId)).length
  }, [tasks, projectDataSources])

  const atlasProjectCount = useMemo(() => {
    const atlasProjectIds = new Set(
      projectDataSources
        .filter((p) => p.source === 'atlas')
        .map((p) => p.projectId),
    )
    return atlasProjectIds.size
  }, [projectDataSources])

  const tooltip = (() => {
    if (tone === 'error') {
      return `Sync error: ${syncError ?? 'unknown'} — click to open Settings`
    }
    if (tone === 'mock') {
      return 'Using demo data. Configure Atlas or Google Sheets in Settings to connect live data.'
    }
    // Live: combine whichever sources are active into a single line.
    const parts: string[] = []
    if (atlasActive) {
      parts.push(
        `Atlas: ${atlasProjectCount} project${atlasProjectCount === 1 ? '' : 's'}`,
      )
    }
    if (sheetsActive) {
      parts.push(
        `Sheets: Contracting.com (${sheetsTaskCount} task${sheetsTaskCount === 1 ? '' : 's'})`,
      )
    }
    if (parts.length === 0) {
      parts.push(`${projects.length} project${projects.length === 1 ? '' : 's'}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}`)
    }
    return `${parts.join(' · ')} · Last synced ${relativeAgo(lastSynced)}`
  })()

  const interactive = tone === 'error'

  return (
    <button
      type="button"
      onClick={interactive ? () => navigate('/settings') : undefined}
      disabled={!interactive}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]',
        interactive &&
          'transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        !interactive && 'cursor-default',
      )}
    >
      <span aria-hidden="true" className={dotClass} />
      {label}
    </button>
  )
}

function relativeAgo(when: Date | null): string {
  if (!when) return 'just now'
  const ms = Date.now() - when.getTime()
  if (ms < 30_000) return 'just now'
  if (ms < 60_000) return 'less than a minute ago'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'

/**
 * Yellow advisory bar that appears when:
 *   - Atlas mode is active
 *   - The last successful sync is more than STALE_THRESHOLD_MS ago
 *   - AND the most recent refresh attempt failed (`syncError` is set)
 *
 * The user can dismiss it but a subsequent sync error revives it. State is
 * keyed by the error message + lastSynced timestamp so a *new* failure
 * after dismissal still shows.
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000

export function StaleDataBanner() {
  const { dataSource, syncError, lastSynced, refreshFromAtlas, isRefreshing } =
    useData()

  const fingerprint =
    dataSource === 'atlas' && syncError
      ? `${lastSynced?.toISOString() ?? 'never'}::${syncError}`
      : null

  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(
    null,
  )
  // Tick every 30s so the "X minutes ago" copy stays accurate without the
  // bar disappearing/reappearing as time passes.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  // Reset dismissal when a new failure fingerprint arrives.
  useEffect(() => {
    if (!fingerprint) return
    if (fingerprint !== dismissedFingerprint) {
      setDismissedFingerprint(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint])

  void tick // referenced so the linter knows the interval matters

  if (!fingerprint) return null
  if (dismissedFingerprint === fingerprint) return null

  const ageMs = lastSynced ? Date.now() - lastSynced.getTime() : Infinity
  if (ageMs < STALE_THRESHOLD_MS) return null

  const ageLabel = formatAge(ageMs)

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 border-b border-[color-mix(in_srgb,var(--priority-medium)_30%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-medium)_12%,transparent)] px-4 py-2 text-sm text-[var(--text-primary)] md:px-6',
      )}
    >
      <AlertTriangle
        className="h-4 w-4 shrink-0 text-[var(--priority-medium)]"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1">
        Data may be stale — last synced {ageLabel} ago.{' '}
        <span className="text-[var(--text-secondary)]">{syncError}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          void refreshFromAtlas()
        }}
        disabled={isRefreshing}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[var(--border-default)] bg-transparent px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw
          className={cn('h-3 w-3', isRefreshing && 'animate-spin')}
          aria-hidden="true"
        />
        Retry
      </button>
      <button
        type="button"
        onClick={() => setDismissedFingerprint(fingerprint)}
        aria-label="Dismiss"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function formatAge(ms: number): string {
  if (!isFinite(ms)) return 'never'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'}`
}

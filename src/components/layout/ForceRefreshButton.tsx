import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'

/**
 * Small refresh button next to the DataSourceBadge in the top bar. Only
 * meaningful in Atlas mode — hidden in mock mode (where there's no
 * upstream to refresh from). Surfaces the same loadFromApi the store's
 * 60s interval uses, plus a toast on outcome.
 */
export function ForceRefreshButton() {
  const { dataSource, isRefreshing, refreshFromAtlas } = useData()
  const [pending, setPending] = useState(false)

  if (dataSource !== 'atlas') return null

  const handle = async () => {
    setPending(true)
    try {
      await refreshFromAtlas()
      toast.success('Data refreshed from Atlas.')
    } catch (err) {
      toast.error(
        `Refresh failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    } finally {
      setPending(false)
    }
  }

  const spinning = pending || isRefreshing

  return (
    <button
      type="button"
      onClick={handle}
      disabled={spinning}
      aria-label="Refresh data from Atlas"
      title="Refresh data from Atlas"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-wait md:h-9 md:w-9"
    >
      {spinning ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw
          className={cn('h-4 w-4', spinning && 'animate-spin')}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

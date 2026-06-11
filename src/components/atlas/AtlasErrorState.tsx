import { Link } from 'react-router-dom'
import { AlertTriangle, KeyRound, ServerCrash, Settings as SettingsIcon } from 'lucide-react'
import type { AtlasFetchError } from '@/hooks/useAtlas'

interface AtlasErrorStateProps {
  error: AtlasFetchError
  onRetry?: () => void
}

export function AtlasErrorState({ error, onRetry }: AtlasErrorStateProps) {
  const showSettingsCta =
    error.code === 'unauthorized' ||
    error.code === 'not_configured' ||
    error.code === 'network'

  const Icon =
    error.code === 'unauthorized' || error.code === 'not_configured'
      ? KeyRound
      : error.code === 'network'
        ? ServerCrash
        : AlertTriangle

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
      <Icon
        className="h-10 w-10 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div>
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          {error.message}
        </h3>
        {error.detail && error.detail !== error.message && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{error.detail}</p>
        )}
        {error.status > 0 && (
          <p className="mt-1 text-[11px] uppercase tracking-[0.5px] text-[var(--text-muted)]">
            HTTP {error.status}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            Retry
          </button>
        )}
        {showSettingsCta && (
          <Link
            to="/settings"
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <SettingsIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Open Settings
          </Link>
        )}
      </div>
    </div>
  )
}

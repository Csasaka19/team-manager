import { Link } from 'react-router-dom'
import { KeyRound, Settings as SettingsIcon } from 'lucide-react'

export function AtlasNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-12 text-center">
      <KeyRound
        className="h-10 w-10 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="max-w-md">
        <h2 className="text-base font-medium text-[var(--text-primary)]">
          Atlas isn&rsquo;t configured yet
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Set <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">VITE_ATLAS_BASE_URL</code>{' '}
          and{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">VITE_ATLAS_TOKEN</code>{' '}
          in <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">.env</code>{' '}
          (and restart the dev server), or paste them into Settings → Atlas
          Integration to override per-browser.
        </p>
      </div>
      <Link
        to="/settings"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <SettingsIcon className="h-4 w-4" aria-hidden="true" />
        Open Settings
      </Link>
    </div>
  )
}

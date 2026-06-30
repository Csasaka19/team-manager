import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ExternalLink, FileText, ListChecks } from 'lucide-react'
import { AtlasFeedTab } from '@/components/atlas/AtlasFeedTab'
import { AtlasNotConfigured } from '@/components/atlas/AtlasNotConfigured'
import { AtlasSummariesTab } from '@/components/atlas/AtlasSummariesTab'
import { AtlasTasksTab } from '@/components/atlas/AtlasTasksTab'
import { useAtlas } from '@/hooks/useAtlas'
import { fetchAtlasProjects } from '@/services/atlas/client'
import { getAtlasConfig, isAtlasConfigured } from '@/services/atlas/config'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'

type Tab = 'feed' | 'tasks' | 'summaries'

const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'summaries', label: 'Summaries', icon: FileText },
]

export default function AtlasPage() {
  useDocumentTitle('Atlas')
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = isTab(searchParams.get('tab')) ? searchParams.get('tab') as Tab : 'feed'
  const [tab, setTabState] = useState<Tab>(initialTab)

  const setTab = (next: Tab) => {
    setTabState(next)
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const configured = isAtlasConfigured()
  const config = getAtlasConfig()

  const loader = useCallback(
    (signal: AbortSignal) => fetchAtlasProjects({ signal }),
    [],
  )
  // Projects are shared across tabs — fetched once at the page level.
  // Tabs are mounted only on demand, so we eagerly load projects here so
  // each tab gets the filter dropdown without flashing an empty state.
  const projectsState = useAtlas(loader, [])

  const host = useMemo(() => {
    if (!config.baseUrl) return null
    try {
      return new URL(config.baseUrl).host
    } catch {
      return config.baseUrl
    }
  }, [config.baseUrl])

  if (!configured) {
    return (
      <div className="space-y-6">
        <AtlasHeader host={null} />
        <AtlasNotConfigured />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AtlasHeader host={host} />

      <div
        role="tablist"
        aria-label="Atlas sections"
        className="-mb-px flex gap-1 border-b border-[var(--border-subtle)]"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                active
                  ? 'border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'feed' && <AtlasFeedTab projects={projectsState.data} />}
      {tab === 'tasks' && <AtlasTasksTab projects={projectsState.data} />}
      {tab === 'summaries' && (
        <AtlasSummariesTab projects={projectsState.data} />
      )}
    </div>
  )
}

function AtlasHeader({ host }: { host: string | null }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Atlas
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        Read-only live feed from the Control Center vault.
        {host && (
          // Toned down — was a tinted pill, now an inline muted link
          // marker so the long Tailscale hostname doesn't dominate the
          // subtitle.
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {host}
          </span>
        )}
      </p>
    </header>
  )
}

function isTab(value: string | null): value is Tab {
  return value === 'feed' || value === 'tasks' || value === 'summaries'
}

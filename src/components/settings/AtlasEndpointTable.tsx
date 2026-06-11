import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useData } from '@/data/store'
import {
  probeAllEndpoints,
  type ProbeResult,
} from '@/services/atlas/discovery'
import {
  ATLAS_CONFIG_CHANGED_EVENT,
  isAtlasConfigured,
} from '@/services/atlas/config'
import {
  getAffectedPages,
  getEndpointDescription,
  isKnownEndpoint,
} from '@/services/atlas/endpoint-registry'
import { cn } from '@/lib/utils'

/**
 * Endpoint × Status × Pages table shown inside Settings → Atlas API.
 *
 * Runs `probeAllEndpoints` on mount and whenever the Atlas config
 * changes, hands the results to a compact table. Unknown paths
 * discovered at runtime get a "New" badge — they're already logged once
 * via console.warn at the discovery layer.
 */
export function AtlasEndpointTable() {
  const { dataSource, projects, tasks, meetings, snapshotIndex } = useData()
  const [results, setResults] = useState<ProbeResult[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runProbe = useCallback(async () => {
    if (!isAtlasConfigured()) {
      setResults([])
      return
    }
    setPending(true)
    setError(null)
    try {
      // Pre-seed samples from the store so probes for templated paths land
      // on real data instead of re-querying /summaries themselves.
      const firstProject = projects[0]?.id
      const firstMeeting = meetings[0]
      const firstTask = tasks[0]
      const context: Parameters<typeof probeAllEndpoints>[0] = {}
      if (firstProject) context.sampleProject = firstProject
      if (firstMeeting?.date) context.sampleDate = firstMeeting.date
      if (firstTask?.id) {
        context.sampleTaskId = firstTask.id
        if (!context.sampleProject) context.sampleProject = firstTask.projectId
      }
      const probed = await probeAllEndpoints(context)
      setResults(probed)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }, [projects, tasks, meetings])

  useEffect(() => {
    void runProbe()
    const handler = () => void runProbe()
    window.addEventListener(ATLAS_CONFIG_CHANGED_EVENT, handler)
    return () => window.removeEventListener(ATLAS_CONFIG_CHANGED_EVENT, handler)
    // Intentionally depend only on `runProbe` so the probe re-runs when
    // the underlying samples change. The store snapshotIndex updating
    // shouldn't force a refetch (it'd thrash on every 60s tick).
  }, [runProbe])

  if (dataSource !== 'atlas') return null

  return (
    <section aria-labelledby="atlas-endpoint-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="atlas-endpoint-heading"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          Discovered Endpoints
        </h2>
        <button
          type="button"
          onClick={() => void runProbe()}
          disabled={pending}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Re-probe
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Each endpoint is probed live. The Pages column shows which surfaces
        rely on the data from that endpoint.{' '}
        {snapshotIndex.tasksById.size > 0 && (
          <span className="text-[var(--text-muted)]">
            Sampling project <code className="font-mono text-[12px]">{projects[0]?.id}</code>
            {meetings[0]?.date && (
              <>
                , date <code className="font-mono text-[12px]">{meetings[0].date}</code>
              </>
            )}
            .
          </span>
        )}
      </p>

      {error && (
        <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--priority-critical)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-critical)_8%,transparent)] p-3 text-sm">
          <p className="font-medium">Probe failed</p>
          <p className="text-[var(--text-secondary)]">{error}</p>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 text-left text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Pages affected</th>
            </tr>
          </thead>
          <tbody>
            {pending && !results ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-xs text-[var(--text-muted)]"
                >
                  <Loader2
                    className="mx-auto mb-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Probing endpoints…
                </td>
              </tr>
            ) : results && results.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-xs text-[var(--text-muted)]"
                >
                  No endpoints discovered.
                </td>
              </tr>
            ) : (
              (results ?? []).map((r) => (
                <tr
                  key={r.path}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono text-[12px] text-[var(--text-primary)]">
                        {r.path}
                      </code>
                      {r.isNew && (
                        <span
                          className="inline-flex h-4 items-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] px-1.5 text-[9px] font-semibold uppercase tracking-[0.5px] text-[var(--accent-primary)]"
                          title="Not in endpoint-registry.ts yet — add a mapping to wire it to pages."
                        >
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {isKnownEndpoint(r.path)
                        ? getEndpointDescription(r.path)
                        : 'Unknown — no page mapping yet'}
                    </p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusCell result={r} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <PagesCell path={r.path} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StatusCell({ result }: { result: ProbeResult }) {
  switch (result.status) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--status-done)]">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Connected
          {typeof result.count === 'number' && (
            <span className="text-[var(--text-muted)] tabular-nums">
              ({result.count}{' '}
              {result.count === 1 ? 'item' : 'items'})
            </span>
          )}
        </span>
      )
    case 'empty':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--priority-medium)]">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Empty response
        </span>
      )
    case 'failed':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-[var(--priority-critical)]"
          title={result.error ?? 'failed'}
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Failed
          {result.error && (
            <span className="text-[var(--text-muted)]">— {result.error}</span>
          )}
        </span>
      )
    case 'unknown':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
          title={result.error ?? 'unknown'}
        >
          <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
          Skipped
        </span>
      )
  }
}

function PagesCell({ path }: { path: string }) {
  if (!isKnownEndpoint(path)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Unknown — no page mapping yet
      </span>
    )
  }
  const pages = getAffectedPages(path)
  if (pages.length === 0) {
    return <span className="text-xs text-[var(--text-muted)]">—</span>
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {pages.map((p) => (
        <li
          key={p}
          className={cn(
            'inline-flex h-5 items-center rounded-full bg-[var(--bg-elevated)] px-2 text-[10px] text-[var(--text-secondary)]',
          )}
        >
          {p}
        </li>
      ))}
    </ul>
  )
}

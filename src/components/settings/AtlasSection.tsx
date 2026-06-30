import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearAtlasOverride,
  getAtlasConfig,
  getAtlasConfigSource,
  isAtlasConfigured,
  notifyAtlasConfigChanged,
  setAtlasOverride,
  type AtlasConfigSource,
} from '@/services/atlas/config'
import { AtlasApiError, fetchAtlasProjects } from '@/services/atlas/client'
import { cn } from '@/lib/utils'

/**
 * PM-only Atlas API configuration. The env vars set in `.env` are the
 * default; saving here writes a localStorage entry that wins over them.
 *
 * Includes a connection status dot (green/red/gray), a one-click silent
 * ping on mount so the dot reflects reality when the page opens, and a
 * notifyAtlasConfigChanged() call on save/reset so already-mounted Atlas
 * pages refetch with the new config.
 */
export function AtlasSection() {
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [token, setToken] = useState<string>('')
  const [reveal, setReveal] = useState(false)
  const [source, setSource] = useState<AtlasConfigSource>(() =>
    getAtlasConfigSource(),
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [pinging, setPinging] = useState<boolean>(false)
  const pingedConfig = useRef<string | null>(null)

  // Hydrate inputs + source labels from the resolved config on mount.
  useEffect(() => {
    const cfg = getAtlasConfig()
    setBaseUrl(cfg.baseUrl)
    setToken(cfg.token)
    setSource(getAtlasConfigSource())
  }, [])

  // Silent connection ping on mount (and whenever the saved config changes),
  // so the status dot reflects reality without the user clicking Test. We
  // dedupe by the resolved (baseUrl, token) tuple so opening Settings twice
  // in the same browser tab doesn't double-fetch.
  useEffect(() => {
    if (!isAtlasConfigured()) return
    const cfg = getAtlasConfig()
    const fingerprint = `${cfg.baseUrl}::${cfg.token}`
    if (pingedConfig.current === fingerprint) return
    pingedConfig.current = fingerprint
    let cancelled = false
    setPinging(true)
    fetchAtlasProjects()
      .then((projects) => {
        if (cancelled) return
        setTestResult({
          ok: true,
          message: `Connected — saw ${projects.length} project${projects.length === 1 ? '' : 's'}.`,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setTestResult(testResultFromError(err))
      })
      .finally(() => {
        if (!cancelled) setPinging(false)
      })
    return () => {
      cancelled = true
    }
    // Run when the saved baseUrl/token actually change (handleSave / handleReset).
  }, [source.baseUrl, source.token])

  const handleSave = () => {
    setAtlasOverride({ baseUrl: baseUrl.trim(), token: token.trim() })
    setSource(getAtlasConfigSource())
    notifyAtlasConfigChanged()
    // Force the silent ping to re-run with the new values.
    pingedConfig.current = null
    toast.success('API configuration saved.')
  }

  const handleReset = () => {
    clearAtlasOverride()
    const cfg = getAtlasConfig()
    setBaseUrl(cfg.baseUrl)
    setToken(cfg.token)
    setSource(getAtlasConfigSource())
    setTestResult(null)
    pingedConfig.current = null
    notifyAtlasConfigChanged()
    toast.success('Reverted to env defaults.')
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // Persist first so the request uses the latest inputs.
    setAtlasOverride({ baseUrl: baseUrl.trim(), token: token.trim() })
    setSource(getAtlasConfigSource())
    notifyAtlasConfigChanged()
    try {
      const projects = await fetchAtlasProjects()
      const slugs = projects.slice(0, 8).map((p) => p.slug).join(', ')
      const more = projects.length > 8 ? ` (+${projects.length - 8} more)` : ''
      setTestResult({
        ok: true,
        message: `Connected! Found ${projects.length} project${projects.length === 1 ? '' : 's'}.`,
        ...(slugs ? { detail: `${slugs}${more}` } : {}),
      })
      toast.success(`Connected! Found ${projects.length} projects.`)
      pingedConfig.current = `${baseUrl.trim()}::${token.trim()}`
    } catch (err) {
      const result = testResultFromError(err)
      setTestResult(result)
      toast.error(`Connection failed: ${result.message}`)
    } finally {
      setTesting(false)
    }
  }

  const sourceLabel = useMemo(() => describeSource(source), [source])
  const canTest = baseUrl.trim().length > 0 && token.trim().length > 0
  const status = deriveStatus({ source, testResult, pinging, testing })

  return (
    <section aria-labelledby="atlas-heading">
      {/* Heading row with the status pill. The bottom border + pb/mb
          act as the divider between the section's identity (icon +
          title + description) and its body (form fields), per the
          settings card spec. */}
      <div className="border-b border-[var(--border-subtle)] pb-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="atlas-heading"
            className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Atlas API Connection
          </h2>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Enter the Atlas Control Center API URL and read token. Data from Atlas
          powers the <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">/atlas</code>{' '}
          section (feed, tasks, summaries). On the team Tailscale network, use{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">
            http://100.65.101.96:4005/api/public
          </code>{' '}
          for direct access; otherwise use the public Funnel URL.
        </p>
      </div>

      {/* Form body — no inner border. The outer SettingsCard wrapper
          on the page now provides the section container. */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor="atlas-base-url"
            className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
          >
            API Base URL
            <span className="ml-2 normal-case font-medium text-[10px] text-[var(--text-muted)]">
              from {sourceLabel.baseUrl}
            </span>
          </label>
          <input
            id="atlas-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://desktop-838pdes.taila3a424.ts.net:8443/api/public"
            spellCheck={false}
            autoComplete="off"
            className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
        </div>

        <div>
          <label
            htmlFor="atlas-token"
            className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
          >
            API Token
            <span className="ml-2 normal-case font-medium text-[10px] text-[var(--text-muted)]">
              from {sourceLabel.token}
            </span>
          </label>
          <div className="relative mt-1">
            <input
              id="atlas-token"
              type={reveal ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste READ_API_TOKEN"
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? 'Hide token' : 'Show token'}
              className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded-md"
            >
              {reveal ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            The token ships in the compiled JS — only use this on trusted
            internal deployments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !canTest}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            Test Connection
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-9 items-center justify-center px-3 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded-md"
          >
            Reset to env defaults
          </button>
        </div>

        {testResult && (
          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              testResult.ok
                ? 'border-[color-mix(in_srgb,var(--status-done)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--status-done)_8%,transparent)] text-[var(--text-primary)]'
                : 'border-[color-mix(in_srgb,var(--priority-critical)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-critical)_8%,transparent)] text-[var(--text-primary)]',
            )}
          >
            <p className="inline-flex items-center gap-1.5 font-medium">
              {testResult.ok ? (
                <CheckCircle2
                  className="h-4 w-4 text-[var(--status-done)]"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="h-4 w-4 text-[var(--priority-critical)]"
                  aria-hidden="true"
                />
              )}
              {testResult.message}
            </p>
            {testResult.detail && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {testResult.detail}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

type Status = 'connected' | 'failed' | 'unconfigured' | 'checking'

interface DeriveStatusInput {
  source: AtlasConfigSource
  testResult: TestResult | null
  pinging: boolean
  testing: boolean
}

function deriveStatus({
  source,
  testResult,
  pinging,
  testing,
}: DeriveStatusInput): Status {
  if (source.baseUrl === 'unset' || source.token === 'unset') return 'unconfigured'
  if (pinging || testing) return 'checking'
  if (testResult?.ok === true) return 'connected'
  if (testResult?.ok === false) return 'failed'
  // Configured but never tested in this session.
  return 'checking'
}

function StatusBadge({ status }: { status: Status }) {
  const label =
    status === 'connected'
      ? 'Connected'
      : status === 'failed'
        ? 'Not connected'
        : status === 'unconfigured'
          ? 'Not configured'
          : 'Checking…'

  const dotClass =
    status === 'connected'
      ? 'bg-[var(--status-done)]'
      : status === 'failed'
        ? 'bg-[var(--priority-critical)]'
        : status === 'unconfigured'
          ? 'bg-[var(--text-muted)]'
          : 'bg-[var(--accent-primary)] animate-pulse'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn('inline-block h-2 w-2 rounded-full', dotClass)}
      />
      {label}
    </span>
  )
}

interface TestResult {
  ok: boolean
  message: string
  detail?: string
}

function testResultFromError(err: unknown): TestResult {
  if (err instanceof AtlasApiError) {
    const out: TestResult = { ok: false, message: err.message }
    if (err.detail !== undefined) out.detail = err.detail
    return out
  }
  return {
    ok: false,
    message: err instanceof Error ? err.message : 'Unknown error.',
  }
}

function describeSource(source: AtlasConfigSource): {
  baseUrl: string
  token: string
} {
  const label = (s: 'env' | 'override' | 'unset') =>
    s === 'override' ? 'browser override' : s === 'env' ? '.env' : 'unset'
  return {
    baseUrl: label(source.baseUrl),
    token: label(source.token),
  }
}

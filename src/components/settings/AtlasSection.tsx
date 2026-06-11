import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearAtlasOverride,
  getAtlasConfig,
  getAtlasConfigSource,
  setAtlasOverride,
  type AtlasConfigSource,
} from '@/services/atlas/config'
import { AtlasApiError, fetchAtlasProjects } from '@/services/atlas/client'
import { cn } from '@/lib/utils'

/**
 * Per-browser override for the Atlas base URL + token. The env vars set in
 * `.env` are the default; saving here writes a localStorage entry that wins
 * over them. Clearing falls back to env defaults.
 *
 * The "Test connection" button hits `/projects` (cheap, authenticated) and
 * reports the result — handy for verifying CORS and the token without
 * leaving the page.
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

  useEffect(() => {
    const cfg = getAtlasConfig()
    setBaseUrl(cfg.baseUrl)
    setToken(cfg.token)
    setSource(getAtlasConfigSource())
  }, [])

  const handleSave = () => {
    setAtlasOverride({ baseUrl: baseUrl.trim(), token: token.trim() })
    setSource(getAtlasConfigSource())
    toast.success('Atlas settings saved.')
  }

  const handleReset = () => {
    clearAtlasOverride()
    const cfg = getAtlasConfig()
    setBaseUrl(cfg.baseUrl)
    setToken(cfg.token)
    setSource(getAtlasConfigSource())
    setTestResult(null)
    toast.success('Reverted to env defaults.')
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // Save first so the client picks up the latest values from the override.
    setAtlasOverride({ baseUrl: baseUrl.trim(), token: token.trim() })
    setSource(getAtlasConfigSource())
    try {
      const projects = await fetchAtlasProjects()
      setTestResult({
        ok: true,
        message: `Reached Atlas — saw ${projects.length} project${projects.length === 1 ? '' : 's'}.`,
      })
    } catch (err) {
      if (err instanceof AtlasApiError) {
        setTestResult({
          ok: false,
          message: err.message,
          ...(err.detail ? { detail: err.detail } : {}),
        })
      } else {
        setTestResult({
          ok: false,
          message: err instanceof Error ? err.message : 'Unknown error.',
        })
      }
    } finally {
      setTesting(false)
    }
  }

  const sourceLabel = useMemo(
    () => describeSource(source),
    [source],
  )

  const canTest = baseUrl.trim().length > 0 && token.trim().length > 0

  return (
    <section aria-labelledby="atlas-heading">
      <h2
        id="atlas-heading"
        className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Atlas Integration
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Connects the app to a read-only Atlas Control Center vault. The values
        below override anything set via{' '}
        <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">
          .env
        </code>
        . Override is local to this browser.
      </p>

      <div className="mt-5 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div>
          <label
            htmlFor="atlas-base-url"
            className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            Base URL
            <span className="ml-2 normal-case font-medium text-[10px] text-[var(--text-muted)]">
              from {sourceLabel.baseUrl}
            </span>
          </label>
          <input
            id="atlas-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:4005/api/public"
            spellCheck={false}
            autoComplete="off"
            className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
        </div>

        <div>
          <label
            htmlFor="atlas-token"
            className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            Read API token
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
            Save override
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
            Test connection
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

interface TestResult {
  ok: boolean
  message: string
  detail?: string
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

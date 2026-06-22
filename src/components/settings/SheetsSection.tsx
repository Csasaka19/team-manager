import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import {
  getSheetsConfig,
  isGoogleSheetsConfigured,
} from '@/services/google-sheets-config'
import {
  fetchSpreadsheetMetadata,
  GoogleSheetsApiError,
} from '@/services/google-sheets-api'
import {
  clearRefreshTokenOverride,
  getRefreshTelemetry,
  getTokenExpiry,
  hasRefreshTokenOverride,
  readRefreshTokenOverride,
  refreshAccessToken,
  GoogleSheetsAuthError,
} from '@/services/google-sheets-auth'
import {
  clearAllColumnOverrides,
  getColumnOverridesForTab,
  setColumnOverride,
  type ColumnMap,
  type TabDiagnostics,
} from '@/services/sheets-mapper'
import { cn } from '@/lib/utils'

/**
 * PM-only Google Sheets configuration panel.
 *
 * Renders six things in order:
 *   1. Connection status badge (green/red/gray dot)
 *   2. Env-var configuration readout (masked)
 *   3. Tracked-tabs list from sheets-config.json
 *   4. Test connection + Refresh-now buttons
 *   5. Per-tab diagnostics (collapsible, auto-expands after Test)
 *   6. Column override panel (advanced, collapsed by default)
 *   7. Source-to-pages mini-table
 */

type Status = 'connected' | 'error' | 'unconfigured'

const FIELD_LABELS: Record<keyof ColumnMap, string> = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  dueDate: 'Due date',
  description: 'Description',
  project: 'Project',
  category: 'Category',
  id: 'ID',
  createdDate: 'Created date',
  tags: 'Tags',
}

/** Fields shown in the override UI — the rest are rarely useful to pin. */
const OVERRIDABLE_FIELDS: Array<keyof ColumnMap> = [
  'title',
  'status',
  'priority',
  'assignee',
  'dueDate',
  'description',
]

export function SheetsSection() {
  const {
    sheetsConnected,
    sheetsDiagnostics,
    syncError,
    refreshFromSheets,
    isRefreshing,
    tasks,
  } = useData()

  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
    detail?: string
  } | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)

  const configured = isGoogleSheetsConfigured()
  const status: Status = !configured
    ? 'unconfigured'
    : sheetsConnected
      ? 'connected'
      : 'error'

  const envDisplay = useMemo(() => readEnvDisplay(), [])
  const sheets = useMemo(() => getSheetsConfig(), [])
  const primarySheet = sheets[0]

  // Task counts per sheet tab for the source-to-pages mini-table.
  const tabTaskCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!sheetsDiagnostics) return counts
    for (const d of sheetsDiagnostics) {
      counts.set(d.tabSlug, d.mappedTasks)
    }
    return counts
  }, [sheetsDiagnostics])

  const handleTest = async () => {
    if (!configured) return
    setTesting(true)
    setTestResult(null)
    try {
      await refreshAccessToken()
      if (!primarySheet) {
        throw new Error('No spreadsheet configured in sheets-config.json.')
      }
      const meta = await fetchSpreadsheetMetadata(primarySheet.id)
      const message = `Connected to spreadsheet: ${meta.title}. Found ${meta.sheets.length} tab${meta.sheets.length === 1 ? '' : 's'}.`
      setTestResult({
        ok: true,
        message,
        detail: meta.sheets.slice(0, 8).join(', ') +
          (meta.sheets.length > 8 ? ` (+${meta.sheets.length - 8} more)` : ''),
      })
      toast.success(message)
      setDiagnosticsOpen(true)
    } catch (err) {
      const msg = errorMessage(err)
      setTestResult({ ok: false, message: msg })
      toast.error(`Connection failed: ${msg}`)
    } finally {
      setTesting(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshFromSheets()
      // Tasks count is post-merge; better to surface the per-tab numbers
      // from the diagnostics that just got refreshed.
      const fresh = (sheetsDiagnostics ?? []).reduce(
        (sum, d) => sum + d.mappedTasks,
        0,
      )
      toast.success(
        `Refreshed! ${fresh || tasks.length} tasks from ${
          (sheetsDiagnostics ?? []).length
        } tabs.`,
      )
      setDiagnosticsOpen(true)
    } catch (err) {
      toast.error(`Refresh failed: ${errorMessage(err)}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section aria-labelledby="sheets-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="sheets-heading"
          className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Google Sheets — Contracting.com
        </h2>
        <StatusBadge status={status} configured={configured} />
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Reads the 2026 Project Management spreadsheet and maps tracked tabs
        into the Contracting.com project. Configuration is read-only —
        credentials live in <code className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px]">.env</code>.
      </p>

      <div className="mt-5 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <CredentialReadout env={envDisplay} />
        <TokenStatus />
        <TrackedTabsList />

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={!configured || testing}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            Test Connection
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!configured || refreshing || isRefreshing}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing || isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh Now
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

        {sheetsConnected && syncError && (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--priority-medium)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-medium)_8%,transparent)] p-3 text-sm">
            <p className="inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle
                className="h-4 w-4 text-[var(--priority-medium)]"
                aria-hidden="true"
              />
              Partial sync
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{syncError}</p>
          </div>
        )}
      </div>

      <DiagnosticsPanel
        open={diagnosticsOpen}
        onToggle={() => setDiagnosticsOpen((p) => !p)}
        diagnostics={sheetsDiagnostics}
      />
      <OverridePanel
        open={overridesOpen}
        onToggle={() => setOverridesOpen((p) => !p)}
        diagnostics={sheetsDiagnostics}
        onAfterChange={handleRefresh}
      />
      <SourcePagesTable
        diagnostics={sheetsDiagnostics}
        tabTaskCounts={tabTaskCounts}
      />
    </section>
  )
}

// ── Status badge ────────────────────────────────────────────────────────

function StatusBadge({ status, configured }: { status: Status; configured: boolean }) {
  const label =
    status === 'connected'
      ? 'Connected'
      : status === 'error'
        ? 'Error'
        : configured
          ? 'Connecting…'
          : 'Not configured'
  const dot =
    status === 'connected'
      ? 'bg-[var(--status-done)]'
      : status === 'error'
        ? 'bg-[var(--priority-critical)]'
        : 'bg-[var(--text-muted)]'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dot)} />
      {label}
    </span>
  )
}

// ── Credential readout ──────────────────────────────────────────────────

interface EnvDisplay {
  spreadsheetIdMasked: string
  clientIdSet: boolean
  clientSecretSet: boolean
  refreshTokenSet: boolean
}

function readEnvDisplay(): EnvDisplay {
  const id = readEnv('VITE_GOOGLE_SHEETS_SPREADSHEET_ID')
  return {
    spreadsheetIdMasked: id ? `${id.slice(0, 8)}…` : 'Not set',
    clientIdSet: Boolean(readEnv('VITE_GOOGLE_SHEETS_CLIENT_ID')),
    clientSecretSet: Boolean(readEnv('VITE_GOOGLE_SHEETS_CLIENT_SECRET')),
    refreshTokenSet: Boolean(readEnv('VITE_GOOGLE_SHEETS_REFRESH_TOKEN')),
  }
}

function readEnv(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

// ── Token status ────────────────────────────────────────────────────────

function TokenStatus() {
  // Auth telemetry isn't reactive — poll every 3s while mounted. Cheap.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 3000)
    return () => window.clearInterval(id)
  }, [])
  void tick

  const telemetry = getRefreshTelemetry()
  const expiry = getTokenExpiry()
  const hasOverride = hasRefreshTokenOverride()

  const refreshStatus: 'active' | 'invalid' | 'overridden' | 'idle' = (() => {
    if (hasOverride) return 'overridden'
    if (telemetry.lastOutcome === 'invalid_grant') return 'invalid'
    if (telemetry.lastOutcome === 'success') return 'active'
    return 'idle'
  })()

  const accessMinutesLeft = expiry
    ? Math.max(0, Math.round((expiry.getTime() - Date.now()) / 60_000))
    : null

  const handleCopyToken = async () => {
    const token = readRefreshTokenOverride()
    if (!token) {
      toast.error('No override token to copy.')
      return
    }
    try {
      await navigator.clipboard.writeText(token)
      toast.success('New refresh token copied to clipboard.')
    } catch {
      toast.error('Clipboard unavailable — open devtools and read it manually.')
    }
  }

  const handleClearOverride = () => {
    clearRefreshTokenOverride()
    toast.success(
      'Override cleared. The next refresh will use the env-var token.',
    )
    setTick((n) => n + 1)
  }

  return (
    <div className="border-t border-[var(--border-subtle)] pt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Token status
      </h3>
      <dl className="mt-2 space-y-2 text-sm">
        <RefreshTokenRow status={refreshStatus} telemetry={telemetry} />
        <Row
          label="Access token"
          value={
            accessMinutesLeft === null ? (
              <span className="text-[var(--text-muted)]">
                Expired — will refresh on next request
              </span>
            ) : (
              <span className="text-[var(--text-primary)]">
                Valid for {accessMinutesLeft} minute
                {accessMinutesLeft === 1 ? '' : 's'}
              </span>
            )
          }
        />
        <Row
          label="Last token refresh"
          value={
            telemetry.lastSuccessAt ? (
              <span className="text-[var(--text-primary)] tabular-nums">
                {telemetry.lastSuccessAt.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">never</span>
            )
          }
        />
      </dl>

      {refreshStatus === 'invalid' && (
        <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--priority-critical)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-critical)_8%,transparent)] p-3 text-xs">
          <p className="font-medium text-[var(--text-primary)]">
            Refresh token revoked
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            Run{' '}
            <code className="font-mono">pnpm setup-google-auth</code> with the
            Firebrake account to generate a new token, then update{' '}
            <code className="font-mono">.env</code> and redeploy.
          </p>
        </div>
      )}

      {refreshStatus === 'overridden' && (
        <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--priority-medium)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-medium)_8%,transparent)] p-3 text-xs">
          <p className="font-medium text-[var(--text-primary)]">
            Google issued a new refresh token
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            We stored it as a browser override so the app keeps working.
            Update your <code className="font-mono">.env</code> and Railway
            vars with the new value, then clear this override.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyToken}
              className="inline-flex h-7 items-center rounded-md border border-[var(--border-default)] bg-transparent px-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Copy new token
            </button>
            <button
              type="button"
              onClick={handleClearOverride}
              className="inline-flex h-7 items-center rounded-md border border-[var(--border-default)] bg-transparent px-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Clear override
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RefreshTokenRow({
  status,
  telemetry,
}: {
  status: 'active' | 'invalid' | 'overridden' | 'idle'
  telemetry: { lastError: string | null }
}) {
  if (status === 'active') {
    return (
      <Row
        label="Refresh token"
        value={
          <span className="inline-flex items-center gap-1 text-[var(--status-done)]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Active ✓
          </span>
        }
      />
    )
  }
  if (status === 'invalid') {
    return (
      <Row
        label="Refresh token"
        value={
          <span
            className="inline-flex items-center gap-1 text-[var(--priority-critical)]"
            title={telemetry.lastError ?? undefined}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Invalid ✗
          </span>
        }
      />
    )
  }
  if (status === 'overridden') {
    return (
      <Row
        label="Refresh token"
        value={
          <span className="inline-flex items-center gap-1 text-[var(--priority-medium)]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Overridden ⟳
          </span>
        }
      />
    )
  }
  return (
    <Row
      label="Refresh token"
      value={
        <span className="text-[var(--text-muted)]">Awaiting first refresh</span>
      }
    />
  )
}

function CredentialReadout({ env }: { env: EnvDisplay }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Credentials
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
        <Row
          label="Spreadsheet ID"
          value={
            <code className="font-mono text-[12px] text-[var(--text-primary)]">
              {env.spreadsheetIdMasked}
            </code>
          }
        />
        <Row
          label="Client ID"
          value={
            <StatusPill ok={env.clientIdSet} okLabel="Configured" badLabel="Not set" />
          }
        />
        <Row
          label="Refresh Token"
          value={
            <StatusPill
              ok={env.refreshTokenSet}
              okLabel="Configured"
              badLabel="Not set"
            />
          }
        />
        <Row
          label="Client Secret"
          value={
            <StatusPill
              ok={env.clientSecretSet}
              okLabel="Configured"
              badLabel="Not set"
            />
          }
        />
      </dl>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Credentials are loaded from environment variables (<code className="font-mono">.env</code>{' '}
        file). Edit the file and restart the dev server to change them.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean
  okLabel: string
  badLabel: string
}) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--status-done)]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {okLabel} ✓
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--priority-critical)]">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      {badLabel} ✗
    </span>
  )
}

// ── Tracked tabs ────────────────────────────────────────────────────────

function TrackedTabsList() {
  const sheets = useMemo(() => getSheetsConfig(), [])
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Tabs
      </h3>
      <div className="mt-2 space-y-3">
        {sheets.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            No sheets defined in <code className="font-mono">sheets-config.json</code>.
          </p>
        ) : (
          sheets.map((s) => (
            <div key={s.id}>
              <p className="text-xs font-medium text-[var(--text-primary)]">
                {s.label}{' '}
                <span className="text-[var(--text-muted)]">({s.name})</span>
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {s.tabs.map((t) => (
                  <li
                    key={`${s.id}-${t.slug}`}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
                      t.track
                        ? 'bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] text-[var(--status-done)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
                    )}
                    title={`slug: ${t.slug}`}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        t.track
                          ? 'bg-[var(--status-done)]'
                          : 'bg-[var(--text-muted)]',
                      )}
                    />
                    {t.name}
                    <span className="text-[10px] opacity-70">
                      {t.track ? 'Tracked' : 'Not tracked'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Only tracked tabs are fetched and rendered. Flip{' '}
        <code className="font-mono">track: true</code> in{' '}
        <code className="font-mono">sheets-config.json</code> to add more.
      </p>
    </div>
  )
}

// ── Diagnostics panel ───────────────────────────────────────────────────

function DiagnosticsPanel({
  open,
  onToggle,
  diagnostics,
}: {
  open: boolean
  onToggle: () => void
  diagnostics: TabDiagnostics[] | null
}) {
  return (
    <Collapsible
      open={open}
      onToggle={onToggle}
      title="Data diagnostics"
      subtitle="Per-tab column mapping + sample task"
    >
      {!diagnostics || diagnostics.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No diagnostics yet — run Test Connection or Refresh Now.
        </p>
      ) : (
        <div className="space-y-4">
          {diagnostics.map((d) => (
            <DiagnosticCard key={d.tabSlug} d={d} />
          ))}
        </div>
      )}
    </Collapsible>
  )
}

function DiagnosticCard({ d }: { d: TabDiagnostics }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <h4 className="text-sm font-medium text-[var(--text-primary)]">
        {d.tabName}{' '}
        <span className="text-[11px] font-normal text-[var(--text-muted)]">
          ({d.tabSlug})
        </span>
      </h4>
      <p className="mt-1 text-[11px] tabular-nums text-[var(--text-secondary)]">
        {d.totalRows} rows total · {d.mappedTasks} mapped · {d.skippedRows} skipped
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Header row ({d.headerRow.length} columns)
        </summary>
        <p className="mt-1 break-words font-mono text-[11px] text-[var(--text-muted)]">
          [{d.headerRow.join(', ')}]
        </p>
      </details>

      <div className="mt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          Column mapping
        </p>
        <ul className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-[11px] md:grid-cols-2">
          {(Object.keys(FIELD_LABELS) as Array<keyof ColumnMap>).map((field) => {
            const idx = d.columnMap[field]
            return (
              <li
                key={field}
                className="flex items-center justify-between gap-2 font-mono"
              >
                <span className="text-[var(--text-secondary)]">{field}</span>
                <span
                  className={cn(
                    'truncate',
                    idx === null
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--text-primary)]',
                  )}
                >
                  {idx === null
                    ? '∅'
                    : `col ${idx} — "${d.headerRow[idx] ?? ''}"`}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {d.unmappedColumns.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
            Unmapped columns ({d.unmappedColumns.length})
          </p>
          <p className="mt-1 break-words font-mono text-[11px] text-[var(--text-muted)]">
            [{d.unmappedColumns.join(', ')}]
          </p>
        </div>
      )}

      {d.sampleTask && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
            Sample task
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-primary)]">
            “{d.sampleTask.title}”
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            status: {d.sampleTask.status} · priority: {d.sampleTask.priority}
            {d.sampleTask.assigneeId
              ? ` · assignee: ${d.sampleTask.assigneeId}`
              : ' · unassigned'}
            {d.sampleTask.tags.length
              ? ` · tags: ${d.sampleTask.tags.join(', ')}`
              : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Override panel ──────────────────────────────────────────────────────

function OverridePanel({
  open,
  onToggle,
  diagnostics,
  onAfterChange,
}: {
  open: boolean
  onToggle: () => void
  diagnostics: TabDiagnostics[] | null
  /** Called after a successful save — we kick a sheets refresh so the
   *  override applies without a page reload. */
  onAfterChange: () => Promise<void> | void
}) {
  return (
    <Collapsible
      open={open}
      onToggle={onToggle}
      title="Column overrides (advanced)"
      subtitle="Force a specific column when auto-detection picks the wrong one"
    >
      {!diagnostics || diagnostics.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Run Test Connection or Refresh Now first — overrides need the
          discovered headers to populate the dropdowns.
        </p>
      ) : (
        <div className="space-y-4">
          {diagnostics.map((d) => (
            <OverrideCard
              key={d.tabSlug}
              d={d}
              onAfterChange={onAfterChange}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              clearAllColumnOverrides()
              void onAfterChange()
            }}
            className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            Reset all to auto-detect
          </button>
        </div>
      )}
    </Collapsible>
  )
}

function OverrideCard({
  d,
  onAfterChange,
}: {
  d: TabDiagnostics
  onAfterChange: () => Promise<void> | void
}) {
  const stored = useMemo(() => getColumnOverridesForTab(d.tabSlug), [d.tabSlug])
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const f of OVERRIDABLE_FIELDS) {
      const override = stored[f]
      const idx = override !== undefined ? override : d.columnMap[f]
      o[f] = idx === null ? '' : String(idx)
    }
    return o
  })

  const handleChange = (field: keyof ColumnMap, raw: string) => {
    const idx = raw === '' ? null : Number(raw)
    setDraft((prev) => ({ ...prev, [field]: raw }))
    setColumnOverride(d.tabSlug, field, idx)
    void onAfterChange()
  }

  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <h4 className="text-sm font-medium text-[var(--text-primary)]">
        {d.tabName}
      </h4>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {OVERRIDABLE_FIELDS.map((field) => (
          <div key={field}>
            <label
              htmlFor={`override-${d.tabSlug}-${field}`}
              className="block text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              {FIELD_LABELS[field]}
              {field in stored && (
                <span className="ml-1 normal-case text-[10px] font-normal text-[var(--accent-primary)]">
                  · overridden
                </span>
              )}
            </label>
            <select
              id={`override-${d.tabSlug}-${field}`}
              value={draft[field] ?? ''}
              onChange={(e) => handleChange(field, e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <option value="">— Not mapped —</option>
              {d.headerRow.map((h, i) => (
                <option key={i} value={String(i)}>
                  col {i} — {h || `(blank ${i})`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Source-to-pages mini-table ──────────────────────────────────────────

function SourcePagesTable({
  diagnostics,
  tabTaskCounts,
}: {
  diagnostics: TabDiagnostics[] | null
  tabTaskCounts: Map<string, number>
}) {
  // Static page-mapping copy per the spec. Same target pages for both
  // tabs since they merge into the same Contracting.com project.
  const SHEET_PAGES = [
    'Board',
    'My Tasks',
    'Task Detail',
    'Dashboard',
    'Team',
  ]
  // If we have diagnostics, render one row per tab. Otherwise, show the
  // configured tabs (from the JSON) as placeholders.
  const rows = useMemo(() => {
    if (diagnostics && diagnostics.length > 0) {
      return diagnostics.map((d) => ({
        label: `Google Sheets — ${d.tabName}`,
        count: tabTaskCounts.get(d.tabSlug) ?? d.mappedTasks,
        bug: d.tabSlug === 'dev-bugs',
        ok: true,
      }))
    }
    const cfg = getSheetsConfig()[0]
    if (!cfg) return []
    return cfg.tabs
      .filter((t) => t.track)
      .map((t) => ({
        label: `Google Sheets — ${t.name}`,
        count: 0,
        bug: t.slug === 'dev-bugs',
        ok: false,
      }))
  }, [diagnostics, tabTaskCounts])

  if (rows.length === 0) return null

  return (
    <section
      aria-labelledby="sheets-source-pages-heading"
      className="mt-6"
    >
      <h3
        id="sheets-source-pages-heading"
        className="text-lg font-semibold text-[var(--text-primary)]"
      >
        Source → Pages
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Where Sheets data lands in the rest of the app.
      </p>
      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 text-left text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Pages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <td className="px-3 py-2 align-top font-mono text-[12px] text-[var(--text-primary)]">
                  {r.label}
                </td>
                <td className="px-3 py-2 align-top text-xs">
                  {r.ok ? (
                    <span className="inline-flex items-center gap-1 text-[var(--status-done)]">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {r.count} task{r.count === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-[var(--text-muted)]">Not loaded</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-xs text-[var(--text-secondary)]">
                  Contracting.com project
                  {r.bug && (
                    <span className="ml-1 inline-flex h-4 items-center rounded-full bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] px-1.5 text-[9px] font-semibold uppercase text-[var(--priority-medium)]">
                      tagged bug
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <ul className="flex flex-wrap gap-1.5">
                    {SHEET_PAGES.map((p) => (
                      <li
                        key={p}
                        className="inline-flex h-5 items-center rounded-full bg-[var(--bg-elevated)] px-2 text-[10px] text-[var(--text-secondary)]"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Collapsible primitive ──────────────────────────────────────────────

function Collapsible({
  open,
  onToggle,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>
        </div>
        {open ? (
          <ChevronDown
            className="h-4 w-4 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border-subtle)] p-4 md:p-5">
          {children}
        </div>
      )}
    </section>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof GoogleSheetsApiError) return err.message
  if (err instanceof GoogleSheetsAuthError) return err.message
  return err instanceof Error ? err.message : String(err)
}

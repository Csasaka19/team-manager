import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { homePathForRole, useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'

interface LocationState {
  from?: string
}

export default function LoginPage() {
  useDocumentTitle('Login')
  const { isAuthenticated, currentUser, login, loginByMember } = useAuth()
  const { dataSource, teamMembers, isInitialLoading } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as LocationState | null) ?? null

  // Already logged in → bounce to the appropriate home.
  if (isAuthenticated && currentUser) {
    const target =
      fromState?.from && fromState.from !== '/login'
        ? fromState.from
        : homePathForRole(currentUser.role)
    return <Navigate to={target} replace />
  }

  const goAfterLogin = (role: 'pm' | 'member') => {
    const target =
      fromState?.from && fromState.from !== '/login'
        ? fromState.from
        : homePathForRole(role)
    navigate(target, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
            Team Manager
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Sign in to your workspace
          </p>
        </div>

        {dataSource === 'atlas' ? (
          <AtlasLogin
            members={teamMembers}
            loadingTeam={isInitialLoading}
            onSelect={(member) => {
              const result = loginByMember(member)
              if (result.ok && result.user) goAfterLogin(result.user.role)
            }}
          />
        ) : (
          <MockLogin
            onSuccess={(role) => goAfterLogin(role)}
            login={login}
          />
        )}
      </div>
    </div>
  )
}

// ── Mock-mode (email + password) ────────────────────────────────────────

interface MockLoginProps {
  onSuccess: (role: 'pm' | 'member') => void
  login: ReturnType<typeof useAuth>['login']
}

function MockLogin({ onSuccess, login }: MockLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setError(null)
  }, [email, password])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await login(email, password)
    setSubmitting(false)
    if (!result.ok || !result.user) {
      setError('Invalid email or password')
      return
    }
    onSuccess(result.user.role)
  }

  const hasError = error !== null
  const errorId = 'login-error'

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
        noValidate
      >
        <div className="space-y-4">
          <Field
            id="email"
            type="email"
            label="Email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
            disabled={submitting}
            invalid={hasError}
            describedBy={hasError ? errorId : undefined}
          />
          <Field
            id="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            disabled={submitting}
            invalid={hasError}
            describedBy={hasError ? errorId : undefined}
          />

          {hasError && (
            <p
              id={errorId}
              role="alert"
              className="text-sm text-[var(--destructive)]"
            >
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Log in'
          )}
        </button>
      </form>

      <div className="mt-4 rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 p-3 text-xs text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">Demo accounts</p>
        <p className="mt-1 font-mono">
          pm@team.com · demo1234
          <br />
          member@team.com · demo1234
        </p>
      </div>
    </>
  )
}

// ── Atlas-mode (passwordless dropdown) ──────────────────────────────────

interface AtlasLoginProps {
  members: ReturnType<typeof useData>['teamMembers']
  loadingTeam: boolean
  onSelect: (member: AtlasLoginProps['members'][number]) => void
}

function AtlasLogin({ members, loadingTeam, onSelect }: AtlasLoginProps) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        // PMs first, then alphabetical.
        if (a.role !== b.role) return a.role === 'pm' ? -1 : 1
        return a.name.localeCompare(b.name)
      }),
    [members],
  )

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const member = sorted.find((m) => m.id === selectedId)
    if (!member) return
    setSubmitting(true)
    onSelect(member)
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
      >
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.5px] text-[var(--accent-primary)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Atlas / Tailscale
        </p>
        <h2 className="mt-1 text-base font-medium text-[var(--text-primary)]">
          Select your name
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Internal tool on the team tailnet — no password required.
        </p>

        <label
          htmlFor="atlas-login-member"
          className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          Team member
        </label>
        {loadingTeam && sorted.length === 0 ? (
          <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading team from Atlas…
          </div>
        ) : (
          <select
            id="atlas-login-member"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            required
            disabled={submitting}
            className="mt-1 h-10 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="" disabled>
              {sorted.length === 0
                ? 'No team members yet'
                : 'Choose your name…'}
            </option>
            {sorted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.role === 'pm' ? '· PM' : ''}
              </option>
            ))}
          </select>
        )}

        {selectedId && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-3">
            {(() => {
              const m = sorted.find((x) => x.id === selectedId)
              if (!m) return null
              return (
                <>
                  <Avatar name={m.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {m.name}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      Signing in as {m.role === 'pm' ? 'PM' : 'team member'}
                    </p>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedId || submitting || loadingTeam}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Continue'
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] text-[var(--text-muted)]">
        Atlas integration is active. To switch back to the demo accounts,
        clear the API token in Settings → Atlas API Connection.
      </p>
    </>
  )
}

// ── Shared field ────────────────────────────────────────────────────────

interface FieldProps {
  id: string
  type: 'email' | 'password' | 'text'
  label: string
  value: string
  onChange: (next: string) => void
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

function Field({
  id,
  type,
  label,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  invalid = false,
  describedBy,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 w-full rounded-md border bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'focus:outline-none focus:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid
            ? 'border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive)]/25'
            : 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:ring-[var(--accent-focus)]',
        )}
      />
    </div>
  )
}

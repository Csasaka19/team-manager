import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { homePathForRole, useAuth } from '@/data/auth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'

interface LocationState {
  from?: string
}

export default function LoginPage() {
  useDocumentTitle('Login')
  const { isAuthenticated, currentUser, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as LocationState | null) ?? null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Clear the error as soon as the user edits either field.
  useEffect(() => {
    setError(null)
  }, [email, password])

  // Already logged in → bounce to the appropriate home.
  if (isAuthenticated && currentUser) {
    const target =
      fromState?.from && fromState.from !== '/login'
        ? fromState.from
        : homePathForRole(currentUser.role)
    return <Navigate to={target} replace />
  }

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
    const target =
      fromState?.from && fromState.from !== '/login'
        ? fromState.from
        : homePathForRole(result.user.role)
    navigate(target, { replace: true })
  }

  const hasError = error !== null
  const errorId = 'login-error'

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
      </div>
    </div>
  )
}

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

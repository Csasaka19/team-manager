import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { homePathForRole, useAuth } from '@/data/auth'

export default function NotFoundPage() {
  const { currentUser } = useAuth()
  const homePath = currentUser ? homePathForRole(currentUser.role) : '/login'
  const homeLabel = currentUser
    ? currentUser.role === 'pm'
      ? 'Go to dashboard'
      : 'Go to my tasks'
    : 'Go to login'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Compass
        className="h-12 w-12 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="mt-4 font-mono text-xs uppercase tracking-[0.5px] text-[var(--text-muted)]">
        Error 404
      </p>
      <h1 className="mt-1 text-base font-medium text-[var(--text-secondary)]">
        Page not found.
      </h1>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        It may have been deleted or moved.
      </p>
      <Link
        to={homePath}
        className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        {homeLabel}
      </Link>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Role } from '@/data/types'

interface InviteMemberModalProps {
  open: boolean
  existingEmails: string[]
  onClose: () => void
  onSubmit: (input: { name: string; email: string; role: Role }) => Promise<void>
}

export function InviteMemberModal({
  open,
  existingEmails,
  onClose,
  onSubmit,
}: InviteMemberModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setEmail('')
    setRole('member')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email.')
      return
    }
    if (existingEmails.some((e) => e.toLowerCase() === trimmedEmail)) {
      setError('Someone with that email is already in the workspace.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name: trimmedName, email: trimmedEmail, role })
    } catch {
      setError('Could not send the invite. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[440px] animate-[modalIn_200ms_ease-out] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <h2
            id="invite-modal-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Invite Member
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label
              htmlFor="invite-name"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Full name
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoFocus
              className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="e.g. Jordan Rivera"
            />
          </div>

          <div>
            <label
              htmlFor="invite-email"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="jordan@team.com"
            />
          </div>

          <fieldset>
            <legend className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Role
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <RoleOption
                value="member"
                current={role}
                onSelect={setRole}
                label="Member"
                description="Updates own tasks, adds comments."
              />
              <RoleOption
                value="pm"
                current={role}
                onSelect={setRole}
                label="PM"
                description="Full access to everything."
              />
            </div>
          </fieldset>

          {error && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || name.trim() === '' || email.trim() === ''}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RoleOption({
  value,
  current,
  onSelect,
  label,
  description,
}: {
  value: Role
  current: Role
  onSelect: (r: Role) => void
  label: string
  description: string
}) {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] ${
        selected
          ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[var(--border-default)]'
      }`}
    >
      <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <span className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</span>
    </button>
  )
}

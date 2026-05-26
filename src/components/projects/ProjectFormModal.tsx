import { useEffect, useState } from 'react'
import { Archive, Check, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project, TeamMember } from '@/data/types'

const PROJECT_PALETTE = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
] as const

export interface ProjectFormValues {
  name: string
  description: string
  color: string
  memberIds: string[]
}

interface ProjectFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Project
  members: TeamMember[]
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => Promise<void>
  // Edit-mode only:
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
}

export function ProjectFormModal({
  open,
  mode,
  initial,
  members,
  onClose,
  onSubmit,
  onArchive,
  onUnarchive,
  onDelete,
}: ProjectFormModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0])
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form state every time the modal opens or the project changes.
  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setColor(initial?.color ?? PROJECT_PALETTE[0])
    setMemberIds(initial?.memberIds ?? [])
    setError(null)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const archived = initial?.archived ?? false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    if (trimmed.length > 100) {
      setError('Name must be 100 characters or fewer.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim(),
        color,
        memberIds,
      })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const toggleMember = (id: string) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[520px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 id="project-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            {mode === 'create' ? 'New Project' : 'Project Settings'}
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
              htmlFor="project-name"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Name
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoFocus
              className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="e.g. Website Redesign"
            />
          </div>

          <div>
            <label
              htmlFor="project-description"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="What's this project about?"
            />
          </div>

          <fieldset>
            <legend className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Color
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROJECT_PALETTE.map((swatch) => {
                const selected = color === swatch
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-label={`Use ${swatch}`}
                    aria-pressed={selected}
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                      selected ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-surface)]' : 'hover:scale-110',
                    )}
                    style={{ backgroundColor: swatch }}
                  >
                    {selected && (
                      <Check
                        className="h-4 w-4 text-[var(--text-inverse)]"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Team
            </legend>
            <div className="mt-2 max-h-[180px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] py-1">
              {members.map((m) => {
                const checked = memberIds.includes(m.id)
                return (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(m.id)}
                      className="h-4 w-4 accent-[var(--accent-primary)]"
                    />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-[0.5px]">
                      {m.role === 'pm' ? 'PM' : 'Member'}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {error && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            {mode === 'edit' && (
              <div className="flex flex-wrap items-center gap-2">
                {archived ? (
                  <button
                    type="button"
                    onClick={onUnarchive}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    Unarchive
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onArchive}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-3 text-sm text-[var(--destructive)] transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || name.trim() === ''}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mode === 'create' ? 'Create Project' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

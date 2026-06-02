import { useEffect, useRef, useState } from 'react'
import {
  AlertOctagon,
  Calendar,
  ChevronsDown,
  ChevronsUp,
  Equal,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { DueDatePicker as SharedDueDatePicker } from '@/components/shared/DueDatePicker'
import { formatRelativeDueDate } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS,
  type Priority,
  type Project,
  type TeamMember,
} from '@/data/types'

export interface QuickCreateValues {
  title: string
  projectId: string
  priority: Priority
  assigneeId: string | null
  dueDate: string | null
}

interface QuickCreateModalProps {
  open: boolean
  projects: Project[]
  members: TeamMember[]
  /** Pre-selects (does not lock) the project field. */
  defaultProjectId?: string
  onClose: () => void
  /** `openAfter` mirrors which submit button the user pressed. */
  onSubmit: (values: QuickCreateValues, openAfter: boolean) => Promise<void>
}

const PRIORITY_ICONS: Record<Priority, LucideIcon> = {
  critical: AlertOctagon,
  high: ChevronsUp,
  medium: Equal,
  low: ChevronsDown,
}

const PRIORITY_COLOR_VAR: Record<Priority, string> = {
  critical: '--priority-critical',
  high: '--priority-high',
  medium: '--priority-medium',
  low: '--priority-low',
}

const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']

const INPUT_CLASS =
  'h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]'

/** Chip label for the picker trigger. Falls back to "No date" so the empty
 *  state still gives the user something clickable. */
function chipLabel(iso: string | null): string {
  if (!iso) return 'No date'
  return formatRelativeDueDate(iso)?.label ?? 'No date'
}

export function QuickCreateModal({
  open,
  projects,
  members,
  defaultProjectId,
  onClose,
  onSubmit,
}: QuickCreateModalProps) {
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'open' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.archived)
  const titleRef = useRef<HTMLInputElement>(null)

  // Reset form to defaults every time the modal opens.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setProjectId(defaultProjectId ?? '')
    setPriority('medium')
    setAssigneeId(null)
    setDueDate(null)
    setError(null)
    setBusy(null)
    queueMicrotask(() => titleRef.current?.focus())
  }, [open, defaultProjectId])

  // Escape closes — only attach while open so we don't fight other modals.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const submit = async (openAfter: boolean) => {
    if (busy) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required.')
      titleRef.current?.focus()
      return
    }
    if (trimmedTitle.length > 200) {
      setError('Title must be 200 characters or fewer.')
      return
    }
    if (!projectId) {
      setError('Pick a project.')
      return
    }
    setBusy(openAfter ? 'open' : 'create')
    setError(null)
    try {
      await onSubmit(
        {
          title: trimmedTitle,
          projectId,
          priority,
          assigneeId,
          dueDate,
        },
        openAfter,
      )
    } catch {
      setError('Could not create the task. Please try again.')
      setBusy(null)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submit(false)
  }

  const assignee = assigneeId ? members.find((m) => m.id === assigneeId) ?? null : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-create-title"
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-[480px] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <h2
            id="quick-create-title"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            Quick create
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-3 px-5 py-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            aria-label="Task title"
            required
            maxLength={200}
            className={cn(INPUT_CLASS, 'text-[15px]')}
          />

          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
            required
            className={INPUT_CLASS}
          >
            <option value="" disabled>
              {activeProjects.length === 0 ? 'No active projects' : 'Select project…'}
            </option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            <PriorityPicker value={priority} onChange={setPriority} />
            <AssigneePicker
              members={members}
              value={assignee}
              onChange={setAssigneeId}
            />
            <DueDatePicker value={dueDate} onChange={setDueDate} />
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={busy !== null || !title.trim() || !projectId}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'open' ? 'Creating…' : 'Create & Open'}
            </button>
            <button
              type="submit"
              disabled={busy !== null || !title.trim() || !projectId}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'create' ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority
  onChange: (next: Priority) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Priority"
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5"
    >
      {PRIORITY_ORDER.map((p) => {
        const Icon = PRIORITY_ICONS[p]
        const selected = value === p
        const colorVar = PRIORITY_COLOR_VAR[p]
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p)}
            title={PRIORITY_LABELS[p]}
            aria-label={`Priority: ${PRIORITY_LABELS[p]}`}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
              selected
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
            style={
              selected
                ? {
                    backgroundColor: `color-mix(in srgb, var(${colorVar}) 18%, transparent)`,
                    color: `var(${colorVar})`,
                  }
                : undefined
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

function AssigneePicker({
  members,
  value,
  onChange,
}: {
  members: TeamMember[]
  value: TeamMember | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value ? `Assigned to ${value.name}` : 'Unassigned — click to assign'}
        aria-label={value ? `Assigned to ${value.name}` : 'Assign someone'}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        {value ? (
          <>
            <Avatar name={value.name} size="xs" />
            <span className="hidden sm:inline">{value.name.split(' ')[0]}</span>
          </>
        ) : (
          <>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Unassigned</span>
          </>
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Assignee"
          className="absolute left-0 top-full z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[10px] text-[var(--text-muted)]">
                —
              </span>
              Unassigned
            </button>
          </li>
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === m.id}
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
              >
                <Avatar name={m.name} size="xs" />
                <span className="truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DueDatePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value ? `Due ${chipLabel(value)}` : 'Set due date'}
        aria-label={value ? `Due date: ${chipLabel(value)}` : 'Set due date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{chipLabel(value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Due date"
          className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <SharedDueDatePicker
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}


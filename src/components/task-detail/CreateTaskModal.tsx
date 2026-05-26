import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Priority,
  type Project,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

export interface CreateTaskValues {
  projectId: string
  title: string
  description: string
  assigneeId: string | null
  priority: Priority
  status: TaskStatus
  dueDate: string | null
}

interface CreateTaskModalProps {
  open: boolean
  projects: Project[]
  members: TeamMember[]
  /** When provided, the project field is pre-selected and locked. */
  defaultProjectId?: string
  onClose: () => void
  onSubmit: (values: CreateTaskValues) => Promise<void>
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]'

export function CreateTaskModal({
  open,
  projects,
  members,
  defaultProjectId,
  onClose,
  onSubmit,
}: CreateTaskModalProps) {
  const [projectId, setProjectId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [dueDate, setDueDate] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.archived)

  useEffect(() => {
    if (!open) return
    setProjectId(defaultProjectId ?? activeProjects[0]?.id ?? '')
    setTitle('')
    setDescription('')
    setAssigneeId('')
    setPriority('medium')
    setStatus('todo')
    setDueDate('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId])

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
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required.')
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
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        projectId,
        title: trimmedTitle,
        description: description.trim(),
        assigneeId: assigneeId || null,
        priority,
        status,
        dueDate: dueDate || null,
      })
    } catch {
      setError('Could not create the task. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[560px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <h2
            id="create-task-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            New Task
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
              htmlFor="task-title"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              autoFocus
              className={cn(SELECT_CLASS, 'mt-1')}
              placeholder="What needs to happen?"
            />
          </div>

          <div>
            <label
              htmlFor="task-description"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              className="mt-1 w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="Add context (optional)"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="task-project"
                className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              >
                Project
              </label>
              <select
                id="task-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={Boolean(defaultProjectId)}
                className={cn(SELECT_CLASS, 'mt-1 disabled:cursor-not-allowed disabled:opacity-60')}
              >
                {activeProjects.length === 0 && (
                  <option value="">No active projects</option>
                )}
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="task-assignee"
                className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              >
                Assignee
              </label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={cn(SELECT_CLASS, 'mt-1')}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="task-priority"
                className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              >
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={cn(SELECT_CLASS, 'mt-1')}
              >
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="task-status"
                className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              >
                Status
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={cn(SELECT_CLASS, 'mt-1')}
              >
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="task-due"
                className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              >
                Due date
              </label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={cn(SELECT_CLASS, 'mt-1')}
              />
            </div>
          </div>

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
              disabled={busy || !title.trim() || !projectId}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

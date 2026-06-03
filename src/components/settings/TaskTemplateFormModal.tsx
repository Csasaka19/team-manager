import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS,
  type Priority,
  type Tag,
  type TaskTemplate,
} from '@/data/types'

export interface TaskTemplateFormValues {
  name: string
  title: string
  description: string
  priority: Priority
  subtaskTitles: string[]
  tagNames: string[]
}

interface TaskTemplateFormModalProps {
  open: boolean
  /** Existing template when editing; undefined when creating. */
  initial?: TaskTemplate
  /** Live tag list — the picker shows these and stores names. */
  tags: Tag[]
  onClose: () => void
  onSubmit: (values: TaskTemplateFormValues) => void
  onDelete?: () => void
}

const INPUT_CLASS =
  'h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]'

const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']

export function TaskTemplateFormModal({
  open,
  initial,
  tags,
  onClose,
  onSubmit,
  onDelete,
}: TaskTemplateFormModalProps) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([''])
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setTitle(initial?.title ?? '')
    setDescription(initial?.description ?? '')
    setPriority(initial?.priority ?? 'medium')
    // Always show at least one empty row so the user can start typing.
    setSubtaskTitles(
      initial?.subtaskTitles && initial.subtaskTitles.length > 0
        ? [...initial.subtaskTitles]
        : [''],
    )
    setSelectedTagNames(initial?.tagNames ?? [])
    setError(null)
  }, [open, initial])

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

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags],
  )

  if (!open) return null

  const toggleTag = (tagName: string) => {
    setSelectedTagNames((prev) =>
      prev.includes(tagName)
        ? prev.filter((n) => n !== tagName)
        : [...prev, tagName],
    )
  }

  const updateSubtaskAt = (idx: number, value: string) => {
    setSubtaskTitles((prev) => prev.map((s, i) => (i === idx ? value : s)))
  }
  const addSubtaskRow = () => {
    setSubtaskTitles((prev) => [...prev, ''])
  }
  const removeSubtaskAt = (idx: number) => {
    setSubtaskTitles((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length === 0 ? [''] : next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedTitle = title.trim()
    if (!trimmedName) {
      setError('Template name is required.')
      return
    }
    if (!trimmedTitle) {
      setError('Task title is required.')
      return
    }
    const cleanedSubtasks = subtaskTitles
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    onSubmit({
      name: trimmedName,
      title: trimmedTitle,
      description: description.trim(),
      priority,
      subtaskTitles: cleanedSubtasks,
      tagNames: selectedTagNames,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[560px] overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <h2
            id="template-form-title"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            {initial ? 'Edit template' : 'New template'}
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

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor="template-name"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Template name
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bug Report"
              maxLength={80}
              required
              className={cn(INPUT_CLASS, 'mt-1')}
            />
          </div>

          <div>
            <label
              htmlFor="template-title"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Task title
            </label>
            <input
              id="template-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bug: [description]"
              maxLength={200}
              required
              className={cn(INPUT_CLASS, 'mt-1')}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Use <code>[brackets]</code> to mark spots the user should fill in
              — Quick Create will auto-select the first placeholder.
            </p>
          </div>

          <div>
            <label
              htmlFor="template-description"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Description (optional)
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              placeholder="Notes that should appear in every task built from this template…"
            />
          </div>

          <div>
            <label
              htmlFor="template-priority"
              className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Default priority
            </label>
            <select
              id="template-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={cn(INPUT_CLASS, 'mt-1')}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Default subtasks
            </p>
            <ul className="mt-1 space-y-1.5">
              {subtaskTitles.map((s, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={s}
                    onChange={(e) => updateSubtaskAt(idx, e.target.value)}
                    placeholder={`Subtask ${idx + 1}`}
                    maxLength={200}
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => removeSubtaskAt(idx)}
                    aria-label={`Remove subtask ${idx + 1}`}
                    disabled={subtaskTitles.length === 1 && s === ''}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addSubtaskRow}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded text-xs font-medium text-[var(--accent-primary)] transition-colors hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add subtask
            </button>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Default tags
            </p>
            {sortedTags.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                No tags defined yet. Add some in the Tags section above.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sortedTags.map((tag) => {
                  const selected = selectedTagNames.includes(tag.name)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      aria-pressed={selected}
                      className={cn(
                        'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                        selected
                          ? 'border-transparent text-[var(--text-inverse)]'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                      style={
                        selected
                          ? { backgroundColor: tag.color }
                          : undefined
                      }
                    >
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {initial && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-[var(--destructive)] transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete template
                </button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                {initial ? 'Save changes' : 'Create template'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

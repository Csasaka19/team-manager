import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { cn } from '@/lib/utils'
import { useData } from '@/data/store'
import type { Tag } from '@/data/types'

const TAG_PALETTE = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
] as const

export function TagsSection() {
  const { tags, createTag, updateTag, deleteTag } = useData()
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null)
  const [adding, setAdding] = useState(false)

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    const name = confirmDelete.name
    await deleteTag(confirmDelete.id)
    setConfirmDelete(null)
    toast.success(`Tag "${name}" removed.`)
  }

  const handleCreate = async (input: { name: string; color: string }) => {
    await createTag(input)
    setAdding(false)
    toast.success('Tag added.')
  }

  return (
    <section aria-labelledby="tags-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="tags-heading"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Tags
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Labels you can attach to any task.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Tag
          </button>
        )}
      </div>

      <ul className="mt-5 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {tags.length === 0 && !adding && (
          <li className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No tags yet. Add one to start labeling tasks.
          </li>
        )}

        {tags.map((tag) => (
          <li key={tag.id}>
            {editing === tag.id ? (
              <TagEditor
                initial={tag}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  await updateTag(tag.id, patch)
                  setEditing(null)
                  toast.success('Tag updated.')
                }}
              />
            ) : (
              <TagRow
                tag={tag}
                onEdit={() => setEditing(tag.id)}
                onDelete={() => setConfirmDelete(tag)}
              />
            )}
          </li>
        ))}

        {adding && (
          <li>
            <TagEditor
              initial={{ id: '', name: '', color: TAG_PALETTE[0] }}
              onCancel={() => setAdding(false)}
              onSave={handleCreate}
            />
          </li>
        )}
      </ul>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Remove tag?"
        message={
          confirmDelete ? (
            <>
              Remove{' '}
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  color: confirmDelete.color,
                  backgroundColor: `color-mix(in srgb, ${confirmDelete.color} 15%, transparent)`,
                }}
              >
                {confirmDelete.name}
              </span>{' '}
              ? It will be removed from all tasks.
            </>
          ) : null
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  )
}

function TagRow({
  tag,
  onEdit,
  onDelete,
}: {
  tag: Tag
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          color: tag.color,
          backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
        }}
      >
        {tag.name}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${tag.name}`}
        className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${tag.name}`}
        className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] hover:text-[var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

interface TagEditorProps {
  initial: { id?: string; name: string; color: string }
  onCancel: () => void
  onSave: (patch: { name: string; color: string }) => Promise<void>
}

function TagEditor({ initial, onCancel, onSave }: TagEditorProps) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 30 || busy) return
    setBusy(true)
    try {
      await onSave({ name: trimmed, color })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-[var(--bg-elevated)] px-4 py-3 sm:flex-row sm:items-center">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') {
            onCancel()
          }
        }}
        maxLength={30}
        placeholder="Tag name"
        className="h-9 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {TAG_PALETTE.map((swatch) => {
          const selected = color === swatch
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Use ${swatch}`}
              aria-pressed={selected}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                selected
                  ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-elevated)]'
                  : 'hover:scale-110',
              )}
              style={{ backgroundColor: swatch }}
            >
              {selected && (
                <Check
                  className="h-3.5 w-3.5 text-[var(--text-inverse)]"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-3 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-3 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

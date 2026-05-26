import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag } from '@/data/types'

interface TagsSectionProps {
  selectedIds: string[]
  allTags: Tag[]
  canEdit: boolean
  onChange: (next: string[]) => void
}

export function TagsSection({ selectedIds, allTags, canEdit, onChange }: TagsSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
  }, [pickerOpen])

  const selectedTags = selectedIds
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined)
  const available = allTags.filter((t) => !selectedIds.includes(t.id))

  const remove = (id: string) => {
    onChange(selectedIds.filter((s) => s !== id))
  }

  const add = (id: string) => {
    onChange([...selectedIds, id])
    setPickerOpen(false)
  }

  return (
    <section aria-labelledby="tags-heading">
      <h2
        id="tags-heading"
        className="mb-2 text-lg font-semibold text-[var(--text-primary)]"
      >
        Tags
      </h2>

      {selectedTags.length === 0 && !canEdit ? (
        <p className="text-sm text-[var(--text-muted)]">No tags.</p>
      ) : (
        <div ref={wrapperRef} className="relative flex flex-wrap items-center gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                color: tag.color,
                backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
              }}
            >
              {tag.name}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(tag.id)}
                  aria-label={`Remove tag ${tag.name}`}
                  className="rounded-full p-0.5 transition-colors hover:bg-[color-mix(in_srgb,currentColor_20%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}

          {canEdit && available.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                aria-expanded={pickerOpen}
                aria-haspopup="listbox"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-default)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                )}
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add tag
              </button>

              {pickerOpen && (
                <ul
                  role="listbox"
                  className="absolute top-full left-0 z-10 mt-1 min-w-[160px] overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  {available.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        onClick={() => add(tag.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:bg-[var(--bg-surface)] focus-visible:outline-none"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden="true"
                        />
                        {tag.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {selectedTags.length === 0 && canEdit && (
            <span className="text-xs text-[var(--text-muted)]">No tags yet.</span>
          )}
        </div>
      )}
    </section>
  )
}

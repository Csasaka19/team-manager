import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DescriptionEditorProps {
  value: string
  canEdit: boolean
  onSave: (next: string) => Promise<void>
}

type SaveState = 'idle' | 'saving' | 'saved'

export function DescriptionEditor({ value, canEdit, onSave }: DescriptionEditorProps) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Keep local draft in sync when the underlying value changes from elsewhere.
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
    }
  }, [])

  const commit = async () => {
    setEditing(false)
    if (draft === value) return
    setState('saving')
    try {
      await onSave(draft)
      setState('saved')
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
      savedTimerRef.current = window.setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  const startEditing = () => {
    if (!canEdit) return
    setEditing(true)
    // Defer focus until after the textarea renders.
    queueMicrotask(() => textareaRef.current?.focus())
  }

  return (
    <section aria-labelledby="description-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2
          id="description-heading"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          Description
        </h2>
        {state !== 'idle' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              state === 'saving'
                ? 'text-[var(--text-muted)]'
                : 'text-[var(--status-done)]',
            )}
            aria-live="polite"
          >
            {state === 'saved' && (
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            )}
            {state === 'saving' ? 'Saving…' : 'Saved'}
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value)
              setEditing(false)
            }
          }}
          rows={6}
          placeholder="Add a description…"
          className="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
        />
      ) : (
        <div
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onClick={startEditing}
          onKeyDown={(e) => {
            if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              startEditing()
            }
          }}
          className={cn(
            'min-h-[80px] whitespace-pre-wrap break-words rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm leading-relaxed',
            value ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
            canEdit
              ? 'cursor-text hover:border-[var(--border-default)]'
              : 'cursor-default',
            'focus-visible:outline-none focus-visible:border-[var(--accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          )}
          aria-label={canEdit ? 'Edit description' : 'Description'}
        >
          {value || (canEdit ? 'Add a description…' : 'No description.')}
        </div>
      )}
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, X } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import type { Subtask, TeamMember } from '@/data/types'

interface SubtaskRowProps {
  subtask: Subtask
  members: TeamMember[]
  canToggle: boolean
  canEdit: boolean
  canDelete: boolean
  canChangeAssignee: boolean
  canReorder: boolean
  onToggle: () => void
  onUpdateTitle: (next: string) => void
  onChangeAssignee: (next: string | null) => void
  onDelete: () => void
}

export function SubtaskRow({
  subtask,
  members,
  canToggle,
  canEdit,
  canDelete,
  canChangeAssignee,
  canReorder,
  onToggle,
  onUpdateTitle,
  onChangeAssignee,
  onDelete,
}: SubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: subtask.id, disabled: !canReorder })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(subtask.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(subtask.title)
  }, [subtask.title, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== subtask.title) {
      onUpdateTitle(next)
    } else {
      setDraft(subtask.title)
    }
    setEditing(false)
  }

  const assignee = subtask.assigneeId
    ? members.find((m) => m.id === subtask.assigneeId)
    : null

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2 transition-colors hover:border-[var(--border-default)]"
    >
      <button
        type="button"
        {...(canReorder ? attributes : {})}
        {...(canReorder ? listeners : {})}
        aria-label={canReorder ? 'Reorder subtask' : undefined}
        disabled={!canReorder}
        className={cn(
          'shrink-0 rounded p-0.5 text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          canReorder
            ? 'cursor-grab hover:text-[var(--text-secondary)] active:cursor-grabbing'
            : 'invisible',
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onToggle}
        disabled={!canToggle}
        aria-pressed={subtask.done}
        aria-label={subtask.done ? 'Mark not done' : 'Mark done'}
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          subtask.done
            ? 'border-[var(--status-done)] bg-[var(--status-done)] text-[var(--text-inverse)]'
            : 'border-[var(--border-default)] bg-transparent hover:border-[var(--status-done)]',
          !canToggle && 'cursor-not-allowed opacity-60',
        )}
      >
        {subtask.done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                setDraft(subtask.title)
                setEditing(false)
              }
            }}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-1.5 py-0.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
        ) : (
          <span
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={() => canEdit && setEditing(true)}
            onKeyDown={(e) => {
              if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                setEditing(true)
              }
            }}
            className={cn(
              'block truncate text-sm',
              subtask.done
                ? 'text-[var(--text-secondary)] line-through'
                : 'text-[var(--text-primary)]',
              canEdit && 'cursor-text rounded px-1 -mx-1 hover:bg-[var(--bg-elevated)]',
            )}
          >
            {subtask.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {assignee && <Avatar name={assignee.name} size="xs" title={assignee.name} />}
        <select
          aria-label="Subtask assignee"
          value={subtask.assigneeId ?? ''}
          disabled={!canChangeAssignee}
          onChange={(e) =>
            onChangeAssignee(e.target.value === '' ? null : e.target.value)
          }
          className="h-7 max-w-[120px] rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] px-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete subtask ${subtask.title}`}
          className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)] hover:text-[var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

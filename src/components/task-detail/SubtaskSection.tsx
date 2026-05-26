import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { SubtaskRow } from './SubtaskRow'
import type { Subtask, Task, TeamMember } from '@/data/types'

interface SubtaskSectionProps {
  task: Task
  members: TeamMember[]
  canAdd: boolean
  canReorder: boolean
  canToggle: (subtask: Subtask) => boolean
  canEditTitle: (subtask: Subtask) => boolean
  canChangeAssignee: (subtask: Subtask) => boolean
  canDelete: (subtask: Subtask) => boolean
  onCreate: (title: string) => Promise<void>
  onToggle: (subtaskId: string) => Promise<void>
  onUpdateTitle: (subtaskId: string, title: string) => Promise<void>
  onChangeAssignee: (subtaskId: string, assigneeId: string | null) => Promise<void>
  onDelete: (subtaskId: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
}

export function SubtaskSection(props: SubtaskSectionProps) {
  const {
    task,
    members,
    canAdd,
    canReorder,
    canToggle,
    canEditTitle,
    canChangeAssignee,
    canDelete,
    onCreate,
    onToggle,
    onUpdateTitle,
    onChangeAssignee,
    onDelete,
    onReorder,
  } = props

  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const subtasks = [...task.subtasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const total = subtasks.length
  const done = subtasks.filter((s) => s.done).length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = subtasks.findIndex((s) => s.id === active.id)
    const newIndex = subtasks.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(subtasks, oldIndex, newIndex).map((s) => s.id)
    await onReorder(reordered)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      await onCreate(title)
      setNewTitle('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="subtasks-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="subtasks-heading"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          Subtasks
        </h2>
        {total > 0 && (
          <span className="text-xs text-[var(--text-secondary)] tabular-nums">
            {done} of {total} complete
          </span>
        )}
      </div>

      {total > 0 && (
        <div
          className="mb-3 h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-[var(--accent-primary)] transition-[width] duration-200"
            style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
          />
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No subtasks yet. Break this task into smaller pieces.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={subtasks.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1.5">
              {subtasks.map((s) => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  members={members}
                  canToggle={canToggle(s)}
                  canEdit={canEditTitle(s)}
                  canDelete={canDelete(s)}
                  canChangeAssignee={canChangeAssignee(s)}
                  canReorder={canReorder}
                  onToggle={() => onToggle(s.id)}
                  onUpdateTitle={(next) => onUpdateTitle(s.id, next)}
                  onChangeAssignee={(next) => onChangeAssignee(s.id, next)}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {canAdd && (
        <form onSubmit={handleAdd} className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a subtask…"
            className="h-9 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
          <button
            type="submit"
            disabled={busy || newTitle.trim() === ''}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </form>
      )}
    </section>
  )
}

import { useMemo, useRef, useState } from 'react'
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
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { SubtaskRow } from './SubtaskRow'
import { cn } from '@/lib/utils'
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
  /** Returns the created subtask so the section can focus it for Tab-create. */
  onCreate: (title: string) => Promise<Subtask | null>
  onToggle: (subtaskId: string) => Promise<void>
  onUpdateTitle: (subtaskId: string, title: string) => Promise<void>
  onChangeAssignee: (subtaskId: string, assigneeId: string | null) => Promise<void>
  onDelete: (subtaskId: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
}

const COMPLETED_HIDE_THRESHOLD = 3

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
  const [showCompleted, setShowCompleted] = useState(false)
  // Subtask ID that should mount in edit-mode + focused. Cleared after one
  // render so subsequent re-renders don't keep re-focusing.
  const [focusOnCreateId, setFocusOnCreateId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const sortedByOrder = useMemo(
    () => [...task.subtasks].sort((a, b) => a.sortOrder - b.sortOrder),
    [task.subtasks],
  )
  const open = useMemo(
    () => sortedByOrder.filter((s) => !s.done),
    [sortedByOrder],
  )
  const completed = useMemo(
    () => sortedByOrder.filter((s) => s.done),
    [sortedByOrder],
  )
  const total = sortedByOrder.length
  const done = completed.length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const allDone = total > 0 && done === total

  // Hide completed subtasks behind a toggle once the pile of finished items
  // gets noisy. Below the threshold they always show, just sorted to the bottom.
  const completedHidden =
    completed.length > COMPLETED_HIDE_THRESHOLD && !showCompleted

  const visible = useMemo(
    () => (completedHidden ? open : [...open, ...completed]),
    [open, completed, completedHidden],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    // Reorder within the full sortedByOrder list (so completed-bucket drags
    // still produce a consistent sortOrder), not within the filtered visible
    // list — otherwise a drag in the open bucket would scramble the
    // completed bucket's order.
    const oldIndex = sortedByOrder.findIndex((s) => s.id === active.id)
    const newIndex = sortedByOrder.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(sortedByOrder, oldIndex, newIndex).map(
      (s) => s.id,
    )
    await onReorder(reordered)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const created = await onCreate(title)
      setNewTitle('')
      // Refocus the add input so the user can keep typing the next one.
      queueMicrotask(() => addInputRef.current?.focus())
      // If something went wrong, no focus state to set.
      if (!created) return
    } finally {
      setBusy(false)
    }
  }

  // Tab inside the Add-subtask input commits + chains another empty row.
  const handleAddInputTab = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return
    const title = newTitle.trim()
    if (!title || busy) return
    e.preventDefault()
    setBusy(true)
    try {
      const created = await onCreate(title)
      setNewTitle('')
      if (created) setFocusOnCreateId(created.id)
    } finally {
      setBusy(false)
    }
  }

  // Tab inside an existing row's inline edit commits + creates an empty
  // placeholder below, focused immediately so the user can keep typing.
  const handleRowTabCreate = async () => {
    if (busy) return
    setBusy(true)
    try {
      const created = await onCreate('')
      if (created) setFocusOnCreateId(created.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="subtasks-heading">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2
          id="subtasks-heading"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          Subtasks
        </h2>
      </div>

      {total > 0 && (
        <ProgressBar
          done={done}
          total={total}
          pct={pct}
          allDone={allDone}
        />
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
            items={visible.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1.5">
              {visible.map((s) => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  members={members}
                  canToggle={canToggle(s)}
                  canEdit={canEditTitle(s)}
                  canDelete={canDelete(s)}
                  canChangeAssignee={canChangeAssignee(s)}
                  canReorder={canReorder}
                  autoFocusEdit={s.id === focusOnCreateId}
                  onToggle={() => {
                    if (s.id === focusOnCreateId) setFocusOnCreateId(null)
                    void onToggle(s.id)
                  }}
                  onUpdateTitle={(next) => {
                    if (s.id === focusOnCreateId) setFocusOnCreateId(null)
                    void onUpdateTitle(s.id, next)
                  }}
                  onChangeAssignee={(next) =>
                    void onChangeAssignee(s.id, next)
                  }
                  onDelete={() => {
                    if (s.id === focusOnCreateId) setFocusOnCreateId(null)
                    void onDelete(s.id)
                  }}
                  onTabCreate={handleRowTabCreate}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {completed.length > COMPLETED_HIDE_THRESHOLD && (
        <button
          type="button"
          onClick={() => setShowCompleted((s) => !s)}
          aria-expanded={showCompleted}
          className="mt-3 inline-flex items-center gap-1.5 rounded text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          {showCompleted ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {showCompleted
            ? `Hide ${completed.length} completed subtasks`
            : `Show ${completed.length} completed subtasks`}
        </button>
      )}

      {canAdd && (
        <form onSubmit={handleAdd} className="mt-3 flex items-center gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleAddInputTab}
            placeholder="Add a subtask…  (Tab to add another)"
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

interface ProgressBarProps {
  done: number
  total: number
  pct: number
  allDone: boolean
}

function ProgressBar({ done, total, pct, allDone }: ProgressBarProps) {
  return (
    <div
      className={cn(
        'relative mb-3 h-6 w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--border-subtle)]',
        allDone && 'animate-[pulseSubtaskComplete_2s_ease-in-out_infinite]',
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={
        allDone ? 'All subtasks complete' : `${done} of ${total} complete`
      }
    >
      <div
        className="absolute inset-y-0 left-0 bg-[var(--status-done)] transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <p
        className={cn(
          'relative z-10 flex h-full items-center justify-center text-[11px] font-medium tabular-nums',
          // Text rides on top of either the done-color bar or the muted
          // background, so we pick a tone that stays legible in both halves.
          allDone
            ? 'text-[var(--text-inverse)]'
            : 'text-[var(--text-primary)]',
        )}
      >
        {allDone
          ? 'All subtasks complete ✓'
          : `${done} of ${total} complete (${pct}%)`}
      </p>
    </div>
  )
}

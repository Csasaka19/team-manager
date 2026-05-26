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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { type TaskStatus } from '@/data/types'
import { useData } from '@/data/store'

export function WorkspaceSection() {
  const {
    workspaceName,
    statusLabels,
    columnOrder,
    setWorkspaceName,
    setStatusLabel,
    setColumnOrder,
  } = useData()

  const [nameDraft, setNameDraft] = useState(workspaceName)
  const [editing, setEditing] = useState<TaskStatus | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const nameDirty = nameDraft.trim() !== workspaceName && nameDraft.trim().length > 0

  const handleSaveName = () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) return
    setWorkspaceName(trimmed)
    toast.success('Workspace name saved.')
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = columnOrder.indexOf(active.id as TaskStatus)
    const newIndex = columnOrder.indexOf(over.id as TaskStatus)
    if (oldIndex < 0 || newIndex < 0) return
    setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex))
    toast.success('Column order saved.')
  }

  const startEditing = (status: TaskStatus) => {
    setEditing(status)
    setEditDraft(statusLabels[status])
  }

  const commitEdit = () => {
    if (!editing) return
    const trimmed = editDraft.trim()
    if (!trimmed) {
      setEditing(null)
      return
    }
    if (trimmed === statusLabels[editing]) {
      setEditing(null)
      return
    }
    setStatusLabel(editing, trimmed)
    setEditing(null)
    toast.success('Column renamed.')
  }

  return (
    <section aria-labelledby="workspace-heading">
      <h2
        id="workspace-heading"
        className="text-lg font-semibold text-[var(--text-primary)]"
      >
        Workspace
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Workspace-wide configuration that affects everyone.
      </p>

      <div className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <label
          htmlFor="workspace-name"
          className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          Workspace name
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="workspace-name"
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            maxLength={60}
            className="h-9 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!nameDirty}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Board columns
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Drag to reorder. Click a label to rename. Adding or removing the four
            built-in columns isn&apos;t supported yet.
          </p>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={columnOrder}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 flex flex-col gap-2">
              {columnOrder.map((status) => (
                <ColumnRow
                  key={status}
                  status={status}
                  label={statusLabels[status]}
                  editing={editing === status}
                  editDraft={editing === status ? editDraft : statusLabels[status]}
                  onEditDraftChange={setEditDraft}
                  onStartEdit={() => startEditing(status)}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => setEditing(null)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  )
}

interface ColumnRowProps {
  status: TaskStatus
  label: string
  editing: boolean
  editDraft: string
  onEditDraftChange: (v: string) => void
  onStartEdit: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
}

function ColumnRow({
  status,
  label,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: ColumnRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: status })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        'flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-2',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder column"
        className="cursor-grab rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {editing ? (
        <input
          autoFocus
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommitEdit()
            } else if (e.key === 'Escape') {
              onCancelEdit()
            }
          }}
          maxLength={30}
          className="h-8 flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="flex-1 truncate rounded px-1 -mx-1 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          {label}
        </button>
      )}

      <button
        type="button"
        onClick={onStartEdit}
        aria-label={`Rename ${label}`}
        className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <span className="px-1 text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)]" title={`Canonical key: ${status}`}>
        {status === 'todo' ? 'TODO' : status === 'in_progress' ? 'IN PROGRESS' : status === 'in_review' ? 'IN REVIEW' : 'DONE'}
      </span>
    </li>
  )
}

import { useState } from 'react'
import { Plus, Settings as SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import {
  TaskTemplateFormModal,
  type TaskTemplateFormValues,
} from '@/components/settings/TaskTemplateFormModal'
import { useData } from '@/data/store'
import { PRIORITY_LABELS, type TaskTemplate } from '@/data/types'

export function TaskTemplatesSection() {
  const { templates, tags, createTemplate, updateTemplate, deleteTemplate } =
    useData()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TaskTemplate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TaskTemplate | null>(null)

  const handleCreate = (values: TaskTemplateFormValues) => {
    createTemplate(values)
    setCreateOpen(false)
    toast.success('Template created.')
  }

  const handleUpdate = (values: TaskTemplateFormValues) => {
    if (!editing) return
    updateTemplate(editing.id, values)
    setEditing(null)
    toast.success('Template saved.')
  }

  const handleDelete = () => {
    if (!confirmDelete) return
    deleteTemplate(confirmDelete.id)
    setConfirmDelete(null)
    setEditing(null)
    toast.success('Template deleted.')
  }

  return (
    <section aria-labelledby="templates-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="templates-heading"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Task Templates
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Pre-defined task structures (title, priority, subtasks, tags) that
            Quick Create can apply with one click.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No templates yet. Add your first one to speed up repetitive task
            creation.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {tpl.name}
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)]">
                    {PRIORITY_LABELS[tpl.priority]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                  {tpl.title}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {tpl.subtaskTitles.length} subtask
                  {tpl.subtaskTitles.length === 1 ? '' : 's'}
                  {tpl.tagNames.length > 0 && (
                    <> · {tpl.tagNames.join(', ')}</>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(tpl)}
                aria-label={`Edit template ${tpl.name}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <SettingsIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      <TaskTemplateFormModal
        open={createOpen}
        tags={tags}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <TaskTemplateFormModal
        open={editing !== null}
        initial={editing ?? undefined}
        tags={tags}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
        onDelete={() => editing && setConfirmDelete(editing)}
      />

      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete template?"
        message={
          confirmDelete ? (
            <>
              Delete the{' '}
              <strong className="text-[var(--text-primary)]">
                {confirmDelete.name}
              </strong>{' '}
              template? Existing tasks created from it stay untouched.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, FileQuestion, Radio, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { ActivityCommentFeed } from '@/components/task-detail/ActivityCommentFeed'
import { AtlasMarkdown } from '@/components/atlas/AtlasMarkdown'
import { DescriptionEditor } from '@/components/task-detail/DescriptionEditor'
import { SubtaskSection } from '@/components/task-detail/SubtaskSection'
import { TagsSection } from '@/components/task-detail/TagsSection'
import { TaskHeader } from '@/components/task-detail/TaskHeader'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { MeetingSourceBanner } from '@/components/task-detail/MeetingSourceBanner'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useIsReadOnly } from '@/hooks/useIsReadOnly'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Priority, Subtask, TaskStatus } from '@/data/types'

/** Map single-letter shortcut → element ID that should receive focus. */
const FOCUS_TARGETS: Record<string, string> = {
  a: 'task-assignee-select',
  p: 'task-priority-select',
  s: 'task-status-select',
  d: 'task-due-date',
  m: 'task-comment-input',
}

function focusById(id: string) {
  const el = document.getElementById(id)
  if (el && !(el as HTMLInputElement | HTMLSelectElement).disabled) {
    el.focus()
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { currentUser, isPM } = useAuth()
  const {
    tasks,
    projects,
    teamMembers,
    tags,
    activities,
    sheetsRawRowsByTaskId,
    projectDataSources,
    updateTask,
    deleteTask,
    createSubtask,
    toggleSubtask,
    updateSubtask,
    deleteSubtask: removeSubtask,
    reorderSubtasks,
  } = useData()

  const task = tasks.find((t) => t.id === taskId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  useDocumentTitle(task ? task.title : 'Task not found')

  useKeyboardShortcuts([
    {
      key: ['a', 'p', 's', 'd', 'm'],
      handler: (e) => {
        const id = FOCUS_TARGETS[e.key.toLowerCase()]
        if (id) focusById(id)
      },
    },
  ])

  const project = task ? projects.find((p) => p.id === task.projectId) : undefined
  const creator = task ? teamMembers.find((m) => m.id === task.createdBy) : undefined
  const taskActivities = useMemo(
    () => (task ? activities.filter((a) => a.taskId === task.id) : []),
    [activities, task],
  )

  if (!task) {
    return <TaskNotFound />
  }

  const assignedToMe = currentUser?.id === task.assigneeId
  const canPMEdit = isPM
  const canMemberEdit = !isPM && assignedToMe
  const canEditTask = canPMEdit || canMemberEdit
  // Atlas owns title / priority / assignee / due-date for any task that
  // originated from the API. Status and subtasks stay editable — those
  // are the team's working state, captured in the local overlay.
  const isAtlasManaged = useIsReadOnly('task', task.id)
  // Sheets-sourced tasks get the same field-level lockdown as Atlas
  // (the source is read-only too), but with a different source badge.
  const sheetsRawRow = sheetsRawRowsByTaskId.get(task.id)
  const isSheetsManaged =
    sheetsRawRow !== undefined ||
    projectDataSources.some(
      (s) => s.projectId === task.projectId && s.source === 'google-sheets',
    )
  const isReadOnlySource = isAtlasManaged || isSheetsManaged
  const canEditTitle = canEditTask && !isReadOnlySource
  const canChangeAssignee = canPMEdit && !isReadOnlySource
  const canChangePriority = canPMEdit && !isReadOnlySource
  const canChangeDueDate = canEditTask && !isReadOnlySource
  const canDeleteTask = canPMEdit && !isReadOnlySource

  const handleDelete = async () => {
    setConfirmOpen(false)
    try {
      await deleteTask(task.id)
      toast.success('Task deleted.')
      navigate('/board')
    } catch {
      toast.error('Could not delete the task.')
    }
  }

  const safeUpdate = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch {
      toast.error(`Could not save ${label}.`)
    }
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 rounded text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      </div>

      {/* TaskHeader sticks under the top bar (h-14) + the page's top
          padding so its title + status/priority/assignee/due controls
          stay reachable while scrolling subtasks and comments. */}
      <div className="sticky top-14 z-10 -mx-4 bg-[var(--bg-base)] px-4 pb-4 pt-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <TaskHeader
        task={task}
        project={project}
        members={teamMembers}
        creator={creator}
        canEditTitle={canEditTitle}
        canChangeStatus={canEditTask}
        canChangePriority={canChangePriority}
        canChangeAssignee={canChangeAssignee}
        canChangeDueDate={canChangeDueDate}
        canDelete={canDeleteTask}
        onUpdateTitle={(title) =>
          void safeUpdate('title', () => updateTask(task.id, { title }))
        }
        onChangeStatus={(status: TaskStatus) =>
          void safeUpdate('status', () => updateTask(task.id, { status }))
        }
        onChangePriority={(priority: Priority) =>
          void safeUpdate('priority', () => updateTask(task.id, { priority }))
        }
        onChangeAssignee={(assigneeId) =>
          void safeUpdate('assignee', () => updateTask(task.id, { assigneeId }))
        }
        onChangeDueDate={(dueDate) =>
          void safeUpdate('due date', () => updateTask(task.id, { dueDate }))
        }
        onDelete={() => setConfirmOpen(true)}
      />
      </div>

      {task.sourceMeetingId && (
        <MeetingSourceBanner sourceMeetingId={task.sourceMeetingId} />
      )}

      {isReadOnlySource ? (
        <section
          aria-labelledby="task-description-heading"
          className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="task-description-heading"
              className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
            >
              Description
            </h2>
            {isSheetsManaged ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--status-done)]"
                title="This task is synced from the Contracting.com Google Sheet. Status edits stay local; everything else is read-only."
              >
                <Table2 className="h-3 w-3" aria-hidden="true" />
                From Sheets
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--text-secondary)]"
                title="This task was fetched from the Atlas vault. The body is read-only because the Atlas API doesn't accept writes."
              >
                <Radio className="h-3 w-3" aria-hidden="true" />
                Source: Atlas
              </span>
            )}
          </div>
          {task.description ? (
            <AtlasMarkdown content={task.description} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {isSheetsManaged
                ? 'No description in spreadsheet.'
                : 'No description available from Atlas.'}
            </p>
          )}
        </section>
      ) : (
        <DescriptionEditor
          value={task.description}
          canEdit={canEditTask}
          onSave={async (description) => {
            await updateTask(task.id, { description })
          }}
        />
      )}

      <SubtaskSection
        task={task}
        members={teamMembers}
        canAdd={canEditTask}
        canReorder={canEditTask}
        canToggle={(s: Subtask) =>
          canPMEdit || s.assigneeId === currentUser?.id || canMemberEdit
        }
        canEditTitle={() => canEditTask}
        canChangeAssignee={() => canPMEdit}
        canDelete={(s: Subtask) =>
          canPMEdit || s.assigneeId === currentUser?.id
        }
        onCreate={async (title) => {
          try {
            return await createSubtask(task.id, title)
          } catch {
            toast.error('Could not save subtask.')
            return null
          }
        }}
        onToggle={(subtaskId) =>
          safeUpdate('subtask', () => toggleSubtask(task.id, subtaskId))
        }
        onUpdateTitle={(subtaskId, title) =>
          safeUpdate('subtask', () => updateSubtask(task.id, subtaskId, { title }))
        }
        onChangeAssignee={(subtaskId, assigneeId) =>
          safeUpdate('subtask', () =>
            updateSubtask(task.id, subtaskId, { assigneeId }),
          )
        }
        onDelete={(subtaskId) =>
          safeUpdate('subtask', () => removeSubtask(task.id, subtaskId))
        }
        onReorder={(orderedIds) =>
          safeUpdate('subtask order', () => reorderSubtasks(task.id, orderedIds))
        }
        onMoveParentToDone={
          canEditTask
            ? () => void safeUpdate('status', () => updateTask(task.id, { status: 'done' }))
            : undefined
        }
      />

      <TagsSection
        selectedIds={task.tags}
        allTags={tags}
        canEdit={canPMEdit}
        onChange={(nextTags) =>
          void safeUpdate('tags', () => updateTask(task.id, { tags: nextTags }))
        }
      />

      <section aria-labelledby="activity-heading">
        <h2
          id="activity-heading"
          className="mb-3 text-lg font-semibold text-[var(--text-primary)]"
        >
          Activity
        </h2>
        <ActivityCommentFeed
          task={task}
          activities={taskActivities}
          members={teamMembers}
        />
      </section>

      {sheetsRawRow && <RawSheetDataPanel row={sheetsRawRow} />}

      <ConfirmModal
        open={confirmOpen}
        title="Delete task?"
        message={
          <>
            Delete{' '}
            <strong className="text-[var(--text-primary)]">{`'${task.title}'`}</strong>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function RawSheetDataPanel({
  row,
}: {
  row: import('@/services/sheets-mapper').SheetsRawRow
}) {
  const [open, setOpen] = useState(false)
  // Pair headers ↔ values; pad/trim so a header without a value still
  // renders (Sheets sometimes returns short rows).
  const pairs = row.headers.map((header, i) => ({
    header: header || `Column ${i + 1}`,
    value: row.values[i] ?? '',
  }))

  return (
    <section
      aria-labelledby="raw-sheet-heading"
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        aria-expanded={open}
      >
        <div>
          <h2
            id="raw-sheet-heading"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            Raw Sheet Data
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Tab <code className="font-mono">{row.tabSlug}</code> · row{' '}
            <code className="font-mono">{row.rowIndex}</code> · {pairs.length} columns
          </p>
        </div>
        {open ? (
          <ChevronDown
            className="h-4 w-4 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-[var(--border-subtle)] p-4 text-sm md:grid-cols-2 md:p-5">
          {pairs.map((p, i) => (
            <div
              key={`${p.header}-${i}`}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="font-mono text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                {p.header}
              </dt>
              <dd
                className={p.value
                  ? 'truncate text-right text-[var(--text-primary)]'
                  : 'text-right text-[11px] italic text-[var(--text-muted)]'}
                title={p.value}
              >
                {p.value || '(empty)'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function TaskNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <FileQuestion
        className="h-12 w-12 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h2 className="mt-4 text-base font-medium text-[var(--text-secondary)]">
        Task not found.
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        It may have been deleted.
      </p>
      <Link
        to="/board"
        className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        Back to board
      </Link>
    </div>
  )
}

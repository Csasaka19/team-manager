import { TaskRow } from './TaskRow'
import type { Project, Task } from '@/data/types'

export interface MyTaskEntry {
  task: Task
  /** True when the user is on this task only because a subtask is assigned
   *  to them — not because they're the parent task's assignee. */
  viaSubtaskOnly: boolean
}

interface TaskSectionProps {
  title: string
  tasks: MyTaskEntry[]
  projectById: Map<string, Project>
  /** Message shown when the section has zero tasks. Omit to hide the section when empty. */
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  /** When true, rows render with strikethrough + muted styling (completed list). */
  completedStyle?: boolean
}

export function TaskSection({
  title,
  tasks,
  projectById,
  emptyMessage,
  emptyIcon,
  completedStyle = false,
}: TaskSectionProps) {
  if (tasks.length === 0 && !emptyMessage) return null

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        {tasks.length > 0 && (
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            ({tasks.length})
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-5">
          {emptyIcon}
          <p className="text-sm text-[var(--text-secondary)]">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map(({ task, viaSubtaskOnly }) => (
            <TaskRow
              key={task.id}
              task={task}
              project={projectById.get(task.projectId)}
              completed={completedStyle}
              viaSubtaskOnly={viaSubtaskOnly}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

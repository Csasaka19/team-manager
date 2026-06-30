import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TaskRow } from './TaskRow'
import { cn } from '@/lib/utils'
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
  /** When true, the header becomes a button that toggles list
   *  visibility. The count badge sticks around in both states so the
   *  user knows what's hidden behind a collapsed header. */
  collapsible?: boolean
  /** Initial collapsed state when `collapsible` is true. Defaults to
   *  expanded (false). */
  defaultCollapsed?: boolean
  /** Visual pill colour for the count badge — passes a CSS variable
   *  name like `--status-progress`. Omit for the default muted look. */
  badgeColorVar?: string
}

export function TaskSection({
  title,
  tasks,
  projectById,
  emptyMessage,
  emptyIcon,
  completedStyle = false,
  collapsible = false,
  defaultCollapsed = false,
  badgeColorVar,
}: TaskSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (tasks.length === 0 && !emptyMessage) return null

  const isCollapsed = collapsible && collapsed

  return (
    <section aria-label={title}>
      {/* Section heading sticks under the 56 px top bar so the user can
          scan which bucket they're in while scrolling a long queue.
          When `collapsible` is true the heading is a button. */}
      <div className="sticky top-14 z-10 -mx-4 mb-3 flex items-center gap-2 bg-[var(--bg-base)] px-4 py-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!isCollapsed}
            className="inline-flex items-center gap-2 rounded text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            {isCollapsed ? (
              <ChevronRight
                className="h-4 w-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="h-4 w-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
            )}
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            <CountBadge count={tasks.length} colorVar={badgeColorVar} />
          </button>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {tasks.length > 0 && (
              <CountBadge count={tasks.length} colorVar={badgeColorVar} />
            )}
          </>
        )}
      </div>

      {!isCollapsed &&
        (tasks.length === 0 ? (
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
        ))}
    </section>
  )
}

function CountBadge({
  count,
  colorVar,
}: {
  count: number
  colorVar?: string
}) {
  if (colorVar) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
        style={{
          backgroundColor: `color-mix(in srgb, var(${colorVar}) 15%, transparent)`,
          color: `var(${colorVar})`,
        }}
      >
        {count}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] tabular-nums',
      )}
    >
      {count}
    </span>
  )
}

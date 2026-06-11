import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Flag, Inbox, ListChecks, Users } from 'lucide-react'
import { useAtlas } from '@/hooks/useAtlas'
import { fetchAtlasTasks } from '@/services/atlas/client'
import type {
  AtlasProject,
  AtlasTask,
  AtlasTaskState,
} from '@/services/atlas/types'
import { cn } from '@/lib/utils'
import { SkeletonLine } from '@/components/shared/Skeleton'
import { AtlasErrorState } from './AtlasErrorState'

interface AtlasTasksTabProps {
  projects: AtlasProject[] | null
}

const STATE_LABEL: Record<AtlasTaskState | 'all', string> = {
  all: 'All',
  inbox: 'Inbox',
  open: 'Open',
  done: 'Done',
}

const STATE_ICON: Record<AtlasTaskState, typeof Inbox> = {
  inbox: Inbox,
  open: ListChecks,
  done: ListChecks,
}

const PRIORITY_STYLE: Record<string, string> = {
  critical:
    'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]',
  high:
    'bg-[color-mix(in_srgb,var(--priority-high)_15%,transparent)] text-[var(--priority-high)]',
  medium:
    'bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] text-[var(--priority-medium)]',
  low:
    'bg-[color-mix(in_srgb,var(--priority-low)_15%,transparent)] text-[var(--priority-low)]',
}

export function AtlasTasksTab({ projects }: AtlasTasksTabProps) {
  const [state, setState] = useState<AtlasTaskState | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [assignee, setAssignee] = useState<string>('')
  const [assigneeDraft, setAssigneeDraft] = useState<string>('')

  const loader = useCallback(
    (signal: AbortSignal) =>
      fetchAtlasTasks(
        {
          ...(state !== 'all' ? { status: state } : {}),
          ...(projectFilter !== 'all' ? { project: projectFilter } : {}),
          ...(assignee ? { assignee } : {}),
        },
        { signal },
      ),
    [state, projectFilter, assignee],
  )
  const { data, error, loading, reload } = useAtlas(loader, [
    state,
    projectFilter,
    assignee,
  ])

  const projectBySlug = useMemo(
    () => new Map((projects ?? []).map((p) => [p.slug, p])),
    [projects],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter Atlas tasks by state"
          className="flex flex-wrap items-center gap-1"
        >
          {(['all', 'inbox', 'open', 'done'] as const).map((key) => {
            const active = state === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setState(key)}
                className={cn(
                  'inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                  active
                    ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
                )}
              >
                {STATE_LABEL[key]}
              </button>
            )
          })}
        </div>

        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="atlas-tasks-project"
              className="text-xs text-[var(--text-secondary)]"
            >
              Project
            </label>
            <select
              id="atlas-tasks-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-8 min-w-[160px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            setAssignee(assigneeDraft.trim())
          }}
          className="flex items-center gap-2"
        >
          <label
            htmlFor="atlas-tasks-assignee"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Assignee
          </label>
          <input
            id="atlas-tasks-assignee"
            type="text"
            value={assigneeDraft}
            onChange={(e) => setAssigneeDraft(e.target.value)}
            placeholder="slug or full name"
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-44 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          />
          {assignee && (
            <button
              type="button"
              onClick={() => {
                setAssigneeDraft('')
                setAssignee('')
              }}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded"
            >
              Clear
            </button>
          )}
        </form>

        <p className="ml-auto text-xs text-[var(--text-muted)] tabular-nums">
          {loading
            ? 'Loading…'
            : data
              ? `${data.length} task${data.length === 1 ? '' : 's'}`
              : ''}
        </p>
      </div>

      {loading ? (
        <TasksSkeleton />
      ) : error ? (
        <AtlasErrorState error={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyTasks />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((task) => (
            <li key={`${task.project}/${task.id}`}>
              <TaskRow task={task} project={projectBySlug.get(task.project)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface TaskRowProps {
  task: AtlasTask
  project: AtlasProject | undefined
}

function TaskRow({ task, project }: TaskRowProps) {
  const Icon = STATE_ICON[task.state] ?? Inbox
  const title = extractTitle(task.description) ?? task.id
  const priorityClass =
    (task.priority && PRIORITY_STYLE[task.priority.toLowerCase()]) ?? null

  return (
    <Link
      to={`/atlas/tasks/${encodeURIComponent(task.project)}/${encodeURIComponent(task.id)}`}
      className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{task.state}</span>
        {project && (
          <>
            <span aria-hidden="true">·</span>
            <span>{project.name}</span>
          </>
        )}
        {!project && (
          <>
            <span aria-hidden="true">·</span>
            <span>{task.project}</span>
          </>
        )}
        {task.deadline && (
          <>
            <span aria-hidden="true">·</span>
            <span>Due {task.deadline}</span>
          </>
        )}
        <ArrowUpRight
          className="ml-auto h-3.5 w-3.5 text-[var(--text-muted)]"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="line-clamp-2 flex-1 text-[15px] font-medium text-[var(--text-primary)]">
          {title}
        </h3>
        {task.priority && priorityClass && (
          <span
            className={cn(
              'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium uppercase tracking-[0.5px]',
              priorityClass,
            )}
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
            {task.priority}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
        {task.assignee ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {task.assignee}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Unassigned</span>
        )}
        {task.tags?.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="inline-flex h-5 items-center rounded-full bg-[var(--bg-elevated)] px-2 tabular-nums"
          >
            #{tag}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px]">{task.id}</span>
      </div>
    </Link>
  )
}

function TasksSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
        >
          <SkeletonLine className="h-3 w-40" />
          <SkeletonLine className="mt-2 h-4 w-3/4" />
          <SkeletonLine className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  )
}

function EmptyTasks() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        No tasks match the current filter.
      </p>
    </div>
  )
}

function extractTitle(content: string): string | null {
  for (const line of content.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line.trim())
    if (m && m[1]) return m[1].trim()
  }
  return null
}

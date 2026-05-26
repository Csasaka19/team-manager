import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, ListChecks, Search } from 'lucide-react'
import { StatusPill } from '@/components/shared/StatusPill'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'
import type { Project, Task, TeamMember } from '@/data/types'

const MAX_PER_GROUP = 5
const DEBOUNCE_MS = 300

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

interface TaskHit {
  kind: 'task'
  task: Task
  project: Project | undefined
  assignee: TeamMember | undefined
}

interface ProjectHit {
  kind: 'project'
  project: Project
  taskCount: number
}

type Hit = TaskHit | ProjectHit

export function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate()
  const { tasks, projects, teamMembers } = useData()

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setInput('')
      setQuery('')
      setHighlight(0)
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounce the query.
  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [input, open])

  // Close on Escape (global while open).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )
  const memberById = useMemo(
    () => new Map(teamMembers.map((m) => [m.id, m])),
    [teamMembers],
  )
  const tasksByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const { taskHits, projectHits, hits } = useMemo(() => {
    if (!query) return { taskHits: [], projectHits: [], hits: [] as Hit[] }
    const q = query.toLowerCase()

    const taskHits: TaskHit[] = tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      )
      .slice(0, MAX_PER_GROUP)
      .map((t) => ({
        kind: 'task' as const,
        task: t,
        project: projectById.get(t.projectId),
        assignee: t.assigneeId ? memberById.get(t.assigneeId) : undefined,
      }))

    const projectHits: ProjectHit[] = projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
      .slice(0, MAX_PER_GROUP)
      .map((p) => ({
        kind: 'project' as const,
        project: p,
        taskCount: tasksByProject.get(p.id) ?? 0,
      }))

    return { taskHits, projectHits, hits: [...taskHits, ...projectHits] }
  }, [query, tasks, projects, projectById, memberById, tasksByProject])

  // Reset highlight when the result set changes.
  useEffect(() => {
    setHighlight(0)
  }, [hits.length])

  const selectHit = (hit: Hit) => {
    if (hit.kind === 'task') {
      navigate(`/tasks/${hit.task.id}`)
    } else {
      navigate(`/board?project=${hit.project.id}`)
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[highlight]
      if (hit) selectHit(hit)
    }
  }

  if (!open) return null

  // Map a per-group local index back to the global index.
  const indexOfTask = (i: number) => i
  const indexOfProject = (i: number) => taskHits.length + i

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search workspace"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-4 md:pt-[10vh]"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search
            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search tasks and projects…"
            aria-label="Search workspace"
            className="h-8 flex-1 bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="hidden rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--text-muted)] sm:inline-flex">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!query ? (
            <Hint />
          ) : hits.length === 0 ? (
            <NoResults query={query} />
          ) : (
            <>
              {taskHits.length > 0 && (
                <Group title="Tasks">
                  {taskHits.map((hit, i) => {
                    const globalIdx = indexOfTask(i)
                    return (
                      <TaskRow
                        key={hit.task.id}
                        hit={hit}
                        active={highlight === globalIdx}
                        onHover={() => setHighlight(globalIdx)}
                        onClick={() => selectHit(hit)}
                      />
                    )
                  })}
                </Group>
              )}

              {projectHits.length > 0 && (
                <Group title="Projects">
                  {projectHits.map((hit, i) => {
                    const globalIdx = indexOfProject(i)
                    return (
                      <ProjectRow
                        key={hit.project.id}
                        hit={hit}
                        active={highlight === globalIdx}
                        onHover={() => setHighlight(globalIdx)}
                        onClick={() => selectHit(hit)}
                      />
                    )
                  })}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  )
}

function TaskRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: TaskHit
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
          active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]',
        )}
      >
        <ListChecks
          className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--text-primary)]">
            {hit.task.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            {hit.project && (
              <>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: hit.project.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{hit.project.name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="truncate">
              {hit.assignee ? hit.assignee.name : 'Unassigned'}
            </span>
          </p>
        </div>
        <StatusPill status={hit.task.status} />
      </button>
    </li>
  )
}

function ProjectRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: ProjectHit
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
          active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]',
        )}
      >
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: `color-mix(in srgb, ${hit.project.color} 20%, transparent)`,
          }}
        >
          <FolderOpen
            className="h-3.5 w-3.5"
            style={{ color: hit.project.color }}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[var(--text-primary)]">
            {hit.project.name}
          </p>
          {hit.project.description && (
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {hit.project.description}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
          {hit.taskCount} {hit.taskCount === 1 ? 'task' : 'tasks'}
        </span>
      </button>
    </li>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        No results for &lsquo;<span className="text-[var(--text-primary)]">{query}</span>&rsquo;.
      </p>
    </div>
  )
}

function Hint() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        Search across all your tasks and projects.
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Try a task title, project name, or description.
      </p>
    </div>
  )
}


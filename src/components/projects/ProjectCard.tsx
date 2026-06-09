import { Link } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { AvatarStack } from '@/components/shared/AvatarStack'
import { cn } from '@/lib/utils'
import { isOverdue, relativeTime } from '@/lib/date-utils'
import type { Project, Task, TeamMember } from '@/data/types'

interface ProjectCardProps {
  project: Project
  tasks: Task[]
  members: TeamMember[]
  canEdit: boolean
  onSettingsClick: () => void
}

export function ProjectCard({
  project,
  tasks,
  members,
  canEdit,
  onSettingsClick,
}: ProjectCardProps) {
  const open = tasks.filter((t) => t.status !== 'done').length
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && isOverdue(t.dueDate),
  ).length
  const done = tasks.filter((t) => t.status === 'done').length
  const total = open + done
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  const memberNames = project.memberIds
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => Boolean(n))

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-all duration-150 hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
        project.archived && 'opacity-70',
      )}
    >
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      />

      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden="true"
          />
          <h3 className="min-w-0 truncate text-[15px] font-semibold text-[var(--text-primary)]">
            {project.name}
          </h3>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSettingsClick()
            }}
            aria-label={`${project.name} settings`}
            className="pointer-events-auto -m-1 rounded p-1 text-[var(--text-muted)] opacity-0 transition-all duration-150 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] group-hover:opacity-100"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="relative z-10 line-clamp-2 text-sm text-[var(--text-secondary)] pointer-events-none">
        {project.description || (
          <span className="italic text-[var(--text-muted)]">No description.</span>
        )}
      </p>

      <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)] tabular-nums pointer-events-none">
        <span>{open} open</span>
        {overdue > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-[var(--priority-critical)]">{overdue} overdue</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{done} done</span>
      </div>

      <div
        className="relative z-10 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)] pointer-events-none"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% complete`}
      >
        <div
          className="h-full bg-[var(--status-done)] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 pointer-events-none">
        <AvatarStack names={memberNames} max={4} size="sm" />
        <span className="text-[11px] text-[var(--text-muted)]">
          Updated {relativeTime(project.updatedAt)}
        </span>
      </div>
    </article>
  )
}

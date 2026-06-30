import { Link } from 'react-router-dom'
import { ArrowRight, Radio, Settings, Table2 } from 'lucide-react'
import { AvatarStack } from '@/components/shared/AvatarStack'
import { cn } from '@/lib/utils'
import { isOverdue, relativeTime } from '@/lib/date-utils'
import { getProjectMembers } from '@/lib/project-members'
import type { Project, Task, TeamMember } from '@/data/types'

interface ProjectCardProps {
  project: Project
  tasks: Task[]
  members: TeamMember[]
  canEdit: boolean
  onSettingsClick: () => void
  /** True when this project came from the Atlas vault. Hides the
   *  settings/delete/archive affordances and renders a subtle "Atlas"
   *  badge. */
  isAtlasManaged?: boolean
  /** True when this project's tasks are synced from Google Sheets.
   *  Renders a small spreadsheet icon and the "Sheets" pill; the
   *  settings modal stays openable (PMs can still rename it), but
   *  delete/archive are hidden. */
  isSheetsManaged?: boolean
}

export function ProjectCard({
  project,
  tasks,
  members,
  canEdit,
  onSettingsClick,
  isAtlasManaged = false,
  isSheetsManaged = false,
}: ProjectCardProps) {
  const open = tasks.filter((t) => t.status !== 'done').length
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && isOverdue(t.dueDate),
  ).length
  const done = tasks.filter((t) => t.status === 'done').length
  const total = open + done
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  // Show only people with at least one task in this project — not the
  // full roster — so the avatar stack reflects actual activity.
  const memberNames = getProjectMembers(project.id, tasks, members).map(
    (m) => m.name,
  )

  return (
    <article
      // 4px coloured top border = the project's accent. Card stays
      // `rounded-lg` so the top corners stay rounded over the border.
      // min-h-[200px] keeps the grid visually consistent — short
      // descriptions don't shrink the card relative to siblings.
      style={{ borderTopColor: project.color }}
      className={cn(
        'group relative flex min-h-[200px] cursor-pointer flex-col gap-3 rounded-lg border border-[var(--border-subtle)] border-t-4 bg-[var(--bg-surface)] p-4 transition-all duration-150 hover:border-[var(--border-default)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
        project.archived && 'opacity-70',
      )}
    >
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      />
      {/* Quick-action label that materialises on hover. The whole card
          already navigates to /projects/<id> (board tab is the
          default), so this is a discoverable hint rather than a
          separate route — labelled prose beats an unlabelled arrow. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] opacity-0 transition-all duration-150 translate-x-[-4px] group-hover:translate-x-0 group-hover:opacity-100"
      >
        View Board
        <ArrowRight className="h-3.5 w-3.5" />
      </span>

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
          {isAtlasManaged && (
            <span
              className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--text-secondary)]"
              title="Managed in Atlas — settings, archive, and delete are disabled."
            >
              <Radio className="h-3 w-3" aria-hidden="true" />
              Atlas
            </span>
          )}
          {isSheetsManaged && (
            <span
              className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--status-done)]"
              title="Data from Google Sheets — 2026 Project Management spreadsheet"
            >
              <Table2 className="h-3 w-3" aria-hidden="true" />
              Sheets
            </span>
          )}
        </div>
        {canEdit && !isAtlasManaged && (
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

      <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
        <span>{open} open</span>
        {overdue > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--priority-critical)]"
            title={`${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`}
          >
            {overdue} overdue
          </span>
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

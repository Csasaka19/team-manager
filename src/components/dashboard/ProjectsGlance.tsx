import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { isOverdue } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Project, Task } from '@/data/types'

interface ProjectsGlanceProps {
  projects: Project[]
  tasks: Task[]
}

interface ProjectStats {
  open: number
  overdue: number
  done: number
  total: number
  /** null when total === 0 — UI renders "—%" instead of "0%". */
  pct: number | null
}

export function ProjectsGlance({ projects, tasks }: ProjectsGlanceProps) {
  const active = useMemo(
    () => projects.filter((p) => !p.archived),
    [projects],
  )
  const statsByProject = useMemo(() => {
    const map = new Map<string, ProjectStats>()
    for (const p of active) {
      map.set(p.id, { open: 0, overdue: 0, done: 0, total: 0, pct: null })
    }
    for (const t of tasks) {
      const stats = map.get(t.projectId)
      if (!stats) continue
      stats.total += 1
      if (t.status === 'done') {
        stats.done += 1
      } else {
        stats.open += 1
        if (isOverdue(t.dueDate)) stats.overdue += 1
      }
    }
    for (const s of map.values()) {
      s.pct = s.total === 0 ? null : Math.round((s.done / s.total) * 100)
    }
    return map
  }, [active, tasks])

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No active projects to glance at.
        </p>
      </div>
    )
  }

  return (
    // Negative inline margin lets the row bleed to the screen edges so the
    // horizontal scroll feels like a strip; the inner padding restores the
    // gutter on the first card.
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-3 pb-1">
        {active.map((p) => {
          const stats = statsByProject.get(p.id)!
          return (
            <li key={p.id}>
              <MiniProjectCard project={p} stats={stats} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MiniProjectCard({
  project,
  stats,
}: {
  project: Project
  stats: ProjectStats
}) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block w-[200px] shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {project.name}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-center">
        <ProgressRing pct={stats.pct} />
      </div>

      <p className="mt-2 text-center text-[11px] tabular-nums text-[var(--text-secondary)]">
        <span>{stats.open} open</span>
        <span aria-hidden="true"> · </span>
        <span
          className={cn(
            stats.overdue > 0
              ? 'font-medium text-[var(--priority-critical)]'
              : 'text-[var(--text-muted)]',
          )}
        >
          {stats.overdue} overdue
        </span>
      </p>
    </Link>
  )
}

/**
 * Circular progress ring. r=16, circumference ≈ 100.53; we use 100 as the
 * dasharray reference (close enough — the visual rounding under stroke-linecap
 * absorbs the difference). Rotated -90deg so the arc starts at 12 o'clock.
 */
function ProgressRing({ pct }: { pct: number | null }) {
  const display = pct === null ? '—' : `${pct}%`
  const stroke = pct ?? 0
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 36 36"
      aria-label={pct === null ? 'No tasks yet' : `${pct}% complete`}
      role="img"
      className="overflow-visible"
    >
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="none"
        stroke="var(--border-subtle)"
        strokeWidth="3"
      />
      {pct !== null && (
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${stroke} 100`}
          pathLength={100}
          transform="rotate(-90 18 18)"
          style={{ transition: 'stroke-dasharray 300ms ease-out' }}
        />
      )}
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="600"
        fill="var(--text-primary)"
      >
        {display}
      </text>
    </svg>
  )
}

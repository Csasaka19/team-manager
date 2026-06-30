import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FolderPlus, Plus } from 'lucide-react'
import { isOverdue } from '@/lib/date-utils'
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
        <FolderPlus
          className="h-8 w-8 text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          No projects yet
        </p>
        {/* `?new=1` is the same deep-link the ProjectsPage uses to
            auto-open the create modal. Non-PMs land on /projects with
            the param stripped (the page gates the modal on isPM). */}
        <Link
          to="/projects?new=1"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Project
        </Link>
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
  // Open/done ratio for the thin linear bar below the stats. We use
  // open+done (not stats.total) so partially-loaded data doesn't divide
  // the bar against ghost tasks; the values are interchangeable in
  // practice since `total` already excludes nothing.
  const ratioDenominator = stats.open + stats.done
  const donePct =
    ratioDenominator === 0 ? 0 : (stats.done / ratioDenominator) * 100

  return (
    <Link
      to={`/projects/${project.id}`}
      title={`Click to filter board to ${project.name}`}
      className="group block w-[200px] shrink-0 cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-all duration-150 hover:border-[color-mix(in_srgb,var(--accent-primary)_50%,transparent)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
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

      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] tabular-nums text-[var(--text-secondary)]">
        <span>{stats.open} open</span>
        {stats.overdue > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--priority-critical)]"
            title={`${stats.overdue} overdue ${stats.overdue === 1 ? 'task' : 'tasks'}`}
          >
            {stats.overdue} overdue
          </span>
        )}
      </div>

      {/* Thin linear progress mirror of the ring — gives the eye a
          horizontal reading of the open/done split alongside the
          radial one. */}
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(donePct)}
        aria-label={`${Math.round(donePct)}% done`}
      >
        <div
          className="h-full bg-[var(--status-done)] transition-[width] duration-200"
          style={{ width: `${donePct}%` }}
        />
      </div>
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
      {/* Center label — bumped from 9 to 11 SVG units (≈18px at the
          rendered 56×56 size) and weight 700 for the text-lg /
          font-bold treatment the spec calls for. */}
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="700"
        fill="var(--text-primary)"
      >
        {display}
      </text>
    </svg>
  )
}

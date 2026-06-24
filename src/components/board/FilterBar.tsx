import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { PRIORITY_LABELS, type Priority, type Project, type TeamMember } from '@/data/types'

export interface BoardFilters {
  projectId: string | 'all'
  assigneeId: string | 'all'
  priority: Priority | 'all'
  search: string
}

interface FilterBarProps {
  projects: Project[]
  members: TeamMember[]
  filters: BoardFilters
  onChange: (next: BoardFilters) => void
  /** Hide the project dropdown — used when the surrounding page already
   *  scopes the board to a single project (Project Detail's Board tab).
   *  The caller is expected to keep filters.projectId pinned to that
   *  project id; the filter bar just stops rendering the picker. */
  hideProjectFilter?: boolean
}

const SELECT_CLASS =
  'h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]'

export function FilterBar({
  projects,
  members,
  filters,
  onChange,
  hideProjectFilter = false,
}: FilterBarProps) {
  // Debounced search: the live input value lives locally, propagates after 300ms.
  const [searchInput, setSearchInput] = useState(filters.search)

  useEffect(() => {
    if (searchInput === filters.search) return
    const handle = setTimeout(() => {
      onChange({ ...filters, search: searchInput })
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  // Keep local input in sync when filters are cleared externally.
  useEffect(() => {
    if (filters.search === '' && searchInput !== '') {
      setSearchInput('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search])

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
      {!hideProjectFilter && (
        <label className="flex flex-col gap-1 md:flex-none">
          <span className="sr-only">Project</span>
          <select
            aria-label="Filter by project"
            className={SELECT_CLASS}
            value={filters.projectId}
            onChange={(e) => onChange({ ...filters, projectId: e.target.value })}
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 md:flex-none">
        <span className="sr-only">Assignee</span>
        <select
          aria-label="Filter by assignee"
          className={SELECT_CLASS}
          value={filters.assigneeId}
          onChange={(e) => onChange({ ...filters, assigneeId: e.target.value })}
        >
          <option value="all">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 md:flex-none">
        <span className="sr-only">Priority</span>
        <select
          aria-label="Filter by priority"
          className={SELECT_CLASS}
          value={filters.priority}
          onChange={(e) =>
            onChange({ ...filters, priority: e.target.value as Priority | 'all' })
          }
        >
          <option value="all">All Priorities</option>
          {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      <div className="relative flex-1 md:min-w-[200px]">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks…"
          className="h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-8 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
    </div>
  )
}

export function emptyFilters(): BoardFilters {
  return { projectId: 'all', assigneeId: 'all', priority: 'all', search: '' }
}

export function hasActiveFilters(f: BoardFilters): boolean {
  return (
    f.projectId !== 'all' ||
    f.assigneeId !== 'all' ||
    f.priority !== 'all' ||
    f.search.trim() !== ''
  )
}

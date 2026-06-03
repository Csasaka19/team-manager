import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FileText, Layers } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildAllTasksCSV,
  buildProjectSummaryCSV,
  downloadCSV,
  filenameDateStamp,
} from '@/lib/csv-export'
import { useData } from '@/data/store'
import { cn } from '@/lib/utils'

/**
 * "Export" button + dropdown in the Projects page header. Two options
 * today; structured so additional report variants slot in cleanly.
 */
export function ExportMenu() {
  const {
    tasks,
    projects,
    teamMembers,
    tags,
    statusLabels,
  } = useData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleAllTasks = () => {
    const csv = buildAllTasksCSV({
      tasks,
      projects,
      members: teamMembers,
      tags,
      statusLabels,
    })
    const filename = `team-manager-tasks-${filenameDateStamp()}.csv`
    downloadCSV(filename, csv)
    setOpen(false)
    toast.success(`Exported ${filename}`)
  }

  const handleProjectSummary = () => {
    const csv = buildProjectSummaryCSV({ projects, tasks })
    const filename = `team-manager-projects-${filenameDateStamp()}.csv`
    downloadCSV(filename, csv)
    setOpen(false)
    toast.success(`Exported ${filename}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        )}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Export
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="Export"
          className="absolute right-0 top-full z-30 mt-1 min-w-[240px] overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={handleAllTasks}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)]"
            >
              <FileText
                className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
              <span className="flex-1">Export all tasks (CSV)</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={handleProjectSummary}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)]"
            >
              <Layers
                className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
              <span className="flex-1">Export project summary (CSV)</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

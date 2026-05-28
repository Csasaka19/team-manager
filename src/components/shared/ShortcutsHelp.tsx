import { useEffect } from 'react'
import { X } from 'lucide-react'
import { SHORTCUTS, type ShortcutKey } from '@/lib/shortcuts'

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
  /** Hide the PM-only Dashboard shortcut for member-role users. */
  isPM: boolean
}

interface Row {
  shortcut: ShortcutKey
  label: string
  pmOnly?: boolean
}

interface Section {
  title: string
  rows: Row[]
}

const SECTIONS: Section[] = [
  {
    title: 'Global',
    rows: [
      { shortcut: 'palette', label: 'Open command palette' },
      { shortcut: 'paletteSlash', label: 'Focus search' },
      { shortcut: 'createTask', label: 'Create a new task', pmOnly: true },
      { shortcut: 'help', label: 'Show this help' },
      { shortcut: 'goDashboard', label: 'Go to Dashboard', pmOnly: true },
      { shortcut: 'goBoard', label: 'Go to Board' },
      { shortcut: 'goMyTasks', label: 'Go to My Tasks' },
      { shortcut: 'goProjects', label: 'Go to Projects' },
      { shortcut: 'goTeam', label: 'Go to Team' },
    ],
  },
  {
    title: 'Board',
    rows: [
      { shortcut: 'boardNavigate', label: 'Navigate between cards' },
      { shortcut: 'boardOpen', label: 'Open selected task' },
      { shortcut: 'boardPriority', label: 'Set priority (1 = critical … 4 = low)' },
    ],
  },
  {
    title: 'Task detail',
    rows: [
      { shortcut: 'taskAssignee', label: 'Focus assignee' },
      { shortcut: 'taskPriority', label: 'Focus priority' },
      { shortcut: 'taskStatus', label: 'Focus status' },
      { shortcut: 'taskDueDate', label: 'Focus due date' },
      { shortcut: 'taskComment', label: 'Jump to comment input' },
    ],
  },
]

export function ShortcutsHelp({ open, onClose, isPM }: ShortcutsHelpProps) {
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

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-[560px] overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2
              id="shortcuts-help-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Press <Kbd>?</Kbd> anytime to see this list. Shortcuts are disabled while typing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {SECTIONS.map((section) => {
            const rows = section.rows.filter((r) => !r.pmOnly || isPM)
            if (rows.length === 0) return null
            return (
              <section key={section.title}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
                  {section.title}
                </h3>
                <dl className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  {rows.map((row) => (
                    <ShortcutRow key={row.shortcut} row={row} />
                  ))}
                </dl>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ShortcutRow({ row }: { row: Row }) {
  const { keys } = SHORTCUTS[row.shortcut]
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-sm text-[var(--text-primary)]">{row.label}</dt>
      <dd className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <Kbd key={`${k}-${i}`}>{k}</Kbd>
        ))}
      </dd>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-primary)]">
      {children}
    </kbd>
  )
}

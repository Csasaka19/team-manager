import { Columns3, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardView } from '@/lib/board-view'

interface ViewToggleProps {
  value: BoardView
  onChange: (next: BoardView) => void
}

/**
 * Two-option segmented control for switching between the kanban Board view
 * and the flat List view. Rendered in the Board page header.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Board view"
      className="inline-flex h-9 items-center gap-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5"
    >
      <ToggleButton
        icon={Columns3}
        label="Board"
        active={value === 'kanban'}
        onClick={() => onChange('kanban')}
      />
      <ToggleButton
        icon={List}
        label="List"
        active={value === 'list'}
        onClick={() => onChange('list')}
      />
    </div>
  )
}

interface ToggleButtonProps {
  icon: typeof Columns3
  label: string
  active: boolean
  onClick: () => void
}

function ToggleButton({ icon: Icon, label, active, onClick }: ToggleButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label} view`}
      title={`${label} view`}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

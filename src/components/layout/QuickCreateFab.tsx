import { Plus } from 'lucide-react'

interface QuickCreateFabProps {
  onClick: () => void
}

/**
 * Bottom-right floating action button for creating a task.
 * Mobile-only — desktop users have the C shortcut and the command-palette
 * action, plus the `?` help button already sits in this corner on md+.
 */
export function QuickCreateFab({ onClick }: QuickCreateFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quick create task"
      className="fixed bottom-4 right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:hidden"
    >
      <Plus className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}

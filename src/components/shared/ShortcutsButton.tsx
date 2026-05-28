import { HelpCircle } from 'lucide-react'

interface ShortcutsButtonProps {
  onClick: () => void
}

export function ShortcutsButton({ onClick }: ShortcutsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      className="fixed bottom-4 right-4 z-30 hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:inline-flex"
    >
      <HelpCircle className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

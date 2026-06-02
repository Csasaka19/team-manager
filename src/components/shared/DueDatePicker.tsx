import { cn } from '@/lib/utils'
import { DUE_DATE_PRESETS } from '@/lib/date-utils'

interface DueDatePickerProps {
  value: string | null
  onChange: (next: string | null) => void
  /**
   * When true, picking a preset (or typing a custom date) is the user's final
   * action — the parent should close its popover. Defaults to `true` so most
   * callers don't have to think about it.
   */
  closeOnPick?: boolean
  /** Optional callback fired after a pick when `closeOnPick` is true. */
  onClose?: () => void
}

/**
 * The seven canonical presets plus a custom date input. Used inside every
 * due-date popover in the app (Quick Create, Bulk Action Bar, list-view
 * inline edit, task detail). Renders the preset row as a 2-column grid so
 * the modal/popover stays narrow.
 */
export function DueDatePicker({
  value,
  onChange,
  closeOnPick = true,
  onClose,
}: DueDatePickerProps) {
  const pick = (next: string | null) => {
    onChange(next)
    if (closeOnPick) onClose?.()
  }

  return (
    <div className="space-y-2 p-2">
      <div className="grid grid-cols-2 gap-1">
        {DUE_DATE_PRESETS.map((preset) => {
          const resolved = preset.resolve()
          const selected = resolved === value
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => pick(resolved)}
              className={cn(
                'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                selected
                  ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]',
              )}
            >
              <span className="truncate">{preset.label}</span>
              {resolved && (
                <span
                  className={cn(
                    'text-[10px] tabular-nums',
                    selected
                      ? 'text-[var(--text-inverse)] opacity-80'
                      : 'text-[var(--text-muted)]',
                  )}
                >
                  {new Date(resolved).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <label className="block border-t border-[var(--border-subtle)] pt-2">
        <span className="block px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
          Custom date
        </span>
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => pick(e.target.value === '' ? null : e.target.value)}
          className="h-8 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
        />
      </label>
    </div>
  )
}

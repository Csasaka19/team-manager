import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Semantic accent key — maps to a CSS variable backing the 4px left
 * border + tinted icon. Keeps colour choices centralised here rather
 * than letting every caller pick a raw class string.
 */
export type SummaryCardAccent = 'blue' | 'red' | 'amber' | 'green'

const ACCENT_VAR: Record<SummaryCardAccent, string> = {
  blue: '--accent-primary',
  red: '--priority-critical',
  amber: '--priority-medium',
  green: '--status-done',
}

interface SummaryCardProps {
  icon: LucideIcon
  label: string
  value: number
  /** Color treatment driving both the left-border accent and the icon
   *  tint. Defaults to the neutral secondary text colour so existing
   *  callers without a chosen palette still look sensible. */
  accent?: SummaryCardAccent
  /** When true and value > 0, render the number in the critical/red colour. */
  highlightWhenPositive?: boolean
  /**
   * When true and value > 0, run a subtle red box-shadow pulse every 5s to
   * draw the eye. Used by the Overdue card on the Dashboard.
   */
  pulseWhenPositive?: boolean
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  highlightWhenPositive = false,
  pulseWhenPositive = false,
}: SummaryCardProps) {
  const highlight = highlightWhenPositive && value > 0
  const pulse = pulseWhenPositive && value > 0
  // Resolved colour reference shared by the left border and the icon.
  // Falls back to the muted text colour when no accent is provided, so
  // the card still renders cleanly without a palette choice.
  const accentColor = accent ? `var(${ACCENT_VAR[accent]})` : 'var(--text-muted)'

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 transition-all duration-150 hover:border-[var(--border-default)] hover:shadow-md',
        // 4px coloured left border per spec — applied via inline style
        // so the colour comes from the resolved CSS variable.
        'border-l-4',
        pulse && 'animate-[pulseOverdue_5s_ease-in-out_infinite]',
      )}
      style={{ borderLeftColor: accentColor }}
    >
      {/* Top row — label + icon, icon pinned right with opacity-60 and
          tinted to the accent colour so each card carries its own
          visual identity. */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </p>
        <Icon
          className="h-6 w-6 shrink-0 opacity-60"
          strokeWidth={1.75}
          style={{ color: accentColor }}
          aria-hidden="true"
        />
      </div>

      <p
        className={cn(
          'mt-1 text-3xl font-bold leading-none tabular-nums',
          highlight ? 'text-[var(--priority-critical)]' : 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

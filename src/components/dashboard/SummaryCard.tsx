import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SummaryCardProps {
  icon: LucideIcon
  label: string
  value: number
  /** When true and value > 0, render the number in the critical/red color. */
  highlightWhenPositive?: boolean
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  highlightWhenPositive = false,
}: SummaryCardProps) {
  const highlight = highlightWhenPositive && value > 0
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-default)] md:p-5">
      <Icon
        className="h-6 w-6 text-[var(--text-secondary)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <p
        className={cn(
          'mt-3 text-[28px] font-semibold leading-none tabular-nums',
          highlight ? 'text-[var(--priority-critical)]' : 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

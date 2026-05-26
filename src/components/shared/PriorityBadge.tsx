import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, type Priority } from '@/data/types'

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

const PRIORITY_COLOR_VAR: Record<Priority, string> = {
  critical: '--priority-critical',
  high: '--priority-high',
  medium: '--priority-medium',
  low: '--priority-low',
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const colorVar = PRIORITY_COLOR_VAR[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.5px]',
        className,
      )}
      style={{
        color: `var(${colorVar})`,
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 15%, transparent)`,
      }}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

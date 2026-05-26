import { cn } from '@/lib/utils'
import { STATUS_LABELS, type TaskStatus } from '@/data/types'

interface StatusPillProps {
  status: TaskStatus
  className?: string
}

const STATUS_COLOR_VAR: Record<TaskStatus, string> = {
  todo: '--status-todo',
  in_progress: '--status-progress',
  in_review: '--status-review',
  done: '--status-done',
}

export function StatusPill({ status, className }: StatusPillProps) {
  const colorVar = STATUS_COLOR_VAR[status]
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
      {STATUS_LABELS[status]}
    </span>
  )
}

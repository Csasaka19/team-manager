import { cn } from '@/lib/utils'

const BASE = 'animate-pulse rounded bg-[var(--bg-elevated)]'

interface SkeletonLineProps {
  /** Tailwind width class, e.g. "w-24" or "w-full". Defaults to "w-full". */
  width?: string
  /** Tailwind height class, e.g. "h-3" or "h-5". Defaults to "h-3". */
  height?: string
  className?: string
}

export function SkeletonLine({
  width = 'w-full',
  height = 'h-3',
  className,
}: SkeletonLineProps) {
  return <div className={cn(BASE, width, height, className)} aria-hidden="true" />
}

interface SkeletonCardProps {
  className?: string
  children?: React.ReactNode
}

/** Standard outlined card shell used to host other skeleton primitives. */
export function SkeletonCard({ className, children }: SkeletonCardProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

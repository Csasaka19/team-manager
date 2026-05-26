import { Avatar, type AvatarSize } from './Avatar'
import { cn } from '@/lib/utils'

interface AvatarStackProps {
  names: string[]
  /** Maximum avatars to render before showing a "+N" overflow chip. */
  max?: number
  size?: AvatarSize
  className?: string
}

export function AvatarStack({ names, max = 4, size = 'sm', className }: AvatarStackProps) {
  if (names.length === 0) return null
  const visible = names.slice(0, max)
  const overflow = Math.max(0, names.length - visible.length)

  return (
    <div className={cn('flex items-center', className)}>
      {visible.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="-ml-2 first:ml-0 ring-2 ring-[var(--bg-surface)] rounded-full inline-flex"
          title={name}
        >
          <Avatar name={name} size={size} title={name} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="-ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--bg-elevated)] px-1.5 text-[10px] font-semibold text-[var(--text-secondary)] ring-2 ring-[var(--bg-surface)] tabular-nums"
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

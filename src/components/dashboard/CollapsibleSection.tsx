import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  /** Stable id — used as the localStorage key suffix to persist collapse state. */
  id: string
  title: string
  /** Optional right-side slot for filters / counts / etc. */
  controls?: React.ReactNode
  /** Optional sub-label below the heading. */
  subtitle?: string
  children: React.ReactNode
}

const KEY_PREFIX = 'team-manager.dashboard-section.'

function loadCollapsed(id: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY_PREFIX + id) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(id: string, collapsed: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_PREFIX + id, collapsed ? '1' : '0')
  } catch {
    // ignore
  }
}

/**
 * Section shell used across the PM dashboard. Each section's open/closed
 * state survives reloads independently — letting a PM customize their
 * density (collapse Activity, expand Projects at a Glance, etc.).
 */
export function CollapsibleSection({
  id,
  title,
  controls,
  subtitle,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed(id))

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      saveCollapsed(id, next)
      return next
    })
  }

  const headingId = `dashboard-section-${id}-heading`
  const panelId = `dashboard-section-${id}-panel`

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-controls={panelId}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          {collapsed ? (
            <ChevronRight
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden="true"
            />
          )}
          <span className="flex flex-col">
            <span
              id={headingId}
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-[var(--text-secondary)]">
                {subtitle}
              </span>
            )}
          </span>
        </button>
        {/* Hide controls while collapsed so they don't sit orphaned next to a
            closed section — they almost always act on the body content. */}
        {!collapsed && controls && <div>{controls}</div>}
      </div>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        hidden={collapsed}
        className={cn(collapsed && 'sr-only')}
      >
        {children}
      </div>
    </section>
  )
}

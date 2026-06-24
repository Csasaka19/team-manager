import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { isEditableElement } from '@/hooks/useKeyboardShortcuts'

export interface BreadcrumbItem {
  label: string
  /** When omitted, the segment renders as the current page (not clickable). */
  path?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  /** Disable the global Backspace → parent shortcut. Default: enabled. */
  disableBackspace?: boolean
}

/**
 * Top-of-page breadcrumb. Two layouts off the same `items` prop:
 *
 *   - md+: full trail with chevron separators, e.g.
 *     `Projects › Website Redesign › Board`
 *   - <md: a single `← Back` button that points at the parent
 *     (second-to-last segment), keeping the bar narrow on phones
 *
 * Also wires a global Backspace shortcut that navigates to the same
 * parent destination, so keyboard users get the same affordance.
 */
export function Breadcrumb({ items, disableBackspace = false }: BreadcrumbProps) {
  const navigate = useNavigate()
  const parent = findParent(items)

  useEffect(() => {
    if (disableBackspace || !parent) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      if (isEditableElement(e.target)) return
      e.preventDefault()
      navigate(parent.path)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate, parent, disableBackspace])

  if (items.length === 0) return null

  const desktopItems = collapseMiddle(items)

  return (
    <nav aria-label="Breadcrumb" className="text-[12px]">
      {parent && (
        <button
          type="button"
          onClick={() => navigate(parent.path)}
          className="inline-flex items-center gap-1.5 rounded text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:hidden"
          aria-label={`Back to ${parent.label}`}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Back
        </button>
      )}
      <ol className="hidden flex-wrap items-center gap-1 text-[var(--text-secondary)] md:flex">
        {desktopItems.map((item, i) => {
          const isLast = i === desktopItems.length - 1
          return (
            <li key={i} className="inline-flex items-center gap-1">
              {item.kind === 'ellipsis' ? (
                <span className="px-0.5 text-[var(--text-muted)]" aria-hidden="true">
                  …
                </span>
              ) : item.path && !isLast ? (
                <Link
                  to={item.path}
                  className="rounded px-0.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="px-0.5 text-[var(--text-primary)]"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

type DesktopItem =
  | { kind: 'item'; label: string; path?: string }
  | { kind: 'ellipsis' }

/**
 * The closest ancestor — second-to-last item with a path. Used by the
 * mobile back button and the Backspace shortcut. Skips entries
 * without a path so a label-only intermediate (rare) doesn't
 * silently break navigation.
 */
function findParent(items: BreadcrumbItem[]): { label: string; path: string } | null {
  for (let i = items.length - 2; i >= 0; i -= 1) {
    const item = items[i]
    if (item?.path) return { label: item.label, path: item.path }
  }
  return null
}

/**
 * If we have more than 3 segments, collapse the middle ones to an
 * ellipsis so the bar fits on narrower viewports. Always keeps the
 * first and last; the second-to-last (parent) gets kept too because
 * it's the most likely click target.
 */
function collapseMiddle(items: BreadcrumbItem[]): DesktopItem[] {
  if (items.length <= 3) {
    return items.map((it) => ({ kind: 'item', label: it.label, path: it.path }))
  }
  const first = items[0]!
  const parent = items[items.length - 2]!
  const last = items[items.length - 1]!
  return [
    { kind: 'item', label: first.label, path: first.path },
    { kind: 'ellipsis' },
    { kind: 'item', label: parent.label, path: parent.path },
    { kind: 'item', label: last.label, path: last.path },
  ]
}

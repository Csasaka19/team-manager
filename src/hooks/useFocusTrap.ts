import { useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      // Skip hidden / disabled / aria-hidden elements that querySelector
      // can't filter on its own.
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.offsetParent !== null,
  )
}

/**
 * Trap Tab / Shift+Tab navigation inside the container while `active` is
 * true. On mount: caches the previously-focused element and focuses the
 * first focusable inside the container. On unmount (or when `active` flips
 * to false): restores focus to the cached element.
 *
 * Intentionally narrow — doesn't fight inputs (they own arrow keys) or
 * Escape (each modal handles its own close). Just keeps Tab inside the
 * dialog and remembers where to land afterwards.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null

    // Move focus into the modal — first focusable, else the container itself.
    const initial = getFocusable(node)
    if (initial.length > 0) {
      initial[0]!.focus()
    } else if (node.tabIndex < 0) {
      node.tabIndex = -1
      node.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = getFocusable(node)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const target = e.target as HTMLElement
      // If focus has escaped the modal (unlikely but possible after a
      // dynamic re-render), pull it back to the first item.
      if (!node.contains(target)) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && target === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && target === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Only restore focus if the previous element is still in the DOM.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [active, ref])
}

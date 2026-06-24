import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const PREFIX = 'scroll_'

/**
 * sessionStorage-backed scroll restoration for list pages. Saves the
 * current `window.scrollY` while the user scrolls (rAF-throttled) and
 * restores it on mount so a round-trip list → detail → back lands
 * where the user left off.
 *
 * Call once at the top of a list page (no args). The hook keys by the
 * current route path automatically.
 *
 * The restore uses two `requestAnimationFrame` passes so the page has
 * a chance to render its rows before the scroll lands — single-frame
 * was racing the page content on slower devices.
 */
export function useScrollRestore(): void {
  const { pathname } = useLocation()

  useEffect(() => {
    const key = PREFIX + pathname
    let stored: number | null = null
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw !== null) {
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) stored = n
      }
    } catch {
      // sessionStorage unavailable — nothing to restore.
    }
    if (stored !== null) {
      // rAF twice: the first frame lets the page commit its initial
      // layout; the second frame lets any async list rows that
      // mounted in the first frame settle before we scroll.
      const target = stored
      let raf1 = 0
      let raf2 = 0
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          window.scrollTo(0, target)
        })
      })
      return () => {
        window.cancelAnimationFrame(raf1)
        window.cancelAnimationFrame(raf2)
      }
    }
    return undefined
  }, [pathname])

  useEffect(() => {
    const key = PREFIX + pathname
    let pending = false
    const onScroll = () => {
      if (pending) return
      pending = true
      window.requestAnimationFrame(() => {
        pending = false
        try {
          window.sessionStorage.setItem(key, String(Math.round(window.scrollY)))
        } catch {
          // ignore
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])
}

import { useEffect } from 'react'

const SUFFIX = ' — Team Manager'

/**
 * Set `document.title` to "<title> — Team Manager" while the component is
 * mounted, restoring the previous title on unmount. Pass `null` to opt out
 * (used by routes that don't have a stable title yet).
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return
    const prev = document.title
    document.title = `${title}${SUFFIX}`
    return () => {
      document.title = prev
    }
  }, [title])
}

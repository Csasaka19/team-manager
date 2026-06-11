import { useCallback, useEffect, useRef, useState } from 'react'
import { AtlasApiError, type AtlasErrorCode } from '@/services/atlas/client'

export interface AtlasFetchState<T> {
  data: T | null
  error: AtlasFetchError | null
  loading: boolean
  /** Re-runs the loader, bypassing the abort cleanup of the previous run. */
  reload: () => void
}

export interface AtlasFetchError {
  code: AtlasErrorCode
  message: string
  status: number
  detail?: string
}

/**
 * Generic loader for any Atlas endpoint. Pass a stable `loader` callback
 * (memoise with useCallback if it closes over props) and the deps that
 * should trigger a refetch — usually any query input you pass to the
 * endpoint. The hook hands an AbortSignal to your loader so an in-flight
 * request is cancelled when deps change.
 */
export function useAtlas<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AtlasFetchState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<AtlasFetchError | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [reloadKey, setReloadKey] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    setError(null)

    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (cancelled) return
        setData(value)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof AtlasApiError) {
          const next: AtlasFetchError = {
            code: err.code,
            message: err.message,
            status: err.status,
          }
          if (err.detail !== undefined) next.detail = err.detail
          setError(next)
        } else {
          setError({
            code: 'http',
            message: err instanceof Error ? err.message : String(err),
            status: 0,
          })
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { data, error, loading, reload }
}

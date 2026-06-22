/**
 * Auto-connect / auto-disconnect the ZoomBot WebSocket based on
 * component lifecycle. Drop this into any component that needs live
 * data (the live meeting view, a global "meeting in progress" banner,
 * etc.). The ref-counted lifecycle in `ZoomBotProvider` means multiple
 * components calling this share one open socket; the last to unmount
 * closes it.
 *
 * Components that only need RECORDINGS (past meetings, playback) don't
 * need this hook — they call `fetchRecordings()` on the context
 * directly. The recordings endpoint is plain REST and doesn't need a
 * persistent connection.
 */

import { useEffect } from 'react'
import { useZoomBot } from './useZoomBot'

export function useZoomBotConnection(): void {
  const { connectWebSocket, disconnectWebSocket } = useZoomBot()
  useEffect(() => {
    connectWebSocket()
    return () => disconnectWebSocket()
  }, [connectWebSocket, disconnectWebSocket])
}

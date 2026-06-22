/**
 * Detects whether a ZoomBot meeting is happening WITHOUT keeping a
 * WebSocket open the whole time the user has the app loaded.
 *
 * Lifecycle:
 *   1. On mount, immediately fetch /api/state via REST.
 *   2. If the snapshot has at least one active/joining bot →
 *      `connectWebSocket()`. The socket sends a fresh 'state' message
 *      on open which overwrites our REST snapshot with the live one.
 *   3. If the snapshot has no active bots → schedule a 60s poll loop.
 *   4. When the WS picks up `allStopped` (or any state change that
 *      drops hasActiveMeeting back to false), we tear down the WS and
 *      resume polling on the same 60s cadence.
 *
 * Polling pauses while the WS is open — the WS is authoritative and
 * the REST endpoint would just duplicate work.
 *
 * Designed to be mounted exactly once at the Layout level. Multiple
 * mounts would each call `connectWebSocket()` on transition, which
 * the context's ref counter handles, but it'd waste polls. Stick to
 * one consumer.
 */

import { useEffect, useRef } from 'react'
import { isZoomBotConfigured } from '@/services/zoombot-config'
import { useZoomBot } from './useZoomBot'

const POLL_INTERVAL_MS = 60_000

export function useZoomBotMeetingDetection(): void {
  const {
    hasActiveMeeting,
    pollState,
    connectWebSocket,
    disconnectWebSocket,
  } = useZoomBot()
  /** Tracks whether THIS hook instance has opened the WS, so we don't
   *  double-call connect/disconnect across renders. */
  const wsOwnedRef = useRef<boolean>(false)

  // Polling loop. Pauses while a meeting is active (WS owns state).
  useEffect(() => {
    if (!isZoomBotConfigured()) return
    if (hasActiveMeeting) return

    void pollState()
    const id = window.setInterval(() => {
      void pollState()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [hasActiveMeeting, pollState])

  // WS lifecycle keyed on hasActiveMeeting. We track ownership in a
  // ref so the cleanup only releases what THIS hook acquired.
  useEffect(() => {
    if (!isZoomBotConfigured()) return
    if (hasActiveMeeting && !wsOwnedRef.current) {
      connectWebSocket()
      wsOwnedRef.current = true
    } else if (!hasActiveMeeting && wsOwnedRef.current) {
      disconnectWebSocket()
      wsOwnedRef.current = false
    }
  }, [hasActiveMeeting, connectWebSocket, disconnectWebSocket])

  // On unmount, always release whatever we acquired. Otherwise a
  // logout / route teardown could leak the connection.
  useEffect(() => {
    return () => {
      if (wsOwnedRef.current) {
        disconnectWebSocket()
        wsOwnedRef.current = false
      }
    }
  }, [disconnectWebSocket])
}

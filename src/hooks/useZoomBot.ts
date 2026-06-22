/**
 * ZoomBot React context — wraps the WebSocket singleton and REST client
 * in a React-friendly shape.
 *
 * Lifecycle model (important):
 *
 *   - The provider DOES NOT auto-connect on mount. It just registers
 *     listeners on the singleton (cheap — listeners only fire when the
 *     socket is actually open, which itself only happens on explicit
 *     connect).
 *   - `connectWebSocket()` and `disconnectWebSocket()` are ref-counted
 *     at the context layer. Multiple components calling connect share
 *     one open socket; the last component to disconnect closes it.
 *   - `useZoomBotConnection()` (separate file) is the ergonomic wrapper
 *     for components that need a live connection while mounted.
 *
 * Caption dedup model:
 *
 *   ZoomBot streams growing snapshots of the current utterance — the
 *   text gets longer as the speaker talks. We hold a single rolling
 *   buffer (last 200 entries) and, for each incoming caption, look for
 *   the latest entry from the same (roomName, speaker). If the new
 *   text continues the old (same text or starts-with), we REPLACE that
 *   entry in place. If the new text is unrelated, the previous entry
 *   stays in the buffer as a finalized utterance and we APPEND the
 *   new one.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchBotState,
  fetchRecordings as fetchRecordingsApi,
} from '@/services/zoombot-api'
import {
  buildZoomBotBotErrorEmbed,
  buildZoomBotMeetingEndedEmbed,
  buildZoomBotMeetingStartedEmbed,
  sendDiscordWebhook,
  type DiscordEmbed,
  type DiscordEvent,
  type DiscordSettings,
} from '@/services/discord'
import { useData } from '@/data/store'
import { zoomBotWS } from '@/services/zoombot-websocket'
import type {
  LiveCaption,
  ZoomBot,
  ZoomBotState,
  ZoomBotStatus,
  ZoomRecording,
} from '@/services/zoombot-types'

const CAPTION_BUFFER_SIZE = 200
const ACTIVE_BOT_STATUSES: ReadonlySet<ZoomBotStatus> = new Set([
  'active',
  'joining',
])

export interface ZoomBotContextValue {
  // Connection
  isConnected: boolean
  isReconnecting: boolean
  connectionError: string | null

  // State
  botState: ZoomBotState | null
  activeBots: ZoomBot[]
  hasActiveMeeting: boolean

  // Live captions
  captions: LiveCaption[]
  captionsByRoom: Map<string, LiveCaption[]>

  // Audio activity (botId → bytes since last tick). Not in the spec's
  // interface literally but the spec says "store for activity
  // indicators" — exposing it so future indicator components can read it.
  audioStats: Record<number, number>

  // Recordings (fetched on demand)
  recordings: ZoomRecording[] | null
  recordingsLoading: boolean
  fetchRecordings: () => Promise<void>

  // Actions
  connectWebSocket: () => void
  disconnectWebSocket: () => void
  /** One-shot REST snapshot from /api/state. Used by the meeting-
   *  detection poller while the WebSocket is closed; the WebSocket
   *  takes over once it's open. Errors are swallowed (logged) so the
   *  caller doesn't have to wrap in try/catch. */
  pollState: () => Promise<void>
}

const ZoomBotContext = createContext<ZoomBotContextValue | null>(null)

export function ZoomBotProvider({ children }: { children: ReactNode }) {
  const [botState, setBotState] = useState<ZoomBotState | null>(null)
  const [captions, setCaptions] = useState<LiveCaption[]>([])
  const [audioStats, setAudioStats] = useState<Record<number, number>>({})
  const [recordings, setRecordings] = useState<ZoomRecording[] | null>(null)
  const [recordingsLoading, setRecordingsLoading] = useState<boolean>(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connectionTick, setConnectionTick] = useState<number>(0)

  // Ref-counted lifecycle. The singleton has its own acquire/release
  // but the context owns its OWN count so a misbehaved consumer can't
  // accidentally close the socket on other consumers.
  const refCountRef = useRef<number>(0)
  const releaseRef = useRef<(() => void) | null>(null)

  // Discord settings live on the Data store. We mirror them into a ref
  // so the WebSocket listeners (set up once on mount) can read the
  // CURRENT settings instead of a stale closure capture.
  const { discordSettings } = useData()
  const discordSettingsRef = useRef<DiscordSettings>(discordSettings)
  useEffect(() => {
    discordSettingsRef.current = discordSettings
  }, [discordSettings])

  const fireDiscord = useCallback(
    (event: DiscordEvent, builder: () => DiscordEmbed) => {
      const settings = discordSettingsRef.current
      if (!settings.webhookUrl) return
      if (!settings.events[event]) return
      void sendDiscordWebhook(settings.webhookUrl, { embeds: [builder()] })
    },
    [],
  )

  // Mirror of botState so the per-event listeners can read current bot
  // metadata (target names, dataSize) at the moment the event fires.
  const botStateRef = useRef<ZoomBotState | null>(null)
  useEffect(() => {
    botStateRef.current = botState
  }, [botState])

  // Tracks the start of the CURRENT meeting so the "ended" embed can
  // compute a duration. Set on the rising edge of hasActiveMeeting.
  const meetingStartRef = useRef<{ startedAt: number; sessionId: string } | null>(
    null,
  )

  // ── Wire up listeners once on mount ────────────────────────────────
  // These stay registered for the provider's whole lifetime. They only
  // fire when the socket is actually open, so registering early is free.
  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      zoomBotWS.on('state', (data) => {
        setBotState(data as ZoomBotState)
      }),
    )

    unsubs.push(
      zoomBotWS.on('botStatus', (data) => {
        const payload = data as {
          botId: number
          roomIndex: number
          status: ZoomBotStatus
        }
        setBotState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            bots: prev.bots.map((b) =>
              b.id === payload.botId ? { ...b, status: payload.status } : b,
            ),
          }
        })
      }),
    )

    unsubs.push(
      zoomBotWS.on('caption', (data) => {
        const payload = data as {
          botId: number
          roomIndex: number
          roomName: string
          text: string
          speaker: string
        }
        const stamped: LiveCaption = {
          botId: payload.botId,
          roomIndex: payload.roomIndex,
          roomName: payload.roomName,
          text: payload.text,
          speaker: payload.speaker,
          timestamp: Date.now(),
        }
        setCaptions((prev) => mergeCaption(prev, stamped))
      }),
    )

    unsubs.push(
      zoomBotWS.on('audioStats', (data) => {
        setAudioStats(data as Record<number, number>)
      }),
    )

    unsubs.push(
      zoomBotWS.on('deployed', (data) => {
        const payload = data as { botId: number; name: string; target: string }
        setBotState((prev) => {
          if (!prev) {
            return {
              sessionId: '',
              bots: [
                {
                  id: payload.botId,
                  name: payload.name,
                  target: payload.target,
                  status: 'configured',
                  dataSize: 0,
                  recordingFile: null,
                },
              ],
            }
          }
          // If the bot already exists, refresh its name/target; otherwise
          // add it.
          const exists = prev.bots.some((b) => b.id === payload.botId)
          if (exists) {
            return {
              ...prev,
              bots: prev.bots.map((b) =>
                b.id === payload.botId
                  ? { ...b, name: payload.name, target: payload.target }
                  : b,
              ),
            }
          }
          return {
            ...prev,
            bots: [
              ...prev.bots,
              {
                id: payload.botId,
                name: payload.name,
                target: payload.target,
                status: 'configured',
                dataSize: 0,
                recordingFile: null,
              },
            ],
          }
        })
      }),
    )

    unsubs.push(
      zoomBotWS.on('botError', (data) => {
        const payload = data as { botId: number; error: string }
        setConnectionError(`Bot ${payload.botId}: ${payload.error}`)
        setBotState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            bots: prev.bots.map((b) =>
              b.id === payload.botId ? { ...b, status: 'error' } : b,
            ),
          }
        })
        // Look the bot up from the latest state for the embed payload.
        // Fall back to a numeric label if we don't have the metadata yet
        // (rare — usually the bot is in state before any error fires).
        const bot = botStateRef.current?.bots.find((b) => b.id === payload.botId)
        fireDiscord('zoombot_bot_error', () =>
          buildZoomBotBotErrorEmbed({
            botName: bot?.name ?? `Bot ${payload.botId}`,
            botTarget: bot?.target ?? '—',
            errorMessage: payload.error,
          }),
        )
      }),
    )

    unsubs.push(
      zoomBotWS.on('botsUpdated', (data) => {
        const bots = data as ZoomBot[]
        setBotState((prev) => {
          if (!prev) return { sessionId: '', bots }
          return { ...prev, bots }
        })
      }),
    )

    unsubs.push(
      zoomBotWS.on('allStopped', () => {
        setBotState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            bots: prev.bots.map((b) => ({ ...b, status: 'stopped' })),
          }
        })
      }),
    )

    // Status changes (open / close / reconnect scheduled) — bump the
    // tick so `isConnected` / `isReconnecting` re-read.
    unsubs.push(
      zoomBotWS.onStatusChange(() => {
        setConnectionTick((n) => n + 1)
      }),
    )

    return () => {
      for (const u of unsubs) u()
    }
  }, [])

  // ── Connection actions ─────────────────────────────────────────────

  const connectWebSocket = useCallback(() => {
    refCountRef.current += 1
    if (refCountRef.current === 1) {
      releaseRef.current = zoomBotWS.acquire()
    }
  }, [])

  const disconnectWebSocket = useCallback(() => {
    refCountRef.current = Math.max(0, refCountRef.current - 1)
    if (refCountRef.current === 0 && releaseRef.current) {
      releaseRef.current()
      releaseRef.current = null
    }
  }, [])

  // ── Recordings ─────────────────────────────────────────────────────

  const fetchRecordings = useCallback(async () => {
    setRecordingsLoading(true)
    setConnectionError(null)
    try {
      const list = await fetchRecordingsApi()
      setRecordings(list)
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      setRecordingsLoading(false)
    }
  }, [])

  const pollState = useCallback(async () => {
    try {
      const state = await fetchBotState()
      setBotState(state)
    } catch (err) {
      // Poll failures are noisy by nature — log at warn so they're
      // visible in devtools but don't trigger any UI red-banner.
      // eslint-disable-next-line no-console
      console.warn(
        '[zoombot] /api/state poll failed',
        err instanceof Error ? err.message : err,
      )
    }
  }, [])

  // ── Derived ────────────────────────────────────────────────────────

  // `connectionTick` participates so `useMemo` / `useState` updates
  // pick up status changes without anyone polling the singleton.
  const isConnected = useMemo(() => {
    void connectionTick
    return zoomBotWS.isConnected
  }, [connectionTick])

  const isReconnecting = useMemo(() => {
    void connectionTick
    return zoomBotWS.reconnecting
  }, [connectionTick])

  const activeBots = useMemo(() => {
    if (!botState) return []
    return botState.bots.filter((b) => ACTIVE_BOT_STATUSES.has(b.status))
  }, [botState])

  const hasActiveMeeting = activeBots.length > 0

  // Discord meeting-started / meeting-ended embeds fire on the
  // hasActiveMeeting edges. `meetingStartRef` carries the start
  // metadata across the active period so the ended embed has a
  // duration + session id to render.
  useEffect(() => {
    if (hasActiveMeeting && meetingStartRef.current === null) {
      const sessionId = botStateRef.current?.sessionId ?? ''
      const targets = activeBots
        .map((b) => b.target)
        .filter((t): t is string => Boolean(t))
      meetingStartRef.current = { startedAt: Date.now(), sessionId }
      fireDiscord('zoombot_meeting_started', () =>
        buildZoomBotMeetingStartedEmbed({
          sessionId,
          activeBotCount: activeBots.length,
          targets,
        }),
      )
    } else if (!hasActiveMeeting && meetingStartRef.current !== null) {
      const { startedAt, sessionId } = meetingStartRef.current
      const totalBytes = (botStateRef.current?.bots ?? []).reduce(
        (sum, b) => sum + (b.dataSize ?? 0),
        0,
      )
      meetingStartRef.current = null
      fireDiscord('zoombot_meeting_ended', () =>
        buildZoomBotMeetingEndedEmbed({
          sessionId,
          durationMs: Date.now() - startedAt,
          totalBytes,
        }),
      )
    }
  }, [hasActiveMeeting, activeBots, fireDiscord])

  const captionsByRoom = useMemo(() => {
    const map = new Map<string, LiveCaption[]>()
    for (const c of captions) {
      const arr = map.get(c.roomName)
      if (arr) {
        arr.push(c)
      } else {
        map.set(c.roomName, [c])
      }
    }
    return map
  }, [captions])

  // Clear any lingering connectionError after a successful reconnect.
  useEffect(() => {
    if (isConnected && connectionError) {
      setConnectionError(null)
    }
    // Only run on connection-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  const value = useMemo<ZoomBotContextValue>(
    () => ({
      isConnected,
      isReconnecting,
      connectionError,
      botState,
      activeBots,
      hasActiveMeeting,
      captions,
      captionsByRoom,
      audioStats,
      recordings,
      recordingsLoading,
      fetchRecordings,
      connectWebSocket,
      disconnectWebSocket,
      pollState,
    }),
    [
      isConnected,
      isReconnecting,
      connectionError,
      botState,
      activeBots,
      hasActiveMeeting,
      captions,
      captionsByRoom,
      audioStats,
      recordings,
      recordingsLoading,
      fetchRecordings,
      connectWebSocket,
      disconnectWebSocket,
      pollState,
    ],
  )

  return createElement(ZoomBotContext.Provider, { value }, children)
}

export function useZoomBot(): ZoomBotContextValue {
  const ctx = useContext(ZoomBotContext)
  if (!ctx) {
    throw new Error('useZoomBot must be used inside a <ZoomBotProvider>')
  }
  return ctx
}

// ── Caption merge (pure) ───────────────────────────────────────────────

/**
 * Caption dedup: if the incoming caption is from the same (room,
 * speaker) as the most recent buffered entry for that key AND its text
 * extends (or equals) the buffered text, REPLACE in place. Otherwise
 * APPEND, evicting the oldest entry if the buffer would exceed 200.
 *
 * Pure for testability — no side effects, no React state.
 */
function mergeCaption(prev: LiveCaption[], incoming: LiveCaption): LiveCaption[] {
  // Scan from the end — newest entries are at the tail, and we only
  // need to find the LAST one matching the (roomName, speaker) key.
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const c = prev[i]
    if (!c) continue
    if (c.roomName !== incoming.roomName || c.speaker !== incoming.speaker) continue
    // Found the latest entry for this speaker+room. Is the incoming
    // text an extension?
    if (incoming.text === c.text || incoming.text.startsWith(c.text)) {
      const next = prev.slice()
      next[i] = incoming
      return next
    }
    // The latest entry from the same speaker is a DIFFERENT utterance
    // (text mismatch and not a prefix-extension). Stop scanning — the
    // earlier entries from this speaker are even older utterances.
    break
  }
  // Append; trim oldest if over the buffer cap.
  const next = prev.length >= CAPTION_BUFFER_SIZE
    ? prev.slice(prev.length - (CAPTION_BUFFER_SIZE - 1))
    : prev.slice()
  next.push(incoming)
  return next
}

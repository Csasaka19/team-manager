/**
 * Type definitions for the ZoomBot meeting-recording / live-transcription
 * API. These match the REST envelope and the WebSocket message shapes
 * exactly — any drift between this file and the live API is a bug to
 * fix here, never to paper over downstream.
 */

export type ZoomBotStatus =
  | 'configured'
  | 'idle'
  | 'joining'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'error'

export interface ZoomBot {
  id: number
  name: string
  target: string
  status: ZoomBotStatus
  /** Audio buffer / capture size in bytes since the bot started. */
  dataSize: number
  /** Relative path to the recording file once one exists; null until
   *  recording has produced output. */
  recordingFile: string | null
}

export interface ZoomBotState {
  sessionId: string
  bots: ZoomBot[]
}

export type ZoomRecordingType = 'audio' | 'video' | 'captions' | 'session'

export interface ZoomRecording {
  name: string
  /** Server-side path passed back to `/api/recordings/file?path=` to
   *  fetch the actual bytes. */
  path: string
  size: number
  /** ISO timestamp of last modification, used for sorting. */
  modified: string
  type: ZoomRecordingType
}

/** Live caption row, augmented with a client-side timestamp the WS
 *  payload doesn't include. The WebSocket manager stamps it on receipt
 *  so the UI can render age / sort without depending on server clocks. */
export interface LiveCaption {
  botId: number
  roomIndex: number
  roomName: string
  text: string
  speaker: string
  /** Milliseconds since epoch — set by the client on receipt. */
  timestamp: number
}

// ── WebSocket envelope ──────────────────────────────────────────────────

/**
 * Discriminated union of every WebSocket message the server can push.
 * Add a new variant + bump the matching consumer in
 * `zoombot-websocket.ts` whenever the API grows a new event type.
 */
export type ZoomWSMessage =
  | { type: 'state'; data: ZoomBotState }
  | {
      type: 'botStatus'
      data: { botId: number; roomIndex: number; status: ZoomBotStatus }
    }
  | {
      type: 'caption'
      data: {
        botId: number
        roomIndex: number
        roomName: string
        text: string
        speaker: string
      }
    }
  | {
      type: 'audioStats'
      /** Map of botId → byte count since last tick. */
      data: Record<number, number>
    }
  | {
      type: 'deployed'
      data: { botId: number; name: string; target: string }
    }
  | { type: 'botError'; data: { botId: number; error: string } }
  | { type: 'allStopped'; data: unknown[] }
  | { type: 'botsUpdated'; data: ZoomBot[] }

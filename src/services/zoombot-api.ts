/**
 * Read-only REST client for the ZoomBot service.
 *
 * Three exported helpers:
 *
 *   - fetchBotState(): live `/api/state` snapshot of the session + every
 *     deployed bot. Use this for the initial render of a live meeting
 *     view before subscribing to WebSocket updates.
 *   - fetchRecordings(): every recording in the cache, newest first.
 *   - getRecordingUrl(path): returns a URL safe to drop into
 *     `<audio src={}>` / `<video src={}>`. The server supports HTTP Range
 *     requests so players can seek without proxying the bytes through us.
 *   - fetchTranscriptText(path): reads a transcript file as text.
 *
 * Every fetch is bounded by a 10s timeout via AbortController. Network
 * failures throw with a human-readable message; the caller decides
 * whether to render an error state or retry.
 *
 * No write operations live here on purpose — deploy / stop / configure
 * endpoints exist on the server but are deliberately not wired so the
 * integration stays observably read-only until we explicitly opt in.
 */

import { getZoomBotConfig } from './zoombot-config'
import type { ZoomBotState, ZoomRecording } from './zoombot-types'

const REQUEST_TIMEOUT_MS = 10_000

export class ZoomBotApiError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ZoomBotApiError'
    this.status = status
  }
}

/**
 * Wraps `fetch` with a 10-second timeout and a uniform error shape.
 * Returns the raw Response — callers handle parsing so they can pick
 * `.json()` or `.text()` as appropriate.
 */
async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ZoomBotApiError(
        `ZoomBot request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`,
      )
    }
    throw new ZoomBotApiError(
      `Could not reach the ZoomBot service. Check VITE_ZOOMBOT_URL and your network. (${
        err instanceof Error ? err.message : String(err)
      })`,
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Live state snapshot: the active session id + every bot's status. */
export async function fetchBotState(): Promise<ZoomBotState> {
  const { baseUrl } = getZoomBotConfig()
  const res = await timedFetch(`${baseUrl}/api/state`)
  if (!res.ok) {
    throw new ZoomBotApiError(
      `Failed to fetch ZoomBot state (HTTP ${res.status}).`,
      res.status,
    )
  }
  try {
    return (await res.json()) as ZoomBotState
  } catch (err) {
    throw new ZoomBotApiError(
      `ZoomBot returned a non-JSON response for /api/state: ${
        err instanceof Error ? err.message : String(err)
      }`,
      res.status,
    )
  }
}

/** Every recording in the cache, server-sorted newest-first. */
export async function fetchRecordings(): Promise<ZoomRecording[]> {
  const { baseUrl } = getZoomBotConfig()
  const res = await timedFetch(`${baseUrl}/api/recordings`)
  if (!res.ok) {
    throw new ZoomBotApiError(
      `Failed to fetch recordings list (HTTP ${res.status}).`,
      res.status,
    )
  }
  let payload: unknown
  try {
    payload = await res.json()
  } catch (err) {
    throw new ZoomBotApiError(
      `ZoomBot returned a non-JSON response for /api/recordings: ${
        err instanceof Error ? err.message : String(err)
      }`,
      res.status,
    )
  }
  // Accept either `[...]` directly or `{ files: [...] }` — the spec says
  // a `files` array, but a future iteration might flatten the envelope.
  if (Array.isArray(payload)) return payload as ZoomRecording[]
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { files?: unknown }).files)
  ) {
    return (payload as { files: ZoomRecording[] }).files
  }
  throw new ZoomBotApiError(
    'ZoomBot returned an unexpected /api/recordings shape — expected an array or `{ files: [...] }`.',
    res.status,
  )
}

/**
 * Build a URL that streams the file bytes. Suitable to assign directly
 * to `<audio src>`, `<video src>`, or `<a href download>` because the
 * server honors HTTP Range — players seek without proxying through JS.
 */
export function getRecordingUrl(path: string): string {
  const { baseUrl } = getZoomBotConfig()
  return `${baseUrl}/api/recordings/file?path=${encodeURIComponent(path)}`
}

/**
 * Fetch a recording (typically a transcript) as plain text. Same
 * endpoint as `getRecordingUrl` — for binary media use the URL directly
 * in a media element instead so the browser streams it.
 */
export async function fetchTranscriptText(path: string): Promise<string> {
  const url = getRecordingUrl(path)
  const res = await timedFetch(url)
  if (!res.ok) {
    throw new ZoomBotApiError(
      `Failed to fetch transcript (HTTP ${res.status}): ${path}`,
      res.status,
    )
  }
  return res.text()
}

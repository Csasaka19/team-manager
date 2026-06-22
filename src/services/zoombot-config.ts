/**
 * ZoomBot endpoint resolution.
 *
 * Lookup order (highest precedence wins):
 *   1. localStorage[zoombot_base_url] — runtime override, set from a
 *      future Settings panel without touching .env.
 *   2. VITE_ZOOMBOT_URL — build-time default from .env.
 *   3. Hardcoded fallback `https://n8n.dsliked.work.gd`.
 *
 * `wsUrl` is derived from `baseUrl` so the two never drift — swap
 * `https://` → `wss://` (and `http://` → `ws://`). Anything else passes
 * through unchanged so a custom scheme (e.g. a future tailscale relay)
 * still works.
 */

const STORAGE_KEY = 'zoombot_base_url'
const HARDCODED_FALLBACK = 'https://n8n.dsliked.work.gd'

export interface ZoomBotConfig {
  baseUrl: string
  wsUrl: string
}

function readLocalStorageOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

function readEnv(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) {
    return 'wss://' + httpUrl.slice('https://'.length)
  }
  if (httpUrl.startsWith('http://')) {
    return 'ws://' + httpUrl.slice('http://'.length)
  }
  // Already a websocket scheme or something else — pass through.
  return httpUrl
}

export function getZoomBotConfig(): ZoomBotConfig {
  const baseUrl = stripTrailingSlash(
    readLocalStorageOverride() ||
      readEnv('VITE_ZOOMBOT_URL') ||
      HARDCODED_FALLBACK,
  )
  return {
    baseUrl,
    wsUrl: toWebSocketUrl(baseUrl),
  }
}

/** Persist a runtime override of the base URL. Empty/null clears it. */
export function setZoomBotBaseUrl(url: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (!url || !url.trim()) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, url.trim())
    }
  } catch {
    // Quota / private-mode storage failure — silently degrade.
  }
}

/** True iff we have any URL to talk to, including the hardcoded
 *  fallback. Use this as the "is the integration usable" check before
 *  mounting components that depend on the WebSocket or REST endpoints. */
export function isZoomBotConfigured(): boolean {
  return Boolean(getZoomBotConfig().baseUrl)
}

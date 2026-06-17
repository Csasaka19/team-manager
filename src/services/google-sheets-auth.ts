/**
 * Google Sheets OAuth: turn a long-lived refresh token into a short-lived
 * access token, kept in memory only.
 *
 * SECURITY NOTE: This module uses the OAuth client_secret + refresh_token
 * in the browser. Anyone with devtools open can read them out of the
 * compiled JS bundle and mint access tokens against the same Google
 * account. That's acceptable for an internal Tailscale-only tool but NOT
 * for a public deployment — for that case, proxy the token refresh
 * through your own backend so neither secret reaches the browser. We
 * deliberately do NOT persist the access token to localStorage either
 * (lower exposure window if the device is compromised).
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
/** Refresh 5 minutes before the actual expiry so we never use a token in
 *  the grace window between staleness and rejection. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

interface TokenState {
  accessToken: string
  expiresAt: number
}

/** In-memory store. Module-scoped — every page in the SPA shares one
 *  token, but a hard reload reissues. */
let currentToken: TokenState | null = null

/** Single-flight guard so concurrent callers during a refresh share the
 *  same network request instead of stampeding the endpoint. */
let inflightRefresh: Promise<string> | null = null

export class GoogleSheetsAuthError extends Error {
  readonly status: number
  readonly code: GoogleSheetsAuthErrorCode

  constructor(args: {
    code: GoogleSheetsAuthErrorCode
    status: number
    message: string
  }) {
    super(args.message)
    this.name = 'GoogleSheetsAuthError'
    this.code = args.code
    this.status = args.status
  }
}

export type GoogleSheetsAuthErrorCode =
  | 'not_configured'
  | 'invalid_grant'
  | 'invalid_response'
  | 'network'
  | 'http'

/**
 * Returns an access token that's guaranteed valid for at least
 * EXPIRY_BUFFER_MS more. Refreshes transparently when needed; concurrent
 * callers share one in-flight refresh.
 */
export async function getValidAccessToken(): Promise<string> {
  if (currentToken && currentToken.expiresAt > Date.now()) {
    return currentToken.accessToken
  }
  if (inflightRefresh) return inflightRefresh
  inflightRefresh = refreshAccessToken().finally(() => {
    inflightRefresh = null
  })
  return inflightRefresh
}

/**
 * Force a refresh regardless of cache state. Useful from the data
 * fetcher after a 401 — clears the in-memory token and re-mints. Returns
 * the new access token; throws on any failure.
 */
export async function refreshAccessToken(): Promise<string> {
  currentToken = null
  const clientId = readEnv('VITE_GOOGLE_SHEETS_CLIENT_ID')
  const clientSecret = readEnv('VITE_GOOGLE_SHEETS_CLIENT_SECRET')
  const refreshToken = readEnv('VITE_GOOGLE_SHEETS_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleSheetsAuthError({
      code: 'not_configured',
      status: 0,
      message:
        'Google Sheets OAuth credentials are missing — set VITE_GOOGLE_SHEETS_CLIENT_ID, _CLIENT_SECRET, and _REFRESH_TOKEN.',
    })
  }

  // Google's token endpoint demands x-www-form-urlencoded, NOT JSON.
  // URLSearchParams gets the encoding right and sets the content type
  // when the fetch implementation uses it as the body.
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  let res: Response
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[google-sheets-auth] network error', err)
    throw new GoogleSheetsAuthError({
      code: 'network',
      status: 0,
      message:
        'Could not reach the Google OAuth token endpoint. Check your network connection.',
    })
  }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const errorString = extractErrorString(payload) ?? `HTTP ${res.status}`
    // eslint-disable-next-line no-console
    console.error(
      `[google-sheets-auth] token refresh failed (HTTP ${res.status})`,
      payload,
    )
    const isGrantError =
      res.status === 400 || res.status === 401 || /grant/i.test(errorString)
    throw new GoogleSheetsAuthError({
      code: isGrantError ? 'invalid_grant' : 'http',
      status: res.status,
      message: isGrantError
        ? `Google rejected the refresh token: ${errorString}. The token may have been revoked — re-run the OAuth flow to mint a new one.`
        : `Token refresh failed (HTTP ${res.status}): ${errorString}`,
    })
  }

  const parsed = parseTokenPayload(payload)
  if (!parsed) {
    // eslint-disable-next-line no-console
    console.error('[google-sheets-auth] unexpected token response shape', payload)
    throw new GoogleSheetsAuthError({
      code: 'invalid_response',
      status: res.status,
      message:
        'Google returned an unexpected token response. See the console for the raw payload.',
    })
  }

  currentToken = {
    accessToken: parsed.access_token,
    // expires_in is in seconds; subtract the buffer so we refresh early.
    expiresAt: Date.now() + parsed.expires_in * 1000 - EXPIRY_BUFFER_MS,
  }
  return currentToken.accessToken
}

/** Drop the cached access token (e.g. after a 401 response). The next
 *  call to `getValidAccessToken` will refresh. */
export function clearCachedAccessToken(): void {
  currentToken = null
}

/** Read-only view of the cached token's expiry — handy for diagnostic
 *  panels but never required to actually use the API. */
export function getTokenExpiry(): Date | null {
  return currentToken ? new Date(currentToken.expiresAt) : null
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readEnv(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

function parseTokenPayload(
  payload: unknown,
): { access_token: string; expires_in: number } | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const accessToken = obj['access_token']
  const expiresIn = obj['expires_in']
  if (typeof accessToken !== 'string' || !accessToken) return null
  if (typeof expiresIn !== 'number' || expiresIn <= 0) return null
  return { access_token: accessToken, expires_in: expiresIn }
}

function extractErrorString(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const description = obj['error_description']
  if (typeof description === 'string' && description) return description
  const err = obj['error']
  if (typeof err === 'string' && err) return err
  return null
}

/**
 * Google Sheets OAuth: turn a long-lived refresh token into a short-lived
 * access token, kept in memory only.
 *
 * Resilience features (everything beyond the basic flow):
 *
 *   - Exponential backoff on network failures and HTTP 429 token-endpoint
 *     rate-limits (max 3 retries: 1s, 2s, 4s).
 *   - Token rotation handling: when Google returns a NEW refresh_token in
 *     the refresh response (can happen on Published apps during routine
 *     rotation), we stash it in localStorage as a self-healing override
 *     and emit a prominent console warning so the operator knows to
 *     update .env / Railway. Subsequent refreshes prefer the override
 *     over the env var.
 *   - invalid_grant detection: separated from generic HTTP failures so the
 *     UI can surface the actionable "re-authorize with the Firebrake
 *     account" message and the data-source badge can switch to its
 *     auth-error variant.
 *   - Telemetry (in-memory): last refresh timestamp + last outcome so the
 *     Settings panel can render a "Last refresh" row without keeping its
 *     own state machine.
 *
 * SECURITY NOTE: This module uses the OAuth client_secret + refresh_token
 * in the browser. Anyone with devtools open can read them out of the
 * compiled JS bundle and mint access tokens against the same Google
 * account. That's acceptable for an internal Tailscale-only tool but NOT
 * for a public deployment — for that case, proxy the token refresh
 * through your own backend so neither secret reaches the browser.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
/** Refresh 5 minutes before the actual expiry so we never use a token in
 *  the grace window between staleness and rejection. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000
/** localStorage key for the self-healing refresh-token override. Read on
 *  every refresh; written when Google rotates the token. */
export const REFRESH_TOKEN_OVERRIDE_KEY =
  'google_sheets_refresh_token_override'
const MAX_REFRESH_RETRIES = 3

interface TokenState {
  accessToken: string
  expiresAt: number
}

let currentToken: TokenState | null = null
let inflightRefresh: Promise<string> | null = null

/** Outcome of the most recent refresh attempt — surfaced to the Settings
 *  page so the operator can see the state at a glance without forcing a
 *  fresh refresh. */
export interface RefreshTelemetry {
  /** When the most recent SUCCESSFUL refresh completed. null = never. */
  lastSuccessAt: Date | null
  /** Code of the most recent refresh attempt. 'idle' = no attempt yet. */
  lastOutcome: 'idle' | 'success' | GoogleSheetsAuthErrorCode
  /** Most recent error message, if the last attempt failed. */
  lastError: string | null
}

let telemetry: RefreshTelemetry = {
  lastSuccessAt: null,
  lastOutcome: 'idle',
  lastError: null,
}

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
  | 'rate_limited'
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
 * Force a refresh regardless of cache state. Retries on network and 429
 * errors with exponential backoff; surfaces auth-grade errors
 * (invalid_grant) immediately since retrying won't help.
 *
 * The retry counter is a private parameter — callers don't pass it.
 */
export async function refreshAccessToken(retryCount = 0): Promise<string> {
  currentToken = null
  const clientId = readEnv('VITE_GOOGLE_SHEETS_CLIENT_ID')
  const clientSecret = readEnv('VITE_GOOGLE_SHEETS_CLIENT_SECRET')
  // Prefer the rotated override if present — that's how we self-heal
  // after Google issues a new refresh token without a redeploy.
  const refreshToken = readRefreshTokenOverride() || readEnv('VITE_GOOGLE_SHEETS_REFRESH_TOKEN')
  const envRefreshToken = readEnv('VITE_GOOGLE_SHEETS_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    setTelemetry({
      lastOutcome: 'not_configured',
      lastError:
        'Missing one or more of VITE_GOOGLE_SHEETS_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN.',
    })
    throw new GoogleSheetsAuthError({
      code: 'not_configured',
      status: 0,
      message:
        'Google Sheets OAuth credentials are missing — set VITE_GOOGLE_SHEETS_CLIENT_ID, _CLIENT_SECRET, and _REFRESH_TOKEN.',
    })
  }

  // Google's token endpoint demands x-www-form-urlencoded, NOT JSON.
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
    // Network errors are retryable — give it a few shots with backoff
    // before surfacing.
    if (retryCount < MAX_REFRESH_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000
      // eslint-disable-next-line no-console
      console.warn(
        `[google-sheets-auth] network error reaching token endpoint. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_REFRESH_RETRIES})…`,
        err,
      )
      await sleep(delay)
      return refreshAccessToken(retryCount + 1)
    }
    // eslint-disable-next-line no-console
    console.error('[google-sheets-auth] network error after retries', err)
    setTelemetry({
      lastOutcome: 'network',
      lastError:
        'Cannot reach Google auth servers. Check your internet connection.',
    })
    throw new GoogleSheetsAuthError({
      code: 'network',
      status: 0,
      message:
        'Cannot reach Google auth servers. Check your internet connection.',
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
    const errorCode = extractErrorCode(payload)

    // invalid_grant is fatal — retrying won't help, the operator needs
    // to run the OAuth flow again with the Firebrake account.
    if (
      res.status === 400 &&
      (errorCode === 'invalid_grant' || /grant/i.test(errorString))
    ) {
      // eslint-disable-next-line no-console
      console.error(
        '🔴 [google-sheets-auth] Refresh token is INVALID or REVOKED.\n' +
          'Someone needs to run: pnpm setup-google-auth\n' +
          'with the Firebrake account, then update .env and redeploy.',
      )
      setTelemetry({
        lastOutcome: 'invalid_grant',
        lastError: errorString,
      })
      throw new GoogleSheetsAuthError({
        code: 'invalid_grant',
        status: 401,
        message:
          'Google Sheets refresh token is invalid. An admin needs to run "pnpm setup-google-auth" with the Firebrake account, then update the environment variables.',
      })
    }

    // Token-endpoint rate-limiting — retry with backoff.
    if (res.status === 429) {
      if (retryCount < MAX_REFRESH_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000
        // eslint-disable-next-line no-console
        console.warn(
          `[google-sheets-auth] rate-limited by token endpoint. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_REFRESH_RETRIES})…`,
        )
        await sleep(delay)
        return refreshAccessToken(retryCount + 1)
      }
      setTelemetry({
        lastOutcome: 'rate_limited',
        lastError: 'Token endpoint rate-limited after 3 retries.',
      })
      throw new GoogleSheetsAuthError({
        code: 'rate_limited',
        status: 429,
        message: 'Google rate-limited token refresh after 3 retries.',
      })
    }

    // eslint-disable-next-line no-console
    console.error(
      `[google-sheets-auth] token refresh failed (HTTP ${res.status})`,
      payload,
    )
    setTelemetry({ lastOutcome: 'http', lastError: errorString })
    throw new GoogleSheetsAuthError({
      code: 'http',
      status: res.status,
      message: `Token refresh failed: ${errorString}`,
    })
  }

  const parsed = parseTokenPayload(payload)
  if (!parsed) {
    // eslint-disable-next-line no-console
    console.error('[google-sheets-auth] unexpected token response shape', payload)
    setTelemetry({
      lastOutcome: 'invalid_response',
      lastError: 'Google returned an unexpected token response.',
    })
    throw new GoogleSheetsAuthError({
      code: 'invalid_response',
      status: res.status,
      message:
        'Google returned an unexpected token response. See the console for the raw payload.',
    })
  }

  // Token-rotation handling: if Google issued a fresh refresh_token in
  // the response, persist it as an override and warn loudly. This keeps
  // the app running without a redeploy.
  if (
    parsed.refresh_token &&
    parsed.refresh_token !== envRefreshToken &&
    parsed.refresh_token !== readRefreshTokenOverride()
  ) {
    writeRefreshTokenOverride(parsed.refresh_token)
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️ [google-sheets-auth] A NEW refresh token was issued by Google!\n` +
        `Your .env VITE_GOOGLE_SHEETS_REFRESH_TOKEN is now outdated.\n` +
        `New token (first 20 chars): ${parsed.refresh_token.slice(0, 20)}…\n` +
        `Saved as localStorage override so the app keeps running.\n` +
        `Update your .env file and Railway environment variables, then redeploy.`,
    )
  }

  currentToken = {
    accessToken: parsed.access_token,
    expiresAt: Date.now() + parsed.expires_in * 1000 - EXPIRY_BUFFER_MS,
  }
  setTelemetry({
    lastOutcome: 'success',
    lastError: null,
    lastSuccessAt: new Date(),
  })
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

/** Snapshot of refresh-attempt telemetry for the Settings status panel. */
export function getRefreshTelemetry(): RefreshTelemetry {
  return { ...telemetry }
}

/** True iff a rotated refresh token is sitting in localStorage. The
 *  badge / Settings panel use this to surface the "token was rotated;
 *  update your env" advisory. */
export function hasRefreshTokenOverride(): boolean {
  return Boolean(readRefreshTokenOverride())
}

/** Read the rotated refresh token verbatim (full string). Settings UI
 *  uses this for the "Copy new token" button. Returns empty string when
 *  no override is set. */
export function readRefreshTokenOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_OVERRIDE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Wipe the override (e.g. after the operator has redeployed with the
 *  rotated token in env). Forces the next refresh to fall back to the
 *  env value. */
export function clearRefreshTokenOverride(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_OVERRIDE_KEY)
  } catch {
    // ignored
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function writeRefreshTokenOverride(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(REFRESH_TOKEN_OVERRIDE_KEY, token)
  } catch {
    // localStorage might be disabled (private mode, quota); the token
    // still lives in memory for the rest of this session.
  }
}

function readEnv(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setTelemetry(patch: Partial<RefreshTelemetry>): void {
  telemetry = { ...telemetry, ...patch }
}

function parseTokenPayload(
  payload: unknown,
): {
  access_token: string
  expires_in: number
  refresh_token?: string
} | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const accessToken = obj['access_token']
  const expiresIn = obj['expires_in']
  if (typeof accessToken !== 'string' || !accessToken) return null
  if (typeof expiresIn !== 'number' || expiresIn <= 0) return null
  const refresh = obj['refresh_token']
  return {
    access_token: accessToken,
    expires_in: expiresIn,
    ...(typeof refresh === 'string' && refresh ? { refresh_token: refresh } : {}),
  }
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

function extractErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const err = obj['error']
  return typeof err === 'string' ? err : null
}

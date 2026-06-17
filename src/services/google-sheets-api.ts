/**
 * READ-ONLY Google Sheets API client.
 *
 * Every function here issues a single GET against the Sheets v4 endpoint,
 * threading a fresh OAuth access token through Authorization. There are
 * intentionally NO write / append / batchUpdate helpers — we only consume
 * the spreadsheet as a data source.
 *
 * Errors are normalised so the caller can handle the common failure modes
 * (auth, permission, missing tab) without parsing Google's response shapes.
 */

import {
  clearCachedAccessToken,
  getValidAccessToken,
  GoogleSheetsAuthError,
} from './google-sheets-auth'
import { getTrackedTabs } from './google-sheets-config'

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export type GoogleSheetsErrorCode =
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'network'
  | 'invalid_response'
  | 'http'

export class GoogleSheetsApiError extends Error {
  readonly status: number
  readonly code: GoogleSheetsErrorCode
  readonly detail?: string

  constructor(args: {
    code: GoogleSheetsErrorCode
    status: number
    message: string
    detail?: string
  }) {
    super(args.message)
    this.name = 'GoogleSheetsApiError'
    this.code = args.code
    this.status = args.status
    if (args.detail !== undefined) this.detail = args.detail
  }
}

/**
 * Fetch the FORMATTED_VALUE cell grid for one tab. Returns an array of
 * rows, each row an array of stringified cell values; row 0 is typically
 * the header row but we don't assume that here — callers decide.
 *
 * The retry-on-401 path is the only place we treat auth errors specially:
 * if the cached access token has been silently revoked, one fresh
 * refresh + retry will recover; anything else is reported as-is.
 */
export async function fetchSheetTab(
  spreadsheetId: string,
  tabName: string,
): Promise<string[][]> {
  return runWithAuthRetry(async () => {
    const token = await getValidAccessToken()
    const url = buildValuesUrl(spreadsheetId, tabName)
    const res = await safeFetch(url, token)
    if (!res.ok) {
      throw classifyResponseError(res)
    }
    const body = await parseJson(res)
    return extractValueGrid(body)
  })
}

/**
 * Fetch every tab the config has marked `track: true` for this
 * spreadsheet. Returns a Map keyed by tab slug (not name) so consumers
 * have stable identifiers. Per-tab failures are isolated — one bad tab
 * doesn't block the rest, and its error is logged for diagnosis.
 */
export async function fetchAllTrackedTabs(
  spreadsheetId: string,
): Promise<Map<string, string[][]>> {
  const tracked = getTrackedTabs(spreadsheetId)
  const results = await Promise.all(
    tracked.map(async (tab) => {
      try {
        const grid = await fetchSheetTab(spreadsheetId, tab.name)
        return { slug: tab.slug, grid }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[google-sheets-api] tab "${tab.name}" failed`,
          err instanceof Error ? err.message : err,
        )
        return null
      }
    }),
  )
  const out = new Map<string, string[][]>()
  for (const r of results) {
    if (r) out.set(r.slug, r.grid)
  }
  return out
}

/**
 * Spreadsheet-level metadata: the title and the live list of tab names.
 * Use this from a settings/health panel to verify the config matches the
 * actual spreadsheet (catches typo'd tab names in sheets-config.json).
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
): Promise<{ title: string; sheets: string[] }> {
  return runWithAuthRetry(async () => {
    const token = await getValidAccessToken()
    const url = new URL(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`)
    // ?fields= keeps the payload small — we don't need cell data here.
    url.searchParams.set('fields', 'properties.title,sheets.properties.title')
    const res = await safeFetch(url.toString(), token)
    if (!res.ok) {
      throw classifyResponseError(res)
    }
    const body = await parseJson(res)
    return extractMetadata(body)
  })
}

// ── Internals ────────────────────────────────────────────────────────────

function buildValuesUrl(spreadsheetId: string, tabName: string): string {
  // The whole tab range is implied when no cell range is given — Google
  // returns "TabName!A1:Z<lastRow>" automatically. `valueRenderOption=
  // FORMATTED_VALUE` returns cell values as they'd appear in the UI
  // (currency symbols, % suffixes), which is what we want for display.
  const url = new URL(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(tabName)}`,
  )
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE')
  return url.toString()
}

async function safeFetch(url: string, token: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    throw new GoogleSheetsApiError({
      code: 'network',
      status: 0,
      message:
        'Network error reaching the Google Sheets API. Check your connection.',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new GoogleSheetsApiError({
      code: 'invalid_response',
      status: res.status,
      message: 'Google Sheets returned a non-JSON response.',
    })
  }
}

function classifyResponseError(res: Response): GoogleSheetsApiError {
  if (res.status === 401) {
    return new GoogleSheetsApiError({
      code: 'auth',
      status: 401,
      message: 'Access token rejected. Will retry once with a fresh token.',
    })
  }
  if (res.status === 403) {
    return new GoogleSheetsApiError({
      code: 'forbidden',
      status: 403,
      message:
        'Sheet access denied. Check that the Google account has view access to this spreadsheet.',
    })
  }
  if (res.status === 404) {
    return new GoogleSheetsApiError({
      code: 'not_found',
      status: 404,
      message:
        'Spreadsheet or tab not found. Check the spreadsheet ID and tab name.',
    })
  }
  if (res.status === 429) {
    return new GoogleSheetsApiError({
      code: 'rate_limited',
      status: 429,
      message:
        'Google Sheets is rate-limiting requests. Slow down or retry after a delay.',
    })
  }
  return new GoogleSheetsApiError({
    code: 'http',
    status: res.status,
    message: `Google Sheets request failed (HTTP ${res.status}).`,
  })
}

function extractValueGrid(body: unknown): string[][] {
  if (!body || typeof body !== 'object') return []
  const values = (body as { values?: unknown }).values
  if (!Array.isArray(values)) return []
  const out: string[][] = []
  for (const row of values) {
    if (!Array.isArray(row)) continue
    out.push(row.map((cell) => (cell == null ? '' : String(cell))))
  }
  return out
}

function extractMetadata(body: unknown): { title: string; sheets: string[] } {
  if (!body || typeof body !== 'object') {
    throw new GoogleSheetsApiError({
      code: 'invalid_response',
      status: 200,
      message: 'Spreadsheet metadata response was empty or malformed.',
    })
  }
  const root = body as Record<string, unknown>
  const props = root['properties'] as Record<string, unknown> | undefined
  const title = typeof props?.['title'] === 'string' ? (props['title'] as string) : ''
  const rawSheets = root['sheets']
  const sheets: string[] = []
  if (Array.isArray(rawSheets)) {
    for (const s of rawSheets) {
      if (!s || typeof s !== 'object') continue
      const sp = (s as { properties?: { title?: unknown } }).properties
      if (sp && typeof sp.title === 'string') sheets.push(sp.title)
    }
  }
  return { title, sheets }
}

/**
 * Run `fn`; if it throws an `auth` (HTTP 401) error, clear the cached
 * access token, mint a fresh one, and retry once. Auth errors from the
 * second attempt propagate to the caller.
 *
 * Also handles 429 rate limiting: Sheets API allows 60 req/min/user.
 * With a 15-min poll over 2 tabs we're nowhere near that, but a manual
 * "Refresh now" while the poller is also firing can spike briefly.
 * One retry after a short delay covers the spike without spamming.
 *
 * Any other error class is passed through immediately.
 */
async function runWithAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof GoogleSheetsApiError && err.code === 'auth') {
      clearCachedAccessToken()
      try {
        return await fn()
      } catch (err2) {
        if (err2 instanceof GoogleSheetsApiError && err2.code === 'auth') {
          throw new GoogleSheetsApiError({
            code: 'auth',
            status: 401,
            message:
              'Google Sheets access token rejected even after a fresh refresh — the OAuth grant may have been revoked.',
          })
        }
        throw err2
      }
    }
    if (err instanceof GoogleSheetsApiError && err.code === 'rate_limited') {
      // 5s backoff is long enough to clear most quota spikes but short
      // enough that the user doesn't think the app is hung. One retry —
      // if it still fails, the caller sees the 429 and can decide.
      await new Promise((resolve) => setTimeout(resolve, 5000))
      return fn()
    }
    if (err instanceof GoogleSheetsAuthError) {
      // Surface auth-layer failures with the api error type so callers
      // can branch on a single class.
      throw new GoogleSheetsApiError({
        code: 'auth',
        status: err.status,
        message: err.message,
      })
    }
    throw err
  }
}

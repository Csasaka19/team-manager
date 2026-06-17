/**
 * Read-side config helpers for the Google Sheets integration.
 *
 * The spreadsheet/tab catalogue lives in `src/config/sheets-config.json` so
 * it's editable without touching code. Env vars (refresh token + spreadsheet
 * id) decide whether the integration is "configured" at all.
 *
 * All exports are pure; no fetches, no React. Pages and services that need
 * to know which tabs to poll call `getTrackedTabs(sheetId)` and walk the
 * result.
 */

import rawConfig from '@/config/sheets-config.json'

export interface SheetTabConfig {
  /** Display name in the spreadsheet — must match exactly (case-sensitive). */
  name: string
  /** URL-safe identifier used as the cache key once data is fetched. */
  slug: string
  /** Only tabs where this is true get polled; the rest are listed for
   *  reference but never fetched. */
  track: boolean
}

export interface SheetConfig {
  /** Google Sheets spreadsheet id (the long string in the URL). */
  id: string
  /** Internal stable name (used in logs / errors). */
  name: string
  /** Human-readable label shown in the UI. */
  label: string
  /** Master switch — disabled sheets are skipped entirely. */
  enabled: boolean
  tabs: SheetTabConfig[]
}

interface RawConfig {
  sheets: SheetConfig[]
  pollIntervalMinutes?: number
}

const config = rawConfig as RawConfig

/** All sheets where `enabled === true`. Read-only snapshot — callers can
 *  filter further but should not mutate the returned objects. */
export function getSheetsConfig(): SheetConfig[] {
  return config.sheets.filter((s) => s.enabled)
}

/** The tracked tabs for a single spreadsheet id. Returns an empty array
 *  if the id isn't in the config, the sheet is disabled, or no tab on it
 *  has `track: true`. */
export function getTrackedTabs(sheetId: string): SheetTabConfig[] {
  const sheet = getSheetsConfig().find((s) => s.id === sheetId)
  if (!sheet) return []
  return sheet.tabs.filter((t) => t.track)
}

/** How often the poller should refresh tracked tabs. Falls back to 15 min
 *  if the config doesn't override it. */
export function getPollIntervalMinutes(): number {
  return config.pollIntervalMinutes ?? 15
}

/** True iff both the OAuth refresh token and a target spreadsheet id are
 *  set as env vars. The other OAuth values (client id/secret) are also
 *  required at refresh time but, for the "is the integration set up?"
 *  check, the refresh token alone is the canonical signal. */
export function isGoogleSheetsConfigured(): boolean {
  const refreshToken = readEnv('VITE_GOOGLE_SHEETS_REFRESH_TOKEN')
  const spreadsheetId = readEnv('VITE_GOOGLE_SHEETS_SPREADSHEET_ID')
  return Boolean(refreshToken && spreadsheetId)
}

/** Convenience: the primary spreadsheet id from env. Returns the first
 *  configured sheet's id as a fallback so the rest of the app has a
 *  default target even before env is populated. */
export function getDefaultSpreadsheetId(): string {
  const fromEnv = readEnv('VITE_GOOGLE_SHEETS_SPREADSHEET_ID')
  if (fromEnv) return fromEnv
  const first = config.sheets[0]
  return first ? first.id : ''
}

function readEnv(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

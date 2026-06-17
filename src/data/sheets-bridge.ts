/**
 * Google Sheets ↔ Team Manager bridge.
 *
 * Mirrors `atlas-bridge.ts` so the rest of the store doesn't have to know
 * which source produced a snapshot. `loadFromSheets` returns the same
 * `AtlasSnapshot` shape, just with sheet-derived data; the store
 * combines it with the Atlas snapshot before applying the overlay.
 *
 * Sheets-only signals (diagnostics from the column mapper, per-tab error
 * tracking) come back alongside the snapshot in `LoadSheetsResult`.
 */

import { fetchAllTrackedTabs } from '@/services/google-sheets-api'
import {
  getDefaultSpreadsheetId,
  isGoogleSheetsConfigured,
} from '@/services/google-sheets-config'
import {
  combineTrackedTabs,
  createContractingProject,
  type SheetsRawRow,
  type TabDiagnostics,
} from '@/services/sheets-mapper'
import type { AtlasSnapshot } from './atlas-bridge'
import type { Project, Task, TeamMember } from './types'

export interface LoadSheetsResult {
  /** AtlasSnapshot-shaped payload so callers can feed the same merge
   *  pipeline used for Atlas. `meetings` and `activities` are always
   *  empty arrays — Google Sheets has no equivalent surfaces. */
  snapshot: AtlasSnapshot
  /** Per-tab column-mapping diagnostics: header row, resolved columns,
   *  unmapped columns, row counts, sample task. The Settings panel
   *  renders these so the developer can verify the mapping. */
  diagnostics: TabDiagnostics[]
  /** Sheet row that produced each task, keyed by task id. The
   *  TaskDetail page's "Raw Sheet Data" debug section reads from
   *  this. */
  rawRowsByTaskId: Map<string, SheetsRawRow>
}

export interface LoadSheetsOptions {
  /** Override `Date.now()` for deterministic tests. */
  now?: string
  /** Spreadsheet id override. Defaults to `getDefaultSpreadsheetId()`,
   *  which reads `VITE_GOOGLE_SHEETS_SPREADSHEET_ID` or falls back to
   *  the first sheet in the config. */
  spreadsheetId?: string
}

/** ProjectId synthesised by the mapper. Shared with the store so it can
 *  add it to the Atlas exclusion list when Sheets is configured. */
export const SHEETS_PROJECT_ID = 'contracting-com'

/**
 * Fetch every tracked tab, map rows into Tasks, synthesise the
 * Contracting.com project, and return a snapshot + diagnostics. Per-tab
 * failures inside `fetchAllTrackedTabs` are already isolated — they
 * surface as missing entries in the returned Map and as a "Failed"
 * status in the diagnostics table.
 */
export async function loadFromSheets(
  opts: LoadSheetsOptions = {},
): Promise<LoadSheetsResult> {
  if (!isGoogleSheetsConfigured()) {
    return {
      snapshot: emptySnapshot(opts.now),
      diagnostics: [],
      rawRowsByTaskId: new Map(),
    }
  }
  const spreadsheetId = opts.spreadsheetId || getDefaultSpreadsheetId()
  if (!spreadsheetId) {
    return {
      snapshot: emptySnapshot(opts.now),
      diagnostics: [],
      rawRowsByTaskId: new Map(),
    }
  }
  const now = opts.now ?? new Date().toISOString()

  // Per-tab errors stay inside fetchAllTrackedTabs (it console.errors
  // and returns a smaller map). We surface them to the snapshot's
  // `errors` array so the existing sync-error UI can render them.
  const errors: AtlasSnapshot['errors'] = []
  let tabDataMap: Map<string, string[][]>
  try {
    tabDataMap = await fetchAllTrackedTabs(spreadsheetId)
  } catch (err) {
    errors.push({
      source: 'sheets',
      message: err instanceof Error ? err.message : String(err),
    })
    return {
      snapshot: emptySnapshot(now),
      diagnostics: [],
      rawRowsByTaskId: new Map(),
    }
  }

  const combined = combineTrackedTabs(tabDataMap, SHEETS_PROJECT_ID, { now })
  const project = createContractingProject(combined.tasks, undefined, { now })

  return {
    snapshot: {
      projects: [project],
      tasks: combined.tasks,
      teamMembers: combined.members,
      activities: [],
      meetings: [],
      loadedAt: now,
      errors,
    },
    diagnostics: combined.diagnostics,
    rawRowsByTaskId: combined.rawRowsByTaskId,
  }
}

function emptySnapshot(now: string | undefined): AtlasSnapshot {
  return {
    projects: [],
    tasks: [],
    teamMembers: [],
    activities: [],
    meetings: [],
    loadedAt: now ?? new Date().toISOString(),
    errors: [],
  }
}

// ── Snapshot combination ────────────────────────────────────────────────

/**
 * Merge an Atlas snapshot and a Sheets snapshot into one unified view.
 * Member union dedupes by id; in a collision the FIRST occurrence wins
 * (Atlas first since it gets fetched first, but the sheets-mapper and
 * the atlas-mapper both look up the same KNOWN_MEMBERS table so a same-
 * slug member ends up with identical profile fields either way).
 *
 * If only one source is loaded, returns that source's snapshot
 * essentially unchanged (loadedAt is still recomputed to whichever
 * snapshot is newer, so the data-source badge shows the right time).
 *
 * Pure; no React, no fetches. The store calls this every time either
 * source completes a load.
 */
export function combineSourceSnapshots(
  atlas: AtlasSnapshot | null,
  sheets: AtlasSnapshot | null,
): AtlasSnapshot {
  if (!atlas && !sheets) {
    return {
      projects: [],
      tasks: [],
      teamMembers: [],
      activities: [],
      meetings: [],
      loadedAt: new Date().toISOString(),
      errors: [],
    }
  }
  if (!sheets) return atlas as AtlasSnapshot
  if (!atlas) return sheets

  const projects: Project[] = [...atlas.projects, ...sheets.projects]
  const tasks: Task[] = [...atlas.tasks, ...sheets.tasks]
  const meetings = [...atlas.meetings, ...sheets.meetings]
  const activities = [...atlas.activities, ...sheets.activities]
  const teamMembers = mergeMembers([atlas.teamMembers, sheets.teamMembers])
  const errors = [...atlas.errors, ...sheets.errors]
  const loadedAt =
    atlas.loadedAt > sheets.loadedAt ? atlas.loadedAt : sheets.loadedAt

  return {
    projects,
    tasks,
    teamMembers,
    activities,
    meetings,
    loadedAt,
    errors,
  }
}

/** Union of multiple TeamMember lists, dedupe by id. First occurrence
 *  wins on conflict. */
function mergeMembers(lists: TeamMember[][]): TeamMember[] {
  const seen = new Set<string>()
  const out: TeamMember[] = []
  for (const list of lists) {
    for (const m of list) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
    }
  }
  return out
}

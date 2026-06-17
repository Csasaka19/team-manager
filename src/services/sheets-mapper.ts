/**
 * Google Sheets → Team Manager data mapping layer.
 *
 * Sheet column layouts vary tab-to-tab and even within a workspace
 * (someone renames a header, someone else moves a column). Rather than
 * hard-code positions, this module reads the first row of each tab as
 * the header row and resolves canonical fields (title, status, priority,
 * etc.) to column indices via fuzzy-but-deterministic pattern matching.
 *
 * Decisions worth flagging up-front:
 *
 *  - The spec lists title patterns including `"description"`, which would
 *    collide with the description-field patterns. We resolve this with a
 *    SCORING system (exact match > starts-with > contains, tie-broken by
 *    position in the field's pattern list) instead of "first match wins
 *    on the header." A header that exactly equals a pattern always wins
 *    over one that merely contains it; "Status" beats "Stage" even when
 *    Stage appears earlier.
 *
 *  - Added `"feature"` to the title patterns. The user's `Dev Projects`
 *    tab uses `Feature` as the canonical column and it doesn't match
 *    anything the spec listed. Without this addition, every Dev Projects
 *    row would be skipped for missing a title.
 *
 *  - The spec's status mapping returns `"Blocked"` as a value, but the
 *    Team Manager `TaskStatus` enum has no Blocked column. We map
 *    blocked-ish statuses to `'in_progress'` AND auto-add a `"blocked"`
 *    tag to preserve the signal — same approach as the Atlas mapper.
 *
 *  - Project id is `"contracting-com"` per spec — but the live Atlas
 *    catalogue ALSO has a project slug `"contracting-com"`. When both
 *    sources are merged at the store layer (next prompt), they'll
 *    collide by id. Whether that's a feature (sheets data enriches the
 *    Atlas project) or a bug (two distinct projects) is a wiring-layer
 *    decision; the mapper just emits what the spec asked for.
 */

import type {
  Activity,
  Priority,
  Project,
  Role,
  Subtask,
  Task,
  TaskStatus,
  TeamMember,
} from '@/data/types'
import { KNOWN_MEMBERS } from './atlas-mapper'

// ── Public types ─────────────────────────────────────────────────────────

export interface ColumnMap {
  title: number | null
  status: number | null
  priority: number | null
  assignee: number | null
  dueDate: number | null
  description: number | null
  project: number | null
  category: number | null
  id: number | null
  createdDate: number | null
  tags: number | null
}

export interface TabDiagnostics {
  tabName: string
  tabSlug: string
  headerRow: string[]
  columnMap: ColumnMap
  unmappedColumns: string[]
  totalRows: number
  mappedTasks: number
  skippedRows: number
  sampleTask: Task | null
}

export interface MapTabResult {
  tasks: Task[]
  unmappedColumns: string[]
  stats: { total: number; mapped: number; skipped: number }
}

// ── Column overrides (persisted) ─────────────────────────────────────────
// The Settings panel exposes a per-tab override UI that lets the user
// pin a specific column to a canonical field when auto-discovery picks
// the wrong one. Overrides live in localStorage so they survive reloads;
// the mapper reads them on every run and merges over the discovered map.

const OVERRIDE_STORAGE_KEY = 'team-manager.sheets-column-overrides'

export type TabColumnOverrides = Partial<Record<FieldKey, number | null>>
export type AllColumnOverrides = Record<string, TabColumnOverrides>

/** Read every stored override (all tabs). Returns an empty object when
 *  storage is unavailable or empty. Pure for callers — no side effects. */
export function loadColumnOverrides(): AllColumnOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as AllColumnOverrides
  } catch {
    return {}
  }
}

/** Lookup helper — the stored overrides for one tab (empty object if none). */
export function getColumnOverridesForTab(tabSlug: string): TabColumnOverrides {
  return loadColumnOverrides()[tabSlug] ?? {}
}

/** Persist a single override. Passing `index === null` clears the
 *  override for that field (reverts to auto-discovery). */
export function setColumnOverride(
  tabSlug: string,
  field: FieldKey,
  index: number | null,
): void {
  if (typeof window === 'undefined') return
  const all = loadColumnOverrides()
  const tab = { ...(all[tabSlug] ?? {}) }
  if (index === null) {
    delete tab[field]
  } else {
    tab[field] = index
  }
  if (Object.keys(tab).length === 0) {
    delete all[tabSlug]
  } else {
    all[tabSlug] = tab
  }
  try {
    window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Quota or private-mode storage — silently degrade.
  }
}

/** Clear every override (Settings "Reset to auto-detect"). */
export function clearAllColumnOverrides(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(OVERRIDE_STORAGE_KEY)
}

/** Merge stored overrides on top of an auto-discovered map. Overrides
 *  with `null` clear the field; overrides with a valid number index
 *  replace it. */
export function applyOverrides(
  discovered: ColumnMap,
  overrides: TabColumnOverrides,
): ColumnMap {
  const merged: ColumnMap = { ...discovered }
  for (const field of FIELD_ORDER) {
    if (!(field in overrides)) continue
    const value = overrides[field]
    if (value === undefined) continue
    merged[field] = value
  }
  return merged
}

// ── Header patterns ──────────────────────────────────────────────────────
// Order matters: earlier patterns rank higher when two patterns of the
// same MATCH KIND tie. Match kind beats position regardless.

type FieldKey = keyof ColumnMap

const FIELD_PATTERNS: Record<FieldKey, string[]> = {
  title: [
    'title',
    'task title',
    'task name',
    'task description',
    'feature',
    'name',
    'task',
    'item',
    'description',
  ],
  status: ['status', 'task status', 'state', 'progress', 'stage'],
  priority: ['priority', 'urgency', 'importance', 'pri', 'p'],
  assignee: [
    'assigned to',
    'assignee',
    'assigned',
    'owner',
    'responsible',
    'who',
    'person',
    'developer',
    'dev',
  ],
  dueDate: ['due date', 'date due', 'due by', 'deadline', 'target date', 'due'],
  description: ['notes', 'note', 'details', 'comments', 'info', 'description'],
  project: ['project', 'product', 'module', 'area', 'workstream'],
  category: ['category', 'type', 'kind', 'label', 'bucket', 'tag'],
  id: ['task id', 'ticket', 'reference', 'number', 'ref', 'id', '#'],
  createdDate: ['date created', 'created date', 'date added', 'created', 'added'],
  tags: ['tags', 'labels'],
}

const FIELD_ORDER: FieldKey[] = [
  'title',
  'status',
  'priority',
  'assignee',
  'dueDate',
  'description',
  'project',
  'category',
  'id',
  'createdDate',
  'tags',
]

// ── Status / priority lookup tables ──────────────────────────────────────

const STATUS_VALUE_MAP: Record<string, TaskStatus> = {
  'to do': 'todo',
  todo: 'todo',
  'not started': 'todo',
  open: 'todo',
  new: 'todo',
  pending: 'todo',
  backlog: 'todo',
  inbox: 'todo',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  doing: 'in_progress',
  active: 'in_progress',
  working: 'in_progress',
  started: 'in_progress',
  wip: 'in_progress',
  implementing: 'in_progress',
  'in review': 'in_review',
  'in-review': 'in_review',
  review: 'in_review',
  testing: 'in_review',
  qa: 'in_review',
  'ready for review': 'in_review',
  done: 'done',
  complete: 'done',
  completed: 'done',
  closed: 'done',
  resolved: 'done',
  shipped: 'done',
  deployed: 'done',
  // Blocked-ish — see file header for why these map to in_progress + tag.
  blocked: 'in_progress',
  'on hold': 'in_progress',
  stuck: 'in_progress',
  waiting: 'in_progress',
}

const BLOCKED_VALUES = new Set([
  'blocked',
  'on hold',
  'stuck',
  'waiting',
])

const PRIORITY_VALUE_MAP: Record<string, Priority> = {
  critical: 'critical',
  urgent: 'critical',
  p0: 'critical',
  p1: 'critical',
  highest: 'critical',
  high: 'high',
  p2: 'high',
  important: 'high',
  medium: 'medium',
  normal: 'medium',
  p3: 'medium',
  default: 'medium',
  low: 'low',
  p4: 'low',
  minor: 'low',
  'nice to have': 'low',
}

// ── Column discovery ─────────────────────────────────────────────────────

const EMPTY_MAP: ColumnMap = {
  title: null,
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  description: null,
  project: null,
  category: null,
  id: null,
  createdDate: null,
  tags: null,
}

/**
 * Resolve each canonical field to a header-row column index, or null when
 * no header in the row plausibly matches the field. Logs the discovered
 * mapping to console.info for developer verification.
 */
export function discoverColumns(headers: string[], context: string = 'unknown'): ColumnMap {
  const map: ColumnMap = { ...EMPTY_MAP }

  // For each field: score every header against the field's pattern list,
  // pick the best score (lowest = best). Tie-break by earliest header.
  for (const field of FIELD_ORDER) {
    let bestIdx = -1
    let bestScore = Infinity
    const patterns = FIELD_PATTERNS[field]
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i]
      if (typeof header !== 'string' || !header.trim()) continue
      const norm = header.trim().toLowerCase()
      // Find this header's best score across the field's patterns.
      let headerBest = Infinity
      for (let p = 0; p < patterns.length; p += 1) {
        const pat = patterns[p] as string
        const score = matchScore(norm, pat, p)
        if (score < headerBest) headerBest = score
      }
      if (headerBest < bestScore) {
        bestScore = headerBest
        bestIdx = i
      }
    }
    if (bestIdx >= 0 && bestScore < Infinity) {
      map[field] = bestIdx
    }
  }

  // eslint-disable-next-line no-console
  console.info(
    `[sheets-mapper] Discovered columns for ${context}: ${describeColumnMap(map, headers)}`,
  )
  return map
}

/**
 * Match-quality score for a header against one pattern.
 *  - 0  exact case-insensitive equality (best)
 *  - 1  header starts with the pattern
 *  - 2  header ends with the pattern
 *  - 3  pattern appears anywhere in the header
 *  - ∞  no match
 *
 * Pattern position breaks ties: earlier patterns in the field's list get
 * a small adjustment so they outrank later ones at the same match kind.
 */
function matchScore(header: string, pattern: string, position: number): number {
  if (!pattern || !header) return Infinity
  // Position fraction is tiny enough not to cross match-kind boundaries.
  const tiebreak = position / 1000
  if (header === pattern) return 0 + tiebreak
  if (header.startsWith(pattern)) return 1 + tiebreak
  if (header.endsWith(pattern)) return 2 + tiebreak
  if (header.includes(pattern)) return 3 + tiebreak
  return Infinity
}

function describeColumnMap(map: ColumnMap, headers: string[]): string {
  const parts: string[] = []
  for (const field of FIELD_ORDER) {
    const idx = map[field]
    if (idx === null) {
      parts.push(`${field}=∅`)
    } else {
      const header = headers[idx] ?? ''
      parts.push(`${field}=col[${idx}] "${header}"`)
    }
  }
  return parts.join(', ')
}

/** Headers whose label didn't match ANY field pattern — useful for the
 *  "unmapped columns" diagnostic so the developer can see what the sheet
 *  has but our mapper doesn't use. */
function findUnmappedColumns(headers: string[], map: ColumnMap): string[] {
  const used = new Set<number>()
  for (const field of FIELD_ORDER) {
    const idx = map[field]
    if (idx !== null) used.add(idx)
  }
  const out: string[] = []
  for (let i = 0; i < headers.length; i += 1) {
    if (used.has(i)) continue
    const h = headers[i]
    if (typeof h === 'string' && h.trim()) out.push(h)
  }
  return out
}

// ── Row → Task ───────────────────────────────────────────────────────────

export interface MapRowOptions {
  /** Optional override for `Date.now()` — keeps the function pure in
   *  tests. Defaults to current time. */
  now?: string
}

/**
 * Convert a single row into a Task. Returns null for rows we deliberately
 * skip: empty rows, rows shorter than 2 cells, or rows missing the title
 * column entirely.
 */
export function mapSheetRowToTask(
  row: string[],
  rowIndex: number,
  columns: ColumnMap,
  tabSlug: string,
  projectId: string,
  options: MapRowOptions = {},
): Task | null {
  if (!Array.isArray(row) || row.length < 2) return null
  if (row.every((cell) => !String(cell ?? '').trim())) return null

  const title = readCell(row, columns.title).trim()
  if (!title) return null

  const now = options.now ?? new Date().toISOString()
  const rawStatus = readCell(row, columns.status).trim().toLowerCase()
  const status = STATUS_VALUE_MAP[rawStatus] ?? 'todo'
  const isBlocked = BLOCKED_VALUES.has(rawStatus)

  const rawPriority = readCell(row, columns.priority).trim().toLowerCase()
  const priority: Priority = PRIORITY_VALUE_MAP[rawPriority] ?? 'medium'

  const assigneeRaw = readCell(row, columns.assignee).trim()
  const assigneeId = normaliseAssignee(assigneeRaw)

  const dueDate = parseSheetDate(readCell(row, columns.dueDate))
  const createdAt = parseSheetDate(readCell(row, columns.createdDate)) ?? now

  const tagsFromColumn = parseTagList(readCell(row, columns.tags))
  const category = readCell(row, columns.category).trim()
  const tags: string[] = []
  for (const t of tagsFromColumn) if (!tags.includes(t)) tags.push(t)
  if (category && !tags.includes(category.toLowerCase())) {
    tags.push(category.toLowerCase())
  }
  if (isBlocked && !tags.includes('blocked')) tags.push('blocked')

  const description = readCell(row, columns.description).trim()
  const idFromColumn = readCell(row, columns.id).trim()
  const id = idFromColumn || `sheet-${tabSlug}-row-${rowIndex}`

  const subtasks: Subtask[] = []

  return {
    id,
    title,
    description,
    projectId,
    assigneeId,
    priority,
    status,
    dueDate,
    tags,
    subtasks,
    createdAt,
    updatedAt: now,
    createdBy: 'sheets-import',
  }
}

// ── Tab → Tasks ──────────────────────────────────────────────────────────

/**
 * Map every row past the header row to a Task. Returns the surviving
 * tasks, the headers that didn't map to anything (for diagnostics), and
 * counts of total / mapped / skipped rows.
 */
export function mapSheetTabToTasks(
  tabData: string[][],
  tabSlug: string,
  projectId: string,
  options: MapRowOptions = {},
): MapTabResult {
  if (!Array.isArray(tabData) || tabData.length === 0) {
    return {
      tasks: [],
      unmappedColumns: [],
      stats: { total: 0, mapped: 0, skipped: 0 },
    }
  }

  const header = tabData[0] ?? []
  const discovered = discoverColumns(header, tabSlug)
  // Settings panel can pin a column to a field; overrides win.
  const overrides = getColumnOverridesForTab(tabSlug)
  const columns = applyOverrides(discovered, overrides)
  const unmappedColumns = findUnmappedColumns(header, columns)

  const tasks: Task[] = []
  let skipped = 0
  // Row index starts at 1 — row 0 is headers.
  for (let i = 1; i < tabData.length; i += 1) {
    const row = tabData[i]
    if (!row) {
      skipped += 1
      continue
    }
    const task = mapSheetRowToTask(row, i, columns, tabSlug, projectId, options)
    if (task) tasks.push(task)
    else skipped += 1
  }

  return {
    tasks,
    unmappedColumns,
    stats: {
      total: Math.max(0, tabData.length - 1),
      mapped: tasks.length,
      skipped,
    },
  }
}

// ── Team members ─────────────────────────────────────────────────────────

/**
 * Walk the mapped tasks, collect unique assignee slugs, and emit
 * TeamMember entries. KNOWN_MEMBERS (shared with the Atlas mapper) takes
 * precedence; unknown slugs get an auto-generated display name and the
 * `member` role.
 */
export function extractTeamMembersFromSheets(
  tasks: Task[],
  options: { now?: string } = {},
): TeamMember[] {
  const now = options.now ?? new Date().toISOString()
  const slugs = new Set<string>()
  for (const t of tasks) {
    if (typeof t.assigneeId === 'string' && t.assigneeId) {
      slugs.add(t.assigneeId)
    }
  }
  const ordered = Array.from(slugs).sort()
  const hasKnownPm = ordered.some((s) => KNOWN_MEMBERS[s]?.role === 'pm')
  return ordered.map((slug, index) => {
    const known = KNOWN_MEMBERS[slug]
    if (known) {
      return {
        id: slug,
        name: known.name,
        email: known.email,
        role: known.role,
        avatarUrl: null,
        createdAt: now,
      }
    }
    const role: Role = !hasKnownPm && index === 0 ? 'pm' : 'member'
    return {
      id: slug,
      name: humaniseSlug(slug),
      email: `${slug}@team.com`,
      role,
      avatarUrl: null,
      createdAt: now,
    }
  })
}

// ── Project ──────────────────────────────────────────────────────────────

/**
 * Synthesise the Contracting.com project that all sheet-derived tasks
 * sit under. Member ids come from the assignees of the tasks passed in.
 *
 * NOTE on id collision: the Atlas catalogue ALSO has a project slug
 * `contracting-com`. Whichever store-layer integration consumes both
 * sources will need to decide whether the sheets project replaces or
 * augments the Atlas one. The mapper doesn't pick a side.
 */
export function createContractingProject(
  tasks: Task[],
  _tabStats: ReadonlyMap<string, { total: number; mapped: number }> = new Map(),
  options: { now?: string } = {},
): Project {
  const now = options.now ?? new Date().toISOString()
  const memberSet = new Set<string>()
  for (const t of tasks) {
    if (typeof t.assigneeId === 'string' && t.assigneeId) {
      memberSet.add(t.assigneeId)
    }
  }
  return {
    id: 'contracting-com',
    name: 'Contracting.com',
    description:
      'Project management data from Google Sheets — 2026 Project Management spreadsheet',
    color: '#14B8A6',
    memberIds: Array.from(memberSet).sort(),
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: 'sheets-import',
  }
}

// ── Combined tab walk + diagnostics ──────────────────────────────────────

export interface CombineResult {
  tasks: Task[]
  members: TeamMember[]
  diagnostics: TabDiagnostics[]
  /** Per-task raw row data so the TaskDetail debug panel can show the
   *  original sheet values that produced the mapped task. Keyed by the
   *  task id the mapper emitted. */
  rawRowsByTaskId: Map<string, SheetsRawRow>
}

export interface SheetsRawRow {
  tabSlug: string
  rowIndex: number
  /** Header row from the same tab. Same length as `values`. */
  headers: string[]
  /** Cell values in the same order as `headers`. */
  values: string[]
}

/**
 * Walk every tracked tab in `tabDataMap` (keyed by tab slug), map rows
 * to tasks, dedupe by id, extract team members, and emit per-tab
 * diagnostics for the Settings panel.
 *
 * `Dev Bugs` tasks get a `"bug"` tag automatically. Other tracked tabs
 * pass through unchanged.
 */
export function combineTrackedTabs(
  tabDataMap: ReadonlyMap<string, string[][]>,
  projectId: string,
  options: MapRowOptions = {},
): CombineResult {
  const diagnostics: TabDiagnostics[] = []
  const seenIds = new Set<string>()
  const merged: Task[] = []
  const rawRowsByTaskId = new Map<string, SheetsRawRow>()

  for (const [tabSlug, tabData] of tabDataMap.entries()) {
    const header = (tabData[0] ?? []).map((h) => String(h ?? ''))
    const result = mapSheetTabToTasks(tabData, tabSlug, projectId, options)
    const augmented =
      tabSlug === 'dev-bugs'
        ? result.tasks.map((t) =>
            t.tags.includes('bug') ? t : { ...t, tags: [...t.tags, 'bug'] },
          )
        : result.tasks

    for (const t of augmented) {
      if (seenIds.has(t.id)) continue
      seenIds.add(t.id)
      merged.push(t)
    }

    // Pair each mapped task back to the original row (rowIndex from the
    // task id's `row-N` suffix — set by the mapper itself).
    for (const t of augmented) {
      const m = /-row-(\d+)$/.exec(t.id)
      if (!m) continue
      const rowIndex = Number(m[1])
      const row = tabData[rowIndex]
      if (!Array.isArray(row)) continue
      rawRowsByTaskId.set(t.id, {
        tabSlug,
        rowIndex,
        headers: header,
        values: row.map((v) => (v == null ? '' : String(v))),
      })
    }

    const columns = discoverColumns(header, `${tabSlug} (diagnostics)`)
    diagnostics.push({
      tabName: tabSlug,
      tabSlug,
      headerRow: header,
      columnMap: columns,
      unmappedColumns: result.unmappedColumns,
      totalRows: result.stats.total,
      mappedTasks: augmented.length,
      skippedRows: result.stats.skipped,
      sampleTask: augmented[0] ?? null,
    })
  }

  const members = extractTeamMembersFromSheets(merged, options)
  return { tasks: merged, members, diagnostics, rawRowsByTaskId }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readCell(row: string[], idx: number | null): string {
  if (idx === null) return ''
  if (idx < 0 || idx >= row.length) return ''
  const cell = row[idx]
  return cell == null ? '' : String(cell)
}

function parseTagList(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
}

function humaniseSlug(slug: string): string {
  if (!slug) return ''
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/**
 * Normalise an assignee cell into a canonical team-member slug.
 *
 * Atlas slugs are short and clean ("chris", "kosir", "rebeccah"), but
 * sheets often hold richer forms ("Chris M", "Brian Kosir", "Chris &
 * Clive"). The mapper walks the cell in priority order:
 *   1. Multi-owner cells take the FIRST name only — Task.assigneeId is
 *      single-valued.
 *   2. Direct slug match.
 *   3. Slugified first token matches a KNOWN_MEMBERS key.
 *   4. The first token equals one of KNOWN_MEMBERS' display names
 *      (case-insensitive).
 *   5. The cell starts with a known slug (handles "Chris M.").
 *   6. The cell contains a known slug as a whole word.
 *   7. Fallback: slugify the whole thing — produces a synthetic slug
 *      for unknown people so the team list at least picks them up.
 */
function normaliseAssignee(raw: string): string | null {
  if (!raw) return null
  const first = raw
    .split(/&| and |,|\//i)
    .map((s) => s.trim())
    .filter(Boolean)[0]
  if (!first) return null

  const firstLower = first.toLowerCase()
  const directSlug = slugify(first)

  // Step 2: direct slug match.
  if (KNOWN_MEMBERS[directSlug]) return directSlug

  // Step 3 + 4: first whitespace-delimited token.
  const firstWord = firstLower.split(/\s+/)[0] ?? ''
  if (firstWord) {
    const firstWordSlug = slugify(firstWord)
    if (KNOWN_MEMBERS[firstWordSlug]) return firstWordSlug
    for (const [slug, info] of Object.entries(KNOWN_MEMBERS)) {
      if (info.name.toLowerCase() === firstLower) return slug
      if (info.name.toLowerCase().startsWith(firstLower + ' ')) return slug
    }
  }

  // Step 5: cell starts with a known slug ("chris m.", "brian k").
  for (const slug of Object.keys(KNOWN_MEMBERS)) {
    if (firstLower === slug) return slug
    if (firstLower.startsWith(slug + ' ') || firstLower.startsWith(slug + '.')) {
      return slug
    }
  }

  // Step 6: known slug appears as a whole word anywhere in the cell.
  for (const slug of Object.keys(KNOWN_MEMBERS)) {
    const re = new RegExp(`\\b${escapeRegExp(slug)}\\b`, 'i')
    if (re.test(first)) return slug
  }

  // Step 7: synthetic slug for unknown people.
  return directSlug || null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parse a date string out of a cell. Accepts the four formats listed in
 * the spec plus a couple of common Sheets variants. Returns YYYY-MM-DD
 * (Task.dueDate shape) on success, null on failure.
 */
export function parseSheetDate(raw: string): string | null {
  const value = raw?.trim()
  if (!value) return null

  // ISO: 2026-06-15 (or with time)
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(value)) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return formatDate(d)
  }

  // US slashes: 6/15/2026, 06/15/2026, 6/15/26
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value)
  if (slash) {
    const month = Number(slash[1])
    const day = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  // ISO-ish with dashes but day first (some sheets export 15-06-2026)
  const eu = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value)
  if (eu) {
    const day = Number(eu[1])
    const month = Number(eu[2])
    const year = Number(eu[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }

  // Free-form, e.g. "June 15, 2026" / "Jun 15, 2026" — let the engine try.
  const fallback = new Date(value)
  if (!isNaN(fallback.getTime())) return formatDate(fallback)
  return null
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Type re-export so callers that already import the mapper can grab
// Activity from one place (used by the next-prompt wiring layer).
export type { Activity }

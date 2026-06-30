/**
 * Date helpers for the dashboard and other time-relative views.
 *
 * `now()` previously returned a fixed demo timestamp so the seeded
 * mock dashboard always rendered with populated buckets. The app now
 * runs on live Atlas / Sheets data, so the constant has been retired
 * and `now()` returns the real wall-clock time. Mock-mode fixtures
 * (still anchored to their old seed dates) will read as "stale" in
 * demo mode — acceptable trade-off since the live data sources are
 * the canonical view.
 */
export function now(): Date {
  return new Date()
}

/**
 * Parse a YYYY-MM-DD string as **local** midnight, never UTC. Use this
 * for any date-only string (meeting dates, due dates) where the value
 * carries no time or timezone — `new Date("2026-06-30")` follows the
 * ES spec and is parsed as UTC midnight, which shifts back a calendar
 * day in negative-offset timezones (PST, etc.).
 */
export function parseLocalDate(yyyyMMdd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMMdd)) return new Date(yyyyMMdd)
  const [y, m, d] = yyyyMMdd.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function asDate(input: Date | string): Date {
  if (input instanceof Date) return new Date(input)
  // Route date-only strings through parseLocalDate so the timezone
  // shift never happens. Anything with a time/zone marker goes
  // through new Date() unchanged.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseLocalDate(input)
  return new Date(input)
}

/**
 * Format a YYYY-MM-DD meeting date as "Jun 30, 2026" using local-date
 * parsing — never let `new Date(str)` UTC-shift it.
 *
 * Use this everywhere a meeting date is displayed (cards, detail
 * headers, breadcrumbs, source banners). The raw string is fine to
 * pass through `asDate` now too, but a dedicated formatter makes the
 * intent obvious at the call site and avoids needing to remember the
 * Intl options every time.
 */
export function formatMeetingDate(yyyyMMdd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMMdd)) return yyyyMMdd
  return asDate(yyyyMMdd).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Monday 00:00:00 of the ISO week containing `d`. */
export function startOfWeek(d: Date = now()): Date {
  const r = new Date(d)
  const day = r.getDay() // 0 = Sun … 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diffToMonday)
  r.setHours(0, 0, 0, 0)
  return r
}

/** Sunday 23:59:59.999 of the ISO week containing `d`. */
export function endOfWeek(d: Date = now()): Date {
  const start = startOfWeek(d)
  const r = new Date(start)
  r.setDate(r.getDate() + 7)
  r.setMilliseconds(-1)
  return r
}

export function startOfDay(d: Date = now()): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** Whole days between two dates (b - a), ignoring time-of-day. */
export function daysBetween(a: Date | string, b: Date | string = now()): number {
  const da = startOfDay(asDate(a)).getTime()
  const db = startOfDay(asDate(b)).getTime()
  return Math.floor((db - da) / 86_400_000)
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return startOfDay(asDate(dueDate)).getTime() < startOfDay(now()).getTime()
}

/** True when `date` falls inside the current Mon–Sun (inclusive). */
export function isInThisWeek(date: string | null): boolean {
  if (!date) return false
  const t = asDate(date).getTime()
  return t >= startOfWeek().getTime() && t <= endOfWeek().getTime()
}

/** Visual tone for the relative due-date label. Consumers map to a color. */
export type DueDateTone = 'today' | 'critical' | 'primary' | 'secondary'

export interface RelativeDueDate {
  /** Human label — e.g. "Today", "Overdue — 3 days", "Wednesday", "Jun 15". */
  label: string
  tone: DueDateTone
  /** True when the date is in the past (and the task isn't done — caller decides). */
  overdue: boolean
  /** Days from today (negative = past). 0 = today, 1 = tomorrow. */
  diffDays: number
}

/**
 * Resolve a stored `YYYY-MM-DD` date into its display form.
 *
 * Returns `null` when the input is `null` — callers should render nothing in
 * that case (no "No date" placeholder, per the design spec).
 *
 * Buckets (relative to today):
 * - Past → "Overdue — N day(s)", tone: critical
 * - Today (0) → "Today", tone: today
 * - Tomorrow (1) → "Tomorrow", tone: primary
 * - Rest of this calendar week → day name ("Wednesday"), tone: primary
 * - Next calendar week → "Next [day]" ("Next Wednesday"), tone: primary
 * - 14+ days OR beyond next week → "Mon DD" ("Jun 15"), tone: secondary
 */
export function formatRelativeDueDate(
  iso: string | null,
): RelativeDueDate | null {
  if (!iso) return null
  const due = asDate(iso)
  // Guard against legacy/garbage values like "unknown" that slipped past
  // earlier normalization — never surface "Invalid Date" to the UI.
  if (Number.isNaN(due.getTime())) return null
  const diffDays = daysBetween(now(), due)

  if (diffDays < 0) {
    const n = Math.abs(diffDays)
    return {
      label: `Overdue — ${n} ${n === 1 ? 'day' : 'days'}`,
      tone: 'critical',
      overdue: true,
      diffDays,
    }
  }
  if (diffDays === 0) {
    return { label: 'Today', tone: 'today', overdue: false, diffDays }
  }
  if (diffDays === 1) {
    return { label: 'Tomorrow', tone: 'primary', overdue: false, diffDays }
  }

  // Calendar-week boundaries — Mon 00:00 of the current week.
  const weekStart = startOfWeek().getTime()
  const nextWeekStart = weekStart + 7 * 86_400_000
  const weekAfterStart = weekStart + 14 * 86_400_000
  const dueTime = startOfDay(due).getTime()

  if (dueTime < nextWeekStart) {
    return {
      label: due.toLocaleDateString(undefined, { weekday: 'long' }),
      tone: 'primary',
      overdue: false,
      diffDays,
    }
  }
  if (dueTime < weekAfterStart) {
    return {
      label: `Next ${due.toLocaleDateString(undefined, { weekday: 'long' })}`,
      tone: 'primary',
      overdue: false,
      diffDays,
    }
  }

  return {
    label: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'secondary',
    overdue: false,
    diffDays,
  }
}

/** Map a `DueDateTone` to a CSS-variable-backed text color class. */
export const DUE_TONE_CLASS: Record<DueDateTone, string> = {
  today: 'text-[var(--accent-primary)]',
  critical: 'text-[var(--priority-critical)]',
  primary: 'text-[var(--text-primary)]',
  secondary: 'text-[var(--text-secondary)]',
}

// ---- Preset helpers (shared by every due-date picker) -----------------------

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** Next occurrence of `weekday` strictly in the future (1 = Mon, 5 = Fri). */
export function nextDayOfWeek(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 0): Date {
  const today = now()
  const current = today.getDay()
  let diff = weekday - current
  if (diff <= 0) diff += 7
  return addDays(today, diff)
}

/** Stable `YYYY-MM-DD` formatter — same convention the date picker stores. */
export function formatYYYYMMDD(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export interface DueDatePreset {
  label: string
  /** Resolved at click-time so the value always reflects today's `now()`. */
  resolve: () => string | null
}

/**
 * Seven canonical presets used everywhere a due date can be picked. Callers
 * render these as a button row above the custom calendar input.
 */
export const DUE_DATE_PRESETS: DueDatePreset[] = [
  { label: 'Today', resolve: () => formatYYYYMMDD(now()) },
  { label: 'Tomorrow', resolve: () => formatYYYYMMDD(addDays(now(), 1)) },
  { label: 'Next Monday', resolve: () => formatYYYYMMDD(nextDayOfWeek(1)) },
  { label: 'Next Friday', resolve: () => formatYYYYMMDD(nextDayOfWeek(5)) },
  { label: 'In 1 week', resolve: () => formatYYYYMMDD(addDays(now(), 7)) },
  { label: 'In 2 weeks', resolve: () => formatYYYYMMDD(addDays(now(), 14)) },
  { label: 'No date', resolve: () => null },
]

/** "May 28, 2026 at 2:34 PM" — used by the per-item timestamp toggle in feeds. */
export function formatAbsoluteDateTime(iso: string): string {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} at ${time}`
}

/** "just now" / "12m ago" / "3h ago" / "yesterday" / "3d ago" / "May 8". */
export function relativeTime(iso: string): string {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  const then = d.getTime()
  const ref = now().getTime()
  const diffMs = ref - then

  if (diffMs < 0) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = daysBetween(iso)
  if (diffDays === 0) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

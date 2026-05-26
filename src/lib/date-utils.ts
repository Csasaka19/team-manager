/**
 * Date helpers for the dashboard and other time-relative views.
 *
 * `now()` returns a fixed demo timestamp so the seeded dashboard buckets
 * stay populated no matter when the app is opened. Swap the constant for
 * `new Date()` once the backend is real.
 */

const DEMO_NOW = new Date('2026-05-22T18:00:00Z')

export function now(): Date {
  return new Date(DEMO_NOW)
}

function asDate(input: Date | string): Date {
  return typeof input === 'string' ? new Date(input) : new Date(input)
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

/** "just now" / "12m ago" / "3h ago" / "yesterday" / "3d ago" / "May 8". */
export function relativeTime(iso: string): string {
  const then = asDate(iso).getTime()
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

  return asDate(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

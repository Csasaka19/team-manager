/**
 * Pure helpers for grouping ZoomBot recording files into displayable
 * sessions. Kept separate from the React components so the grouping is
 * straightforward to test and reuse (the meeting detail page renders
 * the same shape for a single session as the project page renders for
 * all of them).
 */

import type { ZoomRecording } from '@/services/zoombot-types'

/** A single date's worth of files split by purpose. */
export interface RecordingSession {
  /** YYYY-MM-DD or '' for files we couldn't date. */
  date: string
  audio: ZoomRecording[]
  video: ZoomRecording[]
  /** Files whose name contains "zoom-transcript" — the post-meeting
   *  whisper output, generally more complete than live captions. */
  fullTranscripts: ZoomRecording[]
  /** Other caption files — the real-time stream. */
  liveCaptions: ZoomRecording[]
  totalSize: number
  /** Per-type file counts. Convenient for the collapsed header line. */
  counts: {
    audio: number
    video: number
    transcripts: number
  }
}

const DATE_RE = /(\d{4})-(\d{1,2})-(\d{1,2})/

/** Pulls the first YYYY-M(M)-D(D) match out of a filename or path. */
export function extractDate(s: string): string | null {
  const m = DATE_RE.exec(s)
  if (!m) return null
  const y = m[1]
  const mo = m[2]?.padStart(2, '0')
  const d = m[3]?.padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * Walks every recording, drops 0-byte files (server sometimes creates
 * them as placeholders), and groups by date → session. Empty sessions
 * are pruned at the end so a session with only video and no captions
 * still appears, but a date with literally nothing doesn't.
 */
export function groupRecordingsBySession(
  recordings: ZoomRecording[],
): RecordingSession[] {
  const map = new Map<string, RecordingSession>()
  const undated: RecordingSession = makeEmptySession('')

  for (const r of recordings) {
    if (!r || r.size === 0) continue
    const dateKey =
      extractDate(r.name ?? '') ?? extractDate(r.path ?? '') ?? ''
    const session = dateKey
      ? map.get(dateKey) ?? makeEmptySession(dateKey)
      : undated
    if (dateKey) map.set(dateKey, session)

    session.totalSize += r.size
    if (r.type === 'audio') {
      session.audio.push(r)
      session.counts.audio += 1
    } else if (r.type === 'video') {
      session.video.push(r)
      session.counts.video += 1
    } else if (r.type === 'captions') {
      if (/zoom-transcript/i.test(r.name)) session.fullTranscripts.push(r)
      else session.liveCaptions.push(r)
      session.counts.transcripts += 1
    }
    // r.type === 'session' is skipped — it's typically a JSON meta file
    // we don't render directly.
  }

  const sessions = Array.from(map.values())
  if (sessionHasFiles(undated)) sessions.push(undated)
  // Newest first.
  sessions.sort((a, b) => b.date.localeCompare(a.date))
  return sessions
}

function makeEmptySession(date: string): RecordingSession {
  return {
    date,
    audio: [],
    video: [],
    fullTranscripts: [],
    liveCaptions: [],
    totalSize: 0,
    counts: { audio: 0, video: 0, transcripts: 0 },
  }
}

function sessionHasFiles(s: RecordingSession): boolean {
  return (
    s.audio.length > 0 ||
    s.video.length > 0 ||
    s.fullTranscripts.length > 0 ||
    s.liveCaptions.length > 0
  )
}

/**
 * Bucket sessions into month groups keyed by YYYY-MM. Used by the UI
 * to fold older months when the total file count crosses the
 * many-files threshold.
 */
export function groupSessionsByMonth(
  sessions: RecordingSession[],
): Map<string, RecordingSession[]> {
  const map = new Map<string, RecordingSession[]>()
  for (const s of sessions) {
    const monthKey = s.date ? s.date.slice(0, 7) : 'unknown'
    const list = map.get(monthKey)
    if (list) list.push(s)
    else map.set(monthKey, [s])
  }
  return map
}

/**
 * Friendly filename for display rows. Strips a leading YYYY-MM-DD,
 * the file extension, and prettifies the separators. Falls back to the
 * full name if stripping leaves nothing.
 */
export function shortenFilename(name: string): string {
  let stem = name.replace(/^\d{4}-\d{1,2}-\d{1,2}[_-]?/, '')
  stem = stem.replace(/\.[a-z0-9]+$/i, '')
  stem = stem.replace(/[_-]+/g, ' ').trim()
  return stem || name
}

/** "2026-06-10" → "June 10, 2026". Falls back to the input on a parse miss. */
export function formatSessionDate(date: string): string {
  if (!date) return 'Unknown date'
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** "2026-06" → "June 2026". */
export function formatMonthKey(month: string): string {
  if (month === 'unknown') return 'Undated'
  const d = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return month
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Build a YYYY-MM string for "the current month" in local time, used
 *  by the UI to decide which month groups to leave expanded by default. */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

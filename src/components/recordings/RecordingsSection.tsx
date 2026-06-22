/**
 * Meeting recordings UI mounted under the project Meetings tab.
 *
 * Three responsibilities:
 *   1. Fetch the recordings list from the ZoomBot REST endpoint on
 *      mount (and on a manual refresh) via the context's
 *      `fetchRecordings` action.
 *   2. Group what comes back into per-date sessions, split each
 *      session into audio / video / full-transcript / live-caption
 *      sub-lists, and render a collapsible card per session.
 *   3. Render correct empty / error / loading / unconfigured states so
 *      this section is safe to mount even when ZoomBot is offline.
 *
 * Reused by `MeetingDetailPage` via the `filterDate` prop — same
 * grouping pipeline, scoped to one session.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  Loader2,
  Play,
  RefreshCw,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useZoomBot } from '@/hooks/useZoomBot'
import {
  fetchTranscriptText,
  getRecordingUrl,
} from '@/services/zoombot-api'
import { isZoomBotConfigured } from '@/services/zoombot-config'
import type { ZoomBot, ZoomRecording } from '@/services/zoombot-types'
import {
  currentMonthKey,
  formatBytes,
  formatMonthKey,
  formatSessionDate,
  groupRecordingsBySession,
  groupSessionsByMonth,
  shortenFilename,
  type RecordingSession,
} from '@/lib/recordings-grouping'

/** Threshold (total file count) above which we group sessions by month
 *  and collapse months older than the current one by default. */
const MANY_FILES_THRESHOLD = 100

interface RecordingsSectionProps {
  /** When set, filter to the matching date's session only (used on the
   *  meeting detail page). When omitted, show every session. */
  filterDate?: string
  /** Hide the section title — useful when embedding inside another
   *  surface that has its own heading. */
  compact?: boolean
}

export function RecordingsSection({ filterDate, compact = false }: RecordingsSectionProps) {
  const {
    recordings,
    recordingsLoading,
    connectionError,
    fetchRecordings,
    activeBots,
  } = useZoomBot()
  const configured = isZoomBotConfigured()

  // Only fire the initial fetch once per mount. The context caches the
  // list, so re-rendering doesn't re-fetch.
  const requestedRef = useRef<boolean>(false)
  useEffect(() => {
    if (!configured) return
    if (requestedRef.current) return
    requestedRef.current = true
    void fetchRecordings()
  }, [configured, fetchRecordings])

  // Paths that the active bots are currently writing to. Used to label
  // those files as "Recording in progress…" in the UI.
  const inProgressPaths = useMemo(
    () => buildInProgressSet(activeBots),
    [activeBots],
  )

  const sessions = useMemo(() => {
    const all = groupRecordingsBySession(recordings ?? [])
    if (!filterDate) return all
    return all.filter((s) => s.date === filterDate)
  }, [recordings, filterDate])

  const totalFiles = useMemo(
    () => (recordings ?? []).filter((r) => r.size > 0).length,
    [recordings],
  )

  const header = compact ? null : (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Meeting Recordings
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Audio, video, and transcripts from ZoomBot.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          requestedRef.current = true
          void fetchRecordings()
        }}
        disabled={recordingsLoading || !configured}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {recordingsLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Refresh
      </button>
    </header>
  )

  // ── Empty / unconfigured / error short-circuits ────────────────────
  if (!configured) {
    return (
      <section className="space-y-3">
        {header}
        <UnconfiguredState />
      </section>
    )
  }
  if (recordingsLoading && recordings === null) {
    return (
      <section className="space-y-3">
        {header}
        <LoadingState />
      </section>
    )
  }
  if (connectionError && (recordings === null || recordings.length === 0)) {
    return (
      <section className="space-y-3">
        {header}
        <ErrorState
          error={connectionError}
          onRetry={() => {
            requestedRef.current = true
            void fetchRecordings()
          }}
        />
      </section>
    )
  }
  if (sessions.length === 0) {
    return (
      <section className="space-y-3">
        {header}
        <EmptyState filterDate={filterDate} />
      </section>
    )
  }

  // ── Many-files mode: group by month, collapse older months ──────
  const groupByMonth = totalFiles >= MANY_FILES_THRESHOLD && !filterDate
  if (groupByMonth) {
    const byMonth = groupSessionsByMonth(sessions)
    const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a))
    const currentMonth = currentMonthKey()
    return (
      <section className="space-y-3">
        {header}
        <p className="text-xs text-[var(--text-muted)]">
          Showing {totalFiles} files across {sessions.length} session
          {sessions.length === 1 ? '' : 's'} — older months are collapsed by
          default.
        </p>
        <div className="space-y-3">
          {months.map((m) => (
            <MonthGroup
              key={m}
              month={m}
              sessions={byMonth.get(m) ?? []}
              defaultOpen={m === currentMonth}
              inProgressPaths={inProgressPaths}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      {header}
      <div className="space-y-3">
        {sessions.map((s) => (
          <SessionCard
            key={s.date || 'undated'}
            session={s}
            inProgressPaths={inProgressPaths}
            defaultOpen={sessions.length === 1}
          />
        ))}
      </div>
    </section>
  )
}

// ── Month group ────────────────────────────────────────────────────────

function MonthGroup({
  month,
  sessions,
  defaultOpen,
  inProgressPaths,
}: {
  month: string
  sessions: RecordingSession[]
  defaultOpen: boolean
  inProgressPaths: ReadonlySet<string>
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  const totalFiles = sessions.reduce(
    (sum, s) =>
      sum +
      s.counts.audio +
      s.counts.video +
      s.counts.transcripts,
    0,
  )
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {formatMonthKey(month)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {sessions.length} session{sessions.length === 1 ? '' : 's'} ·{' '}
            {totalFiles} file{totalFiles === 1 ? '' : 's'}
          </p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--border-subtle)] p-3">
          {sessions.map((s) => (
            <SessionCard
              key={s.date || 'undated'}
              session={s}
              inProgressPaths={inProgressPaths}
              defaultOpen={false}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Session card ───────────────────────────────────────────────────────

function SessionCard({
  session,
  inProgressPaths,
  defaultOpen,
}: {
  session: RecordingSession
  inProgressPaths: ReadonlySet<string>
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  const { audio, video, fullTranscripts, liveCaptions, counts, totalSize, date } = session

  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {formatSessionDate(date)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
            {counts.audio} audio · {counts.video} video ·{' '}
            {counts.transcripts} transcript
            {counts.transcripts === 1 ? '' : 's'} ·{' '}
            <span className="text-[var(--text-secondary)]">
              {formatBytes(totalSize)}
            </span>
          </p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border-subtle)] p-4">
          <SubSection
            icon={<FileAudio className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Audio Files"
            count={audio.length}
            empty="No audio captured."
          >
            <ul className="space-y-2">
              {audio.map((r) => (
                <AudioFileRow
                  key={r.path}
                  recording={r}
                  inProgress={inProgressPaths.has(r.path)}
                />
              ))}
            </ul>
          </SubSection>

          <SubSection
            icon={<FileVideo className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Video Files"
            count={video.length}
            empty="No screen shares recorded."
          >
            <ul className="space-y-2">
              {video.map((r) => (
                <VideoFileRow
                  key={r.path}
                  recording={r}
                  inProgress={inProgressPaths.has(r.path)}
                />
              ))}
            </ul>
          </SubSection>

          <SubSection
            icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Transcripts"
            count={fullTranscripts.length + liveCaptions.length}
            empty="No transcripts produced."
          >
            {fullTranscripts.length > 0 && (
              <TranscriptGroup
                heading="Full transcripts"
                files={fullTranscripts}
                preferred
              />
            )}
            {liveCaptions.length > 0 && (
              <TranscriptGroup
                heading="Live captions"
                files={liveCaptions}
                preferred={false}
              />
            )}
          </SubSection>
        </div>
      )}
    </section>
  )
}

function SubSection({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        {icon}
        {title}
        <span className="ml-1 text-[10px] tabular-nums text-[var(--text-muted)]">
          ({count})
        </span>
      </h3>
      <div className="mt-2">
        {count === 0 ? (
          <p className="text-xs italic text-[var(--text-muted)]">{empty}</p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// ── Audio row ──────────────────────────────────────────────────────────

function AudioFileRow({
  recording,
  inProgress,
}: {
  recording: ZoomRecording
  inProgress: boolean
}) {
  const url = getRecordingUrl(recording.path)
  return (
    <li className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {shortenFilename(recording.name)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {formatBytes(recording.size)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inProgress && <InProgressBadge />}
          <DownloadButton href={url} filename={recording.name} />
        </div>
      </div>
      <audio
        className="mt-2 h-9 w-full"
        controls
        preload="none"
        src={url}
      />
    </li>
  )
}

// ── Video row + modal ──────────────────────────────────────────────────

function VideoFileRow({
  recording,
  inProgress,
}: {
  recording: ZoomRecording
  inProgress: boolean
}) {
  const [open, setOpen] = useState<boolean>(false)
  const url = getRecordingUrl(recording.path)
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {shortenFilename(recording.name)}
        </p>
        <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
          {formatBytes(recording.size)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {inProgress && <InProgressBadge />}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <Play className="h-3 w-3" aria-hidden="true" />
          Play
        </button>
        <DownloadButton href={url} filename={recording.name} />
      </div>
      {open && (
        <VideoPlayerModal
          url={url}
          title={shortenFilename(recording.name)}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  )
}

function VideoPlayerModal({
  url,
  title,
  onClose,
}: {
  url: string
  title: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video player: ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <video
          className="w-full rounded-md bg-black"
          controls
          autoPlay
          src={url}
        />
      </div>
    </div>
  )
}

// ── Transcript row ─────────────────────────────────────────────────────

function TranscriptGroup({
  heading,
  files,
  preferred,
}: {
  heading: string
  files: ZoomRecording[]
  preferred: boolean
}) {
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        {heading}
        {preferred && (
          <span className="ml-1.5 inline-flex h-4 items-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] px-1.5 text-[9px] font-medium uppercase tracking-[0.5px] text-[var(--accent-primary)]">
            Preferred
          </span>
        )}
      </p>
      <ul className="mt-1.5 space-y-2">
        {files.map((r) => (
          <TranscriptFileRow key={r.path} recording={r} />
        ))}
      </ul>
    </div>
  )
}

function TranscriptFileRow({ recording }: { recording: ZoomRecording }) {
  const url = getRecordingUrl(recording.path)
  const [open, setOpen] = useState<boolean>(false)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const ensureText = async (): Promise<string | null> => {
    if (text !== null) return text
    setLoading(true)
    setError(null)
    try {
      const body = await fetchTranscriptText(recording.path)
      setText(body)
      return body
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async () => {
    if (!open) await ensureText()
    setOpen((o) => !o)
  }

  const handleCopy = async () => {
    const body = await ensureText()
    if (body === null) {
      toast.error('Could not load transcript to copy.')
      return
    }
    try {
      await navigator.clipboard.writeText(body)
      toast.success('Transcript copied to clipboard.')
    } catch {
      toast.error('Clipboard unavailable.')
    }
  }

  const isEmpty = text !== null && text.trim().length === 0

  return (
    <li className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {shortenFilename(recording.name)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {formatBytes(recording.size)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : null}
            {open ? 'Hide' : 'View'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading}
            aria-label="Copy transcript"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <DownloadButton href={url} filename={recording.name} />
        </div>
      </div>
      {open && (
        <div className="mt-3 max-h-[400px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-[13px] leading-relaxed text-[var(--text-primary)]">
          {error ? (
            <p className="text-[var(--priority-critical)]">{error}</p>
          ) : loading ? (
            <p className="text-[var(--text-muted)]">Loading…</p>
          ) : isEmpty ? (
            <p className="text-[var(--text-muted)]">
              This transcript is empty — no speech was detected.
            </p>
          ) : (
            <TranscriptBody text={text ?? ''} />
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Renders a transcript body with speaker attribution. A line starting
 * with "Name: …" gets the name bolded; everything else passes through
 * as plain text with newlines preserved.
 */
function TranscriptBody({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="whitespace-pre-wrap break-words font-mono text-[12px]">
      {lines.map((line, i) => {
        const m = /^([A-Za-z][A-Za-z0-9 ._'-]{0,40}?):\s+(.*)$/.exec(line)
        if (m) {
          return (
            <div key={i}>
              <span className="font-bold text-[var(--text-primary)]">{m[1]}:</span>{' '}
              <span className="text-[var(--text-secondary)]">{m[2]}</span>
            </div>
          )
        }
        if (line.trim() === '') {
          return <div key={i} className="h-3" aria-hidden="true" />
        }
        return (
          <div key={i} className="text-[var(--text-secondary)]">
            {line}
          </div>
        )
      })}
    </div>
  )
}

// ── Misc bits ──────────────────────────────────────────────────────────

function DownloadButton({ href, filename }: { href: string; filename: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      download={filename}
      aria-label={`Download ${filename}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

function InProgressBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--priority-critical)]">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          aria-hidden="true"
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--priority-critical)] opacity-75"
        />
        <span
          aria-hidden="true"
          className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--priority-critical)]"
        />
      </span>
      Recording in progress
    </span>
  )
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-8 text-center">
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--text-muted)]" aria-hidden="true" />
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Loading recordings…</p>
    </div>
  )
}

function EmptyState({ filterDate }: { filterDate?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-8 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        {filterDate
          ? 'No recordings for this date.'
          : 'No recordings found.'}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Recordings appear here after ZoomBot captures a meeting.
      </p>
    </div>
  )
}

function UnconfiguredState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-8 text-center">
      <SettingsIcon className="h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm text-[var(--text-secondary)]">
        Meeting recordings are available when ZoomBot is configured.
      </p>
      <Link
        to="/settings"
        className="text-xs text-[var(--accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded"
      >
        Ask your admin to set it up in Settings
      </Link>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--priority-critical)_25%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--priority-critical)_8%,transparent)] px-4 py-4">
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
        <AlertTriangle className="h-4 w-4 text-[var(--priority-critical)]" aria-hidden="true" />
        Could not load recordings
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        Retry
      </button>
    </div>
  )
}

// ── Internals ──────────────────────────────────────────────────────────

function buildInProgressSet(activeBots: ZoomBot[]): Set<string> {
  const s = new Set<string>()
  for (const b of activeBots) {
    if (b.recordingFile) s.add(b.recordingFile)
  }
  return s
}

/**
 * Helper exported for callers (the meeting list / detail page) that
 * need to know which dates have recordings — drives the "Recordings
 * available" badge.
 */
export function buildRecordingDateSet(
  recordings: ZoomRecording[] | null,
): Set<string> {
  const out = new Set<string>()
  if (!recordings) return out
  for (const r of recordings) {
    if (r.size === 0) continue
    const d =
      extractDateFromRecording(r.name ?? '') ??
      extractDateFromRecording(r.path ?? '')
    if (d) out.add(d)
  }
  return out
}

function extractDateFromRecording(s: string): string | null {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (!m) return null
  return `${m[1]}-${m[2]?.padStart(2, '0')}-${m[3]?.padStart(2, '0')}`
}

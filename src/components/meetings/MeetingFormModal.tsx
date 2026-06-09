import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { cn } from '@/lib/utils'
import { formatYYYYMMDD } from '@/lib/date-utils'
import { now } from '@/lib/date-utils'
import type { MeetingStatus, TeamMember } from '@/data/types'

export interface MeetingFormValues {
  title: string
  date: string
  startTime: string | null
  duration: number | null
  attendeeIds: string[]
  status: MeetingStatus
  location: string | null
  agenda: string | null
}

interface MeetingFormModalProps {
  open: boolean
  members: TeamMember[]
  /** Locked when this modal is opened from inside a project context. */
  projectName: string
  onClose: () => void
  onSubmit: (values: MeetingFormValues) => Promise<void>
}

const INPUT_CLASS =
  'h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]'

export function MeetingFormModal({
  open,
  members,
  projectName,
  onClose,
  onSubmit,
}: MeetingFormModalProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => formatYYYYMMDD(now()))
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState('')
  const [location, setLocation] = useState('')
  const [agenda, setAgenda] = useState('')
  const [status, setStatus] = useState<MeetingStatus>('scheduled')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDate(formatYYYYMMDD(now()))
    setStartTime('')
    setDuration('')
    setLocation('')
    setAgenda('')
    setStatus('scheduled')
    setAttendeeIds([])
    setError(null)
    setBusy(false)
    queueMicrotask(() => titleRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const toggleAttendee = (id: string) => {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const t = title.trim()
    if (!t) {
      setError('Title is required.')
      return
    }
    if (t.length > 200) {
      setError('Title must be 200 characters or fewer.')
      return
    }
    if (!date) {
      setError('Pick a date.')
      return
    }
    const dur = duration.trim() === '' ? null : Number(duration)
    if (dur !== null && (Number.isNaN(dur) || dur < 0)) {
      setError('Duration must be a non-negative number of minutes.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        title: t,
        date,
        startTime: startTime.trim() || null,
        duration: dur,
        attendeeIds,
        status,
        location: location.trim() || null,
        agenda: agenda.trim() || null,
      })
    } catch {
      setError('Could not create the meeting. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="relative max-h-[calc(100vh-3rem)] w-full max-w-[520px] animate-[modalIn_200ms_ease-out] overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <div>
            <h2
              id="meeting-form-title"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              New meeting
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Filed under <span className="text-[var(--text-secondary)]">{projectName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Meeting title — e.g. Sprint Planning, Design Review"
            aria-label="Meeting title"
            required
            maxLength={200}
            className={cn(INPUT_CLASS, 'text-[15px]')}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={cn(INPUT_CLASS, 'mt-1')}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                Start time (optional)
              </span>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="10:00 AM"
                className={cn(INPUT_CLASS, 'mt-1')}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                Duration (minutes)
              </span>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="30"
                className={cn(INPUT_CLASS, 'mt-1')}
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
                Status
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MeetingStatus)}
                className={cn(INPUT_CLASS, 'mt-1')}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Location (optional)
            </span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Google Meet · Discord #channel · In-person"
              className={cn(INPUT_CLASS, 'mt-1')}
            />
          </label>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Attendees
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {members.map((m) => {
                const selected = attendeeIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAttendee(m.id)}
                    aria-pressed={selected}
                    className={cn(
                      'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
                      selected
                        ? 'border-transparent bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                        : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
              Agenda (optional)
            </span>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={3}
              placeholder="What's planned for this meeting"
              className="mt-1 w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
            />
          </label>

          {error && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !date}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

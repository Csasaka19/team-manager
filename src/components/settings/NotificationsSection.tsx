import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useAuth } from '@/data/auth'
import {
  isNotifSoundEnabled,
  playNotificationSound,
  setNotifSoundEnabled,
} from '@/lib/notification-sound'
import { isSupabaseConfigured } from '@/services/supabase'
import {
  updateNotificationPreferences,
  type NotificationPreferencesRow,
} from '@/services/supabase-api'
import { cn } from '@/lib/utils'

type PrefKey =
  | 'assigned'
  | 'comment'
  | 'mention'
  | 'status_change'
  | 'due_tomorrow'
  | 'overdue'

const PREFS_STORAGE_PREFIX = 'team-manager.notif-prefs.'

const DEFAULTS: Record<PrefKey, boolean> = {
  assigned: true,
  comment: true,
  mention: true,
  status_change: true,
  due_tomorrow: true,
  overdue: true,
}

interface PrefDescriptor {
  key: PrefKey
  label: string
  description: string
}

const PREFS: PrefDescriptor[] = [
  { key: 'assigned', label: 'Task assigned to me', description: 'A PM assigns a task to you.' },
  { key: 'comment', label: 'Comments on my tasks', description: 'Someone comments on a task you’re assigned to.' },
  { key: 'mention', label: 'Mentions', description: 'You’re @mentioned in a comment.' },
  { key: 'status_change', label: 'Status changes', description: 'A task assigned to you moves to a new column.' },
  { key: 'due_tomorrow', label: 'Due tomorrow', description: 'Reminder the day before a task is due.' },
  { key: 'overdue', label: 'Overdue', description: 'Daily reminder when a task is past due.' },
]

function loadPrefs(userId: string): Record<PrefKey, boolean> {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_PREFIX + userId)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Record<PrefKey, boolean>>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function savePrefs(userId: string, prefs: Record<PrefKey, boolean>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_STORAGE_PREFIX + userId, JSON.stringify(prefs))
  } catch {
    // ignore (private mode, quota, etc.)
  }
  // Mirror to Supabase so the same user gets the same prefs on another
  // device. Fire-and-forget — localStorage stays the source of truth
  // for the local read path, Supabase is the shared-team copy.
  if (isSupabaseConfigured()) {
    const row: Partial<NotificationPreferencesRow> = {
      task_assigned: prefs.assigned,
      comment_on_task: prefs.comment,
      mentioned: prefs.mention,
      status_changed: prefs.status_change,
      due_tomorrow: prefs.due_tomorrow,
      overdue: prefs.overdue,
    }
    void updateNotificationPreferences(userId, row)
  }
}

function savePlaySound(userId: string, enabled: boolean) {
  if (!isSupabaseConfigured()) return
  void updateNotificationPreferences(userId, { play_sound: enabled })
}

export function NotificationsSection() {
  const { currentUser } = useAuth()
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(DEFAULTS)
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    setPrefs(loadPrefs(currentUser.id))
    setSoundOn(isNotifSoundEnabled(currentUser.id))
  }, [currentUser])

  if (!currentUser) return null

  const toggle = (key: PrefKey) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      savePrefs(currentUser.id, next)
      return next
    })
  }

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    setNotifSoundEnabled(currentUser.id, next)
    savePlaySound(currentUser.id, next)
    // Audio is gated to a user gesture in most browsers. Enabling the toggle
    // counts as a gesture, so we use this moment to play a confirming chime
    // — also doubles as the "did the sound work?" preview.
    if (next) playNotificationSound()
  }

  return (
    <section aria-labelledby="notifications-heading">
      <h2
        id="notifications-heading"
        className="text-lg font-semibold text-[var(--text-primary)]"
      >
        Notifications
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Choose what shows up in your bell. In-app only for now.
      </p>

      <ul className="mt-5 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {PREFS.map(({ key, label, description }) => (
          <li
            key={key}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
              <p className="text-xs text-[var(--text-secondary)]">{description}</p>
            </div>
            <Toggle
              checked={prefs[key]}
              onChange={() => toggle(key)}
              ariaLabel={label}
            />
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Play notification sound
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              A short two-note chime when a new notification arrives. Default: off.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => playNotificationSound()}
              aria-label="Play test sound"
              title="Play test sound"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <Toggle
              checked={soundOn}
              onChange={toggleSound}
              ariaLabel="Play notification sound"
            />
          </div>
        </li>
      </ul>
    </section>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: () => void
  ariaLabel: string
}

function Toggle({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
        checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-elevated)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import {
  DEFAULT_DISCORD_SETTINGS,
  type DiscordEvent,
  type DiscordSettings,
} from '@/services/discord'
import { cn } from '@/lib/utils'

interface EventOption {
  key: DiscordEvent
  label: string
  description: string
}

const EVENTS: EventOption[] = [
  {
    key: 'task_created',
    label: 'Task created',
    description: 'A new task is added to any project.',
  },
  {
    key: 'task_status_changed',
    label: 'Task status changed',
    description: 'A task moves between columns.',
  },
  {
    key: 'task_assigned',
    label: 'Task assigned',
    description: 'A task is assigned (or reassigned) to someone.',
  },
  {
    key: 'task_completed',
    label: 'Task completed',
    description: 'A task moves to the Done column.',
  },
  {
    key: 'task_overdue',
    label: 'Task overdue (daily summary)',
    description:
      'A once-a-day digest of overdue tasks — requires a backend scheduler, not wired in this MVP.',
  },
  {
    key: 'comment_posted',
    label: 'Comment posted',
    description: 'Someone leaves a comment on any task.',
  },
  {
    key: 'sheets_initial_sync',
    label: 'Sheets initial sync',
    description:
      'Posts once when the Google Sheets data finishes loading at startup — Contracting.com totals + team roster.',
  },
  {
    key: 'sheets_changes_detected',
    label: 'Sheets changes detected',
    description:
      'On each 15-min refresh, post a digest of added / removed / changed rows. Off by default — can be chatty on a busy sheet.',
  },
  {
    key: 'sheets_sync_failed',
    label: 'Sheets sync failed',
    description:
      'Alerts when a refresh errors out (revoked token, 5xx, network) so you find out before the team does.',
  },
  {
    key: 'zoombot_meeting_started',
    label: 'Meeting started',
    description:
      'ZoomBot has begun recording a meeting. Includes the participants being tracked.',
  },
  {
    key: 'zoombot_meeting_ended',
    label: 'Meeting ended',
    description:
      'Posts when all bots stop. Includes duration and total bytes captured.',
  },
  {
    key: 'zoombot_bot_error',
    label: 'Bot error',
    description:
      'Fires when a specific bot fails mid-meeting. Useful for catching join failures and disconnects.',
  },
]

const WEBHOOK_URL_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i

function isValidWebhook(url: string): boolean {
  return WEBHOOK_URL_PATTERN.test(url.trim())
}

export function DiscordSection() {
  const { discordSettings, setDiscordSettings, testDiscordWebhook } = useData()

  const [draft, setDraft] = useState<DiscordSettings>(discordSettings)
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(discordSettings)
  const urlValid = !draft.webhookUrl || isValidWebhook(draft.webhookUrl)

  const handleToggle = (key: DiscordEvent) => {
    setDraft((prev) => ({
      ...prev,
      events: { ...prev.events, [key]: !prev.events[key] },
    }))
  }

  const handleSave = () => {
    if (!urlValid) {
      toast.error('Webhook URL must start with https://discord.com/api/webhooks/.')
      return
    }
    setSaving(true)
    setDiscordSettings({ ...draft, webhookUrl: draft.webhookUrl.trim() })
    setSaving(false)
    toast.success('Discord settings saved.')
  }

  const handleReset = () => {
    setDraft({ ...DEFAULT_DISCORD_SETTINGS })
  }

  const handleTest = async () => {
    if (!draft.webhookUrl.trim()) {
      toast.error('Add a webhook URL before testing.')
      return
    }
    if (!urlValid) {
      toast.error('That doesn’t look like a Discord webhook URL.')
      return
    }
    // Persist first so testDiscordWebhook reads the latest URL via its ref.
    setDiscordSettings({ ...draft, webhookUrl: draft.webhookUrl.trim() })
    setTesting(true)
    try {
      const result = await testDiscordWebhook()
      if (result.ok) {
        toast.success('Test message sent.', {
          description: 'Check the Discord channel — you should see a green “Webhook connected” embed.',
        })
      } else {
        toast.error('Test failed.', {
          description:
            (result.error ?? 'Unknown error.') +
            ' In production this typically routes through a backend proxy.',
        })
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <section aria-labelledby="discord-heading">
      <h2
        id="discord-heading"
        className="text-lg font-semibold text-[var(--text-primary)]"
      >
        Discord Integration
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Relay task events to a Discord channel so the team sees updates without
        opening the app.
      </p>

      <div className="mt-5 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
        <div>
          <label
            htmlFor="discord-webhook"
            className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            Webhook URL
          </label>
          <div className="mt-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="discord-webhook"
                type={reveal ? 'text' : 'password'}
                value={draft.webhookUrl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, webhookUrl: e.target.value }))
                }
                placeholder="https://discord.com/api/webhooks/…"
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'h-9 w-full rounded-md border bg-[var(--bg-input)] pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]',
                  urlValid
                    ? 'border-[var(--border-subtle)]'
                    : 'border-[var(--destructive)]',
                )}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide webhook URL' : 'Show webhook URL'}
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                {reveal ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !draft.webhookUrl.trim() || !urlValid}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test webhook'}
            </button>
          </div>
          {!urlValid && (
            <p className="mt-1 text-xs text-[var(--destructive)]" role="alert">
              Must start with <code>https://discord.com/api/webhooks/</code>.
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            The URL contains a secret token. In production, proxy these calls
            through your backend so it never lives in the browser — the send
            function in <code>src/services/discord.ts</code> is structured for
            a one-line endpoint swap.
          </p>
        </div>

        <div>
          <label
            htmlFor="discord-channel"
            className="block text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            Channel name (label only)
          </label>
          <input
            id="discord-channel"
            type="text"
            value={draft.channelName}
            onChange={(e) =>
              setDraft((p) => ({ ...p, channelName: e.target.value }))
            }
            placeholder="#team-updates"
            maxLength={80}
            className="mt-1 h-9 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Just a reminder of where this webhook posts — Discord ignores it.
          </p>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
            Events to relay
          </h3>
          <ul className="mt-2 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)]">
            {EVENTS.map((opt) => (
              <li
                key={opt.key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {opt.description}
                  </p>
                </div>
                <Toggle
                  checked={draft.events[opt.key]}
                  onChange={() => handleToggle(opt.key)}
                  ariaLabel={opt.label}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:justify-between sm:gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty || !urlValid}
            className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
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

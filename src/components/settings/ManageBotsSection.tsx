/**
 * Settings → ZoomBot → Manage Bots.
 *
 * PM-only inline editor for the bot roster. Each row shows the bot's
 * current name + target (click to edit), a status pill, the shared
 * BotActionButton (Deploy / Stop / Retry), and a Delete button.
 * Below the list is an "Add bot" form that expands inline.
 *
 * Every write goes through the existing API service. After success we
 * call `pollState()` so Settings reflects the change even if no
 * WebSocket is open at the moment (typical when no meeting is live).
 */

import { useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useZoomBot } from '@/hooks/useZoomBot'
import { BotActionButton } from '@/components/zoombot/BotControls'
import {
  createBot as createBotApi,
  deleteBot as deleteBotApi,
  updateBot as updateBotApi,
} from '@/services/zoombot-api'
import type { ZoomBot } from '@/services/zoombot-types'
import { cn } from '@/lib/utils'

const STATUS_PILL: Record<ZoomBot['status'], string> = {
  configured: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
  idle: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
  joining:
    'bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] text-[var(--accent-primary)]',
  active:
    'bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] text-[var(--status-done)]',
  stopping:
    'bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] text-[var(--priority-medium)]',
  stopped: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
  error:
    'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]',
}

export function ManageBotsSection() {
  const { botState, pollState } = useZoomBot()
  const bots = botState?.bots ?? []

  return (
    <section className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Manage bots
      </h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Configure which Zoom participants each bot follows. Names and
        targets are editable inline.
      </p>

      {bots.length === 0 ? (
        <p className="mt-4 text-xs italic text-[var(--text-muted)]">
          No bots configured yet — add one below.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {bots.map((b) => (
            <BotRow key={b.id} bot={b} onAfterMutate={() => void pollState()} />
          ))}
        </ul>
      )}

      <AddBotForm onAfterCreate={() => void pollState()} />
    </section>
  )
}

// ── Bot row with inline editing ────────────────────────────────────────

function BotRow({
  bot,
  onAfterMutate,
}: {
  bot: ZoomBot
  onAfterMutate: () => void
}) {
  const [editing, setEditing] = useState<boolean>(false)
  const [nameDraft, setNameDraft] = useState<string>(bot.name)
  const [targetDraft, setTargetDraft] = useState<string>(bot.target)
  const [saving, setSaving] = useState<boolean>(false)
  const [deleting, setDeleting] = useState<boolean>(false)

  const beginEdit = () => {
    setNameDraft(bot.name)
    setTargetDraft(bot.target)
    setEditing(true)
  }
  const cancelEdit = () => {
    setEditing(false)
    setNameDraft(bot.name)
    setTargetDraft(bot.target)
  }
  const saveEdit = async () => {
    const name = nameDraft.trim()
    const target = targetDraft.trim()
    if (!name || !target) {
      toast.error('Bot name and target are both required.')
      return
    }
    if (name === bot.name && target === bot.target) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await updateBotApi(bot.id, name, target)
      onAfterMutate()
      setEditing(false)
      toast.success(`Updated ${name}.`)
    } catch (err) {
      toast.error(
        `Could not update ${bot.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  const askDelete = () => {
    toast(`Remove bot ${bot.name}? This cannot be undone.`, {
      action: {
        label: 'Delete',
        onClick: () => void runDelete(),
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {
          /* sonner requires the cb shape */
        },
      },
      duration: 8000,
    })
  }
  const runDelete = async () => {
    setDeleting(true)
    try {
      await deleteBotApi(bot.id)
      onAfterMutate()
      toast.success(`Removed ${bot.name}.`)
    } catch (err) {
      toast.error(
        `Could not delete ${bot.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <li className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] md:flex-1">
              <span className="shrink-0">Name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={saving}
                spellCheck={false}
                autoComplete="off"
                className="h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] md:flex-1">
              <span className="shrink-0">Target</span>
              <input
                type="text"
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                disabled={saving}
                spellCheck={false}
                autoComplete="off"
                className="h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
              />
            </label>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {bot.name}
            </p>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              → {bot.target}
            </p>
          </div>
        )}
        <span
          className={cn(
            'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-[0.5px]',
            STATUS_PILL[bot.status],
          )}
        >
          {bot.status}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                aria-label="Save"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                aria-label="Cancel"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <BotActionButton bot={bot} canControl={true} />
              <button
                type="button"
                onClick={beginEdit}
                aria-label={`Edit bot ${bot.name}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={askDelete}
                disabled={deleting}
                aria-label={`Delete bot ${bot.name}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent text-[var(--priority-critical)] hover:bg-[color-mix(in_srgb,var(--priority-critical)_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

// ── Add bot form ───────────────────────────────────────────────────────

function AddBotForm({ onAfterCreate }: { onAfterCreate: () => void }) {
  const [open, setOpen] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [target, setTarget] = useState<string>('')
  const [pending, setPending] = useState<boolean>(false)

  const reset = () => {
    setName('')
    setTarget('')
    setOpen(false)
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmedName = name.trim()
    const trimmedTarget = target.trim()
    if (!trimmedName || !trimmedTarget) {
      toast.error('Bot name and target are both required.')
      return
    }
    setPending(true)
    try {
      await createBotApi(trimmedName, trimmedTarget)
      onAfterCreate()
      toast.success(`Added bot ${trimmedName}.`)
      reset()
    } catch (err) {
      toast.error(
        `Could not create bot: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add bot
        </button>
      </div>
    )
  }
  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 p-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        Add bot
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] md:flex-1">
          <span className="shrink-0">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="DigitalBrian"
            spellCheck={false}
            autoComplete="off"
            disabled={pending}
            className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] md:flex-1">
          <span className="shrink-0">Target</span>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Brian P"
            spellCheck={false}
            autoComplete="off"
            disabled={pending}
            className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-transparent px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          )}
          Add
        </button>
      </div>
    </form>
  )
}

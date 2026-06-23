/**
 * Shared bot-control affordances rendered on the live meeting page,
 * the live banner, and the Settings → Manage Bots list.
 *
 * Two exports:
 *   - `BotActionButton` — per-bot Deploy / Stop / Retry button whose
 *     appearance switches based on the bot's status.
 *   - `StopAllButton` — bulk "stop everything" with toast-based
 *     confirmation. Visible only when at least one bot is active.
 *
 * Both are PM-gated at the call site (the spec wants Members to see
 * status without action buttons), so this file doesn't gate again —
 * callers pass `canControl` and the components no-op when it's false.
 */

import { useState } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/data/auth'
import { useZoomBot } from '@/hooks/useZoomBot'
import {
  buildZoomBotBotDeployedManualEmbed,
  buildZoomBotBotStoppedManualEmbed,
} from '@/services/discord'
import {
  deployBot as deployBotApi,
  stopAllBots as stopAllBotsApi,
  stopBot as stopBotApi,
} from '@/services/zoombot-api'
import type { ZoomBot } from '@/services/zoombot-types'
import { cn } from '@/lib/utils'

interface BotActionButtonProps {
  bot: ZoomBot
  /** PM-only — Members get no action buttons. When false, the button
   *  doesn't render at all. */
  canControl: boolean
  /** Optional className for layout overrides at the call site. */
  className?: string
}

export function BotActionButton({
  bot,
  canControl,
  className,
}: BotActionButtonProps) {
  const { currentUser } = useAuth()
  const { pollState, fireDiscord } = useZoomBot()
  const [pending, setPending] = useState<boolean>(false)

  if (!canControl) return null

  // The 'stopping' state is the server's transient — the user can't
  // intervene, just show a disabled spinner so the UI doesn't lie.
  if (bot.status === 'stopping') {
    return (
      <button
        type="button"
        disabled
        className={cn(BASE_CLASS, TONES.stopping, className)}
        aria-label={`${bot.name} is stopping`}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Stopping…
      </button>
    )
  }

  const isActive = bot.status === 'active' || bot.status === 'joining'
  const isError = bot.status === 'error'
  // 'configured' | 'idle' | 'stopped' | 'error' → Deploy / Retry
  const action: 'deploy' | 'stop' = isActive ? 'stop' : 'deploy'
  const label = isError ? 'Retry' : isActive ? 'Stop' : 'Deploy'
  const Icon = isActive ? Square : Play
  const tone = isActive ? TONES.stop : isError ? TONES.retry : TONES.deploy

  const handleClick = async () => {
    if (pending) return
    setPending(true)
    try {
      if (action === 'stop') {
        await stopBotApi(bot.id)
      } else {
        await deployBotApi(bot.id)
      }
      // The WebSocket pushes botStatus / deployed events that refresh
      // state automatically. But Settings → Manage Bots may be open
      // while the WS is closed (no active meeting yet) — one explicit
      // poll gives the UI immediate feedback.
      void pollState()
      // Audit Discord. Gated internally by user settings.
      if (action === 'deploy') {
        fireDiscord('zoombot_bot_deployed_manual', () =>
          buildZoomBotBotDeployedManualEmbed({
            botName: bot.name,
            botTarget: bot.target,
            actorName: currentUser?.name ?? 'unknown',
          }),
        )
      } else {
        fireDiscord('zoombot_bot_stopped_manual', () =>
          buildZoomBotBotStoppedManualEmbed({
            botName: bot.name,
            botTarget: bot.target,
            actorName: currentUser?.name ?? 'unknown',
          }),
        )
      }
    } catch (err) {
      toast.error(
        `Failed to ${action === 'stop' ? 'stop' : 'deploy'} ${bot.name}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`${label} bot ${bot.name}`}
      className={cn(BASE_CLASS, tone, className)}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-3 w-3" aria-hidden="true" />
      )}
      {label}
    </button>
  )
}

// ── Stop All ───────────────────────────────────────────────────────────

interface StopAllButtonProps {
  canControl: boolean
  hasActive: boolean
  /** Visual variant — 'primary' fills the button, 'ghost' is the
   *  smaller transparent style used in the global banner. */
  variant?: 'primary' | 'ghost'
  className?: string
}

/**
 * Bulk-stop button. Spec asks for two distinct surfaces:
 *   - Live meeting page: full-size red button under the bot list.
 *   - Banner: small ghost button next to "View Live".
 *
 * Both share the same confirmation flow via a sonner toast with action
 * buttons — keeps the confirm UX consistent across surfaces without
 * dragging in a full ConfirmModal.
 */
export function StopAllButton({
  canControl,
  hasActive,
  variant = 'primary',
  className,
}: StopAllButtonProps) {
  const { currentUser } = useAuth()
  const { pollState, fireDiscord, activeBots } = useZoomBot()
  const [pending, setPending] = useState<boolean>(false)

  if (!canControl || !hasActive) return null

  const runStopAll = async () => {
    setPending(true)
    try {
      // Snapshot the active bots BEFORE the call so we can audit each
      // one — the WS will have flipped them to 'stopped' by the time
      // we'd want to look them up later.
      const snapshot = [...activeBots]
      await stopAllBotsApi()
      void pollState()
      // Audit each bot individually. Conservative: only fire on bots
      // that were active in the snapshot — bots in error / stopped
      // states wouldn't have been stopped by this action.
      for (const b of snapshot) {
        fireDiscord('zoombot_bot_stopped_manual', () =>
          buildZoomBotBotStoppedManualEmbed({
            botName: b.name,
            botTarget: b.target,
            actorName: currentUser?.name ?? 'unknown',
          }),
        )
      }
      toast.success('All bots stopped.')
    } catch (err) {
      toast.error(
        `Failed to stop all bots: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setPending(false)
    }
  }

  const askConfirm = () => {
    toast('Stop all bots? This will end recording for all participants.', {
      action: {
        label: 'Stop all',
        onClick: () => void runStopAll(),
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {
          // sonner requires the callback shape; nothing else to do.
        },
      },
      duration: 8000,
    })
  }

  const styles =
    variant === 'primary'
      ? 'h-9 rounded-md bg-[var(--priority-critical)] px-4 text-sm font-medium text-white hover:opacity-90'
      : 'h-7 rounded-md bg-transparent px-2.5 text-[11px] font-medium text-[var(--priority-critical)] hover:bg-[color-mix(in_srgb,var(--priority-critical)_12%,transparent)]'

  return (
    <button
      type="button"
      onClick={askConfirm}
      disabled={pending}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50',
        styles,
        className,
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Square className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Stop all
    </button>
  )
}

// ── Shared button styling ──────────────────────────────────────────────

const BASE_CLASS =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50'

const TONES = {
  deploy:
    'bg-[color-mix(in_srgb,var(--status-done)_15%,transparent)] text-[var(--status-done)] hover:bg-[color-mix(in_srgb,var(--status-done)_22%,transparent)]',
  stop: 'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)] hover:bg-[color-mix(in_srgb,var(--priority-critical)_22%,transparent)]',
  retry:
    'bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] text-[var(--priority-medium)] hover:bg-[color-mix(in_srgb,var(--priority-medium)_22%,transparent)]',
  stopping: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
}

import { useNavigate } from 'react-router-dom'
import { useZoomBot } from '@/hooks/useZoomBot'
import { isZoomBotConfigured } from '@/services/zoombot-config'
import { cn } from '@/lib/utils'

/**
 * Slim red-tinted bar at the very top of the app while a ZoomBot
 * meeting is active. The banner stays mounted at all times so its
 * slide-in / slide-out animation runs in both directions — when
 * `visible` flips, we toggle a `translate-y` class and Tailwind's
 * `transition-transform` handles the rest.
 *
 * Layout integration: this component is rendered inside `Layout`. The
 * parent sets `--banner-h` on its root div (`'44px'` when active,
 * `'0px'` otherwise); TopBar / Sidebar / main all read that variable
 * so they push down in sync with the banner's slide.
 */
export function LiveMeetingBanner() {
  const navigate = useNavigate()
  const { hasActiveMeeting, botState, activeBots, captions } = useZoomBot()
  const visible = hasActiveMeeting && isZoomBotConfigured()

  // Latest caption (the tail of the rolling buffer). The provider's
  // dedup keeps the most recent in-progress utterance at the end, so
  // this updates in real-time as the speaker keeps talking.
  const latest = captions.length > 0 ? captions[captions.length - 1] : null

  const sessionShort = botState?.sessionId
    ? botState.sessionId.slice(0, 8)
    : ''

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-11 transition-transform duration-200 ease-out',
        visible ? 'translate-y-0' : '-translate-y-full',
        'border-b border-[var(--border-subtle)]',
        // Red gradient → surface so the banner reads as "live" without
        // looking like a destructive error state.
        'bg-gradient-to-r from-[color-mix(in_srgb,var(--priority-critical)_18%,var(--bg-surface))] via-[color-mix(in_srgb,var(--priority-critical)_8%,var(--bg-surface))] to-[var(--bg-surface)]',
        // The whole bar shouldn't intercept clicks when invisible.
        !visible && 'pointer-events-none',
      )}
    >
      <div className="flex h-full items-center gap-3 px-4 md:gap-4 md:px-6">
        {/* Left: pulsing dot + LIVE + session id */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span
              aria-hidden="true"
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--priority-critical)] opacity-75"
            />
            <span
              aria-hidden="true"
              className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--priority-critical)]"
            />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[var(--priority-critical)]">
            Live
          </span>
          {sessionShort && (
            <span
              className="hidden font-mono text-[11px] text-[var(--text-muted)] md:inline"
              title={botState?.sessionId ?? ''}
            >
              #{sessionShort}
            </span>
          )}
        </div>

        {/* Center: latest caption (mobile: hidden) */}
        <div className="hidden min-w-0 flex-1 items-center md:flex">
          {latest ? (
            <p className="truncate text-sm text-[var(--text-primary)]">
              <span className="font-medium">{latest.speaker}:</span>{' '}
              <span className="text-[var(--text-secondary)]">{latest.text}</span>
            </p>
          ) : (
            <p className="truncate text-sm italic text-[var(--text-muted)]">
              Listening for captions…
            </p>
          )}
        </div>

        {/* Right: count + button */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] text-[var(--text-secondary)] tabular-nums md:inline">
            {activeBots.length} bot{activeBots.length === 1 ? '' : 's'} active
          </span>
          <button
            type="button"
            onClick={() => navigate('/meetings/live')}
            disabled={!visible}
            className="inline-flex h-7 items-center justify-center rounded-md bg-[var(--accent-primary)] px-3 text-[11px] font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="hidden md:inline">View Live</span>
            <span className="md:hidden">View</span>
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChevronRight, Sparkles, X } from 'lucide-react'
import { useAuth } from '@/data/auth'
import {
  finalLabelForRole,
  hasSeenOnboarding,
  markOnboardingSeen,
  REPLAY_EVENT,
  stepsForRole,
  type OnboardingStep,
} from '@/lib/onboarding'
import { cn } from '@/lib/utils'

/**
 * Bottom-left floating tour card. Non-blocking (the rest of the app
 * stays interactive). Each step optionally highlights a target element
 * via a `.tour-highlight` class added on the fly.
 */
export function OnboardingTour() {
  const { currentUser } = useAuth()
  const [stepIdx, setStepIdx] = useState(0)
  const [visible, setVisible] = useState(false)

  // Decide whether to show the tour on user change.
  useEffect(() => {
    if (!currentUser) {
      setVisible(false)
      return
    }
    if (!hasSeenOnboarding(currentUser.id)) {
      setStepIdx(0)
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [currentUser])

  // Listen for the Settings "Replay" event — clears the flag and asks us
  // to re-arm immediately, without forcing the user to refresh.
  useEffect(() => {
    const onReplay = () => {
      setStepIdx(0)
      setVisible(true)
    }
    window.addEventListener(REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(REPLAY_EVENT, onReplay)
  }, [])

  const steps: OnboardingStep[] = currentUser
    ? stepsForRole(currentUser.role)
    : []
  const step: OnboardingStep | undefined = visible ? steps[stepIdx] : undefined

  // Add the pulse highlight class to the active step's target. Scrolls
  // the target into view so the user sees what we're pointing at. If the
  // target isn't in the DOM yet (e.g. the page is still in its initial
  // skeleton state), retry once after the 500ms skeleton gate clears.
  useEffect(() => {
    if (!step?.targetSelector) return
    const selector = step.targetSelector
    let highlighted: Element | null = document.querySelector(selector)
    let timer: number | null = null

    const apply = (el: Element) => {
      el.classList.add('tour-highlight')
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    if (highlighted) {
      apply(highlighted)
    } else {
      timer = window.setTimeout(() => {
        highlighted = document.querySelector(selector)
        if (highlighted) apply(highlighted)
      }, 600)
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      if (highlighted) highlighted.classList.remove('tour-highlight')
    }
  }, [step])

  if (!visible || !currentUser || !step) return null

  const isLast = stepIdx === steps.length - 1
  const finalLabel = finalLabelForRole(currentUser.role)

  const dismiss = () => {
    setVisible(false)
    markOnboardingSeen(currentUser.id)
  }

  const next = () => {
    if (isLast) {
      dismiss()
      return
    }
    setStepIdx((i) => i + 1)
  }

  return (
    <div
      role="dialog"
      aria-label="Onboarding tour"
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-40 flex justify-start sm:right-auto sm:max-w-[360px]"
    >
      <div
        className={cn(
          'pointer-events-auto w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
          'animate-[modalIn_200ms_ease-out]',
        )}
      >
        <header className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-start gap-2">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
              aria-hidden="true"
            />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
                Welcome to Team Manager · Step {stepIdx + 1} of {steps.length}
              </p>
              <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip tour"
            className="shrink-0 rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <p className="px-4 py-3 text-sm leading-snug text-[var(--text-secondary)]">
          {step.body}
        </p>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
          <ProgressDots count={steps.length} active={stepIdx} />
          <button
            type="button"
            onClick={next}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--accent-primary)] px-3 text-xs font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            {isLast ? finalLabel : 'Next'}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </footer>
      </div>
    </div>
  )
}

function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors',
            i === active
              ? 'bg-[var(--accent-primary)]'
              : 'bg-[var(--border-default)]',
          )}
        />
      ))}
    </div>
  )
}

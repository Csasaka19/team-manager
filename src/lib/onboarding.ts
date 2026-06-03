/**
 * First-run onboarding tour state. The "have I seen this?" flag is per
 * user (so a workspace with multiple accounts on the same browser shows
 * each their own first-login welcome). PMs and Members get different
 * step sets — each lands on their role's home page after login, so the
 * first step naturally lines up.
 */

import type { Role } from '@/data/types'

export interface OnboardingStep {
  id: string
  title: string
  body: string
  /** Optional CSS selector to highlight while this step is visible. */
  targetSelector?: string
}

const KEY_PREFIX = 'team-manager.onboarding.'

/** Event the tour listens for so the Settings "Replay" link can re-arm it. */
export const REPLAY_EVENT = 'team-manager:onboarding-replay'

export function hasSeenOnboarding(userId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(KEY_PREFIX + userId) === '1'
  } catch {
    return true
  }
}

export function markOnboardingSeen(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, '1')
  } catch {
    // ignore
  }
}

export function clearOnboardingSeen(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY_PREFIX + userId)
  } catch {
    // ignore
  }
  // Tell the live tour component to re-arm; it owns the visible state.
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT))
}

const PM_STEPS: OnboardingStep[] = [
  {
    id: 'dashboard',
    title: 'Your dashboard',
    body: "This is your dashboard. It shows what needs your attention at a glance.",
    targetSelector: '[data-tour="summary"]',
  },
  {
    id: 'sidebar',
    title: 'Get around',
    body: 'Navigate between Board, Tasks, Projects, and Team from here.',
    targetSelector: '[data-tour="sidebar"]',
  },
  {
    id: 'palette',
    title: 'Quick search & actions',
    body: 'Press Cmd+K (or Ctrl+K) anytime to search or take quick actions.',
  },
  {
    id: 'create',
    title: 'Create fast',
    body: 'Press C to quickly create a task from anywhere.',
  },
]

const MEMBER_STEPS: OnboardingStep[] = [
  {
    id: 'my-tasks',
    title: 'Your task list',
    body: 'This is your task list. Tasks due today are at the top.',
    targetSelector: '[data-tour="my-tasks-list"]',
  },
  {
    id: 'detail',
    title: 'Task details',
    body: 'Click any task to see details, subtasks, and leave comments.',
  },
  {
    id: 'palette',
    title: 'Quick search',
    body: 'Press Cmd+K (or Ctrl+K) to search across everything.',
  },
]

export function stepsForRole(role: Role): OnboardingStep[] {
  return role === 'pm' ? PM_STEPS : MEMBER_STEPS
}

/** Final-step label varies by role for a tiny bit of personality. */
export function finalLabelForRole(role: Role): string {
  return role === 'pm' ? 'Got it!' : "Let's go!"
}

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'team-manager.theme'

/** Resolve the theme to apply on first mount: stored choice → OS preference → dark default. */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

/** Mutate the document so the chosen palette takes effect. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('light', theme === 'light')
  root.classList.toggle('dark', theme === 'dark')
}

function persist(theme: Theme): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore (private mode, quota)
  }
}

export interface UseTheme {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

/** Subscribe a component to the current theme; updates persist + reapply. */
export function useTheme(): UseTheme {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  // Reapply on mount (the index.html pre-paint script may not have run in tests).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = (next: Theme) => {
    persist(next)
    applyTheme(next)
    setThemeState(next)
  }

  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === 'light' ? 'dark' : 'light'),
  }
}

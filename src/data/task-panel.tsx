import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

export interface TaskPanelContextValue {
  openTaskId: string | null
  openTask: (taskId: string) => void
  closeTask: () => void
  isOpen: boolean
}

const TaskPanelContext = createContext<TaskPanelContextValue | null>(null)

/**
 * Marker stored on `history.state` for entries we push from openTask.
 * popstate uses it to distinguish "browser back to the panel" from
 * any other navigation in the app.
 */
interface TaskPanelHistoryState {
  taskPanel: string
}

function isTaskPanelState(state: unknown): state is TaskPanelHistoryState {
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof (state as { taskPanel?: unknown }).taskPanel === 'string'
  )
}

/**
 * Holds the currently-open task panel id and the open/close API.
 *
 * URL behaviour:
 *   - openTask pushes (or replaces, if a panel is already open)
 *     `/tasks/:id` onto `window.history` with a `{taskPanel}` marker
 *     state. React Router does NOT observe pushState, so the
 *     underlying page stays mounted — the URL just updates for
 *     sharing/refresh affordances.
 *   - closeTask calls `history.back()` when the current entry is
 *     ours; otherwise it falls back to clearing state in-memory.
 *   - popstate listens for browser back/forward into or out of a
 *     panel entry and syncs the in-memory openTaskId.
 *
 * Layout-level concerns also wired here: escape-to-close, body
 * scroll lock, and "react-router navigated → close the panel" so
 * sidebar/breadcrumb clicks don't leave a stale panel hovering.
 */
export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const { pathname } = useLocation()

  const openTask = useCallback((taskId: string) => {
    if (typeof window === 'undefined') return
    setOpenTaskId((prev) => {
      const url = `/tasks/${encodeURIComponent(taskId)}`
      const state: TaskPanelHistoryState = { taskPanel: taskId }
      if (prev === null) {
        // First open from a normal page — push a new entry so back
        // closes the panel cleanly.
        window.history.pushState(state, '', url)
      } else if (prev !== taskId) {
        // Swap-in-place: keep the history depth flat so one Back
        // press always exits the panel regardless of how many
        // tasks the user surfed through.
        window.history.replaceState(state, '', url)
      }
      return taskId
    })
  }, [])

  const closeTask = useCallback(() => {
    if (typeof window === 'undefined') {
      setOpenTaskId(null)
      return
    }
    if (isTaskPanelState(window.history.state)) {
      // popstate will fire and clear openTaskId.
      window.history.back()
    } else {
      setOpenTaskId(null)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = (e: PopStateEvent) => {
      if (isTaskPanelState(e.state)) {
        // Forward/back landed on a panel entry — open that task.
        setOpenTaskId(e.state.taskPanel)
      } else {
        setOpenTaskId(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Close on any react-router navigation. pushState (ours) doesn't
  // change useLocation() so this fires only on real navigations.
  useEffect(() => {
    setOpenTaskId(null)
  }, [pathname])

  // Escape closes the panel. Inputs / contenteditable get to keep the
  // event (e.g., escape clears a search field) — same convention as
  // useKeyboardShortcuts.
  useEffect(() => {
    if (openTaskId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (t?.isContentEditable) return
      e.preventDefault()
      closeTask()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openTaskId, closeTask])

  // Lock body scroll while the panel is open so the underlying page
  // doesn't scroll behind the backdrop.
  useEffect(() => {
    if (openTaskId === null) return
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [openTaskId])

  const value: TaskPanelContextValue = {
    openTaskId,
    openTask,
    closeTask,
    isOpen: openTaskId !== null,
  }
  return (
    <TaskPanelContext.Provider value={value}>
      {children}
    </TaskPanelContext.Provider>
  )
}

export function useTaskPanel(): TaskPanelContextValue {
  const ctx = useContext(TaskPanelContext)
  if (!ctx) {
    throw new Error('useTaskPanel must be used inside <TaskPanelProvider>')
  }
  return ctx
}

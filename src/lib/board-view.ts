/**
 * The /board page can render as a kanban (default) or a flat sortable list.
 * The user's choice is persisted per browser; nothing here is account-scoped.
 */

export type BoardView = 'kanban' | 'list'

const STORAGE_KEY = 'team-manager.board-view'

export function loadBoardView(): BoardView {
  if (typeof window === 'undefined') return 'kanban'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'list' ? 'list' : 'kanban'
  } catch {
    return 'kanban'
  }
}

export function saveBoardView(view: BoardView): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // private mode / quota — ignore
  }
}

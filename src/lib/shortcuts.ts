/**
 * Display labels for keyboard shortcuts. Kept in one place so the command palette
 * and the help panel stay in sync.
 *
 * Single keys are rendered uppercased ("C"). Sequences are rendered space-separated
 * ("G D"). Modifier combos use a "+" ("Ctrl+K").
 */

export interface ShortcutLabel {
  /** Tokens rendered as separate <kbd>s. */
  keys: string[]
}

export const SHORTCUTS = {
  // Global
  palette: { keys: ['Ctrl', 'K'] },
  paletteSlash: { keys: ['/'] },
  createTask: { keys: ['C'] },
  help: { keys: ['?'] },
  goDashboard: { keys: ['G', 'D'] },
  goBoard: { keys: ['G', 'B'] },
  goMyTasks: { keys: ['G', 'M'] },
  goProjects: { keys: ['G', 'P'] },
  goTeam: { keys: ['G', 'T'] },
  // Board
  boardNavigate: { keys: ['←', '↑', '→', '↓'] },
  boardOpen: { keys: ['Enter'] },
  boardPriority: { keys: ['1', '2', '3', '4'] },
  // Task detail
  taskAssignee: { keys: ['A'] },
  taskPriority: { keys: ['P'] },
  taskStatus: { keys: ['S'] },
  taskDueDate: { keys: ['D'] },
  taskComment: { keys: ['M'] },
} as const satisfies Record<string, ShortcutLabel>

export type ShortcutKey = keyof typeof SHORTCUTS

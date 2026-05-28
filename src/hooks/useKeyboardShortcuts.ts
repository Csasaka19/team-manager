import { useEffect, useRef } from 'react'

export interface ShortcutBinding {
  /** A single key (`'c'`, `'/'`, `'Enter'`, `'ArrowDown'`) or any-of list. Matched against `e.key` lowercased. */
  key: string | string[]
  /** Required modifier state. `undefined` means "any" — but to keep things predictable we treat undefined as "must be false". */
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  /** When true, fire even when focus is in an editable element. Defaults to false. */
  allowInInput?: boolean
  /** When true, call preventDefault before the handler. Defaults to true. */
  preventDefault?: boolean
  handler: (e: KeyboardEvent) => void
}

function normalizeKey(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function modifiersMatch(e: KeyboardEvent, b: ShortcutBinding): boolean {
  return (
    Boolean(b.ctrl) === e.ctrlKey &&
    Boolean(b.meta) === e.metaKey &&
    Boolean(b.shift) === e.shiftKey &&
    Boolean(b.alt) === e.altKey
  )
}

/**
 * Register a list of keyboard shortcuts at the document level.
 * Bindings are matched in order; the first match wins and stops the chain.
 * Bindings are skipped while focus is in an input/textarea/select/contenteditable
 * unless `allowInInput: true` is set.
 */
export function useKeyboardShortcuts(
  bindings: ShortcutBinding[],
  enabled: boolean = true,
): void {
  // Keep latest bindings in a ref so we don't have to re-attach the listener every render.
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key)
      for (const b of ref.current) {
        const keys = Array.isArray(b.key) ? b.key.map(normalizeKey) : [normalizeKey(b.key)]
        if (!keys.includes(key)) continue
        if (!modifiersMatch(e, b)) continue
        if (!b.allowInInput && isEditable(e.target)) continue
        if (b.preventDefault !== false) e.preventDefault()
        b.handler(e)
        return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** Exposed for callers that need to gate their own onKeyDown handlers the same way. */
export const isEditableElement = isEditable

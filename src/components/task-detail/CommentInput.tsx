import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/data/types'

interface CommentInputProps {
  members: TeamMember[]
  currentUser: TeamMember | null
  onSubmit: (text: string, mentionIds: string[]) => Promise<void>
}

interface MentionState {
  open: boolean
  query: string
  /** Start index of the "@..." token currently being typed. */
  tokenStart: number
}

const CLOSED: MentionState = { open: false, query: '', tokenStart: -1 }

export function CommentInput({ members, currentUser, onSubmit }: CommentInputProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [mention, setMention] = useState<MentionState>(CLOSED)
  const [highlight, setHighlight] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredMembers = mention.open
    ? members.filter((m) =>
        m.name.toLowerCase().includes(mention.query.toLowerCase()),
      )
    : []

  useEffect(() => {
    setHighlight(0)
  }, [mention.query, mention.open])

  const detectMention = (value: string, caret: number) => {
    // Walk back from the caret to find the @ that anchors the current token.
    let i = caret - 1
    while (i >= 0) {
      const ch = value[i]
      if (ch === '@') {
        // Make sure it's not preceded by a word character (so emails like a@b don't trigger).
        const before = i > 0 ? value[i - 1] : ' '
        if (!before || /[\s\n([{,;:]/.test(before)) {
          setMention({
            open: true,
            query: value.slice(i + 1, caret),
            tokenStart: i,
          })
          return
        }
        setMention(CLOSED)
        return
      }
      if (ch === ' ' || ch === '\n') break
      i -= 1
    }
    setMention(CLOSED)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    detectMention(value, e.target.selectionStart ?? value.length)
  }

  const selectMention = (member: TeamMember) => {
    if (mention.tokenStart < 0) return
    const before = text.slice(0, mention.tokenStart)
    const afterQuery = text.slice(mention.tokenStart + 1 + mention.query.length)
    // Replace token with a single-token @FirstLast (no spaces) so we can re-detect on submit.
    const inserted = `@${member.name.replace(/\s+/g, '')}`
    const next = `${before}${inserted} ${afterQuery.trimStart() === afterQuery ? afterQuery : afterQuery}`
    setText(next)
    setMention(CLOSED)
    queueMicrotask(() => {
      const pos = before.length + inserted.length + 1
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }

  const resolveMentionIds = (value: string): string[] => {
    const ids = new Set<string>()
    const re = /@([A-Za-z][A-Za-z0-9_-]*)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(value)) !== null) {
      const handle = match[1]?.toLowerCase()
      if (!handle) continue
      const member = members.find(
        (m) => m.name.replace(/\s+/g, '').toLowerCase() === handle,
      )
      if (member) ids.add(member.id)
    }
    return Array.from(ids)
  }

  const submit = async () => {
    const value = text.trim()
    if (!value || busy) return
    const mentions = resolveMentionIds(value)
    setBusy(true)
    try {
      await onSubmit(value, mentions)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.open && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % filteredMembers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + filteredMembers.length) % filteredMembers.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const choice = filteredMembers[highlight]
        if (choice) {
          e.preventDefault()
          selectMention(choice)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(CLOSED)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="relative flex items-start gap-2"
    >
      {currentUser && <Avatar name={currentUser.name} size="sm" />}
      <div className="relative min-w-0 flex-1">
        <textarea
          id="task-comment-input"
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so a click on the mention list still selects.
            window.setTimeout(() => setMention(CLOSED), 100)
          }}
          rows={2}
          placeholder="Write a comment… (use @ to mention)"
          className="block w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-focus)]"
        />

        {mention.open && filteredMembers.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full max-w-xs overflow-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {filteredMembers.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectMention(m)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                    i === highlight
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]',
                  )}
                >
                  <Avatar name={m.name} size="xs" />
                  <span className="flex-1 truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={busy || text.trim() === ''}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Comment
          </button>
        </div>
      </div>
    </form>
  )
}

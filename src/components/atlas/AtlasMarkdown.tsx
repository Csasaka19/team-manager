/**
 * Minimal safe markdown renderer for Atlas-supplied content.
 *
 * The Atlas API returns multi-paragraph markdown bodies (summaries, task
 * descriptions). We render them with a tokenizer + React nodes — no
 * `dangerouslySetInnerHTML`, no third-party deps. Supported:
 *
 *   - # / ## / ### / #### / ##### / ###### headings
 *   - paragraphs (blank-line separated)
 *   - unordered bullets (`- ` / `* `)
 *   - ordered bullets (`1. `)
 *   - fenced code blocks (```lang)
 *   - inline `code`, **bold**, *italic*, ~~strike~~
 *   - links: [label](url) — only http/https/mailto pass through
 *
 * Anything not recognised falls through as plain text.
 */

import type { JSX } from 'react'

interface AtlasMarkdownProps {
  content: string
  /** Extra Tailwind classes on the wrapper. */
  className?: string
}

const SAFE_URL = /^(https?:|mailto:)/i

export function AtlasMarkdown({ content, className }: AtlasMarkdownProps) {
  const blocks = parseBlocks(content)
  return (
    <div
      className={cn(
        'space-y-3 text-[14px] leading-relaxed text-[var(--text-primary)] break-words',
        className,
      )}
    >
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  )
}

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

// ── Block-level ──────────────────────────────────────────────────────────

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; lang?: string; body: string }
  | { kind: 'hr' }

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i] ?? ''
    const line = raw.trimEnd()

    if (line.trim() === '') {
      i += 1
      continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || undefined
      const body: string[] = []
      i += 1
      while (i < lines.length) {
        const next = lines[i] ?? ''
        if (next.startsWith('```')) {
          i += 1
          break
        }
        body.push(next)
        i += 1
      }
      const block: Block = { kind: 'code', body: body.join('\n') }
      if (lang !== undefined) block.lang = lang
      blocks.push(block)
      continue
    }

    // Horizontal rule
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line.trim())) {
      blocks.push({ kind: 'hr' })
      i += 1
      continue
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading && heading[1] && heading[2] !== undefined) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim(),
      })
      i += 1
      continue
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const next = lines[i] ?? ''
        const m = /^[-*]\s+(.*)$/.exec(next.trim())
        if (!m || m[1] === undefined) break
        items.push(m[1])
        i += 1
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const next = lines[i] ?? ''
        const m = /^\d+\.\s+(.*)$/.exec(next.trim())
        if (!m || m[1] === undefined) break
        items.push(m[1])
        i += 1
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    // Paragraph — gather contiguous non-empty lines.
    const para: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = (lines[i] ?? '').trimEnd()
      if (next.trim() === '') break
      if (/^(#{1,6})\s/.test(next)) break
      if (/^[-*]\s/.test(next)) break
      if (/^\d+\.\s/.test(next)) break
      if (next.startsWith('```')) break
      para.push(next)
      i += 1
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') })
  }

  return blocks
}

function renderBlock(block: Block, key: number): JSX.Element {
  switch (block.kind) {
    case 'heading': {
      const sizes: Record<number, string> = {
        1: 'text-xl font-semibold mt-1',
        2: 'text-lg font-semibold mt-1',
        3: 'text-base font-semibold',
        4: 'text-sm font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]',
        5: 'text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]',
        6: 'text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]',
      }
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements
      return (
        <Tag key={key} className={sizes[block.level] ?? 'text-base font-semibold'}>
          {renderInline(block.text)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={key} className="leading-relaxed">
          {renderInline(block.text)}
        </p>
      )
    case 'ul':
      return (
        <ul key={key} className="ml-5 list-disc space-y-1">
          {block.items.map((item, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="ml-5 list-decimal space-y-1">
          {block.items.map((item, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      )
    case 'code':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[12px] leading-snug"
        >
          <code className="font-mono text-[var(--text-primary)]">{block.body}</code>
        </pre>
      )
    case 'hr':
      return (
        <hr
          key={key}
          className="border-0 border-t border-[var(--border-subtle)]"
        />
      )
  }
}

// ── Inline ───────────────────────────────────────────────────────────────

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strike'; value: string }
  | { kind: 'link'; label: string; href: string }

const INLINE_RE =
  /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|\[([^\]]+)\]\(([^)\s]+)\)/g

function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let lastIndex = 0
  for (const match of input.matchAll(INLINE_RE)) {
    const idx = match.index ?? 0
    if (idx > lastIndex) {
      tokens.push({ kind: 'text', value: input.slice(lastIndex, idx) })
    }
    if (match[1] !== undefined) tokens.push({ kind: 'code', value: match[1] })
    else if (match[2] !== undefined) tokens.push({ kind: 'bold', value: match[2] })
    else if (match[3] !== undefined) tokens.push({ kind: 'italic', value: match[3] })
    else if (match[4] !== undefined) tokens.push({ kind: 'strike', value: match[4] })
    else if (match[5] !== undefined && match[6] !== undefined) {
      tokens.push({ kind: 'link', label: match[5], href: match[6] })
    }
    lastIndex = idx + match[0].length
  }
  if (lastIndex < input.length) {
    tokens.push({ kind: 'text', value: input.slice(lastIndex) })
  }
  return tokens
}

function renderInline(text: string): JSX.Element[] {
  return tokenizeInline(text).map((token, i) => {
    switch (token.kind) {
      case 'text':
        return <span key={i}>{token.value}</span>
      case 'code':
        return (
          <code
            key={i}
            className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]"
          >
            {token.value}
          </code>
        )
      case 'bold':
        return (
          <strong key={i} className="font-semibold text-[var(--text-primary)]">
            {token.value}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} className="italic">
            {token.value}
          </em>
        )
      case 'strike':
        return (
          <s key={i} className="opacity-70">
            {token.value}
          </s>
        )
      case 'link':
        if (!SAFE_URL.test(token.href)) {
          return <span key={i}>{token.label}</span>
        }
        return (
          <a
            key={i}
            href={token.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--accent-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            {token.label}
          </a>
        )
    }
  })
}

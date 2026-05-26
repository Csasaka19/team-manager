import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AttentionItem =
  | {
      kind: 'overdue'
      key: string
      taskId: string
      title: string
      project: string
      days: number
      assignee: string | null
    }
  | {
      kind: 'unassigned'
      key: string
      taskId: string
      title: string
      project: string
    }
  | {
      kind: 'stale'
      key: string
      taskId: string
      title: string
      status: string
      days: number
    }
  | {
      kind: 'question'
      key: string
      taskId: string
      title: string
      commenter: string
      preview: string
    }

interface NeedsAttentionProps {
  items: AttentionItem[]
}

const VARIANT_BORDER: Record<AttentionItem['kind'], string> = {
  overdue: 'border-l-[var(--priority-critical)]',
  unassigned: 'border-l-[var(--priority-high)]',
  stale: 'border-l-[var(--text-muted)]',
  question: 'border-l-[var(--accent-primary)]',
}

const VARIANT_LABEL: Record<AttentionItem['kind'], string> = {
  overdue: 'Overdue',
  unassigned: 'Unassigned',
  stale: 'Stale',
  question: 'Question',
}

export function NeedsAttention({ items }: NeedsAttentionProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-10 text-center">
        <CheckCircle2
          className="h-10 w-10 text-[var(--status-done)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
          Nothing needs your attention. Nice work.
        </p>
      </div>
    )
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {items.map((item, idx) => (
        <li
          key={item.key}
          className={cn(
            idx !== items.length - 1 && 'border-b border-[var(--border-subtle)]',
          )}
        >
          <Link
            to={`/tasks/${item.taskId}`}
            className={cn(
              'group flex items-start gap-3 border-l-[3px] px-3 py-3 transition-colors hover:bg-[var(--bg-elevated)] md:px-4',
              VARIANT_BORDER[item.kind],
            )}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)] pt-1 w-16 shrink-0 hidden sm:inline">
              {VARIANT_LABEL[item.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <ItemContent item={item} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ItemContent({ item }: { item: AttentionItem }) {
  switch (item.kind) {
    case 'overdue':
      return (
        <>
          <p className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--text-primary)]">
            <span>{item.title}</span>
            <span className="text-[var(--text-secondary)]"> in {item.project}</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--priority-critical)]">
              {item.days} {item.days === 1 ? 'day' : 'days'} overdue
            </span>
            {' · '}
            assigned to {item.assignee ?? 'Unassigned'}
          </p>
        </>
      )
    case 'unassigned':
      return (
        <>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            <span>{item.title}</span>
            <span className="text-[var(--text-secondary)]"> in {item.project}</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--priority-high)]">unassigned</p>
        </>
      )
    case 'stale':
      return (
        <>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {item.title}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            stuck in {item.status} for {item.days} {item.days === 1 ? 'day' : 'days'}
          </p>
        </>
      )
    case 'question':
      return (
        <>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            <span>{item.commenter}</span>
            <span className="text-[var(--text-secondary)]"> asked on </span>
            <span>{item.title}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
            {item.preview}
          </p>
        </>
      )
  }
}

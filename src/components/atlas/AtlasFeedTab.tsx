import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAtlas } from '@/hooks/useAtlas'
import { fetchAtlasFeed } from '@/services/atlas/client'
import type { AtlasFeedItem, AtlasProject } from '@/services/atlas/types'
import { cn } from '@/lib/utils'
import { formatMeetingDate } from '@/lib/date-utils'
import { SkeletonLine } from '@/components/shared/Skeleton'
import { AtlasErrorState } from './AtlasErrorState'

const PREVIEW_MAX_CHARS = 150
const VISIBLE_TAGS = 3

/** Cheap markdown strip for the preview text. Pulls heading hashes,
 *  bold markers, list bullets, and inline backtick fences off the
 *  raw vault content so the card preview reads as prose rather than
 *  source. NOT a real markdown parser — we just want the first 150
 *  chars to look human. */
function stripMarkdown(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const LIMIT_OPTIONS = [20, 50, 100, 200] as const
type LimitOption = (typeof LIMIT_OPTIONS)[number]

interface AtlasFeedTabProps {
  /** Cached project list — passed in so the Atlas page only fetches projects
   *  once and shares the result across tabs. */
  projects: AtlasProject[] | null
}

export function AtlasFeedTab({ projects }: AtlasFeedTabProps) {
  const [limit, setLimit] = useState<LimitOption>(20)
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const loader = useCallback(
    (signal: AbortSignal) => fetchAtlasFeed(limit, { signal }),
    [limit],
  )
  const { data, error, loading, reload } = useAtlas(loader, [limit])

  const projectBySlug = useMemo(
    () => new Map((projects ?? []).map((p) => [p.slug, p])),
    [projects],
  )

  const visible = useMemo(() => {
    if (!data) return []
    if (projectFilter === 'all') return data
    return data.filter((item) => item.project === projectFilter)
  }, [data, projectFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="atlas-feed-limit"
            className="text-xs text-[var(--text-secondary)]"
          >
            Show
          </label>
          <select
            id="atlas-feed-limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as LimitOption)}
            className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} most recent
              </option>
            ))}
          </select>
        </div>

        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="atlas-feed-project"
              className="text-xs text-[var(--text-secondary)]"
            >
              Project
            </label>
            <select
              id="atlas-feed-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-8 min-w-[160px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="ml-auto text-xs text-[var(--text-muted)] tabular-nums">
          {loading
            ? 'Loading…'
            : data
              ? `${visible.length} of ${data.length} item${data.length === 1 ? '' : 's'}`
              : ''}
        </p>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : error ? (
        <AtlasErrorState error={error} onRetry={reload} />
      ) : visible.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item, idx) => (
            <li key={`${item.source_slug}-${idx}`}>
              <FeedRow item={item} project={projectBySlug.get(item.project)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface FeedRowProps {
  item: AtlasFeedItem
  project: AtlasProject | undefined
}

function FeedRow({ item, project }: FeedRowProps) {
  const title = extractTitle(item.content)
  // Strip the first heading first so we don't double-render it in the
  // preview alongside the title, then run the wider markdown strip
  // across the remainder.
  const preview = stripMarkdown(stripFirstHeading(item.content)).slice(
    0,
    PREVIEW_MAX_CHARS,
  )
  const isSummary = item.type === 'summary'

  // Summaries link to the daily summary detail page; other feed item types
  // are surfaced as read-only cards (we don't have a per-source-slug detail
  // endpoint in the current API).
  const href = isSummary
    ? `/atlas/summaries/${encodeURIComponent(item.project)}/${encodeURIComponent(item.date)}`
    : null

  const tagsToShow = item.tags.slice(0, VISIBLE_TAGS)
  const overflowTagCount = Math.max(0, item.tags.length - tagsToShow.length)

  const body = (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors md:p-4',
        // Hover bg applies whether or not the card is linkable — gives
        // the cursor consistent feedback while scanning the feed.
        'hover:border-[var(--border-default)] hover:bg-[color-mix(in_srgb,var(--bg-elevated)_30%,transparent)]',
      )}
    >
      {/* Row 1 — project dot + name (left), type badge (right). */}
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-primary)]"
          />
          {project ? project.name : item.project}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-[var(--accent-primary)]"
          title={`Feed item type: ${item.type}`}
        >
          {item.type}
        </span>
      </div>

      {/* Row 2 — date as its own line, muted. */}
      <p className="text-xs text-[var(--text-muted)]">
        {formatMeetingDate(item.date)}
      </p>

      {title && (
        <h3 className="line-clamp-2 text-[15px] font-medium text-[var(--text-primary)]">
          {title}
        </h3>
      )}
      {preview && (
        <p className="line-clamp-3 text-sm text-[var(--text-secondary)]">
          {preview}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <span className="font-mono">{item.source_slug}</span>
        {tagsToShow.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
          >
            #{tag}
          </span>
        ))}
        {overflowTagCount > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]"
            title={item.tags.slice(VISIBLE_TAGS).join(', ')}
          >
            +{overflowTagCount} more
          </span>
        )}
        {href && (
          <ChevronRight
            className="ml-auto h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )

  if (!href) return body
  return (
    <Link
      to={href}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] focus-visible:rounded-lg"
    >
      {body}
    </Link>
  )
}

function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 4 }, (_, i) => (
        <li
          key={i}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
        >
          <SkeletonLine className="h-3 w-32" />
          <SkeletonLine className="mt-2 h-4 w-3/4" />
          <SkeletonLine className="mt-2 h-3 w-full" />
          <SkeletonLine className="mt-1 h-3 w-5/6" />
        </li>
      ))}
    </ul>
  )
}

function EmptyFeed() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        No recent activity in the vault.
      </p>
    </div>
  )
}

function extractTitle(content: string): string | null {
  const lines = content.split('\n')
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line.trim())
    if (m && m[1]) return m[1].trim()
  }
  return null
}

function stripFirstHeading(content: string): string {
  return content.replace(/^#\s+.+$/m, '').trim()
}

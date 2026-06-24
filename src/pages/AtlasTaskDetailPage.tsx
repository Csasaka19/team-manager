import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar, Flag, GitBranch, Inbox, ListChecks, Users } from 'lucide-react'
import { AtlasErrorState } from '@/components/atlas/AtlasErrorState'
import { Breadcrumb } from '@/components/Breadcrumb'
import { AtlasMarkdown } from '@/components/atlas/AtlasMarkdown'
import { useAtlas } from '@/hooks/useAtlas'
import { fetchAtlasTask } from '@/services/atlas/client'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { isAtlasConfigured } from '@/services/atlas/config'
import { AtlasNotConfigured } from '@/components/atlas/AtlasNotConfigured'
import { SkeletonLine } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import type { AtlasTaskState } from '@/services/atlas/types'

const STATE_ICON: Record<AtlasTaskState, typeof Inbox> = {
  inbox: Inbox,
  open: ListChecks,
  done: ListChecks,
}

const PRIORITY_STYLE: Record<string, string> = {
  critical:
    'bg-[color-mix(in_srgb,var(--priority-critical)_15%,transparent)] text-[var(--priority-critical)]',
  high:
    'bg-[color-mix(in_srgb,var(--priority-high)_15%,transparent)] text-[var(--priority-high)]',
  medium:
    'bg-[color-mix(in_srgb,var(--priority-medium)_15%,transparent)] text-[var(--priority-medium)]',
  low:
    'bg-[color-mix(in_srgb,var(--priority-low)_15%,transparent)] text-[var(--priority-low)]',
}

export default function AtlasTaskDetailPage() {
  const { project = '', id = '' } = useParams<{ project: string; id: string }>()
  useDocumentTitle(id || 'Atlas task')

  const loader = useCallback(
    (signal: AbortSignal) => fetchAtlasTask(project, id, { signal }),
    [project, id],
  )
  const { data, error, loading, reload } = useAtlas(loader, [project, id])

  if (!isAtlasConfigured()) {
    return (
      <div className="space-y-6">
        <AtlasBreadcrumb title={id || 'Task'} />
        <AtlasNotConfigured />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <AtlasBreadcrumb title={id || 'Task'} />
        <SkeletonLine className="h-7 w-2/3" />
        <SkeletonLine className="h-3 w-1/3" />
        <div className="space-y-2">
          <SkeletonLine className="h-3 w-full" />
          <SkeletonLine className="h-3 w-5/6" />
          <SkeletonLine className="h-3 w-4/6" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <AtlasBreadcrumb title={id || 'Task'} />
        <AtlasErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (!data) return null

  const Icon = STATE_ICON[data.state] ?? Inbox
  const priorityClass =
    (data.priority && PRIORITY_STYLE[data.priority.toLowerCase()]) ?? null
  const title = extractTitle(data.description) ?? data.id

  return (
    <div className="space-y-6">
      <AtlasBreadcrumb title={title} />

      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{data.state}</span>
          <span aria-hidden="true">·</span>
          <span>{data.project}</span>
          {data.deadline && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {data.deadline}
              </span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
          {data.id}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetaCard label="Assignee" icon={Users}>
          {data.assignee ? (
            <span className="text-sm text-[var(--text-primary)]">
              {data.assignee}
            </span>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">Unassigned</span>
          )}
          {data.assignee_slugs && data.assignee_slugs.length > 1 && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {data.assignee_slugs.join(', ')}
            </p>
          )}
        </MetaCard>

        <MetaCard label="Priority" icon={Flag}>
          {data.priority && priorityClass ? (
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-[0.5px]',
                priorityClass,
              )}
            >
              {data.priority}
            </span>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">—</span>
          )}
        </MetaCard>

        <MetaCard label="Status" icon={Icon}>
          <span className="text-sm text-[var(--text-primary)]">
            {data.status}
          </span>
        </MetaCard>

        <MetaCard label="Updated" icon={Calendar}>
          <span className="text-sm text-[var(--text-primary)]">
            {data.updated ?? data.created ?? '—'}
          </span>
          {data.created && data.updated && data.created !== data.updated && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Created {data.created}
            </p>
          )}
        </MetaCard>
      </div>

      {((data.depends_on && data.depends_on.length > 0) ||
        (data.blocks && data.blocks.length > 0) ||
        data.parent) && (
        <section
          aria-labelledby="atlas-task-relations"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
        >
          <h2
            id="atlas-task-relations"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            Relations
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            {data.parent && (
              <Relation label="Parent">
                <span className="font-mono text-[12px] text-[var(--text-primary)]">
                  {data.parent}
                </span>
              </Relation>
            )}
            {data.depends_on && data.depends_on.length > 0 && (
              <Relation label="Depends on">
                <ul className="space-y-1 font-mono text-[12px] text-[var(--text-primary)]">
                  {data.depends_on.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </Relation>
            )}
            {data.blocks && data.blocks.length > 0 && (
              <Relation label="Blocks">
                <ul className="space-y-1 font-mono text-[12px] text-[var(--text-primary)]">
                  {data.blocks.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </Relation>
            )}
          </dl>
        </section>
      )}

      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-6 items-center rounded-full bg-[var(--bg-elevated)] px-2.5 text-[11px] text-[var(--text-secondary)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <section
        aria-labelledby="atlas-task-description"
        className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5"
      >
        <h2
          id="atlas-task-description"
          className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          Description
        </h2>
        <AtlasMarkdown content={data.description} />
      </section>

      {data.sources && data.sources.length > 0 && (
        <section
          aria-labelledby="atlas-task-sources"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
        >
          <h2
            id="atlas-task-sources"
            className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
          >
            Sources
          </h2>
          <ul className="mt-2 space-y-1 font-mono text-[12px] text-[var(--text-primary)]">
            {data.sources.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AtlasBreadcrumb({ title }: { title: string }) {
  return (
    <Breadcrumb
      items={[
        { label: 'Atlas', path: '/atlas' },
        { label: 'Tasks', path: '/atlas?tab=tasks' },
        { label: title },
      ]}
    />
  )
}

interface MetaCardProps {
  label: string
  icon: typeof Calendar
  children: React.ReactNode
}

function MetaCard({ label, icon: Icon, children }: MetaCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Relation({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function extractTitle(content: string): string | null {
  for (const line of content.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line.trim())
    if (m && m[1]) return m[1].trim()
  }
  return null
}

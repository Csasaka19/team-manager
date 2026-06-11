import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, FileText, HelpCircle, Layers, Lightbulb } from 'lucide-react'
import { AtlasErrorState } from '@/components/atlas/AtlasErrorState'
import { AtlasMarkdown } from '@/components/atlas/AtlasMarkdown'
import { AtlasNotConfigured } from '@/components/atlas/AtlasNotConfigured'
import { useAtlas, type AtlasFetchError } from '@/hooks/useAtlas'
import { fetchAtlasManifest, fetchAtlasSummary } from '@/services/atlas/client'
import { isAtlasConfigured } from '@/services/atlas/config'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { SkeletonLine } from '@/components/shared/Skeleton'
import {
  isManifestBundle,
  type AtlasExtractions,
  type AtlasManifest,
  type AtlasManifestResponse,
} from '@/services/atlas/types'

export default function AtlasSummaryDetailPage() {
  const { project = '', date = '' } = useParams<{
    project: string
    date: string
  }>()
  const navigate = useNavigate()
  useDocumentTitle(`${project} · ${date}`)

  const summaryLoader = useCallback(
    (signal: AbortSignal) => fetchAtlasSummary(project, date, { signal }),
    [project, date],
  )
  const summaryState = useAtlas(summaryLoader, [project, date])

  // Manifest is best-effort — 404 is a normal "no manifest for this date"
  // state, so we don't surface a full error card if it's missing.
  const manifestLoader = useCallback(
    (signal: AbortSignal) => fetchAtlasManifest(project, date, { signal }),
    [project, date],
  )
  const manifestState = useAtlas(manifestLoader, [project, date])

  if (!isAtlasConfigured()) {
    return (
      <div className="space-y-6">
        <BackButton onClick={() => navigate(-1)} />
        <AtlasNotConfigured />
      </div>
    )
  }

  if (summaryState.loading) {
    return (
      <div className="space-y-6">
        <BackButton onClick={() => navigate(-1)} />
        <SkeletonLine className="h-7 w-2/3" />
        <SkeletonLine className="h-3 w-1/3" />
        <div className="space-y-2">
          <SkeletonLine className="h-3 w-full" />
          <SkeletonLine className="h-3 w-5/6" />
        </div>
      </div>
    )
  }

  if (summaryState.error) {
    return (
      <div className="space-y-6">
        <BackButton onClick={() => navigate(-1)} />
        <AtlasErrorState
          error={summaryState.error}
          onRetry={summaryState.reload}
        />
      </div>
    )
  }
  const summary = summaryState.data
  if (!summary) return null

  const manifests = collectManifests(manifestState.data)

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate(-1)} />

      <div>
        <p className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.5px] text-[var(--text-secondary)]">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Daily summary · {summary.project}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
          {summary.date}
        </h1>
        {summary.frontmatter.tags && summary.frontmatter.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {summary.frontmatter.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-5 items-center rounded-full bg-[var(--bg-elevated)] px-2 text-[10px] text-[var(--text-secondary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <section
        aria-labelledby="atlas-summary-body"
        className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5"
      >
        <h2
          id="atlas-summary-body"
          className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          Body
        </h2>
        <AtlasMarkdown content={summary.content} />
      </section>

      <ManifestPanel
        manifests={manifests}
        loading={manifestState.loading}
        error={manifestState.error}
      />
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>
      <Link
        to="/atlas?tab=summaries"
        className="ml-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded"
      >
        All Atlas summaries
      </Link>
    </div>
  )
}

function collectManifests(
  data: AtlasManifestResponse | null,
): AtlasManifest[] {
  if (!data) return []
  if (isManifestBundle(data)) return data.manifests
  return [data]
}

interface ManifestPanelProps {
  manifests: AtlasManifest[]
  loading: boolean
  error: AtlasFetchError | null
}

function ManifestPanel({ manifests, loading, error }: ManifestPanelProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="atlas-manifest-loading"
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
      >
        <h2
          id="atlas-manifest-loading"
          className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          Manifest
        </h2>
        <SkeletonLine className="mt-3 h-3 w-1/2" />
        <SkeletonLine className="mt-2 h-3 w-2/3" />
      </section>
    )
  }

  // 404 = no manifest for this date → render a soft note, not a big red card.
  if (error && error.code === 'not_found') {
    return (
      <section className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 p-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          No structured manifest for this date.
        </p>
      </section>
    )
  }
  if (error) {
    return <AtlasErrorState error={error} />
  }
  if (manifests.length === 0) return null

  return (
    <section
      aria-labelledby="atlas-manifest-heading"
      className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="atlas-manifest-heading"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Manifest extractions
        </h2>
        {manifests.length > 1 && (
          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {manifests.length} same-day manifests
          </p>
        )}
      </div>

      {manifests.map((m, i) => {
        const ext = m.extractions
        if (!ext) return null
        return (
          <div key={m.manifest_id ?? i} className="space-y-3">
            {manifests.length > 1 && (
              <p className="font-mono text-[11px] text-[var(--text-muted)]">
                {m.manifest_id}
                {m.processed_at && (
                  <span className="ml-2">· {m.processed_at}</span>
                )}
              </p>
            )}
            <ExtractionGroups extractions={ext} />
          </div>
        )
      })}
    </section>
  )
}

function ExtractionGroups({ extractions }: { extractions: AtlasExtractions }) {
  const groups: Array<{
    key: string
    label: string
    icon: typeof BookOpen
    items: Array<{ description: string; secondary?: string }>
  }> = [
    {
      key: 'decisions',
      label: 'Decisions',
      icon: CheckCircle2,
      items: extractions.decisions.map((d) => ({
        description: d.description,
        ...(d.rationale ? { secondary: d.rationale } : {}),
      })),
    },
    {
      key: 'tasks',
      label: 'Extracted tasks',
      icon: BookOpen,
      items: extractions.tasks.map((t) => ({
        description: t.description,
        ...(t.assignee ? { secondary: `Assignee: ${t.assignee}` } : {}),
      })),
    },
    {
      key: 'status_updates',
      label: 'Status updates',
      icon: Layers,
      items: extractions.status_updates.map((s) => ({ description: s.description })),
    },
    {
      key: 'knowledge_artifacts',
      label: 'Knowledge artifacts',
      icon: Lightbulb,
      items: extractions.knowledge_artifacts.map((k) => ({
        description: k.description,
      })),
    },
    {
      key: 'questions_blockers',
      label: 'Questions & blockers',
      icon: HelpCircle,
      items: extractions.questions_blockers.map((q) => ({
        description: q.description,
      })),
    },
    {
      key: 'conflicts_detected',
      label: 'Conflicts detected',
      icon: AlertTriangle,
      items: extractions.conflicts_detected.map((c) => ({
        description: c.description,
      })),
    },
  ]

  const visible = groups.filter((g) => g.items.length > 0)

  if (visible.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Manifest contains no structured extractions.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {visible.map((g) => (
        <div
          key={g.key}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-3"
        >
          <h3 className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-secondary)]">
            <g.icon className="h-3 w-3" aria-hidden="true" />
            {g.label}
            <span className="ml-1 text-[10px] tabular-nums text-[var(--text-muted)]">
              ({g.items.length})
            </span>
          </h3>
          <ul className="mt-2 space-y-1.5">
            {g.items.map((item, i) => (
              <li
                key={i}
                className="text-sm leading-snug text-[var(--text-primary)]"
              >
                {item.description}
                {item.secondary && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {item.secondary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

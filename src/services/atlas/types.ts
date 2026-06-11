/**
 * Types mirroring the Atlas Control Center read-only public API.
 * See docs in the integration brief — every field below comes from a
 * documented endpoint payload. When the live API drifts from the docs,
 * update these types and the client together.
 */

/** Generic response envelope used by every endpoint. */
export interface AtlasEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
  meta?: AtlasMeta
}

export interface AtlasMeta {
  total?: number
  limit?: number
}

/** Canonical Atlas project from `/projects`. */
export interface AtlasProject {
  slug: string
  name: string
  description: string
  aliases: string[]
  keywords: string[]
  active: boolean
}

export type AtlasFeedType = 'summary' | string

/** Block-level feed item from `/feed`. */
export interface AtlasFeedItem {
  project: string
  source_slug: string
  type: AtlasFeedType
  date: string
  tags: string[]
  content: string
}

/** Lightweight row from `/summaries`. */
export interface AtlasSummaryRef {
  project: string
  date: string
}

export interface AtlasSummaryFrontmatter {
  type?: string
  project?: string
  date?: string
  tags?: string[]
  [extra: string]: unknown
}

/** Full summary document from `/summaries/:project/:date`. */
export interface AtlasSummary {
  project: string
  date: string
  frontmatter: AtlasSummaryFrontmatter
  content: string
}

export type AtlasTaskState = 'inbox' | 'open' | 'done'
export type AtlasTaskPriority = 'low' | 'medium' | 'high' | 'critical' | string

/** Task row from `/tasks` and detail at `/tasks/:project/:id`. */
export interface AtlasTask {
  id: string
  project: string
  state: AtlasTaskState
  status: string
  assignee: string | null
  assignee_slugs?: string[]
  assignee_type?: string
  priority: AtlasTaskPriority | null
  deadline: string | null
  depends_on?: string[]
  blocks?: string[]
  parent?: string | null
  sources?: string[]
  tags?: string[]
  created?: string
  updated?: string
  description: string
}

export interface AtlasDecision {
  id: string
  description: string
  rationale?: string
  [extra: string]: unknown
}

export interface AtlasManifestTask {
  id: string
  description: string
  assignee?: string | null
  priority?: AtlasTaskPriority | null
  [extra: string]: unknown
}

export interface AtlasStatusUpdate {
  id?: string
  description: string
  [extra: string]: unknown
}

export interface AtlasKnowledgeArtifact {
  id?: string
  description: string
  [extra: string]: unknown
}

export interface AtlasQuestionBlocker {
  id?: string
  description: string
  [extra: string]: unknown
}

export interface AtlasConflict {
  id?: string
  description: string
  [extra: string]: unknown
}

export interface AtlasExtractions {
  decisions: AtlasDecision[]
  tasks: AtlasManifestTask[]
  status_updates: AtlasStatusUpdate[]
  knowledge_artifacts: AtlasKnowledgeArtifact[]
  questions_blockers: AtlasQuestionBlocker[]
  conflicts_detected: AtlasConflict[]
}

export interface AtlasManifestSource {
  filename: string
  source_slug: string
  summary_block?: string
  [extra: string]: unknown
}

/** Single manifest from `/manifests/:project/:date` (one-of-many shape). */
export interface AtlasManifest {
  manifest_version?: string
  manifest_id: string
  processed_at?: string
  project: string
  date: string
  sources: AtlasManifestSource[]
  extractions: AtlasExtractions
  routing_summary?: { escalations?: unknown[] }
}

/** Combined shape returned when multiple manifests share the same date. */
export interface AtlasManifestBundle {
  project: string
  date: string
  manifest_count: number
  manifests: AtlasManifest[]
}

/** What the manifests endpoint returns — either a single manifest or a
 *  bundle of them. Callers narrow on `manifest_count`. */
export type AtlasManifestResponse = AtlasManifest | AtlasManifestBundle

export function isManifestBundle(
  value: AtlasManifestResponse,
): value is AtlasManifestBundle {
  return 'manifest_count' in value && Array.isArray(
    (value as AtlasManifestBundle).manifests,
  )
}

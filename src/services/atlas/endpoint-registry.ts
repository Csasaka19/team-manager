/**
 * The team-manager-side catalogue of Atlas API endpoints we know how to
 * use, plus the pages that consume each one. This is the index that
 * Settings → Atlas API renders as a status table, and that
 * `discoverEndpoints` falls back to when the API itself doesn't expose a
 * catalogue.
 *
 * When a new endpoint appears in the wild that's NOT in this list, the
 * Settings table flags it with a "New" badge and the discovery layer
 * logs a one-shot console.warn so the developer notices.
 */

export interface EndpointEntry {
  /** Canonical endpoint path with `:placeholders` where applicable. */
  path: string
  /** One-line description shown in the Settings table. */
  description: string
  /** Pages that consume data from this endpoint. Empty for unknowns. */
  pages: string[]
}

export const ENDPOINT_REGISTRY: ReadonlyArray<EndpointEntry> = [
  {
    path: '/projects',
    description: 'Project list',
    pages: ['Dashboard', 'Projects', 'Board (filter)', 'Atlas (Projects)'],
  },
  {
    path: '/tasks',
    description: 'All tasks across projects',
    pages: [
      'Board',
      'My Tasks',
      'Task Detail',
      'Dashboard (counts)',
      'Team (assignments)',
    ],
  },
  {
    path: '/tasks/:project/:id',
    description: 'Single task by project + filename stem',
    pages: ['Atlas Task Detail'],
  },
  {
    path: '/summaries',
    description: 'Daily summary index',
    pages: ['Atlas Summaries'],
  },
  {
    path: '/summaries/:project/:date',
    description: 'Single daily summary',
    pages: ['Atlas Summary Detail'],
  },
  {
    path: '/manifests/:project/:date',
    description: 'Extractions (decisions, tasks, blockers) for a date',
    pages: ['Meetings (project tab)', 'Atlas Summary Detail'],
  },
  {
    path: '/feed',
    description: 'Recent block-level activity',
    pages: ['Atlas Feed', 'Dashboard (activity)'],
  },
]

const REGISTRY_INDEX: ReadonlyMap<string, EndpointEntry> = new Map(
  ENDPOINT_REGISTRY.map((e) => [e.path, e]),
)

/** Pages that consume data from a given endpoint path. Returns an empty
 *  array for unknown endpoints. */
export function getAffectedPages(endpoint: string): string[] {
  return REGISTRY_INDEX.get(endpoint)?.pages ?? []
}

export function getEndpointDescription(endpoint: string): string {
  return REGISTRY_INDEX.get(endpoint)?.description ?? 'Unknown endpoint'
}

export function isKnownEndpoint(path: string): boolean {
  return REGISTRY_INDEX.has(path)
}

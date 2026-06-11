/**
 * Endpoint discovery + per-endpoint probing.
 *
 * The Atlas public API doesn't currently expose a root catalogue, but we
 * try anyway — if it ever does, the table in Settings will pick it up
 * without code changes. When the root probe fails (404 / not JSON / no
 * recognisable list), we fall back to the static `ENDPOINT_REGISTRY`.
 *
 * Probing uses real lightweight GETs (no params for list endpoints, sample
 * substitution for path-templated ones). Probe failures don't propagate —
 * each endpoint reports its own status so a single 404 can't tank the rest
 * of the table.
 */

import { getAtlasConfig, isAtlasConfigured } from './config'
import { ENDPOINT_REGISTRY } from './endpoint-registry'

export interface ProbeResult {
  /** Canonical registry path (with `:placeholders`, not the substituted URL). */
  path: string
  /** Concrete URL that was actually hit (helpful for debugging). */
  probedAs?: string
  /** Outcome class. */
  status: 'connected' | 'empty' | 'failed' | 'unknown'
  /** Item count for list endpoints, 1 for single-resource endpoints. */
  count?: number
  /** Error message when `status === 'failed'`. */
  error?: string
  /** True when this path isn't in `ENDPOINT_REGISTRY`. Drives the "New"
   *  badge + the one-shot console.warn. */
  isNew?: boolean
}

const warnedNewPaths = new Set<string>()

/**
 * Attempt to discover endpoints from the API itself; fall back to the
 * static list.
 *
 * Recognises any of these root-response shapes:
 *   - `{ data: ["/projects", ...] }`           (plain string array)
 *   - `{ data: [{ path: "/projects" }, ...] }` (objects with `path`)
 *   - `{ data: { endpoints: [...] } }`         (nested)
 */
export async function discoverEndpoints(): Promise<string[]> {
  if (!isAtlasConfigured()) return []
  const { baseUrl, token } = getAtlasConfig()
  try {
    const res = await fetch(baseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (res.ok) {
      const body = await safeJson(res)
      const extracted = extractPathArray(body)
      if (extracted.length > 0) return extracted
    }
  } catch {
    // Network / CORS — fall through to the static list.
  }
  return ENDPOINT_REGISTRY.map((e) => e.path)
}

/**
 * Probe a single canonical endpoint and report its current status.
 * Substitutes `:project` / `:date` / `:id` with the sample values in
 * `context` when present; if a placeholder can't be filled, returns
 * `status: 'unknown'` instead of guessing.
 */
export async function probeEndpoint(
  path: string,
  context: { sampleProject?: string; sampleDate?: string; sampleTaskId?: string } = {},
): Promise<ProbeResult> {
  if (!isAtlasConfigured()) {
    return { path, status: 'failed', error: 'not configured' }
  }

  let probeUrl = path
  if (probeUrl.includes(':project')) {
    if (!context.sampleProject) {
      return { path, status: 'unknown', error: 'no sample project available' }
    }
    probeUrl = probeUrl.replace(':project', encodeURIComponent(context.sampleProject))
  }
  if (probeUrl.includes(':date')) {
    if (!context.sampleDate) {
      return { path, status: 'unknown', error: 'no sample date available' }
    }
    probeUrl = probeUrl.replace(':date', encodeURIComponent(context.sampleDate))
  }
  if (probeUrl.includes(':id')) {
    if (!context.sampleTaskId) {
      return { path, status: 'unknown', error: 'no sample task id available' }
    }
    probeUrl = probeUrl.replace(':id', encodeURIComponent(context.sampleTaskId))
  }
  if (probeUrl.includes(':')) {
    return { path, status: 'unknown', error: 'unfilled placeholder' }
  }

  const { baseUrl, token } = getAtlasConfig()
  try {
    const res = await fetch(`${baseUrl}${probeUrl}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      return {
        path,
        probedAs: probeUrl,
        status: 'failed',
        error: `HTTP ${res.status}`,
      }
    }
    const body = await safeJson(res)
    if (!body || body.success === false) {
      return {
        path,
        probedAs: probeUrl,
        status: 'failed',
        error: (body && typeof body.error === 'string' && body.error) || 'envelope error',
      }
    }
    let count = 0
    if (Array.isArray(body.data)) count = body.data.length
    else if (body.data && typeof body.data === 'object') count = 1
    return {
      path,
      probedAs: probeUrl,
      status: count > 0 ? 'connected' : 'empty',
      count,
    }
  } catch (err) {
    return {
      path,
      probedAs: probeUrl,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * High-level orchestrator: discover the endpoint list, probe each in
 * parallel, return a sorted result set ready for the Settings table.
 *
 * Sample (project, date, task id) values to thread through the probes
 * can be passed in by the caller — if omitted, we derive them by probing
 * `/projects` and `/summaries` ourselves.
 */
export async function probeAllEndpoints(
  context: {
    sampleProject?: string
    sampleDate?: string
    sampleTaskId?: string
  } = {},
): Promise<ProbeResult[]> {
  const paths = await discoverEndpoints()
  const known = new Set(ENDPOINT_REGISTRY.map((e) => e.path))

  // If the caller didn't pre-seed samples, derive them ourselves so the
  // template endpoints can actually be probed.
  let sampleProject = context.sampleProject
  let sampleDate = context.sampleDate
  let sampleTaskId = context.sampleTaskId

  if (!sampleProject || !sampleDate) {
    const summaryProbe = await probeEndpoint('/summaries')
    if (summaryProbe.status === 'connected' && summaryProbe.probedAs) {
      const data = await fetchJsonData(summaryProbe.probedAs)
      const first = Array.isArray(data) ? data[0] : null
      if (first && typeof first === 'object') {
        const f = first as Record<string, unknown>
        if (typeof f.project === 'string' && !sampleProject) sampleProject = f.project
        if (typeof f.date === 'string' && !sampleDate) sampleDate = f.date
      }
    }
  }
  if (!sampleTaskId) {
    const tasksProbe = await probeEndpoint('/tasks')
    if (tasksProbe.status === 'connected' && tasksProbe.probedAs) {
      const data = await fetchJsonData(tasksProbe.probedAs)
      const first = Array.isArray(data) ? data[0] : null
      if (first && typeof first === 'object') {
        const f = first as Record<string, unknown>
        if (typeof f.id === 'string') sampleTaskId = f.id
        if (typeof f.project === 'string' && !sampleProject) sampleProject = f.project
      }
    }
  }

  const probeContext = {
    ...(sampleProject ? { sampleProject } : {}),
    ...(sampleDate ? { sampleDate } : {}),
    ...(sampleTaskId ? { sampleTaskId } : {}),
  }

  const results = await Promise.all(
    paths.map(async (p) => {
      const r = await probeEndpoint(p, probeContext)
      const isNew = !known.has(p)
      if (isNew && !warnedNewPaths.has(p)) {
        warnedNewPaths.add(p)
        // eslint-disable-next-line no-console
        console.warn(
          `[atlas-discovery] New Atlas endpoint discovered: ${p}. Add a mapping in src/services/atlas/endpoint-registry.ts to wire it to pages.`,
        )
      }
      return isNew ? { ...r, isNew: true } : r
    }),
  )

  // Stable order: known paths first (in registry order), unknowns last.
  const knownOrder = new Map(ENDPOINT_REGISTRY.map((e, i) => [e.path, i]))
  return results.sort((a, b) => {
    const ai = knownOrder.has(a.path) ? (knownOrder.get(a.path) as number) : 1000
    const bi = knownOrder.has(b.path) ? (knownOrder.get(b.path) as number) : 1000
    if (ai !== bi) return ai - bi
    return a.path.localeCompare(b.path)
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<{
  success?: boolean
  data?: unknown
  error?: string
} | null> {
  try {
    return (await res.json()) as { success?: boolean; data?: unknown; error?: string }
  } catch {
    return null
  }
}

async function fetchJsonData(probeUrl: string): Promise<unknown> {
  const { baseUrl, token } = getAtlasConfig()
  try {
    const res = await fetch(`${baseUrl}${probeUrl}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const body = await safeJson(res)
    return body?.data ?? null
  } catch {
    return null
  }
}

function extractPathArray(body: unknown): string[] {
  if (!body || typeof body !== 'object') return []
  const wrapped = (body as { data?: unknown }).data
  // Plain `{ data: [...] }`
  if (Array.isArray(wrapped)) return collectPaths(wrapped)
  // `{ data: { endpoints: [...] } }`
  if (wrapped && typeof wrapped === 'object') {
    const inner = (wrapped as { endpoints?: unknown }).endpoints
    if (Array.isArray(inner)) return collectPaths(inner)
  }
  // `[...]` at the top level (some non-enveloped APIs).
  if (Array.isArray(body)) return collectPaths(body)
  return []
}

function collectPaths(items: unknown[]): string[] {
  const out: string[] = []
  for (const item of items) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object') {
      const path = (item as { path?: unknown; endpoint?: unknown }).path ??
        (item as { endpoint?: unknown }).endpoint
      if (typeof path === 'string') out.push(path)
    }
  }
  return out
}

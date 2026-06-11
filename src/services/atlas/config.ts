/**
 * Atlas configuration resolution.
 *
 * Order of precedence (highest wins):
 *   1. localStorage override (Settings → Atlas section)
 *   2. Vite env vars (VITE_ATLAS_BASE_URL / VITE_ATLAS_TOKEN)
 *   3. Empty — the integration is "not configured" and pages render a CTA
 *      pointing to Settings.
 *
 * The env vars get baked into the build bundle, so the token is visible to
 * anyone with devtools. That's acceptable for trusted internal deployments;
 * for untrusted users, proxy through your own backend instead.
 */

const STORAGE_KEY = 'team-manager:atlas-config'

export interface AtlasConfig {
  baseUrl: string
  token: string
}

interface StoredOverride {
  baseUrl?: string
  token?: string
}

function readEnvVar(name: string): string {
  const raw = import.meta.env[name]
  return typeof raw === 'string' ? raw.trim() : ''
}

function readOverride(): StoredOverride {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const obj = parsed as Record<string, unknown>
    const out: StoredOverride = {}
    if (typeof obj.baseUrl === 'string') out.baseUrl = obj.baseUrl
    if (typeof obj.token === 'string') out.token = obj.token
    return out
  } catch {
    return {}
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export function getAtlasConfig(): AtlasConfig {
  const override = readOverride()
  const baseUrl = stripTrailingSlash(
    (override.baseUrl ?? readEnvVar('VITE_ATLAS_BASE_URL')).trim(),
  )
  const token = (override.token ?? readEnvVar('VITE_ATLAS_TOKEN')).trim()
  return { baseUrl, token }
}

export function isAtlasConfigured(config: AtlasConfig = getAtlasConfig()): boolean {
  return Boolean(config.baseUrl && config.token)
}

/** Stores a user-facing override; passing an empty object clears it.
 *  Pass `null` field values to fall back to the env var for that field. */
export function setAtlasOverride(next: StoredOverride): void {
  if (typeof window === 'undefined') return
  const payload: StoredOverride = {}
  if (next.baseUrl) payload.baseUrl = next.baseUrl.trim()
  if (next.token) payload.token = next.token.trim()
  if (Object.keys(payload).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function clearAtlasOverride(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Where the env vars and override come from — surfaced in Settings so the
 *  user can see "you're running on the env-var defaults" vs "you've overridden
 *  these in this browser." */
export interface AtlasConfigSource {
  baseUrl: 'env' | 'override' | 'unset'
  token: 'env' | 'override' | 'unset'
}

export function getAtlasConfigSource(): AtlasConfigSource {
  const override = readOverride()
  const envBase = readEnvVar('VITE_ATLAS_BASE_URL')
  const envToken = readEnvVar('VITE_ATLAS_TOKEN')
  return {
    baseUrl: override.baseUrl
      ? 'override'
      : envBase
        ? 'env'
        : 'unset',
    token: override.token
      ? 'override'
      : envToken
        ? 'env'
        : 'unset',
  }
}

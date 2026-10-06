import axios from 'axios'
import {
  clearAuth,
  decodeJwtPayload,
  getActiveOrgId,
  getContextMode,
  getPersonalWalletTenantId,
  getPreferredToken,
} from '@/lib/auth'
import { isCapacitorNativeRuntime, resolveMobileApiBaseUrl } from './baseUrl'

const API_BASE = resolveMobileApiBaseUrl()

/**
 * CapacitorHttp on Android patches global fetch/XHR at the native level.
 * ngrok free-tier tunnels return an HTML interstitial page for any request
 * that does NOT include the `ngrok-skip-browser-warning` header.
 * That HTML string is what causes `.map is not a function` errors.
 * Adding this header unconditionally is safe — non-ngrok backends ignore it.
 */
const isNgrokUrl = API_BASE.includes('ngrok')
const IDEMPOTENCY_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const IDEMPOTENCY_REUSE_WINDOW_MS = 30_000
const idempotencyCache = new Map<string, { key: string; createdAt: number }>()
const PUBLIC_AUTH_PATH_PREFIXES = [
  '/api/wallet/auth/login',
  '/api/wallet/auth/register',
  '/api/wallet/auth/login-challenge',
  '/api/wallet/auth/login-with-vc',
]

function isPublicAuthRoute(url?: string): boolean {
  if (!url) return false
  return PUBLIC_AUTH_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))
}

function normalizeTokenTenantId(token: string | null): string | null {
  if (!token) return null
  const payload = decodeJwtPayload(token)
  const tenantId = payload?.tenantId ?? payload?.orgTenantId ?? payload?.sub
  return typeof tenantId === 'string' && tenantId.trim().length > 0 ? tenantId.trim() : null
}

function fingerprintPayload(data: unknown): string {
  if (data === null || typeof data === 'undefined') return 'empty'
  let raw: string
  if (typeof data === 'string') {
    raw = data
  } else {
    try {
      raw = JSON.stringify(data)
    } catch {
      raw = String(data)
    }
  }

  const sample = raw.slice(0, 2048)
  let hash = 0
  for (let i = 0; i < sample.length; i += 1) {
    hash = (hash * 31 + sample.charCodeAt(i)) >>> 0
  }
  return `${sample.length}:${hash.toString(16)}`
}

function makeIdempotencySignature(
  method: string,
  url: string,
  tenantId: string,
  contextMode: 'org' | 'personal',
  data: unknown,
): string {
  return `${contextMode}|${tenantId}|${method.toUpperCase()}|${url}|${fingerprintPayload(data)}`
}

function getTenantScopedIdempotencyKey(signature: string, tenantId: string, contextMode: 'org' | 'personal'): string {
  const now = Date.now()
  const existing = idempotencyCache.get(signature)
  if (existing && now - existing.createdAt < IDEMPOTENCY_REUSE_WINDOW_MS) {
    return existing.key
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(16).slice(2)}`
  const nextKey = `mobile:${contextMode}:${tenantId}:${randomPart}`
  idempotencyCache.set(signature, { key: nextKey, createdAt: now })
  return nextKey
}

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 })

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.headers = (config.headers ?? {}) as typeof config.headers
    const requestBaseOrigin = (() => {
      try {
        return new URL(API_BASE).origin
      } catch {
        return ''
      }
    })()
    const isCrossOriginBrowserRequest = !!requestBaseOrigin && requestBaseOrigin !== window.location.origin
    const allowCustomContextHeaders = !isCrossOriginBrowserRequest

    // Always skip the ngrok browser interstitial when tunnelling.
    // On Capacitor Android, window.location.origin is 'http://localhost' while API_BASE is the
    // ngrok HTTPS domain, so isCrossOriginBrowserRequest=true and allowCustomContextHeaders=false.
    // CapacitorHttp (which patches native fetch) MUST send this header or every response is the
    // ngrok HTML interstitial page — causing empty wallets, 0 orgs, and client-side crashes.
    const isCapacitorNative = isCapacitorNativeRuntime()
    if (isNgrokUrl && (allowCustomContextHeaders || isCapacitorNative)) {
      ;(config.headers as any)['ngrok-skip-browser-warning'] = 'true'
    }

    const hasAuthorization =
      typeof config.headers.has === 'function'
        ? config.headers.has('Authorization') || config.headers.has('authorization')
        : !!(config.headers as any).Authorization || !!(config.headers as any).authorization
    const hasExplicitAuthorization = hasAuthorization

    if (!hasAuthorization) {
      const token = getPreferredToken()
      if (token) {
        ;(config.headers as any).Authorization = `Bearer ${token}`
      }
    }

    const authHeader = (config.headers as any).Authorization || (config.headers as any).authorization
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : getPreferredToken()
    const contextMode = getContextMode()
    const requestUrl = String(config.url || '')
    const skipContextGuard = isPublicAuthRoute(requestUrl) && !token
    const tokenTenantId = normalizeTokenTenantId(token)
    const activeOrgId = getActiveOrgId()
    const personalTenantId = getPersonalWalletTenantId()
    let effectiveContextMode: 'org' | 'personal' = contextMode

    // When a caller explicitly sets Authorization, infer context from token tenant.
    // This allows mixed-context pages (like inbox) to call holder endpoints even while
    // the UI is in org mode, without tripping the strict context guard.
    if (hasExplicitAuthorization && tokenTenantId) {
      if (activeOrgId && tokenTenantId === activeOrgId) {
        effectiveContextMode = 'org'
      } else if (personalTenantId && tokenTenantId === personalTenantId) {
        effectiveContextMode = 'personal'
      } else if (!activeOrgId) {
        effectiveContextMode = 'personal'
      } else {
        // Token tenant doesn't match either known org or known personal tenant.
        // Treat as personal to avoid incorrectly blocking legitimate cross-context calls.
        effectiveContextMode = 'personal'
      }
    }

    if (!skipContextGuard) {
      if (effectiveContextMode === 'org') {
        if (!activeOrgId || !tokenTenantId || tokenTenantId !== activeOrgId) {
          return Promise.reject(new Error('Context guard: org token/tenant mismatch'))
        }
        if (allowCustomContextHeaders) {
          ;(config.headers as any)['x-context-mode'] = 'org'
          ;(config.headers as any)['x-context-tenant-id'] = activeOrgId
        }
      } else {
        // Reject only when we are certain the token belongs to a different tenant.
        // If personalTenantId is not yet resolved (null) we let the request through and
        // let the server enforce auth — avoids blocking valid calls on first load.
        if (
          !tokenTenantId ||
          (personalTenantId && tokenTenantId !== personalTenantId && tokenTenantId !== activeOrgId)
        ) {
          return Promise.reject(new Error('Context guard: personal token/tenant mismatch'))
        }
        if (allowCustomContextHeaders) {
          ;(config.headers as any)['x-context-mode'] = 'personal'
          ;(config.headers as any)['x-context-tenant-id'] = tokenTenantId
        }
      }
      if (allowCustomContextHeaders) {
        ;(config.headers as any)['x-context-guard-version'] = 'v1'
      }
    }

    const method = String(config.method || 'get').toLowerCase()
    const hasIdempotencyHeader =
      typeof config.headers.has === 'function'
        ? config.headers.has('x-idempotency-key') || config.headers.has('idempotency-key')
        : !!(config.headers as any)['x-idempotency-key'] || !!(config.headers as any)['idempotency-key']

    if (allowCustomContextHeaders && IDEMPOTENCY_METHODS.has(method) && !hasIdempotencyHeader && tokenTenantId) {
      const signature = makeIdempotencySignature(
        method,
        String(config.url || ''),
        tokenTenantId,
        effectiveContextMode,
        config.data,
      )
      const idempotencyKey = getTenantScopedIdempotencyKey(signature, tokenTenantId, effectiveContextMode)
      ;(config.headers as any)['x-idempotency-key'] = idempotencyKey
    }

    // CapacitorHttp (enabled in capacitor.config.json) patches fetch/XHR at the
    // native layer and does NOT honour AbortController signals. Strip the signal
    // so it doesn't cause silent failures on Android.
    if ((config as any).signal) {
      delete (config as any).signal
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    const requestUrl = String(err?.config?.url || '')
    const isAuthRoute = isPublicAuthRoute(requestUrl)
    const skipAuthRedirect = Boolean((err?.config as any)?.skipAuthRedirect)

    // Recover from stale/expired sessions by forcing a clean re-login flow.
    // Without this, the app can stay stuck replaying an invalid token and
    // repeatedly receiving 401s on protected endpoints.
    if (typeof window !== 'undefined' && status === 401 && !isAuthRoute && !skipAuthRedirect) {
      clearAuth()
      localStorage.setItem('credoContextMode', 'personal')

      if (!window.location.pathname.startsWith('/login')) {
        const returnTo = `${window.location.pathname}${window.location.search || ''}`
        window.location.replace(`/login/?returnTo=${encodeURIComponent(returnTo)}`)
      }
    }

    return Promise.reject(err)
  },
)

/**
 * Safely coerce any API response value to an array.
 * CapacitorHttp can return parsed objects, error bodies, or even HTML strings
 * when a tunnel (ngrok) returns a non-JSON response. This guard prevents
 * `.map is not a function` crashes throughout the app.
 */
export function safeArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  return []
}

export default api

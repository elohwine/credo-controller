import api from '@/lib/api'
import { getActiveOrgId, getOrgToken } from '@/lib/auth'

import { getOfflineStorageAdapter } from './storage'

export interface VerifierBundleSnapshot {
  id: string
  tenantId: string
  bundleType: 'verifier'
  version: number
  payload: Record<string, unknown>
  digest: string
  issuedAt: string
  expiresAt?: string
  revokedAt?: string
}

export interface VerifierBundlePayload {
  bundleType: 'verifier'
  tenantId: string
  generatedAt: string
  baseUrl: string
  verifier: {
    did?: string
    kid?: string
    metadata?: Record<string, unknown>
  }
  issuer?: {
    did?: string
    kid?: string
    metadata?: Record<string, unknown>
  }
  statusList?: {
    listId: string
    size: number
    currentIndex: number
    encodedList: string
    digest: string
    issuedAt: string
  }
  verificationModes: string[]
}

export interface VerifierBundleCacheEntry {
  tenantId: string
  snapshot: VerifierBundleSnapshot
  bundle: VerifierBundlePayload
  cachedAt: string
}

const VERIFIER_BUNDLE_CACHE_KEY = 'current'

function nowIso(): string {
  return new Date().toISOString()
}

function resolveTenantId(tenantId?: string): string | null {
  if (tenantId && tenantId.trim().length > 0) return tenantId.trim()
  const activeOrgId = getActiveOrgId()
  return activeOrgId && activeOrgId.trim().length > 0 ? activeOrgId.trim() : null
}

export function getCachedVerifierBundle(tenantId?: string): VerifierBundleCacheEntry | null {
  const resolvedTenantId = resolveTenantId(tenantId)
  if (!resolvedTenantId) return null

  return getOfflineStorageAdapter().get<VerifierBundleCacheEntry>('verifier_bundle', `${resolvedTenantId}:${VERIFIER_BUNDLE_CACHE_KEY}`)
}

export function cacheVerifierBundle(entry: VerifierBundleCacheEntry): void {
  getOfflineStorageAdapter().set('verifier_bundle', `${entry.tenantId}:${VERIFIER_BUNDLE_CACHE_KEY}`, entry)
}

export async function refreshVerifierBundle(tenantId?: string): Promise<VerifierBundleCacheEntry | null> {
  const resolvedTenantId = resolveTenantId(tenantId)
  if (!resolvedTenantId) return null

  const token = getOrgToken()
  if (!token) {
    return getCachedVerifierBundle(resolvedTenantId)
  }

  try {
    const response = await api.get('/offline/bundles/verifier', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      skipAuthRedirect: true,
    } as any)

    const snapshot = response.data?.snapshot as VerifierBundleSnapshot | undefined
    const bundle = response.data?.bundle as VerifierBundlePayload | undefined
    if (!snapshot || !bundle) {
      return getCachedVerifierBundle(resolvedTenantId)
    }

    const entry: VerifierBundleCacheEntry = {
      tenantId: resolvedTenantId,
      snapshot,
      bundle,
      cachedAt: nowIso(),
    }

    cacheVerifierBundle(entry)
    return entry
  } catch {
    return getCachedVerifierBundle(resolvedTenantId)
  }
}
import api, { safeArray } from '@/lib/api'
import { decodeJwtPayload, getPersonalWalletTenantId, getWalletToken } from '@/lib/auth'
import { getOfflineStorageAdapter } from './storage'

export interface WalletSnapshotCredential {
  id: string
  type: string | string[]
  issuerDid?: string
  addedOn?: string
  revoked?: boolean
  archived?: boolean
  revocationReason?: string
  parsedDocument?: Record<string, unknown>
}

export interface WalletOfflineSnapshot {
  walletId: string
  credentials: WalletSnapshotCredential[]
  pendingOffers: any[]
  pendingReceipts: any[]
  cachedAt: string
}

const WALLET_CACHE_KEY = 'wallet-proofs-current'
const WALLET_CACHE_LAST_ID_KEY = `${WALLET_CACHE_KEY}:last-wallet-id`

function cacheKey(walletId: string): string {
  return `${WALLET_CACHE_KEY}:${walletId}`
}

function resolveWalletId(token?: string | null): string | null {
  const activeToken = token || getWalletToken()
  if (!activeToken) return null

  const payload = decodeJwtPayload(activeToken)
  if (!payload) return null

  const walletId = payload.tenantId ?? payload.walletId ?? payload.sub
  return typeof walletId === 'string' && walletId.trim().length > 0 ? walletId.trim() : null
}

export function getCachedWalletSnapshot(walletId?: string | null): WalletOfflineSnapshot | null {
  const storage = getOfflineStorageAdapter()

  const resolvedWalletId = walletId && walletId.trim().length > 0
    ? walletId.trim()
    : storage.get<string>('sync_state', WALLET_CACHE_LAST_ID_KEY)

  if (!resolvedWalletId) return null

  const snapshot = storage.get<WalletOfflineSnapshot>('credential_cache', cacheKey(resolvedWalletId))
  if (!snapshot) return null

  return snapshot
}

function normalizeCredentialRows(items: any[]): WalletSnapshotCredential[] {
  const dedupedMap = new Map<string, any>()

  items.forEach((item) => {
    const subject = item?.parsedDocument?.credentialSubject || item?.credentialSubject || {}
    const baseKey = subject.transactionId || subject.invoiceHash || subject.invoiceId || subject.cartId || item.id
    const type = Array.isArray(item?.type) ? item.type : [item?.type]
    const isReceipt = type.filter(Boolean).map(String).some((t: string) => t.includes('Receipt'))
    const key = isReceipt ? `receipt-${item.id}` : `${baseKey}-${String(type.find(Boolean) || 'Credential')}`
    if (!dedupedMap.has(key) || new Date(item.addedOn || 0) > new Date(dedupedMap.get(key)?.addedOn || 0)) {
      dedupedMap.set(key, item)
    }
  })

  return Array.from(dedupedMap.values()).map((item) => ({
    id: item.vc_id || item.id,
    type: item.vc_type || item.type || 'VerifiableCredential',
    issuerDid: item.issuerDid,
    addedOn: item.issued_at || item.addedOn,
    revoked: !!item.revoked || item.status === 'REVOKED',
    archived: !!item.archived,
    revocationReason: item.revocation_reason,
    parsedDocument: item.parsedDocument || item.parsed_document,
  } as WalletSnapshotCredential))
}

export async function syncWalletSnapshot(options?: { token?: string; walletId?: string }): Promise<WalletOfflineSnapshot | null> {
  const storage = getOfflineStorageAdapter()

  const token = options?.token || getWalletToken()
  if (!token) return null

  const walletId = options?.walletId || resolveWalletId(token)
  if (!walletId) return null

  const existing = getCachedWalletSnapshot(walletId)

  const credentialsResult = await (async () => {
    try {
      let authToken = token
      try {
        const sessionRes = await api.post(
          '/api/ssi/auth/session',
          { expiresInSeconds: 900 },
          {
            headers: { Authorization: `Bearer ${token}` },
            skipAuthRedirect: true as any,
          } as any,
        )
        if (sessionRes.data?.token) authToken = sessionRes.data.token
      } catch {
        // Fall back to primary token
      }

      const res = await api.get(`/api/wallet/${walletId}/credentials/list?limit=500`, {
        headers: { Authorization: `Bearer ${authToken}` },
        skipAuthRedirect: true as any,
      } as any)

      const items: any[] = safeArray(res.data?.items ?? res.data)
      return normalizeCredentialRows(items)
    } catch {
      return null
    }
  })()

  const pendingResult = await (async () => {
    try {
      try {
        const walletTenantId = getPersonalWalletTenantId()
        await api.post('/api/wallet/credentials/sync-receipts', {}, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-context-mode': 'personal',
            ...(walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
          },
          skipAuthRedirect: true as any,
        } as any)
      } catch {
        // Best effort only.
      }

      const [offersRes, receiptsRes] = await Promise.all([
        api.get('/api/wallet/credentials/pending-offers', {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any),
        api.get('/api/wallet/credentials/pending-receipts', {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any),
      ])

      return {
        pendingOffers: safeArray(offersRes.data?.offers ?? offersRes.data),
        pendingReceipts: safeArray(receiptsRes.data?.pendingReceipts ?? receiptsRes.data?.receipts ?? receiptsRes.data),
      }
    } catch {
      return null
    }
  })()

  const credentials = credentialsResult ?? existing?.credentials ?? []
  const pendingOffers = pendingResult?.pendingOffers ?? existing?.pendingOffers ?? []
  const pendingReceipts = pendingResult?.pendingReceipts ?? existing?.pendingReceipts ?? []

  if (credentials.length === 0 && pendingOffers.length === 0 && pendingReceipts.length === 0) {
    return existing || null
  }

  const snapshot: WalletOfflineSnapshot = {
    walletId,
    credentials,
    pendingOffers,
    pendingReceipts,
    cachedAt: new Date().toISOString(),
  }

  storage.set<WalletOfflineSnapshot>('credential_cache', cacheKey(walletId), snapshot)
  storage.set<string>('sync_state', WALLET_CACHE_LAST_ID_KEY, walletId)

  return snapshot
}

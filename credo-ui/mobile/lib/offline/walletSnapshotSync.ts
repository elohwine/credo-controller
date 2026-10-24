import { currentAccountId, rememberCurrentAccount } from '@/lib/savedAccounts'
import api, { safeArray } from '@/lib/api'
import { decodeJwtPayload, getPersonalWalletTenantId, getWalletToken } from '@/lib/auth'
import { getOfflineStorageAdapter } from './storage'

export interface WalletSnapshotCredential {
  id: string
  /** The id the issuer registered for the card, when the card carries one. */
  issuedId?: string
  type: string | string[]
  issuerDid?: string
  issuerName?: string
  /** The organisation that issued the card, for its brand on quotes, invoices and receipts. */
  issuerOrgTenantId?: string
  addedOn?: string
  revoked?: boolean
  withdrawn?: boolean
  archived?: boolean
  revocationReason?: string
  parsedDocument?: Record<string, any>
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

  const resolvedWalletId =
    walletId && walletId.trim().length > 0
      ? walletId.trim()
      : storage.get<string>('sync_state', WALLET_CACHE_LAST_ID_KEY)

  if (!resolvedWalletId) return null

  const snapshot = storage.get<WalletOfflineSnapshot>('credential_cache', cacheKey(resolvedWalletId))
  if (!snapshot) return null

  return snapshot
}

/**
 * Rows from `GET /api/wallet/{id}/credentials/list` as the screens and the offline copy hold
 * them. The endpoint returns `vc_id` / `vc_type` / `issued_at`; older callers used `id` /
 * `type` / `addedOn`, so both spellings are read. Receipts for the same transaction keep only
 * the newest copy; every other card is its own record. Used by the Records screen and by the
 * background sync, so the offline copy is the same list the person saw.
 */
export function normalizeWalletCredentialRows(items: any[]): WalletSnapshotCredential[] {
  const dedupedMap = new Map<string, any>()

  items.forEach((item) => {
    const itemId = item?.vc_id || item?.id
    const itemType = item?.vc_type || item?.type
    const itemAdded = item?.issued_at || item?.addedOn
    const subject = item?.parsedDocument?.credentialSubject || item?.credentialSubject || {}
    const types = (Array.isArray(itemType) ? itemType : [itemType]).filter(Boolean).map(String)
    const isReceipt = types.some((t: string) => t.includes('Receipt'))
    const receiptKey = subject.transactionId || subject.invoiceHash || subject.invoiceId || subject.cartId
    const key = isReceipt && receiptKey ? `receipt-${receiptKey}-${types[0] || 'Credential'}` : `card-${itemId}`
    const existing = dedupedMap.get(key)
    if (!existing || new Date(itemAdded || 0) > new Date(existing.issued_at || existing.addedOn || 0)) {
      dedupedMap.set(key, item)
    }
  })

  return Array.from(dedupedMap.values()).map(
    (item) =>
      ({
        id: item.vc_id || item.id,
        issuedId: item.issuedId,
        type: item.vc_type || item.type || 'VerifiableCredential',
        issuerDid: item.issuerDid,
        issuerName: item.issuerName,
        issuerOrgTenantId: item.issuerOrgTenantId,
        addedOn: item.issued_at || item.addedOn,
        revoked: !!item.revoked || item.status === 'REVOKED',
        withdrawn: !!item.withdrawn,
        archived: !!item.archived,
        revocationReason: item.revocationReason || item.revocation_reason,
        parsedDocument: item.parsedDocument || item.parsed_document,
      }) as WalletSnapshotCredential,
  )
}

/**
 * The account switcher shows "Name (+phone)". The name comes from this person's own identity
 * card, never from an organisation, and is kept with the signed-in account.
 */
function rememberIdentityName(walletId: string, items: any[]): void {
  if (typeof window === 'undefined') return
  const identity = items.find((item) => {
    const types = [item?.type, item?.credentialType, ...(item?.parsedDocument?.type || [])].map(String)
    return !item?.withdrawn && types.some((type) => type.includes('PlatformIdentity'))
  })
  const raw = identity?.parsedDocument?.credentialSubject || identity?.credentialSubject || {}
  const subject = { ...(raw.claims || {}), ...raw }
  const name = String(subject.displayName || subject.name || subject.username || '').trim()
  if (!name || currentAccountId() !== walletId) return
  if (localStorage.getItem('credoUserName') !== name) localStorage.setItem('credoUserName', name)
  if (!localStorage.getItem('credoUserPhone') && subject.phone) localStorage.setItem('credoUserPhone', String(subject.phone))
  rememberCurrentAccount()
}

export async function syncWalletSnapshot(options?: {
  token?: string
  walletId?: string
}): Promise<WalletOfflineSnapshot | null> {
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
        const sessionRes = await api.post('/api/ssi/auth/session', { expiresInSeconds: 900 }, {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any)
        if (sessionRes.data?.token) authToken = sessionRes.data.token
      } catch {
        // Fall back to primary token
      }

      const res = await api.get(`/api/wallet/${walletId}/credentials/list?limit=500`, {
        headers: { Authorization: `Bearer ${authToken}` },
        skipAuthRedirect: true as any,
      } as any)

      const items: any[] = safeArray(res.data?.items ?? res.data)
      rememberIdentityName(walletId, items)
      return normalizeWalletCredentialRows(items)
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

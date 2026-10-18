import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { credentialIssuanceService } from '../CredentialIssuanceService'
import { outboxService } from '../OutboxService'

export type OfferLifecycleStatus = 'pending' | 'accepted' | 'withdrawn' | 'resolved' | 'expired'

export function offerLifecycleStatus(row: {
  accepted_at?: string | null
  resolved_at?: string | null
  last_error?: string | null
  offer_expires_at?: string | null
}): OfferLifecycleStatus {
  if (row.accepted_at) return 'accepted'
  if (
    String(row.last_error || '')
      .toLowerCase()
      .startsWith('withdrawn:')
  )
    return 'withdrawn'
  if (row.resolved_at) return 'resolved'
  if (row.offer_expires_at) {
    const expiresAt = new Date(row.offer_expires_at).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return 'expired'
  }
  return 'pending'
}

export interface DirectRecordInput {
  orgTenantId: string
  walletTenantId: string
  credentialType: string
  claims: Record<string, unknown>
  title: string
  body: string
  sourceType: string
  /** Stable source reference; one offer row per source. Defaults to the offer id. */
  sourceId?: string
  metadata?: Record<string, unknown>
}

/**
 * Offer a record straight into a person's wallet inbox and queue the delivery
 * notification. Callers validate the type, claims and recipient first.
 */
export async function sendDirectRecord(input: DirectRecordInput): Promise<{ rowId: string; offerId: string }> {
  const offer = await credentialIssuanceService.createOffer({
    credentialType: input.credentialType,
    claims: input.claims,
    tenantId: input.orgTenantId,
    requireExactCredentialType: true,
    signAs: 'organisation',
  })

  const rowId = randomUUID()
  const now = new Date().toISOString()
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO wallet_pending_offers (
         id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
         title, body, metadata, created_at, attempt_count, last_attempt_at
       ) VALUES (
         @id, @tenantId, @issuerTenantId, @sourceType, @sourceId, @credentialType, @offerUri,
         @title, @body, @metadata, @createdAt, 0, @createdAt
       )`,
    )
    .run({
      id: rowId,
      tenantId: input.walletTenantId,
      issuerTenantId: input.orgTenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId || `manual:${offer.offerId}`,
      credentialType: input.credentialType,
      offerUri: offer.credential_offer_deeplink,
      title: input.title,
      body: input.body,
      metadata: JSON.stringify({
        ...(input.metadata || {}),
        claims: input.claims,
        offerId: offer.offerId,
        offerExpiresAt: offer.expiresAt,
        signedBy: offer.signedBy,
        mode: 'direct_issue',
      }),
      createdAt: now,
    })

  outboxService.enqueue({
    topic: 'wallet.vc.offered',
    aggregateKey: input.walletTenantId,
    dedupeKey: `wpo:${input.walletTenantId}:${input.sourceType}:${rowId}`,
    payload: { tenantId: input.walletTenantId, sourceType: input.sourceType },
  })

  return { rowId, offerId: offer.offerId }
}

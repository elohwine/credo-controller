/**
 * IdentityVerificationRequestService — the opt-in step (at sign up, and later from Settings)
 * where a person can ask the Central Registry to confirm their date of birth, instead of (or
 * before) entering it themselves.
 *
 * This does NOT call a Central Registry: that connection does not exist yet and is a separate,
 * optional, pending-approval step. What this does is honest bookkeeping of the request itself
 * (requested / fulfilled / declined) so that:
 *  - a person who opts in sees "Requested — pending confirmation" instead of nothing happening;
 *  - the day the registry connection lands, `fulfillWithRegistryDateOfBirth` is the one place
 *    that turns a real confirmation into a reissued PlatformIdentityVC (see
 *    SSIAuthService.reissuePlatformIdentityWithDateOfBirth) — no new credential type, no
 *    invented data.
 *
 * A person who skips the registry (or wants an answer now) can self-attest instead; that path
 * reissues the same card immediately with `identityVerification: 'self_attested'`.
 */

import crypto from 'crypto'
import { container } from 'tsyringe'

import { DatabaseManager } from '../persistence/DatabaseManager'

export type RegistryRequestStatus = 'none' | 'pending' | 'fulfilled' | 'declined'

export interface RegistryRequestState {
  status: RegistryRequestStatus
  requestId?: string
  requestedAt?: string
  fulfilledAt?: string
}

class IdentityVerificationRequestService {
  private ensureTable(): void {
    DatabaseManager.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS registry_identity_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL,
        fulfilled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  }

  /** One open request at a time; asking again while pending returns the same request. */
  public requestRegistryVerification(walletTenantId: string): RegistryRequestState {
    this.ensureTable()
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id, requested_at as requestedAt FROM registry_identity_requests
         WHERE tenant_id = ? AND status = 'pending' ORDER BY datetime(requested_at) DESC LIMIT 1`,
      )
      .get(walletTenantId) as { id: string; requestedAt: string } | undefined
    if (existing) return { status: 'pending', requestId: existing.id, requestedAt: existing.requestedAt }

    const id = `rir-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO registry_identity_requests (id, tenant_id, status, requested_at, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
    ).run(id, walletTenantId, now, now, now)
    return { status: 'pending', requestId: id, requestedAt: now }
  }

  /** The most recent registry request for this wallet, or 'none' if it never asked. */
  public statusFor(walletTenantId: string): RegistryRequestState {
    this.ensureTable()
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, status, requested_at as requestedAt, fulfilled_at as fulfilledAt
         FROM registry_identity_requests WHERE tenant_id = ? ORDER BY datetime(requested_at) DESC LIMIT 1`,
      )
      .get(walletTenantId) as
      | { id: string; status: RegistryRequestStatus; requestedAt: string; fulfilledAt: string | null }
      | undefined
    if (!row) return { status: 'none' }
    return {
      status: row.status,
      requestId: row.id,
      requestedAt: row.requestedAt,
      fulfilledAt: row.fulfilledAt || undefined,
    }
  }

  /** The person withdrew the request. Entering a date of birth themselves does not withdraw it. */
  public decline(walletTenantId: string): void {
    this.ensureTable()
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE registry_identity_requests SET status = 'declined', updated_at = ?
         WHERE tenant_id = ? AND status = 'pending'`,
      )
      .run(now, walletTenantId)
  }

  /**
   * Hook point for when the Central Registry connection exists: it confirms this person's
   * date of birth and this reissues the platform identity with that fact. Nothing in this
   * codebase calls this today — the registry is not connected — so no date of birth is
   * invented. When the connection is approved and built, its result lands here.
   */
  public async fulfillWithRegistryDateOfBirth(
    requestId: string,
    dateOfBirth: string,
    displayName?: string,
    phone?: string,
  ): Promise<void> {
    this.ensureTable()
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(`SELECT tenant_id as tenantId, status FROM registry_identity_requests WHERE id = ?`)
      .get(requestId) as { tenantId?: string; status?: string } | undefined
    if (!row?.tenantId) throw new Error('Unknown registry verification request')
    if (row.status !== 'pending') throw new Error('This registry verification request is not pending')

    const { SSIAuthService } = await import('./SSIAuthService')
    const ssiAuthService = container.resolve(SSIAuthService)
    await ssiAuthService.reissuePlatformIdentityWithDateOfBirth(
      row.tenantId,
      dateOfBirth,
      'registry_confirmed',
      displayName,
      phone,
    )

    const now = new Date().toISOString()
    db.prepare(
      `UPDATE registry_identity_requests SET status = 'fulfilled', fulfilled_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, requestId)
  }
}

export const identityVerificationRequestService = new IdentityVerificationRequestService()

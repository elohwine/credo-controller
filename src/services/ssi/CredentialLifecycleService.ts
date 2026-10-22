/**
 * CredentialLifecycleService — one place for what happens to a card after it is issued.
 *
 * Issuing: every card gets a status-list entry (W3C Bitstring Status List, purpose
 * `revocation`) and a row in `issued_credentials`, keyed by the issuance session id, which is
 * also the `offerId` stored on the wallet inbox row. Whole-record cards carry the entry as
 * `credentialStatus`; selective-disclosure cards carry the same entry as the always-visible
 * `status` claim next to `jti`.
 *
 * Withdrawing: `revoke` flips the status-list bit and marks the issued row; `revokeStaffCards`
 * does that for the staff cards a person accepted from one organisation. The stage checker
 * (`StageProofService`) and the platform verifier both refuse a withdrawn card, and the
 * person's own card list files a replaced card in amber and a withdrawn card in red under Archived.
 *
 * Staff-card rule on a role change (organisation setting `staffCardChange`):
 *   stop_when_narrower  withdraw the earlier card only when it still proves steps the person
 *                       no longer has; otherwise it stays valid until the new card is accepted
 *                       (a "refresh" in status-list terms: a newer card exists, the old one is
 *                       still true).
 *   stop_now            withdraw the earlier card the moment the role changes.
 * Accepting a new staff card always withdraws the older accepted ones for the same person and
 * organisation, so only one staff card is ever valid per membership. Leaving the organisation
 * withdraws them all.
 */

import { EMPLOYEE_OFFER_SOURCE_TYPE, employeeOrgAccessForRole } from '../../config/credentials/EmployeeVC'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { rootLogger } from '../../utils/pinoLogger'

import { statusListAllocatorService, type BitstringStatusListEntry } from './StatusListAllocatorService'

const logger = rootLogger.child({ module: 'CredentialLifecycleService' })

export interface RegisterIssuedInput {
  /** Issuance session id; the same value the wallet inbox row stores as `offerId`. */
  issuanceSessionId: string
  /** Issuer tenant (the organisation). */
  tenantId: string
  issuerDid: string
  credentialId: string
  holderDid?: string
  credentialDefinitionId: string
  format: string
  credentialData: Record<string, unknown>
}

export interface StaffCardScope {
  role: string
  stageActions: string[]
}

/** What the public "check a record" page and the two apps show for one pasted reference. */
export interface RecordCheck {
  reference: string
  vcType: string
  status: 'valid' | 'invalid' | 'revoked' | 'expired' | 'not_found'
  /** Why the organisation ended it, when status is revoked. */
  reason?: string
  /** The organisation that issued it, in words. */
  issuerName?: string
  issuedAt?: string
  expiresAt?: string
  /** What the record says (the credential subject, or the offer's claims). */
  claims?: Record<string, unknown>
  checkedAt: string
}

/** SQLite `datetime('now')` is UTC without a zone; browsers would read it as local time. */
function sqliteUtc(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
}

export class CredentialLifecycleService {
  private readonly issued = new IssuedCredentialRepository()

  /**
   * Allocate a status entry and persist the issued row. Returns the entry to embed in the
   * card, or undefined when the issuer has no active organisation row (platform issuer).
   */
  public registerIssued(input: RegisterIssuedInput): (BitstringStatusListEntry & { id: string }) | undefined {
    let entry: (BitstringStatusListEntry & { id: string }) | undefined
    try {
      const allocation = statusListAllocatorService.allocateForTenant(
        input.tenantId,
        input.issuerDid,
        'revocation',
        input.credentialId,
      )
      // Credo's credential model wants an `id` on the status object; the spec allows one.
      if (allocation) {
        entry = {
          id: `${allocation.entry.statusListCredential}#${allocation.entry.statusListIndex}`,
          ...allocation.entry,
        }
      }
    } catch (error: any) {
      logger.warn(
        { error: error?.message, credentialId: input.credentialId },
        'Status list allocation failed; card issued without a status entry',
      )
    }
    try {
      this.issued.save({
        id: input.issuanceSessionId,
        tenantId: input.tenantId,
        credentialId: input.credentialId,
        holderDid: input.holderDid,
        credentialDefinitionId: input.credentialDefinitionId,
        credentialData: entry ? { ...input.credentialData, credentialStatus: entry } : input.credentialData,
        format: input.format,
        revoked: false,
      })
    } catch (error: any) {
      logger.warn({ error: error?.message, credentialId: input.credentialId }, 'Could not persist issued card')
    }
    return entry
  }

  public isRevoked(credentialId: string | undefined | null): boolean {
    return this.revocationOf(credentialId).revoked
  }

  /**
   * The public "check a record" answer for a pasted reference. The issued-card register is the
   * first word: a row in `issued_credentials` whose `credential_id` (or row id) matches. The
   * document itself lives in `credential_data`, so the type and what the record says come from
   * there, and the standing comes from `revoked`. A reference that is only an inbox row
   * (`wallet_pending_offers.id`) counts once the person has accepted it and the organisation has
   * not withdrawn it; an offer nobody accepted yet is not a record. Anything else was not issued
   * here.
   */
  public checkRecord(reference: string): RecordCheck {
    const ref = String(reference || '').trim()
    const checkedAt = new Date().toISOString()
    const none: RecordCheck = { reference: ref, vcType: 'Unknown', status: 'not_found', checkedAt }
    if (!ref) return none
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT credential_id, credential_data, issued_at, revoked, revocation_reason
           FROM issued_credentials WHERE credential_id = ? OR id = ? LIMIT 1`,
      )
      .get(ref, ref) as
      | {
          credential_id: string
          credential_data: string
          issued_at: string | null
          revoked: number
          revocation_reason: string | null
        }
      | undefined
    if (row) {
      const doc = this.parseRecordDocument(row.credential_data)
      const expiresAt = doc.expirationDate
      const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now())
      return {
        reference: ref,
        vcType: doc.vcType,
        status: row.revoked ? 'revoked' : expired ? 'expired' : 'valid',
        reason: row.revoked ? row.revocation_reason || undefined : undefined,
        issuerName: this.issued.organizationNameForCredentialId(row.credential_id),
        issuedAt: sqliteUtc(row.issued_at),
        expiresAt: expired ? expiresAt : undefined,
        claims: doc.claims,
        checkedAt,
      }
    }
    const offer = db
      .prepare(
        `SELECT credential_type, metadata, accepted_at, last_error, o.name AS org_name
           FROM wallet_pending_offers w
           LEFT JOIN organizations o ON o.tenant_id = w.issuer_tenant_id
          WHERE w.id = ? LIMIT 1`,
      )
      .get(ref) as
      | {
          credential_type: string | null
          metadata: string | null
          accepted_at: string | null
          last_error: string | null
          org_name: string | null
        }
      | undefined
    if (offer?.accepted_at && !/^withdrawn:/i.test(String(offer.last_error || ''))) {
      return {
        reference: ref,
        vcType: offer.credential_type || 'Unknown',
        status: 'valid',
        issuerName: offer.org_name || undefined,
        issuedAt: sqliteUtc(offer.accepted_at),
        claims: this.parseClaims(offer.metadata),
        checkedAt,
      }
    }
    if (offer && /^withdrawn:/i.test(String(offer.last_error || ''))) {
      return {
        reference: ref,
        vcType: offer.credential_type || 'Unknown',
        status: 'revoked',
        reason: String(offer.last_error).replace(/^withdrawn:\s*/i, '') || undefined,
        issuerName: offer.org_name || undefined,
        claims: this.parseClaims(offer.metadata),
        checkedAt,
      }
    }
    return none
  }

  /** Type and subject out of a stored credential document; never throws on bad JSON. */
  private parseRecordDocument(raw: string | null): {
    vcType: string
    claims: Record<string, unknown>
    expirationDate?: string
  } {
    try {
      const doc = JSON.parse(String(raw || '{}'))
      const types = Array.isArray(doc?.type) ? doc.type.map(String) : []
      const vcType = types.filter((type: string) => type !== 'VerifiableCredential').pop() || 'VerifiableCredential'
      const subject = doc?.credentialSubject
      const claims = subject && typeof subject === 'object' ? (subject as Record<string, unknown>) : {}
      const expirationDate = typeof doc?.expirationDate === 'string' ? doc.expirationDate : undefined
      return { vcType, claims, expirationDate }
    } catch {
      return { vcType: 'VerifiableCredential', claims: {} }
    }
  }

  private parseClaims(raw: string | null): Record<string, unknown> {
    try {
      const parsed = JSON.parse(String(raw || '{}'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** Whether this platform recorded issuing the credential (required before trusting its status). */
  public isIssuedHere(credentialId: string): boolean {
    return Boolean(this.issued.findByCredentialId(credentialId))
  }

  /** Whether the issuer ended this card, and why (a replacement, leaving, a role change). */
  public revocationOf(credentialId: string | undefined | null): { revoked: boolean; reason?: string } {
    if (!credentialId) return { revoked: false }
    const row = this.issued.findByCredentialId(credentialId)
    if (!row?.revoked) return { revoked: false }
    return { revoked: true, reason: row.revocationReason }
  }

  /**
   * Whether a card the person holds has been ended, for the wallet listing. The register is the
   * first word. Cards issued before the register existed (no `issued_credentials` row, often no
   * `id`/`jti` at all) are matched to the inbox row that delivered them instead: a staff card
   * pairs with the accepted `org_employee` row for the same organisation whose `accepted_at` is
   * closest to the moment the card landed in the wallet. That row says "withdrawn: …" when the
   * organisation ended the card, and a newer accepted row for the same membership means this one
   * was replaced (only one staff card is valid per membership).
   */
  public heldCardLife(input: {
    walletTenantId: string
    credentialId?: string | null
    types: string[]
    claims: Record<string, unknown>
    createdAt?: string | Date | null
  }): { revoked: boolean; reason?: string; legacy?: boolean } {
    if (input.credentialId) {
      const fromRegister = this.revocationOf(input.credentialId)
      if (fromRegister.revoked) return fromRegister
      if (this.issued.findByCredentialId(input.credentialId)) return { revoked: false }
    }
    // From here on the card has no registered identity; whatever is decided is `legacy`.
    if (!input.types.includes('EmployeeCredential')) return { revoked: false }
    const orgTenantId = String(input.claims?.orgTenantId || '').trim()
    const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN
    if (!orgTenantId || !Number.isFinite(createdMs)) return { revoked: false }
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, source_id, accepted_at, last_error FROM wallet_pending_offers
         WHERE tenant_id = ? AND source_type = ? AND source_id LIKE ? AND accepted_at IS NOT NULL
         ORDER BY datetime(accepted_at) ASC`,
      )
      .all(input.walletTenantId, EMPLOYEE_OFFER_SOURCE_TYPE, `${orgTenantId}:%`) as Array<{
      id: string
      source_id: string
      accepted_at: string
      last_error: string | null
    }>
    if (rows.length === 0) return { revoked: false }
    // Accepting a card and storing it happen within the same request; pair by nearest time.
    const MATCH_WINDOW_MS = 2 * 60 * 1000
    let mine: (typeof rows)[number] | undefined
    let best = Number.POSITIVE_INFINITY
    for (const row of rows) {
      const gap = Math.abs(new Date(row.accepted_at).getTime() - createdMs)
      if (gap < best && gap <= MATCH_WINDOW_MS) {
        best = gap
        mine = row
      }
    }
    if (!mine) return { revoked: false }
    const note = String(mine.last_error || '')
    if (/^withdrawn:/i.test(note)) {
      return { revoked: true, legacy: true, reason: note.replace(/^withdrawn:\s*/i, '') || 'withdrawn' }
    }
    const newer = rows.some(
      (row) =>
        row.source_id === mine!.source_id &&
        new Date(row.accepted_at).getTime() > new Date(mine!.accepted_at).getTime(),
    )
    return newer ? { revoked: true, legacy: true, reason: 'replaced by a newer staff card' } : { revoked: false }
  }

  /**
   * One-time sweep for memberships that accepted more than one staff card before the
   * "accepting a new card withdraws the earlier ones" rule existed: keep the newest accepted
   * card per (wallet, organisation, person), withdraw the rest. Idempotent; safe on every start.
   */
  public withdrawSupersededStaffCards(): number {
    const groups = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id, source_id, COUNT(*) AS n FROM wallet_pending_offers
         WHERE source_type = ? AND accepted_at IS NOT NULL
           AND (last_error IS NULL OR last_error NOT LIKE 'withdrawn:%')
         GROUP BY tenant_id, source_id HAVING n > 1`,
      )
      .all(EMPLOYEE_OFFER_SOURCE_TYPE) as Array<{ tenant_id: string; source_id: string; n: number }>
    let total = 0
    for (const group of groups) {
      const [orgTenantId, userId] = String(group.source_id || '').split(':')
      if (!orgTenantId || !userId) continue
      const [newest] = this.acceptedStaffCards(group.tenant_id, orgTenantId, userId)
      if (!newest) continue
      total += this.revokeStaffCards({
        walletTenantId: group.tenant_id,
        orgTenantId,
        userId,
        keepRowId: newest.rowId,
        reason: 'replaced by a newer staff card',
      })
    }
    if (total > 0) logger.info({ total, memberships: groups.length }, 'Superseded staff cards withdrawn')
    return total
  }

  /** Withdraw one card: status-list bit plus the issued row. */
  public revoke(credentialId: string, reason: string): boolean {
    let changed = false
    try {
      changed = statusListAllocatorService.setStatusByCredentialRef(credentialId, 'revoked') || changed
    } catch (error: any) {
      logger.warn({ error: error?.message, credentialId }, 'Status list update failed while withdrawing a card')
    }
    changed = this.issued.revoke(credentialId, reason) || changed
    if (changed) logger.info({ credentialId, reason }, 'Card withdrawn')
    return changed
  }

  /** Withdraw the card behind an issuance session / inbox offer id. */
  public revokeByOfferId(offerId: string, reason: string): boolean {
    const row = this.issued.findById(offerId)
    if (!row) return false
    return this.revoke(row.credentialId, reason)
  }

  /**
   * Staff cards this person accepted from one organisation, newest first, with the scope each
   * card proves (role and steps) read from the inbox row that delivered it.
   */
  public acceptedStaffCards(
    walletTenantId: string,
    orgTenantId: string,
    userId: string,
  ): Array<{ rowId: string; offerId?: string; scope: StaffCardScope; acceptedAt: string }> {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, metadata, accepted_at FROM wallet_pending_offers
         WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND accepted_at IS NOT NULL
           AND (last_error IS NULL OR last_error NOT LIKE 'withdrawn:%')
         ORDER BY datetime(accepted_at) DESC`,
      )
      .all(walletTenantId, EMPLOYEE_OFFER_SOURCE_TYPE, `${orgTenantId}:${userId}`) as Array<{
      id: string
      metadata: string | null
      accepted_at: string
    }>
    return rows.map((row) => {
      let meta: Record<string, any> = {}
      try {
        meta = JSON.parse(row.metadata || '{}')
      } catch {
        meta = {}
      }
      const stageActions = Array.isArray(meta.stageActions)
        ? meta.stageActions.map((item: unknown) => String(item).trim().toLowerCase()).filter(Boolean)
        : []
      return {
        rowId: row.id,
        offerId: typeof meta.offerId === 'string' ? meta.offerId : undefined,
        scope: { role: String(meta.role || meta.memberRole || '').toLowerCase(), stageActions },
        acceptedAt: row.accepted_at,
      }
    })
  }

  /**
   * Withdraw the staff cards a person accepted from one organisation. `keepRowId` leaves the
   * card that was just accepted in place. Returns how many cards were withdrawn.
   */
  public revokeStaffCards(params: {
    walletTenantId: string
    orgTenantId: string
    userId: string
    reason: string
    keepRowId?: string
    /** Only withdraw cards whose scope fails this test (used by the stop_when_narrower rule). */
    onlyWhen?: (scope: StaffCardScope) => boolean
  }): number {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    let count = 0
    for (const card of this.acceptedStaffCards(params.walletTenantId, params.orgTenantId, params.userId)) {
      if (params.keepRowId && card.rowId === params.keepRowId) continue
      if (params.onlyWhen && !params.onlyWhen(card.scope)) continue
      if (card.offerId) this.revokeByOfferId(card.offerId, params.reason)
      db.prepare(`UPDATE wallet_pending_offers SET last_error = @note, last_attempt_at = @now WHERE id = @id`).run({
        id: card.rowId,
        note: `withdrawn: ${params.reason}`,
        now,
      })
      count += 1
      // The person's own log: "<organisation> withdrew your staff card" and why.
      import('./HolderActivityService')
        .then(({ holderActivityService }) =>
          holderActivityService.record({
            walletTenantId: params.walletTenantId,
            kind: 'card_withdrawn',
            outcome: 'withdrawn',
            orgTenantId: params.orgTenantId,
            requestedTypes: ['EmployeeCredential'],
            requestedClaims: card.scope.stageActions.length ? ['stageActions', 'role'] : [],
            reason: params.reason,
            sourceId: card.rowId,
            occurredAt: now,
          }),
        )
        .catch(() => undefined)
    }
    if (count > 0) logger.info({ ...params, onlyWhen: undefined, count }, 'Staff cards withdrawn')
    return count
  }

  /**
   * Apply the organisation's staff-card rule after a new card was offered because the role or
   * steps changed. Returns what was done so the inbox copy can say it.
   */
  public applyStaffCardChangeRule(params: {
    walletTenantId: string
    orgTenantId: string
    userId: string
    rule: 'stop_when_narrower' | 'stop_now'
    next: StaffCardScope
    reason: string
  }): 'withdrawn_now' | 'kept_until_accepted' | 'nothing_to_withdraw' {
    const cards = this.acceptedStaffCards(params.walletTenantId, params.orgTenantId, params.userId)
    if (cards.length === 0) return 'nothing_to_withdraw'
    const nextSteps = new Set(params.next.stageActions.map((step) => step.toLowerCase()))
    // Fewer steps, or a card that opened the organisation when the new role does not.
    const losesOrgAccess = (scope: StaffCardScope) =>
      employeeOrgAccessForRole(scope.role) === 'manage' && employeeOrgAccessForRole(params.next.role) !== 'manage'
    const narrower = (scope: StaffCardScope) =>
      losesOrgAccess(scope) || scope.stageActions.some((step) => !nextSteps.has(step))
    const withdrawn =
      params.rule === 'stop_now'
        ? this.revokeStaffCards({ ...params, reason: params.reason })
        : this.revokeStaffCards({ ...params, reason: params.reason, onlyWhen: narrower })
    return withdrawn > 0 ? 'withdrawn_now' : 'kept_until_accepted'
  }
}

export const credentialLifecycleService = new CredentialLifecycleService()

/**
 * What each team member still has to do before they can act for the organization,
 * in the words the team list uses: has the app, identity card, and one staff card.
 * The staff card carries their role and every step they confirm.
 *
 * Reads `wallet_pending_offers` (what was sent, whether it was accepted, and the claims on the
 * accepted card). Accepted cards sit in the person's Credo wallet, so the accepted offer row is
 * the record of what they hold; the legacy `wallet_credentials` table is only a first look.
 * Nothing here authorizes a step;
 * the stage proofs still do that. This only tells the owner who is ready and who to nudge.
 */

import { EMPLOYEE_OFFER_SOURCE_TYPE, EMPLOYEE_VC_TYPE } from '../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getWalletCredentialsByWalletId } from '../persistence/WalletCredentialRepository'
import { rootLogger } from '../utils/pinoLogger'

import { PLATFORM_IDENTITY_OFFER_SOURCE_TYPE, orgMembershipCredentialService } from './OrgMembershipCredentialService'
import { describeStageForPeople, orgWorkflowActorCredentialService } from './OrgWorkflowActorCredentialService'

const logger = rootLogger.child({ module: 'OrgMemberOnboardingService' })
const staffCardRefreshStarted = new Set<string>()

/** accepted: in their app · waiting: sent, not yet accepted · expired: sent, can no longer be accepted · not_sent */
export type MemberCardState = 'accepted' | 'waiting' | 'expired' | 'not_sent'

export type MemberCardKind = 'identity' | 'employee' | 'role'

export interface MemberCard {
  kind: MemberCardKind
  /** Plain label: "Identity card", "Staff card". */
  label: string
  state: MemberCardState
  workflowType?: string
  /** Steps on the staff card, in plain words: "signing off", "releasing payment". */
  covers?: string[]
  sentAt?: string
  acceptedAt?: string
}

export type MemberOnboardingSummary = 'ready' | 'waiting' | 'needs_cards' | 'no_app'

export interface OrgMemberOnboarding {
  userId: string
  role: string
  status: string
  createdAt: string
  displayName?: string
  phone?: string
  /** They have signed in to the app at least once (a wallet exists for them). */
  hasApp: boolean
  cards: MemberCard[]
  summary: MemberOnboardingSummary
  /** One line the owner can act on. */
  nextStep: string
}

export type SendMemberCardsKind = MemberCardKind | 'all'

export interface SendMemberCardsResult {
  sent: MemberCardKind[]
  alreadyHeld: MemberCardKind[]
  skipped: Array<{ kind: MemberCardKind; reason: string }>
  member: OrgMemberOnboarding
}

interface OfferRow {
  created_at: string | null
  accepted_at: string | null
  resolved_at: string | null
  metadata: string | null
  last_error?: string | null
}

/** An accepted card the organisation has since withdrawn (role change, leaving, sent again). */
function isWithdrawn(row: OfferRow): boolean {
  return String(row.last_error || '').startsWith('withdrawn:')
}

function parseMeta(raw: string | null): Record<string, any> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function stateFromRows(rows: OfferRow[]): { state: MemberCardState; sentAt?: string; acceptedAt?: string } {
  const accepted = rows.find((row) => row.accepted_at && !isWithdrawn(row))
  const pending = rows.find((row) => !row.resolved_at && !row.accepted_at)
  if (pending) return { state: 'waiting', sentAt: pending.created_at || undefined }
  if (accepted)
    return {
      state: 'accepted',
      sentAt: accepted.created_at || undefined,
      acceptedAt: accepted.accepted_at || undefined,
    }
  if (rows.length > 0) return { state: 'expired', sentAt: rows[0].created_at || undefined }
  return { state: 'not_sent' }
}

export class OrgMemberOnboardingService {
  private offersFor(walletTenantId: string, sourceType: string, sourceId?: string): OfferRow[] {
    try {
      const db = DatabaseManager.getDatabase()
      if (sourceId) {
        return db
          .prepare(
            `SELECT created_at, accepted_at, resolved_at, metadata, last_error FROM wallet_pending_offers
             WHERE tenant_id = ? AND source_type = ? AND source_id = ?
             ORDER BY datetime(created_at) DESC LIMIT 20`,
          )
          .all(walletTenantId, sourceType, sourceId) as OfferRow[]
      }
      return db
        .prepare(
          `SELECT created_at, accepted_at, resolved_at, metadata, last_error FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ?
           ORDER BY datetime(created_at) DESC LIMIT 20`,
        )
        .all(walletTenantId, sourceType) as OfferRow[]
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'wallet_pending_offers unavailable')
      return []
    }
  }

  /** Credentials of a type the person holds in their app, optionally for one organization. */
  private holds(
    walletTenantId: string,
    vcType: string,
    orgTenantId?: string,
    predicate?: (subject: Record<string, any>) => boolean,
  ): boolean {
    try {
      for (const cred of getWalletCredentialsByWalletId(walletTenantId)) {
        if (!String(cred.type || '').includes(vcType)) continue
        if (!orgTenantId && !predicate) return true
        const parsed = parseMeta(cred.credentialData)
        const subject = parsed?.credentialSubject || parsed?.vc?.credentialSubject || {}
        const claims =
          subject?.claims && typeof subject.claims === 'object' ? { ...subject, ...subject.claims } : subject
        if (orgTenantId && String(claims?.orgTenantId || '') !== orgTenantId) continue
        if (predicate && !predicate(claims)) continue
        return true
      }
    } catch {
      // Best effort: fall back to the offer rows.
    }
    return false
  }

  private identityCard(walletTenantId: string): MemberCard {
    const held = this.holds(walletTenantId, PLATFORM_IDENTITY_VC_TYPE)
    const rows = this.offersFor(walletTenantId, PLATFORM_IDENTITY_OFFER_SOURCE_TYPE)
    const fromRows = stateFromRows(rows)
    // Identity is usually accepted during sign-up with no inbox row at all.
    const state: MemberCardState = held ? 'accepted' : rows.length === 0 ? 'accepted' : fromRows.state
    return { kind: 'identity', label: 'Identity card', state, sentAt: fromRows.sentAt, acceptedAt: fromRows.acceptedAt }
  }

  private employeeCard(orgTenantId: string, userId: string, role: string, walletTenantId: string): MemberCard {
    const rows = this.offersFor(walletTenantId, EMPLOYEE_OFFER_SOURCE_TYPE, `${orgTenantId}:${userId}`)
    const fromRows = stateFromRows(rows)
    const covers = orgWorkflowActorCredentialService.coveredStageActionsForMember(orgTenantId, userId)
    const wanted = [...covers].sort().join(',')
    const matchesCurrent = (claims: Record<string, any>): boolean => {
      const roleOk = String(claims?.memberRole || claims?.role || '').toLowerCase() === String(role || '').toLowerCase()
      if (!roleOk) return false
      const claimed = Array.isArray(claims?.stageActions)
        ? claims.stageActions
            .map((item: unknown) => String(item).trim().toLowerCase())
            .filter(Boolean)
            .sort()
        : []
      return claimed.join(',') === wanted
    }
    // Accepted cards live in the person's Credo wallet, not in the legacy table, so the offer
    // row they accepted (its metadata is the claims that were issued) is what tells us what they hold.
    const heldInTable = this.holds(walletTenantId, EMPLOYEE_VC_TYPE, orgTenantId, matchesCurrent)
    const heldViaAcceptedOffer = rows.some(
      (row) => Boolean(row.accepted_at) && !isWithdrawn(row) && matchesCurrent(parseMeta(row.metadata)),
    )
    const heldCurrent = heldInTable || heldViaAcceptedOffer
    // A card for an older role or an older set of steps does not count.
    let state: MemberCardState
    if (heldCurrent && fromRows.state !== 'waiting') state = 'accepted'
    else if (!heldCurrent && fromRows.state === 'accepted') state = 'expired'
    else state = fromRows.state
    return {
      kind: 'employee',
      label: 'Staff card',
      state,
      covers: covers.map(describeStageForPeople),
      sentAt: fromRows.sentAt,
      acceptedAt: fromRows.acceptedAt,
    }
  }

  private summarize(member: {
    displayName?: string
    phone?: string
    hasApp: boolean
    cards: MemberCard[]
    status: string
  }): {
    summary: MemberOnboardingSummary
    nextStep: string
  } {
    const who = member.displayName || 'They'
    if (!member.hasApp) {
      return {
        summary: 'no_app',
        nextStep: member.phone
          ? `${who} must sign in to the app with ${member.phone}. Their cards are sent after that.`
          : `${who} must sign in to the app first. Their cards are sent after that.`,
      }
    }
    const missing = member.cards.filter((card) => card.state !== 'accepted')
    if (missing.length === 0) return { summary: 'ready', nextStep: 'Ready. Everything they need is in their app.' }
    const expiredOrUnsent = missing.filter((card) => card.state === 'expired' || card.state === 'not_sent')
    if (expiredOrUnsent.length > 0) {
      const anyExpired = expiredOrUnsent.some((card) => card.state === 'expired')
      return {
        summary: 'needs_cards',
        nextStep: `${anyExpired ? 'Send again' : 'Send'}: ${expiredOrUnsent.map((card) => card.label.toLowerCase()).join(', ')}.`,
      }
    }
    return {
      summary: 'waiting',
      nextStep: `${who} still has to accept ${missing.length === 1 ? missing[0].label.toLowerCase() : `${missing.length} cards`} in the app inbox.`,
    }
  }

  public listForOrganization(orgTenantId: string): OrgMemberOnboarding[] {
    if (!staffCardRefreshStarted.has(orgTenantId)) {
      staffCardRefreshStarted.add(orgTenantId)
      orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'staff_card' })
    }
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `
        SELECT m.user_id as userId, m.role as role, m.status as status, m.created_at as createdAt,
               u.tenant_id as walletTenantId,
               (
                 SELECT c.name FROM org_contacts c
                 WHERE c.org_tenant_id = m.org_tenant_id AND c.wallet_tenant_id = u.tenant_id
                   AND c.name IS NOT NULL AND c.name != ''
                 ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END LIMIT 1
               ) as displayName,
               (
                 SELECT c.phone FROM org_contacts c
                 WHERE c.org_tenant_id = m.org_tenant_id AND c.wallet_tenant_id = u.tenant_id
                   AND c.phone IS NOT NULL AND c.phone != ''
                 ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END LIMIT 1
               ) as phone
        FROM org_memberships m
        LEFT JOIN ssi_users u ON u.id = m.user_id
        WHERE m.org_tenant_id = ? AND m.status IN ('active', 'invited')
        ORDER BY m.created_at ASC
      `,
      )
      .all(orgTenantId) as Array<{
      userId: string
      role: string
      status: string
      createdAt: string
      walletTenantId: string | null
      displayName: string | null
      phone: string | null
    }>

    return rows.map((row) => this.build(orgTenantId, row))
  }

  public getForMember(orgTenantId: string, userId: string): OrgMemberOnboarding | undefined {
    return this.listForOrganization(orgTenantId).find((member) => member.userId === userId)
  }

  private build(
    orgTenantId: string,
    row: {
      userId: string
      role: string
      status: string
      createdAt: string
      walletTenantId: string | null
      displayName: string | null
      phone: string | null
    },
  ): OrgMemberOnboarding {
    const walletTenantId = row.walletTenantId || undefined
    const displayName =
      row.displayName && !/^(team member|organization owner)$/i.test(row.displayName) ? row.displayName : undefined
    const cards: MemberCard[] = walletTenantId
      ? [this.identityCard(walletTenantId), this.employeeCard(orgTenantId, row.userId, row.role, walletTenantId)]
      : []
    const base = {
      userId: row.userId,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt,
      displayName,
      phone: row.phone || undefined,
      hasApp: Boolean(walletTenantId),
      cards,
    }
    return { ...base, ...this.summarize(base) }
  }

  /** The owner's "send again" button. Sends only what is not already in the person's app. */
  public async sendCards(
    orgTenantId: string,
    userId: string,
    kind: SendMemberCardsKind = 'all',
  ): Promise<SendMemberCardsResult> {
    const before = this.getForMember(orgTenantId, userId)
    if (!before) throw new Error('Not a member of this organization')
    const result: Omit<SendMemberCardsResult, 'member'> = { sent: [], alreadyHeld: [], skipped: [] }
    const wants = (card: MemberCardKind) => kind === 'all' || kind === card

    if (!before.hasApp) {
      for (const card of ['identity', 'employee', 'role'] as MemberCardKind[]) {
        if (wants(card)) result.skipped.push({ kind: card, reason: 'They have not signed in to the app yet.' })
      }
      return { ...result, member: before }
    }

    const walletTenantId = DatabaseManager.getDatabase()
      .prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE id = ? LIMIT 1')
      .get(userId) as { walletTenantId?: string } | undefined

    if (wants('identity')) {
      const identity = before.cards.find((card) => card.kind === 'identity')
      if (identity?.state === 'accepted') result.alreadyHeld.push('identity')
      else if (walletTenantId?.walletTenantId) {
        try {
          const { container } = await import('tsyringe')
          const { SSIAuthService } = await import('./SSIAuthService')
          const uri = await container
            .resolve(SSIAuthService)
            .reissuePlatformIdentityOffer(walletTenantId.walletTenantId, before.displayName)
          if (uri) result.sent.push('identity')
          else result.skipped.push({ kind: 'identity', reason: 'Could not prepare the identity card right now.' })
        } catch (error: any) {
          result.skipped.push({
            kind: 'identity',
            reason: error?.message || 'Could not prepare the identity card right now.',
          })
        }
      }
    }

    if (wants('employee')) {
      const employee = before.cards.find((card) => card.kind === 'employee')
      // "Send again" on an accepted card sends a fresh one; the card they hold stops working
      // once the new one is accepted. "Send everything missing" leaves an accepted card alone.
      if (employee?.state === 'accepted' && kind === 'all') result.alreadyHeld.push('employee')
      else {
        const outcome = await orgMembershipCredentialService.ensureEmployeeCredential({
          orgTenantId,
          userId,
          role: before.role,
          source: 'membership',
          displayName: before.displayName,
          force: true,
          replaceAccepted: employee?.state === 'accepted',
          reason: 'manual',
        })
        if (outcome.outcome === 'offered') result.sent.push('employee')
        else if (outcome.outcome === 'already_accepted') result.alreadyHeld.push('employee')
        else result.skipped.push({ kind: 'employee', reason: outcome.reason || outcome.outcome })
      }
    }

    if (wants('role') && !wants('employee')) {
      const employee = before.cards.find((card) => card.kind === 'employee')
      if (employee?.state === 'accepted') result.alreadyHeld.push('role')
      else {
        const outcome = await orgMembershipCredentialService.ensureEmployeeCredential({
          orgTenantId,
          userId,
          role: before.role,
          source: 'membership',
          displayName: before.displayName,
          force: true,
          reason: 'manual',
        })
        if (outcome.outcome === 'offered') result.sent.push('role')
        else if (outcome.outcome === 'already_accepted') result.alreadyHeld.push('role')
        else result.skipped.push({ kind: 'role', reason: outcome.reason || outcome.outcome })
      }
    }

    return { ...result, member: this.getForMember(orgTenantId, userId) || before }
  }
}

export const orgMemberOnboardingService = new OrgMemberOnboardingService()

/**
 * HolderActivityService — a person's own log of what happened with their cards.
 *
 * Who they shared a card with and for which step, which cards they were given, which cards
 * an organisation withdrew, and the shares they turned down. It is the holder-side twin of
 * the organisation's audit trail: the organisation keeps the job history, the person keeps
 * this. Rows are written once and never edited or deleted by a user (an honest log), and a
 * person can export their own rows.
 *
 * What a row keeps (and what it never keeps):
 *   - the organisation, the step, the job reference, the signed job line
 *   - the card types asked for, the claim NAMES asked for / shared / kept on the phone
 *   - the outcome and, when it failed, the plain reason
 *   - never a claim value, never presentation or credential material (handoff §30)
 *
 * This lines up with the EUDI wallet "transaction log" (ARF DASH_02/03/05: every share
 * including failed ones, relying party, attributes requested and shared, outcome) and with
 * the ISO/IEC TS 27560 consent-record idea of "purpose + what + who + when", in plain words.
 *
 * Writers (one per event, all through `record`):
 *   - StageProofService.presentFromEmbeddedWallet / WalletController.usePresentationRequest → `shared`
 *   - StageProofService.verifyStageProof → `share_verified` / `share_refused`
 *   - WalletController.recordDeclinedShare (phone cancel) → `share_declined`
 *   - WalletCredentialsController.acceptOffer → `card_received`
 *   - CredentialLifecycleService.revokeStaffCards → `card_withdrawn`
 *
 * Readers: GET /api/wallet/activity, /partners, /export (WalletController).
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { csvCell } from '../WorkflowAuditService'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ service: 'HolderActivityService' })

export type HolderActivityKind =
  | 'shared'
  | 'share_verified'
  | 'share_refused'
  | 'share_declined'
  | 'card_received'
  | 'card_withdrawn'

export type HolderActivityOutcome =
  | 'shared'
  | 'verified'
  | 'refused'
  | 'declined'
  | 'received'
  | 'replaced'
  | 'withdrawn'

export interface HolderActivityEntry {
  id: string
  walletTenantId: string
  kind: HolderActivityKind
  orgTenantId?: string
  orgName?: string
  purposeLabel?: string
  stageAction?: string
  workflowRunId?: string
  requestId?: string
  reference?: string
  requestedTypes: string[]
  requestedClaims: string[]
  sharedClaims: string[]
  withheldClaims: string[]
  signedLine?: string
  outcome: HolderActivityOutcome
  reason?: string
  sourceId?: string
  occurredAt: string
}

export interface RecordHolderActivityInput {
  walletTenantId: string
  kind: HolderActivityKind
  outcome: HolderActivityOutcome
  orgTenantId?: string
  orgName?: string
  purposeLabel?: string
  stageAction?: string
  workflowRunId?: string
  requestId?: string
  reference?: string
  requestedTypes?: string[]
  requestedClaims?: string[]
  sharedClaims?: string[]
  withheldClaims?: string[]
  signedLine?: string
  reason?: string
  /** Natural key: presentation request id, inbox offer id, credential id. Dedupes retries. */
  sourceId?: string
  occurredAt?: string
}

export interface HolderActivityPartner {
  orgTenantId: string
  orgName: string
  /** Latest card the organisation gave this person and whether it still stands. */
  cards: Array<{ type: string; stageActions: string[]; role?: string; receivedAt: string; withdrawn: boolean }>
  shareCount: number
  lastSharedAt?: string
  lastActivityAt: string
  /** The person is still a member (the organisation can still ask for a share). */
  member: boolean
}

export interface ListHolderActivityOptions {
  limit?: number
  /** `occurred_at|id` of the last row seen. */
  cursor?: string
  orgTenantId?: string
  kind?: HolderActivityKind | HolderActivityKind[]
}

interface Row {
  id: string
  wallet_tenant_id: string
  kind: string
  org_tenant_id: string | null
  org_name: string | null
  purpose_label: string | null
  stage_action: string | null
  workflow_run_id: string | null
  request_id: string | null
  reference: string | null
  requested_types_json: string | null
  requested_claims_json: string | null
  shared_claims_json: string | null
  withheld_claims_json: string | null
  signed_line: string | null
  outcome: string
  reason: string | null
  source_id: string | null
  occurred_at: string
}

/** Claim names only: registered JWT / SD-JWT envelope claims are not "details" the person shared. */
const ENVELOPE_CLAIMS = new Set([
  'iss',
  'sub',
  'iat',
  'nbf',
  'exp',
  'vct',
  'cnf',
  'status',
  '_sd',
  '_sd_alg',
  'jti',
  'aud',
  'nonce',
  'id',
])

export function claimNamesOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const subject = (value as any).credentialSubject ?? (value as any).claims ?? value
  const source = Array.isArray(subject) ? subject[0] : subject
  if (!source || typeof source !== 'object') return []
  return Object.keys(source)
    .filter((key) => !ENVELOPE_CLAIMS.has(key))
    .sort()
}

/**
 * Who gave a card, from the inbox row that delivered it. The identity card comes from the
 * platform itself, not an organisation, so it carries the platform name and no organisation id.
 */
export function cardIssuerOf(
  sourceType: string,
  issuerTenantId: string | null | undefined,
  meta: Record<string, any>,
): { orgTenantId?: string; orgName?: string } {
  if (sourceType === 'platform_identity') {
    return { orgTenantId: undefined, orgName: String(meta.platformName || 'Credentis').trim() || 'Credentis' }
  }
  return {
    orgTenantId: String(issuerTenantId || meta.orgTenantId || '').trim() || undefined,
    orgName: typeof meta.orgName === 'string' ? meta.orgName : undefined,
  }
}

function parseList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function uniqueStrings(values: unknown[] | undefined): string[] {
  const seen = new Set<string>()
  for (const value of values || []) {
    const text = String(value ?? '').trim()
    if (text) seen.add(text)
  }
  return [...seen]
}

function toEntry(row: Row): HolderActivityEntry {
  return {
    id: row.id,
    walletTenantId: row.wallet_tenant_id,
    kind: row.kind as HolderActivityKind,
    orgTenantId: row.org_tenant_id || undefined,
    orgName: row.org_name || undefined,
    purposeLabel: row.purpose_label || undefined,
    stageAction: row.stage_action || undefined,
    workflowRunId: row.workflow_run_id || undefined,
    requestId: row.request_id || undefined,
    reference: row.reference || undefined,
    requestedTypes: parseList(row.requested_types_json),
    requestedClaims: parseList(row.requested_claims_json),
    sharedClaims: parseList(row.shared_claims_json),
    withheldClaims: parseList(row.withheld_claims_json),
    signedLine: row.signed_line || undefined,
    outcome: row.outcome as HolderActivityOutcome,
    reason: row.reason || undefined,
    sourceId: row.source_id || undefined,
    occurredAt: row.occurred_at,
  }
}

export class HolderActivityService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  /** The organisation's display name; empty when the tenant is unknown. */
  orgNameOf(orgTenantId: string | undefined | null): string | undefined {
    const id = String(orgTenantId || '').trim()
    if (!id) return undefined
    const row = this.db.prepare('SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1').get(id) as
      | { name?: string }
      | undefined
    return row?.name || undefined
  }

  /** Wallet a user id signs in to (`ssi_users.tenant_id`). */
  walletOfUser(userId: string | undefined | null): string | undefined {
    const id = String(userId || '').trim()
    if (!id) return undefined
    const row = this.db.prepare('SELECT tenant_id FROM ssi_users WHERE id = ? LIMIT 1').get(id) as
      | { tenant_id?: string }
      | undefined
    return row?.tenant_id || undefined
  }

  /** Wallet behind a holder DID, when the DID is the person's own (not the shared platform key). */
  walletOfHolderDid(holderDid: string | undefined | null): string | undefined {
    const did = String(holderDid || '').trim()
    if (!did || did === 'did:unknown:holder') return undefined
    const rows = this.db.prepare('SELECT tenant_id FROM ssi_users WHERE did = ? LIMIT 2').all(did) as Array<{
      tenant_id?: string
    }>
    // Several people behind one DID means the shared platform key: it names nobody.
    return rows.length === 1 ? rows[0].tenant_id || undefined : undefined
  }

  /** Job reference (FR-…, PO-…) the person recognises, from the run input. */
  referenceOfRun(workflowRunId: string | undefined | null): string | undefined {
    const id = String(workflowRunId || '').trim()
    if (!id) return undefined
    const row = this.db.prepare('SELECT input FROM workflow_runs WHERE id = ? LIMIT 1').get(id) as
      | { input?: string }
      | undefined
    if (!row?.input) return undefined
    try {
      const input = JSON.parse(row.input)
      const reference = String(input?.reference || input?.poNumber || '').trim()
      return reference || undefined
    } catch {
      return undefined
    }
  }

  /** Write one row. Never throws: a log failure must not stop the step it describes. */
  record(input: RecordHolderActivityInput): HolderActivityEntry | undefined {
    const walletTenantId = String(input.walletTenantId || '').trim()
    if (!walletTenantId) return undefined
    const occurredAt = input.occurredAt || new Date().toISOString()
    const orgTenantId = String(input.orgTenantId || '').trim() || null
    const entry = {
      id: randomUUID(),
      wallet_tenant_id: walletTenantId,
      kind: input.kind,
      org_tenant_id: orgTenantId,
      org_name: String(input.orgName || '').trim() || (orgTenantId ? this.orgNameOf(orgTenantId) : undefined) || null,
      purpose_label: String(input.purposeLabel || '').trim() || null,
      stage_action:
        String(input.stageAction || '')
          .trim()
          .toLowerCase() || null,
      workflow_run_id: String(input.workflowRunId || '').trim() || null,
      request_id: String(input.requestId || '').trim() || null,
      reference: String(input.reference || '').trim() || this.referenceOfRun(input.workflowRunId) || null,
      requested_types_json: JSON.stringify(uniqueStrings(input.requestedTypes)),
      requested_claims_json: JSON.stringify(uniqueStrings(input.requestedClaims)),
      shared_claims_json: JSON.stringify(uniqueStrings(input.sharedClaims)),
      withheld_claims_json: JSON.stringify(uniqueStrings(input.withheldClaims)),
      signed_line: String(input.signedLine || '').trim() || null,
      outcome: input.outcome,
      reason: String(input.reason || '').trim() || null,
      source_id: String(input.sourceId || '').trim() || null,
      occurred_at: occurredAt,
    }
    try {
      // A retry of the same share / accept writes nothing new.
      const result = this.db
        .prepare(
          `INSERT OR IGNORE INTO holder_activity (
             id, wallet_tenant_id, kind, org_tenant_id, org_name, purpose_label, stage_action,
             workflow_run_id, request_id, reference, requested_types_json, requested_claims_json,
             shared_claims_json, withheld_claims_json, signed_line, outcome, reason, source_id, occurred_at
           ) VALUES (
             @id, @wallet_tenant_id, @kind, @org_tenant_id, @org_name, @purpose_label, @stage_action,
             @workflow_run_id, @request_id, @reference, @requested_types_json, @requested_claims_json,
             @shared_claims_json, @withheld_claims_json, @signed_line, @outcome, @reason, @source_id, @occurred_at
           )`,
        )
        .run(entry)
      if (result.changes === 0) return undefined
      return toEntry({ ...entry } as Row)
    } catch (error: any) {
      logger.warn({ error: error?.message, kind: input.kind, walletTenantId }, 'Could not write personal activity row')
      return undefined
    }
  }

  /** The `shared` row for a presentation request, so the verifier outcome lands in the same wallet. */
  findSharedByRequestId(requestId: string | undefined | null): HolderActivityEntry | undefined {
    const id = String(requestId || '').trim()
    if (!id) return undefined
    const row = this.db
      .prepare(
        `SELECT * FROM holder_activity WHERE request_id = ? AND kind = 'shared'
         ORDER BY datetime(occurred_at) DESC LIMIT 1`,
      )
      .get(id) as Row | undefined
    return row ? toEntry(row) : undefined
  }

  /**
   * The verifier finished with a share. The wallet is the one that answered the request; for an
   * external wallet we fall back to the holder DID. Unknown wallet → nothing to log for a person.
   */
  recordShareOutcome(input: {
    requestId: string
    orgTenantId: string
    stageAction?: string
    workflowRunId?: string
    holderDid?: string
    presentedTypes?: string[]
    outcome: 'verified' | 'refused'
    reason?: string
  }): HolderActivityEntry | undefined {
    const shared = this.findSharedByRequestId(input.requestId)
    const walletTenantId = shared?.walletTenantId || this.walletOfHolderDid(input.holderDid)
    if (!walletTenantId) return undefined
    return this.record({
      walletTenantId,
      kind: input.outcome === 'verified' ? 'share_verified' : 'share_refused',
      outcome: input.outcome,
      orgTenantId: input.orgTenantId || shared?.orgTenantId,
      orgName: shared?.orgName,
      purposeLabel: shared?.purposeLabel,
      stageAction: input.stageAction || shared?.stageAction,
      workflowRunId: input.workflowRunId || shared?.workflowRunId,
      requestId: input.requestId,
      reference: shared?.reference,
      requestedTypes: shared?.requestedTypes?.length ? shared.requestedTypes : input.presentedTypes,
      requestedClaims: shared?.requestedClaims,
      sharedClaims: shared?.sharedClaims,
      withheldClaims: shared?.withheldClaims,
      signedLine: shared?.signedLine,
      reason: input.reason,
      sourceId: `${input.requestId}:${input.outcome}`,
    })
  }

  list(
    walletTenantId: string,
    options: ListHolderActivityOptions = {},
  ): { items: HolderActivityEntry[]; nextCursor?: string; total: number } {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 200)
    const where: string[] = ['wallet_tenant_id = @walletTenantId']
    const params: Record<string, unknown> = { walletTenantId }
    if (options.orgTenantId) {
      where.push('org_tenant_id = @orgTenantId')
      params.orgTenantId = options.orgTenantId
    }
    const kinds = Array.isArray(options.kind) ? options.kind : options.kind ? [options.kind] : []
    if (kinds.length > 0) {
      where.push(`kind IN (${kinds.map((_, index) => `@kind${index}`).join(', ')})`)
      kinds.forEach((kind, index) => {
        params[`kind${index}`] = kind
      })
    }
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM holder_activity WHERE ${where.join(' AND ')}`).get(params) as {
        count: number
      }
    ).count
    if (options.cursor) {
      const [occurredAt, id] = String(options.cursor).split('|')
      if (occurredAt) {
        where.push('(occurred_at < @cursorAt OR (occurred_at = @cursorAt AND id < @cursorId))')
        params.cursorAt = occurredAt
        params.cursorId = id || ''
      }
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM holder_activity WHERE ${where.join(' AND ')}
         ORDER BY occurred_at DESC, id DESC LIMIT @limit`,
      )
      .all({ ...params, limit: limit + 1 }) as Row[]
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]
    return {
      items: page.map(toEntry),
      nextCursor: rows.length > limit && last ? `${last.occurred_at}|${last.id}` : undefined,
      total,
    }
  }

  /** Organisations that hold a card of this person or were shared one, with what each card lets them check. */
  partners(walletTenantId: string): HolderActivityPartner[] {
    const rows = this.db
      .prepare(
        `SELECT org_tenant_id, org_name, kind, outcome, occurred_at, requested_types_json, requested_claims_json, reason
           FROM holder_activity
          WHERE wallet_tenant_id = ? AND org_tenant_id IS NOT NULL
          ORDER BY occurred_at ASC`,
      )
      .all(walletTenantId) as Row[]
    const byOrg = new Map<string, HolderActivityPartner>()
    for (const row of rows) {
      const orgTenantId = String(row.org_tenant_id || '').trim()
      if (!orgTenantId) continue
      const partner = byOrg.get(orgTenantId) || {
        orgTenantId,
        orgName: row.org_name || this.orgNameOf(orgTenantId) || 'An organisation',
        cards: [],
        shareCount: 0,
        lastActivityAt: row.occurred_at,
        member: false,
      }
      partner.lastActivityAt = row.occurred_at
      if (row.org_name && partner.orgName === 'An organisation') partner.orgName = row.org_name
      if (row.kind === 'shared') {
        partner.shareCount += 1
        partner.lastSharedAt = row.occurred_at
      }
      byOrg.set(orgTenantId, partner)
    }
    // Cards still standing come from the inbox rows the person accepted, scope included.
    const userRow = this.db.prepare('SELECT id FROM ssi_users WHERE tenant_id = ? LIMIT 1').get(walletTenantId) as
      | { id?: string }
      | undefined
    const cardRows = this.db
      .prepare(
        `SELECT issuer_tenant_id, credential_type, accepted_at, last_error, metadata
           FROM wallet_pending_offers
          WHERE tenant_id = ? AND accepted_at IS NOT NULL AND credential_type IS NOT NULL
            AND source_type IN ('org_employee', 'org_workflow_actor')
          ORDER BY datetime(accepted_at) DESC`,
      )
      .all(walletTenantId) as Array<{
      issuer_tenant_id: string | null
      credential_type: string
      accepted_at: string
      last_error: string | null
      metadata: string | null
    }>
    for (const card of cardRows) {
      let meta: Record<string, any> = {}
      try {
        meta = JSON.parse(card.metadata || '{}')
      } catch {
        meta = {}
      }
      const orgTenantId = String(card.issuer_tenant_id || meta.orgTenantId || '').trim()
      if (!orgTenantId) continue
      const partner = byOrg.get(orgTenantId) || {
        orgTenantId,
        orgName: String(meta.orgName || '') || this.orgNameOf(orgTenantId) || 'An organisation',
        cards: [],
        shareCount: 0,
        lastActivityAt: card.accepted_at,
        member: false,
      }
      partner.cards.push({
        type: card.credential_type,
        stageActions: Array.isArray(meta.stageActions) ? meta.stageActions.map((item: unknown) => String(item)) : [],
        role:
          typeof meta.role === 'string' ? meta.role : typeof meta.memberRole === 'string' ? meta.memberRole : undefined,
        receivedAt: card.accepted_at,
        withdrawn: /^withdrawn:/i.test(String(card.last_error || '')),
      })
      byOrg.set(orgTenantId, partner)
    }
    if (userRow?.id) {
      const memberships = this.db
        .prepare(`SELECT org_tenant_id FROM org_memberships WHERE user_id = ? AND status = 'active'`)
        .all(userRow.id) as Array<{ org_tenant_id: string }>
      for (const membership of memberships) {
        const partner = byOrg.get(membership.org_tenant_id)
        if (partner) partner.member = true
      }
    }
    return [...byOrg.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  }

  /** CSV of a person's rows, plain column names, newest first. */
  toCsv(items: HolderActivityEntry[]): string {
    const header = [
      'Date and time',
      'What happened',
      'Organisation',
      'Step',
      'Job or request',
      'Cards asked for',
      'Details asked for',
      'Details shared',
      'Details kept on your phone',
      'Signed line',
      'Outcome',
      'Reason',
      'Reference',
    ]
    const lines = items.map((item) => [
      item.occurredAt,
      item.kind,
      item.orgName || '',
      item.purposeLabel || item.stageAction || '',
      item.reference || item.workflowRunId || '',
      item.requestedTypes.join('; '),
      item.requestedClaims.join('; '),
      item.sharedClaims.join('; '),
      item.withheldClaims.join('; '),
      item.signedLine || '',
      item.outcome,
      item.reason || '',
      item.requestId || item.sourceId || '',
    ])
    return [header, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\n')
  }

  /**
   * One-time fill from what the server already knew before this log existed:
   *   - cards accepted from the inbox → `card_received`
   *   - field-job sign-off / payout shares stamped on runs (`output.ack.presentationId`,
   *     `output.payment.presentationId`) → `shared` + `share_verified`, the person taken from the
   *     stage history entry that moved the job.
   * Safe to run on every start: the source id makes each row write once.
   */
  backfill(): { cards: number; shares: number } {
    let cards = 0
    let shares = 0
    try {
      const offers = this.db
        .prepare(
          `SELECT id, tenant_id, source_type, issuer_tenant_id, credential_type, accepted_at, metadata, workflow_run_id
             FROM wallet_pending_offers
            WHERE accepted_at IS NOT NULL AND credential_type IS NOT NULL
              AND source_type IN ('org_employee', 'org_workflow_actor', 'workflow_vc_offer', 'platform_identity')
              AND NOT EXISTS (
                SELECT 1 FROM holder_activity h
                 WHERE h.wallet_tenant_id = wallet_pending_offers.tenant_id
                   AND h.kind = 'card_received' AND h.source_id = wallet_pending_offers.id
              )`,
        )
        .all() as Array<{
        id: string
        tenant_id: string
        source_type: string
        issuer_tenant_id: string | null
        credential_type: string
        accepted_at: string
        metadata: string | null
        workflow_run_id: string | null
      }>
      for (const offer of offers) {
        let meta: Record<string, any> = {}
        try {
          meta = JSON.parse(offer.metadata || '{}')
        } catch {
          meta = {}
        }
        const issuer = cardIssuerOf(offer.source_type, offer.issuer_tenant_id, meta)
        const written = this.record({
          walletTenantId: offer.tenant_id,
          kind: 'card_received',
          outcome: meta.replaces ? 'replaced' : 'received',
          orgTenantId: issuer.orgTenantId,
          orgName: issuer.orgName,
          workflowRunId: offer.workflow_run_id || undefined,
          reference: typeof meta.poNumber === 'string' ? meta.poNumber : undefined,
          requestedTypes: [offer.credential_type],
          requestedClaims: Array.isArray(meta.stageActions) ? ['stageActions', 'role', 'orgName'] : [],
          reason: typeof meta.replaces?.note === 'string' ? meta.replaces.note : undefined,
          sourceId: offer.id,
          occurredAt: offer.accepted_at,
        })
        if (written) cards += 1
      }
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Personal activity backfill (cards) failed')
    }
    try {
      const runs = this.db
        .prepare(`SELECT id, tenant_id, output FROM workflow_runs WHERE output LIKE '%presentationId%'`)
        .all() as Array<{ id: string; tenant_id: string; output: string | null }>
      const stamps: Array<{ key: 'ack' | 'payment'; stage: string; action: string; label: string }> = [
        { key: 'ack', stage: 'ACKNOWLEDGED', action: 'acknowledge_execution', label: 'Sign off this job' },
        { key: 'payment', stage: 'PAYMENT_TRIGGERED', action: 'trigger_payout', label: 'Release worker payout' },
      ]
      for (const run of runs) {
        let output: any = {}
        try {
          output = JSON.parse(run.output || '{}')
        } catch {
          continue
        }
        const history: Array<{ stage?: string; at?: string; by?: string }> = Array.isArray(output.stageHistory)
          ? output.stageHistory
          : []
        for (const stamp of stamps) {
          const presentationId = String(output?.[stamp.key]?.presentationId || '').trim()
          if (!presentationId) continue
          const moved = history.find((item) => item.stage === stamp.stage && item.by)
          const walletTenantId = this.walletOfUser(moved?.by)
          if (!walletTenantId) continue
          const reference = this.referenceOfRun(run.id)
          const occurredAt = moved?.at || new Date().toISOString()
          const base = {
            walletTenantId,
            orgTenantId: run.tenant_id,
            purposeLabel: [stamp.label, reference ? `Job ${reference}` : ''].filter(Boolean).join(' · '),
            stageAction: stamp.action,
            workflowRunId: run.id,
            requestId: presentationId,
            reference,
            // Which card answered was not kept before this log existed.
            requestedTypes: [] as string[],
          }
          const shared = this.record({
            ...base,
            kind: 'shared',
            outcome: 'shared',
            sourceId: presentationId,
            occurredAt,
          })
          const verified = this.record({
            ...base,
            kind: 'share_verified',
            outcome: 'verified',
            sourceId: `${presentationId}:verified`,
            occurredAt,
          })
          if (shared) shares += 1
          if (verified) shares += 1
        }
      }
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Personal activity backfill (shares) failed')
    }
    if (cards || shares) logger.info({ cards, shares }, 'Personal activity backfilled')
    return { cards, shares }
  }
}

export const holderActivityService = new HolderActivityService()

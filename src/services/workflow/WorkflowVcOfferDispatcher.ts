/**
 * IdenEx Credentis - Workflow VC Offer Dispatcher
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Resolves **who** should receive a VC offer for a given workflow stage,
 * creates the OIDC4VC pre-authorized offer via CredentialIssuanceService,
 * then writes a workflow_requests inbox row for the resolved actor so the
 * offer deep-link appears in their inbox.
 *
 * Design invariant (from TODO plan §10):
 *   SSI provides evidence and trust; the platform owns workflow state.
 *   Credential possession NEVER implies authorization — all authorization
 *   decisions are made by the platform, not the wallet.
 *
 * @module services/workflow/WorkflowVcOfferDispatcher
 * @copyright 2024-2026 IdenEx Credentis
 */

import crypto from 'crypto'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { workflowRepository } from '../../persistence/WorkflowRepository'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import { rootLogger } from '../../utils/pinoLogger'
import { OrgWorkflowActorService } from '../OrgWorkflowActorService'
import { credentialLifecycleService } from '../ssi/CredentialLifecycleService'

import { credentialOfferAllowed } from './actions/CredentialActions'

const logger = rootLogger.child({ module: 'WorkflowVcOfferDispatcher' })

export interface DispatchVcOfferParams {
  /** The org tenant that owns the workflow (issuer tenant). */
  orgTenantId: string
  /** The workflow type string (e.g. 'internal_requisitions', 'school_fees'). */
  workflowType: string
  /** The action name of the current step (e.g. 'credential.issue'). */
  stageAction: string
  /** The VC type to issue (e.g. 'RequisitionAcknowledgementVC'). */
  credentialType: string
  /** Claims to embed in the credential subject. */
  claims: Record<string, any>
  /** Optional reference (runId / requestId) for traceability stored in the inbox payload. */
  contextRef?: string
  /** Optional holder DID to bind the offer to. */
  subjectDid?: string
  /**
   * When set, the record is queued in this wallet instead of the acting person's.
   * Organisation-scoped stage records (a site inspection, a completion record)
   * use the organisation's own wallet.
   */
  walletTenantId?: string
}

export interface DispatchVcOfferResult {
  offerId: string
  offerUri: string
  assignedUserId: string | undefined
  assignedWalletTenantId: string | undefined
  assignedRole: string
  actorMode: string
  inboxItemId: string
  /** wallet_pending_offers row id when the recipient has a wallet. */
  walletOfferId?: string
}

/** wallet_pending_offers.source_type for records issued by a workflow stage. */
export const WORKFLOW_VC_OFFER_SOURCE_TYPE = 'workflow_vc_offer'

export function jobAssignmentOfferTtlMs(): number {
  return 30 * 24 * 60 * 60 * 1000
}

type AssignmentRecord = {
  offerId: string
  recipientUserId: string
  recipientStage: string
  issuedAt: string
  reissuedFrom?: string
  replacedReason?: string
}

type AssignmentOfferCheck =
  | { outcome: 'unrelated' | 'current' | 'already_saved' }
  | { outcome: 'not_current'; reason: string }

/** Plain-language inbox card per record type (no protocol wording for holders). */
export function describeWorkflowRecord(
  credentialType: string,
  claims: Record<string, any>,
  orgName: string,
): { title: string; body: string } {
  const ref = String(claims.poNumber || claims.reference || claims.requisitionId || claims.jobId || '').trim()
  const refSuffix = ref ? ` · ${ref}` : ''
  switch (credentialType) {
    case 'JobAssignmentVC':
      return {
        title: `Job assignment record${refSuffix}`,
        body: `${orgName} assigned you this job. Keep the assignment record so you can show what you were sent to do.`,
      }
    case 'RequisitionVC':
      return {
        title: `Job card${refSuffix}`,
        body: `${orgName} assigned you this job. Keep the job card so you can show what you were sent to do.`,
      }
    case 'ReceiptVC':
      return {
        title: `Material receipt record${refSuffix}`,
        body: `Receipts for this job were recorded by ${orgName}. Keep this record for payout and bookkeeping.`,
      }
    case 'ExecutionAckVC':
      return {
        title: `Completion record${refSuffix}`,
        body: `The finished work on this job was signed off. Keep this record as proof of completion.`,
      }
    case 'SiteInspectionVC':
      return {
        title: `Site inspection${refSuffix}`,
        body: `${orgName} recorded the site check for this job. It stays with the organisation.`,
      }
    case 'InvoiceVC':
      return {
        title: `Invoice${refSuffix}`,
        body: `${orgName} issued an invoice for this job.`,
      }
    case 'PaymentReceiptVC':
      return {
        title: `Payment receipt${refSuffix}`,
        body: `Payment for this job was recorded by ${orgName}.`,
      }
    case 'LeaveApprovalVC': {
      const kind = String(claims.leaveType || 'Leave').trim()
      const from = String(claims.startDate || '').trim()
      const to = String(claims.endDate || '').trim()
      const when = from && to ? ` from ${from} to ${to}` : ''
      return {
        title: `${kind} approved`,
        body: `${orgName} approved your leave${when}. Keep this record. You can show it as proof you are on leave.`,
      }
    }
    case 'ExpenseApprovalVC': {
      const amount = claims.amount != null ? ` of ${claims.currency || ''} ${claims.amount}`.replace('  ', ' ') : ''
      return {
        title: 'Expense approved',
        body: `${orgName} approved your expense${amount}. Keep this record as proof.`,
      }
    }
    default:
      return {
        title: `${credentialType.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}${refSuffix}`,
        body: `${orgName} issued you a record for this workflow.`,
      }
  }
}

/** The record names the organisation that issued it, so a wallet can show "Issued by SGK Trial". */
function withOrgName(orgTenantId: string, claims: Record<string, any>): Record<string, any> {
  if (claims.orgName) return claims
  const orgRow = DatabaseManager.getDatabase()
    .prepare('SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1')
    .get(orgTenantId) as { name?: string } | undefined
  return orgRow?.name ? { ...claims, orgName: orgRow.name } : claims
}

export class WorkflowVcOfferDispatcher {
  private actorService = new OrgWorkflowActorService()
  private assignmentWork = new Map<string, Promise<unknown>>()

  private async serializeAssignment<T>(runId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.assignmentWork.get(runId)
    // A failed earlier attempt must not prevent a deliberate retry.
    const task = previous ? previous.then(work, work) : work()
    this.assignmentWork.set(runId, task)
    try {
      return await task
    } finally {
      if (this.assignmentWork.get(runId) === task) this.assignmentWork.delete(runId)
    }
  }

  private assignmentHolder(runId: string, state?: Record<string, any>) {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) throw new StatusException('Job not found', 404)
    if (workflowRepository.findById(run.workflowId)?.category !== 'field_execution_fept') {
      throw new StatusException('Assignment records are only available for field jobs', 409)
    }
    const output = state || run.output || {}
    if (run.status === 'cancelled' || ['CANCELLED', 'REVOKED'].includes(String(output.workflowStage).toUpperCase())) {
      throw new StatusException('The job was cancelled', 409)
    }
    const userId = String(output.assignment?.assigneeId || run.input?.assigneeId || '')
    const holder = DatabaseManager.getDatabase()
      .prepare(
        `SELECT u.tenant_id AS walletTenantId, u.did FROM ssi_users u
             LEFT JOIN org_memberships m ON m.user_id = u.id AND m.org_tenant_id = ?
             WHERE u.id = ? AND (m.id IS NULL OR m.status = 'active') LIMIT 1`,
      )
      .get(run.tenantId, userId) as { walletTenantId: string; did?: string } | undefined
    if (!holder)
      throw new StatusException(
        'The assigned worker needs a wallet and must not have an inactive organization membership',
        409,
      )
    return { run, output, userId, ...holder }
  }

  private withdrawAssignmentOffers(runId: string, orgTenantId: string, reason: string, keepOfferId?: string): void {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT id, metadata FROM wallet_pending_offers
             WHERE issuer_tenant_id = ? AND workflow_run_id = ? AND source_type = ?
               AND credential_type IN ('JobAssignmentVC', 'RequisitionVC')
               AND (last_error IS NULL OR last_error NOT LIKE 'withdrawn:%')`,
      )
      .all(orgTenantId, runId, WORKFLOW_VC_OFFER_SOURCE_TYPE) as Array<{ id: string; metadata: string | null }>
    const offerIds = new Set<string>()
    const run = workflowRunRepository.findRunById(runId)
    if (run?.tenantId === orgTenantId) {
      for (const type of ['JobAssignmentVC', 'RequisitionVC']) {
        const offerId = run.output?.issuedCredentials?.[type]?.offerId
        if (typeof offerId === 'string' && offerId !== keepOfferId) offerIds.add(offerId)
      }
    }
    for (const row of rows) {
      const offerId = JSON.parse(row.metadata || '{}').offerId as string | undefined
      if (keepOfferId && offerId === keepOfferId) continue
      if (offerId) offerIds.add(offerId)
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = ? WHERE id = ?`,
      ).run(new Date().toISOString(), `withdrawn: ${reason}`, row.id)
    }
    for (const offerId of offerIds) {
      credentialLifecycleService.revokeByOfferId(offerId, reason)
      db.prepare(
        `UPDATE workflow_requests SET status = 'cancelled', updated_at = ?
                    WHERE target_org_tenant_id = ? AND request_type = 'vc_offer'
                      AND json_extract(payload, '$.offerId') = ?`,
      ).run(new Date().toISOString(), orgTenantId, offerId)
    }
  }

  public async issueJobAssignmentRecord(runId: string, state?: Record<string, any>): Promise<AssignmentRecord> {
    const holder = this.assignmentHolder(runId, state)
    const result = await this.issueToHolder({
      orgTenantId: holder.run.tenantId,
      walletTenantId: holder.walletTenantId,
      subjectDid: holder.did,
      credentialType: 'JobAssignmentVC',
      contextRef: runId,
      claims: {
        jobId: runId,
        workflowRunId: runId,
        reference: holder.run.input?.reference,
        assignment: holder.output.assignment,
        location: holder.run.input?.location,
        description: holder.run.input?.description,
        scheduledDate: holder.run.input?.scheduledDate,
        approvedAmount: holder.run.input?.amount,
        currency: holder.run.input?.currency,
      },
    })
    const current = this.assignmentHolder(runId)
    if (current.userId !== holder.userId) {
      this.withdrawAssignmentOffers(runId, holder.run.tenantId, 'the job was reassigned to another worker')
      throw new StatusException(
        'The assignment changed while its record was being issued. Retry for the current worker.',
        409,
      )
    }
    return {
      offerId: result.offerId,
      recipientUserId: holder.userId,
      recipientStage: 'assign_field_worker',
      issuedAt: new Date().toISOString(),
    }
  }

  public async transferJobAssignmentRecord(
    runId: string,
  ): Promise<{ outcome: 'already_current' | 'transferred' | 'not_issued_yet' | 'withdrawn'; offerId?: string }> {
    return this.serializeAssignment(runId, async () => {
      const { run, output, userId, walletTenantId } = this.assignmentHolder(runId)
      const old = output.issuedCredentials?.JobAssignmentVC || output.issuedCredentials?.RequisitionVC
      if (!old) return { outcome: 'not_issued_yet' }
      if (!credentialOfferAllowed(run.tenantId, 'field_execution_fept', 'JobAssignmentVC')) {
        this.withdrawAssignmentOffers(runId, run.tenantId, 'assignment records were disabled by the organization')
        return { outcome: 'withdrawn' }
      }
      if (old.recipientUserId === userId && output.issuedCredentials?.JobAssignmentVC) {
        const queued = this.assignmentOfferById(old.offerId, walletTenantId)
        const check = queued ? this.checkJobAssignmentOffer(walletTenantId, queued.offer_uri) : undefined
        if (check?.outcome === 'current' || check?.outcome === 'already_saved') {
          return { outcome: 'already_current', offerId: old.offerId }
        }
      }
      this.withdrawAssignmentOffers(runId, run.tenantId, 'the job was reassigned to another worker')
      const record = await this.issueJobAssignmentRecord(runId)
      const fresh = workflowRunRepository.findRunById(runId)!
      workflowRunRepository.updateRun(runId, {
        output: {
          ...fresh.output,
          issuedCredentials: {
            ...fresh.output?.issuedCredentials,
            JobAssignmentVC: { ...record, replacedReason: 'reassigned' },
          },
        },
      })
      return { outcome: 'transferred', offerId: record.offerId }
    })
  }

  public async replaceLegacyAssignmentRecord(runId: string): Promise<AssignmentRecord> {
    return this.serializeAssignment(runId, async () => {
      const { run, output } = this.assignmentHolder(runId)
      if (output.issuedCredentials?.JobAssignmentVC) return output.issuedCredentials.JobAssignmentVC
      if (!output.issuedCredentials?.RequisitionVC)
        throw new StatusException('This job has no legacy assignment record to replace', 409)
      if (!credentialOfferAllowed(run.tenantId, 'field_execution_fept', 'JobAssignmentVC')) {
        throw new StatusException('Job assignment records are disabled for this organization', 409)
      }
      const record = await this.issueJobAssignmentRecord(runId)
      this.withdrawAssignmentOffers(runId, run.tenantId, 'replaced by JobAssignmentVC', record.offerId)
      const fresh = workflowRunRepository.findRunById(runId)!
      workflowRunRepository.updateRun(runId, {
        output: {
          ...fresh.output,
          issuedCredentials: {
            ...fresh.output?.issuedCredentials,
            JobAssignmentVC: record,
            RequisitionVC: { ...output.issuedCredentials.RequisitionVC, replacedBy: record.offerId },
          },
        },
      })
      return record
    })
  }

  private assignmentOffer(walletTenantId: string, offerUri: string) {
    const unwrap = (value: string): string => {
      try {
        const url = new URL(value)
        return url.searchParams.get('credential_offer_uri') || value
      } catch {
        return value
      }
    }
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, issuer_tenant_id AS orgTenantId, workflow_run_id AS runId, metadata,
                    offer_uri AS offerUri, accepted_at AS acceptedAt, last_error AS lastError
             FROM wallet_pending_offers WHERE tenant_id = ? AND source_type = ? AND credential_type = 'JobAssignmentVC'`,
      )
      .all(walletTenantId, WORKFLOW_VC_OFFER_SOURCE_TYPE) as Array<{
      id: string
      orgTenantId: string
      runId: string
      metadata: string | null
      offerUri: string
      acceptedAt?: string
      lastError?: string
    }>
    return rows.find((row) => unwrap(row.offerUri) === unwrap(offerUri))
  }

  public checkJobAssignmentOffer(walletTenantId: string, offerUri: string): AssignmentOfferCheck {
    const row = this.assignmentOffer(walletTenantId, offerUri)
    if (!row) return { outcome: 'unrelated' }
    const run = workflowRunRepository.findRunById(row.runId)
    const offerId = JSON.parse(row.metadata || '{}').offerId
    let reason: string | undefined
    if (!run || run.tenantId !== row.orgTenantId) reason = 'the job is no longer available'
    else if (
      run.status === 'cancelled' ||
      ['CANCELLED', 'REVOKED'].includes(String(run.output?.workflowStage).toUpperCase())
    )
      reason = 'the job was cancelled'
    else {
      const userId = run.output?.assignment?.assigneeId || run.input?.assigneeId
      const holder = DatabaseManager.getDatabase()
        .prepare(
          `SELECT u.tenant_id FROM ssi_users u
                 LEFT JOIN org_memberships m ON m.user_id = u.id AND m.org_tenant_id = ?
                 WHERE u.id = ? AND (m.id IS NULL OR m.status = 'active') LIMIT 1`,
        )
        .get(run.tenantId, userId) as { tenant_id: string } | undefined
      if (holder?.tenant_id !== walletTenantId) reason = 'the job is assigned to someone else'
      else if (run.output?.issuedCredentials?.JobAssignmentVC?.offerId !== offerId)
        reason = 'there is a newer assignment record'
      else if (!credentialOfferAllowed(run.tenantId, 'field_execution_fept', 'JobAssignmentVC'))
        reason = 'assignment records were disabled by the organization'
      else if (row.lastError?.startsWith('withdrawn:')) reason = row.lastError.slice('withdrawn:'.length).trim()
    }
    if (reason) {
      credentialLifecycleService.revokeByOfferId(offerId, reason)
      DatabaseManager.getDatabase()
        .prepare(`UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = ? WHERE id = ?`)
        .run(new Date().toISOString(), `withdrawn: ${reason}`, row.id)
      return { outcome: 'not_current', reason }
    }
    return { outcome: row.acceptedAt ? 'already_saved' : 'current' }
  }

  public async reissueJobAssignmentOffer(
    walletTenantId: string,
    offerUri: string,
  ): Promise<AssignmentOfferCheck | { outcome: 'reissued'; offerId: string; offerUri: string }> {
    const row = this.assignmentOffer(walletTenantId, offerUri)
    if (!row) return { outcome: 'unrelated' }
    return this.serializeAssignment(row.runId, async () => {
      const check = this.checkJobAssignmentOffer(walletTenantId, offerUri)
      if (check.outcome !== 'current') return check
      const previousId = JSON.parse(row.metadata || '{}').offerId as string
      this.withdrawAssignmentOffers(row.runId, row.orgTenantId, 'replaced by a renewed job assignment record')
      const record = await this.issueJobAssignmentRecord(row.runId)
      const fresh = workflowRunRepository.findRunById(row.runId)!
      workflowRunRepository.updateRun(row.runId, {
        output: {
          ...fresh.output,
          issuedCredentials: {
            ...fresh.output?.issuedCredentials,
            JobAssignmentVC: { ...record, reissuedFrom: previousId },
          },
        },
      })
      const queued = this.assignmentOfferById(record.offerId, walletTenantId)
      if (!queued) throw new Error('The renewed assignment offer was not queued')
      return { outcome: 'reissued', offerId: record.offerId, offerUri: queued.offer_uri }
    })
  }

  private assignmentOfferById(offerId: string, walletTenantId: string) {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT offer_uri, accepted_at, last_error FROM wallet_pending_offers WHERE tenant_id = ? AND source_type = ?
             AND json_extract(metadata, '$.offerId') = ? LIMIT 1`,
      )
      .get(walletTenantId, WORKFLOW_VC_OFFER_SOURCE_TYPE, offerId) as
      | { offer_uri: string; accepted_at?: string; last_error?: string }
      | undefined
  }

  public assertAssignmentIssuanceCurrent(
    orgTenantId: string,
    runId: string,
    offerId: string,
    assigneeId: string,
    type: 'JobAssignmentVC' | 'RequisitionVC' = 'JobAssignmentVC',
  ): void {
    const holder = this.assignmentHolder(runId)
    const record = holder.output.issuedCredentials?.[type]
    if (
      holder.run.tenantId !== orgTenantId ||
      holder.userId !== assigneeId ||
      record?.offerId !== offerId ||
      record.replacedBy ||
      (type === 'RequisitionVC' && holder.output.issuedCredentials?.JobAssignmentVC)
    ) {
      throw new StatusException('This offer is not the current job assignment', 409)
    }
    const row = this.assignmentOfferById(offerId, holder.walletTenantId)
    if (
      !row ||
      row.accepted_at ||
      row.last_error?.startsWith('withdrawn:') ||
      !credentialOfferAllowed(orgTenantId, 'field_execution_fept', 'JobAssignmentVC')
    ) {
      throw new StatusException('This job assignment offer was withdrawn or already saved', 409)
    }
  }

  /**
   * Put the record in the recipient's wallet inbox so it can be accepted from the app.
   * Non-fatal: the offer already exists; a missing inbox row only means the holder cannot see it.
   */
  private queueWalletOffer(params: {
    orgTenantId: string
    walletTenantId: string
    credentialType: string
    offerUri: string
    offerId: string
    offerExpiresAt?: string
    contextRef?: string
    stageAction: string
    claims: Record<string, any>
    /**
     * Set for a record that comes from a platform request (`hr.leave`, `finance.expense_claim`)
     * rather than a job run. The inbox files it under Staff requests, not Jobs, so the
     * request id is kept only as the idempotency key and not written as a workflow run.
     */
    requestType?: string
  }): string | undefined {
    const db = DatabaseManager.getDatabase()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const workflowRunId = params.requestType ? null : (params.contextRef ?? null)
    try {
      const orgRow = db
        .prepare('SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1')
        .get(params.orgTenantId) as { name?: string } | undefined
      const orgName = orgRow?.name || 'The organization'
      const { title, body } = describeWorkflowRecord(params.credentialType, params.claims, orgName)
      db.prepare(
        `INSERT INTO wallet_pending_offers (
                    id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
                    title, body, metadata, workflow_run_id, created_at, attempt_count, last_attempt_at
                 ) VALUES (
                    @id, @tenantId, @issuerTenantId, @sourceType, @sourceId, @credentialType, @offerUri,
                    @title, @body, @metadata, @workflowRunId, @createdAt, 0, @createdAt
                 )`,
      ).run({
        id,
        tenantId: params.walletTenantId,
        issuerTenantId: params.orgTenantId,
        sourceType: WORKFLOW_VC_OFFER_SOURCE_TYPE,
        sourceId: params.contextRef ?? params.offerId,
        credentialType: params.credentialType,
        offerUri: params.offerUri,
        title,
        body,
        metadata: JSON.stringify({
          orgName,
          offerId: params.offerId,
          offerExpiresAt: params.offerExpiresAt,
          stageAction: params.stageAction,
          workflowRunId,
          requestType: params.requestType ?? null,
          poNumber: params.claims.poNumber ?? params.claims.reference ?? null,
        }),
        workflowRunId,
        createdAt: now,
      })
      return id
    } catch (error: any) {
      logger.warn(
        { error: error.message, credentialType: params.credentialType, walletTenantId: params.walletTenantId },
        '[Dispatcher] Offer created but could not be queued in the wallet inbox',
      )
      return undefined
    }
  }

  /**
   * Resolve actor → create VC offer → write inbox item.
   *
   * If no actor is configured and no role-fallback member is found, the method
   * logs a warning and returns a result with undefined assignee fields. The
   * caller (CredentialActions) stores the result in context.state.offer so the
   * workflow still completes — the offer URI remains available for manual
   * dispatch or admin surfacing.
   */
  public async dispatch(params: DispatchVcOfferParams): Promise<DispatchVcOfferResult> {
    const { orgTenantId, workflowType, stageAction, credentialType, contextRef, subjectDid, walletTenantId } = params
    const claims = withOrgName(orgTenantId, params.claims)

    // ── 1. Resolve actor ──────────────────────────────────────────────────────
    const resolvedActor =
      walletTenantId === orgTenantId
        ? undefined
        : this.actorService.resolveActor({ orgTenantId, workflowType, stageAction })

    logger.info(
      { orgTenantId, workflowType, stageAction, actor: resolvedActor },
      '[Dispatcher] Resolved workflow actor',
    )

    // The person will be asked to confirm this step: refresh the one staff card that lists their steps.
    if (resolvedActor?.walletTenantId) {
      const { orgWorkflowActorCredentialService } = await import('../OrgWorkflowActorCredentialService')
      orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
        orgTenantId,
        workflowType,
        stageAction,
        actor: resolvedActor,
        reason: contextRef ? `workflow:${contextRef}` : 'workflow_stage',
      })
    }

    // ── 2. Create OIDC4VC pre-authorized offer ────────────────────────────────
    const { credentialIssuanceService } = await import('../CredentialIssuanceService')

    const offerResult = await credentialIssuanceService.createOffer({
      credentialType,
      claims,
      tenantId: orgTenantId,
      subjectDid,
      ...(credentialType === 'JobAssignmentVC' ? { expiresInMs: jobAssignmentOfferTtlMs() } : {}),
    })

    logger.info({ offerId: offerResult.offerId, credentialType, orgTenantId }, '[Dispatcher] Created VC offer')

    // ── 3. Write workflow_requests inbox row ──────────────────────────────────
    const inboxItemId = crypto.randomUUID()
    const now = new Date().toISOString()

    const db = DatabaseManager.getDatabase()

    try {
      db.prepare(
        `INSERT INTO workflow_requests (
          id,
          requester_tenant_id,
          target_org_tenant_id,
          request_type,
          workflow_type,
          payload,
          status,
          assignee_user_id,
          assignee_wallet_tenant_id,
          assignee_role,
          assignment_mode,
          assignment_note,
          assigned_at,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @requesterTenantId,
          @targetOrgTenantId,
          @requestType,
          @workflowType,
          @payload,
          @status,
          @assigneeUserId,
          @assigneeWalletTenantId,
          @assigneeRole,
          @assignmentMode,
          @assignmentNote,
          @assignedAt,
          @createdAt,
          @updatedAt
        )`,
      ).run({
        id: inboxItemId,
        requesterTenantId: orgTenantId,
        targetOrgTenantId: orgTenantId,
        requestType: 'vc_offer',
        workflowType,
        payload: JSON.stringify({
          offerUri: offerResult.credential_offer_deeplink,
          credentialType,
          contextRef: contextRef ?? null,
          stageAction,
          offerId: offerResult.offerId,
          holderScope: walletTenantId === orgTenantId ? 'organization' : 'personal',
        }),
        status: 'pending',
        assigneeUserId: resolvedActor?.userId ?? null,
        assigneeWalletTenantId: resolvedActor?.walletTenantId ?? null,
        assigneeRole: resolvedActor?.role ?? null,
        assignmentMode: resolvedActor?.mode ?? 'unresolved',
        assignmentNote: `Auto-assigned by WorkflowVcOfferDispatcher for stage '${stageAction}'`,
        assignedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      logger.info(
        {
          inboxItemId,
          assigneeUserId: resolvedActor?.userId,
          assigneeRole: resolvedActor?.role,
          credentialType,
        },
        '[Dispatcher] Wrote inbox item for VC offer',
      )
    } catch (error: any) {
      // Non-fatal: the offer was created — log and continue so workflow doesn't stall.
      logger.warn(
        { error: error.message, inboxItemId, credentialType },
        '[Dispatcher] Failed to write inbox item; offer still created',
      )
    }

    // ── 4. Wallet inbox card for the recipient (what the app shows and accepts) ──
    const offerWalletId = walletTenantId || resolvedActor?.walletTenantId
    const walletOfferId = offerWalletId
      ? this.queueWalletOffer({
          orgTenantId,
          walletTenantId: offerWalletId,
          credentialType,
          offerUri: offerResult.credential_offer_deeplink,
          offerId: offerResult.offerId,
          offerExpiresAt: offerResult.expiresAt,
          contextRef,
          stageAction,
          claims,
        })
      : undefined
    if (!walletOfferId) {
      logger.warn(
        { credentialType, stageAction, actorMode: resolvedActor?.mode },
        '[Dispatcher] No wallet for the resolved recipient; the record is not visible in any inbox',
      )
    }

    return {
      offerId: offerResult.offerId,
      offerUri: offerResult.credential_offer_deeplink,
      assignedUserId: resolvedActor?.userId,
      assignedWalletTenantId: offerWalletId,
      assignedRole: resolvedActor?.role ?? 'unknown',
      actorMode: resolvedActor?.mode ?? 'unresolved',
      inboxItemId,
      walletOfferId,
    }
  }

  /**
   * Send a record straight to one person's wallet (a leave approval, an expense approval).
   * No stage actor is resolved: the person who asked is the holder.
   * A second call for the same request does not send a second copy.
   */
  public async issueToHolder(params: {
    orgTenantId: string
    walletTenantId: string
    credentialType: string
    claims: Record<string, any>
    contextRef: string
    subjectDid?: string
    /** The platform request type the record answers (`hr.leave`, `finance.expense_claim`). */
    requestType?: string
  }): Promise<{ offerId: string; walletOfferId?: string; alreadySent: boolean }> {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id, metadata FROM wallet_pending_offers
                  WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND credential_type = ?
                    AND issuer_tenant_id = ? AND (last_error IS NULL OR last_error NOT LIKE 'withdrawn:%')
                  LIMIT 1`,
      )
      .get(
        params.walletTenantId,
        WORKFLOW_VC_OFFER_SOURCE_TYPE,
        params.contextRef,
        params.credentialType,
        params.orgTenantId,
      ) as { id: string; metadata: string | null } | undefined
    if (existing?.id)
      return { offerId: JSON.parse(existing.metadata || '{}').offerId, walletOfferId: existing.id, alreadySent: true }

    const { credentialIssuanceService } = await import('../CredentialIssuanceService')
    const claims = withOrgName(params.orgTenantId, params.claims)
    const offerResult = await credentialIssuanceService.createOffer({
      credentialType: params.credentialType,
      claims,
      tenantId: params.orgTenantId,
      subjectDid: params.subjectDid,
      expiresInMs: jobAssignmentOfferTtlMs(),
    })
    const walletOfferId = this.queueWalletOffer({
      orgTenantId: params.orgTenantId,
      walletTenantId: params.walletTenantId,
      credentialType: params.credentialType,
      offerUri: offerResult.credential_offer_deeplink,
      offerId: offerResult.offerId,
      offerExpiresAt: offerResult.expiresAt,
      contextRef: params.contextRef,
      stageAction: 'request_record',
      claims,
      requestType: params.requestType,
    })
    if (!walletOfferId && params.credentialType === 'JobAssignmentVC') {
      throw new Error('The assignment offer could not be queued in the worker wallet')
    }
    return { offerId: offerResult.offerId, walletOfferId, alreadySent: false }
  }
}

export const workflowVcOfferDispatcher = new WorkflowVcOfferDispatcher()

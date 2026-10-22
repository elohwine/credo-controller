import { Controller, Post, Get, Route, Tags, Body, Path, Query, Request, Security, Response } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID, createHash } from 'crypto'
import { SCOPES } from '../../enums'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { StatusException } from '../../errors'
import { orgSetupProfileService } from '../../services/OrgSetupProfileService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { resolveConfiguredBaseUrl } from '../../utils/baseUrl'
import { getIssuerApiKey } from '../../utils/serviceApiKey'
import { outboxService } from '../../services/OutboxService'
import { notificationService } from '../../services/NotificationService'
import { rootLogger } from '../../utils/pinoLogger'
import { orgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { emitApInvoiceStateEventOutbox, emitApPaymentEventOutbox } from '../../services/AccountsPayableLedgerService'
import { businessTransactionService } from '../../services/BusinessTransactionService'
import { requestHandoffService } from '../../services/RequestHandoffService'
import { buildVcTypeArrayFilter, resolveAcceptedProofVcTypes } from '../../services/ProofVcPolicyService'
import { requireDeviceTrust } from '../../services/deviceAssertion'
import { readReceiptProof } from '../../utils/receiptProof'

const logger = rootLogger.child({ module: 'AccountsPayableController' })

function requirePositiveMoney(value: unknown, label: string): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    throw new StatusException(`${label} must be a positive amount with no more than two decimal places`, 400)
  }
  return amount
}

function requireCurrency(value: unknown): string {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new StatusException('Currency must be a three-letter code', 400)
  }
  return currency
}

// ─── Request / Response interfaces ───────────────────────────────────────────

interface CreateSupplierRequest {
  supplierName: string
  supplierPhone?: string
  supplierEmail?: string
  taxNumber?: string
  contactId?: string
  bankDetails?: {
    bank?: string
    account?: string
    branch?: string
    type?: 'savings' | 'current'
  }
  notes?: string
}

interface RecordInvoiceRequest {
  supplierId: string
  invoiceRef: string
  description?: string
  amount: number
  currency?: string
  dueDate?: string
}

interface RecordPaymentRequest {
  supplierId: string
  apInvoiceId: string
  amountPaid: number
  currency?: string
  paymentMethod?: 'ecocash' | 'bank_transfer' | 'cash' | 'cheque' | 'other' | 'simulated'
  reference?: string
  proofImageUrl?: string
  /** A live photo of the payment confirmation or receipt (data URL). */
  receiptImage?: string
  /** A receipt record from the payer's wallet standing in for the photo. */
  receiptRecord?: { id: string; type?: string; label?: string; issuer_name?: string }
  deviceAssertion?: {
    deviceKeyId: string
    nonce: string
    purpose: string
    signedAt: string
    signature: string
  }
}

interface ResolveInvoiceMatchRequest {
  /** Finance may accept a documented price/quantity variance; payment remains blocked until then. */
  decision: 'accept_variance'
  note: string
}

interface AcknowledgeRequest {
  token: string
  acknowledgedBy?: string
}

interface WorkflowTransitionRequest {
  transition:
    | 'present_payment_proof'
    | 'record_payment'
    | 'acknowledge_remittance'
    | 'issue_receipt_vc'
    | 'mark_disputed'
    | 'resolve_dispute'
  proofResponseId?: string
  consentTimestamp?: string
  notes?: string
}

type ApSupplier = {
  id: string
  buyer_tenant_id: string
  supplier_name: string
  supplier_phone: string | null
  supplier_email: string | null
  supplier_wallet_tenant_id: string | null
  contact_id: string | null
  tax_number: string | null
  bank_details: string | null
  notes: string | null
  created_at: string
  updated_at: string
  total_outstanding?: number
}

type ApInvoice = {
  id: string
  buyer_tenant_id: string
  supplier_id: string
  invoice_ref: string
  description: string | null
  amount: number
  currency: string
  due_date: string | null
  status: string
  balance_due: number
  business_transaction_id?: string | null
  obligation_id?: string | null
  match_status?: string | null
  match_note?: string | null
  created_at: string
  updated_at: string
}

type ApPayment = {
  id: string
  buyer_tenant_id: string
  supplier_id: string
  ap_invoice_id: string
  amount_paid: number
  currency: string
  payment_method: string | null
  reference: string | null
  proof_image_url: string | null
  proof_image_sha256?: string | null
  proof_record_json?: string | null
  remittance_vc_id: string | null
  acknowledge_token: string | null
  supplier_acknowledged_at: string | null
  idempotency_key?: string | null
  paid_at: string
  created_at: string
}

type WorkflowActionRow = {
  id: string
  transaction_id: string
  action_type: string
  stage_from: string | null
  stage_to: string | null
  actor_tenant_id: string | null
  actor_role: string | null
  metadata: string | null
  created_at: string
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function appendQueryParam(url: string, key: string, value?: string | null): string {
  if (!value) return url
  return url.includes('?')
    ? `${url}&${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    : `${url}?${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

function appendArApWorkflowAction(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  params: {
    transactionId: string
    actionType: string
    stageFrom: string | null
    stageTo: string
    actorTenantId: string | null
    actorRole: string | null
    proofResponseId?: string | null
    consentTimestamp?: string | null
    metadata?: Record<string, unknown>
  },
): void {
  const now = new Date().toISOString()
  db.prepare(
    `
        INSERT INTO ar_ap_workflow_actions
          (id, transaction_id, action_type, stage_from, stage_to, actor_tenant_id, actor_role,
           proof_response_id, consent_timestamp, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    `ARAPACT-${randomUUID().slice(0, 8).toUpperCase()}`,
    params.transactionId,
    params.actionType,
    params.stageFrom,
    params.stageTo,
    params.actorTenantId,
    params.actorRole,
    params.proofResponseId ?? null,
    params.consentTimestamp ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
    now,
  )

  const signature = JSON.stringify({
    transactionId: params.transactionId,
    actionType: params.actionType,
    stageFrom: params.stageFrom,
    stageTo: params.stageTo,
    actorTenantId: params.actorTenantId,
    actorRole: params.actorRole,
    proofResponseId: params.proofResponseId ?? null,
    consentTimestamp: params.consentTimestamp ?? null,
    metadata: params.metadata || {},
  })
  const digest = createHash('sha256').update(signature).digest('hex').slice(0, 24)

  outboxService.enqueue({
    topic: 'finance.arap.workflow.action',
    aggregateKey: params.transactionId,
    dedupeKey: `arap:action:${params.transactionId}:${digest}`,
    payload: {
      transactionId: params.transactionId,
      actionType: params.actionType,
      stageFrom: params.stageFrom,
      stageTo: params.stageTo,
      actorTenantId: params.actorTenantId,
      actorRole: params.actorRole,
      proofResponseId: params.proofResponseId ?? null,
      consentTimestamp: params.consentTimestamp ?? null,
      metadata: params.metadata || {},
      emittedAt: now,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────

@Route('api/finance/ap')
@Tags('Accounts Payable')
export class AccountsPayableController extends Controller {
  private getNaturalReplayKey(action: string, tenantId: string, seed: string): string {
    const normalized = `${action}|${tenantId}|${seed}`
    const digest = createHash('sha256').update(normalized).digest('hex')
    return `ap:${action}:natural:${digest}`
  }

  private getBuyerTenantId(request: ExRequest): string {
    const user = (request as any).user
    if (!user?.tenantId) throw new StatusException('Unauthorized', 401)
    return user.tenantId
  }

  private getBuyerTenantCandidateIds(request: ExRequest): string[] {
    return this.getActorCandidateTenantIds(request)
  }

  private assertOrgRole(request: ExRequest): void {
    const user = (request as any).user
    if (!user?.tenantId) throw new StatusException('Unauthorized', 401)
    const tenant = getTenantById(user.tenantId)
    if (tenant?.tenantType === 'ORG') {
      const allowed = new Set(['owner', 'admin', 'issuer', 'manager', 'approver', 'accountant'])
      if (!allowed.has(user.orgRole)) {
        throw new StatusException('Insufficient permissions for AP actions', 403)
      }
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return 'Unexpected error'
  }

  private getTenantAgent(request: ExRequest): any {
    return (request as any).agent
  }

  private getAuthDidUrl(did: string, didDocument?: any): string {
    const authEntries = didDocument?.authentication
    if (Array.isArray(authEntries) && authEntries.length > 0) {
      const first = authEntries[0]
      if (typeof first === 'string') return first
      if (typeof first === 'object' && typeof first.id === 'string') return first.id
    }

    const firstVm = didDocument?.verificationMethod?.[0]
    if (firstVm?.id && typeof firstVm.id === 'string') {
      return firstVm.id
    }

    return `${did}#key-1`
  }

  private async getOrCreateDidForAgent(agent: any): Promise<{ did: string; didUrl: string }> {
    const createdDids = await agent.dids.getCreatedDids({ method: 'key' })
    if (createdDids.length > 0) {
      const did = createdDids[0].did
      const resolved = await agent.dids.resolve(did)
      return { did, didUrl: this.getAuthDidUrl(did, resolved.didDocument) }
    }

    const result = await agent.dids.create({ method: 'key', options: { keyType: 'Ed25519' } })
    const did = result.didState.did
    if (!did) {
      throw new StatusException('Unable to create verifier DID', 500)
    }

    return { did, didUrl: this.getAuthDidUrl(did, result.didState.didDocument) }
  }

  private buildWorkflowProofPresentationDefinition(
    transactionId: string,
    requiredAction: string,
    requiredProofType: string,
    acceptedVcTypes: string[],
  ) {
    return {
      id: `ap-workflow-${transactionId}-${Date.now()}`,
      input_descriptors: [
        {
          id: 'platform-identity',
          name: 'Platform/Role Authorization Credential',
          purpose: `Share your platform or role authorization credential to authorize '${requiredAction}' for AP workflow proof '${requiredProofType}'.`,
          constraints: {
            fields: [
              {
                path: ['$.type', '$.vc.type'],
                filter: buildVcTypeArrayFilter(acceptedVcTypes),
              },
            ],
          },
        },
      ],
    }
  }

  private async ensureNativeVerifierRecord(tenantAgent: any): Promise<string | undefined> {
    const existing = await (tenantAgent.modules as any).openId4VcVerifier.getAllVerifiers()
    if (Array.isArray(existing) && existing.length > 0) {
      const verifierId = String(existing[0]?.verifierId || existing[0]?.id || '').trim()
      return verifierId || undefined
    }

    await (tenantAgent.modules as any).openId4VcVerifier.createVerifier({})
    const created = await (tenantAgent.modules as any).openId4VcVerifier.getAllVerifiers()
    if (Array.isArray(created) && created.length > 0) {
      const verifierId = String(created[0]?.verifierId || created[0]?.id || '').trim()
      return verifierId || undefined
    }

    return undefined
  }

  private async createAuthorizationRequestWithVerifierRecovery(
    tenantAgent: any,
    params: {
      verifierId?: string
      requestSigner: { method: 'did'; did: string; didUrl: string }
      presentationExchange: { definition: Record<string, unknown> }
    },
  ): Promise<any> {
    try {
      return await (tenantAgent.modules as any).openId4VcVerifier.createAuthorizationRequest(params)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/FOREIGN KEY constraint failed/i.test(message)) {
        throw error
      }

      // Recovery path for stale/missing verifier rows in tenant wallets.
      await (tenantAgent.modules as any).openId4VcVerifier.createVerifier({})
      const recoveredVerifierId = await this.ensureNativeVerifierRecord(tenantAgent)
      return await (tenantAgent.modules as any).openId4VcVerifier.createAuthorizationRequest({
        ...params,
        verifierId: recoveredVerifierId,
      })
    }
  }

  private async assertVerifiedWorkflowProof(
    request: ExRequest,
    params: {
      proofRequestId: string
      proofResponseId: string
      transactionId: string
    },
  ): Promise<void> {
    if (params.proofRequestId !== params.proofResponseId) {
      throw new StatusException('Proof response does not match the expected proof request for this transaction', 409)
    }

    const tenantAgent = this.getTenantAgent(request)
    try {
      const verificationResult = await (tenantAgent.modules as any).openId4VcVerifier.getVerifiedAuthorizationResponse(
        params.proofResponseId,
      )
      if (!verificationResult) {
        throw new StatusException('Proof verification session is not completed', 409)
      }
    } catch (error) {
      if (error instanceof StatusException) throw error
      throw new StatusException('Verified proof response not found for this AP workflow transition', 400)
    }
  }

  private getActorCandidateTenantIds(request: ExRequest): string[] {
    const orgTenantId = this.getBuyerTenantId(request)
    const userId = String((request as any).user?.id || '').trim()
    const candidates = new Set<string>([orgTenantId])

    if (userId) {
      const db = DatabaseManager.getDatabase()
      const row = db.prepare('SELECT tenant_id FROM ssi_users WHERE id = ? LIMIT 1').get(userId) as
        | { tenant_id?: string }
        | undefined
      if (row?.tenant_id) {
        candidates.add(String(row.tenant_id))
      }
    }

    return [...candidates]
  }

  private resolveWorkflowActorTenant(
    orgTenantId: string,
    stageAction: string,
  ): { tenantId: string; role: string; mode: string } {
    const resolved = orgWorkflowActorService.resolveActor({
      orgTenantId,
      workflowType: 'ap_trust_workflow',
      stageAction,
    })

    return {
      tenantId: resolved.walletTenantId || orgTenantId,
      role: resolved.role || 'owner',
      mode: resolved.mode,
    }
  }

  private upsertApWorkflowInboxAssignment(
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    params: {
      transactionId: string
      actorTenantId: string
      actorRole: string
      orgTenantId?: string | null
      requiredAction: string
      requiredProofType?: string | null
    },
  ): void {
    const now = new Date().toISOString()
    const normalizedOrgTenantId = String(params.orgTenantId || '').trim()
    const orgTenantRecord = normalizedOrgTenantId ? getTenantById(normalizedOrgTenantId) : null
    const contextOrgTenantId = orgTenantRecord?.tenantType === 'ORG' ? normalizedOrgTenantId : null

    const txActor = db
      .prepare(
        `
            SELECT required_actor_tenant_id, required_actor_role, source_plan_id, source_payment_link_id
            FROM ar_ap_workflow_transactions
            WHERE id = ?
            LIMIT 1
        `,
      )
      .get(params.transactionId) as
      | {
          required_actor_tenant_id?: string | null
          required_actor_role?: string | null
          source_plan_id?: string | null
          source_payment_link_id?: string | null
        }
      | undefined

    const actorTenantId =
      String(txActor?.required_actor_tenant_id || params.actorTenantId || '').trim() || params.actorTenantId
    const actorRole = String(txActor?.required_actor_role || params.actorRole || 'owner').trim() || 'owner'

    db.prepare(
      `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, ?),
                accepted_at = COALESCE(accepted_at, ?),
                last_attempt_at = ?
            WHERE source_type = 'ap_workflow_assignment'
              AND source_id = ?
              AND tenant_id != ?
              AND resolved_at IS NULL
        `,
    ).run(now, now, now, params.transactionId, actorTenantId)

    const existing = db
      .prepare(
        `
            SELECT id
            FROM wallet_pending_offers
            WHERE tenant_id = ?
              AND source_type = 'ap_workflow_assignment'
              AND source_id = ?
              AND resolved_at IS NULL
            LIMIT 1
        `,
      )
      .get(actorTenantId, params.transactionId) as { id: string } | undefined

    const metadata = JSON.stringify({
      transactionId: params.transactionId,
      targetOrgTenantId: contextOrgTenantId,
      workflowType: 'ap_trust_workflow',
      requestType: 'ap_workflow',
      requiredAction: params.requiredAction,
      requiredProofType: params.requiredProofType || null,
      assigneeRole: actorRole,
      sourcePlanId: txActor?.source_plan_id || null,
      sourcePaymentLinkId: txActor?.source_payment_link_id || null,
    })
    const pushTitle = 'AP Workflow Action Required'
    const pushBody = `Action '${params.requiredAction}' is ready for you to continue in your organization workflow.`
    const pushActionUrl = contextOrgTenantId
      ? `/inbox?focus=ap-workflow&transactionId=${encodeURIComponent(params.transactionId)}&orgTenantId=${encodeURIComponent(contextOrgTenantId)}`
      : `/inbox?focus=ap-workflow&transactionId=${encodeURIComponent(params.transactionId)}`

    if (existing?.id) {
      db.prepare(
        `
                UPDATE wallet_pending_offers
                SET title = ?, body = ?, metadata = ?, last_attempt_at = ?
                WHERE id = ?
            `,
      ).run(
        'AP Workflow Action Required',
        `Action '${params.requiredAction}' is assigned to you for AP workflow execution.`,
        metadata,
        now,
        existing.id,
      )
      notificationService
        .sendWalletPush({
          title: pushTitle,
          body: pushBody,
          actionUrl: pushActionUrl,
          type: 'generic',
        })
        .catch(() => {
          /* logged in service */
        })
      return
    }

    db.prepare(
      `
            INSERT INTO wallet_pending_offers (
                id, tenant_id, issuer_tenant_id, source_type, source_id,
                credential_type, offer_uri, title, body, metadata, created_at,
                attempt_count, last_attempt_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `,
    ).run(
      `apw-${randomUUID().slice(0, 12)}`,
      actorTenantId,
      contextOrgTenantId || normalizedOrgTenantId || actorTenantId,
      'ap_workflow_assignment',
      params.transactionId,
      'WorkflowActionAssignment',
      `ap-workflow://${encodeURIComponent(params.transactionId)}`,
      'AP Workflow Action Required',
      `Action '${params.requiredAction}' is assigned to you for AP workflow execution.`,
      metadata,
      now,
      now,
    )

    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: actorTenantId,
      dedupeKey: `wpo:${actorTenantId}:ap_workflow_assignment:${params.transactionId}:${params.requiredAction}`,
      payload: {
        tenantId: actorTenantId,
        issuerTenantId: contextOrgTenantId || normalizedOrgTenantId || actorTenantId,
        sourceType: 'ap_workflow_assignment',
        sourceId: params.transactionId,
        credentialType: 'WorkflowActionAssignment',
        offerUri: `ap-workflow://${params.transactionId}`,
        queuedAt: now,
      },
    })

    notificationService
      .sendWalletPush({
        title: pushTitle,
        body: pushBody,
        actionUrl: pushActionUrl,
        type: 'generic',
      })
      .catch(() => {
        /* logged in service */
      })
  }

  private resolveApWorkflowInboxAssignments(
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    transactionId: string,
  ): void {
    const now = new Date().toISOString()
    db.prepare(
      `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, ?),
                accepted_at = COALESCE(accepted_at, ?),
                last_attempt_at = ?
            WHERE source_type = 'ap_workflow_assignment'
              AND source_id = ?
              AND resolved_at IS NULL
        `,
    ).run(now, now, now, transactionId)
  }

  // Who handles a supplier-bill step is the same money-people list as purchase requests
  // (FinanceController workflow-actors/defaults). This controller does not register that path again.

  // ─── Supplier management ─────────────────────────────────────────────────

  /**
   * Onboard a new supplier into the buyer's AP directory.
   * If the supplier already has a Credentis wallet, future payments will push
   * a RemittanceAdviceVC to their wallet inbox.
   */
  @Post('suppliers')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createSupplier(
    @Body() body: CreateSupplierRequest,
    @Request() request: ExRequest,
  ): Promise<ApSupplier | { error: string }> {
    try {
      this.assertOrgRole(request)
      const buyerTenantId = this.getBuyerTenantId(request)
      const db = DatabaseManager.getDatabase()
      const now = new Date().toISOString()
      const id = `SUP-${randomUUID().substring(0, 8).toUpperCase()}`

      db.prepare(
        `
                INSERT INTO ap_suppliers
                  (id, buyer_tenant_id, supplier_name, supplier_phone, supplier_email,
                   tax_number, bank_details, notes, contact_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
      ).run(
        id,
        buyerTenantId,
        body.supplierName,
        body.supplierPhone ?? null,
        body.supplierEmail ?? null,
        body.taxNumber ?? null,
        body.bankDetails ? JSON.stringify(body.bankDetails) : null,
        body.notes ?? null,
        body.contactId ?? null,
        now,
        now,
      )

      logger.info({ id, buyerTenantId, supplierName: body.supplierName }, 'AP supplier onboarded')
      return db.prepare('SELECT * FROM ap_suppliers WHERE id = ?').get(id) as ApSupplier
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * List all suppliers for the calling buyer org, with total outstanding balance per supplier.
   */
  @Get('suppliers')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listSuppliers(@Request() request: ExRequest): Promise<ApSupplier[] | { error: string }> {
    try {
      const buyerTenantIds = this.getBuyerTenantCandidateIds(request)
      const db = DatabaseManager.getDatabase()
      const placeholders = buyerTenantIds.map(() => '?').join(', ')
      return db
        .prepare(
          `
                SELECT s.*,
                       COALESCE(SUM(i.balance_due), 0) AS total_outstanding
                FROM ap_suppliers s
                LEFT JOIN ap_invoices i ON i.supplier_id = s.id AND i.status != 'paid'
                WHERE s.buyer_tenant_id IN (${placeholders})
                GROUP BY s.id
                ORDER BY total_outstanding DESC, s.supplier_name ASC
            `,
        )
        .all(...buyerTenantIds) as ApSupplier[]
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * Get supplier detail with full outstanding balance and invoice summary.
   */
  @Get('suppliers/{supplierId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getSupplier(
    @Path() supplierId: string,
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const buyerTenantIds = this.getBuyerTenantCandidateIds(request)
      const db = DatabaseManager.getDatabase()
      const placeholders = buyerTenantIds.map(() => '?').join(', ')
      const supplier = db
        .prepare(`SELECT * FROM ap_suppliers WHERE id = ? AND buyer_tenant_id IN (${placeholders})`)
        .get(supplierId, ...buyerTenantIds) as ApSupplier | undefined

      if (!supplier) {
        this.setStatus(404)
        return { error: 'Supplier not found' }
      }

      const invoices = db
        .prepare('SELECT * FROM ap_invoices WHERE supplier_id = ? ORDER BY created_at DESC')
        .all(supplierId) as ApInvoice[]

      const totalOutstanding = invoices
        .filter((inv) => inv.status !== 'paid')
        .reduce((sum, inv) => sum + inv.balance_due, 0)

      return { ...supplier, invoices, totalOutstanding }
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  // ─── Invoice management ───────────────────────────────────────────────────

  /**
   * Record a supplier invoice (a bill the buyer owes).
   * The balance_due starts equal to the full amount and decrements as payments are made.
   */
  @Post('invoices')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async recordInvoice(
    @Body() body: RecordInvoiceRequest,
    @Request() request: ExRequest,
  ): Promise<ApInvoice | { error: string }> {
    try {
      this.assertOrgRole(request)
      const buyerTenantId = this.getBuyerTenantId(request)
      orgSetupProfileService.assertModule(buyerTenantId, 'payables')
      const db = DatabaseManager.getDatabase()
      const amount = requirePositiveMoney(body.amount, 'Invoice amount')
      const currency = body.currency === undefined ? 'USD' : requireCurrency(body.currency)

      const supplier = db
        .prepare('SELECT * FROM ap_suppliers WHERE id = ? AND buyer_tenant_id = ?')
        .get(body.supplierId, buyerTenantId) as ApSupplier | undefined
      if (!supplier) {
        this.setStatus(404)
        return { error: 'Supplier not found' }
      }

      const now = new Date().toISOString()
      const id = `APINV-${randomUUID().substring(0, 8).toUpperCase()}`
      const transactionId = db.transaction(() => {
        const createdTransactionId = businessTransactionService.ensureTransaction({
          tenantId: buyerTenantId,
          transactionType: 'purchase',
          sourceType: 'manual_ap_invoice',
          sourceId: id,
          title: body.description || `Supplier bill ${body.invoiceRef}`,
          reference: body.invoiceRef,
          metadata: { manualInvoice: true },
        })
        const obligationId = businessTransactionService.ensureObligation({
          transactionId: createdTransactionId,
          tenantId: buyerTenantId,
          direction: 'payable',
          sourceType: 'ap_invoice',
          sourceId: id,
          description: body.description || `Supplier bill ${body.invoiceRef}`,
          amount,
          currency,
          dueDate: body.dueDate,
          counterpartyRef: body.supplierId,
          counterpartyName: supplier.supplier_name,
          metadata: { invoiceRef: body.invoiceRef, manualInvoice: true },
        })

        db.prepare(
          `
                    INSERT INTO ap_invoices
                      (id, buyer_tenant_id, supplier_id, invoice_ref, description,
                       amount, currency, due_date, status, balance_due, created_at, updated_at,
                       business_transaction_id, obligation_id, match_status, match_note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outstanding', ?, ?, ?, ?, ?, 'manual_reviewed',
                            'Entered directly in Supplier bills; no purchase-order match.')
                `,
        ).run(
          id,
          buyerTenantId,
          body.supplierId,
          body.invoiceRef,
          body.description ?? null,
          amount,
          currency,
          body.dueDate ?? null,
          amount,
          now,
          now,
          createdTransactionId,
          obligationId,
        )
        businessTransactionService.link(createdTransactionId, 'ap_invoice', id, 'obligation')
        return createdTransactionId
      })()

      logger.info({ id, buyerTenantId, supplierId: body.supplierId, amount }, 'AP invoice recorded')
      return db.prepare('SELECT * FROM ap_invoices WHERE id = ?').get(id) as ApInvoice
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * List AP invoices for the calling org, optionally filtered by supplier or status.
   */
  @Get('invoices')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listInvoices(
    @Request() request: ExRequest,
    @Query() supplierId?: string,
    @Query() status?: string,
  ): Promise<ApInvoice[] | { error: string }> {
    try {
      const buyerTenantId = this.getBuyerTenantId(request)
      const db = DatabaseManager.getDatabase()
      let query = `SELECT i.*,
                                o.original_amount AS obligation_original_amount,
                                o.balance_due AS obligation_balance_due,
                                o.status AS obligation_status,
                                o.business_transaction_id AS transaction_id
                           FROM ap_invoices i
                           LEFT JOIN financial_obligations o ON o.id = i.obligation_id
                          WHERE i.buyer_tenant_id = ?`
      const params: unknown[] = [buyerTenantId]
      if (supplierId) {
        query += ' AND i.supplier_id = ?'
        params.push(supplierId)
      }
      if (status) {
        query += ' AND i.status = ?'
        params.push(status)
      }
      query += ' ORDER BY i.created_at DESC'
      return db.prepare(query).all(...params) as ApInvoice[]
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /** Accept a documented order/receipt/bill variance, then allow the supplier-payment step. */
  @Post('invoices/{invoiceId}/resolve-match')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async resolveInvoiceMatch(
    @Path() invoiceId: string,
    @Body() body: ResolveInvoiceMatchRequest,
    @Request() request: ExRequest,
  ): Promise<ApInvoice | { error: string }> {
    try {
      this.assertOrgRole(request)
      const buyerTenantId = this.getBuyerTenantId(request)
      const note = String(body.note || '').trim()
      if (body.decision !== 'accept_variance' || !note) {
        this.setStatus(400)
        return { error: 'Explain why finance accepts this difference.' }
      }
      const db = DatabaseManager.getDatabase()
      const invoice = db
        .prepare(`SELECT * FROM ap_invoices WHERE id = ? AND buyer_tenant_id = ?`)
        .get(invoiceId, buyerTenantId) as (ApInvoice & { source_request_id?: string | null }) | undefined
      if (!invoice) {
        this.setStatus(404)
        return { error: 'Supplier bill not found' }
      }
      if (invoice.match_status !== 'disputed') return invoice
      const now = new Date().toISOString()
      db.transaction(() => {
        db.prepare(
          `UPDATE ap_invoices
                        SET status = 'outstanding', match_status = 'accepted_variance',
                            match_note = ?, workflow_stage = 'matched', last_action_at = ?, updated_at = ?
                      WHERE id = ?`,
        ).run(note, now, now, invoiceId)
        if (invoice.obligation_id) {
          db.prepare(
            `UPDATE financial_obligations SET status = 'open', metadata = json_set(metadata, '$.matchDecision', ?, '$.matchNote', ?), updated_at = ?
                          WHERE id = ?`,
          ).run('accepted_variance', note, now, invoice.obligation_id)
        }
      })()
      if (invoice.source_request_id) {
        const source = db
          .prepare(
            `SELECT organization_id, title, amount, currency, department_id, context_json
                           FROM requests WHERE id = ? AND tenant_id = ?`,
          )
          .get(invoice.source_request_id, buyerTenantId) as any
        let context: Record<string, unknown> = {}
        try {
          context = JSON.parse(source?.context_json || '{}')
        } catch {
          context = {}
        }
        requestHandoffService.continueFromPlatformRequest({
          tenantId: buyerTenantId,
          organizationId: source?.organization_id,
          requestId: invoice.source_request_id,
          requestType: 'finance.purchase_order',
          toStatus: 'completed',
          title: source?.title,
          amount: invoice.amount,
          currency: invoice.currency,
          departmentId: source?.department_id,
          context: { ...context, invoiceRef: invoice.invoice_ref, matchDecision: 'accepted_variance' },
        })
      }
      return db.prepare(`SELECT * FROM ap_invoices WHERE id = ?`).get(invoiceId) as ApInvoice
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * Cross-org AP workflow action board for the current payer org.
   * Reuses requisition-style action visibility: stage, required action, required actor, and recent actions.
   */
  @Get('workflow-actions')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listWorkflowActions(
    @Request() request: ExRequest,
    @Query() onlyPending?: boolean,
    @Query() supplierId?: string,
  ): Promise<Record<string, unknown>[] | { error: string }> {
    try {
      const buyerTenantId = this.getBuyerTenantId(request)
      const actorCandidates = new Set(this.getActorCandidateTenantIds(request))
      const db = DatabaseManager.getDatabase()

      let query = `
                SELECT
                    tx.*,
                    i.invoice_ref,
                    i.description AS invoice_description,
                    i.due_date,
                    i.status AS invoice_status,
                    s.supplier_name,
                    s.supplier_wallet_tenant_id
                FROM ar_ap_workflow_transactions tx
                LEFT JOIN ap_invoices i ON i.id = tx.ap_invoice_id
                LEFT JOIN ap_suppliers s ON s.id = tx.supplier_id
                WHERE tx.payer_tenant_id = ?
            `

      const params: unknown[] = [buyerTenantId]
      if (onlyPending) {
        query += ' AND tx.required_action IS NOT NULL'
      }
      if (supplierId) {
        query += ' AND tx.supplier_id = ?'
        params.push(supplierId)
      }
      query += ' ORDER BY tx.updated_at DESC'

      const rows = db.prepare(query).all(...params) as Record<string, unknown>[]

      const actionLookup = db.prepare(`
                SELECT *
                FROM ar_ap_workflow_actions
                WHERE transaction_id = ?
                ORDER BY created_at DESC
                LIMIT 5
            `)

      return rows.map((row) => {
        const txId = String(row.id || '')
        const actions = actionLookup.all(txId) as WorkflowActionRow[]
        return {
          ...row,
          myActionRequired: actorCandidates.has(String(row.required_actor_tenant_id || '')),
          recentActions: actions.map((action) => ({
            id: action.id,
            actionType: action.action_type,
            stageFrom: action.stage_from,
            stageTo: action.stage_to,
            actorTenantId: action.actor_tenant_id,
            actorRole: action.actor_role,
            metadata: parseJsonObject(action.metadata),
            createdAt: action.created_at,
          })),
        }
      })
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * Create a wallet-native proof request for the current AP workflow action.
   * The resulting verification session id becomes the only accepted proofResponseId for transition.
   */
  @Post('workflow-actions/{transactionId}/proof-request')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createWorkflowProofRequest(
    @Path() transactionId: string,
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      this.assertOrgRole(request)
      const actorTenantId = this.getBuyerTenantId(request)
      const actorCandidates = new Set(this.getActorCandidateTenantIds(request))
      const db = DatabaseManager.getDatabase()
      const ownershipTenantIds = Array.from(new Set([actorTenantId, ...actorCandidates]))
      const ownershipPlaceholders = ownershipTenantIds.map(() => '?').join(', ')

      const tx = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE id = ?
                                    AND (
                                        payer_tenant_id IN (${ownershipPlaceholders})
                                        OR collector_tenant_id IN (${ownershipPlaceholders})
                                    )
                LIMIT 1
                        `,
        )
        .get(transactionId, ...ownershipTenantIds, ...ownershipTenantIds) as Record<string, unknown> | undefined

      if (!tx) {
        this.setStatus(404)
        return { error: 'Workflow transaction not found' }
      }

      const requiredActor = tx.required_actor_tenant_id ? String(tx.required_actor_tenant_id) : null
      const requiredAction = tx.required_action ? String(tx.required_action) : null
      const requiredProofType = tx.required_proof_type ? String(tx.required_proof_type) : null

      const idempotencyAction = `ap:workflow-proof-request:${transactionId}`
      const idempotencyCheck = IdempotencyGuard.guard(db, request, actorTenantId, idempotencyAction)
      if (idempotencyCheck.duplicate) {
        return idempotencyCheck.response
      }

      const naturalReplayKey = this.getNaturalReplayKey(
        'workflow-proof-request',
        actorTenantId,
        `${transactionId}:${requiredAction || 'none'}:${requiredProofType || 'none'}`,
      )
      const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, actorTenantId, idempotencyAction)
      if (naturalReplay) {
        return naturalReplay.response
      }

      if (requiredActor && !actorCandidates.has(requiredActor)) {
        this.setStatus(403)
        return { error: 'This proof step is assigned to a different actor tenant' }
      }

      if (!requiredAction || !requiredProofType) {
        this.setStatus(409)
        return { error: 'The current workflow step does not require wallet proof' }
      }

      const tenantAgent = this.getTenantAgent(request)
      const verifier = await this.getOrCreateDidForAgent(tenantAgent)
      const verifierId = await this.ensureNativeVerifierRecord(tenantAgent)
      const acceptedVcTypes = resolveAcceptedProofVcTypes(actorTenantId, 'ap_workflow_proof')
      const presentationDefinition = this.buildWorkflowProofPresentationDefinition(
        transactionId,
        requiredAction,
        requiredProofType,
        acceptedVcTypes,
      )

      const result = await this.createAuthorizationRequestWithVerifierRecovery(tenantAgent, {
        verifierId,
        requestSigner: { method: 'did', did: verifier.did, didUrl: verifier.didUrl },
        presentationExchange: { definition: presentationDefinition },
      })

      const requestId = result.verificationSession?.id || randomUUID()
      const requestUrl = result.authorizationRequest as string
      const requestUrlWithSession = appendQueryParam(
        appendQueryParam(
          appendQueryParam(
            appendQueryParam(requestUrl, 'verification_session_id', requestId),
            'transaction_id',
            transactionId,
          ),
          'verifier_tenant_id',
          actorTenantId,
        ),
        'required_action',
        requiredAction,
      )

      const now = new Date().toISOString()
      db.prepare(
        `
                UPDATE ar_ap_workflow_transactions
                SET proof_request_id = ?, updated_at = ?
                WHERE id = ?
            `,
      ).run(requestId, now, transactionId)

      appendArApWorkflowAction(db, {
        transactionId,
        actionType: 'proof_requested',
        stageFrom: String(tx.workflow_stage || 'issued'),
        stageTo: String(tx.workflow_stage || 'issued'),
        actorTenantId,
        actorRole: String(tx.required_actor_role || 'actor'),
        metadata: {
          requiredAction,
          requiredProofType,
          verifierDid: verifier.did,
        },
      })

      const responsePayload = {
        transactionId,
        requestId,
        presentationRequestUrl: requestUrlWithSession,
        verifierDid: verifier.did,
        requiredAction,
        requiredProofType,
      }

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, actorTenantId, idempotencyAction, responsePayload)
      }
      IdempotencyGuard.record(db, naturalReplayKey, actorTenantId, idempotencyAction, responsePayload)
      return responsePayload
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * Advance a shared AR/AP workflow transaction stage by the currently required actor.
   * This endpoint is stage-engine focused and mirrors requisition-style explicit transitions.
   */
  @Post('workflow-actions/{transactionId}/transition')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async transitionWorkflowAction(
    @Path() transactionId: string,
    @Body() body: WorkflowTransitionRequest,
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      this.assertOrgRole(request)
      const actorTenantId = this.getBuyerTenantId(request)
      const actorCandidates = new Set(this.getActorCandidateTenantIds(request))
      const db = DatabaseManager.getDatabase()
      const ownershipTenantIds = Array.from(new Set([actorTenantId, ...actorCandidates]))
      const ownershipPlaceholders = ownershipTenantIds.map(() => '?').join(', ')

      const tx = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE id = ?
                                    AND (
                                        payer_tenant_id IN (${ownershipPlaceholders})
                                        OR collector_tenant_id IN (${ownershipPlaceholders})
                                    )
                LIMIT 1
                        `,
        )
        .get(transactionId, ...ownershipTenantIds, ...ownershipTenantIds) as Record<string, unknown> | undefined

      if (!tx) {
        this.setStatus(404)
        return { error: 'Workflow transaction not found' }
      }

      const idempotencyAction = `ap:workflow-transition:${transactionId}:${body.transition}`
      const idempotencyCheck = IdempotencyGuard.guard(db, request, actorTenantId, idempotencyAction)
      if (idempotencyCheck.duplicate) {
        return idempotencyCheck.response
      }

      const naturalReplayKey = this.getNaturalReplayKey(
        'workflow-transition',
        actorTenantId,
        `${transactionId}:${body.transition}:${body.proofResponseId || 'none'}`,
      )
      const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, actorTenantId, idempotencyAction)
      if (naturalReplay) {
        return naturalReplay.response
      }

      const requiredActor = tx.required_actor_tenant_id ? String(tx.required_actor_tenant_id) : null
      const requiredProofType = tx.required_proof_type ? String(tx.required_proof_type) : null
      const proofRequestId = tx.proof_request_id ? String(tx.proof_request_id) : null
      if (requiredActor && !actorCandidates.has(requiredActor)) {
        this.setStatus(403)
        return { error: 'This workflow step is assigned to a different actor tenant' }
      }

      if (requiredProofType && !body.proofResponseId) {
        this.setStatus(400)
        return { error: `Proof reference is required for this step (${requiredProofType})` }
      }

      if (requiredProofType) {
        if (!proofRequestId) {
          this.setStatus(409)
          return { error: 'A proof request must be created before this workflow step can be completed' }
        }

        await this.assertVerifiedWorkflowProof(request, {
          proofRequestId,
          proofResponseId: String(body.proofResponseId),
          transactionId,
        })
      }

      const currentStage = String(tx.workflow_stage || 'issued')
      const requiredAction = tx.required_action ? String(tx.required_action) : null

      if (!requiredAction) {
        this.setStatus(409)
        return { error: 'No pending workflow action exists for this transaction' }
      }

      if (requiredAction !== body.transition) {
        this.setStatus(409)
        return {
          error: `Transition mismatch. Required action is '${requiredAction}' but received '${body.transition}'`,
        }
      }

      const now = new Date().toISOString()
      const consentTs = body.consentTimestamp || now

      let nextStatus = String(tx.status || 'pending_payment')
      let nextStage = currentStage
      let nextTrustStatus = String(tx.trust_status || 'pending')
      let nextRequiredAction: string | null = tx.required_action ? String(tx.required_action) : null
      let nextRequiredActorTenant: string | null = tx.required_actor_tenant_id
        ? String(tx.required_actor_tenant_id)
        : null
      let nextRequiredActorRole: string | null = tx.required_actor_role ? String(tx.required_actor_role) : null
      let nextRequiredProofType: string | null = tx.required_proof_type ? String(tx.required_proof_type) : null

      const resolveAssignmentForOrg = (orgTenantId: string, stageAction: string) => {
        const assignment = this.resolveWorkflowActorTenant(orgTenantId, stageAction)
        nextRequiredActorTenant = assignment.tenantId
        nextRequiredActorRole = assignment.role
      }

      switch (body.transition) {
        case 'present_payment_proof':
          nextStatus = 'proof_presented'
          nextStage = 'payment_proof_presented'
          nextRequiredAction = 'record_payment'
          resolveAssignmentForOrg(String(tx.payer_tenant_id), 'record_payment')
          nextRequiredProofType = 'PaymentProofVC'
          break
        case 'record_payment':
          nextStatus = 'payment_recorded'
          nextStage = 'payment_recorded'
          nextRequiredAction = 'acknowledge_remittance'
          resolveAssignmentForOrg(String(tx.collector_tenant_id), 'acknowledge_remittance')
          nextRequiredProofType = 'RemittanceAdviceVC'
          break
        case 'acknowledge_remittance':
          nextStatus = 'acknowledged'
          nextStage = 'acknowledged'
          nextTrustStatus = 'verified'
          nextRequiredAction = 'issue_receipt_vc'
          resolveAssignmentForOrg(String(tx.collector_tenant_id), 'issue_receipt_vc')
          nextRequiredProofType = 'ReceiptVC'
          break
        case 'issue_receipt_vc':
          nextStatus = 'completed'
          nextStage = 'receipt_issued'
          nextTrustStatus = 'verified'
          nextRequiredAction = null
          nextRequiredActorTenant = null
          nextRequiredActorRole = null
          nextRequiredProofType = null
          break
        case 'mark_disputed':
          nextStatus = 'disputed'
          nextStage = 'disputed'
          nextTrustStatus = 'disputed'
          nextRequiredAction = 'resolve_dispute'
          resolveAssignmentForOrg(String(tx.collector_tenant_id), 'resolve_dispute')
          nextRequiredProofType = 'DisputeResolutionVC'
          break
        case 'resolve_dispute':
          nextStatus = 'resolved'
          nextStage = 'resolved'
          nextTrustStatus = 'verified'
          nextRequiredAction = 'issue_receipt_vc'
          resolveAssignmentForOrg(String(tx.collector_tenant_id), 'issue_receipt_vc')
          nextRequiredProofType = 'ReceiptVC'
          break
        default:
          this.setStatus(400)
          return { error: 'Unsupported transition' }
      }

      db.prepare(
        `
                UPDATE ar_ap_workflow_transactions
                SET
                    status = ?,
                    workflow_stage = ?,
                    trust_status = ?,
                    required_action = ?,
                    required_actor_tenant_id = ?,
                    required_actor_role = ?,
                    required_proof_type = ?,
                    proof_request_id = NULL,
                    proof_response_id = COALESCE(?, proof_response_id),
                    consent_timestamp = COALESCE(?, consent_timestamp),
                    last_action_at = ?,
                    updated_at = ?
                WHERE id = ?
            `,
      ).run(
        nextStatus,
        nextStage,
        nextTrustStatus,
        nextRequiredAction,
        nextRequiredActorTenant,
        nextRequiredActorRole,
        nextRequiredProofType,
        body.proofResponseId ?? null,
        consentTs,
        now,
        now,
        transactionId,
      )

      appendArApWorkflowAction(db, {
        transactionId,
        actionType: body.transition,
        stageFrom: currentStage,
        stageTo: nextStage,
        actorTenantId,
        actorRole: String(tx.required_actor_role || 'actor'),
        proofResponseId: body.proofResponseId ?? null,
        consentTimestamp: consentTs,
        metadata: body.notes ? { notes: body.notes } : undefined,
      })

      if (nextRequiredAction && nextRequiredActorTenant && nextRequiredActorRole) {
        const orgTenantForAction =
          nextRequiredAction === 'record_payment' ? String(tx.payer_tenant_id) : String(tx.collector_tenant_id)

        this.upsertApWorkflowInboxAssignment(db, {
          transactionId,
          actorTenantId: nextRequiredActorTenant,
          actorRole: nextRequiredActorRole,
          orgTenantId: orgTenantForAction,
          requiredAction: nextRequiredAction,
          requiredProofType: nextRequiredProofType,
        })
      } else {
        this.resolveApWorkflowInboxAssignments(db, transactionId)
      }

      const updated = db
        .prepare('SELECT * FROM ar_ap_workflow_transactions WHERE id = ? LIMIT 1')
        .get(transactionId) as Record<string, unknown>
      const responsePayload = { transaction: updated }
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, actorTenantId, idempotencyAction, responsePayload)
      }
      IdempotencyGuard.record(db, naturalReplayKey, actorTenantId, idempotencyAction, responsePayload)
      return responsePayload
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * AP Ageing Analysis — groups outstanding invoices by how long they have been overdue.
   * Returns per-supplier buckets: current (0-30d), 31-60d, 61-90d, 90+d, and totals.
   */
  @Get('invoices/ageing')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getAgeingAnalysis(
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown>[] | { error: string }> {
    try {
      const buyerTenantId = this.getBuyerTenantId(request)
      const db = DatabaseManager.getDatabase()
      const now = Date.now()

      const invoices = db
        .prepare(
          `
                SELECT i.*, s.supplier_name
                FROM ap_invoices i
                JOIN ap_suppliers s ON s.id = i.supplier_id
                WHERE i.buyer_tenant_id = ? AND i.status != 'paid'
                ORDER BY s.supplier_name, i.due_date ASC
            `,
        )
        .all(buyerTenantId) as (ApInvoice & { supplier_name: string })[]

      // Group by supplier
      const bySupplier: Record<
        string,
        {
          supplierId: string
          supplierName: string
          current: number // 0-30 days
          days31to60: number
          days61to90: number
          days91plus: number
          total: number
          invoices: unknown[]
        }
      > = {}

      for (const inv of invoices) {
        if (!bySupplier[inv.supplier_id]) {
          bySupplier[inv.supplier_id] = {
            supplierId: inv.supplier_id,
            supplierName: inv.supplier_name,
            current: 0,
            days31to60: 0,
            days61to90: 0,
            days91plus: 0,
            total: 0,
            invoices: [],
          }
        }
        const bucket = bySupplier[inv.supplier_id]
        bucket.total += inv.balance_due
        bucket.invoices.push(inv)

        const dueDateMs = inv.due_date ? new Date(inv.due_date).getTime() : new Date(inv.created_at).getTime()
        const daysOverdue = Math.floor((now - dueDateMs) / 86_400_000)

        if (daysOverdue <= 30) bucket.current += inv.balance_due
        else if (daysOverdue <= 60) bucket.days31to60 += inv.balance_due
        else if (daysOverdue <= 90) bucket.days61to90 += inv.balance_due
        else bucket.days91plus += inv.balance_due
      }

      const rows = Object.values(bySupplier)

      // Grand totals row
      const grandTotal = {
        supplierId: '__total__',
        supplierName: 'TOTAL',
        current: rows.reduce((s, r) => s + r.current, 0),
        days31to60: rows.reduce((s, r) => s + r.days31to60, 0),
        days61to90: rows.reduce((s, r) => s + r.days61to90, 0),
        days91plus: rows.reduce((s, r) => s + r.days91plus, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
        invoices: [],
      }

      return [...rows, grandTotal]
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  // ─── Payment recording & VC issuance ─────────────────────────────────────

  /**
   * Record a payment against an AP invoice.
   * This will:
   *   1. Deduct the payment from the invoice balance_due
   *   2. Update invoice status (partial / paid)
   *   3. Issue a RemittanceAdviceVC to the buyer (proof of payment made)
   *   4. If supplier has a wallet → push RemittanceAdviceVC to their wallet inbox
   *   5. Send WhatsApp/Email notification to supplier with remaining balance
   */
  @Post('payments')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async recordPayment(
    @Body() body: RecordPaymentRequest,
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      this.assertOrgRole(request)
      const buyerTenantId = this.getBuyerTenantId(request)
      requireDeviceTrust({
        request,
        orgTenantId: buyerTenantId,
        stageAction: 'record_payment',
        body,
        transaction: { apInvoiceId: body.apInvoiceId, amountPaid: body.amountPaid, currency: body.currency || '' },
      })
      const db = DatabaseManager.getDatabase()

      const idempotencyAction = `ap:record-payment:${body.apInvoiceId}`
      const idempotencyCheck = IdempotencyGuard.guard(db, request, buyerTenantId, idempotencyAction)
      if (idempotencyCheck.duplicate) {
        return idempotencyCheck.response
      }

      const naturalReplayKey = this.getNaturalReplayKey(
        'record-payment',
        buyerTenantId,
        `${body.apInvoiceId}:${body.amountPaid}:${body.currency || ''}:${body.paymentMethod || ''}:${body.reference || ''}`,
      )
      const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, buyerTenantId, idempotencyAction)
      if (naturalReplay) {
        return naturalReplay.response
      }

      const idempotencyStorageKey = idempotencyCheck.key || naturalReplayKey

      const replayedPayment = db
        .prepare(
          `
                SELECT p.*, i.status AS invoice_status, i.balance_due
                FROM ap_payments p
                JOIN ap_invoices i ON i.id = p.ap_invoice_id
                WHERE p.idempotency_key = ?
                  AND p.buyer_tenant_id = ?
                  AND p.ap_invoice_id = ?
                LIMIT 1
            `,
        )
        .get(idempotencyStorageKey, buyerTenantId, body.apInvoiceId) as
        | (ApPayment & {
            invoice_status?: string
            balance_due?: number
          })
        | undefined
      if (replayedPayment) {
        const replayAcknowledgeUrl = replayedPayment.acknowledge_token
          ? `/api/finance/ap/acknowledge/${replayedPayment.id}?token=${replayedPayment.acknowledge_token}`
          : null
        return {
          paymentId: replayedPayment.id,
          amountPaid: replayedPayment.amount_paid,
          remainingBalance: replayedPayment.balance_due ?? 0,
          invoiceStatus: replayedPayment.invoice_status ?? 'partial',
          currency: replayedPayment.currency,
          remittanceVcId: replayedPayment.remittance_vc_id,
          acknowledgeUrl: replayAcknowledgeUrl,
          supplierNotified: null,
          supplierNotificationState: 'unknown',
        }
      }

      // Validate supplier and invoice belong to this buyer
      const supplier = db
        .prepare('SELECT * FROM ap_suppliers WHERE id = ? AND buyer_tenant_id = ?')
        .get(body.supplierId, buyerTenantId) as ApSupplier | undefined
      if (!supplier) {
        this.setStatus(404)
        return { error: 'Supplier not found' }
      }

      const invoice = db
        .prepare('SELECT * FROM ap_invoices WHERE id = ? AND supplier_id = ? AND buyer_tenant_id = ?')
        .get(body.apInvoiceId, body.supplierId, buyerTenantId) as ApInvoice | undefined
      if (!invoice) {
        this.setStatus(404)
        return { error: 'AP invoice not found' }
      }
      if (invoice.status === 'paid') {
        this.setStatus(409)
        return { error: 'Invoice is already fully paid' }
      }
      if (invoice.status === 'disputed' || invoice.match_status === 'disputed') {
        this.setStatus(409)
        return { error: 'The order, receipt and supplier bill do not agree. Resolve the mismatch before paying.' }
      }

      const amountPaid = requirePositiveMoney(body.amountPaid, 'Payment amount')
      const invoiceCurrency = requireCurrency(invoice.currency)
      const currency = body.currency === undefined ? invoiceCurrency : requireCurrency(body.currency)
      if (currency !== invoiceCurrency) {
        throw new StatusException(`Payment currency must be ${invoiceCurrency}`, 409)
      }
      if (amountPaid > Number(invoice.balance_due)) {
        throw new StatusException('Payment amount exceeds the remaining invoice balance', 409)
      }
      const newBalance = Math.max(0, invoice.balance_due - amountPaid)
      const newStatus: 'paid' | 'partial' = newBalance === 0 ? 'paid' : 'partial'
      const now = new Date().toISOString()
      const paymentId = `APPAY-${randomUUID().substring(0, 8).toUpperCase()}`
      const acknowledgeToken = randomUUID().replace(/-/g, '')
      let settlementAllocationId: string | undefined
      let paymentProof: ReturnType<typeof readReceiptProof>
      try {
        paymentProof = readReceiptProof(body, 'Proof of payment')
      } catch (error: any) {
        throw new StatusException(error?.message || 'Proof of payment is not valid', 400)
      }

      // Buyer org name
      const buyerTenant = getTenantById(buyerTenantId)
      const buyerName = buyerTenant?.label ?? 'Buyer'

      try {
        db.transaction(() => {
          // Step 1: Deduct balance and update invoice status (compare-and-set to avoid races)
          const invoiceUpdate = db
            .prepare(
              `
                        UPDATE ap_invoices
                        SET balance_due = ?, status = ?, workflow_stage = ?, last_action_at = ?, updated_at = ?
                        WHERE id = ?
                          AND supplier_id = ?
                          AND buyer_tenant_id = ?
                          AND status != 'paid'
                          AND balance_due = ?
                    `,
            )
            .run(
              newBalance,
              newStatus,
              newStatus === 'paid' ? 'paid' : 'payment_recorded',
              now,
              now,
              invoice.id,
              body.supplierId,
              buyerTenantId,
              invoice.balance_due,
            )

          if (invoiceUpdate.changes !== 1) {
            const latest = db
              .prepare(
                'SELECT status, balance_due FROM ap_invoices WHERE id = ? AND supplier_id = ? AND buyer_tenant_id = ?',
              )
              .get(invoice.id, body.supplierId, buyerTenantId) as { status?: string; balance_due?: number } | undefined

            if (!latest) {
              throw new StatusException('AP invoice not found', 404)
            }

            if (latest.status === 'paid' || Number(latest.balance_due || 0) <= 0) {
              throw new StatusException('Invoice is already fully paid', 409)
            }

            throw new StatusException('Invoice changed concurrently — retry payment with a new idempotency key', 409)
          }

          // Step 2: Record the payment row (without VC id yet)
          db.prepare(
            `
                        INSERT INTO ap_payments
                          (id, buyer_tenant_id, supplier_id, ap_invoice_id, amount_paid,
                           currency, payment_method, reference, proof_image_url,
                           proof_image_sha256, proof_record_json,
                           acknowledge_token, idempotency_key, paid_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
          ).run(
            paymentId,
            buyerTenantId,
            body.supplierId,
            body.apInvoiceId,
            amountPaid,
            currency,
            body.paymentMethod ?? null,
            body.reference ?? null,
            body.proofImageUrl ?? null,
            paymentProof.imageSha256 ?? null,
            paymentProof.record ? JSON.stringify(paymentProof.record) : null,
            acknowledgeToken,
            idempotencyStorageKey,
            now,
            now,
          )

          if (paymentProof.image && paymentProof.imageSha256) {
            db.prepare(
              `INSERT OR REPLACE INTO ap_payment_proof_images (payment_id, image_data, image_sha256, created_at)
               VALUES (?, ?, ?, ?)`,
            ).run(paymentId, paymentProof.image, paymentProof.imageSha256, now)
          }

          if (invoice.obligation_id) {
            settlementAllocationId = businessTransactionService.allocateSettlement({
              obligationId: invoice.obligation_id,
              settlementType: 'ap_payment',
              settlementId: paymentId,
              amount: amountPaid,
              currency,
              metadata: { reference: body.reference || undefined },
            })
            if (settlementAllocationId) {
              db.prepare(`UPDATE ap_payments SET settlement_allocation_id = ? WHERE id = ?`).run(
                settlementAllocationId,
                paymentId,
              )
            }
          }

          emitApPaymentEventOutbox({
            paymentId,
            invoiceId: invoice.id,
            buyerTenantId,
            supplierId: body.supplierId,
            amountPaid,
            currency,
            remainingBalance: newBalance,
            invoiceStatus: newStatus,
            paidAt: now,
            reference: body.reference ?? null,
            paymentMethod: body.paymentMethod ?? null,
          })

          emitApInvoiceStateEventOutbox({
            invoiceId: invoice.id,
            buyerTenantId,
            supplierId: body.supplierId,
            status: newStatus,
            balanceDue: newBalance,
            triggeredByPaymentId: paymentId,
            updatedAt: now,
          })
        })()
      } catch (txError) {
        const message = txError instanceof Error ? txError.message : String(txError)
        if (/UNIQUE constraint failed: ap_payments\.idempotency_key/i.test(message)) {
          const existingPayment = db
            .prepare(
              `
                        SELECT p.*, i.status AS invoice_status, i.balance_due
                        FROM ap_payments p
                        JOIN ap_invoices i ON i.id = p.ap_invoice_id
                        WHERE p.idempotency_key = ?
                          AND p.buyer_tenant_id = ?
                          AND p.ap_invoice_id = ?
                        LIMIT 1
                    `,
            )
            .get(idempotencyStorageKey, buyerTenantId, body.apInvoiceId) as
            | (ApPayment & {
                invoice_status?: string
                balance_due?: number
              })
            | undefined

          if (existingPayment) {
            const existingAcknowledgeUrl = existingPayment.acknowledge_token
              ? `/api/finance/ap/acknowledge/${existingPayment.id}?token=${existingPayment.acknowledge_token}`
              : null
            return {
              paymentId: existingPayment.id,
              amountPaid: existingPayment.amount_paid,
              remainingBalance: existingPayment.balance_due ?? 0,
              invoiceStatus: existingPayment.invoice_status ?? 'partial',
              currency: existingPayment.currency,
              remittanceVcId: existingPayment.remittance_vc_id,
              acknowledgeUrl: existingAcknowledgeUrl,
              supplierNotified: null,
              supplierNotificationState: 'unknown',
            }
          }
        }
        throw txError
      }
      const transaction = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE ap_invoice_id = ?
                LIMIT 1
            `,
        )
        .get(invoice.id) as Record<string, unknown> | undefined

      if (transaction?.id && typeof transaction.id === 'string') {
        const stageFrom = String(transaction.workflow_stage || 'issued')
        const nextStage = newStatus === 'paid' ? 'paid' : 'payment_recorded'
        const nextStatus = newStatus === 'paid' ? 'awaiting_ack' : 'partial_payment'
        const nextRequiredAction = newStatus === 'paid' ? 'acknowledge_remittance' : 'present_payment_proof'
        const actorOrgTenant =
          newStatus === 'paid'
            ? String(transaction.collector_tenant_id || buyerTenantId)
            : String(transaction.payer_tenant_id || buyerTenantId)
        const nextAssignment = this.resolveWorkflowActorTenant(actorOrgTenant, nextRequiredAction)
        const nextRequiredProofType = newStatus === 'paid' ? 'RemittanceAdviceVC' : 'PaymentProofVC'

        db.prepare(
          `
                    UPDATE ar_ap_workflow_transactions
                    SET
                        status = ?,
                        workflow_stage = ?,
                        trust_status = CASE WHEN ? = 'paid' THEN 'verified' ELSE trust_status END,
                        required_action = ?,
                        required_actor_tenant_id = ?,
                        required_actor_role = ?,
                        required_proof_type = ?,
                        proof_response_id = ?,
                        consent_timestamp = ?,
                        last_action_at = ?,
                        updated_at = ?
                    WHERE id = ?
                `,
        ).run(
          nextStatus,
          nextStage,
          nextStage,
          nextRequiredAction,
          nextAssignment.tenantId,
          nextAssignment.role,
          nextRequiredProofType,
          paymentId,
          now,
          now,
          now,
          transaction.id,
        )

        appendArApWorkflowAction(db, {
          transactionId: transaction.id,
          actionType: 'payment_recorded',
          stageFrom,
          stageTo: nextStage,
          actorTenantId: buyerTenantId,
          actorRole: 'payer',
          proofResponseId: paymentId,
          consentTimestamp: now,
          metadata: {
            paymentId,
            amountPaid,
            currency,
            invoiceId: invoice.id,
          },
        })

        this.upsertApWorkflowInboxAssignment(db, {
          transactionId: transaction.id,
          actorTenantId: nextAssignment.tenantId,
          actorRole: nextAssignment.role,
          orgTenantId: actorOrgTenant,
          requiredAction: nextRequiredAction,
          requiredProofType: nextRequiredProofType,
        })
      }

      // Step 3: Issue RemittanceAdviceVC via OID4VC issuer
      const baseUrl = resolveConfiguredBaseUrl(
        [
          process.env.ISSUER_API_URL,
          process.env.PUBLIC_BASE_URL,
          process.env.BACKEND_BASE_URL,
          process.env.APP_EXTERNAL_URL,
          process.env.NGROK_URL,
        ],
        'Issuer API base URL',
      )

      const acknowledgeUrl = `${baseUrl}/api/finance/ap/acknowledge/${paymentId}?token=${acknowledgeToken}`

      let remittanceVcId: string | null = null
      try {
        const apiKey = getIssuerApiKey()
        const vcResponse = await fetch(`${baseUrl}/custom-oidc/issuer/credential-offers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
            credentials: [
              {
                credentialDefinitionId: 'RemittanceAdviceVC',
                format: 'jwt_vc_json',
                type: ['VerifiableCredential', 'RemittanceAdviceVC'],
                claims: {
                  paymentId,
                  invoiceRef: invoice.invoice_ref,
                  buyerName,
                  supplierName: supplier.supplier_name,
                  amountPaid,
                  currency,
                  remainingBalance: newBalance,
                  paymentMethod: body.paymentMethod ?? 'unspecified',
                  reference: body.reference ?? null,
                  paidAt: now,
                  acknowledgeUrl,
                  invoiceStatus: newStatus,
                  ...(paymentProof.imageSha256 && { proofImageSha256: paymentProof.imageSha256 }),
                  ...(paymentProof.record && {
                    proofCredentialId: paymentProof.record.id,
                    proofCredentialType: paymentProof.record.type,
                  }),
                },
              },
            ],
          }),
        })
        if (vcResponse.ok) {
          const vcData = (await vcResponse.json()) as Record<string, unknown>
          remittanceVcId = (vcData?.credentialId ?? vcData?.id ?? paymentId) as string

          // Update payment row with VC id
          db.prepare('UPDATE ap_payments SET remittance_vc_id = ? WHERE id = ?').run(remittanceVcId, paymentId)

          // Step 4: Push VC to supplier wallet if they have one
          if (supplier.supplier_wallet_tenant_id) {
            const offerUri = (vcData?.credential_offer_uri ?? vcData?.offerUrl ?? vcData?.offer_uri) as
              | string
              | undefined
            if (offerUri) {
              db.prepare(
                `
                                INSERT INTO wallet_pending_offers
                                  (id, tenant_id, issuer_tenant_id, source_type, source_id,
                                   credential_type, offer_uri, title, body, metadata, created_at)
                                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                                WHERE NOT EXISTS (
                                  SELECT 1 FROM wallet_pending_offers
                                  WHERE tenant_id = ? AND source_type = 'ap_payment' AND source_id = ?
                                )
                            `,
              ).run(
                randomUUID(),
                supplier.supplier_wallet_tenant_id,
                buyerTenantId,
                'ap_payment',
                paymentId,
                'RemittanceAdviceVC',
                offerUri,
                `Payment Received from ${buyerName}`,
                `${buyerName} has paid ${amountPaid} ${currency}. Remaining balance: ${newBalance} ${currency}.`,
                JSON.stringify({
                  paymentId,
                  buyerTenantId,
                  buyerName,
                  invoiceRef: invoice.invoice_ref,
                  amountPaid,
                  currency,
                  remainingBalance: newBalance,
                  acknowledgeUrl,
                }),
                now,
                supplier.supplier_wallet_tenant_id,
                paymentId,
              )

              outboxService.enqueue({
                topic: 'wallet.vc.offered',
                aggregateKey: supplier.supplier_wallet_tenant_id,
                dedupeKey: `wpo:${supplier.supplier_wallet_tenant_id}:ap_payment:${paymentId}:RemittanceAdviceVC`,
                payload: {
                  tenantId: supplier.supplier_wallet_tenant_id,
                  issuerTenantId: buyerTenantId,
                  sourceType: 'ap_payment',
                  sourceId: paymentId,
                  credentialType: 'RemittanceAdviceVC',
                  offerUri: offerUri.slice(0, 300),
                  queuedAt: now,
                },
              })
            }
          }
        }
      } catch (vcErr) {
        logger.warn(
          { paymentId, err: this.getErrorMessage(vcErr) },
          'RemittanceAdviceVC issuance failed — payment still recorded',
        )
      }

      // Step 5: WhatsApp / Email notification to supplier (always fires regardless of wallet)
      const supplierContact = {
        name: supplier.supplier_name,
        phone: supplier.supplier_phone ?? undefined,
        email: supplier.supplier_email ?? undefined,
      }
      let supplierNotification: Awaited<ReturnType<typeof notificationService.dispatchRemittanceNotification>> = {
        accepted: false,
        channels: [],
      }
      if (supplierContact.phone || supplierContact.email) {
        supplierNotification = await notificationService
          .dispatchRemittanceNotification({
            tenantId: buyerTenantId,
            dedupeKey: `remittance:${paymentId}`,
            contact: supplierContact,
            buyerName,
            amountPaid,
            currency,
            remainingBalance: newBalance,
            invoiceRef: invoice.invoice_ref,
            acknowledgeUrl,
          })
          .catch(() => ({ accepted: false, channels: [] }))
      }

      logger.info(
        { paymentId, buyerTenantId, supplierId: body.supplierId, amountPaid, newBalance, newStatus },
        'AP payment recorded',
      )

      const responsePayload = {
        paymentId,
        amountPaid,
        remainingBalance: newBalance,
        invoiceStatus: newStatus,
        currency,
        remittanceVcId,
        acknowledgeUrl,
        supplierNotified: supplierNotification.accepted,
        supplierNotificationChannels: supplierNotification.channels,
      }

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, buyerTenantId, idempotencyAction, responsePayload)
      }
      IdempotencyGuard.record(db, naturalReplayKey, buyerTenantId, idempotencyAction, responsePayload)
      return responsePayload
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  /**
   * List all payments made by the calling buyer org.
   */
  @Get('payments')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listPayments(
    @Request() request: ExRequest,
    @Query() supplierId?: string,
  ): Promise<ApPayment[] | { error: string }> {
    try {
      const buyerTenantId = this.getBuyerTenantId(request)
      const db = DatabaseManager.getDatabase()
      let query = 'SELECT * FROM ap_payments WHERE buyer_tenant_id = ?'
      const params: unknown[] = [buyerTenantId]
      if (supplierId) {
        query += ' AND supplier_id = ?'
        params.push(supplierId)
      }
      query += ' ORDER BY paid_at DESC'
      return db.prepare(query).all(...params) as ApPayment[]
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  // ─── Mutual Ledger / Supplier Statement ──────────────────────────────────

  /**
   * Supplier Statement — the mutual ledger view showing all invoices and payments
   * for one supplier relationship. Both buyer and supplier should see the same picture.
   */
  @Get('supplier-statement/{supplierId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getSupplierStatement(
    @Path() supplierId: string,
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const buyerTenantIds = this.getBuyerTenantCandidateIds(request)
      const db = DatabaseManager.getDatabase()
      const placeholders = buyerTenantIds.map(() => '?').join(', ')

      const supplier = db
        .prepare(`SELECT * FROM ap_suppliers WHERE id = ? AND buyer_tenant_id IN (${placeholders})`)
        .get(supplierId, ...buyerTenantIds) as ApSupplier | undefined
      if (!supplier) {
        this.setStatus(404)
        return { error: 'Supplier not found' }
      }

      const invoices = db
        .prepare('SELECT * FROM ap_invoices WHERE supplier_id = ? ORDER BY created_at ASC')
        .all(supplierId) as ApInvoice[]

      const payments = db
        .prepare('SELECT * FROM ap_payments WHERE supplier_id = ? ORDER BY paid_at ASC')
        .all(supplierId) as ApPayment[]

      const paymentsByInvoice = new Map<string, ApPayment[]>()
      for (const payment of payments) {
        const key = String(payment.ap_invoice_id)
        const current = paymentsByInvoice.get(key) || []
        current.push(payment)
        paymentsByInvoice.set(key, current)
      }

      const invoicesWithPayments = invoices.map((invoice) => {
        const invoicePayments = paymentsByInvoice.get(invoice.id) || []
        return {
          ...invoice,
          paymentHistory: invoicePayments.map((payment) => ({
            id: payment.id,
            amountPaid: payment.amount_paid,
            currency: payment.currency,
            paidAt: payment.paid_at,
            paymentMethod: payment.payment_method,
            reference: payment.reference,
            remittanceVcId: payment.remittance_vc_id,
            supplierAcknowledgedAt: payment.supplier_acknowledged_at,
          })),
        }
      })

      const workflowTransactions = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE supplier_id = ?
                ORDER BY updated_at DESC
            `,
        )
        .all(supplierId) as Record<string, unknown>[]

      const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0)
      const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0)
      const totalOutstanding = totalInvoiced - totalPaid
      const pendingAcknowledgments = payments.filter((p) => !p.supplier_acknowledged_at).length

      const latestArApTx = workflowTransactions.find((tx) => String(tx.source_type || '') === 'ar_collection')
      let counterpartySettlement: Record<string, unknown> | null = null
      if (latestArApTx) {
        const sourcePlanId = String(latestArApTx.source_plan_id || '').trim() || null
        const apInvoiceId = String(latestArApTx.ap_invoice_id || '').trim() || null
        const counterpartInvoice = apInvoiceId
          ? (db
              .prepare(
                `
                        SELECT id, invoice_ref, amount, currency, status, balance_due, workflow_stage
                        FROM ap_invoices
                        WHERE id = ?
                        LIMIT 1
                    `,
              )
              .get(apInvoiceId) as Record<string, unknown> | undefined)
          : undefined

        counterpartySettlement = {
          settlementType: 'ar_ap_counterparty',
          direction: 'payable',
          sourceType: String(latestArApTx.source_type || 'ar_collection'),
          sourcePlanId,
          sourcePaymentLinkId: String(latestArApTx.source_payment_link_id || '') || null,
          amount: Number(latestArApTx.amount || 0),
          currency: String(latestArApTx.currency || invoices[0]?.currency || 'USD'),
          workflow: {
            transactionId: String(latestArApTx.id || ''),
            status: String(latestArApTx.status || ''),
            stage: String(latestArApTx.workflow_stage || ''),
            trustStatus: String(latestArApTx.trust_status || ''),
            requiredAction: String(latestArApTx.required_action || '') || null,
            requiredActorRole: String(latestArApTx.required_actor_role || '') || null,
            requiredProofType: String(latestArApTx.required_proof_type || '') || null,
          },
          arSide: {
            planId: sourcePlanId,
          },
          apSide: {
            supplierId,
            invoiceId: apInvoiceId,
            invoiceRef: counterpartInvoice ? String(counterpartInvoice.invoice_ref || '') || null : null,
            invoiceStatus: counterpartInvoice ? String(counterpartInvoice.status || '') : null,
            invoiceWorkflowStage: counterpartInvoice ? String(counterpartInvoice.workflow_stage || '') : null,
            balanceDue: counterpartInvoice ? Number(counterpartInvoice.balance_due || 0) : null,
          },
          summary: {
            totalInvoiced,
            totalPaid,
            totalOutstanding,
            pendingAcknowledgments,
          },
          links: {
            arPlanPath: sourcePlanId ? `/finance/ar/${encodeURIComponent(sourcePlanId)}` : null,
            apSupplierPath: `/finance/payables/${encodeURIComponent(supplierId)}`,
          },
        }
      }

      const actionLookup = db.prepare(`
                SELECT *
                FROM ar_ap_workflow_actions
                WHERE transaction_id = ?
                ORDER BY created_at DESC
            `)

      return {
        supplier,
        invoices: invoicesWithPayments,
        payments,
        workflowTransactions: workflowTransactions.map((tx) => ({
          ...tx,
          recentActions: (actionLookup.all(String(tx.id || '')) as WorkflowActionRow[]).map((action) => ({
            id: action.id,
            actionType: action.action_type,
            stageFrom: action.stage_from,
            stageTo: action.stage_to,
            actorTenantId: action.actor_tenant_id,
            actorRole: action.actor_role,
            metadata: parseJsonObject(action.metadata),
            createdAt: action.created_at,
          })),
        })),
        counterpartySettlement,
        summary: {
          totalInvoiced,
          totalPaid,
          totalOutstanding,
          pendingAcknowledgments,
          currency: invoices[0]?.currency ?? 'USD',
        },
        generatedAt: new Date().toISOString(),
      }
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  // ─── Supplier-side: Acknowledgment (no auth — token-gated) ───────────────

  /**
   * Public endpoint for suppliers to acknowledge receipt of a remittance.
   * No JWT required — supplier taps the link from WhatsApp/wallet notification.
   * Token is time-limited and single-use per payment.
   */
  @Post('acknowledge/{paymentId}')
  public async acknowledgePayment(
    @Path() paymentId: string,
    @Body() body: AcknowledgeRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const db = DatabaseManager.getDatabase()
      const payment = db
        .prepare('SELECT * FROM ap_payments WHERE id = ? AND acknowledge_token = ?')
        .get(paymentId, body.token) as ApPayment | undefined

      if (!payment) {
        this.setStatus(404)
        return { error: 'Payment not found or invalid token' }
      }
      if (payment.supplier_acknowledged_at) {
        return {
          alreadyAcknowledged: true,
          acknowledgedAt: payment.supplier_acknowledged_at,
          message: 'This payment has already been acknowledged.',
        }
      }

      const now = new Date().toISOString()
      db.prepare('UPDATE ap_payments SET supplier_acknowledged_at = ? WHERE id = ?').run(now, paymentId)

      db.prepare('UPDATE ap_invoices SET workflow_stage = ?, last_action_at = ?, updated_at = ? WHERE id = ?').run(
        'acknowledged',
        now,
        now,
        payment.ap_invoice_id,
      )

      const tx = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE ap_invoice_id = ?
                LIMIT 1
            `,
        )
        .get(payment.ap_invoice_id) as Record<string, unknown> | undefined

      if (tx?.id && typeof tx.id === 'string') {
        const stageFrom = String(tx.workflow_stage || 'paid')
        const collectorTenantId = String(tx.collector_tenant_id || '')
        const assignment = this.resolveWorkflowActorTenant(collectorTenantId, 'issue_receipt_vc')
        db.prepare(
          `
                    UPDATE ar_ap_workflow_transactions
                    SET
                        status = 'acknowledged',
                        workflow_stage = 'acknowledged',
                        trust_status = 'verified',
                        required_action = 'issue_receipt_vc',
                        required_actor_tenant_id = ?,
                        required_actor_role = ?,
                        required_proof_type = 'ReceiptVC',
                        consent_timestamp = COALESCE(consent_timestamp, ?),
                        last_action_at = ?,
                        updated_at = ?
                    WHERE id = ?
                `,
        ).run(assignment.tenantId, assignment.role, now, now, now, tx.id)

        appendArApWorkflowAction(db, {
          transactionId: tx.id,
          actionType: 'supplier_acknowledged',
          stageFrom,
          stageTo: 'acknowledged',
          actorTenantId: null,
          actorRole: 'supplier',
          consentTimestamp: now,
          metadata: {
            paymentId,
            apInvoiceId: payment.ap_invoice_id,
          },
        })

        this.upsertApWorkflowInboxAssignment(db, {
          transactionId: tx.id,
          actorTenantId: assignment.tenantId,
          actorRole: assignment.role,
          orgTenantId: collectorTenantId,
          requiredAction: 'issue_receipt_vc',
          requiredProofType: 'ReceiptVC',
        })
      }

      // Fetch updated invoice for remaining balance
      const invoice = db.prepare('SELECT * FROM ap_invoices WHERE id = ?').get(payment.ap_invoice_id) as
        | ApInvoice
        | undefined

      logger.info({ paymentId, acknowledgedAt: now }, 'Supplier acknowledged AP payment')

      return {
        acknowledged: true,
        acknowledgedAt: now,
        paymentId,
        amountPaid: payment.amount_paid,
        currency: payment.currency,
        remainingBalance: invoice?.balance_due ?? 0,
        invoiceStatus: invoice?.status ?? 'unknown',
        message: 'Thank you — your acknowledgment has been recorded.',
      }
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }

  // ─── Holder/Supplier wallet view ──────────────────────────────────────────

  /**
   * Returns all RemittanceAdviceVC-sourced payments received by the calling user (supplier side).
   * Used in the holder "What I'm Owed" view on portal and mobile.
   */
  @Get('my-remittances')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getMyRemittances(@Request() request: ExRequest): Promise<Record<string, unknown>[] | { error: string }> {
    try {
      const walletTenantId = this.getBuyerTenantId(request) // caller is the supplier/holder
      const db = DatabaseManager.getDatabase()

      // Find all payments where this tenant is the supplier wallet
      const payments = db
        .prepare(
          `
                SELECT p.*, s.supplier_name, s.buyer_tenant_id,
                       i.invoice_ref, i.amount AS invoice_amount, i.balance_due, i.status AS invoice_status
                FROM ap_payments p
                JOIN ap_suppliers s ON s.id = p.supplier_id
                JOIN ap_invoices i ON i.id = p.ap_invoice_id
                WHERE s.supplier_wallet_tenant_id = ?
                ORDER BY p.paid_at DESC
            `,
        )
        .all(walletTenantId) as Record<string, unknown>[]

      // Group by buyer to show per-buyer outstanding balances
      const byBuyer: Record<
        string,
        {
          buyerTenantId: string
          buyerName: string
          payments: Record<string, unknown>[]
          totalReceived: number
          totalStillOwed: number
        }
      > = {}

      for (const p of payments) {
        const btid = p.buyer_tenant_id as string
        if (!byBuyer[btid]) {
          const buyerTenant = getTenantById(btid)
          byBuyer[btid] = {
            buyerTenantId: btid,
            buyerName: buyerTenant?.label ?? btid,
            payments: [],
            totalReceived: 0,
            totalStillOwed: 0,
          }
        }
        byBuyer[btid].payments.push(p)
        byBuyer[btid].totalReceived += p.amount_paid as number
        byBuyer[btid].totalStillOwed = Math.max(0, byBuyer[btid].totalStillOwed + (p.balance_due as number))
      }

      return Object.values(byBuyer)
    } catch (error) {
      this.setStatus(500)
      return { error: this.getErrorMessage(error) }
    }
  }
}

import type { ProofVcActionKey } from './ProofVcPolicyService'

import { createHash, randomUUID } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { compactReceiptRecord, readReceiptProof } from '../utils/receiptProof'

import { authorizationService } from './AuthorizationService'
import { orgEntitlementService } from './OrgEntitlementService'
import { orgSetupProfileService } from './OrgSetupProfileService'
import { orgWorkflowActorService } from './OrgWorkflowActorService'
import { requestContextValidator } from './RequestContextValidator'
import { experienceForRequest, requestExperienceDefinition, requestExperienceEvents } from './RequestExperienceService'
import { isActiveStageDelegate } from './WorkflowStageInboxService'

/** Request kinds that need the People & payroll module switched on for the organisation. */
export const PEOPLE_PAYROLL_REQUEST_TYPES = new Set(['hr.leave', 'finance.expense_claim'])
export const MODULE_OFF_MESSAGE =
  'Your organisation has not switched on People & payroll. Ask the owner to turn it on under Organization setup.'

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'in_fulfilment'
  | 'completed'
  | 'cancelled'

/**
 * A detail asked for when someone finishes an approved request. An `image` field is a live
 * photo of the paper (receipt, supplier bill); a receipt record from the person's wallet
 * (`receiptRecord`) stands in for the photo.
 */
export interface RequestNextStepField {
  name: 'receiptRef' | 'invoiceRef' | 'amountPaid' | 'receivedAmount' | 'amount' | 'receiptImage'
  label: string
  type: 'text' | 'number' | 'image'
  required?: boolean
  hint?: string
}

/** What was recorded when a purchase step was finished, as the request and the job show it. */
export interface RequestReceipt {
  receiptRef?: string
  billRef?: string
  amount?: number
  /** Photo of the receipt or bill, a data URL. */
  photoUri?: string
  sha256?: string
  /** A receipt record from the wallet that stood in for the photo. */
  record?: { id: string; type: string; label: string }
  recordedAt?: string
}

const RECEIPT_IMAGE_FIELD: RequestNextStepField = {
  name: 'receiptImage',
  label: 'Photo of the receipt',
  type: 'image',
  required: true,
  hint: 'Take a photo of the receipt, or use a receipt record from your wallet.',
}

/**
 * What an approved request still needs, as both apps show it: a purchase is marked bought
 * with its receipt, a purchase order is marked delivered with the supplier bill, a payment is
 * marked paid with its receipt. A request whose next step lives in a follow-on has none.
 */
export interface RequestNextStep {
  toStatus: 'completed'
  label: string
  hint: string
  fields: RequestNextStepField[]
}

const PURCHASE_STEP: Omit<RequestNextStep, 'toStatus'> = {
  label: 'Mark as bought',
  hint: 'Add the receipt number, what was paid, and a photo of the receipt.',
  fields: [
    { name: 'receiptRef', label: 'Receipt number', type: 'text', required: true },
    { name: 'amountPaid', label: 'Amount paid', type: 'number', required: true },
    RECEIPT_IMAGE_FIELD,
  ],
}

const NEXT_STEP_BY_TYPE: Record<string, Omit<RequestNextStep, 'toStatus'>> = {
  'procurement.requisition': PURCHASE_STEP,
  requisition: PURCHASE_STEP,
  'finance.purchase_order': {
    label: 'Mark as delivered',
    hint: 'Record what arrived, then add the supplier bill. The order, delivery and bill must agree before payment starts.',
    fields: [
      { name: 'receiptRef', label: 'Delivery or service receipt', type: 'text', required: true },
      { name: 'receivedAmount', label: 'Value received', type: 'number', required: true },
      {
        ...RECEIPT_IMAGE_FIELD,
        label: 'Photo of the delivery or service receipt',
        hint: 'Take a photo of the delivery note or completed-service record.',
      },
      { name: 'invoiceRef', label: 'Supplier bill number', type: 'text', required: true },
      { name: 'amount', label: 'Bill amount', type: 'number', required: true },
    ],
  },
  'finance.expense_claim': {
    label: 'Mark as paid back',
    hint: 'Pay the person back and add the payment reference.',
    fields: [
      { name: 'receiptRef', label: 'Payment reference', type: 'text', required: true },
      { name: 'amountPaid', label: 'Amount paid back', type: 'number', required: true },
    ],
  },
  'finance.payment_request': {
    label: 'Mark as paid',
    hint: 'Add the payment reference or the receipt the payee gave, with a photo of it.',
    fields: [
      { name: 'receiptRef', label: 'Receipt or payment reference', type: 'text', required: true },
      { name: 'amountPaid', label: 'Amount paid', type: 'number', required: true },
      {
        ...RECEIPT_IMAGE_FIELD,
        label: 'Photo of the receipt or payment confirmation',
        hint: 'Take a photo of the receipt or the payment confirmation, or use a receipt record from your wallet.',
      },
    ],
  },
}

const GENERIC_STEP: Omit<RequestNextStep, 'toStatus'> = {
  label: 'Mark as done',
  hint: 'Close this request once the work is finished.',
  fields: [],
}

/** Approval is the last step for these; nobody has to "finish" a leave request or a payout nudge. */
/**
 * Approved purchases the person who asked may finish themselves: whoever went to the shop (often
 * the field worker on the job) adds the receipt. The approval was someone else's; the receipt
 * photo or wallet receipt record is still required.
 */
const REQUESTER_FINISHES = new Set(['procurement.requisition', 'requisition'])

/**
 * Purchase and payment steps a person can confirm with their staff card, by request type and the
 * status the step moves to. Same proof keys as the older requisition screens and the job payout,
 * so one policy (Settings → proof cards) decides which cards each step accepts.
 */
const STAFF_CARD_STEPS: Record<string, Partial<Record<RequestStatus, ProofVcActionKey>>> = {
  'procurement.requisition': { approved: 'requisition_approval' },
  requisition: { approved: 'requisition_approval' },
  'finance.purchase_order': { approved: 'requisition_approval', completed: 'requisition_release' },
  'finance.payment_request': { approved: 'requisition_approval', completed: 'payment_record' },
}

export function staffCardStepFor(requestType: unknown, toStatus: unknown): ProofVcActionKey | undefined {
  return STAFF_CARD_STEPS[String(requestType || '').toLowerCase()]?.[String(toStatus || '') as RequestStatus]
}

const DONE_WHEN_APPROVED = new Set(['hr.leave', 'platform.general', 'finance.payout_request'])

/**
 * Requests a person can raise from Home, by hand. Everything else in `requests` is started by a
 * job or by an organisation screen. The keys are request types; the Request sheet on both apps
 * prints its own plain words for them (`requestCatalog.ts`).
 */
export const MEMBER_REQUEST_TYPES = [
  'hr.leave',
  'finance.expense_claim',
  'finance.payout_request',
  'procurement.requisition',
  'platform.general',
] as const

/** Plain inbox sentence for a hand-raised request, used when the request has no job family. */
const SUBMIT_BODY_BY_TYPE: Record<string, string> = {
  'hr.leave': 'A leave request is waiting for your decision.',
  'finance.expense_claim': 'An expense claim is waiting for your decision.',
  'finance.payout_request': 'The worker asks for the payment for this job to be released.',
  'procurement.requisition': 'An item or purchase request is waiting for your decision.',
  'platform.general': 'A request is waiting for your decision.',
}

export interface RequestOptionsMembership {
  orgTenantId: string
  orgName: string
  role: string
  /** Request types this person may raise to this organisation right now. */
  kinds: string[]
}

export interface RequestOptionsPayoutJob {
  workflowRunId: string
  orgTenantId: string
  orgName: string
  reference: string
  amount?: number
  currency?: string
  /** An open payout nudge already exists for this job. */
  alreadyAsked: boolean
}

export interface RequestOptionsRecord {
  item: 'staff_card' | 'receipts' | 'payslips'
  orgTenantId?: string
  orgName?: string
}

/** Everything the Request sheet needs for one person, across every organisation they belong to. */
export interface RequestOptions {
  memberships: RequestOptionsMembership[]
  payoutJobs: RequestOptionsPayoutJob[]
  records: RequestOptionsRecord[]
}

export interface RaiseRequestInput {
  subjectRef: string
  orgTenantId: string
  requestType: string
  title: string
  description?: string
  amount?: number
  currency?: string
  context?: Record<string, unknown>
  /** Expense claims: a live photo of the receipt (data URL). Kept on an event, not in the context. */
  receiptImage?: string
  /** Expense claims: a receipt record from the person's wallet standing in for the photo. */
  receiptRecord?: { id: string; type?: string; label?: string; issuer_name?: string }
}

export interface CreatePlatformRequestInput {
  tenantId: string
  subjectRef: string
  requestType: string
  title: string
  description?: string
  amount?: number
  currency?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  targetModule?: string
  context?: Record<string, unknown>
  items?: Array<{
    description: string
    quantity?: number
    unitPrice?: number
    itemType?: string
    metadata?: Record<string, unknown>
  }>
}

/**
 * Generic organizational request layer.
 *
 * Identity is resolved from the authenticated tenant + opaque subject reference.
 * Lifecycle transitions are authorized through the centralized SSI-aware
 * AuthorizationService; business modules do not implement their own RBAC logic.
 */
/** Why a member cannot decide a request that is waiting for a decision. */
export type RequestDecisionBlock = 'own_request' | 'own_request_no_other_approver' | 'not_stage_actor' | 'no_authority'

export class PlatformRequestService {
  public resolvePrincipal(tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const organization = db
      .prepare(
        `
      SELECT id
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      LIMIT 1
    `,
      )
      .get(tenantId) as { id?: string } | undefined

    if (!organization?.id) throw new Error('Organization context not found')

    const membership = db
      .prepare(
        `
      SELECT id
      FROM org_memberships
      WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'
      LIMIT 1
    `,
      )
      .get(tenantId, subjectRef) as { id?: string } | undefined

    if (!membership?.id) {
      throw new Error('Authenticated subject is not an active organization member')
    }

    const person = db
      .prepare(
        `
      SELECT p.id
      FROM people p
      WHERE p.organization_id = ? AND p.subject_ref = ? AND p.status = 'active'
      LIMIT 1
    `,
      )
      .get(organization.id, subjectRef) as { id?: string } | undefined

    if (person?.id) {
      return { organizationId: organization.id, personId: person.id }
    }

    const now = new Date().toISOString()
    const personId = randomUUID()
    db.prepare(
      `
      INSERT INTO people (id, organization_id, subject_ref, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `,
    ).run(personId, organization.id, subjectRef, now, now)

    return { organizationId: organization.id, personId }
  }

  public create(input: CreatePlatformRequestInput) {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(input.tenantId, input.subjectRef)
    const requestId = randomUUID()
    orgSetupProfileService.assertOperation(input.tenantId, input.requestType)

    if (
      PEOPLE_PAYROLL_REQUEST_TYPES.has(input.requestType) &&
      !orgEntitlementService.hasModule(input.tenantId, 'people_payroll')
    ) {
      throw new Error(MODULE_OFF_MESSAGE)
    }

    // Validate context_json before persisting — prevents credential material leakage
    const context = input.context ?? {}
    const contextValidation = requestContextValidator.validate(input.requestType, context)
    if (!contextValidation.valid) {
      throw new Error(`Invalid request context: ${contextValidation.errors.join('; ')}`)
    }

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO requests (
          id, organization_id, requester_person_id, request_type,
          title, description, amount, currency, priority,
          status, target_module, context_json
        ) VALUES (
          @id, @organizationId, @requesterPersonId, @requestType,
          @title, @description, @amount, @currency, @priority,
          'draft', @targetModule, @contextJson
        )
      `,
      ).run({
        id: requestId,
        organizationId: principal.organizationId,
        requesterPersonId: principal.personId,
        requestType: input.requestType,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        priority: input.priority ?? 'normal',
        targetModule: input.targetModule ?? null,
        contextJson: JSON.stringify(context),
      })

      for (const item of input.items ?? []) {
        db.prepare(
          `
          INSERT INTO request_items (
            id, request_id, item_type, description, quantity, unit_price, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          randomUUID(),
          requestId,
          item.itemType ?? 'line_item',
          item.description,
          item.quantity ?? 1,
          item.unitPrice ?? null,
          JSON.stringify(item.metadata ?? {}),
        )
      }

      this.recordEvent(requestId, 'request.created', principal.personId, null, 'draft', {
        requestType: input.requestType,
      })
    })()

    return this.getForSubject(requestId, input.tenantId, input.subjectRef)
  }

  public submit(requestId: string, tenantId: string, subjectRef: string) {
    return this.transitionBySubject(requestId, tenantId, subjectRef, 'submitted')
  }

  public transitionBySubject(
    requestId: string,
    tenantId: string,
    subjectRef: string,
    toStatus: RequestStatus,
    payload: Record<string, unknown> = {},
  ) {
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    return this.transition(requestId, tenantId, toStatus, principal.personId, payload, subjectRef)
  }

  public transition(
    requestId: string,
    tenantId: string,
    toStatus: RequestStatus,
    actorPersonId: string,
    payload: Record<string, unknown> = {},
    actorSubjectRef?: string,
  ) {
    const db = DatabaseManager.getDatabase()
    const current = db
      .prepare(
        `
      SELECT
        r.status,
        r.organization_id AS organizationId,
        r.requester_person_id AS requesterPersonId,
        r.department_id AS departmentId,
        r.amount,
        r.currency,
        r.request_type AS requestType,
        r.title,
        r.context_json AS contextJson
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `,
      )
      .get(requestId, tenantId) as
      | {
          status?: RequestStatus
          organizationId?: string
          requesterPersonId?: string
          departmentId?: string
          amount?: number
          currency?: string
          requestType?: string
          title?: string
          contextJson?: string
        }
      | undefined

    if (!current?.organizationId || !current.requesterPersonId) {
      throw new StatusException('Request not found', 404)
    }

    const allowed: Record<RequestStatus, RequestStatus[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['in_review', 'approved', 'rejected', 'cancelled'],
      in_review: ['approved', 'rejected', 'cancelled'],
      approved: ['in_fulfilment', 'completed', 'cancelled'],
      rejected: ['draft'],
      in_fulfilment: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }

    if (!allowed[current.status ?? 'draft'].includes(toStatus)) {
      throw new StatusException(`Invalid request transition: ${current.status} -> ${toStatus}`, 409)
    }

    let stored: Record<string, unknown> = payload
    let completionStep: RequestNextStep | undefined
    if (toStatus === 'completed') {
      completionStep = this.nextStepFor({ id: requestId, request_type: current.requestType, status: current.status })
      stored = this.checkCompletion(completionStep?.fields || [], payload)
    }

    const permissions: Partial<Record<RequestStatus, string>> = {
      submitted: 'request.submit',
      in_review: 'request.review',
      approved: 'request.approve',
      rejected: 'request.reject',
      in_fulfilment: 'request.fulfil',
      completed: 'request.complete',
      cancelled: 'request.cancel',
    }
    const permission = permissions[toStatus]
    const actorIsRequester = actorPersonId === current.requesterPersonId
    const requesterFinishes =
      actorIsRequester &&
      toStatus === 'completed' &&
      Boolean(completionStep) &&
      REQUESTER_FINISHES.has(String(current.requestType || '').toLowerCase())

    if (actorIsRequester && ['in_review', 'approved', 'rejected'].includes(toStatus)) {
      throw new StatusException('You raised this request, so someone else has to decide it.', 403)
    }
    if (['in_review', 'approved', 'rejected'].includes(toStatus)) {
      const subjectRef =
        actorSubjectRef ||
        (
          db
            .prepare('SELECT subject_ref AS subjectRef FROM people WHERE id = ? AND organization_id = ?')
            .get(actorPersonId, current.organizationId) as { subjectRef?: string } | undefined
        )?.subjectRef
      this.assertRequestStageActor({
        tenantId,
        requestType: current.requestType || 'general',
        subjectRef,
        amount: typeof current.amount === 'number' ? current.amount : undefined,
      })
    }

    if ((actorIsRequester && (toStatus === 'submitted' || toStatus === 'cancelled')) || requesterFinishes) {
      this.recordDecisionEvent(
        current.organizationId,
        actorPersonId,
        requestId,
        `request.${toStatus}`,
        'allow',
        requesterFinishes ? 'requester_bought' : 'requester_action',
      )
    } else {
      const context = this.parseContext(current.contextJson)
      const decisionFromStatus =
        current.status === 'submitted' && ['approved', 'rejected'].includes(toStatus) ? 'in_review' : current.status
      const separationOfDuties = this.getSeparationOfDuties(
        decisionFromStatus as RequestStatus,
        toStatus,
        current.requesterPersonId,
      )
      // Step-limited authority (Who does what access, area grants) matches on the workflow and step.
      const stage = requestExperienceDefinition(tenantId, current.requestType || 'general')
      const deciding = ['in_review', 'approved', 'rejected'].includes(toStatus)
      const decision = authorizationService.decide({
        tenantId,
        personId: actorPersonId,
        action: permission || `request.transition.${toStatus}`,
        requiredPermission: permission || `request.transition.${toStatus}`,
        resourceType: 'request',
        resourceId: requestId,
        amount: typeof current.amount === 'number' ? current.amount : undefined,
        currency: current.currency,
        departmentId: current.departmentId,
        projectRef: typeof context.projectRef === 'string' ? context.projectRef : undefined,
        costCentreRef: typeof context.costCentreRef === 'string' ? context.costCentreRef : undefined,
        workflowType: stage.workflowType,
        stageAction: deciding ? stage.definition.reviewAction : stage.definition.fulfilmentAction,
        separationOfDutiesPersonIds: separationOfDuties,
      })
      if (decision.decision !== 'allow') {
        throw new StatusException(`Insufficient authority: ${decision.reasonCode}`, 403)
      }
    }

    const now = new Date().toISOString()
    db.transaction(() => {
      const update = db
        .prepare(
          `
        UPDATE requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP,
            submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, ?) ELSE submitted_at END,
            completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
        WHERE id = ? AND COALESCE(status, 'draft') = ?
      `,
        )
        .run(toStatus, toStatus, now, toStatus, now, requestId, current.status ?? 'draft')

      if (update.changes !== 1) {
        throw new StatusException('Request changed before the decision could be recorded. Reload and try again.', 409)
      }

      if (current.status === 'submitted' && toStatus === 'approved') {
        this.recordEvent(requestId, 'request.status_changed', actorPersonId, 'submitted', 'in_review', {})
      }
      this.recordEvent(
        requestId,
        'request.status_changed',
        actorPersonId,
        current.status === 'submitted' && toStatus === 'approved' ? 'in_review' : (current.status ?? null),
        toStatus,
        stored,
      )

      // Once decided, the "waiting for your decision" cards leave every inbox.
      if (['approved', 'rejected', 'cancelled', 'completed'].includes(toStatus)) {
        db.prepare(
          `UPDATE wallet_pending_offers SET resolved_at = ?
           WHERE source_type = 'workflow_stage_action' AND resolved_at IS NULL
             AND (source_id = ? OR source_id LIKE ?)`,
        ).run(now, requestId, `${requestId}:delegation:%`)
      }
    })()

    if (toStatus === 'submitted' && current.requestType) {
      // A payout nudge carries its job so the card opens the job's payout step, not an approve form.
      const submitContext = this.parseContext(current.contextJson) as Record<string, unknown>
      const jobLink =
        current.requestType === 'finance.payout_request' && typeof submitContext.workflowRunId === 'string'
          ? { workflowRunId: submitContext.workflowRunId, requestStep: 'payout_nudge' }
          : {}
      void import('./WorkflowStageInboxService')
        .then(({ routeWorkflowStageInbox }) => {
          routeWorkflowStageInbox({
            orgTenantId: tenantId,
            requestType: current.requestType || 'platform.general',
            sourceId: requestId,
            title: current.title || current.requestType || 'Organization request',
            body: [
              this.familyCard(requestId).body ||
                SUBMIT_BODY_BY_TYPE[String(current.requestType)] ||
                `A ${String(current.requestType).replace(/[._]/g, ' ')} is waiting for the stage actor.`,
              current.requestType === 'finance.expense_claim' ? this.expenseReceiptLine(submitContext) : '',
            ]
              .filter(Boolean)
              .join(' '),
            departmentId: current.departmentId,
            extraMetadata: {
              ...(this.familyCard(requestId).extraMetadata || {}),
              ...jobLink,
              ...(current.requestType === 'finance.expense_claim' && {
                receiptLine: this.expenseReceiptLine(submitContext),
              }),
            },
            amount: typeof current.amount === 'number' ? current.amount : undefined,
          })
        })
        .catch((error: any) => {
          // Inbox routing must not roll back a committed request transition.
          void error
        })
    }

    // In order: start the follow-on (purchase order, supplier payment), close parents whose
    // whole chain is now done, tell whoever finishes an approved request, then let a job that
    // raised this purchase decide whether it continues.
    const followOn = async () => {
      let payableMatch: 'matched' | 'disputed' | 'settled' | undefined
      // A delivered purchase order records the supplier's bill; a paid supplier payment records
      // the payment against it. The ledger is written before the follow-on starts.
      if (toStatus === 'completed' && current.requestType) {
        const { accountsPayableLedgerService } = await import('./AccountsPayableLedgerService')
        payableMatch = accountsPayableLedgerService.recordFromRequestCompletion({
          tenantId,
          requestId,
          requestType: current.requestType,
          title: current.title,
          amount: current.amount,
          currency: current.currency,
          context: this.parseContext(current.contextJson),
          payload: stored,
        })
      }
      // A disputed three-way match records the receipt, bill and mismatch, but does not create a
      // supplier-payment request. Finance resolves the mismatch first.
      if (current.organizationId && current.requestType && payableMatch !== 'disputed') {
        const billed = toStatus === 'completed' && Number(payload.amount) > 0 ? Number(payload.amount) : undefined
        try {
          const { requestHandoffService } = await import('./RequestHandoffService')
          requestHandoffService.continueFromPlatformRequest({
            tenantId,
            organizationId: current.organizationId,
            requestId,
            requestType: current.requestType || '',
            toStatus,
            title: current.title,
            amount: billed ?? current.amount,
            currency: current.currency,
            departmentId: current.departmentId,
            context: { ...this.parseContext(current.contextJson), ...this.completionDetails(toStatus, payload) },
          })
        } catch {
          // A follow-on that cannot start never undoes the committed transition.
        }
      }
      if (toStatus === 'completed') this.closeFinishedParents(requestId)
      if (toStatus === 'approved') {
        await this.routeNextStepCard(requestId, tenantId)
        if (current.requestType === 'hr.leave' || current.requestType === 'finance.expense_claim') {
          await this.issueApprovalRecord(requestId)
        }
      }
      const { workflowHandoffService } = await import('./workflow/WorkflowHandoffService')
      await workflowHandoffService.onRequestStatus(requestId, toStatus)
    }
    void followOn().catch(() => undefined)

    // The transition has already passed authorization and committed atomically;
    // do not require a separate read permission merely to return its new state.
    return this.getForTenant(requestId, tenantId)
  }

  public decideBySubject(
    requestId: string,
    tenantId: string,
    subjectRef: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ) {
    if (decision === 'reject' && !String(reason || '').trim()) {
      throw new StatusException('Please provide a reason before rejecting this request', 400)
    }
    return this.transitionBySubject(
      requestId,
      tenantId,
      subjectRef,
      decision === 'approve' ? 'approved' : 'rejected',
      decision === 'reject' ? { reason: String(reason).trim() } : {},
    )
  }

  private assertRequestStageActor(input: {
    tenantId: string
    requestType: string
    subjectRef?: string
    amount?: number
  }): void {
    if (!input.subjectRef) {
      throw new StatusException('A signed-in organization member is required to decide this request', 403)
    }
    const resolved = requestExperienceDefinition(input.tenantId, input.requestType)
    const directActor = orgWorkflowActorService.mayAct({
      orgTenantId: input.tenantId,
      workflowType: resolved.workflowType,
      stageAction: resolved.definition.reviewAction,
      userId: input.subjectRef,
    }).allowed
    const assignedActor = orgWorkflowActorService.resolveActor({
      orgTenantId: input.tenantId,
      workflowType: resolved.workflowType,
      stageAction: resolved.definition.reviewAction,
    })
    const delegate = Boolean(
      assignedActor.userId &&
        isActiveStageDelegate({
          orgTenantId: input.tenantId,
          delegatorUserId: assignedActor.userId,
          delegateUserId: input.subjectRef,
          stageAction: resolved.definition.reviewAction,
          requestType: input.requestType,
          amount: input.amount,
        }),
    )
    if (!directActor && !delegate) {
      throw new StatusException('This request is waiting for its assigned stage actor', 403)
    }
  }

  private decisionContextFor(
    tenantId: string,
    subjectRef: string,
    personId: string,
    request: {
      id: string
      status?: string
      request_type?: string
      requester_person_id?: string
      amount?: number | null
      currency?: string | null
      department_id?: string | null
      context_json?: string
      updated_at?: string
    },
  ) {
    const status = String(request.status || '')
    const requestType = String(request.request_type || 'general')
    const lastEvent = DatabaseManager.getDatabase()
      .prepare('SELECT id FROM request_events WHERE request_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(request.id) as { id?: string } | undefined
    const definition = requestExperienceDefinition(tenantId, requestType)
    const stageActor = orgWorkflowActorService.resolveActor({
      orgTenantId: tenantId,
      workflowType: definition.workflowType,
      stageAction: definition.definition.reviewAction,
    })
    const members = orgWorkflowActorService.listOrgMembers(tenantId)
    const actorMember = stageActor.userId ? members.find((member) => member.userId === stageActor.userId) : undefined
    const activeDecisionStage = status === 'submitted' || status === 'in_review'
    const assigned = activeDecisionStage
      ? orgWorkflowActorService.mayAct({
          orgTenantId: tenantId,
          workflowType: definition.workflowType,
          stageAction: definition.definition.reviewAction,
          userId: subjectRef,
        }).allowed
      : false
    const delegated =
      activeDecisionStage &&
      Boolean(
        stageActor.userId &&
          isActiveStageDelegate({
            orgTenantId: tenantId,
            delegatorUserId: stageActor.userId,
            delegateUserId: subjectRef,
            stageAction: definition.definition.reviewAction,
            requestType,
            amount: typeof request.amount === 'number' ? request.amount : undefined,
          }),
      )
    const authorizedActor = assigned || delegated
    const requester = Boolean(request.requester_person_id && request.requester_person_id === personId)
    const context = this.parseContext(request.context_json)
    const decisionResult = (action: 'request.approve' | 'request.reject') => {
      const separationOfDuties = this.getSeparationOfDuties(
        'in_review',
        action === 'request.approve' ? 'approved' : 'rejected',
        request.requester_person_id || '',
      )
      const result = authorizationService.decide({
        tenantId,
        personId,
        action,
        requiredPermission: action,
        resourceType: 'request',
        resourceId: request.id,
        amount: typeof request.amount === 'number' ? request.amount : undefined,
        currency: request.currency || undefined,
        departmentId: request.department_id || undefined,
        projectRef: typeof context.projectRef === 'string' ? context.projectRef : undefined,
        costCentreRef: typeof context.costCentreRef === 'string' ? context.costCentreRef : undefined,
        workflowType: definition.workflowType,
        stageAction: definition.definition.reviewAction,
        separationOfDutiesPersonIds: separationOfDuties,
        skipAudit: true,
      })
      return result.decision === 'allow'
    }
    const canDecide = (action: 'request.approve' | 'request.reject') =>
      activeDecisionStage && authorizedActor && !requester ? decisionResult(action) : false
    const canApprove = canDecide('request.approve')
    const canReject = canDecide('request.reject')
    const othersCanDecide = () =>
      orgWorkflowActorService.listOrgMembers(tenantId).some(
        (member) =>
          member.userId !== subjectRef &&
          orgWorkflowActorService.mayAct({
            orgTenantId: tenantId,
            workflowType: definition.workflowType,
            stageAction: definition.definition.reviewAction,
            userId: member.userId,
          }).allowed,
      )
    // Why this person cannot decide, so the app can say it plainly instead of a generic wait.
    const blockedReason: RequestDecisionBlock | undefined =
      !activeDecisionStage || canApprove || canReject
        ? undefined
        : requester && authorizedActor
          ? othersCanDecide()
            ? 'own_request'
            : 'own_request_no_other_approver'
          : !authorizedActor
            ? 'not_stage_actor'
            : 'no_authority'

    return {
      version: lastEvent?.id || String(request.updated_at || status),
      stageAction: definition.definition.reviewAction,
      stageLabel: status === 'submitted' ? 'Review and decide' : 'Decision pending',
      actorLabel: delegated
        ? 'your delegated request authority'
        : actorMember?.displayName || actorMember?.role || stageActor.role || 'Organization approver',
      actorMode: stageActor.mode,
      canAct: activeDecisionStage && authorizedActor && !requester,
      canApprove,
      canReject,
      blockedReason,
      isRequester: requester,
      /** The approval can be confirmed with the person's staff card (purchase and payment steps). */
      staffCard: Boolean(staffCardStepFor(requestType, 'approved')),
    }
  }

  /**
   * Before a staff-card request is sent: the step takes a card, the request can move there now,
   * and a decision is the caller's to make. The move itself still runs every check in `transition`.
   */
  public staffCardStep(
    requestId: string,
    tenantId: string,
    subjectRef: string,
    toStatus: RequestStatus,
  ): { actionKey: ProofVcActionKey; requestType: string; title?: string } {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT r.status, r.request_type AS requestType, r.title, r.amount, r.requester_person_id AS requesterPersonId
           FROM requests r JOIN organizations o ON o.id = r.organization_id
          WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'`,
      )
      .get(requestId, tenantId) as
      | { status?: string; requestType?: string; title?: string; amount?: number; requesterPersonId?: string }
      | undefined
    if (!row) throw new StatusException('Request not found', 404)
    const actionKey = staffCardStepFor(row.requestType, toStatus)
    if (!actionKey) throw new StatusException('This step does not ask for a staff card.', 400)
    const waiting =
      toStatus === 'approved'
        ? ['submitted', 'in_review'].includes(String(row.status))
        : ['approved', 'in_fulfilment'].includes(String(row.status))
    if (!waiting) throw new StatusException('This request is not waiting for this step right now.', 409)
    if (toStatus === 'approved') {
      const principal = this.resolvePrincipal(tenantId, subjectRef)
      if (principal.personId === row.requesterPersonId) {
        throw new StatusException('You raised this request, so someone else has to decide it.', 403)
      }
      this.assertRequestStageActor({
        tenantId,
        requestType: row.requestType || 'general',
        subjectRef,
        amount: typeof row.amount === 'number' ? row.amount : undefined,
      })
    }
    return { actionKey, requestType: String(row.requestType || ''), title: row.title }
  }

  /**
   * What an approved request still needs, or undefined. A request that already started a
   * follow-on (purchase order, supplier payment) waits for that instead.
   */
  public nextStepFor(request: {
    id: string
    request_type?: string
    requestType?: string
    status?: string
  }): RequestNextStep | undefined {
    if (!['approved', 'in_fulfilment'].includes(String(request.status || ''))) return undefined
    if (DONE_WHEN_APPROVED.has(String(request.request_type || request.requestType || '').toLowerCase()))
      return undefined
    const liveChild = DatabaseManager.getDatabase()
      .prepare(`SELECT 1 FROM requests WHERE parent_request_id = ? AND status NOT IN ('rejected', 'cancelled') LIMIT 1`)
      .get(request.id)
    if (liveChild) return undefined
    const type = String(request.request_type || request.requestType || '').toLowerCase()
    const organization = DatabaseManager.getDatabase()
      .prepare(`SELECT o.tenant_id FROM requests r JOIN organizations o ON o.id = r.organization_id WHERE r.id = ?`)
      .get(request.id) as { tenant_id: string } | undefined
    if (organization && requestExperienceDefinition(organization.tenant_id, type).definition.decisionOnly)
      return undefined
    if (type === 'finance.purchase_order') {
      const row = DatabaseManager.getDatabase()
        .prepare(`SELECT context_json AS contextJson FROM requests WHERE id = ?`)
        .get(request.id) as { contextJson?: string } | undefined
      const context = this.parseContext(row?.contextJson)
      const receivingRequired =
        context.receivingRequired !== false && String(context.receivingRequired ?? 'yes') !== 'no'
      const service = String(context.itemType || context.purchaseKind || '').toLowerCase() === 'service'
      const receiptFields: RequestNextStepField[] = receivingRequired
        ? [
            {
              name: 'receiptRef',
              label: service ? 'Service completion reference' : 'Delivery receipt number',
              type: 'text',
              required: true,
            },
            {
              name: 'receivedAmount',
              label: service ? 'Value of service completed' : 'Value delivered',
              type: 'number',
              required: true,
            },
            {
              ...RECEIPT_IMAGE_FIELD,
              label: service ? 'Photo of the completed-service record' : 'Photo of the delivery receipt',
              hint: service
                ? 'Take a photo of the signed service completion record.'
                : 'Take a photo of the delivery note.',
            },
          ]
        : []
      return {
        toStatus: 'completed',
        label: receivingRequired
          ? service
            ? 'Confirm service and bill'
            : 'Confirm delivery and bill'
          : 'Record supplier bill',
        hint: receivingRequired
          ? `Record the ${service ? 'completed service' : 'delivery'} and supplier bill before payment starts.`
          : 'No separate receipt is required. The order and supplier bill must agree before payment starts.',
        fields: [
          ...receiptFields,
          { name: 'invoiceRef', label: 'Supplier bill number', type: 'text', required: true },
          { name: 'amount', label: 'Bill amount', type: 'number', required: true },
        ],
      }
    }
    return { toStatus: 'completed', ...(NEXT_STEP_BY_TYPE[type] || GENERIC_STEP) }
  }

  /**
   * Check what a finishing step asked for and return what is stored. Text and numbers must be
   * there; an image field needs a live photo (`receiptImage`, a data URL) or a receipt record
   * from the wallet (`receiptRecord`). The photo is sealed with its own fingerprint; the record
   * is kept as id, type and label only.
   */
  private checkCompletion(fields: RequestNextStepField[], payload: Record<string, unknown>): Record<string, unknown> {
    const stored: Record<string, unknown> = { ...payload }
    delete stored.receiptImage
    delete stored.receiptRecord
    for (const field of fields) {
      const value = payload[field.name]
      if (field.type === 'image') {
        const proof = readReceiptProof({ receiptImage: value, receiptRecord: payload.receiptRecord }, field.label)
        if (proof.image) {
          stored.receiptImage = proof.image
          stored.receiptImageSha256 = proof.imageSha256
        } else if (proof.record) {
          stored.receiptRecord = proof.record
        } else if (field.required) {
          throw new Error(`${field.label} is needed, or a receipt record from your wallet.`)
        }
        continue
      }
      const missing = field.type === 'number' ? !(Number(value) > 0) : !String(value ?? '').trim()
      if (field.required && missing) throw new Error(`${field.label} is required.`)
    }
    return stored
  }

  private compactRecord(raw: unknown): { id: string; type: string; label: string } | undefined {
    return compactReceiptRecord(raw)
  }

  /**
   * The receipt the person attached when they raised the request (an expense claim): the wallet
   * record and photo fingerprint sit on the request; the photo itself on the attach event.
   */
  public raisedReceipt(requestId: string, withPhoto = true): RequestReceipt | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(`SELECT context_json AS contextJson, created_at AS createdAt FROM requests WHERE id = ?`)
      .get(requestId) as { contextJson?: string; createdAt?: string } | undefined
    if (!row) return undefined
    const context = this.parseContext(row.contextJson)
    const record = compactReceiptRecord(context.receiptRecord)
    const sha256 = typeof context.receiptImageSha256 === 'string' ? context.receiptImageSha256 : undefined
    const receiptRef = String(context.receiptRef ?? '').trim() || undefined
    if (!record && !sha256 && !receiptRef) return undefined
    let photoUri: string | undefined
    if (withPhoto && sha256) {
      const event = db
        .prepare(
          `SELECT payload_json AS payloadJson FROM request_events
           WHERE request_id = ? AND event_type = 'request.receipt_attached' ORDER BY created_at DESC LIMIT 1`,
        )
        .get(requestId) as { payloadJson?: string } | undefined
      try {
        const payload = event?.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : {}
        if (typeof payload.receiptImage === 'string' && payload.receiptImageSha256 === sha256) {
          photoUri = payload.receiptImage
        }
      } catch {
        photoUri = undefined
      }
    }
    return { receiptRef, photoUri, sha256, record, recordedAt: row.createdAt }
  }

  /** What the approver is told about the receipt behind an expense claim. */
  private expenseReceiptLine(context: Record<string, unknown>): string {
    const record = compactReceiptRecord(context.receiptRecord)
    const receiptRef = String(context.receiptRef ?? '').trim()
    const number = receiptRef ? ` (no. ${receiptRef})` : ''
    if (record) return `Receipt: ${record.label}${number}, from their wallet.`
    if (typeof context.receiptImageSha256 === 'string' && context.receiptImageSha256)
      return `Receipt photo attached${number}.`
    if (receiptRef) return `Receipt no. ${receiptRef}; no photo attached.`
    return 'No receipt attached.'
  }

  /** The receipt an approved expense record points at (only the claims that are present). */
  private expenseReceiptLink(context: Record<string, unknown>): Record<string, string> {
    const link: Record<string, string> = {}
    const merchant = String(context.merchantRef ?? '').trim()
    const receiptRef = String(context.receiptRef ?? '').trim()
    const record = compactReceiptRecord(context.receiptRecord)
    const sha = typeof context.receiptImageSha256 === 'string' ? context.receiptImageSha256 : ''
    if (merchant) link.merchant = merchant
    if (receiptRef) link.receiptRef = receiptRef
    if (record) {
      link.receiptCredentialId = record.id
      link.receiptCredentialType = record.type
    }
    if (sha) link.receiptImageSha256 = sha
    return link
  }

  /** What was recorded when this request was marked bought, delivered or paid. */
  public completionReceipt(requestId: string): RequestReceipt | undefined {
    const event = DatabaseManager.getDatabase()
      .prepare(
        `SELECT payload_json AS payloadJson, created_at AS createdAt FROM request_events
         WHERE request_id = ? AND event_type = 'request.status_changed' AND to_status = 'completed'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(requestId) as { payloadJson?: string; createdAt?: string } | undefined
    if (!event?.payloadJson) return undefined
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(event.payloadJson) as Record<string, unknown>
    } catch {
      return undefined
    }
    const receiptRef = String(payload.receiptRef ?? '').trim() || undefined
    const billRef = String(payload.invoiceRef ?? '').trim() || undefined
    const photoUri = typeof payload.receiptImage === 'string' ? payload.receiptImage : undefined
    const record = this.compactRecord(payload.receiptRecord)
    if (!receiptRef && !billRef && !photoUri && !record) return undefined
    const amountRaw = Number(payload.amountPaid ?? payload.amount)
    return {
      receiptRef,
      billRef,
      amount: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : undefined,
      photoUri,
      sha256: typeof payload.receiptImageSha256 === 'string' ? payload.receiptImageSha256 : undefined,
      record,
      recordedAt: event.createdAt,
    }
  }

  /** The same, without the photo bytes, for lists. */
  private receiptSummary(
    requestId: string,
    status?: string,
  ): (Omit<RequestReceipt, 'photoUri'> & { hasPhoto: boolean }) | undefined {
    const receipt =
      (status === 'completed' ? this.completionReceipt(requestId) : undefined) || this.raisedReceipt(requestId, false)
    if (!receipt) return undefined
    const { photoUri, ...rest } = receipt
    return { ...rest, hasPhoto: Boolean(photoUri || rest.sha256) }
  }

  /** Receipt and bill numbers a follow-on inherits (the supplier payment carries the bill number). */
  private completionDetails(toStatus: RequestStatus, payload: Record<string, unknown>): Record<string, unknown> {
    if (toStatus !== 'completed') return {}
    const details: Record<string, unknown> = {}
    for (const key of ['invoiceRef', 'receiptRef'] as const) {
      const value = String(payload[key] ?? '').trim()
      if (value) details[key] = value
    }
    return details
  }

  /**
   * A purchase that went on to a purchase order and a supplier payment is finished when the
   * last of them is. Close each parent still waiting once everything below it is done.
   */
  private closeFinishedParents(requestId: string) {
    const db = DatabaseManager.getDatabase()
    let child = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(requestId) as
      | { parentId?: string | null }
      | undefined
    for (let depth = 0; child?.parentId && depth < 6; depth += 1) {
      const parentId = child.parentId
      const parent = db.prepare(`SELECT status FROM requests WHERE id = ?`).get(parentId) as
        | { status?: string }
        | undefined
      if (!parent) return
      // A purchase order finished by hand (delivered) is already closed; keep walking up past it.
      if (['approved', 'in_fulfilment'].includes(String(parent.status))) {
        const unfinished = db
          .prepare(
            `WITH RECURSIVE below(id, depth) AS (
               SELECT id, 0 FROM requests WHERE parent_request_id = ?
               UNION ALL
               SELECT r.id, below.depth + 1 FROM requests r JOIN below ON r.parent_request_id = below.id WHERE below.depth < 6
             )
             SELECT 1 FROM below JOIN requests r ON r.id = below.id WHERE r.status != 'completed' LIMIT 1`,
          )
          .get(parentId)
        if (unfinished) return
        const now = new Date().toISOString()
        db.transaction(() => {
          db.prepare(
            `UPDATE requests SET status = 'completed', completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(now, parentId)
          this.recordEvent(parentId, 'request.status_changed', undefined, parent.status ?? null, 'completed', {
            closedBy: 'follow_on_finished',
          })
          db.prepare(
            `UPDATE wallet_pending_offers SET resolved_at = ?
             WHERE source_type = 'workflow_stage_action' AND resolved_at IS NULL
               AND (source_id = ? OR source_id LIKE ?)`,
          ).run(now, parentId, `${parentId}:delegation:%`)
        })()
      } else if (parent.status !== 'completed') {
        return
      }
      child = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(parentId) as
        | { parentId?: string | null }
        | undefined
    }
  }

  /** An approved purchase, purchase order or payment lands in the inbox of whoever finishes it. */
  private async routeNextStepCard(requestId: string, tenantId: string) {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, request_type, status, title, amount, department_id AS departmentId FROM requests WHERE id = ?`,
      )
      .get(requestId) as
      | { id: string; request_type: string; status: string; title?: string; amount?: number; departmentId?: string }
      | undefined
    if (!row) return
    const type = String(row.request_type || '').toLowerCase()
    const experience = requestExperienceDefinition(tenantId, row.request_type)
    const step = NEXT_STEP_BY_TYPE[type] || experience.definition.fulfilmentAction ? this.nextStepFor(row) : undefined
    if (!step) return
    const { routeWorkflowStageInbox } = await import('./WorkflowStageInboxService')
    routeWorkflowStageInbox({
      orgTenantId: tenantId,
      requestType: row.request_type,
      stageAction:
        experience.definition.fulfilmentAction ||
        (type === 'finance.payment_request' ? 'record_payment' : 'release_funds'),
      sourceId: requestId,
      title: `${step.label}: ${row.title || 'Request'}`.slice(0, 180),
      body: this.familyCard(requestId).body || step.hint,
      departmentId: row.departmentId,
      amount: typeof row.amount === 'number' ? row.amount : undefined,
      extraMetadata: {
        requestStep: 'follow_up',
        nextStepLabel: step.label,
        nextStepHint: step.hint,
        nextStepFields: step.fields,
        ...(this.familyCard(requestId).extraMetadata || {}),
      },
    })
  }

  private getSeparationOfDuties(
    fromStatus: RequestStatus,
    toStatus: RequestStatus,
    requesterPersonId: string,
  ): string[] {
    if (fromStatus === 'in_review' && ['approved', 'rejected'].includes(toStatus)) return [requesterPersonId]
    return []
  }

  private parseContext(value?: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private recordDecisionEvent(
    organizationId: string,
    actorPersonId: string,
    requestId: string,
    action: string,
    decision: 'allow' | 'deny',
    reasonCode: string,
  ) {
    DatabaseManager.getDatabase()
      .prepare(
        `
      INSERT INTO policy_decisions (
        id, organization_id, principal_person_id, action,
        resource_type, resource_id, decision, reason_code, policy_version
      ) VALUES (?, ?, ?, ?, 'request', ?, ?, ?, ?)
    `,
      )
      .run(randomUUID(), organizationId, actorPersonId, action, requestId, decision, reasonCode, 'platform-v1')
  }

  public getForSubject(requestId: string, tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    const request = db
      .prepare(
        `
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `,
      )
      .get(requestId, tenantId) as any
    if (!request) return undefined

    const decisionContext = this.decisionContextFor(tenantId, subjectRef, principal.personId, request)
    if (request.requester_person_id !== principal.personId && !decisionContext.canAct) {
      const decision = authorizationService.decide({
        tenantId,
        personId: principal.personId,
        action: 'request.read',
        requiredPermission: 'request.read',
        resourceType: 'request',
        resourceId: requestId,
      })
      if (decision.decision !== 'allow') {
        throw new StatusException(`Insufficient authority: ${decision.reasonCode}`, 403)
      }
    }

    return {
      ...this.hydrateRequest(requestId, request),
      decision: decisionContext,
    }
  }

  /**
   * Compatibility method for internal callers that already operate on a
   * tenant-scoped request. New HTTP callers should use getForSubject().
   */
  public getForTenant(requestId: string, tenantId: string) {
    const db = DatabaseManager.getDatabase()
    const request = db
      .prepare(
        `
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ?
    `,
      )
      .get(requestId, tenantId) as any
    if (!request) return undefined
    return this.hydrateRequest(requestId, request)
  }

  public list(
    tenantId: string,
    subjectRef: string,
    status?: RequestStatus,
    requestType?: string,
    limit = 20,
    cursor?: string,
  ): { items: unknown[]; nextCursor: string | null } {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    const readDecision = authorizationService.decide({
      tenantId,
      personId: principal.personId,
      action: 'request.read',
      requiredPermission: 'request.read',
      resourceType: 'request',
    })
    const canReadAll = readDecision.decision === 'allow'
    const wallet = db
      .prepare('SELECT tenant_id AS walletTenantId FROM ssi_users WHERE id = ? LIMIT 1')
      .get(subjectRef) as { walletTenantId?: string } | undefined
    const pageSize = Math.min(Math.max(limit, 1), 100)

    let sql = `
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE o.tenant_id = ?
        AND (
          ? = 1
          OR r.requester_person_id = ?
          OR EXISTS (
            SELECT 1
            FROM wallet_pending_offers wpo
            WHERE wpo.tenant_id = ?
              AND wpo.source_type = 'workflow_stage_action'
              AND wpo.resolved_at IS NULL
              AND (wpo.source_id = r.id OR wpo.source_id LIKE r.id || ':delegation:%')
          )
        )
    `
    const params: unknown[] = [tenantId, canReadAll ? 1 : 0, principal.personId, wallet?.walletTenantId || '']

    if (cursor) {
      if (cursor.startsWith('[')) {
        let position: unknown
        try {
          position = JSON.parse(cursor)
        } catch {
          throw new StatusException('Invalid request history cursor', 400)
        }
        if (!Array.isArray(position) || position.length !== 2 || position.some((value) => typeof value !== 'string')) {
          throw new StatusException('Invalid request history cursor', 400)
        }
        sql += ' AND (r.created_at < ? OR (r.created_at = ? AND r.id < ?))'
        params.push(position[0], position[0], position[1])
      } else {
        // Continue accepting timestamp-only cursors issued by earlier versions.
        sql += ' AND r.created_at < ?'
        params.push(cursor)
      }
    }
    if (status) {
      sql += ' AND r.status = ?'
      params.push(status)
    }
    if (requestType) {
      sql += ' AND r.request_type = ?'
      params.push(requestType)
    }

    sql += ' ORDER BY r.created_at DESC, r.id DESC LIMIT ?'
    params.push(pageSize + 1)

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string
      created_at?: string
      request_type?: string
      status?: string
    }>
    const hasMore = rows.length > pageSize
    const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) => ({
      ...row,
      nextStep: this.nextStepFor(row),
      receipt: this.receiptSummary(row.id, row.status),
      family: this.familyOf(row.id),
      ledger: this.ledgerOf(row.id),
      experience: experienceForRequest(tenantId, row),
      decision: this.decisionContextFor(tenantId, subjectRef, principal.personId, row),
    }))
    const lastItem = items[items.length - 1]
    const nextCursor = hasMore && lastItem ? JSON.stringify([lastItem.created_at, lastItem.id]) : null

    return { items, nextCursor }
  }

  /**
   * What one person may ask for from Home, across every organisation they belong to. Read with
   * the person's own wallet token: no organisation context is needed to see the menu.
   */
  public optionsForSubject(subjectRef: string): RequestOptions {
    const db = DatabaseManager.getDatabase()
    const memberships = db
      .prepare(
        `SELECT om.org_tenant_id AS orgTenantId, om.role AS role, o.name AS orgName
           FROM org_memberships om
           JOIN organizations o ON o.tenant_id = om.org_tenant_id AND o.status = 'active'
          WHERE om.user_id = ? AND om.status = 'active'
          ORDER BY o.name`,
      )
      .all(subjectRef) as Array<{ orgTenantId: string; role: string; orgName: string }>

    const payoutJobs = this.payoutJobsFor(subjectRef, memberships)
    const records: RequestOptionsRecord[] = []
    const result: RequestOptionsMembership[] = memberships.map((membership) => {
      // Leave, expense claims and payslips belong to the People & payroll module; an
      // organisation that has not switched it on offers none of them.
      const peoplePayroll = orgEntitlementService.hasModule(membership.orgTenantId, 'people_payroll')
      const kinds: string[] = peoplePayroll ? ['hr.leave', 'finance.expense_claim'] : []
      if (orgSetupProfileService.get(membership.orgTenantId).requestTypes.includes('internal_requisitions')) {
        kinds.push('procurement.requisition')
      }
      if (payoutJobs.some((job) => job.orgTenantId === membership.orgTenantId)) kinds.push('finance.payout_request')
      kinds.push('platform.general')
      records.push({ item: 'staff_card', orgTenantId: membership.orgTenantId, orgName: membership.orgName })
      if (peoplePayroll)
        records.push({ item: 'payslips', orgTenantId: membership.orgTenantId, orgName: membership.orgName })
      return {
        orgTenantId: membership.orgTenantId,
        orgName: membership.orgName,
        role: String(membership.role || 'member'),
        kinds,
      }
    })
    // Payment receipts come from the payment ledger, not from a membership: anyone who paid
    // an organisation through the platform can ask for them again on a new phone.
    records.push({ item: 'receipts' })

    return { memberships: result, payoutJobs, records }
  }

  /**
   * Field jobs assigned to this person that are signed off and waiting for the payout, so the
   * worker can nudge the payout person from Home.
   */
  private payoutJobsFor(
    subjectRef: string,
    memberships: Array<{ orgTenantId: string; orgName: string }>,
  ): RequestOptionsPayoutJob[] {
    if (memberships.length === 0) return []
    const db = DatabaseManager.getDatabase()
    const placeholders = memberships.map(() => '?').join(', ')
    const rows = db
      .prepare(
        `SELECT id, tenant_id AS tenantId, input, output
           FROM workflow_runs
          WHERE tenant_id IN (${placeholders})
            AND status IN ('running', 'paused', 'pending')
            AND output LIKE '%await_payout_release%'
          ORDER BY started_at DESC
          LIMIT 50`,
      )
      .all(...memberships.map((membership) => membership.orgTenantId)) as Array<{
      id: string
      tenantId: string
      input?: string
      output?: string
    }>

    const open = db
      .prepare(
        `SELECT r.context_json AS contextJson
           FROM requests r
           JOIN people p ON p.id = r.requester_person_id
          WHERE p.subject_ref = ? AND r.request_type = 'finance.payout_request'
            AND r.status IN ('draft', 'submitted', 'in_review', 'approved', 'in_fulfilment')`,
      )
      .all(subjectRef) as Array<{ contextJson?: string }>
    const askedRunIds = new Set(
      open.map((row) => String(this.parseContext(row.contextJson).workflowRunId || '')).filter(Boolean),
    )

    const jobs: RequestOptionsPayoutJob[] = []
    for (const row of rows) {
      const state = this.parseContext(row.output) as Record<string, any>
      const input = this.parseContext(row.input) as Record<string, any>
      if (String(state.pauseReason || '') !== 'await_payout_release') continue
      const assignee = String(state.assignment?.assigneeId || input.assigneeId || '')
      if (assignee !== subjectRef) continue
      const amountRaw = input.payoutAmount ?? input.amount
      const amount = Number(amountRaw)
      jobs.push({
        workflowRunId: row.id,
        orgTenantId: row.tenantId,
        orgName: memberships.find((membership) => membership.orgTenantId === row.tenantId)?.orgName || '',
        reference: String(input.reference || input.poNumber || row.id),
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
        currency: input.currency ? String(input.currency) : undefined,
        alreadyAsked: askedRunIds.has(row.id),
      })
    }
    return jobs
  }

  /**
   * Raise and submit a request to one of the person's organisations in one step, from the
   * person's own wallet token. The membership check is the same as any other create.
   */
  public raiseForSubject(input: RaiseRequestInput) {
    const requestType = String(input.requestType || '').trim()
    if (!(MEMBER_REQUEST_TYPES as readonly string[]).includes(requestType)) {
      throw new Error('This kind of request cannot be raised from here')
    }
    const context = { ...(input.context || {}) }
    delete context.receiptRecord
    delete context.receiptImageSha256
    let receipt: ReturnType<typeof readReceiptProof> = {}
    if (requestType === 'finance.expense_claim') {
      try {
        receipt = readReceiptProof({ receiptImage: input.receiptImage, receiptRecord: input.receiptRecord })
      } catch (error: any) {
        throw new StatusException(error?.message || 'The receipt photo is not valid', 400)
      }
    }
    if (receipt.record) context.receiptRecord = receipt.record
    if (receipt.imageSha256) context.receiptImageSha256 = receipt.imageSha256
    if (requestType === 'procurement.requisition') {
      if (!input.title?.trim() || !Number.isFinite(input.amount) || Number(input.amount) <= 0) {
        throw new StatusException('Describe the item and enter a positive estimated amount.', 400)
      }
      if (!input.currency?.trim()) throw new StatusException('Choose a currency for the item request.', 400)
    }
    if (requestType === 'finance.payout_request') {
      const runId = String(context.workflowRunId || '')
      const eligible = this.payoutJobsFor(input.subjectRef, [{ orgTenantId: input.orgTenantId, orgName: '' }]).find(
        (job) => job.workflowRunId === runId,
      )
      if (!eligible) throw new Error('This job is not waiting for a payout to you')
      if (eligible.alreadyAsked)
        throw new Error('You already asked for this payout. The payout person has your request.')
      context.jobReference = eligible.reference
    }
    const created = this.create({
      tenantId: input.orgTenantId,
      subjectRef: input.subjectRef,
      requestType,
      title: input.title,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      context,
    }) as { id?: string } | undefined
    if (!created?.id) throw new Error('The request could not be saved')
    if (receipt.image) {
      this.recordEvent(created.id, 'request.receipt_attached', undefined, null, null, {
        receiptImage: receipt.image,
        receiptImageSha256: receipt.imageSha256,
      })
    }
    return this.submit(created.id, input.orgTenantId, input.subjectRef)
  }

  /** Every request this person raised, across their organisations, newest first. */
  public listMine(subjectRef: string, limit = 50) {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT r.*, o.name AS org_name, o.tenant_id AS org_tenant_id
           FROM requests r
           JOIN people p ON p.id = r.requester_person_id
           JOIN organizations o ON o.id = r.organization_id
          WHERE p.subject_ref = ?
            AND r.parent_request_id IS NULL
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ?`,
      )
      .all(subjectRef, Math.min(Math.max(limit, 1), 200)) as Array<{
      id: string
      status?: string
      request_type?: string
    }>
    return rows.map((row) => ({
      ...row,
      nextStep: this.nextStepFor(row),
      receipt: this.receiptSummary(row.id, row.status),
      family: this.familyOf(row.id),
      experience: experienceForRequest(String((row as { org_tenant_id?: string }).org_tenant_id || ''), row),
    }))
  }

  /** One of the person's own requests with its history, or undefined when it is not theirs. */
  /** "Mark as bought" on the person's own approved purchase, when that is theirs to do. */
  public requesterStepFor(request: {
    id: string
    request_type?: string
    status?: string
  }): RequestNextStep | undefined {
    if (!REQUESTER_FINISHES.has(String(request.request_type || '').toLowerCase())) return undefined
    return this.nextStepFor(request)
  }

  /** The person who asked finishes their approved purchase with the receipt (personal wallet). */
  public finishMine(requestId: string, subjectRef: string, payload: Record<string, unknown> = {}) {
    const request = DatabaseManager.getDatabase()
      .prepare(
        `SELECT r.id, r.request_type, r.status, o.tenant_id AS orgTenantId
           FROM requests r
           JOIN people p ON p.id = r.requester_person_id
           JOIN organizations o ON o.id = r.organization_id
          WHERE r.id = ? AND p.subject_ref = ?`,
      )
      .get(requestId, subjectRef) as
      | { id: string; request_type?: string; status?: string; orgTenantId: string }
      | undefined
    if (!request) throw new StatusException('Request not found', 404)
    if (!this.requesterStepFor(request)) {
      throw new StatusException('This request is not waiting for you to add the receipt.', 409)
    }
    return this.transitionBySubject(requestId, request.orgTenantId, subjectRef, 'completed', payload)
  }

  public getMine(requestId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const request = db
      .prepare(
        `SELECT r.*, o.name AS org_name, o.tenant_id AS org_tenant_id
           FROM requests r
           JOIN people p ON p.id = r.requester_person_id
           JOIN organizations o ON o.id = r.organization_id
          WHERE r.id = ? AND p.subject_ref = ?`,
      )
      .get(requestId, subjectRef) as any
    if (!request) return undefined
    const detail = this.hydrateRequest(requestId, request)
    // The requester has no org member list of their own; name the people who acted on this
    // request so the History drawer reads "Kuda · Owner", not an id fragment.
    const actorIds = new Set(
      (detail.events as Array<{ actor_user_id?: string | null }>)
        .map((event) => String(event.actor_user_id || ''))
        .filter(Boolean),
    )
    let people: Array<{ userId: string; role?: string; displayName?: string; phone?: string }> = []
    if (actorIds.size > 0 && request.org_tenant_id) {
      try {
        const { orgWorkflowActorService } =
          require('./OrgWorkflowActorService') as typeof import('./OrgWorkflowActorService')
        people = orgWorkflowActorService
          .listOrgMembers(String(request.org_tenant_id))
          .filter((member) => actorIds.has(member.userId))
          .map((member) => ({
            userId: member.userId,
            role: member.role,
            displayName: member.displayName || undefined,
            phone: member.phone || undefined,
          }))
      } catch {
        people = []
      }
    }
    return { ...detail, people, requesterStep: this.requesterStepFor(request) }
  }

  /**
   * The payout for a job was released: close the worker's open payout nudges for it. Called by
   * the field job's payout step; the nudge never gates the payout.
   */
  public closePayoutNudges(tenantId: string, workflowRunId: string): number {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT r.id, r.status, r.context_json AS contextJson
           FROM requests r
           JOIN organizations o ON o.id = r.organization_id
          WHERE o.tenant_id = ? AND r.request_type = 'finance.payout_request'
            AND r.status IN ('draft', 'submitted', 'in_review', 'approved', 'in_fulfilment')`,
      )
      .all(tenantId) as Array<{ id: string; status: string; contextJson?: string }>
    const now = new Date().toISOString()
    let closed = 0
    for (const row of rows) {
      if (String(this.parseContext(row.contextJson).workflowRunId || '') !== workflowRunId) continue
      db.transaction(() => {
        db.prepare(
          `UPDATE requests SET status = 'completed', completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(now, row.id)
        this.recordEvent(row.id, 'request.status_changed', undefined, row.status, 'completed', {
          reason: 'payout_released',
          workflowRunId,
        })
        db.prepare(
          `UPDATE wallet_pending_offers SET resolved_at = ?
            WHERE source_type = 'workflow_stage_action' AND resolved_at IS NULL
              AND (source_id = ? OR source_id LIKE ?)`,
        ).run(now, row.id, `${row.id}:delegation:%`)
      })()
      closed += 1
    }
    return closed
  }

  /**
   * Open an organization setup task on a request when its workflow cannot start
   * because organizational prerequisites are missing.
   *
   * Onboarding uses the same inbox / task primitives as business work: the task
   * shows the administrator exactly which setup items block the workflow. It is
   * idempotent per request while a pending setup task exists.
   */
  public openSetupTask(
    requestId: string,
    tenantId: string,
    missing: Array<{ key: string; title: string; reason?: string; actionPath?: string; requiredFor?: string[] }>,
    actorPersonId?: string,
  ): { taskId: string; created: boolean } {
    const db = DatabaseManager.getDatabase()

    const existing = db
      .prepare(
        `SELECT id FROM request_tasks
         WHERE request_id = ? AND task_type = 'organization.setup' AND status = 'pending'
         LIMIT 1`,
      )
      .get(requestId) as { id?: string } | undefined
    if (existing?.id) {
      return { taskId: existing.id, created: false }
    }

    // Assign to an owner/admin person when one is mapped; otherwise leave unassigned.
    const admin = db
      .prepare(
        `SELECT p.id AS personId
         FROM org_memberships m
         JOIN organizations o ON o.tenant_id = m.org_tenant_id
         JOIN people p ON p.organization_id = o.id AND p.subject_ref = m.user_id
         WHERE m.org_tenant_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin')
         ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .get(tenantId) as { personId?: string } | undefined

    const taskId = randomUUID()
    db.prepare(
      `INSERT INTO request_tasks (id, request_id, task_type, assignee_person_id, delegation_allowed, status, outcome_ref)
       VALUES (?, ?, 'organization.setup', ?, 1, 'pending', ?)`,
    ).run(taskId, requestId, admin?.personId ?? null, JSON.stringify({ missing }))

    this.recordEvent(requestId, 'workflow.prerequisites_missing', actorPersonId, null, null, {
      taskId,
      missing: missing.map((item) => item.key),
    })

    return { taskId, created: true }
  }

  private hydrateRequest(requestId: string, request: any) {
    const db = DatabaseManager.getDatabase()
    const items = db.prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY rowid').all(requestId)
    const approvals = db
      .prepare('SELECT * FROM request_approvals WHERE request_id = ? ORDER BY created_at')
      .all(requestId)
    const tasks = db.prepare('SELECT * FROM request_tasks WHERE request_id = ? ORDER BY created_at').all(requestId)
    // The attached receipt photo is returned once, as `receipt.photoUri`, not again in the history.
    const events = requestExperienceEvents(requestId).map((event: any) =>
      event?.event_type === 'request.receipt_attached' ? { ...event, payload_json: null } : event,
    )

    const organization = db.prepare('SELECT tenant_id FROM organizations WHERE id = ?').get(request.organization_id) as
      | { tenant_id: string }
      | undefined
    if (!organization) throw new Error('Request organization not found')
    return {
      ...request,
      context: this.parseContext(request.context_json),
      items,
      approvals,
      tasks,
      events,
      experience: experienceForRequest(organization.tenant_id, { ...request, id: requestId }, events),
      nextStep: this.nextStepFor({ ...request, id: requestId }),
      receipt: this.completionReceipt(requestId) || this.raisedReceipt(requestId),
      family: this.familyOf(requestId),
      ledger: this.ledgerOf(requestId),
    }
  }

  /** The supplier bill this purchase chain recorded in the payables ledger, when there is one. */
  private ledgerOf(requestId: string) {
    try {
      const { accountsPayableLedgerService } =
        require('./AccountsPayableLedgerService') as typeof import('./AccountsPayableLedgerService')
      return accountsPayableLedgerService.ledgerForRequest(requestId)
    } catch {
      return undefined
    }
  }

  /** The job or request this one belongs to. Missing when the request stands alone. */
  private familyOf(requestId: string) {
    try {
      const { workflowHandoffService } =
        require('./workflow/WorkflowHandoffService') as typeof import('./workflow/WorkflowHandoffService')
      return workflowHandoffService.familyOf(requestId)
    } catch {
      return undefined
    }
  }

  /** Inbox sentence and parent fields, when this request belongs to a job or another request. */
  private familyCard(requestId: string): { body?: string; extraMetadata?: Record<string, unknown> } {
    const family = this.familyOf(requestId)
    if (!family) return {}
    const root = family.root?.kind === 'job' ? family.root : undefined
    return {
      body: family.inboxLine,
      extraMetadata: {
        parentRunId: root?.id,
        parentReference: root?.reference,
        parentTitle: root?.title,
        holdsParent: Boolean(family.holdLine && /waits/i.test(family.holdLine)),
        partOfLine: family.partOfLine,
        holdLine: family.holdLine,
        fromLabel: family.fromLabel,
      },
    }
  }

  private recordEvent(
    requestId: string,
    eventType: string,
    actorPersonId: string | undefined,
    fromStatus: string | null,
    toStatus: string | null,
    payload: Record<string, unknown>,
  ) {
    DatabaseManager.getDatabase()
      .prepare(
        `
      INSERT INTO request_events (
        id, request_id, event_type, actor_person_id, from_status, to_status, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(randomUUID(), requestId, eventType, actorPersonId ?? null, fromStatus, toStatus, JSON.stringify(payload))
  }

  /**
   * An approved leave or expense is also a record the person can keep and show.
   * Leave: proof they are on leave. Expense: proof the claim was accepted.
   * Sent to the requester's own wallet. Safe to call again; a second copy is not sent.
   */
  public async issueApprovalRecord(requestId: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT r.id, r.request_type AS requestType, r.title, r.context_json AS contextJson,
                r.amount, r.currency, r.description, o.tenant_id AS orgTenantId, o.name AS orgName,
                p.subject_ref AS subjectRef
           FROM requests r
           JOIN organizations o ON o.id = r.organization_id
           JOIN people p ON p.id = r.requester_person_id
          WHERE r.id = ? AND r.status IN ('approved', 'in_fulfilment', 'completed')`,
      )
      .get(requestId) as
      | {
          id: string
          requestType: string
          title?: string
          contextJson?: string
          amount?: number
          currency?: string
          description?: string
          orgTenantId: string
          orgName?: string
          subjectRef: string
        }
      | undefined
    if (!row) return
    const type = String(row.requestType || '')
    if (type !== 'hr.leave' && type !== 'finance.expense_claim') return

    const holder = db
      .prepare('SELECT tenant_id AS walletTenantId, did FROM ssi_users WHERE id = ? LIMIT 1')
      .get(row.subjectRef) as { walletTenantId?: string; did?: string } | undefined
    if (!holder?.walletTenantId) return

    const { getTenantById } = await import('../persistence/TenantRepository')
    const issuerDid = getTenantById(row.orgTenantId)?.issuerDid
    if (!issuerDid) return
    const { ensureRequestRecordModels } = await import('./modelRegistry')
    await ensureRequestRecordModels(row.orgTenantId, issuerDid)

    const context = this.parseContext(row.contextJson)
    // The same leave window (or the same expense) already has a record in this wallet.
    // A second approved copy must not become a second card.
    if (this.approvalRecordAlreadyOffered(holder.walletTenantId, row.orgTenantId, type, context, row)) return
    const approver = db
      .prepare(
        `SELECT p.subject_ref AS subjectRef, e.created_at AS at
           FROM request_events e
           LEFT JOIN people p ON p.id = e.actor_person_id
          WHERE e.request_id = ? AND e.to_status = 'approved'
          ORDER BY e.created_at DESC LIMIT 1`,
      )
      .get(requestId) as { subjectRef?: string; at?: string } | undefined
    const nameOf = (userId?: string) => {
      if (!userId) return undefined
      const contact = db
        .prepare(
          `SELECT c.name FROM org_contacts c
             JOIN ssi_users u ON u.tenant_id = c.wallet_tenant_id
            WHERE u.id = ? AND c.org_tenant_id = ? AND c.name IS NOT NULL AND c.name != ''
            LIMIT 1`,
        )
        .get(userId, row.orgTenantId) as { name?: string } | undefined
      return contact?.name || undefined
    }
    const employeeName = nameOf(row.subjectRef)
    const approvedBy = nameOf(approver?.subjectRef) || 'A manager'
    const approvedAt = approver?.at || new Date().toISOString()
    const orgName = row.orgName || 'Your organisation'

    const LEAVE_WORDS: Record<string, string> = {
      annual: 'Annual leave',
      sick: 'Sick leave',
      family: 'Family leave',
      study: 'Study leave',
      unpaid: 'Unpaid leave',
      maternity: 'Maternity leave',
    }
    const credentialType = type === 'hr.leave' ? 'LeaveApprovalVC' : 'ExpenseApprovalVC'
    const claims =
      type === 'hr.leave'
        ? {
            leaveRequestId: row.id,
            employeeId: row.subjectRef,
            employeeName,
            orgName,
            leaveType: LEAVE_WORDS[String(context.leaveType || '')] || 'Leave',
            startDate: context.startDate,
            endDate: context.endDate,
            daysCount: context.days,
            cover: context.coverRef || undefined,
            note: context.reasonCode || row.description || undefined,
            approvedBy,
            approvedAt,
          }
        : {
            expenseClaimId: row.id,
            employeeId: row.subjectRef,
            employeeName,
            orgName,
            description: row.description || row.title,
            amount: row.amount,
            currency: row.currency || 'USD',
            category:
              ({ travel: 'Travel', meals: 'Meals', equipment: 'Equipment', other: 'Other' } as Record<string, string>)[
                String(context.categoryCode || context.category || '')
              ] || undefined,
            ...this.expenseReceiptLink(context),
            approvedBy,
            approvedAt,
          }

    const { workflowVcOfferDispatcher } = await import('./workflow/WorkflowVcOfferDispatcher')
    const sent = await workflowVcOfferDispatcher.issueToHolder({
      orgTenantId: row.orgTenantId,
      walletTenantId: holder.walletTenantId,
      credentialType,
      claims,
      contextRef: row.id,
      subjectDid: holder.did,
      requestType: type,
    })
    if (!sent.alreadySent) {
      this.recordEvent(row.id, 'request.record_issued', undefined, null, null, {
        credentialType,
        offerId: sent.offerId,
        recordLabel: type === 'hr.leave' ? 'Leave record sent to your records' : 'Expense record sent to your records',
      })
    }
  }

  /**
   * Whether this wallet already has a record for the same leave window or the same expense.
   * Keyed on the dates and the person, not the request id, so raising the same leave twice
   * does not queue two cards.
   */
  private approvalRecordAlreadyOffered(
    walletTenantId: string,
    orgTenantId: string,
    requestType: string,
    context: Record<string, any>,
    row: { amount?: number; description?: string; title?: string },
  ): boolean {
    const db = DatabaseManager.getDatabase()
    if (requestType === 'hr.leave') {
      const start = String(context.startDate || '')
      const end = String(context.endDate || '')
      if (!start || !end) return false
      const hit = db
        .prepare(
          `SELECT o.id FROM wallet_pending_offers o
             JOIN requests r ON r.id = o.source_id
            WHERE o.tenant_id = ? AND o.issuer_tenant_id = ? AND o.credential_type = 'LeaveApprovalVC'
              AND json_extract(r.context_json, '$.startDate') = ?
              AND json_extract(r.context_json, '$.endDate') = ?
              AND COALESCE(json_extract(r.context_json, '$.leaveType'), '') = ?
            LIMIT 1`,
        )
        .get(walletTenantId, orgTenantId, start, end, String(context.leaveType || '')) as { id?: string } | undefined
      return Boolean(hit?.id)
    }
    const description = String(row.description || row.title || '').trim()
    if (row.amount == null || !description) return false
    const hit = db
      .prepare(
        `SELECT o.id FROM wallet_pending_offers o
           JOIN requests r ON r.id = o.source_id
          WHERE o.tenant_id = ? AND o.issuer_tenant_id = ? AND o.credential_type = 'ExpenseApprovalVC'
            AND r.amount = ? AND TRIM(COALESCE(r.description, r.title, '')) = ?
          LIMIT 1`,
      )
      .get(walletTenantId, orgTenantId, row.amount, description) as { id?: string } | undefined
    return Boolean(hit?.id)
  }

  /**
   * Close the extra cards where the same leave window, or the same expense, was offered more
   * than once. Keeps the accepted card when there is one, otherwise the newest. The earlier
   * requests stay; only the spare inbox cards are closed.
   */
  public collapseDuplicateApprovalOffers(): number {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT o.id, o.tenant_id AS walletTenantId, o.issuer_tenant_id AS orgTenantId,
                o.credential_type AS credentialType, o.created_at AS createdAt, o.accepted_at AS acceptedAt,
                r.requester_person_id AS personId,
                json_extract(r.context_json, '$.startDate') AS startDate,
                json_extract(r.context_json, '$.endDate') AS endDate,
                COALESCE(json_extract(r.context_json, '$.leaveType'), '') AS leaveType,
                r.amount AS amount,
                TRIM(COALESCE(r.description, r.title, '')) AS description
           FROM wallet_pending_offers o
           JOIN requests r ON r.id = o.source_id
          WHERE o.source_type = 'workflow_vc_offer'
            AND o.credential_type IN ('LeaveApprovalVC', 'ExpenseApprovalVC')
            AND o.resolved_at IS NULL`,
      )
      .all() as Array<{
      id: string
      walletTenantId: string
      orgTenantId: string
      credentialType: string
      createdAt: string
      acceptedAt: string | null
      personId: string
      startDate: string | null
      endDate: string | null
      leaveType: string
      amount: number | null
      description: string
    }>

    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      const key =
        row.credentialType === 'LeaveApprovalVC'
          ? row.startDate && row.endDate
            ? [
                'leave',
                row.walletTenantId,
                row.orgTenantId,
                row.personId,
                row.leaveType,
                row.startDate,
                row.endDate,
              ].join('|')
            : ''
          : row.amount != null && row.description
            ? ['expense', row.walletTenantId, row.orgTenantId, row.personId, String(row.amount), row.description].join(
                '|',
              )
            : ''
      if (!key) continue
      const list = groups.get(key) || []
      list.push(row)
      groups.set(key, list)
    }

    const now = new Date().toISOString()
    const reason = 'superseded: same approval already offered'
    let closed = 0
    for (const list of groups.values()) {
      if (list.length < 2) continue
      const ranked = [...list].sort((a, b) => {
        if (a.acceptedAt && !b.acceptedAt) return -1
        if (!a.acceptedAt && b.acceptedAt) return 1
        return String(b.createdAt).localeCompare(String(a.createdAt))
      })
      for (const extra of ranked.slice(1)) {
        if (extra.acceptedAt) {
          db.prepare(
            `UPDATE wallet_pending_offers
                SET resolved_at = COALESCE(resolved_at, @now), last_attempt_at = @now,
                    last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN @reason ELSE last_error END
              WHERE id = @id AND resolved_at IS NULL`,
          ).run({ id: extra.id, now, reason })
        } else {
          // Never accepted: a spare card with nothing behind it, so the row goes.
          db.prepare('DELETE FROM wallet_pending_offers WHERE id = ? AND accepted_at IS NULL').run(extra.id)
        }
        closed += 1
      }
    }
    // Spare rows closed by an earlier pass are removed too.
    const swept = db
      .prepare(`DELETE FROM wallet_pending_offers WHERE last_error = ? AND accepted_at IS NULL`)
      .run(reason).changes
    closed += swept
    return closed
  }

  /** Approved leave and expenses that never received their record, sent once after startup. */
  public async issueMissingApprovalRecords(): Promise<number> {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id FROM requests
          WHERE request_type IN ('hr.leave', 'finance.expense_claim')
            AND status IN ('approved', 'in_fulfilment', 'completed')`,
      )
      .all() as Array<{ id: string }>
    let sent = 0
    for (const row of rows) {
      try {
        await this.issueApprovalRecord(row.id)
        sent += 1
      } catch (error: any) {
        const { rootLogger } = await import('../utils/pinoLogger')
        rootLogger
          .child({ module: 'PlatformRequestService' })
          .warn({ requestId: row.id, error: error?.message }, 'Could not send the approval record')
      }
    }
    return sent
  }
}

export const platformRequestService = new PlatformRequestService()

// Leave and expenses approved before records were issued still get their record.
setTimeout(() => {
  void platformRequestService.issueMissingApprovalRecords().catch(() => undefined)
}, 20000)

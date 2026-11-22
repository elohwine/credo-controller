/**
 * FEPT chain — org setup through evidence checkpoints, acknowledgement, VC
 * issuance (SGK reuse matrix), follow-on payment workflow and reconciliation.
 *
 * Runs the real FEPT template through the workflow engine against a SQLite
 * database. Credential issuance / notifications / trust scoring are stubbed so
 * the test does not need an agent; every field.* action, the readiness gate and
 * the `workflow.start` hand-off run unmodified.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { JobIntakeRepository } from '../src/persistence/JobIntakeRepository'
import { notificationService } from '../src/services/NotificationService'
import { outboxService } from '../src/services/OutboxService'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { paymentLinkService } from '../src/services/PaymentLinkService'
import { JobIntakeController } from '../src/controllers/platform/JobIntakeController'
import { ReconciliationService } from '../src/services/ReconciliationService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { ensureExecutableWorkflow } from '../src/services/workflow/materialize'
import { workflowHandoffService } from '../src/services/workflow/WorkflowHandoffService'
import { feptStages as portalStages, jobStatusLabel } from '../credo-ui/portal/components/finance/financeStages'
import { bookedJobWords } from '../credo-ui/shared/bookedJob'

import {
  addMember,
  addPaymentService,
  addRole,
  configureFeptTemplate,
  configurePaymentCollectionTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

// Record which VCs the template asked to issue, to whom (stage), and in what order.
const issued: Array<{ runId?: string; type: string; recipientStage?: string; claims: Record<string, unknown> }> = []

function resolveRef(context: any, ref: unknown): unknown {
  if (Array.isArray(ref)) return ref.map((entry) => resolveRef(context, entry))
  if (typeof ref !== 'string') return ref
  if (ref === 'runId') return context.runId
  if (ref.startsWith('input.') || ref.startsWith('state.')) {
    const [root, ...rest] = ref.split('.')
    let value: any = root === 'input' ? context.input : context.state
    for (const part of rest) value = value?.[part]
    return value
  }
  return ref
}

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  // Same rule as the real action: nothing to record (for example no receipt) → no record.
  if (config.skipUnless && !resolveRef(context, config.skipUnless)) return
  const claims: Record<string, unknown> = {}
  for (const [key, ref] of Object.entries(config.mapping || {})) {
    claims[key] = resolveRef(context, ref)
  }
  issued.push({ runId: context.runId, type: config.type, recipientStage: config.recipientStage, claims })
  context.state.issuedCredentials = {
    ...(context.state.issuedCredentials || {}),
    [config.type]: { offerId: `offer-${config.type}-${issued.length}`, recipientStage: config.recipientStage },
  }
})
ActionRegistry.register('external.send_notification', async (context) => {
  context.state.notified = true
})
ActionRegistry.register('external.ecocash_payment', async (context) => {
  context.state.payment = {
    status: 'completed',
    receiptId: `rcpt-${context.runId}`,
    providerRef: `ecocash-${context.runId}`,
    timestamp: new Date().toISOString(),
  }
})
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-fept-chain-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: 'offer-fept',
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/fept',
  }))
  jest
    .spyOn(notificationService, 'dispatchContactNotification')
    .mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] } as any)
})

afterAll(() => {
  databases.cleanup()
})

function reconciliationEvents(providerRef: string): string[] {
  return new ReconciliationService().getEvents(providerRef).map((event) => event.eventType)
}

function runStatus(runId: string) {
  return DatabaseManager.getDatabase()
    .prepare(`SELECT status, output, current_step AS currentStep FROM workflow_runs WHERE id = ?`)
    .get(runId) as { status: string; output: string | null; currentStep: number }
}

function runState(runId: string): Record<string, any> {
  const row = runStatus(runId)
  return row.output ? JSON.parse(row.output) : {}
}

function childRuns(parentRunId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT id, workflow_id AS workflowId, status, trigger_type AS triggerType FROM workflow_runs WHERE trigger_ref = ? AND trigger_type = 'workflow'`,
    )
    .all(parentRunId) as Array<{ id: string; workflowId: string; status: string; triggerType: string }>
}

describe('FEPT chain — org setup → evidence → acknowledgement → follow-on payment → reconciliation', () => {
  let org: SeededOrganization
  let workerUserId: string
  const reference = 'PO-FEPT-001'

  beforeAll(() => {
    org = seedOrganization({ name: 'SGK Field Services' })
    addRole(org.organizationId, 'Field Worker')
    addRole(org.organizationId, 'Finance Manager')
    workerUserId = `worker-${Date.now()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerUserId,
      role: 'field_worker',
    })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })
    addPaymentService(org.orgTenantId, 'EcoCash')

    // Declare intent for both workflows; readiness (not `enabled`) gates them.
    const fept = configureFeptTemplate(org.orgTenantId, { paymentModes: ['ecocash'] })
    configurePaymentCollectionTemplate(org.orgTenantId)

    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)
    if (!workflow) throw new Error('FEPT workflow could not be materialized')
  })

  test('both templates are operational once actors and payment provider exist', () => {
    expect(workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept').ready).toBe(true)
    expect(workflowReadinessService.evaluateTemplate(org.orgTenantId, 'tpl-payment-collection').ready).toBe(true)
  })

  test('runs the full checkpoint chain with VC issuance and a follow-on payment workflow', async () => {
    issued.length = 0

    // A dispatcher files the PO and source document first, then assigns it through the intake API.
    const intake = new JobIntakeRepository().create(
      org.orgTenantId,
      org.ownerUserId,
      {
        reference,
        poNumber: reference,
        description: 'Repair the client site equipment',
        amount: 250,
        // A subcontractor job: the client is invoiced 250 and the worker is paid 90 after sign-off.
        payoutAmount: 90,
        currency: 'USD',
        clientName: 'Acme',
        clientPhone: '263771234567',
        requireConcealedWorkPhoto: true,
        attachments: [{
          filename: 'client-po.txt',
          mediaType: 'text/plain',
          contentBase64: Buffer.from('PO-FEPT-001').toString('base64'),
        }],
      },
    )
    const dispatch = await new JobIntakeController().assign(
      { user: { tenantId: org.orgTenantId, id: org.ownerUserId, orgRole: 'owner' }, headers: {} } as any,
      intake.id,
      { assigneeId: workerUserId },
    )
    expect(dispatch).toMatchObject({ status: 'assigned', intake: { status: 'assigned', assignedTo: workerUserId } })
    const runId = dispatch.runId
    const runInput = DatabaseManager.getDatabase()
      .prepare('SELECT input, trigger_ref AS triggerRef FROM workflow_runs WHERE id = ?')
      .get(runId) as { input: string; triggerRef: string }
    expect(runInput.triggerRef).toBe(`job-intake:${intake.id}:attempt:1`)
    expect(JSON.parse(runInput.input)).toMatchObject({
      requestId: intake.id,
      jobIntakeId: intake.id,
      assigneeId: workerUserId,
      customerMsisdn: '263771234567',
      sourceAttachments: [{ id: intake.attachments[0].id, filename: 'client-po.txt' }],
    })
    const repeatedDispatch = await new JobIntakeController().assign(
      { user: { tenantId: org.orgTenantId, id: org.ownerUserId, orgRole: 'owner' }, headers: {} } as any,
      intake.id,
      { assigneeId: workerUserId },
    )
    expect(repeatedDispatch.runId).toBe(runId)
    let state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_worker_start')
    expect(state.workflowStage).toBe('ASSIGNED')
    expect(state.assignment?.assigneeId).toBe(workerUserId)
    expect(state.issuedCredentials?.JobAssignmentVC).toBeDefined()
    expect(issued.map((vc) => vc.type)).toEqual(['JobAssignmentVC'])
    expect(issued[0].recipientStage).toBe('assign_field_worker')
    expect(issued[0].claims.requisitionId).toBe(intake.id)
    expect(reconciliationEvents(reference)).toContain('AGENT_ASSIGNED')

    // 2a. The worker accepts and heads out. Nothing on site has been checked yet.
    await workflowService.resumeWorkflow(runId, {})
    state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.workflowStage).toBe('IN_PROGRESS')
    expect(state.pauseReason).toBe('await_arrival')
    expect(reconciliationEvents(reference)).toContain('JOB_STARTED')

    // 2b. Arrival without a location is rejected. A location moves the job to the site check.
    await expect(workflowService.resumeWorkflow(runId, { arrival: { method: 'gps' } })).rejects.toThrow(/Arrival proof/)
    await workflowService.resumeWorkflow(runId, { arrival: { gps: { lat: -17.8, lng: 31.0, accuracy: 12 } } })
    state = runState(runId)
    expect(state.pauseReason).toBe('await_site_inspection')
    expect(state.checkpoints?.arrival?.data?.method).toBe('gps')
    expect(reconciliationEvents(reference)).toContain('ARRIVAL_CONFIRMED')

    // 2c. The site check cannot be skipped, and a failed check keeps the job on hold.
    await expect(workflowService.resumeWorkflow(runId, {})).rejects.toThrow(/Site inspection is required/)
    expect(runStatus(runId).status).toBe('paused')
    await expect(
      workflowService.resumeWorkflow(runId, { siteInspection: { outcome: 'failed', findings: 'Gate locked' } }),
    ).rejects.toThrow(/did not clear/)
    expect(runStatus(runId).status).toBe('paused')
    expect(runState(runId).checkpointBlocks?.[0]?.checkpoint).toBe('site_inspection')

    // 2d. Inspection passes → the safety check is next, still before any photos.
    await workflowService.resumeWorkflow(runId, {
      siteInspection: { outcome: 'passed_with_notes', accessConfirmed: true, findings: 'Tight access, bring ladder' },
    })
    state = runState(runId)
    expect(state.workflowStage).toBe('IN_PROGRESS')
    expect(state.pauseReason).toBe('await_risk_assessment')
    expect(state.checkpoints?.site_inspection?.status).toBe('completed')
    expect(reconciliationEvents(reference)).toContain('SITE_INSPECTION_COMPLETED')

    // 2e. The safety check is an explicit choice. Leaving it out, or leaving the PPE box
    //     unticked, is an error and never a hold.
    const holdsOf = () =>
      (runState(runId).checkpointBlocks || []).filter((b: any) => b.checkpoint === 'risk_assessment')
    await expect(
      workflowService.resumeWorkflow(runId, { riskAssessment: { hazards: [], ppeConfirmed: false } }, workerUserId),
    ).rejects.toThrow(/Choose whether it is safe/)
    await expect(
      workflowService.resumeWorkflow(
        runId,
        { riskAssessment: { decision: 'safe', hazards: [], ppeConfirmed: false } },
        workerUserId,
      ),
    ).rejects.toThrow(/protective equipment/)
    expect(holdsOf()).toHaveLength(0)
    expect(runStatus(runId).status).toBe('paused')

    //     "Not safe" needs a reason and a photo before it becomes a hold.
    await expect(
      workflowService.resumeWorkflow(
        runId,
        { riskAssessment: { decision: 'not_safe', hazards: ['live wiring'] } },
        workerUserId,
      ),
    ).rejects.toThrow(/Say why/)
    expect(holdsOf()).toHaveLength(0)

    //     With both, the job goes on hold once: the organisation gets a card and an event is recorded.
    const unsafe = {
      riskAssessment: {
        decision: 'not_safe',
        hazards: ['live wiring'],
        holdReason: 'Exposed live wire at the meter box',
        holdPhoto: { photoUri: 'data:image/jpeg;base64,AAA', evidenceHash: 'hash-hold-1' },
      },
    }
    await expect(workflowService.resumeWorkflow(runId, unsafe, workerUserId)).rejects.toThrow(/on hold/)
    expect(runStatus(runId).status).toBe('paused')
    expect(runState(runId).pauseReason).toBe('await_risk_assessment')
    let holds = holdsOf()
    expect(holds).toHaveLength(1)
    const hold = holds[0]
    expect(hold.status).toBe('open')
    expect(hold.by).toBe(workerUserId)
    expect(hold.reason).toBe('Exposed live wire at the meter box')
    expect(hold.photo?.evidenceHash).toBe('hash-hold-1')
    expect(reconciliationEvents(reference)).toContain('RISK_ASSESSMENT_HOLD_RAISED')
    const holdCardSource = `${runId}:safety-hold:${hold.id}`
    const holdCards = () =>
      DatabaseManager.getDatabase()
        .prepare(
          `SELECT tenant_id AS tenantId, resolved_at AS resolvedAt, metadata FROM wallet_pending_offers WHERE source_id = ?`,
        )
        .all(holdCardSource) as Array<{ tenantId: string; resolvedAt: string | null; metadata: string }>
    expect(holdCards().length).toBeGreaterThan(0)
    expect(holdCards().every((card) => card.tenantId !== `wallet-${workerUserId}`)).toBe(true)
    expect(JSON.parse(holdCards()[0].metadata).stageAction).toBe('resolve_safety_hold')

    //     The same call again (a retry) adds no second hold.
    await expect(workflowService.resumeWorkflow(runId, unsafe, workerUserId)).rejects.toThrow(/on hold/)
    expect(holdsOf()).toHaveLength(1)

    expect(hold.fixBy).toBe('organisation')
    expect(JSON.parse(holdCards()[0].metadata).holdFixBy).toBe('organisation')

    //     The worker said the organisation must fix it, so the check stays locked until it is resolved,
    //     even with "what changed" filled in. A retry that claims "on site" cannot unlock it.
    await expect(
      workflowService.resumeWorkflow(
        runId,
        { riskAssessment: { decision: 'safe', hazards: [], ppeConfirmed: true, whatChanged: 'nothing yet' } },
        workerUserId,
      ),
    ).rejects.toThrow(/waiting for your organisation/i)
    await expect(
      workflowService.resumeWorkflow(
        runId,
        { riskAssessment: { ...unsafe.riskAssessment, fixBy: 'worker' } },
        workerUserId,
      ),
    ).rejects.toThrow(/on hold/)
    expect(holdsOf()).toHaveLength(1)
    expect(holdsOf()[0].fixBy).toBe('organisation')

    //     The organisation marks the issue resolved: the org card closes, the worker gets a card,
    //     and the hold is still live (the worker has not re-checked). Resolving twice is a no-op.
    const resolved = workflowService.resolveSafetyHold(
      runId,
      hold.id,
      'Site electrician isolated the supply',
      org.ownerUserId,
    )
    expect(resolved.status).toBe('resolved')
    expect(workflowService.resolveSafetyHold(runId, hold.id, 'again', org.ownerUserId)).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Site electrician isolated the supply',
    })
    expect(() => workflowService.resolveSafetyHold(runId, 'no-such-hold', 'x', org.ownerUserId)).toThrow(
      /not on this job/,
    )
    holds = holdsOf()
    expect(holds[0].status).toBe('resolved')
    expect(holds[0].resolvedBy).toBe(org.ownerUserId)
    expect(holdCards().every((card) => card.resolvedAt)).toBe(true)
    const resumeCards = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id AS tenantId, resolved_at AS resolvedAt, metadata FROM wallet_pending_offers WHERE source_id = ?`,
      )
      .all(`${runId}:safety-resume:${hold.id}`) as Array<{
      tenantId: string
      resolvedAt: string | null
      metadata: string
    }>
    expect(resumeCards).toHaveLength(1)
    expect(resumeCards[0].tenantId).toBe(`wallet-${workerUserId}`)
    expect(JSON.parse(resumeCards[0].metadata).stageAction).toBe('assess_risk')
    expect(reconciliationEvents(reference)).toContain('RISK_ASSESSMENT_HOLD_RESOLVED')
    expect(runState(runId).pauseReason).toBe('await_risk_assessment')

    //     Once resolved the worker may redo it, but still has to say what changed.
    await expect(
      workflowService.resumeWorkflow(
        runId,
        { riskAssessment: { decision: 'safe', hazards: [], ppeConfirmed: true } },
        workerUserId,
      ),
    ).rejects.toThrow(/what changed/i)

    //     The worker redoes the check. A safe one clears the hold and opens the before photos.
    await workflowService.resumeWorkflow(
      runId,
      {
        riskAssessment: {
          decision: 'safe',
          hazards: ['working at height'],
          controls: 'harness + spotter',
          ppeConfirmed: true,
          whatChanged: 'Supply isolated, wire taped and labelled',
        },
      },
      workerUserId,
    )
    state = runState(runId)
    expect(state.pauseReason).toBe('await_evidence_before')
    expect(state.checkpoints?.risk_assessment?.data?.controls).toBe('harness + spotter')
    expect(state.checkpoints?.risk_assessment?.data?.whatChanged).toBe('Supply isolated, wire taped and labelled')
    holds = holdsOf()
    expect(holds[0].status).toBe('cleared')
    expect(holds[0].clearedBy).toBe(workerUserId)
    expect(holds[0].whatChanged).toBe('Supply isolated, wire taped and labelled')
    expect(
      (
        DatabaseManager.getDatabase()
          .prepare(`SELECT resolved_at AS resolvedAt FROM wallet_pending_offers WHERE source_id = ?`)
          .all(`${runId}:safety-resume:${hold.id}`) as Array<{ resolvedAt: string | null }>
      ).every((card) => card.resolvedAt),
    ).toBe(true)
    expect(reconciliationEvents(reference)).toContain('RISK_ASSESSMENT_COMPLETED')
    expect(() => workflowService.resolveSafetyHold(runId, hold.id, 'late', org.ownerUserId)).toThrow(/already cleared/)

    // 3. Out-of-order evidence is rejected: AFTER before BEFORE fails the run step.
    //    (Resume with the wrong phase; the capture action throws.)
    const wrongOrder = await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-after',
      phase: 'after',
      photoUri: 'p.jpg',
      gps: '-17.8,31.0',
    })
    expect(wrongOrder.status).toBe('failed')
    expect(wrongOrder.error).toMatch(/waiting for before evidence, not after/)

    // Recover the run to paused so the happy path continues (engine marks failed runs terminal).
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)

    // 4. BEFORE evidence.
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-before',
      phase: 'before',
      photoUri: 'before.jpg',
      gps: '-17.8,31.0',
    })
    state = runState(runId)
    expect(state.evidenceBefore?.evidenceHash).toBe('hash-before')
    // Materials are bought during the job: receipts come right after the before photos.
    expect(state.pauseReason).toBe('await_evidence_receipt')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_BEFORE')

    // 5. After evidence cannot jump the receipt step.
    const afterTooEarly = await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-after',
      phase: 'after',
      photoUri: 'p.jpg',
      gps: '-17.8,31.0',
    })
    expect(afterTooEarly.status).toBe('failed')
    expect(afterTooEarly.error).toMatch(/waiting for receipt evidence, not after/)
    expect(runState(runId).evidenceAfter).toBeUndefined()
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)

    //    RECEIPT evidence → ReceiptVC (material profile) → wait for the after photos.
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-receipt',
      phase: 'receipt',
      photoUri: 'receipt.jpg',
      notes: '2x valves',
    })
    state = runState(runId)
    expect(state.evidenceReceipt?.evidenceHash).toBe('hash-receipt')
    expect(state.pauseReason).toBe('await_evidence_concealed')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_RECEIPT')

    // 6. Configured concealed-work evidence is a required, location-sealed checkpoint before after photos.
    const afterConcealedTooEarly = await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-after',
      phase: 'after',
      photoUri: 'after.jpg',
      gps: '-17.8,31.0',
    })
    expect(afterConcealedTooEarly.status).toBe('failed')
    expect(afterConcealedTooEarly.error).toMatch(/waiting for concealed evidence, not after/)
    expect(runState(runId).evidenceAfter).toBeUndefined()
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-concealed',
      phase: 'concealed',
      photoUri: 'concealed.jpg',
      gps: '-17.8,31.0',
      deviceCapturedAt: new Date().toISOString(),
    })
    state = runState(runId)
    expect(state.evidenceConcealed?.evidenceHash).toBe('hash-concealed')
    expect(state.pauseReason).toBe('await_evidence_after')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_CONCEALED')

    // 7. AFTER evidence → wait for the work review.
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-after',
      phase: 'after',
      photoUri: 'after.jpg',
      gps: '-17.8,31.0',
    })
    state = runState(runId)
    expect(state.evidenceAfter?.evidenceHash).toBe('hash-after')
    expect(state.workflowStage).toBe('EVIDENCE_CAPTURED')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_AFTER')
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_completion_review')
    expect(state.ack).toBeUndefined()

    // 6b. A reviewer checks the finished work. Rework holds the job; approval releases customer sign-off.
    await expect(
      workflowService.resumeWorkflow(runId, {
        completionReview: { outcome: 'rework_required', notes: 'Seal not flush' },
      }),
    ).rejects.toThrow(/work to redo/)
    expect(runState(runId).checkpointBlocks?.at(-1)?.checkpoint).toBe('completion_review')
    await workflowService.resumeWorkflow(runId, { completionReview: { outcome: 'approved' } })
    state = runState(runId)
    expect(state.pauseReason).toBe('await_acknowledgement')
    expect(state.checkpoints?.completion_review?.status).toBe('completed')
    expect(reconciliationEvents(reference)).toContain('COMPLETION_REVIEWED')
    expect(state.payment).toBeUndefined()

    // 7. Customer sign-off needs the sign-off person's wallet proof (server-verified).
    const unproven = await workflowService.resumeWorkflow(runId, { receiverId: 'customer-1' })
    expect(unproven.status).toBe('failed')
    expect(unproven.error).toMatch(/wallet proof/)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)

    //    Sign-off → ExecutionAckVC → client invoice (payment collection) → wait for the worker
    //    payout release (its own person, its own proof) because the job has a payout amount.
    const signedOff = await workflowService.resumeWorkflow(runId, {
      receiverId: 'customer-1',
      acknowledgementPresentation: {
        id: 'vp-ack-1',
        type: 'OpenID4VP',
        holderDid: 'did:key:customer',
        verifiedBy: 'server',
      },
    })
    expect(signedOff.status).toBe('running')
    state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_payout_release')
    expect(state.ack?.status).toBe('acknowledged')
    expect(state.ack?.presentationId).toBe('vp-ack-1')
    expect(state.payment).toBeUndefined()
    // The client is invoiced at sign-off, before any payout.
    expect(childRuns(runId)).toHaveLength(1)
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual([
      'JobAssignmentVC',
      'SiteInspectionVC',
      'ReceiptVC',
      'ExecutionAckVC',
    ])

    //    Payout without proof is refused too.
    const unpaid = await workflowService.resumeWorkflow(runId, {})
    expect(unpaid.status).toBe('failed')
    expect(unpaid.error).toMatch(/wallet proof/)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)

    //    Payout release → payout trigger → payout receipt issued → reconcile.
    const finished = await workflowService.resumeWorkflow(runId, {
      releasePresentation: { id: 'vp-payout-1', type: 'OpenID4VP', holderDid: 'did:key:finance', verifiedBy: 'server' },
    })
    expect(finished.status).toBe('completed')
    state = runState(runId)
    expect(state.payment?.presentationId).toBe('vp-payout-1')
    // The payout is the worker's amount, not the client invoice.
    expect(state.payment?.amount).toBe(90)
    expect(runStatus(runId).status).toBe('completed')
    expect(state.evidenceReceipt?.evidenceHash).toBe('hash-receipt')
    expect(state.ack?.status).toBe('acknowledged')
    expect(state.ack?.receiverId).toBe('customer-1')
    expect(state.payment?.status).toBe('triggered')
    expect(state.receipt?.status).toBe('issued')
    expect(state.reconciliation?.status).toBe('awaiting_payment')
    expect(state.workflowStage).toBe('RECONCILED')
    expect(state.notified).toBe(true)

    // SGK reuse matrix: job card, site check, material receipt, completion acknowledgement — in order, to the right stages.
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual([
      'JobAssignmentVC',
      'SiteInspectionVC',
      'ReceiptVC',
      'ExecutionAckVC',
    ])
    const receiptVc = issued.find((vc) => vc.type === 'ReceiptVC')!
    expect(receiptVc.recipientStage).toBe('trigger_payout')
    expect(receiptVc.claims.evidenceHash).toBe('hash-receipt')
    expect(receiptVc.claims.linkedEvidenceIds).toEqual(['hash-before'])
    const ackVc = issued.find((vc) => vc.type === 'ExecutionAckVC')!
    expect(ackVc.recipientStage).toBe('acknowledge_execution')
    expect(ackVc.claims.completionStatus).toBe('acknowledged')
    expect(ackVc.claims.evidenceRefs).toEqual(['hash-before', 'hash-after', 'hash-receipt'])
    expect(ackVc.claims.concealedEvidenceRef).toBe('hash-concealed')
    expect(Object.keys(state.issuedCredentials)).toEqual(
      expect.arrayContaining(['JobAssignmentVC', 'ReceiptVC', 'ExecutionAckVC']),
    )

    // Follow-on payment collection started via workflow.start (readiness-gated) and produced its own VCs.
    const handoff = state.startedWorkflows?.['tpl-payment-collection']
    expect(handoff?.runId).toBeTruthy()
    expect(handoff?.status).toMatch(/running|completed/)
    const children = childRuns(runId)
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe(handoff.runId)
    // Async child; give the engine a tick to finish.
    await new Promise((resolve) => setTimeout(resolve, 50))
    // The client gets a pay link by phone; the bill waits for the money. Nothing goes to the payout person.
    expect(runStatus(handoff.runId).status).toBe('paused')
    const waiting = runState(handoff.runId)
    expect(waiting.pauseReason).toBe('await_client_payment')
    expect(waiting.clientBill).toMatchObject({ status: 'sent', kind: 'invoice', amount: 250 })
    expect(issued.filter((vc) => vc.runId === handoff.runId)).toEqual([])

    // A resume without the money keeps the bill waiting.
    await workflowService.resumeWorkflow(handoff.runId, {})
    expect(runStatus(handoff.runId).status).toBe('paused')

    // The paid link continues the bill.
    await paymentLinkService.settlePaid(waiting.clientBill.linkId, { reference: 'ECO-TEST-1', receiptId: 'RCPT-ECO-TEST-1' })
    expect(runStatus(handoff.runId).status).toBe('completed')
    const paidState = runState(handoff.runId)
    expect(paidState.clientBill.status).toBe('paid')
    expect(paidState.payment).toMatchObject({ status: 'completed', reference: 'ECO-TEST-1', amount: 250 })
    // The job stayed open for the invoice. The client's payment is what settles it.
    expect(runState(runId).reconciliation?.status).toBe('reconciled')

    // The client bill shows under the job's related work, without holding the job.
    const billLink = workflowHandoffService.links(runId).find((link) => link.childId === handoff.runId)
    expect(billLink).toMatchObject({ label: 'Client bill', childKind: 'run', holdParent: false, status: 'completed' })

    // One money record for the job: the client's bill (paid) and the worker's payout (released), so it is closed.
    const money = DatabaseManager.getDatabase()
    const jobTransaction = money
      .prepare(`SELECT id, transaction_type AS type, status FROM business_transactions WHERE source_type = 'workflow_run' AND source_id = ?`)
      .get(runId) as { id: string; type: string; status: string }
    expect(jobTransaction).toMatchObject({ type: 'field_job', status: 'settled' })
    const owed = money
      .prepare(`SELECT direction, source_type AS sourceType, original_amount AS amount, status FROM financial_obligations WHERE business_transaction_id = ? ORDER BY direction`)
      .all(jobTransaction.id)
    expect(owed).toEqual([
      { direction: 'payable', sourceType: 'worker_payout', amount: 90, status: 'settled' },
      { direction: 'receivable', sourceType: 'ar_installment', amount: 250, status: 'settled' },
    ])

    // Reconciliation ledger for the job reference is complete.
    const events = reconciliationEvents(reference)
    for (const expected of [
      'AGENT_ASSIGNED',
      'JOB_STARTED',
      'WORK_EVIDENCE_BEFORE',
      'WORK_EVIDENCE_AFTER',
      'WORK_EVIDENCE_RECEIPT',
      'EXECUTION_ACKNOWLEDGED',
      'PAYMENT_SUCCESS',
      'RECEIPT_ISSUED',
      'SETTLEMENT_CONFIRMED',
      'JOB_CLOSED',
    ]) {
      expect(events).toContain(expected)
    }
  })
})

describe('FEPT chain — follow-on workflow is skipped when the org has no payment setup', () => {
  test('field job still completes; workflow.start records the blocked hand-off', async () => {
    issued.length = 0
    const org = seedOrganization({ name: 'Cash Only Field Co' })
    addRole(org.organizationId, 'Field Worker')
    const workerUserId = `worker-b-${Date.now()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerUserId,
      role: 'field_worker',
    })
    const fept = configureFeptTemplate(org.orgTenantId) // no payment modes → payout prerequisites do not apply
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!

    const reference = 'PO-FEPT-NOPAY'
    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference,
        requestId: 'REQ-2',
        amount: 40,
        clientName: 'Walk-in client',
        customerMsisdn: '0771234567',
        // A dispatcher can waive each pre-work checkpoint and the sign-off for a small routine job.
        requireSiteInspection: false,
        requireRiskAssessment: 'false',
        requireArrivalProof: false,
        requireCompletionReview: false,
        requireCustomerSignoff: false,
      },
      org.orgTenantId,
    )
    const runId = start.runId
    // Waived checkpoints are skipped entirely: the run waits only for the worker to start.
    expect(runState(runId).pauseReason).toBe('await_worker_start')
    await workflowService.resumeWorkflow(runId, {})
    expect(runState(runId).pauseReason).toBe('await_evidence_before')
    // "No materials bought" before the before photos is refused like any other out-of-order step.
    const tooEarly = await workflowService.resumeWorkflow(runId, { phase: 'receipt', noReceipt: true })
    expect(tooEarly.status).toBe('failed')
    expect(tooEarly.error).toMatch(/waiting for before evidence, not receipt/)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'b1',
      phase: 'before',
      photoUri: 'b.jpg',
      gps: '-17.8,31.0',
    })
    expect(runState(runId).pauseReason).toBe('await_evidence_receipt')
    // No materials were bought: the worker says so and the job moves on to the work.
    await workflowService.resumeWorkflow(runId, { phase: 'receipt', noReceipt: true, notes: 'Used stock from the van' })
    expect(runState(runId).evidenceReceipt?.skipped).toBe(true)
    expect(runState(runId).pauseReason).toBe('await_evidence_after')
    // Salaried staff, no payout amount: the job closes right after the after photos. Sign-off was
    // waived, the client invoice is blocked (no payment provider) and there is no payout step.
    const finished = await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'a1',
      phase: 'after',
      photoUri: 'a.jpg',
      gps: '-17.8,31.0',
    })

    expect(finished.status).toBe('completed')
    const state = runState(runId)
    expect(state.workflowStage).toBe('RECONCILED')
    expect(state.payment?.status).toBe('not_needed')
    expect(state.receipt?.status).toBe('not_needed')
    expect(state.startedWorkflows?.['tpl-payment-collection']?.status).toBe('blocked')
    expect(state.startedWorkflows?.['tpl-payment-collection']?.missing).toContain('payment_provider')
    expect(childRuns(runId)).toHaveLength(0)
    // The field job's own VCs are still issued; no receipt record without a receipt.
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual([
      'JobAssignmentVC',
      'SiteInspectionVC',
      'ExecutionAckVC',
    ])
    expect(reconciliationEvents(reference)).not.toContain('RECEIPT_ISSUED')
  })

  test('an internal job with no client to charge does not start payment collection at all', async () => {
    const org = seedOrganization({ name: 'Internal Works Co' })
    addRole(org.organizationId, 'Field Worker')
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: `worker-c-${Date.now()}`,
      role: 'field_worker',
    })
    const fept = configureFeptTemplate(org.orgTenantId)
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!

    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference: 'INT-1',
        requestId: 'REQ-3',
        amount: 40,
        payoutAmount: 25,
        requireSiteInspection: false,
        requireRiskAssessment: 'false',
        requireArrivalProof: false,
        requireCompletionReview: false,
        requireCustomerSignoff: false,
      },
      org.orgTenantId,
    )
    const runId = start.runId
    await workflowService.resumeWorkflow(runId, {})
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'b1',
      phase: 'before',
      photoUri: 'b.jpg',
      gps: '-17.8,31.0',
    })
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'r1', phase: 'receipt', photoUri: 'r.jpg' })
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'a1',
      phase: 'after',
      photoUri: 'a.jpg',
      gps: '-17.8,31.0',
    })
    // A payout amount means the money person still releases the worker's pay, with proof.
    expect(runState(runId).pauseReason).toBe('await_payout_release')
    const finished = await workflowService.resumeWorkflow(runId, {
      releasePresentation: { id: 'vp-payout-3', type: 'OpenID4VP', verifiedBy: 'server' },
    })

    expect(finished.status).toBe('completed')
    expect(runState(runId).payment?.amount).toBe(25)
    expect(runState(runId).startedWorkflows?.['tpl-payment-collection']?.status).toBe('not_needed')
    expect(childRuns(runId)).toHaveLength(0)
  })
})

describe('FEPT chain — a booked job is priced by the office, then billed', () => {
  let org: SeededOrganization
  let workflowId: string
  const quick = {
    requireSiteInspection: false,
    requireRiskAssessment: 'false',
    requireArrivalProof: false,
    requireCompletionReview: false,
    requireCustomerSignoff: false,
  }

  beforeAll(() => {
    org = seedOrganization({ name: 'Booked Works Co' })
    addRole(org.organizationId, 'Field Worker')
    addRole(org.organizationId, 'Finance Manager')
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: `worker-p-${Date.now()}`, role: 'field_worker' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })
    addPaymentService(org.orgTenantId, 'EcoCash')
    const fept = configureFeptTemplate(org.orgTenantId, { paymentModes: ['ecocash'] })
    configurePaymentCollectionTemplate(org.orgTenantId)
    workflowId = ensureExecutableWorkflow(org.orgTenantId, fept.id)!.id
  })

  async function bookAndFinishWork(reference: string, extra: Record<string, unknown> = {}) {
    const start = await workflowService.executeWorkflow(
      workflowId,
      { reference, amount: 0, currency: 'USD', clientName: 'Tony', customerMsisdn: '263770183277', bookedVia: 'app', ...quick, ...extra },
      org.orgTenantId,
    )
    const runId = start.runId
    await workflowService.resumeWorkflow(runId, {})
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' })
    await workflowService.resumeWorkflow(runId, { phase: 'receipt', noReceipt: true })
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg', gps: '-17.8,31.0' })
    return runId
  }

  async function settleBill(runId: string, withReceipt = true) {
    const childId = runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId
    await new Promise((resolve) => setTimeout(resolve, 50))
    const bill = runState(childId).clientBill
    const reference = `ECO-${runId.slice(0, 6)}`
    await paymentLinkService.settlePaid(bill.linkId, { reference, ...(withReceipt ? { receiptId: `RCPT-${reference}` } : {}) })
    return { childId, bill }
  }

  test('without a price the job waits for it instead of closing as settled, then bills the client', async () => {
    const reference = 'BK-PRICE-1'
    const runId = await bookAndFinishWork(reference)

    expect(runStatus(runId).status).toBe('paused')
    expect(runState(runId).pauseReason).toBe('await_job_price')
    expect(reconciliationEvents(reference)).not.toContain('SETTLEMENT_CONFIRMED')
    expect(reconciliationEvents(reference)).not.toContain('JOB_CLOSED')
    const priceCards = DatabaseManager.getDatabase()
      .prepare(`SELECT metadata FROM wallet_pending_offers WHERE source_id = ? AND resolved_at IS NULL`)
      .all(`${runId}:price`) as Array<{ metadata: string }>
    expect(priceCards.length).toBeGreaterThan(0)
    expect(JSON.parse(priceCards[0].metadata).pauseReason).toBe('await_job_price')
    await expect(workflowService.resumeWorkflow(runId, {})).rejects.toThrow(/Set the price/)
    await expect(workflowService.setJobBilling(runId, { amount: 0 })).rejects.toThrow(/Enter the price/)

    const priced = await workflowService.setJobBilling(runId, { amount: 120, paymentTerms: 'one_time' }, org.ownerUserId)
    expect(priced.billing).toBe('billed')
    expect(runStatus(runId).status).toBe('completed')
    expect(runState(runId).reconciliation?.status).toBe('awaiting_payment')
    expect(
      DatabaseManager.getDatabase()
        .prepare(`SELECT COUNT(*) AS n FROM wallet_pending_offers WHERE source_id = ? AND resolved_at IS NULL`)
        .get(`${runId}:price`),
    ).toEqual({ n: 0 })

    const { bill } = await settleBill(runId)
    expect(bill).toMatchObject({ kind: 'invoice', amount: 120 })
    await expect(workflowService.setJobBilling(runId, { amount: 150 })).rejects.toThrow(/already with the client/)
    expect(runState(runId).reconciliation?.status).toBe('reconciled')
    const events = reconciliationEvents(reference)
    expect(events.indexOf('INVOICE_ISSUED')).toBeLessThan(events.indexOf('PAYMENT_SUCCESS'))
    expect(events).toContain('SETTLEMENT_CONFIRMED')

    const { workflowAuditService } = await import('../src/services/WorkflowAuditService')
    const audit = workflowAuditService.readRun(runId, org.orgTenantId)!.rows.map((row) => row.event)
    expect(audit).toEqual(expect.arrayContaining(['Price set: USD 120.00, one payment', 'Client billed', 'Client paid', 'Payment reconciled']))
  })

  test('a price set before the work is finished bills at sign-off without waiting', async () => {
    const reference = 'BK-PRICE-2'
    const start = await workflowService.executeWorkflow(
      workflowId,
      { reference, amount: 0, clientName: 'Tony', customerMsisdn: '263770183277', bookedVia: 'app', ...quick },
      org.orgTenantId,
    )
    const saved = await workflowService.setJobBilling(start.runId, {
      amount: 300,
      paymentTerms: 'instalment',
      instalments: 3,
      paymentCadence: 'monthly',
    })
    expect(saved.billing).toBe('saved')
    await workflowService.resumeWorkflow(start.runId, {})
    await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' })
    await workflowService.resumeWorkflow(start.runId, { phase: 'receipt', noReceipt: true })
    await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg', gps: '-17.8,31.0' })
    expect(runStatus(start.runId).status).toBe('completed')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const childId = runState(start.runId).startedWorkflows?.['tpl-payment-collection']?.runId
    expect(runState(childId).clientBill).toMatchObject({ amount: 100, paymentTerms: 'instalment', instalments: 3 })
  })

  test('"no charge" lets a waiting job finish without a bill', async () => {
    const runId = await bookAndFinishWork('BK-PRICE-3')
    const result = await workflowService.setJobBilling(runId, { noCharge: true })
    expect(result.billing).toBe('no_charge')
    expect(runStatus(runId).status).toBe('completed')
    expect(childRuns(runId)).toHaveLength(0)
    expect(reconciliationEvents('BK-PRICE-3')).toContain('JOB_CLOSED')
  })

  test('a job that already closed without a bill is billed now and is no longer settled', async () => {
    const reference = 'BK-PRICE-4'
    // Booked before this change: closed at sign-off with no amount and no bill.
    const runId = await bookAndFinishWork(reference, { bookedVia: undefined })
    expect(runStatus(runId).status).toBe('completed')
    expect(runState(runId).startedWorkflows?.['tpl-payment-collection']?.status).toBe('not_needed')
    expect(runState(runId).reconciliation?.status).toBe('reconciled')

    expect(new ReconciliationService().getStatus(reference)?.status).toBe('RECONCILED')

    const result = await workflowService.setJobBilling(runId, { amount: 60 })
    expect(result.billing).toBe('billed')
    expect(runState(runId).reconciliation?.status).toBe('awaiting_payment')
    expect(childRuns(runId)).toHaveLength(1)
    // The open bill reopens the job on the ledger too.
    expect(new ReconciliationService().getStatus(reference)?.status).not.toBe('RECONCILED')
    const { bill } = await settleBill(runId)
    expect(bill.amount).toBe(60)
    expect(runState(runId).reconciliation?.status).toBe('reconciled')
    expect(reconciliationEvents(reference)).toEqual(
      expect.arrayContaining(['INVOICE_ISSUED', 'PAYMENT_SUCCESS', 'RECEIPT_ISSUED']),
    )
    expect(new ReconciliationService().getStatus(reference)?.status).toBe('RECONCILED')
  })

  test('client details added after the job closed: the bill links to the job and closes it only with a receipt', async () => {
    const reference = 'BK-PRICE-5'
    const runId = await bookAndFinishWork(reference, { bookedVia: undefined, customerMsisdn: undefined })
    expect(runStatus(runId).status).toBe('completed')
    // An older closed job may have no reconciliation state saved at all.
    const closed = runState(runId)
    delete closed.reconciliation
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET output = ? WHERE id = ?`)
      .run(JSON.stringify(closed), runId)

    await expect(workflowService.setJobBilling(runId, { amount: 45 })).rejects.toThrow(/client mobile/)
    const result = await workflowService.setJobBilling(runId, { amount: 45, clientName: 'Rudo', clientPhone: '+263771112233' })
    expect(result.billing).toBe('billed')
    expect(runState(runId).reconciliation?.status).toBe('awaiting_payment')
    const childId = runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId
    await new Promise((resolve) => setTimeout(resolve, 50))
    const link = DatabaseManager.getDatabase()
      .prepare(`SELECT metadata, payer_phone AS payerPhone FROM payment_links WHERE id = ?`)
      .get(runState(childId).clientBill.linkId) as { metadata: string; payerPhone: string }
    expect(JSON.parse(link.metadata).workflowRunId).toBe(childId)
    expect(runState(childId).clientBill).toMatchObject({ amount: 45 })
    expect(workflowHandoffService.links(runId).find((l) => l.childId === childId)).toBeTruthy()

    // Paid, but no receipt yet: the job stays open.
    await settleBill(runId, false)
    expect(runState(runId).reconciliation?.status).toBe('awaiting_receipt')
    // Only the original no-bill close is on the trail; the client bill adds no settlement without a receipt.
    expect(reconciliationEvents(reference).filter((e) => e === 'SETTLEMENT_CONFIRMED')).toHaveLength(1)
    expect(reconciliationEvents(reference)).not.toContain('RECEIPT_ISSUED')
    expect(new ReconciliationService().getStatus(reference)?.status).not.toBe('RECONCILED')
  })

  test('a priced job bills at sign-off by email, and one with no contact is billed once details come in', async () => {
    const finish = async (reference: string, extra: Record<string, unknown>) => {
      const start = await workflowService.executeWorkflow(
        workflowId,
        { reference, amount: 70, currency: 'USD', clientName: 'Chipo', ...quick, ...extra },
        org.orgTenantId,
      )
      await workflowService.resumeWorkflow(start.runId, {})
      await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' })
      await workflowService.resumeWorkflow(start.runId, { phase: 'receipt', noReceipt: true })
      await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg', gps: '-17.8,31.0' })
      await new Promise((resolve) => setTimeout(resolve, 50))
      return start.runId
    }
    const billOf = (runId: string) => runState(runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId).clientBill

    const byEmail = await finish('PO-EMAIL', { clientEmail: 'chipo@example.com' })
    expect(billOf(byEmail)).toMatchObject({ status: 'sent', amount: 70 })

    const noContact = await finish('PO-NOCONTACT', {})
    expect(runStatus(noContact).status).toBe('completed')
    expect(billOf(noContact)).toMatchObject({ status: 'not_sent' })
    await expect(workflowService.setJobBilling(noContact, { amount: 70 })).rejects.toThrow(/mobile or email/)
    const late = await workflowService.setJobBilling(noContact, { amount: 70, clientEmail: 'Chipo@Example.com' })
    expect(late.billing).toBe('billed')
    expect(billOf(noContact)).toMatchObject({ status: 'sent', amount: 70 })
    expect(runState(noContact).reconciliation?.status).toBe('awaiting_payment')
    expect(reconciliationEvents('PO-NOCONTACT')).toContain('INVOICE_ISSUED')
  })

  test('a payment that cannot move the job on is kept in the outbox and retried until the job closes', async () => {
    const db = DatabaseManager.getDatabase()
    const runId = await bookAndFinishWork('BK-PRICE-6')
    await workflowService.setJobBilling(runId, { amount: 90 })
    const childId = runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId
    await new Promise((resolve) => setTimeout(resolve, 50))
    const bill = runState(childId).clientBill

    const resume = jest.spyOn(workflowService, 'resumeWorkflow').mockRejectedValue(new Error('Run is busy'))
    const outcome = await paymentLinkService.settlePaidOrQueue(bill.linkId, { reference: 'ECO-B6', receiptId: 'RCPT-ECOB6' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(outcome).toBe('queued')
    const row = db
      .prepare(`SELECT id, status, aggregate_key AS tenant FROM integration_outbox WHERE dedupe_key = ?`)
      .get(`payment_link.settle:${bill.linkId}`) as { id: string; status: string; tenant: string }
    expect(row.tenant).toBe(org.orgTenantId)
    expect(['pending', 'retry']).toContain(row.status)
    // The office sees the money is in and that the job is still being updated.
    expect((await workflowService.getRunStatus(runId)).output.clientBill).toMatchObject({
      status: 'paid',
      settlement: { error: 'Run is busy' },
    })
    expect(runState(runId).reconciliation?.status).toBe('awaiting_payment')

    resume.mockRestore()
    db.prepare(`UPDATE integration_outbox SET available_at = 0 WHERE id = ?`).run(row.id)
    await outboxService.processPending('payment_link.settle')
    expect(db.prepare(`SELECT status FROM integration_outbox WHERE id = ?`).get(row.id)).toEqual({ status: 'processed' })
    expect(runState(runId).reconciliation?.status).toBe('reconciled')
    expect((await workflowService.getRunStatus(runId)).output.clientBill.settlement).toBeUndefined()
  })

  test('a paid job without its receipt is never shown closed and closes itself once the receipt is issued', async () => {
    const db = DatabaseManager.getDatabase()
    const runId = await bookAndFinishWork('BK-PRICE-8')
    await workflowService.setJobBilling(runId, { amount: 70 })
    const childId = runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId
    await new Promise((resolve) => setTimeout(resolve, 50))
    const bill = runState(childId).clientBill
    const unpaid = (await workflowService.getRunStatus(runId)).output
    expect(jobStatusLabel('completed', 'RECONCILED', '', unpaid)).toBe('Waiting: client payment')
    expect(bookedJobWords({ runId, status: 'completed', stage: 'RECONCILED', assigned: true, history: [], waitingFor: 'payment' })).toMatchObject({
      label: 'Bill to pay',
      done: false,
    })

    await paymentLinkService.settlePaid(bill.linkId, { reference: 'ECO-B8' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runState(runId).reconciliation?.status).toBe('awaiting_receipt')
    const row = db
      .prepare(`SELECT id, status, aggregate_key AS tenant FROM integration_outbox WHERE dedupe_key = ?`)
      .get(`payment_link.settle:${bill.linkId}:receipt`) as { id: string; status: string; tenant: string }
    expect(row.tenant).toBe(org.orgTenantId)
    expect(['pending', 'retry']).toContain(row.status)
    const waiting = (await workflowService.getRunStatus(runId)).output
    expect(jobStatusLabel('completed', 'RECONCILED', '', waiting)).toBe('Waiting: client receipt')
    expect(portalStages('RECONCILED', waiting).find((step) => step.key === 'RECONCILED')?.status).toBe('active')
    expect(portalStages('RECONCILED', waiting).find((step) => step.key === 'CLIENT_INVOICE')?.status).toBe('active')

    // Still no receipt: the outbox keeps following it.
    db.prepare(`UPDATE integration_outbox SET available_at = 0 WHERE id = ?`).run(row.id)
    await outboxService.processPending('payment_link.settle')
    expect(db.prepare(`SELECT status, error_message AS error FROM integration_outbox WHERE id = ?`).get(row.id)).toEqual({
      status: 'retry',
      error: 'The payment receipt has not been issued yet',
    })

    // The payment webhook issues the receipt: the next attempt closes the job.
    db.prepare(
      `INSERT INTO ack_payments (id, tenant_id, provider_ref, amount, state, idempotency_key)
       VALUES ('ap-b8', ?, 'ECO-B8', 70, 'paid', ?)`,
    ).run(org.orgTenantId, `paylink-${bill.linkId}-ecocash`)
    db.prepare(`INSERT INTO ack_payment_receipts (id, payment_id) VALUES ('rcp-b8', 'ap-b8')`).run()
    db.prepare(`UPDATE integration_outbox SET available_at = 0 WHERE id = ?`).run(row.id)
    await outboxService.processPending('payment_link.settle')
    expect(db.prepare(`SELECT status FROM integration_outbox WHERE id = ?`).get(row.id)).toEqual({ status: 'processed' })
    expect(runState(runId).reconciliation).toMatchObject({ status: 'reconciled', receiptId: 'RCPT-ECOB8' })
    const closed = (await workflowService.getRunStatus(runId)).output
    expect(closed.clientBill.settlement).toBeUndefined()
    expect(jobStatusLabel('completed', 'RECONCILED', '', closed)).toBe('Closed')
    expect(portalStages('RECONCILED', closed).find((step) => step.key === 'RECONCILED')?.status).toBe('done')
  })

  test('a bill message still in the outbox shows as queued, then as failed when the outbox gives up', async () => {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO notification_deliveries (id, tenant_id, event_type, recipient, status, created_at, updated_at)
       VALUES ('nd-bk7', ?, 'payment_link', '263770183277', 'queued', ?, ?)`,
    ).run(org.orgTenantId, now, now)
    const dispatch = jest.mocked(notificationService.dispatchContactNotification)
    dispatch.mockResolvedValue({
      accepted: false,
      channels: [
        { channel: 'whatsapp', status: 'queued', notificationId: 'nd-bk7' },
        { channel: 'sms', status: 'skipped' },
      ],
    })
    try {
      const runId = await bookAndFinishWork('BK-PRICE-7')
      await workflowService.setJobBilling(runId, { amount: 30 })
      await new Promise((resolve) => setTimeout(resolve, 50))
      const childId = runState(runId).startedWorkflows?.['tpl-payment-collection']?.runId
      expect(runState(childId).clientBill.status).toBe('queued')
      expect((await workflowService.getRunStatus(runId)).output.clientBill.status).toBe('queued')

      db.prepare(`UPDATE notification_deliveries SET status = 'failed' WHERE id = 'nd-bk7'`).run()
      expect((await workflowService.getRunStatus(runId)).output.clientBill.status).toBe('delivery_failed')
    } finally {
      dispatch.mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] })
    }
  })

  test('an office job with its own price never waits for one', async () => {
    const start = await workflowService.executeWorkflow(
      workflowId,
      { reference: 'PO-PRICED', amount: 80, clientName: 'Acme', customerMsisdn: '263771234567', ...quick },
      org.orgTenantId,
    )
    await workflowService.resumeWorkflow(start.runId, {})
    await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' })
    await workflowService.resumeWorkflow(start.runId, { phase: 'receipt', noReceipt: true })
    await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg', gps: '-17.8,31.0' })
    expect(runStatus(start.runId).status).toBe('completed')
    expect(runState(start.runId).startedWorkflows?.['tpl-payment-collection']?.runId).toBeTruthy()
  })
})

describe('FEPT chain — recovery', () => {
  test('a courtesy notification with no recipient is skipped instead of failing the run', async () => {
    const { ExternalActions } = await import('../src/services/workflow/actions/ExternalActions')
    const context: any = { input: {}, state: {}, runId: 'r1', workflowId: 'w1', tenantId: 'default' }
    await ExternalActions.sendNotification(context, { type: 'whatsapp', to: 'input.receiverId', message: 'hi' })
    expect(context.state.notification.status).toBe('skipped')
    expect(context.state.notification.reason).toBe('no_recipient')
  })

  test('a failed run can be retried from the step that failed without repeating earlier steps', async () => {
    const org = seedOrganization({ name: 'Retry Works Co' })
    addRole(org.organizationId, 'Field Worker')
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: `worker-r-${Date.now()}`,
      role: 'field_worker',
    })
    const fept = configureFeptTemplate(org.orgTenantId)
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!

    // The last action of the template (trust score) fails once, then works.
    let trustRuns = 0
    const originalTrust = ActionRegistry.get('trust.update_score')!
    ActionRegistry.register('trust.update_score', async (context, config) => {
      trustRuns += 1
      if (trustRuns === 1) throw new Error('Temporary failure')
      return originalTrust(context, config)
    })

    try {
      const start = await workflowService.executeWorkflow(
        workflow.id,
        {
          reference: 'INT-RETRY',
          requestId: 'REQ-RETRY',
          amount: 40,
          payoutAmount: 40,
          requireSiteInspection: false,
          requireRiskAssessment: 'false',
          requireArrivalProof: false,
          requireCompletionReview: false,
          requireCustomerSignoff: false,
        },
        org.orgTenantId,
      )
      const runId = start.runId
      await workflowService.resumeWorkflow(runId, {})
      await workflowService.resumeWorkflow(runId, {
        evidenceHash: 'b1',
        phase: 'before',
        photoUri: 'b.jpg',
        gps: '-17.8,31.0',
      })
      await workflowService.resumeWorkflow(runId, { evidenceHash: 'r1', phase: 'receipt', photoUri: 'r.jpg' })
      await workflowService.resumeWorkflow(runId, {
        evidenceHash: 'a1',
        phase: 'after',
        photoUri: 'a.jpg',
        gps: '-17.8,31.0',
      })
      const failed = await workflowService.resumeWorkflow(runId, {
        releasePresentation: { id: 'vp-payout-retry', type: 'OpenID4VP', verifiedBy: 'server' },
      })
      expect(failed.status).toBe('failed')
      expect(runStatus(runId).status).toBe('failed')
      const issuedBefore = issued.filter((entry) => entry.runId === runId).length

      // Only failed runs can be retried; a retry carries on from the failed step.
      await expect(workflowService.retryFailedRun('does-not-exist')).rejects.toThrow(/not found/i)
      const retried = await workflowService.retryFailedRun(runId)
      expect(retried.status).toBe('completed')
      expect(runStatus(runId).status).toBe('completed')
      expect(trustRuns).toBe(2)
      // Earlier steps (records already issued) were not repeated.
      expect(issued.filter((entry) => entry.runId === runId).length).toBe(issuedBefore)
      await expect(workflowService.retryFailedRun(runId)).rejects.toThrow(/Only a failed job/)
    } finally {
      ActionRegistry.register('trust.update_score', originalTrust)
    }
  })
})

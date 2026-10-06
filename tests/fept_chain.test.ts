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
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { ReconciliationService } from '../src/services/ReconciliationService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { ensureExecutableWorkflow } from '../src/services/workflow/materialize'

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
  let feptWorkflowId: string
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
    feptWorkflowId = workflow.id
  })

  test('both templates are operational once actors and payment provider exist', () => {
    expect(workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept').ready).toBe(true)
    expect(workflowReadinessService.evaluateTemplate(org.orgTenantId, 'tpl-payment-collection').ready).toBe(true)
  })

  test('runs the full checkpoint chain with VC issuance and a follow-on payment workflow', async () => {
    issued.length = 0

    // 1. Dispatcher creates the job — assignee resolved from the configured field worker actor.
    const start = await workflowService.executeWorkflow(
      feptWorkflowId,
      {
        reference,
        requestId: 'REQ-1',
        requesterId: org.ownerUserId,
        amount: 250,
        currency: 'USD',
        customerMsisdn: '263771234567',
        clientName: 'Acme',
      },
      org.orgTenantId,
    )
    const runId = start.runId
    let state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_site_inspection')
    expect(state.workflowStage).toBe('ASSIGNED')
    expect(state.assignment?.assigneeId).toBe(workerUserId)
    expect(state.issuedCredentials?.RequisitionVC).toBeDefined()
    expect(issued.map((vc) => vc.type)).toEqual(['RequisitionVC'])
    expect(issued[0].recipientStage).toBe('assign_field_worker')
    expect(issued[0].claims.requisitionId).toBe('REQ-1')
    expect(reconciliationEvents(reference)).toContain('AGENT_ASSIGNED')

    // 2a. The job cannot start before the pre-job inspection: an empty resume is rejected and the run stays paused.
    await expect(workflowService.resumeWorkflow(runId, {})).rejects.toThrow(/Site inspection is required/)
    expect(runStatus(runId).status).toBe('paused')

    // 2b. A failed inspection blocks the job and is logged, without failing the run.
    await expect(
      workflowService.resumeWorkflow(runId, { siteInspection: { outcome: 'failed', findings: 'Gate locked' } }),
    ).rejects.toThrow(/did not clear/)
    expect(runStatus(runId).status).toBe('paused')
    expect(runState(runId).checkpointBlocks?.[0]?.checkpoint).toBe('site_inspection')

    // 2c. Inspection passes → the field worker's risk assessment is next (still before the job starts).
    await workflowService.resumeWorkflow(runId, {
      siteInspection: { outcome: 'passed_with_notes', accessConfirmed: true, findings: 'Tight access, bring ladder' },
    })
    state = runState(runId)
    expect(state.workflowStage).toBe('ASSIGNED')
    expect(state.pauseReason).toBe('await_risk_assessment')
    expect(state.checkpoints?.site_inspection?.status).toBe('completed')
    expect(reconciliationEvents(reference)).toContain('SITE_INSPECTION_COMPLETED')

    // 2d. Unsafe risk assessment keeps the job on hold; a safe one releases the start step.
    await expect(
      workflowService.resumeWorkflow(runId, {
        riskAssessment: { hazards: ['live wiring'], controls: '', ppeConfirmed: true, safeToProceed: false },
      }),
    ).rejects.toThrow(/not safe to start/)
    await workflowService.resumeWorkflow(runId, {
      riskAssessment: { hazards: ['working at height'], controls: 'harness + spotter', ppeConfirmed: true, safeToProceed: true },
    })
    state = runState(runId)
    expect(state.workflowStage).toBe('ASSIGNED')
    expect(state.pauseReason).toBe('await_worker_start')
    expect(state.checkpoints?.risk_assessment?.data?.controls).toBe('harness + spotter')
    expect(reconciliationEvents(reference)).toContain('RISK_ASSESSMENT_COMPLETED')

    // 2e. Worker starts the job, then proves arrival before any BEFORE evidence.
    await workflowService.resumeWorkflow(runId, {})
    state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.workflowStage).toBe('IN_PROGRESS')
    expect(state.pauseReason).toBe('await_arrival')
    expect(reconciliationEvents(reference)).toContain('JOB_STARTED')

    await expect(workflowService.resumeWorkflow(runId, { arrival: { method: 'gps' } })).rejects.toThrow(/Arrival proof/)
    await workflowService.resumeWorkflow(runId, { arrival: { gps: { lat: -17.8, lng: 31.0, accuracy: 12 } } })
    state = runState(runId)
    expect(state.pauseReason).toBe('await_evidence_before')
    expect(state.checkpoints?.arrival?.data?.method).toBe('gps')
    expect(reconciliationEvents(reference)).toContain('ARRIVAL_CONFIRMED')

    // 3. Out-of-order evidence is rejected: AFTER before BEFORE fails the run step.
    //    (Resume with the wrong phase; the capture action throws.)
    const wrongOrder = await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-after',
      phase: 'after',
      photoUri: 'p.jpg',
    })
    expect(wrongOrder.status).toBe('failed')
    expect(wrongOrder.error).toMatch(/Before evidence must be uploaded before after evidence/)

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
    expect(state.pauseReason).toBe('await_evidence_after')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_BEFORE')

    // 5. AFTER evidence.
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'hash-after', phase: 'after', photoUri: 'after.jpg' })
    state = runState(runId)
    expect(state.evidenceAfter?.evidenceHash).toBe('hash-after')
    expect(state.workflowStage).toBe('EVIDENCE_CAPTURED')
    expect(state.pauseReason).toBe('await_evidence_receipt')
    expect(reconciliationEvents(reference)).toContain('WORK_EVIDENCE_AFTER')

    // 6. RECEIPT evidence → ReceiptVC (material profile) → wait for the customer sign-off.
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'hash-receipt',
      phase: 'receipt',
      photoUri: 'receipt.jpg',
      notes: '2x valves',
    })
    state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_completion_review')
    expect(state.ack).toBeUndefined()

    // 6b. A reviewer checks the finished work. Rework holds the job; approval releases customer sign-off.
    await expect(
      workflowService.resumeWorkflow(runId, { completionReview: { outcome: 'rework_required', notes: 'Seal not flush' } }),
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

    //    Sign-off → ExecutionAckVC → wait for payout release (its own person, its own proof).
    const signedOff = await workflowService.resumeWorkflow(runId, {
      receiverId: 'customer-1',
      acknowledgementPresentation: { id: 'vp-ack-1', type: 'OpenID4VP', holderDid: 'did:key:customer', verifiedBy: 'server' },
    })
    expect(signedOff.status).toBe('running')
    state = runState(runId)
    expect(runStatus(runId).status).toBe('paused')
    expect(state.pauseReason).toBe('await_payout_release')
    expect(state.ack?.status).toBe('acknowledged')
    expect(state.ack?.presentationId).toBe('vp-ack-1')
    expect(state.payment).toBeUndefined()
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual(['RequisitionVC', 'ReceiptVC', 'ExecutionAckVC'])

    //    Payout without proof is refused too.
    const unpaid = await workflowService.resumeWorkflow(runId, {})
    expect(unpaid.status).toBe('failed')
    expect(unpaid.error).toMatch(/wallet proof/)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(runId)

    //    Payout release → payout trigger → workflow.start(payment collection) → receipt issued → reconcile.
    const finished = await workflowService.resumeWorkflow(runId, {
      releasePresentation: { id: 'vp-payout-1', type: 'OpenID4VP', holderDid: 'did:key:finance', verifiedBy: 'server' },
    })
    expect(finished.status).toBe('completed')
    state = runState(runId)
    expect(state.payment?.presentationId).toBe('vp-payout-1')
    expect(runStatus(runId).status).toBe('completed')
    expect(state.evidenceReceipt?.evidenceHash).toBe('hash-receipt')
    expect(state.ack?.status).toBe('acknowledged')
    expect(state.ack?.receiverId).toBe('customer-1')
    expect(state.payment?.status).toBe('triggered')
    expect(state.receipt?.status).toBe('issued')
    expect(state.reconciliation?.status).toBe('reconciled')
    expect(state.workflowStage).toBe('RECONCILED')
    expect(state.notified).toBe(true)

    // SGK reuse matrix: job card, material receipt, completion acknowledgement — in order, to the right stages.
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual([
      'RequisitionVC',
      'ReceiptVC',
      'ExecutionAckVC',
    ])
    const receiptVc = issued.find((vc) => vc.type === 'ReceiptVC')!
    expect(receiptVc.recipientStage).toBe('trigger_payout')
    expect(receiptVc.claims.evidenceHash).toBe('hash-receipt')
    expect(receiptVc.claims.linkedEvidenceIds).toEqual(['hash-before', 'hash-after'])
    const ackVc = issued.find((vc) => vc.type === 'ExecutionAckVC')!
    expect(ackVc.recipientStage).toBe('acknowledge_execution')
    expect(ackVc.claims.completionStatus).toBe('acknowledged')
    expect(ackVc.claims.evidenceRefs).toEqual(['hash-before', 'hash-after', 'hash-receipt'])
    expect(Object.keys(state.issuedCredentials)).toEqual(
      expect.arrayContaining(['RequisitionVC', 'ReceiptVC', 'ExecutionAckVC']),
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
    expect(runStatus(handoff.runId).status).toBe('completed')
    const childState = runState(handoff.runId)
    expect(childState.finance).toBeDefined()
    expect(childState.issuedCredentials?.InvoiceVC).toBeDefined()
    expect(childState.issuedCredentials?.PaymentReceiptVC).toBeDefined()
    const paymentVcs = issued.filter((vc) => vc.runId === handoff.runId).map((vc) => vc.type)
    expect(paymentVcs).toEqual(['InvoiceVC', 'PaymentReceiptVC'])
    expect(issued.find((vc) => vc.type === 'InvoiceVC')?.claims.amount).toBe(250)

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
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' })
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg' })
    await workflowService.resumeWorkflow(runId, {
      evidenceHash: 'r1',
      phase: 'receipt',
      photoUri: 'r.jpg',
    })
    // Sign-off was waived, but releasing the payout still needs its person and their proof.
    expect(runState(runId).pauseReason).toBe('await_payout_release')
    const finished = await workflowService.resumeWorkflow(runId, {
      releasePresentation: { id: 'vp-payout-2', type: 'OpenID4VP', verifiedBy: 'server' },
    })

    expect(finished.status).toBe('completed')
    const state = runState(runId)
    expect(state.workflowStage).toBe('RECONCILED')
    expect(state.startedWorkflows?.['tpl-payment-collection']?.status).toBe('blocked')
    expect(state.startedWorkflows?.['tpl-payment-collection']?.missing).toContain('payment_provider')
    expect(childRuns(runId)).toHaveLength(0)
    // The field job's own VCs are still issued.
    expect(issued.filter((vc) => vc.runId === runId).map((vc) => vc.type)).toEqual([
      'RequisitionVC',
      'ReceiptVC',
      'ExecutionAckVC',
    ])
  })

  test('an internal job with no client to charge does not start payment collection at all', async () => {
    const org = seedOrganization({ name: 'Internal Works Co' })
    addRole(org.organizationId, 'Field Worker')
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: `worker-c-${Date.now()}`, role: 'field_worker' })
    const fept = configureFeptTemplate(org.orgTenantId)
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!

    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference: 'INT-1',
        requestId: 'REQ-3',
        amount: 40,
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
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' })
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg' })
    await workflowService.resumeWorkflow(runId, { evidenceHash: 'r1', phase: 'receipt', photoUri: 'r.jpg' })
    const finished = await workflowService.resumeWorkflow(runId, {
      releasePresentation: { id: 'vp-payout-3', type: 'OpenID4VP', verifiedBy: 'server' },
    })

    expect(finished.status).toBe('completed')
    expect(runState(runId).startedWorkflows?.['tpl-payment-collection']?.status).toBe('not_needed')
    expect(childRuns(runId)).toHaveLength(0)
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
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: `worker-r-${Date.now()}`, role: 'field_worker' })
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
      await workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' })
      await workflowService.resumeWorkflow(runId, { evidenceHash: 'a1', phase: 'after', photoUri: 'a.jpg' })
      await workflowService.resumeWorkflow(runId, { evidenceHash: 'r1', phase: 'receipt', photoUri: 'r.jpg' })
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

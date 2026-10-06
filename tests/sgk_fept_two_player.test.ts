/**
 * SGK web3 field run with two people.
 *
 * The office member opens the job and is the person who signs off.
 * The field worker is the assigned actor: the job card lands in that wallet,
 * and before / after / receipt evidence is captured as that worker.
 * Issuance and EcoCash are stubbed the same way as the FEPT engine test.
 */

import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { ORG_WORKFLOW_ACTOR_VC_TYPE } from '../src/config/credentials/OrgWorkflowActorVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../src/config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { resolveAcceptedProofVcTypes } from '../src/services/ProofVcPolicyService'
import { ReconciliationService } from '../src/services/ReconciliationService'
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
  type TestDatabases,
} from './utils/orgReadinessFixture'

const issued: Array<{ type: string; recipientStage?: string; claims: Record<string, unknown> }> = []
const previousIssue = ActionRegistry.get('credential.issue')
const previousNotify = ActionRegistry.get('external.send_notification')
const previousEcoCash = ActionRegistry.get('external.ecocash_payment')
const previousTrust = ActionRegistry.get('trust.update_score')

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-sgk-two-player-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `offer-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
  ActionRegistry.register('credential.issue', async (context, config = {}) => {
    const claims: Record<string, unknown> = {}
    const resolveRef = (ref: unknown): unknown => {
      if (Array.isArray(ref)) return ref.map((entry) => resolveRef(entry))
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
    for (const [key, ref] of Object.entries(config.mapping || {})) claims[key] = resolveRef(ref)
    issued.push({ type: config.type, recipientStage: config.recipientStage, claims })
    context.state.issuedCredentials = {
      ...(context.state.issuedCredentials || {}),
      [config.type]: { offerId: `offer-${config.type}`, recipientStage: config.recipientStage },
    }
  })
  ActionRegistry.register('external.send_notification', async (context) => {
    context.state.notified = true
  })
  ActionRegistry.register('external.ecocash_payment', async (context) => {
    context.state.payment = { status: 'completed', providerRef: `ecocash-${context.runId}` }
  })
  ActionRegistry.register('trust.update_score', async () => undefined)
})

afterAll(() => {
  if (previousIssue) ActionRegistry.register('credential.issue', previousIssue)
  if (previousNotify) ActionRegistry.register('external.send_notification', previousNotify)
  if (previousEcoCash) ActionRegistry.register('external.ecocash_payment', previousEcoCash)
  if (previousTrust) ActionRegistry.register('trust.update_score', previousTrust)
  databases.cleanup()
})

function runState(runId: string): Record<string, any> {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT status, output FROM workflow_runs WHERE id = ?`)
    .get(runId) as { status: string; output: string | null }
  return { status: row.status, ...(row.output ? JSON.parse(row.output) : {}) }
}

/** Site inspection, then the field worker's risk assessment (both happen before the job starts). */
async function clearPreStart(runId: string, workerUserId: string) {
  await workflowService.resumeWorkflow(runId, {
    actedByUserId: workerUserId,
    siteInspection: { outcome: 'passed', accessConfirmed: true, findings: 'Site clear' },
  })
  await workflowService.resumeWorkflow(runId, {
    actedByUserId: workerUserId,
    riskAssessment: { hazards: [], controls: '', ppeConfirmed: true, safeToProceed: true },
  })
}

async function proveArrival(runId: string, workerUserId: string) {
  await workflowService.resumeWorkflow(runId, {
    actedByUserId: workerUserId,
    arrival: { gps: { lat: -17.82, lng: 31.05 } },
  })
}

describe('SGK web3 — office member and field worker', () => {
  test('the office opens the job, the worker executes it, and sign-off stays with the office', async () => {
    issued.length = 0
    const org = seedOrganization({ name: 'SGK Construction' })
    addRole(org.organizationId, 'Field Worker')
    addRole(org.organizationId, 'Dispatcher')

    const workerUserId = `farai-${randomUUID()}`
    const officeUserId = `office-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerUserId,
      role: 'field_worker',
    })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: officeUserId,
      role: 'dispatcher',
    })
    addPaymentService(org.orgTenantId, 'EcoCash')
    // Payouts are configured, so a finance actor must exist before the org can run field jobs.
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })

    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'assign_field_worker',
      defaultUserId: workerUserId,
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
      defaultUserId: officeUserId,
    })

    const worker = orgWorkflowActorService.resolveActor({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'assign_field_worker',
    })
    const office = orgWorkflowActorService.resolveActor({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
    })
    expect(worker.mode).toBe('configured_user')
    expect(worker.userId).toBe(workerUserId)
    expect(office.userId).toBe(officeUserId)
    expect(office.userId).not.toBe(worker.userId)

    const accepted = resolveAcceptedProofVcTypes(org.orgTenantId, 'field_assignment')
    expect(accepted).toContain(PLATFORM_IDENTITY_VC_TYPE)
    expect(accepted).toContain(ORG_WORKFLOW_ACTOR_VC_TYPE)

    const fept = configureFeptTemplate(org.orgTenantId, { paymentModes: ['ecocash'] })
    configurePaymentCollectionTemplate(org.orgTenantId)
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)
    if (!workflow) throw new Error('FEPT workflow could not be materialized')

    const reference = 'PO-SGK-441'
    // Office member creates the job and names themselves as the closer.
    // The worker is not passed in; assignment comes from the stage actor.
    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference,
        poNumber: reference,
        requestId: 'JOB-441',
        requesterId: officeUserId,
        receiverId: officeUserId,
        dispatcherId: officeUserId,
        amount: 180,
        currency: 'USD',
        customerMsisdn: '263771000441',
        clientName: 'Eton block B',
        location: 'Block B',
        description: 'Window leak',
      },
      org.orgTenantId,
    )

    let state = runState(start.runId)
    expect(state.status).toBe('paused')
    expect(state.pauseReason).toBe('await_site_inspection')
    expect(state.assignment?.assigneeId).toBe(workerUserId)
    expect(state.assignment?.dispatcherId).toBe(officeUserId)
    expect(state.assignment?.assigneeId).not.toBe(org.ownerUserId)

    const offers = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id AS tenantId FROM wallet_pending_offers
         WHERE source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
      )
      .all(start.runId) as Array<{ tenantId: string }>
    expect(offers.map((row) => row.tenantId)).toEqual([`wallet-${workerUserId}`])

    const jobCard = issued.find((vc) => vc.type === 'RequisitionVC')
    expect(jobCard?.recipientStage).toBe('assign_field_worker')
    expect((jobCard?.claims.assignment as { assigneeId?: string })?.assigneeId).toBe(workerUserId)

    // Pre-start: inspection and the worker's risk assessment, then the worker starts and proves arrival.
    await clearPreStart(start.runId, workerUserId)
    await workflowService.resumeWorkflow(start.runId, { actedByUserId: workerUserId })
    await proveArrival(start.runId, workerUserId)

    // Then the three evidence checkpoints. Resume payloads do not restate the assignee.
    await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: workerUserId,
      evidenceHash: 'before-441',
      phase: 'before',
      photoUri: 'before.jpg',
      gps: '-17.82,31.05',
    })
    await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: workerUserId,
      evidenceHash: 'after-441',
      phase: 'after',
      photoUri: 'after.jpg',
    })
    await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: workerUserId,
      evidenceHash: 'receipt-441',
      phase: 'receipt',
      photoUri: 'receipt.jpg',
      notes: 'sealant',
    })
    // A reviewer checks the finished work, then the closer (office member) signs off; the worker does not self-acknowledge.
    expect(runState(start.runId).pauseReason).toBe('await_completion_review')
    await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: officeUserId,
      completionReview: { outcome: 'approved_with_notes', notes: 'Minor touch-up' },
    })
    expect(runState(start.runId).pauseReason).toBe('await_acknowledgement')

    // The sign-off person (office member) got a card for it; the worker did not.
    const signoffCards = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id AS tenantId, metadata FROM wallet_pending_offers
         WHERE source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
      )
      .all(`${start.runId}:signoff`) as Array<{ tenantId: string; metadata: string }>
    expect(signoffCards.map((row) => row.tenantId)).toEqual([`wallet-${officeUserId}`])
    expect(JSON.parse(signoffCards[0].metadata).stageAction).toBe('acknowledge_execution')

    // Sign-off without a wallet proof is refused; the plain resume path cannot complete it.
    const noProof = await workflowService.resumeWorkflow(start.runId, { actedByUserId: officeUserId })
    expect(noProof.status).toBe('failed')
    expect(noProof.error).toMatch(/wallet proof/)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET status = 'paused', error = NULL WHERE id = ?`)
      .run(start.runId)

    // Sign-off with the server-verified proof → ExecutionAckVC → wait for the payout person.
    const signedOff = await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: officeUserId,
      acknowledgementPresentation: { id: 'vp-ack-441', type: 'OpenID4VP', holderDid: 'did:key:office', verifiedBy: 'server' },
    })
    expect(signedOff.status).toBe('running')
    state = runState(start.runId)
    expect(state.pauseReason).toBe('await_payout_release')
    expect(state.ack?.isVerifiable).toBe(true)
    expect(state.payment).toBeUndefined()
    const payoutCards = DatabaseManager.getDatabase()
      .prepare(
        `SELECT metadata FROM wallet_pending_offers
         WHERE source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
      )
      .all(`${start.runId}:payout`) as Array<{ metadata: string }>
    expect(payoutCards).toHaveLength(1)
    expect(JSON.parse(payoutCards[0].metadata).stageAction).toBe('trigger_payout')

    // Payout release with the payout person's proof → payment → receipt → reconcile.
    const finished = await workflowService.resumeWorkflow(start.runId, {
      actedByUserId: org.ownerUserId,
      releasePresentation: { id: 'vp-payout-441', type: 'OpenID4VP', holderDid: 'did:key:finance', verifiedBy: 'server' },
    })

    expect(finished.status).toBe('completed')
    state = runState(start.runId)
    expect(state.payment?.isVerifiable).toBe(true)
    expect(state.payment?.releasedBy).toBe(org.ownerUserId)
    expect(state.evidenceBefore?.capturedBy).toBe(workerUserId)
    expect(state.evidenceAfter?.capturedBy).toBe(workerUserId)
    expect(state.evidenceReceipt?.capturedBy).toBe(workerUserId)
    expect(state.ack?.receiverId).toBe(officeUserId)
    expect(state.ack?.status).toBe('acknowledged')
    expect(state.workflowStage).toBe('RECONCILED')

    const ack = issued.find((vc) => vc.type === 'ExecutionAckVC')
    expect(ack?.recipientStage).toBe('acknowledge_execution')
    expect(ack?.claims.receiverId).toBe(officeUserId)
    expect(ack?.claims.evidenceRefs).toEqual(['before-441', 'after-441', 'receipt-441'])
    expect(issued.map((vc) => vc.type)).toEqual(['RequisitionVC', 'ReceiptVC', 'ExecutionAckVC', 'InvoiceVC', 'PaymentReceiptVC'])

    const events = new ReconciliationService().getEvents(reference).map((event) => event.eventType)
    expect(events).toEqual(
      expect.arrayContaining(['AGENT_ASSIGNED', 'JOB_STARTED', 'WORK_EVIDENCE_BEFORE', 'WORK_EVIDENCE_AFTER', 'EXECUTION_ACKNOWLEDGED', 'JOB_CLOSED']),
    )
  })

  test('owner is not the assignee, and the job can move to another available worker without changing stage', async () => {
    const org = seedOrganization({ name: 'SGK Availability' })
    addRole(org.organizationId, 'Field Worker')
    const firstWorker = `worker-a-${randomUUID()}`
    const reliefWorker = `worker-b-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: firstWorker, role: 'field_worker' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: reliefWorker, role: 'field_worker' })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'assign_field_worker',
      defaultUserId: firstWorker,
    })
    const fept = configureFeptTemplate(org.orgTenantId)
    const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!

    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference: 'PO-SGK-442',
        requestId: 'JOB-442',
        requesterId: org.ownerUserId,
        assigneeId: 'owner',
        amount: 40,
      },
      org.orgTenantId,
    )

    let state = runState(start.runId)
    expect(state.assignment?.assigneeId).toBe(firstWorker)
    expect(state.assignment?.assigneeId).not.toBe(org.ownerUserId)

    // Availability changes can happen at the very first checkpoint, before the job starts.
    expect(state.pauseReason).toBe('await_site_inspection')
    const early = workflowService.reassignRun(start.runId, reliefWorker, org.ownerUserId)
    expect(early.pauseReason).toBe('await_site_inspection')
    expect(runState(start.runId).assignment?.assigneeId).toBe(reliefWorker)
    const back = workflowService.reassignRun(start.runId, firstWorker, org.ownerUserId)
    expect(back.assigneeId).toBe(firstWorker)

    await clearPreStart(start.runId, firstWorker)
    await workflowService.resumeWorkflow(start.runId, {})
    await proveArrival(start.runId, firstWorker)
    state = runState(start.runId)
    expect(state.pauseReason).toBe('await_evidence_before')
    const stepBefore = DatabaseManager.getDatabase()
      .prepare(`SELECT current_step AS currentStep, status FROM workflow_runs WHERE id = ?`)
      .get(start.runId) as { currentStep: number; status: string }

    const moved = workflowService.reassignRun(start.runId, reliefWorker, org.ownerUserId)
    expect(moved.assigneeId).toBe(reliefWorker)
    expect(moved.pauseReason).toBe('await_evidence_before')

    state = runState(start.runId)
    expect(state.status).toBe('paused')
    expect(state.pauseReason).toBe('await_evidence_before')
    expect(state.assignment?.assigneeId).toBe(reliefWorker)
    expect(state.assignment?.reassignedFrom).toBe(firstWorker)
    const stepAfter = DatabaseManager.getDatabase()
      .prepare(`SELECT current_step AS currentStep, status FROM workflow_runs WHERE id = ?`)
      .get(start.runId) as { currentStep: number; status: string }
    expect(stepAfter.status).toBe('paused')
    expect(stepAfter.currentStep).toBe(stepBefore.currentStep)

    const offers = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id AS tenantId FROM wallet_pending_offers
         WHERE source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
      )
      .all(start.runId) as Array<{ tenantId: string }>
    expect(offers.map((row) => row.tenantId)).toEqual([`wallet-${reliefWorker}`])

    await workflowService.resumeWorkflow(start.runId, { evidenceHash: 'before-442', phase: 'before', photoUri: 'before.jpg' })
    state = runState(start.runId)
    expect(state.evidenceBefore?.capturedBy).toBe(reliefWorker)
    expect(state.pauseReason).toBe('await_evidence_after')
  })
})

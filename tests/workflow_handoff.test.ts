/**
 * A field job hands control to another procedure and takes it back.
 *
 * The job raises "Buy materials" (a purchase request); while it is open the job cannot
 * move on; approving the purchase releases the hold and the worker continues. The
 * organization only chooses how each hand-off starts and after which stage.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { workflowHandoffService } from '../src/services/workflow/WorkflowHandoffService'
import { ensureExecutableWorkflow } from '../src/services/workflow/materialize'

import {
  addMember,
  addRole,
  configureFeptTemplate,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  context.state.issuedCredentials = {
    ...(context.state.issuedCredentials || {}),
    [config.type]: { offerId: `offer-${config.type}` },
  }
})
ActionRegistry.register('external.send_notification', async () => undefined)
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-workflow-handoff-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: 'offer-handoff',
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/handoff',
  }))
})

afterAll(() => {
  databases.cleanup()
})

function run(runId: string) {
  const db = DatabaseManager.getDatabase()
  return (db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId) as any) && workflowServiceRun(runId)
}

function workflowServiceRun(runId: string) {
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT id, workflow_id, tenant_id, status, input, output FROM workflow_runs WHERE id = ?')
    .get(runId) as any
  return {
    id: row.id,
    workflowId: row.workflow_id,
    tenantId: row.tenant_id,
    status: row.status,
    input: row.input ? JSON.parse(row.input) : {},
    output: row.output ? JSON.parse(row.output) : {},
    triggerType: 'manual' as const,
    currentStep: 0,
    totalSteps: 0,
  }
}

async function startFieldJob(name: string, extraInput: Record<string, unknown> = {}) {
  const org = seedOrganization({ name })
  orgSetupProfileService.save(org.orgTenantId, {
    operatingModel: 'internal',
    modules: ['field_jobs', 'purchases', 'payables', 'collections'],
    expectedRevision: 0,
  })
  addRole(org.organizationId, 'Field Worker')
  const workerUserId = `worker-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  addMember({
    orgTenantId: org.orgTenantId,
    organizationId: org.organizationId,
    userId: workerUserId,
    role: 'field_worker',
  })
  const fept = configureFeptTemplate(org.orgTenantId)
  const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!
  const start = await workflowService.executeWorkflow(
    workflow.id,
    {
      reference: `JOB-${name}`,
      requestId: `REQ-${name}`,
      amount: 120,
      assigneeId: workerUserId,
      requireSiteInspection: false,
      requireRiskAssessment: 'false',
      requireArrivalProof: false,
      requireCompletionReview: false,
      requireCustomerSignoff: false,
      ...extraInput,
    },
    org.orgTenantId,
  )
  return { org, runId: start.runId, workerUserId }
}

async function waitFor<T>(read: () => T | undefined | false, tries = 60): Promise<T> {
  for (let i = 0; i < tries; i += 1) {
    const value = read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting')
}

function childOf(parentId: string, requestType: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      'SELECT id, status, amount, context_json AS contextJson FROM requests WHERE parent_request_id = ? AND request_type = ?',
    )
    .get(parentId, requestType) as { id: string; status: string; amount?: number; contextJson: string } | undefined
}

/** A one-pixel photo, the shape the phone camera and the website upload send. */
const RECEIPT_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function approveAsOwner(requestId: string, orgTenantId: string, ownerUserId: string) {
  platformRequestService.transitionBySubject(requestId, orgTenantId, ownerUserId, 'in_review')
  platformRequestService.transitionBySubject(requestId, orgTenantId, ownerUserId, 'approved')
}

describe('job hand-offs', () => {
  test.each([
    { purchaseKind: undefined, receivingRequired: 'yes', expected: /What are you buying/ },
    { purchaseKind: 'goods', receivingRequired: undefined, expected: /Confirm delivery or service before payment/ },
    { purchaseKind: 'other', receivingRequired: 'yes', expected: /choose Goods or materials or A service/ },
    {
      purchaseKind: 'service',
      receivingRequired: 'maybe',
      expected: /choose Yes, confirmation is required or No separate confirmation/,
    },
  ])(
    'purchase answers are explicit and valid: $purchaseKind / $receivingRequired',
    async ({ purchaseKind, receivingRequired, expected }) => {
      const { runId, workerUserId } = await startFieldJob('PurchaseAnswers')
      await workflowService.resumeWorkflow(runId, {}, workerUserId)
      for (const mode of ['manual', 'auto'] as const) {
        await expect(
          workflowHandoffService.start({
            runId,
            key: 'field_buy_materials',
            provided: { description: 'Materials', amount: 20, purchaseKind, receivingRequired },
            actedByUserId: workerUserId,
            mode,
          }),
        ).rejects.toThrow(expected)
      }
      expect(workflowHandoffService.links(runId)).toEqual([])
    },
  )

  test('a cash purchase holds the job until it is bought with its receipt, and the receipt comes back to the job', async () => {
    const { org, runId, workerUserId } = await startFieldJob('CashBuy')
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Cement', amount: 40, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })

    approveAsOwner(link.childId, org.orgTenantId, org.ownerUserId)
    // Approved is not enough by default: the job waits until the purchase is bought.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workflowHandoffService.waitingFor(runId)).toHaveLength(1)
    const approved = platformRequestService.getForTenant(link.childId, org.orgTenantId) as any
    expect(approved.nextStep?.label).toBe('Mark as bought')
    expect(workflowHandoffService.links(runId)[0].steps?.[0].statusLabel).toBe('Approved')
    const family = workflowHandoffService.familyOf(link.childId)
    expect(family?.fromLabel).toBe('From a job')
    expect(family?.partOfLine).toMatch(/^Part of job /)
    expect(family?.holdLine).toBe('The job waits for this purchase.')
    expect(family?.chain.find((member) => member.current)?.label).toBe('Purchase request')

    // Finishing it asks for the receipt number, the amount and a photo of the receipt.
    expect(() =>
      platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {}),
    ).toThrow(/Receipt number/)
    expect(() =>
      platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
        receiptRef: 'RCPT-9',
        amountPaid: 38,
      }),
    ).toThrow(/Photo of the receipt is needed, or a receipt record/)
    expect(() =>
      platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
        receiptRef: 'RCPT-9',
        amountPaid: 38,
        receiptImage: 'not-a-photo',
      }),
    ).toThrow(/must be a photo/)
    platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
      receiptRef: 'RCPT-9',
      amountPaid: 38,
      receiptImage: RECEIPT_PHOTO,
    })
    await waitFor(() => workflowHandoffService.waitingFor(runId).length === 0)
    const receipts = workflowHandoffService.purchaseReceipts(runId)
    expect(receipts).toEqual([expect.objectContaining({ receiptRef: 'RCPT-9', amount: 38, photoUri: RECEIPT_PHOTO })])
    expect(receipts[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect((platformRequestService.getForTenant(link.childId, org.orgTenantId) as any).receipt.photoUri).toBe(
      RECEIPT_PHOTO,
    )
    expect(workflowHandoffService.familyOf(link.childId)?.holdLine).toBe('The job continues.')
    expect(workflowHandoffService.links(runId)).toHaveLength(1)
    expect(() =>
      platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
        receiptRef: 'RCPT-9',
        amountPaid: 38,
        receiptImage: RECEIPT_PHOTO,
      }),
    ).toThrow('Invalid request transition: completed -> completed')
    const completed = platformRequestService.getForTenant(link.childId, org.orgTenantId) as any
    expect(completed.events.filter((event: { to_status?: string }) => event.to_status === 'completed')).toEqual([
      expect.objectContaining({ from_status: 'approved', actor_user_id: org.ownerUserId }),
    ])
    expect(workflowHandoffService.purchaseReceipts(runId)).toHaveLength(1)

    // The job's receipts step takes the purchase receipt and its photo instead of a new photo.
    await workflowService.resumeWorkflow(
      runId,
      { evidenceHash: 'b2', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' },
      workerUserId,
    )
    expect(run(runId).output.pauseReason).toBe('await_evidence_receipt')
    await workflowService.resumeWorkflow(runId, { phase: 'receipt', usePurchaseReceipts: true }, workerUserId)
    const stepReceipt = run(runId).output.evidenceReceipt
    expect(stepReceipt.purchases[0].receiptRef).toBe('RCPT-9')
    expect(stepReceipt.photoUri).toBe(RECEIPT_PHOTO)
    expect(stepReceipt.evidenceHash).toBe(receipts[0].sha256)
    expect(run(runId).output.pauseReason).toBe('await_evidence_after')
  })

  test('a receipt record from the wallet stands in for the photo', async () => {
    const { org, runId, workerUserId } = await startFieldJob('WalletReceipt')
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Paint', amount: 25, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    approveAsOwner(link.childId, org.orgTenantId, org.ownerUserId)
    platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
      receiptRef: 'RCPT-W1',
      amountPaid: 25,
      receiptRecord: {
        id: 'vc-receipt-1',
        vc_type: 'ReceiptVC',
        issuer_name: 'Paint Shop',
        credentialSubject: { secret: 'not stored' },
      },
    })
    await waitFor(() => workflowHandoffService.waitingFor(runId).length === 0)
    const [receipt] = workflowHandoffService.purchaseReceipts(runId)
    expect(receipt.photoUri).toBeUndefined()
    expect(receipt.record).toEqual({ id: 'vc-receipt-1', type: 'ReceiptVC', label: 'Receipt from Paint Shop' })

    await workflowService.resumeWorkflow(
      runId,
      { evidenceHash: 'b3', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' },
      workerUserId,
    )
    await workflowService.resumeWorkflow(runId, { phase: 'receipt', usePurchaseReceipts: true }, workerUserId)
    expect(run(runId).output.evidenceReceipt.vcId).toBe('vc-receipt-1')
    expect(run(runId).output.evidenceReceipt.vcType).toBe('ReceiptVC')
  })

  test('an organization can let the job continue as soon as the purchase is approved', async () => {
    const { org, runId, workerUserId } = await startFieldJob('ApproveOnly')
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', { continueOn: 'approved' })
    expect(
      workflowHandoffService.jobSettingsFor(org.orgTenantId).find((s) => s.key === 'field_buy_materials')?.continueOn,
    ).toBe('approved')
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Nails', amount: 5, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    approveAsOwner(link.childId, org.orgTenantId, org.ownerUserId)
    await waitFor(() => workflowHandoffService.waitingFor(runId).length === 0)
  })

  test('a supplier purchase runs purchase order, supplier bill and supplier payment, and the job gets both numbers back', async () => {
    const { org, runId, workerUserId } = await startFieldJob('SupplierBuy')
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: {
        description: 'Copper pipe',
        amount: 190,
        supplier: 'Pipe World',
        purchaseKind: 'goods',
        receivingRequired: 'yes',
      },
      actedByUserId: workerUserId,
      mode: 'manual',
    })

    approveAsOwner(link.childId, org.orgTenantId, org.ownerUserId)
    const order = await waitFor(() => childOf(link.childId, 'finance.purchase_order'))
    // The purchase request now waits on its order, so it has nothing of its own to do.
    expect((platformRequestService.getForTenant(link.childId, org.orgTenantId) as any).nextStep).toBeUndefined()

    approveAsOwner(order.id, org.orgTenantId, org.ownerUserId)
    // An approved order does not pay the supplier yet.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(childOf(order.id, 'finance.payment_request')).toBeUndefined()
    expect((platformRequestService.getForTenant(order.id, org.orgTenantId) as any).nextStep?.label).toBe(
      'Confirm delivery and bill',
    )

    expect(() =>
      platformRequestService.transitionBySubject(order.id, org.orgTenantId, org.ownerUserId, 'completed', {
        receiptRef: 'DELIVERY-12',
        receivedAmount: 190,
        invoiceRef: 'BILL-12',
        amount: 190,
      }),
    ).toThrow(/Photo of the delivery receipt/)
    platformRequestService.transitionBySubject(order.id, org.orgTenantId, org.ownerUserId, 'completed', {
      receiptRef: 'DELIVERY-12',
      receivedAmount: 190,
      invoiceRef: 'BILL-12',
      amount: 190,
      receiptImage: RECEIPT_PHOTO,
    })
    const payment = await waitFor(() => childOf(order.id, 'finance.payment_request'))
    expect(JSON.parse(payment.contextJson).invoiceRef).toBe('BILL-12')
    expect(payment.amount).toBe(190)
    expect(workflowHandoffService.waitingFor(runId)).toHaveLength(1)

    approveAsOwner(payment.id, org.orgTenantId, org.ownerUserId)
    platformRequestService.transitionBySubject(payment.id, org.orgTenantId, org.ownerUserId, 'completed', {
      receiptRef: 'PW-RCPT-3',
      amountPaid: 190,
      receiptImage: RECEIPT_PHOTO,
    })
    await waitFor(() => workflowHandoffService.waitingFor(runId).length === 0)

    // The purchase request closes with its chain, and the job sees every step and both numbers.
    expect((platformRequestService.getForTenant(link.childId, org.orgTenantId) as any).status).toBe('completed')
    const finished = workflowHandoffService.links(runId)[0]
    expect(finished.status).toBe('completed')
    expect((finished.result?.steps as any[]).map((step) => step.label)).toEqual([
      'Purchase request',
      'Purchase order',
      'Supplier payment',
    ])
    expect(workflowHandoffService.purchaseReceipts(runId)).toEqual([
      expect.objectContaining({ billRef: 'BILL-12', amount: 190, photoUri: RECEIPT_PHOTO }),
      expect.objectContaining({ receiptRef: 'PW-RCPT-3', amount: 190, photoUri: RECEIPT_PHOTO }),
    ])
  })

  test('buy materials holds the job until the purchase is approved, then the job continues', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Materials')
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', { continueOn: 'approved' })
    expect(run(runId).output.pauseReason).toBe('await_worker_start')

    // Before the worker starts, the hand-off is not offered yet (default: after "Worker started").
    expect(workflowHandoffService.availableFor(run(runId)).map((h) => h.key)).not.toContain('field_buy_materials')

    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    expect(run(runId).output.completedStages).toContain('await_worker_start')
    const offered = workflowHandoffService.availableFor(run(runId))
    expect(offered.map((h) => h.key)).toContain('field_buy_materials')
    // No client on this job, so a quote is not offered.
    expect(offered.map((h) => h.key)).not.toContain('field_quote_extra_work')

    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Copper pipe', amount: 85, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    expect(link.childKind).toBe('request')
    expect(link.status).toBe('running')

    // Starting it again returns the same purchase.
    const again = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Copper pipe', amount: 85, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    expect(again.id).toBe(link.id)

    // The job is held.
    await expect(
      workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' }),
    ).rejects.toThrow(/Buy materials/i)
    expect(run(runId).output.waitingForHandoffs).toEqual(['field_buy_materials'])

    // Approving the purchase hands control back.
    DatabaseManager.getDatabase().prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(link.childId)
    await workflowHandoffService.onRequestStatus(link.childId, 'approved')
    expect(workflowHandoffService.waitingFor(runId)).toHaveLength(0)
    expect(run(runId).output.handoffs[0].status).toBe('completed')

    await workflowService.resumeWorkflow(
      runId,
      { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' },
      workerUserId,
    )
    // The receipts for the materials just bought come next, before the work.
    expect(run(runId).output.pauseReason).toBe('await_evidence_receipt')
    void org
    void platformRequestService
  })

  test('an automatic purchase needs explicit answers before it can create a child', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Auto')
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', {
      startMode: 'auto',
      requiredStages: ['await_worker_start'],
    })

    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const links = workflowHandoffService.links(runId)
    expect(links).toEqual([])
    expect(workflowHandoffService.holdMessage(runId)).toBeUndefined()
    const problem = run(runId).output.handoffProblems.field_buy_materials
    expect(problem.message).toMatch(/needs input/i)
    expect(problem.message).toMatch(/What are you buying/)
    expect(problem.message).toMatch(/Confirm delivery or service before payment/)
    expect(problem.message).toMatch(/Start it manually/i)
    expect(
      DatabaseManager.getDatabase()
        .prepare(`SELECT id FROM requests WHERE organization_id = ? AND request_type = 'procurement.requisition'`)
        .all(org.organizationId),
    ).toEqual([])
  })

  test('a job started from the built-in template materialized for the organization still offers hand-offs', async () => {
    // The website starts jobs from `tpl-fept-field-execution-<orgTenantId>`; the type lives on the
    // workflow row's category, not in the id.
    const org = seedOrganization({ name: 'Materialized' })
    orgSetupProfileService.save(org.orgTenantId, {
      operatingModel: 'internal',
      modules: ['field_jobs', 'purchases', 'payables', 'collections'],
      expectedRevision: 0,
    })
    addRole(org.organizationId, 'Field Worker')
    const workerUserId = `worker-mat-${Date.now()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerUserId,
      role: 'field_worker',
    })
    const workflow = ensureExecutableWorkflow(org.orgTenantId, 'field_execution_fept')!
    expect(workflow.id).toBe(`tpl-fept-field-execution-${org.orgTenantId}`)
    const start = await workflowService.executeWorkflow(
      workflow.id,
      {
        reference: 'JOB-MAT',
        amount: 90,
        assigneeId: workerUserId,
        requireSiteInspection: false,
        requireRiskAssessment: 'false',
        requireArrivalProof: false,
      },
      org.orgTenantId,
    )
    await workflowService.resumeWorkflow(start.runId, {}, workerUserId)
    expect(workflowHandoffService.availableFor(run(start.runId)).map((h) => h.key)).toContain('field_buy_materials')

    // The built-in template puts `requireGps` / `requirePhoto` on every step. Receipts that come
    // back from the purchase (or a wallet record) need neither a location nor a new photo.
    const link = await workflowHandoffService.start({
      runId: start.runId,
      key: 'field_buy_materials',
      provided: { description: 'Sand', amount: 20, purchaseKind: 'goods', receivingRequired: 'yes' },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    approveAsOwner(link.childId, org.orgTenantId, org.ownerUserId)
    platformRequestService.transitionBySubject(link.childId, org.orgTenantId, org.ownerUserId, 'completed', {
      receiptRef: 'RCPT-M1',
      amountPaid: 20,
      receiptRecord: { id: 'vc-receipt-m1', vc_type: 'ReceiptVC', issuer_name: 'Sand Yard' },
    })
    await waitFor(() => workflowHandoffService.waitingFor(start.runId).length === 0)
    await workflowService.resumeWorkflow(
      start.runId,
      { evidenceHash: 'bm', phase: 'before', photoUri: 'b.jpg', gps: '-17.8,31.0' },
      workerUserId,
    )
    expect(run(start.runId).output.pauseReason).toBe('await_evidence_receipt')
    await workflowService.resumeWorkflow(start.runId, { phase: 'receipt', usePurchaseReceipts: true }, workerUserId)
    expect(run(start.runId).output.evidenceReceipt.vcId).toBe('vc-receipt-m1')
    expect(run(start.runId).output.pauseReason).toBe('await_evidence_after')
  })

  test('a switched-off hand-off is never offered', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Off', { clientName: 'Acme' })
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', { enabled: false })
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const keys = workflowHandoffService.availableFor(run(runId)).map((h) => h.key)
    expect(keys).not.toContain('field_buy_materials')
    expect(keys).toContain('field_quote_extra_work')
    const settings = workflowHandoffService.settingsFor(org.orgTenantId)
    expect(settings.find((s) => s.key === 'field_quote_extra_work')?.conditionLabel).toMatch(/client/i)
    expect(settings.some((s) => s.kind === 'request' && /supplier/i.test(s.conditionLabel))).toBe(true)
  })
})

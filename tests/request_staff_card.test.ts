/**
 * Request-path purchases use the shared staff-card check (StageProofService) and the shared
 * money-step inbox card; the old requisition create endpoint now raises a request-path purchase.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { AccountsPayableController } from '../src/controllers/finance/AccountsPayableController'
import { RequisitionController } from '../src/controllers/finance/RequisitionController'
import { RequestController } from '../src/controllers/platform/RequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService, staffCardStepFor } from '../src/services/PlatformRequestService'
import { stepAssuranceFor, updateOrgProofVcPolicy } from '../src/services/ProofVcPolicyService'
import { ReconciliationService } from '../src/services/ReconciliationService'
import { stageProofService } from '../src/services/ssi/StageProofService'
import {
  MONEY_STEP_SOURCE_TYPE,
  resolveMoneyStepInboxCards,
  upsertMoneyStepInboxCard,
} from '../src/services/WorkflowStageInboxService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-request-staff-card-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `actor-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => {
  databases.cleanup()
})

afterEach(() => {
  jest.restoreAllMocks()
})

function raisePurchase(orgTenantId: string, requesterUserId: string) {
  const created = platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef: requesterUserId,
    requestType: 'procurement.requisition',
    title: 'Printer paper',
    amount: 80,
    currency: 'USD',
    targetModule: 'finance',
    context: { supplierRef: 'stationers' },
    items: [{ description: 'Printer paper', quantity: 4, unitPrice: 20 }],
  }) as { id: string }
  platformRequestService.submit(created.id, orgTenantId, requesterUserId)
  return created.id
}

function seedPurchaseOrg(name: string) {
  const org = seedOrganization({ name })
  const clerk = `user-${randomUUID()}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: clerk })
  return { ...org, clerk }
}

function asUser(tenantId: string, userId: string, orgRole = 'owner') {
  return { user: { tenantId, sub: userId, id: userId, orgRole }, headers: {}, agent: {} } as any
}

function mockVerifiedShare() {
  return jest.spyOn(stageProofService, 'verifyStageProof').mockImplementation(async (params) => ({
    requestId: params.requestId,
    holderDid: 'did:key:approver',
    presentedTypes: ['OrgMembershipVC'],
    actorProof: { present: true, valid: true } as any,
    verifiedAt: new Date().toISOString(),
  }))
}

describe('staff card on request-path purchases', () => {
  test('purchases and payments ask for a card; leave and other requests do not', () => {
    expect(staffCardStepFor('procurement.requisition', 'approved')).toBe('requisition_approval')
    expect(staffCardStepFor('finance.purchase_order', 'completed')).toBe('requisition_ack')
    expect(staffCardStepFor('finance.payment_request', 'completed')).toBe('payment_record')
    expect(staffCardStepFor('hr.leave', 'approved')).toBeUndefined()
    expect(staffCardStepFor('procurement.requisition', 'rejected')).toBeUndefined()
  })

  test('the requester cannot approve their own purchase with a card', () => {
    const org = seedPurchaseOrg('Card Check Ltd')
    const clerk = org.clerk
    const requestId = raisePurchase(org.orgTenantId, clerk)

    expect(() => platformRequestService.staffCardStep(requestId, org.orgTenantId, clerk, 'approved')).toThrow(
      expect.objectContaining({ status: 403 }) as any,
    )
    expect(() => platformRequestService.staffCardStep(requestId, org.orgTenantId, org.ownerUserId, 'rejected')).toThrow(
      'This step does not ask for a staff card.',
    )
    expect(() => platformRequestService.staffCardStep('missing', org.orgTenantId, org.ownerUserId, 'approved')).toThrow(
      'Request not found',
    )
    const step = platformRequestService.staffCardStep(requestId, org.orgTenantId, org.ownerUserId, 'approved')
    expect(step.actionKey).toBe('requisition_approval')
  })

  test('a verified card approves the purchase once, even when the finish is sent twice', async () => {
    const org = seedPurchaseOrg('Card Finish Ltd')
    const clerk = org.clerk
    const requestId = raisePurchase(org.orgTenantId, clerk)
    const verify = mockVerifiedShare()
    const controller = new RequestController()

    const first = await controller.staffCardComplete(asUser(org.orgTenantId, org.ownerUserId), requestId, {
      toStatus: 'approved',
      requestId: 'proof-1',
    })
    const again = await controller.staffCardComplete(asUser(org.orgTenantId, org.ownerUserId), requestId, {
      toStatus: 'approved',
      requestId: 'proof-1',
    })

    expect(first.status).toBe('approved')
    expect(again.status).toBe('approved')
    expect(verify).toHaveBeenCalledTimes(1)
    const event = DatabaseManager.getDatabase()
      .prepare(
        `SELECT payload_json FROM request_events WHERE request_id = ? AND to_status = 'approved' ORDER BY rowid DESC LIMIT 1`,
      )
      .get(requestId) as { payload_json: string }
    expect(JSON.parse(event.payload_json).staffCard).toMatchObject({ requestId: 'proof-1', actorCredential: true })
  })

  test('a refused card leaves the purchase waiting', async () => {
    const org = seedPurchaseOrg('Card Refused Ltd')
    const clerk = org.clerk
    const requestId = raisePurchase(org.orgTenantId, clerk)
    jest.spyOn(stageProofService, 'verifyStageProof').mockRejectedValue(new Error('This card is not for this step.'))

    await expect(
      new RequestController().staffCardComplete(asUser(org.orgTenantId, org.ownerUserId), requestId, {
        toStatus: 'approved',
        requestId: 'proof-2',
      }),
    ).rejects.toThrow('This card is not for this step.')
    const row = DatabaseManager.getDatabase().prepare('SELECT status FROM requests WHERE id = ?').get(requestId) as {
      status: string
    }
    expect(['submitted', 'in_review']).toContain(row.status)
  })
})

describe('which steps need the staff card', () => {
  test('marking a purchase order delivered is a signed-in step; approving one is not when the org requires the card', () => {
    const org = seedPurchaseOrg('Step Rule Ltd')
    expect(stepAssuranceFor(org.orgTenantId, 'requisition_ack', 5000)).toBe('session')
    expect(stepAssuranceFor(org.orgTenantId, 'payment_record', 5000)).toBe('session')
    expect(stepAssuranceFor(org.orgTenantId, 'requisition_release', 1)).toBe('card_required')

    updateOrgProofVcPolicy(org.orgTenantId, {
      stepAssurance: { cardRequiredAbove: null, steps: { requisition_approval: 'card_required' } },
    })
    const requestId = raisePurchase(org.orgTenantId, org.clerk)
    expect(() =>
      platformRequestService.transition(requestId, org.orgTenantId, 'approved', org.ownerUserId, {}, org.ownerUserId),
    ).toThrow('This step needs your staff card. Use "Approve with staff card".')
  })

  function seedLegacyRequisition(orgTenantId: string, amount: number, approved: boolean) {
    const id = `REQ-${randomUUID()}`
    const reconciliation = new ReconciliationService()
    reconciliation.recordEvent(id, 'REQUISITION_CREATED', 'portal', { amount, currency: 'USD', tenantId: orgTenantId })
    if (approved) reconciliation.recordEvent(id, 'REQUISITION_APPROVED', 'portal', { tenantId: orgTenantId })
    return id
  }

  test('the older release step refuses to move money without a checked staff card', async () => {
    const org = seedPurchaseOrg('Legacy Release Ltd')
    const id = seedLegacyRequisition(org.orgTenantId, 300, true)
    const controller = new RequisitionController()
    const verify = jest
      .spyOn(stageProofService, 'verifyStageProof')
      .mockRejectedValue(Object.assign(new Error('This share was for a different step.'), { status: 403 }))

    const bare = await controller.releaseFunds(id, { amount: 300, currency: 'USD' }, asUser(org.orgTenantId, org.ownerUserId))
    expect(bare).toMatchObject({ error: expect.stringContaining('staff card') })
    expect(verify).not.toHaveBeenCalled()

    const refused = await controller.releaseFunds(
      id,
      { amount: 300, currency: 'USD', requestId: 'release-proof-1' },
      asUser(org.orgTenantId, org.ownerUserId),
    )
    expect(refused).toMatchObject({ error: 'This share was for a different step.' })
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'requisition_release', reference: id, requestId: 'release-proof-1' }),
    )
    expect(new ReconciliationService().getStatus(id)?.status).toBe('APPROVED')
  })

  test('the older approve step refuses a bare signature when the org requires the card at that amount', async () => {
    const org = seedPurchaseOrg('Legacy Approve Ltd')
    updateOrgProofVcPolicy(org.orgTenantId, { stepAssurance: { cardRequiredAbove: 100, steps: {} } })
    const id = seedLegacyRequisition(org.orgTenantId, 500, false)

    const result = await new RequisitionController().approveRequisition(
      id,
      { requestId: 'approve-proof-1', approvalSignature: 'typed-signature' },
      asUser(org.orgTenantId, org.ownerUserId),
    )
    expect(result).toMatchObject({ error: 'This approval needs your staff card. Share it from your wallet.' })
    expect(new ReconciliationService().getStatus(id)?.status).toBe('REQUISITION_CREATED')
  })
})

describe('one purchase path', () => {
  test('the old requisition endpoint raises a request-path purchase', async () => {
    const org = seedPurchaseOrg('One Path Ltd')
    const result = await new RequisitionController().requestRequisition(
      {
        items: [{ id: 'i1', name: 'Toner', price: 45, quantity: 2 }],
        totalAmount: 90,
        currency: 'USD',
        department: 'Office',
        vendor: 'stationers',
      },
      asUser(org.orgTenantId, org.ownerUserId),
    )

    expect(result.error).toBeUndefined()
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT request_type, status, amount FROM requests WHERE id = ?')
      .get(result.requestId) as { request_type: string; status: string; amount: number }
    expect(row.request_type).toBe('procurement.requisition')
    expect(row.status).toBe('submitted')
    expect(row.amount).toBe(90)
    const legacy = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM workflow_requests WHERE target_org_tenant_id = ?`)
      .get(org.orgTenantId) as { n: number }
    expect(legacy.n).toBe(0)
  })
})

describe('supplier-bill steps', () => {
  test('the remittance needs a checked share; issuing the receipt afterwards does not', async () => {
    const collector = seedOrganization({ name: 'Receipt Collector Ltd' })
    const payer = seedOrganization({ name: 'Receipt Payer Ltd' })
    const db = DatabaseManager.getDatabase()
    const transactionId = `ARAPTX-${randomUUID()}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO ar_ap_workflow_transactions
         (id, source_type, source_payment_link_id, payer_tenant_id, collector_tenant_id, amount, currency,
          status, workflow_stage, trust_status,
          required_action, required_actor_tenant_id, required_actor_role, required_proof_type, proof_request_id,
          last_action_at, created_at, updated_at)
       VALUES (?, 'ar_plan', ?, ?, ?, 120, 'USD', 'payment_recorded', 'payment_recorded', 'pending',
               'acknowledge_remittance', ?, 'owner', 'RemittanceAdviceVC', 'remit-proof-1', ?, ?, ?)`,
    ).run(transactionId, `PL-${randomUUID()}`, payer.orgTenantId, collector.orgTenantId, collector.orgTenantId, now, now, now)

    const controller = new AccountsPayableController()
    jest.spyOn(controller as any, 'resolveWorkflowActorTenant').mockReturnValue({
      tenantId: collector.orgTenantId,
      role: 'owner',
      mode: 'org',
    })
    const verify = jest.spyOn(controller as any, 'assertVerifiedWorkflowProof').mockResolvedValue(undefined)
    const owner = asUser(collector.orgTenantId, collector.ownerUserId)

    const unproven = await controller.transitionWorkflowAction(transactionId, { transition: 'acknowledge_remittance' }, owner)
    expect(unproven).toMatchObject({ error: expect.stringContaining('RemittanceAdviceVC') })

    await controller.transitionWorkflowAction(
      transactionId,
      { transition: 'acknowledge_remittance', proofResponseId: 'remit-response-1' },
      owner,
    )
    expect(verify).toHaveBeenCalledTimes(1)
    const waiting = db
      .prepare('SELECT required_action, required_proof_type FROM ar_ap_workflow_transactions WHERE id = ?')
      .get(transactionId) as { required_action: string; required_proof_type: string | null }
    expect(waiting).toEqual({ required_action: 'issue_receipt_vc', required_proof_type: null })

    await controller.transitionWorkflowAction(transactionId, { transition: 'issue_receipt_vc' }, owner)
    expect(verify).toHaveBeenCalledTimes(1)
    const done = db
      .prepare('SELECT status, required_action FROM ar_ap_workflow_transactions WHERE id = ?')
      .get(transactionId) as { status: string; required_action: string | null }
    expect(done).toEqual({ status: 'completed', required_action: null })
  })
})

describe('shared money-step inbox card', () => {
  test('supplier-bill and collection steps write one card in plain words, then close it', () => {
    const org = seedOrganization({ name: 'Money Step Ltd' })
    const db = DatabaseManager.getDatabase()
    const transactionId = `tx-${randomUUID()}`
    const params = {
      transactionId,
      actorTenantId: org.orgTenantId,
      actorRole: 'owner',
      orgTenantId: org.orgTenantId,
      requiredAction: 'record_payment',
    }

    const first = upsertMoneyStepInboxCard(db, params)
    const second = upsertMoneyStepInboxCard(db, params)
    expect(second).toBe(first)

    const card = db
      .prepare(`SELECT title, body FROM wallet_pending_offers WHERE id = ?`)
      .get(first) as { title: string; body: string }
    expect(card.title).toBe('A supplier bill needs you')
    expect(card.body).toBe('You were chosen to record a payment.')

    resolveMoneyStepInboxCards(db, transactionId)
    const open = db
      .prepare(
        `SELECT COUNT(*) AS n FROM wallet_pending_offers WHERE source_type = ? AND source_id = ? AND resolved_at IS NULL`,
      )
      .get(MONEY_STEP_SOURCE_TYPE, transactionId) as { n: number }
    expect(open.n).toBe(0)
  })
})

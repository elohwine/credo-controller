/**
 * Request-path purchases use the shared staff-card check (StageProofService) and the shared
 * money-step inbox card; the old requisition create endpoint now raises a request-path purchase.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { RequisitionController } from '../src/controllers/finance/RequisitionController'
import { RequestController } from '../src/controllers/platform/RequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService, staffCardStepFor } from '../src/services/PlatformRequestService'
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
    expect(staffCardStepFor('finance.purchase_order', 'completed')).toBe('requisition_release')
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

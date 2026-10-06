/**
 * A request can start the next request: requisition → purchase order → payment,
 * with per-organization overrides and an explicit workflow action.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { requestHandoffService } from '../src/services/RequestHandoffService'
import { triggerFollowOnRequest } from '../src/services/workflow/actions/RequestTriggerAction'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-request-handoff-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `actor-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => {
  databases.cleanup()
})

function createRequisition(orgTenantId: string, ownerUserId: string, title: string) {
  return platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef: ownerUserId,
    requestType: 'procurement.requisition',
    title,
    amount: 4200,
    currency: 'USD',
    targetModule: 'procurement',
    context: { categoryCode: 'equipment', supplierRef: 'supplier-1' },
    items: [{ description: 'Office chairs', quantity: 4, unitPrice: 100 }],
  }) as { id: string }
}

describe('request handoffs', () => {
  test('an approved requisition starts a purchase order, and that order starts a payment', () => {
    const org = seedOrganization({ name: 'Procurement Ltd' })
    const requisition = createRequisition(org.orgTenantId, org.ownerUserId, 'Office equipment')

    const first = requestHandoffService.continueFromPlatformRequest({
      tenantId: org.orgTenantId,
      organizationId: org.organizationId,
      requestId: requisition.id,
      requestType: 'procurement.requisition',
      toStatus: 'approved',
    })
    const again = requestHandoffService.continueFromPlatformRequest({
      tenantId: org.orgTenantId,
      organizationId: org.organizationId,
      requestId: requisition.id,
      requestType: 'procurement.requisition',
      toStatus: 'approved',
    })

    expect(first).toHaveLength(1)
    expect(first[0].requestType).toBe('finance.purchase_order')
    expect(again[0].id).toBe(first[0].id)

    const purchaseOrder = DatabaseManager.getDatabase()
      .prepare('SELECT status, parent_request_id, request_type, context_json FROM requests WHERE id = ?')
      .get(first[0].id) as { status: string; parent_request_id: string; request_type: string; context_json: string }
    expect(purchaseOrder.parent_request_id).toBe(requisition.id)
    expect(purchaseOrder.status).toBe('submitted')
    expect(JSON.parse(purchaseOrder.context_json).supplierRef).toBe('supplier-1')

    const payment = requestHandoffService.continueFromPlatformRequest({
      tenantId: org.orgTenantId,
      requestId: first[0].id,
      requestType: 'finance.purchase_order',
      toStatus: 'approved',
    })
    expect(payment[0].requestType).toBe('finance.payment_request')
  })

  test('an organization can turn a built-in handoff off and add its own', () => {
    const org = seedOrganization({ name: 'Custom Chain Ltd' })
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO request_handoffs (id, organization_id, from_request_type, on_status, to_request_type, enabled)
       VALUES (?, ?, 'procurement.requisition', 'approved', 'finance.purchase_order', 0)`,
    ).run(randomUUID(), org.organizationId)
    db.prepare(
      `INSERT INTO request_handoffs (id, organization_id, from_request_type, on_status, to_request_type, title, target_module, enabled)
       VALUES (?, ?, 'procurement.requisition', 'approved', 'field.maintenance', 'Install the equipment', 'field', 1)`,
    ).run(randomUUID(), org.organizationId)

    const requisition = createRequisition(org.orgTenantId, org.ownerUserId, 'Workshop tools')
    const spawned = requestHandoffService.continueFromPlatformRequest({
      tenantId: org.orgTenantId,
      organizationId: org.organizationId,
      requestId: requisition.id,
      requestType: 'procurement.requisition',
      toStatus: 'approved',
    })

    expect(spawned.map((item) => item.requestType)).toEqual(['field.maintenance'])
  })

  test('a workflow step can name the next request explicitly', async () => {
    const org = seedOrganization({ name: 'Trigger Ltd' })
    const requisition = createRequisition(org.orgTenantId, org.ownerUserId, 'Site materials')
    const state: Record<string, any> = {}

    await triggerFollowOnRequest(
      {
        input: { requestId: requisition.id, requestType: 'procurement.requisition' },
        workflowId: 'wf-1',
        tenantId: org.orgTenantId,
        state,
      },
      { requestType: 'field.inspection', title: 'Check the delivery' },
    )

    expect(state.triggeredRequest.status).toBe('created')
    expect(state.triggeredRequest.requestType).toBe('field.inspection')
  })

  test('an approved quote workflow request opens an invoice', () => {
    const org = seedOrganization({ name: 'Commercial Ltd' })
    const spawned = requestHandoffService.continueFromWorkflowRequest({
      orgTenantId: org.orgTenantId,
      requestId: `wf-req-${randomUUID()}`,
      requestType: 'quote',
      title: 'Annual service',
      amount: 900,
      currency: 'USD',
      actedByUserId: org.ownerUserId,
    })
    expect(spawned[0].requestType).toBe('invoice')
    expect(spawned[0].title).toContain('Annual service')
  })

  test('a cash requisition is paid on release and does not open procurement', () => {
    const org = seedOrganization({ name: 'Cash Ltd' })
    const cash = requestHandoffService.continueFromWorkflowRequest({
      orgTenantId: org.orgTenantId,
      requestId: `wf-req-${randomUUID()}`,
      requestType: 'requisition',
      title: 'Transport to site',
      amount: 40,
      currency: 'USD',
      payload: { vendor: 'TBD', items: [{ name: 'Bus fare', price: 40, quantity: 1 }] },
      actedByUserId: org.ownerUserId,
    })
    expect(cash).toHaveLength(0)

    const supplier = requestHandoffService.continueFromWorkflowRequest({
      orgTenantId: org.orgTenantId,
      requestId: `wf-req-${randomUUID()}`,
      requestType: 'requisition',
      title: 'Cement',
      amount: 600,
      currency: 'USD',
      payload: { vendor: 'BuildMart', items: [{ name: 'Cement bags', price: 12, quantity: 50 }] },
      actedByUserId: org.ownerUserId,
    })
    expect(supplier.map((item) => item.requestType)).toEqual(['finance.purchase_order'])
  })

  test('a requisition approval that only passes its id still reads the supplier it was raised with', () => {
    const org = seedOrganization({ name: 'Lookup Ltd' })
    const requisitionId = `req-${randomUUID()}`
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO workflow_requests (id, requester_tenant_id, target_org_tenant_id, request_type, workflow_type, payload, status)
         VALUES (?, ?, ?, 'requisition', 'internal_requisition_approval', ?, 'approved')`,
      )
      .run(randomUUID(), org.orgTenantId, org.orgTenantId, JSON.stringify({ requisitionId, vendor: 'Petty cash', paymentMethod: 'cash' }))

    const spawned = requestHandoffService.continueFromWorkflowRequest({
      orgTenantId: org.orgTenantId,
      requestId: requisitionId,
      requestType: 'requisition',
      actedByUserId: org.ownerUserId,
    })
    expect(spawned).toHaveLength(0)
  })

  test('settings describe when each follow-on starts, and manual ones wait for someone to ask', () => {
    const org = seedOrganization({ name: 'Manual Ltd' })
    const key = 'request:procurement.requisition|approved|finance.purchase_order'
    const setting = requestHandoffService.catalogFor(org.organizationId).find((rule) => rule.key === key)!
    expect(setting.conditionLabel).toMatch(/supplier/i)

    requestHandoffService.saveSetting(org.organizationId, {
      fromType: 'procurement.requisition',
      onStatus: 'approved',
      toType: 'finance.purchase_order',
      startMode: 'manual',
    })
    const requisition = createRequisition(org.orgTenantId, org.ownerUserId, 'Generator')
    const automatic = requestHandoffService.continueFromPlatformRequest({
      tenantId: org.orgTenantId,
      organizationId: org.organizationId,
      requestId: requisition.id,
      requestType: 'procurement.requisition',
      toStatus: 'approved',
    })
    expect(automatic).toHaveLength(0)

    const offered = requestHandoffService.manualNextFor({
      tenantId: org.orgTenantId,
      organizationId: org.organizationId,
      requestId: requisition.id,
      requestType: 'procurement.requisition',
      status: 'approved',
    })
    expect(offered.map((item) => item.toType)).toEqual(['finance.purchase_order'])
    const started = requestHandoffService.startManual({
      tenantId: org.orgTenantId,
      parentRequestId: requisition.id,
      toType: 'finance.purchase_order',
    })
    expect(started?.requestType).toBe('finance.purchase_order')
  })
})

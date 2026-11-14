/**
 * A request from an organisation's public page is mapped to what the organisation set up:
 * the service is read from its catalog, its work area must be on, the phone is kept for
 * bills and WhatsApp, and the person who asked sees dated progress.
 */

import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { WorkflowRequestController } from '../src/controllers/contacts/WorkflowRequestController'
import { contactRepository } from '../src/persistence/ContactRepository'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'
import { workflowService } from '../src/services/WorkflowService'
import { initTestDatabases, seedOrganization, type SeededOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
let org: SeededOrganization
const services: Record<string, string> = {}

function addService(registryId: string, key: string, module: string | null, template: string | null, active = true) {
  const id = `svc-${key}-${randomUUID().slice(0, 6)}`
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO service_catalog (id, org_id, service_type, name, workflow_template_id, is_active, metadata)
       VALUES (?, ?, 'workflow', ?, ?, ?, ?)`,
    )
    .run(id, registryId, `Service ${key}`, template, active ? 1 : 0, JSON.stringify({ offeringKey: key, module }))
  services[key] = id
}

function ask(payload: Record<string, unknown>, requestType: 'quote' | 'invoice' | 'service' = 'service') {
  const userId = `user-${randomUUID()}`
  const walletTenantId = `wallet-${userId}`
  const now = new Date().toISOString()
  DatabaseManager.getDatabase()
    .prepare(`INSERT INTO ssi_users (id, tenant_id, did, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, walletTenantId, `did:key:${userId}`, now, now)
  const controller = new WorkflowRequestController()
  return controller.createRequest(
    { targetOrgTenantId: org.orgTenantId, requesterName: 'Tariro', requestType, payload },
    { tenantId: walletTenantId, holderDid: `did:key:${userId}` } as any,
  )
}

beforeAll(() => {
  databases = initTestDatabases('credo-public-offering-')
  org = seedOrganization({ name: 'Fixit Co', setup: 'new' })
  const db = DatabaseManager.getDatabase()
  db.prepare(
    `UPDATE org_setup_profiles SET configuration_mode = 'explicit', kinds = '["field","office"]',
       modules = '["field_jobs","collections"]', configuration_revision = 1 WHERE org_tenant_id = ?`,
  ).run(org.orgTenantId)
  // The public registry id differs from the internal organisation id, as in production.
  const registryId = `org-${Date.now()}-reg`
  db.prepare(
    `INSERT INTO organization_registry (id, tenant_id, display_name, category, issuer_did) VALUES (?, ?, ?, 'supplier', ?)`,
  ).run(registryId, org.orgTenantId, org.name, `did:web:${org.orgTenantId}`)
  addService(registryId, 'book_job', 'field_jobs', 'tpl-fept-field-execution')
  addService(registryId, 'pay_bill', 'collections', 'tpl-ar-collections')
  addService(registryId, 'school_fees', 'school_fees', 'tpl-education-fee')
  addService(registryId, 'order_quote', 'commerce', 'tpl-quote-invoice-receipt', false)
})

afterAll(() => {
  jest.restoreAllMocks()
  databases.cleanup()
})

describe('Public requests follow organisation setup', () => {
  test('booking a job finds the service through the public registry and starts the field job', async () => {
    const execute = jest
      .spyOn(workflowService, 'executeWorkflow')
      .mockResolvedValue({ runId: 'run-booked', status: 'paused' } as any)
    const response = await ask({
      serviceId: services.book_job,
      description: 'Geyser leaking',
      location: '12 Main St, Harare',
      customerMsisdn: '+263 77 123 4567',
      serviceName: 'Client says otherwise',
    })
    expect(execute).toHaveBeenCalledWith(
      'field_execution_fept',
      expect.objectContaining({ awaitAssignment: true, customerMsisdn: '+263771234567', location: '12 Main St, Harare' }),
      org.orgTenantId,
      expect.anything(),
    )
    expect(response.workflowType).toBe('field_execution_fept')
    expect(response.status).toBe('approved')
    expect(response.payload).toMatchObject({ serviceName: 'Service book_job', offeringKey: 'book_job', workArea: 'field_jobs' })
    execute.mockRestore()
  })

  test('a bill request keeps the phone on the contact and returns dated progress', async () => {
    const response = await ask({ serviceId: services.pay_bill, description: 'Last month', phone: '0771 234 567' }, 'invoice')
    expect(response.payload).toMatchObject({ offeringKey: 'pay_bill', workArea: 'collections', workflowTemplateId: 'tpl-ar-collections' })
    expect(response.experience?.family).toBe('collections')
    const submitted = response.experience?.stages.find((stage) => stage.key === 'submitted')
    expect(submitted).toMatchObject({ status: 'done', at: response.createdAt })
    const saved = contactRepository
      .list(org.orgTenantId, 'external')
      .find((entry) => entry.walletTenantId === response.requesterTenantId)
    expect(saved?.phone).toBe('+263771234567')
  })

  test('a service whose work area is off in setup is refused in plain words', async () => {
    await expect(ask({ serviceId: services.school_fees, description: 'Term 1' }, 'invoice')).rejects.toMatchObject({
      status: 403,
    })
  })

  test('a hidden service is refused', async () => {
    await expect(ask({ serviceId: services.order_quote, description: '10 chairs' }, 'quote')).rejects.toMatchObject({
      status: 404,
    })
  })

  test('accepting a bill request needs the price, which becomes the one-off bill', async () => {
    const asked = await ask({ serviceId: services.pay_bill, description: 'Water, March', phone: '0771 234 567' }, 'invoice')
    const controller = new WorkflowRequestController()
    const ownerReq = () =>
      ({ tenantId: org.orgTenantId, headers: {}, user: { id: org.ownerUserId, orgRole: 'owner' } }) as any
    await expect(controller.approveRequest(asked.id, { executeWorkflow: true }, ownerReq())).rejects.toMatchObject({
      status: 400,
      code: 'price_required',
    })

    const ready = jest
      .spyOn(workflowReadinessService, 'evaluateTemplate')
      .mockReturnValue({ ready: true, blocking: [], workflowType: 'tpl-ar-collections' } as any)
    const execute = jest
      .spyOn(workflowService, 'executeWorkflow')
      .mockResolvedValue({ runId: 'run-bill', status: 'running' } as any)
    const approved = await controller.approveRequest(
      asked.id,
      { executeWorkflow: true, price: { amount: 42.5, currency: 'usd', note: 'Water for March' } },
      ownerReq(),
    )
    expect(execute).toHaveBeenCalledWith(
      'tpl-ar-collections',
      expect.objectContaining({
        collectionType: 'one_time',
        description: 'Water for March',
        totalAmount: 42.5,
        currency: 'USD',
        payerPhone: '+263771234567',
      }),
      org.orgTenantId,
      expect.anything(),
    )
    expect(approved.status).toBe('approved')
    expect(approved.workflowId).toBe('run-bill')
    expect(approved.payload).toMatchObject({ totalAmount: 42.5, currency: 'USD', priceNote: 'Water for March', billedByFlow: true })
    execute.mockRestore()
    ready.mockRestore()
  })

  test('a plain question is accepted without a price', async () => {
    const asked = await ask({ description: 'Open on Sunday?' }, 'quote')
    const controller = new WorkflowRequestController()
    const approved = await controller.approveRequest(
      asked.id,
      {},
      { tenantId: org.orgTenantId, headers: {}, user: { id: org.ownerUserId, orgRole: 'owner' } } as any,
    )
    expect(approved.status).toBe('approved')
    expect(approved.payload.totalAmount).toBeUndefined()
  })

  test('a general question needs no service', async () => {
    const response = await ask({ description: 'Do you work on weekends?' }, 'quote')
    expect(response.status).toBe('pending')
    expect(response.payload.offeringKey).toBeUndefined()
  })
})

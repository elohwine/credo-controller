/**
 * Field and finance request families: readiness (not an enabled flag) decides
 * whether the related workflow may run, and a real status transition spawns the
 * declared follow-on request.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'

import {
  addMember,
  addRole,
  configureFeptTemplate,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-request-family-')
})

afterAll(() => {
  databases.cleanup()
})

function childOf(parentId: string, requestType: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT id, request_type AS requestType, status, parent_request_id AS parentId, context_json AS contextJson
       FROM requests WHERE parent_request_id = ? AND request_type = ?`,
    )
    .get(parentId, requestType) as
    | { id: string; requestType: string; status: string; parentId: string; contextJson: string }
    | undefined
}

/** Handoff runs after the status commit via a dynamic import. */
async function waitForChild(parentId: string, requestType: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = childOf(parentId, requestType)
    if (row) return row
    await new Promise((resolve) => setImmediate(resolve))
  }
  return undefined
}

describe('field request family — readiness plus site access follow-on', () => {
  test('a disabled template is still gated by prerequisites, and approval starts inspection then maintenance', async () => {
    const org = seedOrganization({ name: 'SGK Sites' })
    const approverPersonId = addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      role: 'admin',
    })

    // enabled: false must not be what blocks or allows the workflow.
    configureFeptTemplate(org.orgTenantId, { enabled: false })
    const blocked = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')
    expect(blocked.ready).toBe(false)
    expect(blocked.blocking.map((item) => item.key)).toEqual(expect.arrayContaining(['roles']))
    expect(blocked.blocking.map((item) => item.key)).not.toContain('stage_actor:assign_field_worker')

    addRole(org.organizationId, 'Field Worker')
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'field_worker' })
    const ready = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')
    expect(ready.ready).toBe(true)

    const access = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'field.site_access',
      title: 'Depot access',
      targetModule: 'field',
      context: { siteRef: 'site-depot-1', accessPurpose: 'inspection', validFrom: '2026-09-30' },
    }) as { id: string }

    platformRequestService.submit(access.id, org.orgTenantId, org.ownerUserId)
    platformRequestService.transition(access.id, org.orgTenantId, 'in_review', approverPersonId)
    platformRequestService.transition(access.id, org.orgTenantId, 'approved', approverPersonId)

    const inspection = await waitForChild(access.id, 'field.inspection')
    expect(inspection?.status).toBe('submitted')
    expect(JSON.parse(inspection?.contextJson || '{}').siteRef).toBe('site-depot-1')

    platformRequestService.transition(inspection!.id, org.orgTenantId, 'in_review', approverPersonId)
    platformRequestService.transition(inspection!.id, org.orgTenantId, 'approved', approverPersonId)
    platformRequestService.transition(inspection!.id, org.orgTenantId, 'in_fulfilment', approverPersonId)
    platformRequestService.transition(inspection!.id, org.orgTenantId, 'completed', approverPersonId)

    const maintenance = await waitForChild(inspection!.id, 'field.maintenance')
    expect(maintenance?.requestType).toBe('field.maintenance')
    expect(maintenance?.status).toBe('submitted')
    expect(JSON.parse(maintenance?.contextJson || '{}').assetRef).toBe('site-depot-1')
  })
})

describe('finance expense family — approval starts a payment request', () => {
  test('an approved expense claim spawns finance.payment_request', async () => {
    const org = seedOrganization({ name: 'Expense Co' })
    const approverPersonId = addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      role: 'admin',
    })

    const claim = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'finance.expense_claim',
      title: 'Site travel',
      amount: 80,
      currency: 'USD',
      targetModule: 'finance',
      context: { receiptRef: 'rcpt-1', categoryCode: 'TRAVEL' },
    }) as { id: string }

    platformRequestService.submit(claim.id, org.orgTenantId, org.ownerUserId)
    platformRequestService.transition(claim.id, org.orgTenantId, 'in_review', approverPersonId)
    platformRequestService.transition(claim.id, org.orgTenantId, 'approved', approverPersonId)

    const payment = await waitForChild(claim.id, 'finance.payment_request')
    expect(payment?.status).toBe('submitted')
    const context = JSON.parse(payment?.contextJson || '{}')
    expect(context.paymentReference).toMatch(/^PAY-/)
    expect(context.payeeRef).toBe('unassigned')
  })
})

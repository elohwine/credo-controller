import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import {
  liveOrgContextRole,
  liveOrgTaskRole,
  normalizeTaskRefs,
  roleMayOpenOrgContext,
  taskRouteAllowed,
} from '../src/services/OrgContextPolicy'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-org-context-')
})
afterAll(() => databases.cleanup())

describe('who may open the organisation', () => {
  test('owners and admins only', () => {
    expect(roleMayOpenOrgContext('owner')).toBe(true)
    expect(roleMayOpenOrgContext('Admin')).toBe(true)
    for (const role of ['field_worker', 'manager', 'finance', 'approver', 'director', '', null, undefined]) {
      expect(roleMayOpenOrgContext(role)).toBe(false)
    }
  })

  test('an organisation token is checked against the live role', () => {
    const org = seedOrganization()
    const worker = `worker-${org.orgTenantId}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: worker, role: 'field_worker' })
    expect(liveOrgContextRole({ id: org.ownerUserId, tenantId: org.orgTenantId })).toBe('owner')
    // A worker holding an older organisation token is refused on the next request.
    expect(liveOrgContextRole({ id: worker, tenantId: org.orgTenantId })).toBeNull()
    // A task pass is honoured for any active member, and stops when they leave.
    expect(liveOrgTaskRole({ id: worker, tenantId: org.orgTenantId })).toBe('field_worker')
    DatabaseManager.getDatabase()
      .prepare('UPDATE org_memberships SET status = ? WHERE user_id = ? AND org_tenant_id = ?')
      .run('removed', worker, org.orgTenantId)
    expect(liveOrgTaskRole({ id: worker, tenantId: org.orgTenantId })).toBeNull()
  })
})

describe('task pass routes', () => {
  const org = 'org-1'
  const allowed = (purpose: string, method: string, path: string, refs: string[] = ['run-1'], body?: unknown) =>
    taskRouteAllowed({ purpose, refs, orgTenantId: org, method, path, body })

  test('a job pass works on its own job only', () => {
    expect(allowed('job', 'GET', '/workflows/runs/run-1')).toBe(true)
    expect(allowed('job', 'POST', '/workflows/runs/run-1/resume')).toBe(true)
    expect(allowed('job', 'POST', '/workflows/runs/run-1/proof/request?x=1')).toBe(true)
    expect(allowed('job', 'GET', '/workflows/runs/run-2')).toBe(false)
    expect(allowed('job', 'POST', '/workflows/runs/run-2/resume')).toBe(false)
    expect(allowed('job', 'POST', '/workflows/runs/run-1%2F..%2Frun-2/resume')).toBe(false)
  })

  test('never the organisation wallet, contacts, team or settings', () => {
    for (const [method, path] of [
      ['GET', '/api/wallet/credentials'],
      ['POST', '/api/credentials/issue'],
      ['GET', '/api/contacts'],
      ['POST', `/api/organizations/${org}/members/invite`],
      ['PUT', `/api/organizations/${org}/setup/profile`],
      ['GET', '/api/finance/requisitions'],
      ['POST', '/api/payment-links'],
      ['POST', `/api/organizations/${org}/switch`],
    ]) {
      expect(allowed('job', method, path)).toBe(false)
    }
  })

  test('shared reads are bound to the pass organisation', () => {
    expect(allowed('job', 'GET', `/api/organizations/${org}/workflows/actors`)).toBe(true)
    expect(allowed('job', 'GET', '/api/organizations/other-org/workflows/actors')).toBe(false)
    expect(allowed('job', 'GET', '/api/audit/activity/run-1')).toBe(true)
    expect(allowed('job', 'GET', '/api/audit/activity/run-9')).toBe(false)
  })

  test('each purpose has its own routes', () => {
    expect(allowed('requisition', 'POST', '/api/finance/requisitions/REQ-1/approve/embedded-wallet', ['REQ-1', 'wr-1'])).toBe(true)
    expect(allowed('requisition', 'GET', '/workflow-requests/wr-1', ['REQ-1', 'wr-1'])).toBe(true)
    expect(allowed('requisition', 'POST', '/api/finance/requisitions/REQ-1/release/embedded-wallet', ['REQ-2'])).toBe(false)
    expect(allowed('requisition', 'GET', '/workflows/runs/REQ-1', ['REQ-1'])).toBe(false)
    expect(allowed('request', 'POST', '/api/platform/requests/pr-1/decision', ['pr-1'])).toBe(true)
    expect(allowed('request', 'POST', '/api/platform/requests/transition', ['pr-1'], { requestId: 'pr-1' })).toBe(true)
    expect(allowed('request', 'POST', '/api/platform/requests/transition', ['pr-1'], { requestId: 'pr-2' })).toBe(false)
    expect(allowed('payable', 'POST', '/api/finance/ap/workflow-actions/tx-1/transition', ['tx-1'])).toBe(true)
    expect(allowed('collection', 'GET', '/api/finance/ar/my-obligations', ['tx-1'])).toBe(true)
    expect(allowed('collection', 'PATCH', '/api/finance/ar/plans/tx-1/cancel', ['tx-1'])).toBe(false)
  })

  test('a pass with no purpose or item is refused', () => {
    expect(allowed('admin', 'GET', '/workflows/runs/run-1')).toBe(false)
    expect(allowed('job', 'GET', '/workflows/runs/run-1', [])).toBe(false)
    expect(normalizeTaskRefs([' a ', 'a', '../x', '', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})

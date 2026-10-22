import 'reflect-metadata'
import type { Agent } from '@credo-ts/core'
import type { Request } from 'express'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { WorkflowRequestController } from '../src/controllers/contacts/WorkflowRequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRequestRepository } from '../src/persistence/WorkflowRequestRepository'
import { OrganizationService } from '../src/services/OrganizationService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { isPlatformRequestDecided, isPlatformRequestWaiting, platformRequestDecidedAt } from '../src/config/requestInbox'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
// These database-only reads never access the agent, matching the catalogue test fixture.
const organizations = new OrganizationService({} as Agent)
const requestFor = (tenantId: string, userId: string, role: string): Request =>
  ({ tenantId, user: { tenantId, id: userId, orgRole: role } }) as Request

beforeAll(() => {
  databases = initTestDatabases('credo-mobile-org-')
})
afterAll(() => databases.cleanup())

function queueOffer(tenantId: string, issuerId: string, title: string, sourceType = 'credential_offer') {
  const id = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(
      `
    INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, credential_type, offer_uri, title, source_type, created_at)
    VALUES (?, ?, ?, 'EmployeeCredential', ?, ?, ?, ?)
  `,
    )
    .run(id, tenantId, issuerId, `openid-credential-offer://test/${id}`, title, sourceType, new Date().toISOString())
  return id
}

describe('Organisation Home and request surfaces', () => {
  test('roles and authority grants remain admin-controlled, independently of actor routing', () => {
    const org = seedOrganization()
    const workerId = randomUUID()
    addMember({ ...org, userId: workerId, role: 'field_worker' })
    expect(() => organizations.createRole(org.orgTenantId, workerId, { name: 'Inspector' })).toThrow()
    const role = organizations.createRole(org.orgTenantId, org.ownerUserId, {
      name: 'Inspector',
      permissions: ['field.inspect'],
    })
    expect(organizations.listRoles(org.orgTenantId)).toContainEqual(
      expect.objectContaining({ id: role.id, permissions: ['field.inspect'] }),
    )
    expect(organizations.listAuthorities(org.orgTenantId)).toEqual([])
    expect(() =>
      organizations.grantAuthority(org.orgTenantId, workerId, {
        userId: workerId,
        role: 'inspector',
        domain: 'operations',
      }),
    ).toThrow()
    const grant = organizations.grantAuthority(org.orgTenantId, org.ownerUserId, {
      userId: workerId,
      role: 'inspector',
      domain: 'operations',
      thresholdAmount: 100,
      currency: 'USD',
    })
    expect(organizations.listAuthorities(org.orgTenantId)).toEqual([
      expect.objectContaining({ id: grant.id, thresholdAmount: 100 }),
    ])
    organizations.revokeAuthority(org.orgTenantId, grant.id, org.ownerUserId)
    expect(organizations.listAuthorities(org.orgTenantId)).toEqual([])
    organizations.deleteRole(org.orgTenantId, role.id, org.ownerUserId)
    expect(organizations.listRoles(org.orgTenantId).some((item) => item.id === role.id)).toBe(false)
  })
  test('Home shows only org-held offers, not staff cards merely issued by the org', () => {
    const org = seedOrganization()
    const personalId = queueOffer(`wallet-${org.ownerUserId}`, org.orgTenantId, 'Your personal staff card')
    const orgId = queueOffer(org.orgTenantId, org.orgTenantId, 'Organisation inspection record')
    queueOffer(org.orgTenantId, org.orgTenantId, 'Raw task trace', 'workflow_stage_action')
    const summary = organizations.nextStepsFor(org.ownerUserId, org.orgTenantId)
    const inbox = summary.items.filter((item) => item.kind === 'inbox')
    expect(inbox).toEqual([expect.objectContaining({ id: orgId, inboxItemId: orgId })])
    expect(inbox.some((item) => item.id === personalId)).toBe(false)
    expect(
      DatabaseManager.getDatabase()
        .prepare('SELECT resolved_at FROM wallet_pending_offers WHERE id = ?')
        .get(personalId),
    ).toEqual({ resolved_at: null })
  })

  test('worker Home does not expose owner-held organisation records', () => {
    const org = seedOrganization()
    const workerId = randomUUID()
    addMember({ ...org, userId: workerId, role: 'field_worker' })
    queueOffer(org.orgTenantId, org.orgTenantId, 'Owner record')
    expect(organizations.nextStepsFor(workerId, org.orgTenantId).items).toEqual([])
  })

  test('assigned contact request is visible in org and assigned-person lists without duplicating it', async () => {
    const org = seedOrganization()
    const requester = seedOrganization()
    const request = workflowRequestRepository.create({
      requesterTenantId: requester.orgTenantId,
      targetOrgTenantId: org.orgTenantId,
      requestType: 'quote',
      payload: { title: 'Quote for pump repair' },
      assigneeUserId: org.ownerUserId,
      assigneeWalletTenantId: `wallet-${org.ownerUserId}`,
    })
    expect(organizations.nextStepsFor(org.ownerUserId, org.orgTenantId).items).toContainEqual(
      expect.objectContaining({ requestId: request.id }),
    )
    const controller = new WorkflowRequestController()
    const inbound = await controller.listInboundRequests(
      requestFor(org.orgTenantId, org.ownerUserId, 'owner'),
      'pending',
    )
    expect(inbound.map((row) => row.id)).toContain(request.id)
    expect(
      workflowRequestRepository
        .listAssignedToApprover({
          userId: org.ownerUserId,
          walletTenantId: `wallet-${org.ownerUserId}`,
        })
        .map((row) => row.id),
    ).toContain(request.id)
    expect(workflowRequestRepository.listInbound(org.orgTenantId)).toHaveLength(1)
  })

  test('default inbox filtering remains actionable while history includes completed/declined rows', async () => {
    const org = seedOrganization()
    const requester = seedOrganization()
    const row = workflowRequestRepository.create({
      requesterTenantId: requester.orgTenantId,
      targetOrgTenantId: org.orgTenantId,
      requestType: 'requisition',
      payload: { requisitionId: 'missing-reconciled-requisition' },
    })
    const controller = new WorkflowRequestController()
    const req = requestFor(org.orgTenantId, org.ownerUserId, 'owner')
    expect(await controller.listInboundRequests(req)).toEqual([])
    expect(await controller.listInboundRequests(req, undefined, undefined, 50, true)).toContainEqual(
      expect.objectContaining({ id: row.id }),
    )
    const trace = workflowRequestRepository.create({
      requesterTenantId: requester.orgTenantId,
      targetOrgTenantId: org.orgTenantId,
      requestType: 'quote',
      payload: {},
    })
    DatabaseManager.getDatabase()
      .prepare('UPDATE workflow_requests SET request_type = ? WHERE id = ?')
      .run('vc_offer', trace.id)
    expect(await controller.listInboundRequests(req, undefined, undefined, 50, true)).not.toContainEqual(
      expect.objectContaining({ id: trace.id }),
    )
    expect(
      organizations.nextStepsFor(org.ownerUserId, org.orgTenantId).items.some((item) => item.requestId === row.id),
    ).toBe(false)
    await expect(
      controller.listInboundRequests(
        requestFor(org.orgTenantId, org.ownerUserId, 'field_worker'),
        undefined,
        undefined,
        50,
        true,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(
      await controller.listInboundRequests(
        requestFor(requester.orgTenantId, requester.ownerUserId, 'owner'),
        undefined,
        undefined,
        50,
        true,
      ),
    ).toEqual([])
  })

  test('request history pagination does not lose records created at identical timestamps', () => {
    const org = seedOrganization()
    const db = DatabaseManager.getDatabase()
    const ids = Array.from(
      { length: 4 },
      () =>
        platformRequestService.create({
          tenantId: org.orgTenantId,
          subjectRef: org.ownerUserId,
          requestType: 'field_job',
          title: 'Same time request',
        }).id,
    )
    for (const id of ids)
      db.prepare('UPDATE requests SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', id)
    const first = platformRequestService.list(org.orgTenantId, org.ownerUserId, undefined, undefined, 2)
    const second = platformRequestService.list(
      org.orgTenantId,
      org.ownerUserId,
      undefined,
      undefined,
      2,
      first.nextCursor || undefined,
    )
    expect([...first.items, ...second.items].map((item) => (item as { id: string }).id).sort()).toEqual(ids.sort())
    expect(second.nextCursor).toBeNull()
    for (const cursor of ['[', '["only-one-part"]']) {
      expect(() =>
        platformRequestService.list(org.orgTenantId, org.ownerUserId, undefined, undefined, 2, cursor),
      ).toThrow(expect.objectContaining({ status: 400 }))
    }
  })
})

describe('Platform request attention', () => {
  test('drafts, completed work and approved decision-only requests are not pending inbox actions', () => {
    for (const status of ['draft', 'completed', 'rejected', 'cancelled', 'approved']) {
      expect(isPlatformRequestWaiting({ id: status, status })).toBe(false)
    }
    expect(isPlatformRequestWaiting({ id: 'submitted', status: 'submitted' })).toBe(true)
    expect(isPlatformRequestWaiting({ id: 'review', status: 'in_review' })).toBe(true)
    expect(
      isPlatformRequestWaiting({ id: 'follow-up', status: 'approved', nextStep: { label: 'Mark bought', fields: [] } }),
    ).toBe(true)
  })

  it('keeps decided requests under Done for the window instead of dropping them', () => {
    const since = Date.parse('2026-01-10T00:00:00Z')
    expect(isPlatformRequestDecided({ id: 'a', status: 'approved', updated_at: '2026-01-12 09:30:00' }, since)).toBe(true)
    expect(isPlatformRequestDecided({ id: 'r', status: 'rejected', updated_at: '2026-01-11T08:00:00Z' }, since)).toBe(true)
    expect(isPlatformRequestDecided({ id: 'old', status: 'approved', updated_at: '2026-01-01 09:30:00' }, since)).toBe(false)
    expect(isPlatformRequestDecided({ id: 'wait', status: 'submitted', updated_at: '2026-01-12 09:30:00' }, since)).toBe(false)
    expect(
      isPlatformRequestDecided(
        { id: 'next', status: 'approved', updated_at: '2026-01-12 09:30:00', nextStep: { label: 'Mark bought', fields: [] } },
        since,
      ),
    ).toBe(false)
    expect(platformRequestDecidedAt({ updated_at: '2026-01-12 09:30:00' })).toBe('2026-01-12T09:30:00Z')
  })
})

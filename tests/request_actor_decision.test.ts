import 'reflect-metadata'
import type { Request } from 'express'
import { randomUUID } from 'crypto'

import { RequestController } from '../src/controllers/platform/RequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { addAuthorityGrant, addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('request-actor-decision-')
})

afterAll(() => databases.cleanup())

async function waitForActorCard(requestId: string, walletTenantId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id FROM wallet_pending_offers
         WHERE (source_id = ? OR source_id LIKE ?)
           AND tenant_id = ? AND source_type = 'workflow_stage_action' AND resolved_at IS NULL`,
      )
      .get(requestId, `${requestId}:delegation:%`, walletTenantId)
    if (row) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('The configured request actor did not receive an Inbox card')
}

describe('platform request actor decisions', () => {
  test('one assigned actor decision updates the shared request once and leaves purchase fulfillment open', async () => {
    const org = seedOrganization({ name: 'Purchase actor test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    const assignedPersonId = addMember({ ...org, userId: assignedUserId, role: 'manager' })
    const otherUserId = `other-${randomUUID()}`
    const otherPersonId = addMember({ ...org, userId: otherUserId, role: 'manager' })
    const approvalScope = { permissions: ['request.approve', 'request.reject'], resourceTypes: ['request'] }
    addAuthorityGrant(org.organizationId, assignedPersonId, 'approve', approvalScope)
    addAuthorityGrant(org.organizationId, otherPersonId, 'approve', approvalScope)
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })

    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Materials for parent job',
      amount: 10,
      currency: 'USD',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)
    await waitForActorCard(request.id, `wallet-${assignedUserId}`)

    const assignedView = platformRequestService.getForSubject(request.id, org.orgTenantId, assignedUserId) as any
    expect(assignedView.decision).toMatchObject({
      stageAction: 'approve_requisition',
      canAct: true,
      canApprove: true,
      canReject: true,
    })
    expect(
      platformRequestService.list(org.orgTenantId, assignedUserId).items.find((item: any) => item.id === request.id),
    ).toMatchObject({ decision: { canApprove: true } })
    expect(
      platformRequestService.list(org.orgTenantId, otherUserId).items.find((item: any) => item.id === request.id),
    ).toBeUndefined()
    expect(() => platformRequestService.decideBySubject(request.id, org.orgTenantId, otherUserId, 'approve')).toThrow(
      /assigned stage actor/,
    )

    const controller = new RequestController()
    const idempotencyKey = `decision-${request.id}-${randomUUID()}`
    const requestContext = {
      user: { tenantId: org.orgTenantId, sub: assignedUserId },
      headers: { 'x-idempotency-key': idempotencyKey },
    } as Request
    const approved = await controller.decide(requestContext, request.id, { decision: 'approve' }) as any
    const replay = await controller.decide(requestContext, request.id, { decision: 'approve' }) as any
    expect(approved.status).toBe('approved')
    expect(replay.status).toBe('approved')
    expect(approved.nextStep).toMatchObject({ toStatus: 'completed', label: 'Mark as bought' })
    expect(approved.receipt).toBeUndefined()

    const events = DatabaseManager.getDatabase()
      .prepare(
        `SELECT to_status AS status, actor_person_id AS actorPersonId
         FROM request_events
         WHERE request_id = ? AND event_type = 'request.status_changed'
         ORDER BY rowid`,
      )
      .all(request.id) as Array<{ status: string; actorPersonId?: string }>
    expect(events.map((event) => event.status)).toEqual(['submitted', 'in_review', 'approved'])
    expect(events.at(-1)?.actorPersonId).toBe(assignedPersonId)

    const resolved = DatabaseManager.getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count FROM wallet_pending_offers
         WHERE source_id = ? AND source_type = 'workflow_stage_action' AND resolved_at IS NOT NULL`,
      )
      .get(request.id) as { count: number }
    expect(resolved.count).toBeGreaterThan(0)
  })

  test('configured assignment does not bypass approval authority, and read-only previews do not write audit decisions', () => {
    const org = seedOrganization({ name: 'Authority test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    addMember({ ...org, userId: assignedUserId, role: 'field_worker' })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Materials awaiting authorization',
      amount: 10,
      currency: 'USD',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)

    const before = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS count FROM policy_decisions WHERE resource_id = ?`)
      .get(request.id) as { count: number }
    const detail = platformRequestService.getForSubject(request.id, org.orgTenantId, assignedUserId) as any
    const after = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS count FROM policy_decisions WHERE resource_id = ?`)
      .get(request.id) as { count: number }

    expect(detail.decision).toMatchObject({ canAct: true, canApprove: false, canReject: false })
    expect(after.count).toBe(before.count)
    expect(() => platformRequestService.decideBySubject(request.id, org.orgTenantId, assignedUserId, 'approve')).toThrow(
      /Insufficient authority/,
    )
    expect(platformRequestService.getForTenant(request.id, org.orgTenantId)).toMatchObject({ status: 'submitted' })
  })

  test('rejection requires a reason and is recorded by the assigned actor', () => {
    const org = seedOrganization({ name: 'Rejection test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    const assignedPersonId = addMember({ ...org, userId: assignedUserId, role: 'manager' })
    addAuthorityGrant(org.organizationId, assignedPersonId, 'approve', {
      permissions: ['request.approve', 'request.reject'],
      resourceTypes: ['request'],
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Request with a decision reason',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)

    expect(() => platformRequestService.decideBySubject(request.id, org.orgTenantId, assignedUserId, 'reject')).toThrow(
      /reason before rejecting/,
    )
    const rejected = platformRequestService.decideBySubject(
      request.id,
      org.orgTenantId,
      assignedUserId,
      'reject',
      'Supplier quote exceeds the agreed budget.',
    ) as any
    expect(rejected.status).toBe('rejected')
    const event = DatabaseManager.getDatabase()
      .prepare(
        `SELECT actor_person_id AS actorPersonId, payload_json AS payloadJson
         FROM request_events
         WHERE request_id = ? AND to_status = 'rejected'`,
      )
      .get(request.id) as { actorPersonId: string; payloadJson: string }
    expect(event.actorPersonId).toBe(assignedPersonId)
    expect(JSON.parse(event.payloadJson)).toMatchObject({ reason: 'Supplier quote exceeds the agreed budget.' })
  })

  test('conflicting approve and reject attempts can record only one terminal decision', async () => {
    const org = seedOrganization({ name: 'Concurrent decision test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    const assignedPersonId = addMember({ ...org, userId: assignedUserId, role: 'manager' })
    addAuthorityGrant(org.organizationId, assignedPersonId, 'approve', {
      permissions: ['request.approve', 'request.reject'],
      resourceTypes: ['request'],
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Conflicting decision attempts',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)

    const controller = new RequestController()
    const decide = (decision: 'approve' | 'reject') =>
      controller.decide(
        {
          user: { tenantId: org.orgTenantId, sub: assignedUserId },
          headers: { 'x-idempotency-key': `${decision}-${request.id}-${randomUUID()}` },
        } as Request,
        request.id,
        { decision, ...(decision === 'reject' ? { reason: 'Concurrent test rejection' } : {}) },
      )
    const results = await Promise.allSettled([decide('approve'), decide('reject')])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(platformRequestService.getForTenant(request.id, org.orgTenantId)?.status).toMatch(/^(approved|rejected)$/)
    const terminalEvents = DatabaseManager.getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count FROM request_events
         WHERE request_id = ? AND to_status IN ('approved', 'rejected')`,
      )
      .get(request.id) as { count: number }
    expect(terminalEvents.count).toBe(1)
  })

  test('an active stage delegate receives the same request action without widening the configured actor', async () => {
    const org = seedOrganization({ name: 'Delegated actor test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    const assignedPersonId = addMember({ ...org, userId: assignedUserId, role: 'manager' })
    const delegateUserId = `delegate-${randomUUID()}`
    const delegatePersonId = addMember({ ...org, userId: delegateUserId, role: 'field_worker' })
    addAuthorityGrant(org.organizationId, assignedPersonId, 'approve', {
      permissions: ['request.approve', 'request.reject'],
      resourceTypes: ['request'],
    })
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO delegations (
           id, organization_id, delegator_person_id, delegate_person_id, scope_json,
           valid_from, valid_until, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      )
      .run(
        randomUUID(),
        org.organizationId,
        assignedPersonId,
        delegatePersonId,
        JSON.stringify({ permissions: ['approve_requisition', 'request.approve', 'request.reject'] }),
        `${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)} 00:00:00`,
        `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} 23:59:59`,
      )
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })

    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Delegated materials request',
      amount: 10,
      currency: 'USD',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)
    await waitForActorCard(request.id, `wallet-${delegateUserId}`)

    const delegateView = platformRequestService.getForSubject(request.id, org.orgTenantId, delegateUserId) as any
    expect(delegateView.decision).toMatchObject({ canAct: true, canApprove: true, canReject: true })
    const approved = platformRequestService.decideBySubject(request.id, org.orgTenantId, delegateUserId, 'approve') as any
    expect(approved.status).toBe('approved')
  })
})

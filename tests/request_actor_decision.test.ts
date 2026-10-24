import 'reflect-metadata'
import type { Agent } from '@credo-ts/core'
import type { Request } from 'express'
import { randomUUID } from 'crypto'

import { RequestController } from '../src/controllers/platform/RequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { OrganizationService } from '../src/services/OrganizationService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { authorizationService } from '../src/services/AuthorizationService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { addAuthorityGrant, addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
// Database-only paths; the agent is never touched.
const organizations = new OrganizationService({} as Agent)

function requisitionFor(orgTenantId: string, requesterUserId: string, title: string, amount = 10) {
  const request = platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef: requesterUserId,
    requestType: 'procurement.requisition',
    title,
    amount,
    currency: 'USD',
    context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
  })!
  platformRequestService.submit(request.id, orgTenantId, requesterUserId)
  return request
}

function stageDelegations(organizationId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT d.id, d.status, d.valid_until AS validUntil, d.scope_json AS scopeJson, p.subject_ref AS delegateUserId
       FROM delegations d JOIN people p ON p.id = d.delegate_person_id WHERE d.organization_id = ?`,
    )
    .all(organizationId) as Array<{ id: string; status: string; validUntil?: string; scopeJson: string; delegateUserId: string }>
}

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

  test('naming someone for a decision step gives them time-limited approval access, and previews do not write audit decisions', () => {
    const org = seedOrganization({ name: 'Authority test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const assignedUserId = `assigned-${randomUUID()}`
    addMember({ ...org, userId: assignedUserId, role: 'field_worker' })
    const bystanderUserId = `bystander-${randomUUID()}`
    addMember({ ...org, userId: bystanderUserId, role: 'field_worker' })

    // Named without the save path: the card routes to them, but their role cannot approve.
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
      enabled: true,
    })
    const first = requisitionFor(org.orgTenantId, requesterUserId, 'Named without access')
    const blocked = platformRequestService.getForSubject(first.id, org.orgTenantId, assignedUserId) as any
    expect(blocked.decision).toMatchObject({ canApprove: false, blockedReason: 'no_authority' })
    expect(() => platformRequestService.decideBySubject(first.id, org.orgTenantId, assignedUserId, 'approve')).toThrow()

    // Saving the step in Who does what gives them 30 days of approval access for this step only.
    organizations.saveWorkflowActorDefault(org.ownerUserId, org.orgTenantId, {
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: assignedUserId,
    })
    const [delegation] = stageDelegations(org.organizationId).filter((row) => row.delegateUserId === assignedUserId)
    expect(delegation.status).toBe('active')
    const days = (Date.parse(delegation.validUntil!) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThanOrEqual(30)
    expect(JSON.parse(delegation.scopeJson)).toMatchObject({
      stageActions: ['approve_requisition'],
      stageAssignment: { workflowType: 'internal_requisitions', stageAction: 'approve_requisition' },
    })

    const view = organizations.listWorkflowActors(org.ownerUserId, org.orgTenantId)
    const stage = view.workflows
      .flatMap((workflow) => workflow.stages)
      .find((item) => item.stageAction === 'approve_requisition' && item.default?.defaultUserId === assignedUserId)
    expect(stage?.access).toEqual([
      expect.objectContaining({ userId: assignedUserId, via: 'delegation', delegationId: delegation.id }),
    ])

    const before = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS count FROM policy_decisions WHERE resource_id = ?`)
      .get(first.id) as { count: number }
    const detail = platformRequestService.getForSubject(first.id, org.orgTenantId, assignedUserId) as any
    const after = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS count FROM policy_decisions WHERE resource_id = ?`)
      .get(first.id) as { count: number }
    expect(detail.decision).toMatchObject({ canAct: true, canApprove: true, canReject: true })
    expect(detail.decision.blockedReason).toBeUndefined()
    expect(after.count).toBe(before.count)

    // Someone who is neither named nor permitted still cannot decide.
    expect(() => platformRequestService.decideBySubject(first.id, org.orgTenantId, bystanderUserId, 'approve')).toThrow()
    expect(platformRequestService.getForTenant(first.id, org.orgTenantId)).toMatchObject({ status: 'submitted' })

    const approved = platformRequestService.decideBySubject(first.id, org.orgTenantId, assignedUserId, 'approve') as any
    expect(approved.status).toBe('approved')

    // The access covers this step only: not other workflows' decisions.
    const person = DatabaseManager.getDatabase()
      .prepare(`SELECT id FROM people WHERE organization_id = ? AND subject_ref = ?`)
      .get(org.organizationId, assignedUserId) as { id: string }
    const elsewhere = authorizationService.decide({
      tenantId: org.orgTenantId,
      personId: person.id,
      action: 'request.approve',
      requiredPermission: 'request.approve',
      resourceType: 'request',
      workflowType: 'hr_requests',
      stageAction: 'approve_request',
      skipAudit: true,
    })
    expect(elsewhere.decision).toBe('deny')
  })

  test('approval access ends when it lapses or the person is taken off the step, and can be renewed', () => {
    const org = seedOrganization({ name: 'Access lifecycle' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const namedUserId = `named-${randomUUID()}`
    addMember({ ...org, userId: namedUserId, role: 'field_worker' })
    const managerUserId = `manager-${randomUUID()}`
    addMember({ ...org, userId: managerUserId, role: 'admin' })
    const save = (input: Record<string, unknown>) =>
      organizations.saveWorkflowActorDefault(org.ownerUserId, org.orgTenantId, {
        workflowType: 'internal_requisitions',
        stageAction: 'approve_requisition',
        ...input,
      })

    save({ defaultUserId: managerUserId, additionalUserIds: [namedUserId] })
    // The admin can approve through their role, so only the field worker needed access.
    expect(stageDelegations(org.organizationId).map((row) => row.delegateUserId)).toEqual([namedUserId])

    // Lapsed access: the person is told, and the actors page shows it ended.
    const [original] = stageDelegations(org.organizationId)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE delegations SET valid_until = ? WHERE id = ?`)
      .run(new Date(Date.now() - 60_000).toISOString(), original.id)
    const lapsed = requisitionFor(org.orgTenantId, requesterUserId, 'After access lapsed')
    expect((platformRequestService.getForSubject(lapsed.id, org.orgTenantId, namedUserId) as any).decision).toMatchObject({
      canApprove: false,
      blockedReason: 'no_authority',
    })
    const lapsedView = organizations
      .listWorkflowActors(org.ownerUserId, org.orgTenantId)
      .workflows.flatMap((workflow) => workflow.stages)
      .find((item) => item.stageAction === 'approve_requisition' && item.default?.defaultUserId === managerUserId)
    expect(lapsedView?.access).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: managerUserId, via: 'role' }),
        expect.objectContaining({ userId: namedUserId, via: 'expired' }),
      ]),
    )

    // Renew: the old access is withdrawn and a fresh period starts.
    save({ defaultUserId: managerUserId, additionalUserIds: [namedUserId], renewAccess: true })
    const afterRenew = stageDelegations(org.organizationId)
    expect(afterRenew.find((row) => row.id === original.id)?.status).toBe('revoked')
    expect(afterRenew.filter((row) => row.status === 'active')).toHaveLength(1)
    expect((platformRequestService.getForSubject(lapsed.id, org.orgTenantId, namedUserId) as any).decision).toMatchObject({
      canApprove: true,
    })

    // Taking them off the step withdraws the access.
    save({ defaultUserId: managerUserId, additionalUserIds: [] })
    expect(stageDelegations(org.organizationId).every((row) => row.status === 'revoked')).toBe(true)
    expect(() => platformRequestService.decideBySubject(lapsed.id, org.orgTenantId, namedUserId, 'approve')).toThrow()
  })

  test('people named before approval access existed are given it once on startup', () => {
    const org = seedOrganization({ name: 'Backfill access' })
    const namedUserId = `named-${randomUUID()}`
    addMember({ ...org, userId: namedUserId, role: 'field_worker' })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: namedUserId,
      enabled: true,
    })
    organizations.backfillStageApprovalAccess()
    const rows = stageDelegations(org.organizationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ delegateUserId: namedUserId, status: 'active' })

    // Ended access is not handed out again on the next start.
    DatabaseManager.getDatabase().prepare(`UPDATE delegations SET status = 'revoked' WHERE id = ?`).run(rows[0].id)
    organizations.backfillStageApprovalAccess()
    expect(stageDelegations(org.organizationId)).toHaveLength(1)
  })

  test('delegations from an owner and Approvals-page area grants both authorize decisions', () => {
    const org = seedOrganization({ name: 'Owner delegation' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const deputyUserId = `deputy-${randomUUID()}`
    const deputyPersonId = addMember({ ...org, userId: deputyUserId, role: 'field_worker' })
    const financeUserId = `finance-${randomUUID()}`
    const financePersonId = addMember({ ...org, userId: financeUserId, role: 'field_worker' })
    const decide = (personId: string, workflowType: string, amount = 10) =>
      authorizationService.decide({
        tenantId: org.orgTenantId,
        personId,
        action: 'request.approve',
        requiredPermission: 'request.approve',
        resourceType: 'request',
        amount,
        currency: 'USD',
        workflowType,
        stageAction: 'approve_requisition',
        skipAudit: true,
      })

    // The owner has no authority_grants row; their role is what they delegate.
    organizations.createDelegation(org.orgTenantId, org.ownerUserId, {
      delegatorUserId: org.ownerUserId,
      delegateUserId: deputyUserId,
      permissions: ['request.approve'],
      validFrom: new Date(Date.now() - 1000).toISOString(),
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(decide(deputyPersonId, 'internal_requisitions')).toMatchObject({
      decision: 'allow',
      reasonCode: 'active_delegation_scope_match',
    })

    // An area grant from the Approvals page (domain + limit, no permissions list) covers its workflows.
    addAuthorityGrant(org.organizationId, financePersonId, 'approve', { domain: 'finance', thresholdAmount: 100, currency: 'USD' })
    expect(decide(financePersonId, 'internal_requisitions')).toMatchObject({ decision: 'allow', reasonCode: 'authority_scope_match' })
    expect(decide(financePersonId, 'internal_requisitions', 500).decision).toBe('deny')
    expect(decide(financePersonId, 'hr_requests').decision).toBe('deny')
  })

  test('several people can be named for one step, and the requester is told someone else decides', async () => {
    const org = seedOrganization({ name: 'Co-actor test' })
    const requesterUserId = `requester-${randomUUID()}`
    addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
    const otherUserId = `co-actor-${randomUUID()}`
    addMember({ ...org, userId: otherUserId, role: 'field_worker' })
    // The requester is the main person for the step and a colleague is also named.
    organizations.saveWorkflowActorDefault(org.ownerUserId, org.orgTenantId, {
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: requesterUserId,
      additionalUserIds: [otherUserId],
    })
    expect(
      orgWorkflowActorService.isNamedActor({
        orgTenantId: org.orgTenantId,
        workflowType: 'internal_requisitions',
        stageAction: 'approve_requisition',
        userId: otherUserId,
      }),
    ).toBe(true)

    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: requesterUserId,
      requestType: 'procurement.requisition',
      title: 'Own request with a named colleague',
      amount: 10,
      currency: 'USD',
      context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
    })!
    platformRequestService.submit(request.id, org.orgTenantId, requesterUserId)
    await waitForActorCard(request.id, `wallet-${otherUserId}`)

    const requesterCard = DatabaseManager.getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count FROM wallet_pending_offers
         WHERE source_id = ? AND tenant_id = ? AND source_type = 'workflow_stage_action' AND resolved_at IS NULL`,
      )
      .get(request.id, `wallet-${requesterUserId}`) as { count: number }
    expect(requesterCard.count).toBe(0)

    const own = platformRequestService.getForSubject(request.id, org.orgTenantId, requesterUserId) as any
    expect(own.decision).toMatchObject({ canApprove: false, canReject: false, blockedReason: 'own_request', isRequester: true })
    expect(() => platformRequestService.decideBySubject(request.id, org.orgTenantId, requesterUserId, 'approve')).toThrow(
      /You raised this request/,
    )

    const colleague = platformRequestService.getForSubject(request.id, org.orgTenantId, otherUserId) as any
    expect(colleague.decision).toMatchObject({ canAct: true, canApprove: true })
    const approved = platformRequestService.decideBySubject(request.id, org.orgTenantId, otherUserId, 'approve') as any
    expect(approved.status).toBe('approved')
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

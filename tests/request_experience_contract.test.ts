import 'reflect-metadata'
import { randomUUID } from 'crypto'
import {
  projectRequestExperience,
  requestFamily,
  validateRequestExperience,
  type RequestExperienceDefinition,
} from '../src/config/requestExperience'
import {
  assertRequestDetail,
  requestExperienceForRow,
  requestIdFromStageCard,
} from '../credo-ui/shared/requestExperience'
import { requestKindLabel, requestKindsFor } from '../credo-ui/shared/requestCatalog'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../src/persistence/WorkflowTemplateRepository'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { requestExperienceDefinition, saveRequestExperience } from '../src/services/RequestExperienceService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { resolveStageRoute, routeWorkflowStageInbox } from '../src/services/WorkflowStageInboxService'
import { getDeclaredPrerequisites } from '../src/services/workflow/prerequisites'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('request-experience-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: randomUUID(),
    offerUri: 'openid-credential-offer://?credential_offer=actor',
  }))
})
afterAll(() => databases.cleanup())

describe('one request-family contract', () => {
  test.each([
    ['procurement.requisition', 'purchases', 'approve_requisition'],
    ['finance.purchase_order', 'purchases', 'approve_requisition'],
    ['finance.payment_request', 'payables', 'record_payment'],
    ['invoice', 'collections', 'record_payment'],
    ['education_fee_payment', 'school_fees', 'record_payment'],
    ['quote', 'commerce', 'record_payment'],
    ['hr.leave', 'people', 'approve_request'],
    ['finance.expense_claim', 'people', 'approve_request'],
    ['field.inspection', 'field_jobs', 'inspect_site'],
  ])('%s shares its family and actor action with progress', (requestType, family, action) => {
    const declared = requestFamily(requestType)
    expect(declared?.experience.family).toBe(family)
    expect(resolveStageRoute(requestType).stageAction).toBe(action)
    const projected = projectRequestExperience({ id: 'r', requestType, status: 'submitted' })
    expect(projected.stages.find((stage) => stage.status === 'active')?.stageAction).toBe(action)
    expect(projected.stages.some((stage) => /funds|finance approval|arrival/i.test(stage.label))).toBe(false)
  })

  test('unknown names are generic, not guessed from fragments like car, school or field', () => {
    for (const type of ['car_repair', 'school_uniform_quote', 'field_research']) {
      expect(requestFamily(type)).toBeUndefined()
      expect(resolveStageRoute(type).stageAction).toBe('approve_request')
      expect(projectRequestExperience({ id: 'r', requestType: type, status: 'submitted' }).family).toBe('requests')
    }
  })

  test('concrete field actions win over their parent workflow', () => {
    expect(resolveStageRoute('field.inspection', 'field_execution_fept')).toEqual({
      workflowType: 'field_execution_fept',
      stageAction: 'inspect_site',
    })
  })

  test('payment-request follow-up retains the existing payment actor action', () => {
    expect(requestFamily('finance.payment_request')?.experience.fulfilmentAction).toBe('record_payment')
  })

  test('history supplies actor/times; status does not invent payments, proofs, records or acceptance', () => {
    const experience = projectRequestExperience({
      id: 'bill',
      requestType: 'finance.payment_request',
      status: 'approved',
      events: [
        { to_status: 'submitted', created_at: '2026-10-17T08:00:00Z', actor_user_id: 'requester' },
        { to_status: 'approved', created_at: '2026-10-17T09:00:00Z', actor_user_id: 'approver' },
      ],
    })
    expect(experience.stages.find((stage) => stage.key === 'approved')).toMatchObject({
      status: 'done',
      at: '2026-10-17T09:00:00Z',
      actorUserId: 'approver',
    })
    expect(experience.stages.find((stage) => stage.key === 'in_review')?.status).toBe('skipped')
    expect(experience.stages.find((stage) => stage.key === 'in_fulfilment')?.at).toBeUndefined()
    expect(experience.stages.every((stage) => stage.proof === 'Record' && stage.vcType === '')).toBe(true)
  })

  test.each(['rejected', 'cancelled', 'expired'])('%s stops progress without completing future work', (status) => {
    const result = projectRequestExperience({
      id: 'r',
      requestType: 'hr.leave',
      status,
      events: [{ to_status: 'submitted' }, { to_status: status }],
    })

    expect(result.stages.at(-1)).toMatchObject({ key: status, status: 'held' })
    expect(result.stages.find((stage) => stage.key === 'approved')?.status).toBe('skipped')
  })

  test('completed review records the decision actor and time, not who started review', () => {
    const result = projectRequestExperience({
      id: 'r',
      requestType: 'hr.leave',
      status: 'approved',
      events: [
        { to_status: 'submitted', created_at: '2026-10-17T08:00:00Z' },
        { to_status: 'in_review', created_at: '2026-10-17T08:30:00Z', actor_user_id: 'starter' },
        { to_status: 'approved', created_at: '2026-10-17T09:00:00Z', actor_user_id: 'decision-maker' },
      ],
    })
    expect(result.stages.find((stage) => stage.key === 'in_review')).toMatchObject({
      status: 'done',
      at: '2026-10-17T09:00:00Z',
      actorUserId: 'decision-maker',
    })
  })

  test('cancelling fulfilment does not mark its started work as finished', () => {
    const result = projectRequestExperience({
      id: 'r',
      requestType: 'invoice',
      status: 'cancelled',
      events: [
        { to_status: 'submitted' },
        { to_status: 'in_review' },
        { to_status: 'approved' },
        { to_status: 'in_fulfilment' },
        { to_status: 'cancelled' },
      ],
    })
    expect(result.stages.find((stage) => stage.key === 'in_fulfilment')?.status).toBe('held')
    expect(result.stages.find((stage) => stage.key === 'completed')?.status).toBe('skipped')
  })

  test('resubmission does not use an earlier attempt as proof of the current review', () => {
    const result = projectRequestExperience({
      id: 'r',
      requestType: 'procurement.requisition',
      status: 'submitted',
      events: [
        { to_status: 'submitted' },
        { to_status: 'in_review', actor_user_id: 'old-reviewer' },
        { to_status: 'rejected' },
        { to_status: 'draft' },
        { to_status: 'submitted' },
      ],
    })
    expect(result.stages.find((stage) => stage.key === 'in_review')).toMatchObject({ status: 'active' })
    expect(result.stages.find((stage) => stage.key === 'in_review')?.actorUserId).toBeUndefined()
  })

  test('a leave approval does not invent a money-release or completion requirement', () => {
    const result = projectRequestExperience({ id: 'r', requestType: 'hr.leave', status: 'approved' })
    expect(result.stages.map((stage) => stage.key)).toEqual(['submitted', 'in_review', 'approved'])
    expect(result.stages.some((stage) => stage.status === 'active')).toBe(false)
  })

  test('both clients use the server projection; another resource cannot supply it', () => {
    const experience = projectRequestExperience({ id: 'r', requestType: 'hr.leave', status: 'submitted' })
    expect(requestExperienceForRow({ id: 'r', experience })).toBe(experience)
    expect(
      requestExperienceForRow({ id: 'another', requestType: 'invoice', experience, status: 'pending' }),
    ).toMatchObject({ resourceId: 'another', family: 'collections' })
  })

  test('an empty or mismatched successful detail response cannot replace the selected request', () => {
    for (const response of ['', undefined, {}, { id: 'another' }]) {
      expect(() => assertRequestDetail(response, 'selected')).toThrow(/details were not returned/)
    }
    expect(() => assertRequestDetail({ id: 'selected', title: 'Materials' }, 'selected')).not.toThrow()
  })

  test('type words name the purchase request rather than repeating the initiation action', () => {
    expect(requestKindLabel('procurement.requisition')).toBe('Purchase request')
    expect(requestKindLabel('finance.payment_request')).toBe('Payment request')
    expect(
      requestKindsFor(
        {
          memberships: [{ orgTenantId: 'org', orgName: 'Org', role: 'member', kinds: ['procurement.requisition'] }],
          payoutJobs: [],
          records: [],
        },
        { contextMode: 'personal' },
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'procurement.requisition', label: 'Request an item' })]),
    )
  })

  test('new request names and delegated cards use explicit resource identity on both clients', () => {
    const identity = { resourceType: 'request', resourceId: 'request-one' }
    expect(requestIdFromStageCard('request-one', identity)).toBe('request-one')
    expect(requestIdFromStageCard('request-one:delegation:d', identity)).toBe('request-one')
    expect(requestIdFromStageCard('another', identity)).toBeUndefined()
    expect(requestIdFromStageCard('request-one', { requestType: 'equipment_booking' })).toBeUndefined()
  })
})

describe('configured new flows inherit request progress and actor routing', () => {
  const repository = new WorkflowTemplateRepository()
  const definition: RequestExperienceDefinition = {
    version: 1,
    family: 'equipment',
    reviewAction: 'approve_request',
    fulfilmentAction: 'acknowledge_execution',
    labels: { in_review: 'Equipment team review', in_fulfilment: 'Equipment handover' },
  }

  function template(tenantId: string) {
    return {
      id: `equipment-${randomUUID()}`,
      tenantId,
      workflowType: 'equipment_booking',
      name: 'Equipment booking',
      sector: 'custom' as const,
      enabled: true,
      version: 1,
      steps: [],
      paymentModes: [],
      credentialPolicy: { outputVCs: [], autoIssue: false },
      reconciliationPolicy: { mode: 'manual_close' as const, events: [] },
      evidencePolicy: {},
      brandingPolicy: {},
    }
  }

  test('list and detail progress agree when a completed request has no recorded fulfilment start', () => {
    const org = seedOrganization()
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'equipment_booking',
      title: 'Recorded progress',
    })!
    const db = DatabaseManager.getDatabase()
    db.prepare(`UPDATE requests SET status = 'completed' WHERE id = ?`).run(request.id)
    for (const status of ['submitted', 'in_review', 'approved', 'completed']) {
      db.prepare(
        `INSERT INTO request_events (id, request_id, event_type, to_status)
                  VALUES (?, ?, 'request.status_changed', ?)`,
      ).run(randomUUID(), request.id, status)
    }
    const listed = platformRequestService
      .list(org.orgTenantId, org.ownerUserId)
      .items.find((item) => item.id === request.id)!
    const detail = platformRequestService.getForTenant(request.id, org.orgTenantId)!
    expect(listed.experience).toEqual(detail.experience)
    expect(listed.experience.stages.find((stage) => stage.key === 'in_fulfilment')?.status).toBe('skipped')
  })

  test('one tenant declaration persists, projects, routes, and supplies setup actor requirements', () => {
    const org = seedOrganization()
    const member = `equipment-reviewer-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: member, role: 'manager' })
    const saved = template(org.orgTenantId)
    repository.save(saved)
    const updated = saveRequestExperience(org.orgTenantId, saved.id, 1, definition)
    expect(repository.findById(saved.id)?.experience).toEqual(definition)
    expect(updated.version).toBe(2)
    expect(getDeclaredPrerequisites(updated)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'stage_actor', stageAction: 'approve_request' }),
        expect.objectContaining({ key: 'stage_actor', stageAction: 'acknowledge_execution' }),
      ]),
    )
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'equipment_booking',
      stageAction: 'approve_request',
      defaultUserId: member,
      enabled: true,
    })
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'equipment_booking',
      title: 'Reserve a drill',
    })
    expect(request?.experience.stages.find((stage) => stage.key === 'in_review')?.label).toBe('Equipment team review')
    const route = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'equipment_booking',
      sourceId: request!.id,
      title: 'Reserve a drill',
      body: 'Equipment review needed',
    })
    expect(route.recipients[0].userId).toBe(member)
    const card = DatabaseManager.getDatabase()
      .prepare(
        `SELECT metadata FROM wallet_pending_offers WHERE source_id = ? AND source_type = 'workflow_stage_action'`,
      )
      .get(request!.id) as { metadata: string }
    expect(JSON.parse(card.metadata)).toMatchObject({
      workflowType: 'equipment_booking',
      stageAction: 'approve_request',
      resourceType: 'request',
      resourceId: request!.id,
    })
    const fulfiller = `equipment-custodian-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: fulfiller, role: 'manager' })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'equipment_booking',
      stageAction: 'acknowledge_execution',
      defaultUserId: fulfiller,
      enabled: true,
    })
    DatabaseManager.getDatabase().prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(request!.id)
    expect(
      platformRequestService.nextStepFor({ id: request!.id, request_type: 'equipment_booking', status: 'approved' }),
    ).toMatchObject({ toStatus: 'completed' })
    const fulfilmentRoute = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'equipment_booking',
      sourceId: request!.id,
      stageAction: definition.fulfilmentAction,
      title: 'Equipment handover',
      body: 'Collect the equipment',
    })
    expect(fulfilmentRoute.recipients[0].userId).toBe(fulfiller)
    const fulfilmentCard = DatabaseManager.getDatabase()
      .prepare(
        `SELECT metadata FROM wallet_pending_offers WHERE source_id = ? AND tenant_id = ? AND source_type = 'workflow_stage_action'`,
      )
      .get(request!.id, fulfilmentRoute.recipients[0].walletTenantId) as { metadata: string }
    expect(JSON.parse(fulfilmentCard.metadata)).toMatchObject({
      resourceType: 'request',
      resourceId: request!.id,
      stageAction: 'acknowledge_execution',
    })
    const other = seedOrganization()
    expect(requestExperienceDefinition(other.orgTenantId, 'equipment_booking').definition.family).toBe('requests')
    expect(() => saveRequestExperience(other.orgTenantId, saved.id, 2, definition)).toThrow(/not found/)
    expect(() => saveRequestExperience(org.orgTenantId, saved.id, 1, definition)).toThrow(/changed/)
  })

  test('unsupported actions, phases and versions fail explicitly without saving', () => {
    for (const invalid of [
      { ...definition, reviewAction: 'invented_action' },
      { ...definition, version: 2 },
      { ...definition, labels: { money_received: 'Paid' } },
    ]) {
      expect(() => validateRequestExperience(invalid as RequestExperienceDefinition)).toThrow(/Unsupported/)
    }
    const org = seedOrganization()
    expect(() =>
      routeWorkflowStageInbox({
        orgTenantId: org.orgTenantId,
        requestType: 'hr.leave',
        sourceId: 'r',
        title: 'Invalid',
        body: 'Invalid',
        stageAction: 'invented_action',
      }),
    ).toThrow(/Unsupported request stage action/)
  })

  test('a configured decision-only request has no fulfilment step after approval', () => {
    const org = seedOrganization()
    const saved = template(org.orgTenantId)
    repository.save(saved)
    saveRequestExperience(org.orgTenantId, saved.id, 1, {
      version: 1,
      family: 'equipment',
      reviewAction: 'approve_request',
      decisionOnly: true,
    })
    const request = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: org.ownerUserId,
      requestType: 'equipment_booking',
      title: 'Decision only',
    })
    DatabaseManager.getDatabase().prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(request!.id)
    expect(
      platformRequestService.nextStepFor({ id: request!.id, request_type: 'equipment_booking', status: 'approved' }),
    ).toBeUndefined()
    const projected = projectRequestExperience({
      id: request!.id,
      requestType: 'equipment_booking',
      status: 'approved',
      definition: requestExperienceDefinition(org.orgTenantId, 'equipment_booking').definition,
    })
    expect(projected.stages.map((stage) => stage.key)).toEqual(['submitted', 'in_review', 'approved'])
  })
})

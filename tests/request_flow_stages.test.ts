import 'reflect-metadata'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WorkflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { WorkflowTemplateRepository } from '../src/persistence/WorkflowTemplateRepository'
import { requestFlowFor, MEMBER_REQUEST_FLOWS, PUBLIC_REQUEST_FLOWS } from '../src/config/requestFlows'
import { ORG_OFFERINGS } from '../src/config/orgOfferings'
import { assertRunResume } from '../src/services/RunAccessPolicy'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { platformRequestService, MEMBER_REQUEST_TYPES } from '../src/services/PlatformRequestService'
import { getTemplateById } from '../src/services/workflow/templates'
import { addAuthorityGrant, addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
const runs = new WorkflowRunRepository()
const templates = new WorkflowTemplateRepository()
const approvalScope = { permissions: ['request.approve', 'request.reject'], resourceTypes: ['request'] }

beforeAll(() => {
  databases = initTestDatabases('request-flow-stages-')
})
afterAll(() => databases.cleanup())

function setup() {
  const org = seedOrganization({ name: `Flow stages ${randomUUID().slice(0, 6)}` })
  const requesterUserId = `requester-${randomUUID()}`
  addMember({ ...org, userId: requesterUserId, role: 'field_worker' })
  const managerUserId = `manager-${randomUUID()}`
  addAuthorityGrant(org.organizationId, addMember({ ...org, userId: managerUserId, role: 'manager' }), 'approve', approvalScope)
  const financeUserId = `finance-${randomUUID()}`
  addAuthorityGrant(org.organizationId, addMember({ ...org, userId: financeUserId, role: 'manager' }), 'approve', approvalScope)
  orgWorkflowActorService.upsertDefault({
    orgTenantId: org.orgTenantId,
    workflowType: 'internal_requisitions',
    stageAction: 'approve_requisition',
    defaultUserId: managerUserId,
    enabled: true,
  })
  orgWorkflowActorService.upsertDefault({
    orgTenantId: org.orgTenantId,
    workflowType: 'internal_requisitions',
    stageAction: 'finance_review',
    defaultUserId: financeUserId,
    enabled: true,
  })
  return { org, requesterUserId, managerUserId, financeUserId }
}

/** The organisation's own purchase flow: the manager, then finance from 500 up. */
function addFinanceStep(orgTenantId: string) {
  templates.save({
    id: `tpl-request-purchase-own-${orgTenantId}`,
    tenantId: orgTenantId,
    workflowType: 'tpl-request-purchase',
    name: 'Purchase request with finance',
    sector: 'custom',
    enabled: true,
    version: 1,
    steps: [
      {
        action: 'stage.await_actor',
        description: 'Manager decides',
        config: {
          stageAction: 'approve_requisition',
          workflowType: 'internal_requisitions',
          requestDecision: true,
          title: 'Manager approval',
        },
      },
      {
        action: 'stage.await_actor',
        description: 'Finance decides bigger purchases',
        config: {
          stageAction: 'finance_review',
          workflowType: 'internal_requisitions',
          requestDecision: true,
          title: 'Finance approval',
          when: { amountAtLeast: 500 },
        },
      },
    ],
    paymentModes: [],
    credentialPolicy: { outputVCs: [], autoIssue: false },
    reconciliationPolicy: { mode: 'manual_close', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
  } as any)
}

function raise(orgTenantId: string, requesterUserId: string, amount: number) {
  const request = platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef: requesterUserId,
    requestType: 'procurement.requisition',
    title: `Materials ${amount}`,
    amount,
    currency: 'USD',
    context: { paymentMethod: 'cash', itemType: 'goods', receivingRequired: false },
  })!
  platformRequestService.submit(request.id, orgTenantId, requesterUserId)
  return request.id
}

async function flowRun(requestId: string, status?: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT payload_json AS payloadJson FROM request_events
         WHERE request_id = ? AND event_type = 'request.flow_started' ORDER BY rowid DESC LIMIT 1`,
      )
      .get(requestId) as { payloadJson?: string } | undefined
    const runId = row?.payloadJson ? JSON.parse(row.payloadJson).runId : undefined
    const run = runId ? runs.findRunById(runId) : undefined
    if (run && (!status || run.status === status)) return run
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`The request flow did not reach ${status || 'a run'}`)
}

function openCards(requestId: string, userId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT body FROM wallet_pending_offers
       WHERE source_type = 'workflow_stage_action' AND resolved_at IS NULL AND source_id = ? AND tenant_id = ?`,
    )
    .all(requestId, `wallet-${userId}`) as Array<{ body: string }>
}

describe('a request is the trigger of its flow, and its approvals are the flow steps', () => {
  test('every member request and public service maps to an organisation flow', () => {
    expect(MEMBER_REQUEST_TYPES).toEqual(MEMBER_REQUEST_FLOWS.map((flow) => flow.requestType))
    expect(PUBLIC_REQUEST_FLOWS).toHaveLength(ORG_OFFERINGS.length)
    for (const flow of MEMBER_REQUEST_FLOWS) {
      if (flow.templateId) expect(getTemplateById(flow.templateId)).toBeDefined()
    }
    // A payout nudge belongs to the job's own payout step; it never starts a second flow.
    expect(requestFlowFor('finance.payout_request')?.templateId).toBeUndefined()
    expect(requestFlowFor('offering:book_job')?.templateId).toBe('tpl-fept-field-execution')
  })

  test('the built-in flow has one approval, as before, and its run finishes with the decision', async () => {
    const { org, requesterUserId, managerUserId } = setup()
    const requestId = raise(org.orgTenantId, requesterUserId, 900)
    const paused = await flowRun(requestId, 'paused')
    expect((paused.output as any).stageGate).toMatchObject({ stageAction: 'approve_requisition', requestId })

    const view = platformRequestService.getForSubject(requestId, org.orgTenantId, managerUserId) as any
    expect(view.decision).toMatchObject({ stageCount: 1, stageLabel: 'Review and decide', canApprove: true })
    // The run never writes a second card for the same decision.
    expect(openCards(requestId, managerUserId)).toHaveLength(1)
    // Deciding happens on the request; the run cannot be pushed past the step on its own.
    expect(() => assertRunResume({ id: managerUserId, tenantId: org.orgTenantId }, paused)).toThrow(/decided on its request/)

    const approved = platformRequestService.decideBySubject(requestId, org.orgTenantId, managerUserId, 'approve') as any
    expect(approved.status).toBe('approved')
    await flowRun(requestId, 'completed')
  })

  test('a bigger purchase waits for the manager and then finance, each from their own inbox', async () => {
    const { org, requesterUserId, managerUserId, financeUserId } = setup()
    addFinanceStep(org.orgTenantId)
    const requestId = raise(org.orgTenantId, requesterUserId, 750)
    await flowRun(requestId, 'paused')

    expect((platformRequestService.getForSubject(requestId, org.orgTenantId, managerUserId) as any).decision).toMatchObject({
      stageAction: 'approve_requisition',
      stageNumber: 1,
      stageCount: 2,
      stageLabel: 'Step 1 of 2: Manager approval',
      canApprove: true,
    })
    expect(() => platformRequestService.decideBySubject(requestId, org.orgTenantId, financeUserId, 'approve')).toThrow(
      /assigned stage actor/,
    )

    const afterFirst = platformRequestService.decideBySubject(requestId, org.orgTenantId, managerUserId, 'approve') as any
    expect(afterFirst.status).toBe('in_review')
    expect(afterFirst.events.map((event: any) => event.event_type)).toContain('request.stage_approved')
    for (let attempt = 0; attempt < 40 && openCards(requestId, financeUserId).length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(openCards(requestId, financeUserId)[0]?.body).toMatch(/Step 2 of 2: Finance approval/)
    expect(openCards(requestId, managerUserId)).toHaveLength(0)

    const financeView = platformRequestService.getForSubject(requestId, org.orgTenantId, financeUserId) as any
    expect(financeView.decision).toMatchObject({ stageAction: 'finance_review', stageNumber: 2, canApprove: true })
    expect(() => platformRequestService.decideBySubject(requestId, org.orgTenantId, managerUserId, 'approve')).toThrow(
      /earlier step/,
    )

    const approved = platformRequestService.decideBySubject(requestId, org.orgTenantId, financeUserId, 'approve') as any
    expect(approved.status).toBe('approved')
    await flowRun(requestId, 'completed')
  })

  test('below the amount the finance step does not apply', async () => {
    const { org, requesterUserId, managerUserId } = setup()
    addFinanceStep(org.orgTenantId)
    const requestId = raise(org.orgTenantId, requesterUserId, 120)
    await flowRun(requestId, 'paused')
    const approved = platformRequestService.decideBySubject(requestId, org.orgTenantId, managerUserId, 'approve') as any
    expect(approved.status).toBe('approved')
    await flowRun(requestId, 'completed')
  })

  test('declining at a later step declines the request and stops its flow', async () => {
    const { org, requesterUserId, managerUserId, financeUserId } = setup()
    addFinanceStep(org.orgTenantId)
    const requestId = raise(org.orgTenantId, requesterUserId, 800)
    await flowRun(requestId, 'paused')
    platformRequestService.decideBySubject(requestId, org.orgTenantId, managerUserId, 'approve')
    const rejected = platformRequestService.decideBySubject(
      requestId,
      org.orgTenantId,
      financeUserId,
      'reject',
      'Over this month’s budget',
    ) as any
    expect(rejected.status).toBe('rejected')
    await flowRun(requestId, 'cancelled')
  })
})

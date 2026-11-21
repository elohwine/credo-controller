/**
 * A job a customer books is never given to anyone automatically. It waits in Operations → Jobs,
 * the owners and admins get a job card, and the existing "Move job" (reassign) picks the worker.
 */

import 'reflect-metadata'
import { Agent } from '@credo-ts/core'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { container } from 'tsyringe'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { notificationService } from '../src/services/NotificationService'
import { OrganizationService } from '../src/services/OrganizationService'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { workflowService } from '../src/services/WorkflowService'
import { contactHash, normalizeContactPhone } from '../src/services/ssi/contactHash'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { FieldExecutionActions } from '../src/services/workflow/actions/FieldExecutionActions'
import { ensureExecutableWorkflow } from '../src/services/workflow/materialize'
import {
  addMember,
  addRole,
  configureFeptTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases
const issued: Array<{ runId?: string; type: string }> = []

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  issued.push({ runId: context.runId, type: config.type })
  context.state.issuedCredentials = {
    ...(context.state.issuedCredentials || {}),
    [config.type]: { offerId: `offer-${config.type}-${issued.length}`, recipientStage: config.recipientStage },
  }
})
ActionRegistry.register('external.send_notification', async (context) => {
  context.state.notified = true
})
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-booked-job-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: 'offer-fept',
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/fept',
  }))
  jest
    .spyOn(notificationService, 'dispatchContactNotification')
    .mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] } as any)
})

afterAll(() => {
  databases.cleanup()
})

function run(runId: string) {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT status, input, output FROM workflow_runs WHERE id = ?`)
    .get(runId) as { status: string; input: string; output: string | null }
  return { status: row.status, input: JSON.parse(row.input || '{}'), state: row.output ? JSON.parse(row.output) : {} }
}

function stageCards(runId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT o.tenant_id AS walletTenantId, o.resolved_at AS resolvedAt, o.metadata
       FROM wallet_pending_offers o
       WHERE o.source_type = 'workflow_stage_action' AND (o.source_id = ? OR o.source_id LIKE ?)`,
    )
    .all(runId, `${runId}%`) as Array<{ walletTenantId: string; resolvedAt: string | null; metadata: string }>
}

function walletOf(userId: string): string {
  return (
    DatabaseManager.getDatabase().prepare(`SELECT tenant_id AS t FROM ssi_users WHERE id = ?`).get(userId) as { t: string }
  ).t
}

describe('booked field job', () => {
  let org: SeededOrganization
  let workerUserId: string

  beforeAll(() => {
    org = seedOrganization({ name: 'Booked Plumbing' })
    addRole(org.organizationId, 'Field Worker')
    workerUserId = `worker-${Date.now()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: workerUserId, role: 'field_worker' })
    const fept = configureFeptTemplate(org.orgTenantId)
    if (!ensureExecutableWorkflow(org.orgTenantId, fept.id)) throw new Error('FEPT workflow could not be materialized')
  })

  test('waits unassigned, tells the owner, and the first "Move job" gives it to the chosen worker', async () => {
    issued.length = 0
    const started = await workflowService.executeWorkflow(
      'field_execution_fept',
      {
        reference: 'BK-TEST-1',
        description: 'Kitchen tap leaking',
        location: '12 Main Rd, Harare',
        scheduledDate: '2030-01-10',
        clientName: 'Tendai',
        customerMsisdn: '+263771112233',
        amount: 0,
        currency: 'USD',
        awaitAssignment: true,
        bookedVia: 'app',
      },
      org.orgTenantId,
      { triggerType: 'manual', triggerRef: 'workflow-request:test-1' },
    )
    const runId = String((started as any).runId || (started as any).id)

    let current = run(runId)
    expect(current.status).toBe('paused')
    expect(current.state.pauseReason).toBe('await_assignment')
    expect(current.state.assignment?.assigneeId).toBeUndefined()
    expect(current.input.assigneeId).toBeUndefined()
    expect(issued.map((vc) => vc.type)).not.toContain('JobAssignmentVC')
    expect(FieldExecutionActions.isAwaitingAssignment(runId)).toBe(true)
    // The wait is its own template step, right before field.assign.
    const runRow = DatabaseManager.getDatabase()
      .prepare(`SELECT current_step AS currentStep, actions_snapshot AS snapshot FROM workflow_runs WHERE id = ?`)
      .get(runId) as { currentStep: number; snapshot: string }
    const steps = JSON.parse(runRow.snapshot || '[]')
    const assignIndex = steps.findIndex((step: any) => step?.action === 'field.assign')
    expect(steps[assignIndex - 1]).toMatchObject({ action: 'field.pause', config: { reason: 'await_assignment' } })
    expect(runRow.currentStep).toBe(assignIndex)

    const ownerCards = stageCards(runId).filter((card) => card.walletTenantId === walletOf(org.ownerUserId))
    expect(ownerCards).toHaveLength(1)
    expect(JSON.parse(ownerCards[0].metadata)).toMatchObject({ workflowRunId: runId, pauseReason: 'await_assignment' })

    const moved = await workflowService.reassignRun(runId, workerUserId, org.ownerUserId)
    expect(moved.assigneeId).toBe(workerUserId)

    current = run(runId)
    expect(current.status).toBe('paused')
    expect(current.state.pauseReason).toBe('await_worker_start')
    expect(current.state.workflowStage).toBe('ASSIGNED')
    expect(current.state.assignment?.assigneeId).toBe(workerUserId)
    expect(current.state.reassignments?.[0]).toMatchObject({ to: workerUserId, by: org.ownerUserId })
    expect(issued.map((vc) => vc.type)).toContain('JobAssignmentVC')
    expect(stageCards(runId).find((card) => card.walletTenantId === walletOf(org.ownerUserId))?.resolvedAt).toBeTruthy()
    expect(FieldExecutionActions.isAwaitingAssignment(runId)).toBe(false)
    expect(() => FieldExecutionActions.prepareFirstAssignment(runId, workerUserId, org.ownerUserId)).toThrow(
      /already has someone/,
    )
  })

  test('a booking customer whose phone belongs to a team member is not put on the job', async () => {
    const phone = '+263779998877'
    container.registerInstance(Agent as any, { modules: {} })
    const orgService = container.resolve(OrganizationService) as any
    DatabaseManager.getDatabase()
      .prepare(`UPDATE ssi_users SET phone_hash = ? WHERE id = ?`)
      .run(contactHash(normalizeContactPhone(phone)), workerUserId)
    expect(orgService.lookupUserByPhone(org.orgTenantId, phone)).toMatchObject({ userId: workerUserId, inTeam: true })
    const started = await workflowService.executeWorkflow(
      'field_execution_fept',
      {
        reference: 'BK-TEST-2',
        description: 'Geyser not heating',
        location: 'Avondale',
        clientName: 'Worker as customer',
        customerMsisdn: phone,
        amount: 0,
        currency: 'USD',
        awaitAssignment: true,
      },
      org.orgTenantId,
      { triggerType: 'manual', triggerRef: 'workflow-request:test-2' },
    )
    const runId = String((started as any).runId || (started as any).id)
    const current = run(runId)
    expect(current.state.pauseReason).toBe('await_assignment')
    expect(current.input.assigneeId).toBeUndefined()
    expect(current.state.assignment?.assigneeId).toBeUndefined()
  })
})

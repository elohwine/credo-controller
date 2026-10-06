/**
 * A field job hands control to another procedure and takes it back.
 *
 * The job raises "Buy materials" (a purchase request); while it is open the job cannot
 * move on; approving the purchase releases the hold and the worker continues. The
 * organization only chooses how each hand-off starts and after which stage.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { workflowHandoffService } from '../src/services/workflow/WorkflowHandoffService'
import { ensureExecutableWorkflow } from '../src/services/workflow/materialize'

import { addMember, addRole, configureFeptTemplate, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  context.state.issuedCredentials = { ...(context.state.issuedCredentials || {}), [config.type]: { offerId: `offer-${config.type}` } }
})
ActionRegistry.register('external.send_notification', async () => undefined)
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-workflow-handoff-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: 'offer-handoff',
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/handoff',
  }))
})

afterAll(() => {
  databases.cleanup()
})

function run(runId: string) {
  const db = DatabaseManager.getDatabase()
  return (db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId) as any) && workflowServiceRun(runId)
}

function workflowServiceRun(runId: string) {
  const row = DatabaseManager.getDatabase().prepare('SELECT id, workflow_id, tenant_id, status, input, output FROM workflow_runs WHERE id = ?').get(runId) as any
  return {
    id: row.id,
    workflowId: row.workflow_id,
    tenantId: row.tenant_id,
    status: row.status,
    input: row.input ? JSON.parse(row.input) : {},
    output: row.output ? JSON.parse(row.output) : {},
    triggerType: 'manual' as const,
    currentStep: 0,
    totalSteps: 0,
  }
}

async function startFieldJob(name: string, extraInput: Record<string, unknown> = {}) {
  const org = seedOrganization({ name })
  addRole(org.organizationId, 'Field Worker')
  const workerUserId = `worker-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: workerUserId, role: 'field_worker' })
  const fept = configureFeptTemplate(org.orgTenantId)
  const workflow = ensureExecutableWorkflow(org.orgTenantId, fept.id)!
  const start = await workflowService.executeWorkflow(
    workflow.id,
    {
      reference: `JOB-${name}`,
      requestId: `REQ-${name}`,
      amount: 120,
      assigneeId: workerUserId,
      requireSiteInspection: false,
      requireRiskAssessment: 'false',
      requireArrivalProof: false,
      requireCompletionReview: false,
      requireCustomerSignoff: false,
      ...extraInput,
    },
    org.orgTenantId,
  )
  return { org, runId: start.runId, workerUserId }
}

describe('job hand-offs', () => {
  test('buy materials holds the job until the purchase is approved, then the job continues', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Materials')
    expect(run(runId).output.pauseReason).toBe('await_worker_start')

    // Before the worker starts, the hand-off is not offered yet (default: after "Worker started").
    expect(workflowHandoffService.availableFor(run(runId)).map((h) => h.key)).not.toContain('field_buy_materials')

    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    expect(run(runId).output.completedStages).toContain('await_worker_start')
    const offered = workflowHandoffService.availableFor(run(runId))
    expect(offered.map((h) => h.key)).toContain('field_buy_materials')
    // No client on this job, so a quote is not offered.
    expect(offered.map((h) => h.key)).not.toContain('field_quote_extra_work')

    const link = await workflowHandoffService.start({
      runId,
      key: 'field_buy_materials',
      provided: { description: 'Copper pipe', amount: 85 },
      actedByUserId: workerUserId,
      mode: 'manual',
    })
    expect(link.childKind).toBe('request')
    expect(link.status).toBe('running')

    // Starting it again returns the same purchase.
    const again = await workflowHandoffService.start({ runId, key: 'field_buy_materials', provided: { description: 'Copper pipe', amount: 85 }, actedByUserId: workerUserId, mode: 'manual' })
    expect(again.id).toBe(link.id)

    // The job is held.
    await expect(workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' })).rejects.toThrow(/Buy materials/i)
    expect(run(runId).output.waitingForHandoffs).toEqual(['field_buy_materials'])

    // Approving the purchase hands control back.
    DatabaseManager.getDatabase().prepare(`UPDATE requests SET status = 'approved' WHERE id = ?`).run(link.childId)
    await workflowHandoffService.onRequestStatus(link.childId, 'approved')
    expect(workflowHandoffService.waitingFor(runId)).toHaveLength(0)
    expect(run(runId).output.handoffs[0].status).toBe('completed')

    await workflowService.resumeWorkflow(runId, { evidenceHash: 'b1', phase: 'before', photoUri: 'b.jpg' }, workerUserId)
    expect(run(runId).output.pauseReason).toBe('await_evidence_after')
    void org
    void platformRequestService
  })

  test('an organization can make a hand-off start by itself after a chosen stage', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Auto')
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', { startMode: 'auto', requiredStages: ['await_worker_start'] })

    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const links = workflowHandoffService.links(runId)
    expect(links.map((l) => l.key)).toEqual(['field_buy_materials'])
    expect(workflowHandoffService.holdMessage(runId)).toMatch(/buy materials/i)
  })

  test('a switched-off hand-off is never offered', async () => {
    const { org, runId, workerUserId } = await startFieldJob('Off', { clientName: 'Acme', customerMsisdn: '0771112222' })
    workflowHandoffService.saveSetting(org.orgTenantId, 'field_buy_materials', { enabled: false })
    await workflowService.resumeWorkflow(runId, {}, workerUserId)
    const keys = workflowHandoffService.availableFor(run(runId)).map((h) => h.key)
    expect(keys).not.toContain('field_buy_materials')
    expect(keys).toContain('field_quote_extra_work')
    const settings = workflowHandoffService.settingsFor(org.orgTenantId)
    expect(settings.find((s) => s.key === 'field_quote_extra_work')?.conditionLabel).toMatch(/client/i)
    expect(settings.some((s) => s.kind === 'request' && /supplier/i.test(s.conditionLabel))).toBe(true)
  })
})

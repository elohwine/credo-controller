/**
 * Execution gate: a workflow request on an organization whose setup does not
 * satisfy the template's prerequisites must NOT start a run. Instead an
 * `organization.setup` task is opened on the request (inbox/action model) and a
 * WorkflowPrerequisitesError is raised. Once the organization is configured the
 * same request starts normally. No `enabled` flag or sector activation involved.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { orgMembershipCredentialService } from '../src/services/OrgMembershipCredentialService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { PlatformWorkflowService } from '../src/services/PlatformWorkflowService'
import { WorkflowPrerequisitesError } from '../src/services/WorkflowReadinessService'
import { WorkflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'

import {
  addMember,
  addPaymentService,
  addRole,
  configureFeptTemplate,
  configurePaymentCollectionTemplate,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases
let platformWorkflowService: PlatformWorkflowService

// The gate is what is under test; keep engine side effects local.
ActionRegistry.register('credential.issue', async (context, config) => {
  context.state.issuedCredentials = {
    ...(context.state.issuedCredentials || {}),
    [config?.type || 'VC']: { offerId: 'mock' },
  }
})
ActionRegistry.register('external.send_notification', async () => undefined)
ActionRegistry.register('external.ecocash_payment', async (context) => {
  context.state.payment = {
    status: 'completed',
    receiptId: 'sim',
    providerRef: 'sim',
    timestamp: new Date().toISOString(),
  }
})
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-readiness-gate-')
  // Stage routing may refresh a staff card; keep that side effect inside this fixture.
  orgMembershipCredentialService.setOfferFactory(async () => ({
    offerId: `gate-${randomUUID()}`,
    offerUri: `openid-credential-offer://gate/${randomUUID()}`,
  }))
  platformWorkflowService = new PlatformWorkflowService(new WorkflowService())
})

afterAll(() => {
  databases.cleanup()
})

function createRequest(orgTenantId: string, subjectRef: string, requestType: string) {
  const request = platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef,
    requestType,
    title: `${requestType} request`,
  } as any)
  return request as { id: string }
}

function setupTasksFor(requestId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT id, status, assignee_person_id AS assigneePersonId, outcome_ref AS outcomeRef FROM request_tasks WHERE request_id = ? AND task_type = 'organization.setup'`,
    )
    .all(requestId) as Array<{ id: string; status: string; assigneePersonId: string | null; outcomeRef: string }>
}

function requestRow(requestId: string) {
  return DatabaseManager.getDatabase()
    .prepare(`SELECT workflow_id AS workflowId, workflow_run_id AS workflowRunId FROM requests WHERE id = ?`)
    .get(requestId) as { workflowId: string | null; workflowRunId: string | null }
}

describe('Execution gate — FEPT on an unready organization', () => {
  test('opens an organization.setup task instead of starting a run, then starts once configured', async () => {
    const org = seedOrganization({ name: 'Field Ops Ltd' })
    // Who goes out is asked on the job, and the Owner role is filled in. A job that
    // takes payment still waits until a payment method exists.
    const template = configureFeptTemplate(org.orgTenantId, { paymentModes: ['ecocash'] })
    const request = createRequest(org.orgTenantId, org.ownerUserId, 'field_job')

    await expect(
      platformWorkflowService.startForRequest(request.id, template.id, org.orgTenantId, org.ownerUserId, {
        reference: 'JOB-1',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(WorkflowPrerequisitesError)

    // No run started, setup task opened and assigned to the owner.
    expect(requestRow(request.id).workflowRunId).toBeNull()
    const tasks = setupTasksFor(request.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('pending')
    expect(tasks[0].assigneePersonId).toBe(org.ownerPersonId)
    const outcome = JSON.parse(tasks[0].outcomeRef) as { missing: Array<{ key: string }> }
    expect(outcome.missing.map((item) => item.key)).toEqual(expect.arrayContaining(['payment_provider']))
    expect(outcome.missing.map((item) => item.key)).not.toContain('stage_actor:assign_field_worker')

    const events = DatabaseManager.getDatabase()
      .prepare(`SELECT event_type AS eventType FROM request_events WHERE request_id = ? ORDER BY created_at`)
      .all(request.id) as Array<{ eventType: string }>
    expect(events.map((event) => event.eventType)).toContain('workflow.prerequisites_missing')

    // Retrying while still unready is idempotent: no second setup task.
    await expect(
      platformWorkflowService.startForRequest(request.id, template.id, org.orgTenantId, org.ownerUserId, {}),
    ).rejects.toBeInstanceOf(WorkflowPrerequisitesError)
    expect(setupTasksFor(request.id)).toHaveLength(1)

    // A payment method, and the owner named for money, is what this job was waiting for.
    addPaymentService(org.orgTenantId, 'EcoCash')
    orgWorkflowActorService.savePolicy(org.orgTenantId, { defaultChain: [{ type: 'role', value: 'owner' }] })
    addRole(org.organizationId, 'Field Worker')
    const workerPersonId = addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      role: 'field_worker',
    })
    expect(workerPersonId).toBeTruthy()

    const result = await platformWorkflowService.startForRequest(
      request.id,
      template.id,
      org.orgTenantId,
      org.ownerUserId,
      {
        reference: 'JOB-1',
        amount: 100,
        currency: 'USD',
      },
    )
    expect(result.runId).toBeTruthy()

    const row = requestRow(request.id)
    expect(row.workflowId).toBe(template.id)
    expect(row.workflowRunId).toBe(result.runId)
  })
})

describe('Execution gate — finance template on an unready organization', () => {
  test('payment collection waits for a payment provider, then runs', async () => {
    const org = seedOrganization({ name: 'Collections Ltd' })
    addRole(org.organizationId, 'Cashier')
    const template = configurePaymentCollectionTemplate(org.orgTenantId)
    const request = createRequest(org.orgTenantId, org.ownerUserId, 'payment_collection')

    await expect(
      platformWorkflowService.startForRequest(request.id, template.id, org.orgTenantId, org.ownerUserId, {
        amount: 50,
        payerDescription: 'Term fees',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PREREQUISITES_MISSING' })

    const tasks = setupTasksFor(request.id)
    expect(tasks).toHaveLength(1)
    expect(JSON.parse(tasks[0].outcomeRef).missing.map((item: { key: string }) => item.key)).toEqual([
      'payment_provider',
    ])
    expect(requestRow(request.id).workflowRunId).toBeNull()

    addPaymentService(org.orgTenantId, 'EcoCash')

    const result = await platformWorkflowService.startForRequest(
      request.id,
      template.id,
      org.orgTenantId,
      org.ownerUserId,
      {
        amount: 50,
        payerDescription: 'Term fees',
      },
    )
    expect(result.runId).toBeTruthy()
    expect(requestRow(request.id).workflowRunId).toBe(result.runId)
  })

  describe('Setup contract — concrete catalogue identity at execution boundaries', () => {
    function saveCollectionsWorkflow(tenantId: string) {
      const id = `tpl-payment-collection-${tenantId}-1700000000000`
      workflowRepository.save({
        id,
        tenantId,
        name: 'Collections',
        category: 'finance',
        provider: 'test',
        description: '',
        inputSchema: {},
        actions: [],
      })
      return id
    }

    function select(tenantId: string, modules: string[]) {
      orgSetupProfileService.save(tenantId, {
        operatingModel: 'internal',
        kinds: ['office'],
        modules,
        expectedRevision: orgSetupProfileService.get(tenantId).access.revision,
      })
    }

    test('start is selection-gated, then prerequisite-gated before any run is created', async () => {
      const org = seedOrganization({ setup: 'new' })
      const id = saveCollectionsWorkflow(org.orgTenantId)
      const engine = new WorkflowService()
      select(org.orgTenantId, ['field_jobs'])
      await expect(engine.executeWorkflow(id, {}, org.orgTenantId)).rejects.toMatchObject({ status: 403 })
      select(org.orgTenantId, ['collections'])
      await expect(engine.executeWorkflow(id, {}, org.orgTenantId)).rejects.toBeInstanceOf(WorkflowPrerequisitesError)
      expect(workflowRunRepository.listRuns(org.orgTenantId)).toHaveLength(0)
      addPaymentService(org.orgTenantId)
      await expect(engine.executeWorkflow(id, {}, org.orgTenantId)).resolves.toMatchObject({ status: 'completed' })
    })

    test('retry rechecks selected scope and readiness without altering failed history on rejection', async () => {
      const org = seedOrganization({ setup: 'new' })
      const id = saveCollectionsWorkflow(org.orgTenantId)
      const run = workflowRunRepository.createRun({
        workflowId: id,
        tenantId: org.orgTenantId,
        status: 'failed',
        error: 'previous failure',
      })
      const engine = new WorkflowService()
      select(org.orgTenantId, [])
      await expect(engine.retryFailedRun(run.id)).rejects.toMatchObject({ status: 403 })
      select(org.orgTenantId, ['collections'])
      await expect(engine.retryFailedRun(run.id)).rejects.toBeInstanceOf(WorkflowPrerequisitesError)
      expect(workflowRunRepository.findRunById(run.id)).toMatchObject({ status: 'failed', error: 'previous failure' })
      addPaymentService(org.orgTenantId)
      await expect(engine.retryFailedRun(run.id)).resolves.toMatchObject({ runId: run.id, status: 'completed' })
    })

    test('concrete identity retains an organisation template-specific prerequisite', async () => {
      const org = seedOrganization({ setup: 'new' })
      const id = saveCollectionsWorkflow(org.orgTenantId)
      select(org.orgTenantId, ['collections'])
      addPaymentService(org.orgTenantId)
      configurePaymentCollectionTemplate(org.orgTenantId, {
        id,
        prerequisites: [{ key: 'trusted_issuers', requirement: 'mandatory' }],
      })
      await expect(new WorkflowService().executeWorkflow(id, {}, org.orgTenantId)).rejects.toMatchObject({
        code: 'WORKFLOW_PREREQUISITES_MISSING',
        report: { blocking: expect.arrayContaining([expect.objectContaining({ key: 'trusted_issuers' })]) },
      })
      expect(workflowRunRepository.listRuns(org.orgTenantId)).toHaveLength(0)
    })

    test('nested workflow.start and workflow.trigger cannot bypass the child work area', async () => {
      const org = seedOrganization({ setup: 'new' })
      const id = saveCollectionsWorkflow(org.orgTenantId)
      addPaymentService(org.orgTenantId)
      select(org.orgTenantId, ['field_jobs'])
      for (const action of ['workflow.start', 'workflow.trigger']) {
        const context = { workflowId: 'parent', tenantId: org.orgTenantId, input: {}, state: {} }
        await expect(
          ActionRegistry.get(action)!(context, {
            workflow: id,
            workflowId: id,
            async: false,
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
      expect(workflowRunRepository.listRuns(org.orgTenantId)).toHaveLength(0)
      select(org.orgTenantId, ['collections'])
      const context = { workflowId: 'parent', tenantId: org.orgTenantId, input: {}, state: {} as any }
      await ActionRegistry.get('workflow.start')!(context, { workflow: id, async: false })
      expect(context.state.startedWorkflows[id]).toMatchObject({ status: 'completed', workflowId: id })
    })
  })
})

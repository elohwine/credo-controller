import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { WorkflowController } from '../src/controllers/workflow/WorkflowController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { workflowService } from '../src/services/WorkflowService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { IdempotencyGuard } from '../src/utils/IdempotencyGuard'
import {
  addMember,
  addRole,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-run-access-')
})
afterEach(() => jest.restoreAllMocks())
afterAll(() => databases.cleanup())

function fixture(reason = 'await_worker_start') {
  const org = seedOrganization()
  const worker = `worker-${org.orgTenantId}`
  const former = `former-${org.orgTenantId}`
  for (const userId of [worker, former])
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId,
      role: 'field_worker',
    })
  const workflowId = `field-${org.orgTenantId}`
  workflowRepository.save({
    id: workflowId,
    tenantId: org.orgTenantId,
    name: 'Field',
    category: 'field_execution_fept',
    provider: 'test',
    actions: [],
  })
  const run = workflowRunRepository.createRun({
    workflowId,
    tenantId: org.orgTenantId,
    status: 'paused',
    input: { assigneeId: former },
    output: {
      pauseReason: reason,
      assignment: { assigneeId: worker },
      checkpoints: { arrival: { completedBy: former } },
    },
  })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, { user: { id: req.header('x-test-user'), tenantId: req.header('x-test-tenant') } })
    next()
  })
  app.get('/runs/:id', async (req, res, next) => {
    try {
      const controller = new WorkflowController()
      const result = await controller.getRunStatus(String(req.params.id), req)
      res.status(controller.getStatus() || 200).json(result)
    } catch (error) {
      next(error)
    }
  })
  app.post('/runs/:id/resume', async (req, res, next) => {
    try {
      const controller = new WorkflowController()
      const result = await controller.resumeWorkflow(String(req.params.id), req.body, req)
      res.status(controller.getStatus() || 200).json(result)
    } catch (error) {
      next(error)
    }
  })
  return { org, run, worker, former, app }
}

describe('run endpoint access before read, replay or mutation', () => {
  test('unrelated and former workers cannot read the run, including stale assignee/checkpoint input', async () => {
    const { app, run, org, former } = fixture()
    const read = jest.spyOn(workflowService, 'getRunStatus')
    for (const userId of [former, 'stranger']) {
      await request(app)
        .get(`/runs/${run.id}`)
        .set('x-test-user', userId)
        .set('x-test-tenant', org.orgTenantId)
        .expect(404)
    }
    expect(read).not.toHaveBeenCalled()
  })

  test('the current worker can read with a personal token context, not another job', async () => {
    const { app, run, worker } = fixture()
    jest.spyOn(workflowService, 'getRunStatus').mockResolvedValue({ run, steps: [] })
    await request(app)
      .get(`/runs/${run.id}`)
      .set('x-test-user', worker)
      .set('x-test-tenant', `wallet-${worker}`)
      .expect(200)
    await request(app)
      .get(`/runs/${run.id}`)
      .set('x-test-user', 'elsewhere')
      .set('x-test-tenant', 'other-org')
      .expect(404)
  })

  test('denial occurs before idempotency lookup or engine invocation', async () => {
    const { app, run, org, former } = fixture()
    const replay = jest.spyOn(IdempotencyGuard, 'guard')
    const resume = jest.spyOn(workflowService, 'resumeWorkflow')
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', former)
      .set('x-test-tenant', org.orgTenantId)
      .set('x-idempotency-key', 'another-person-key')
      .send({})
      .expect(404)
    expect(replay).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  test('a worker can advance their stage, but cannot change actors or waive required proofs', async () => {
    const { app, run, org, worker } = fixture()
    const resume = jest.spyOn(workflowService, 'resumeWorkflow').mockResolvedValue({ runId: run.id, status: 'paused' })
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({ requireCustomerSignoff: false })
      .expect(400)
    expect(resume).not.toHaveBeenCalled()
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({ completionReview: { outcome: 'approved' } })
      .expect(400)
    expect(resume).not.toHaveBeenCalled()
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({})
      .expect(200)
    expect(resume).toHaveBeenCalledWith(run.id, {}, worker)
  })

  test.each(['await_acknowledgement', 'await_payout_release'])(
    'generic resume cannot bypass wallet proof at %s',
    async (reason) => {
      const { app, run, org } = fixture(reason)
      const resume = jest.spyOn(workflowService, 'resumeWorkflow')
      await request(app)
        .post(`/runs/${run.id}/resume`)
        .set('x-test-user', org.ownerUserId)
        .set('x-test-tenant', org.orgTenantId)
        .send({})
        .expect(403)
      expect(resume).not.toHaveBeenCalled()
    },
  )

  test('removed membership loses even named-worker access', async () => {
    const { app, run, org, worker } = fixture()
    DatabaseManager.getDatabase()
      .prepare('UPDATE org_memberships SET status = ? WHERE org_tenant_id = ? AND user_id = ?')
      .run('inactive', org.orgTenantId, worker)
    await request(app)
      .get(`/runs/${run.id}`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .expect(404)
  })

  test('the worker may inspect when that stage uses the worker fallback', async () => {
    const { app, run, org, worker } = fixture('await_site_inspection')
    const resume = jest.spyOn(workflowService, 'resumeWorkflow').mockResolvedValue({ runId: run.id, status: 'paused' })
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({ siteInspection: { outcome: 'passed' } })
      .expect(200)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  test('the assigned worker still inspects when the organisation has a supervisor but named nobody', async () => {
    const { app, run, org, worker } = fixture('await_site_inspection')
    const supervisor = `supervisor-${run.id}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: supervisor, role: 'supervisor' })
    const resume = jest.spyOn(workflowService, 'resumeWorkflow').mockResolvedValue({ runId: run.id, status: 'paused' })
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({ siteInspection: { outcome: 'passed' } })
      .expect(200)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  test('an audit permission permits reading but never advancing the worker stage', async () => {
    const { app, run, org } = fixture()
    const auditor = `auditor-${run.id}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: auditor, role: 'auditor' })
    const roleId = addRole(org.organizationId, 'Auditor', ['audit.read'])
    DatabaseManager.getDatabase().prepare('UPDATE roles SET membership_role = ? WHERE id = ?').run('auditor', roleId)
    jest.spyOn(workflowService, 'getRunStatus').mockResolvedValue({ run, steps: [] })
    const resume = jest.spyOn(workflowService, 'resumeWorkflow')
    await request(app)
      .get(`/runs/${run.id}`)
      .set('x-test-user', auditor)
      .set('x-test-tenant', org.orgTenantId)
      .expect(200)
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', auditor)
      .set('x-test-tenant', org.orgTenantId)
      .send({})
      .expect(403)
    expect(resume).not.toHaveBeenCalled()
  })

  test('an explicitly configured inspector, rather than the worker, handles inspection', async () => {
    const { app, run, org, worker, former: inspector } = fixture('await_site_inspection')
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'inspect_site',
      defaultUserId: inspector,
    })
    const resume = jest.spyOn(workflowService, 'resumeWorkflow').mockResolvedValue({ runId: run.id, status: 'paused' })
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', worker)
      .set('x-test-tenant', org.orgTenantId)
      .send({ siteInspection: { outcome: 'passed' } })
      .expect(403)
    await request(app)
      .post(`/runs/${run.id}/resume`)
      .set('x-test-user', inspector)
      .set('x-test-tenant', org.orgTenantId)
      .send({ siteInspection: { outcome: 'passed' } })
      .expect(200)
    expect(resume).toHaveBeenCalledTimes(1)
  })
})

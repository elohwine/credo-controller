/**
 * Answer-driven organisation configuration: the setup questions narrow scope, the
 * server suggests work areas, and request/workflow gates follow those answers.
 * SSI identity is never part of the selection and stays a mandatory readiness item.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { suggestedOrgModules } from '../src/config/orgModules'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { orgEntitlementService } from '../src/services/OrgEntitlementService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-org-config-')
})

afterAll(() => {
  databases.cleanup()
})

function raise(orgTenantId: string, subjectRef: string, requestType: string) {
  return platformRequestService.create({ tenantId: orgTenantId, subjectRef, requestType, title: requestType } as any)
}

function expectStatus(fn: () => unknown, status: number, message?: RegExp) {
  let caught: any
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeDefined()
  expect(caught.status).toBe(status)
  if (message) expect(String(caught.message)).toMatch(message)
}

function configure(
  orgTenantId: string,
  kinds: string[],
  operatingModel: 'internal' | 'integration' | 'hybrid' = 'internal',
  modules?: string[],
) {
  const current = orgSetupProfileService.get(orgTenantId)
  return orgSetupProfileService.save(orgTenantId, {
    operatingModel,
    kinds,
    modules: modules ?? suggestedOrgModules(kinds, operatingModel),
    expectedRevision: current.access.revision,
  })
}

describe('Answer-driven organisation configuration', () => {
  test('a new organisation is blocked with a questionnaire message until it answers', () => {
    const org = seedOrganization({ setup: 'new' })
    const profile = orgSetupProfileService.get(org.orgTenantId)
    expect(profile.access.mode).toBe('unconfigured')
    expect(profile.access.ssiIdentity).toBe(true)
    expect(profile.requestTypes).toEqual([])
    expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'field_job'), 403, /setup questions/i)
  })

  test('answers suggest only matching work areas, with a plain reason, and open only those', () => {
    const org = seedOrganization({ setup: 'new' })
    const saved = configure(org.orgTenantId, ['field'])
    expect(saved.access.mode).toBe('explicit')
    expect(saved.modules).toEqual(['field_jobs'])
    expect(saved.access.suggestions).toEqual([{ id: 'field_jobs', reason: expect.stringMatching(/send people out/i) }])
    expect(saved.requestTypes).toEqual(['field_execution_fept'])

    expect(raise(org.orgTenantId, org.ownerUserId, 'field_job')).toBeTruthy()
    expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'internal_requisitions'), 403, /setup answers/i)
    expect(orgEntitlementService.hasModule(org.orgTenantId, 'field_jobs')).toBe(true)
    expect(orgEntitlementService.hasModule(org.orgTenantId, 'purchases')).toBe(false)
  })

  test('integration-only answers run no work areas here and reject selected modules', () => {
    const org = seedOrganization({ setup: 'new' })
    const saved = configure(org.orgTenantId, ['office'], 'integration', [])
    expect(saved.access.operatingModel).toBe('integration')
    expect(saved.access.suggestions).toEqual([])
    expect(saved.requestTypes).toEqual([])
    expect(saved.access.ssiIdentity).toBe(true)

    expectStatus(
      () => configure(org.orgTenantId, ['office'], 'integration', ['purchases']),
      400,
      /connect your own systems/i,
    )
  })

  test('a stale revision is rejected so two admins cannot overwrite each other', () => {
    const org = seedOrganization({ setup: 'new' })
    configure(org.orgTenantId, ['office'])
    expectStatus(
      () =>
        orgSetupProfileService.save(org.orgTenantId, {
          operatingModel: 'internal',
          kinds: ['shop'],
          modules: ['commerce'],
          expectedRevision: 0,
        }),
      409,
    )
  })

  test('disabling a work area lets existing work finish but denies new work', () => {
    const org = seedOrganization({ setup: 'new' })
    configure(org.orgTenantId, ['field'])
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO requests (id, organization_id, requester_person_id, request_type, title, status) VALUES (?, ?, ?, 'field_job', 'Open job', 'submitted')`,
      )
      .run(randomUUID(), org.organizationId, org.ownerPersonId)
    const saved = configure(org.orgTenantId, ['office'])
    expect(saved.modules).not.toContain('field_jobs')
    expect(saved.access.drainingWork).toEqual([
      expect.objectContaining({
        moduleId: 'field_jobs',
        activeRequests: 1,
        activeWorkflowRuns: 0,
      }),
    ])
    expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'field_job'), 403, /setup answers/i)
    expect(
      DatabaseManager.getDatabase().prepare('SELECT status FROM requests WHERE title = ?').get('Open job'),
    ).toEqual({
      status: 'submitted',
    })
  })

  test('an existing organisation keeps its finance work and kind-derived request types', () => {
    const org = seedOrganization()
    const profile = orgSetupProfileService.get(org.orgTenantId)
    expect(profile.access.mode).toBe('legacy')
    expect(profile.requestTypes).toEqual(
      expect.arrayContaining(['internal_requisitions', 'accounts_payable', 'payment_collection']),
    )
    expect(raise(org.orgTenantId, org.ownerUserId, 'internal_requisitions')).toBeTruthy()
  })

  test('a legacy save that only toggles staff tools does not treat always-on areas as removed', () => {
    const org = seedOrganization()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO requests (id, organization_id, requester_person_id, request_type, title, status) VALUES (?, ?, ?, 'internal_requisitions', 'Open', 'submitted')`,
      )
      .run(randomUUID(), org.organizationId, org.ownerPersonId)
    const saved = orgSetupProfileService.save(org.orgTenantId, { modules: [], expectedRevision: 0 })
    expect(saved.access.mode).toBe('legacy')
    expect(saved.modules).toEqual(expect.arrayContaining(['purchases', 'payables', 'collections']))
  })

  test('people and payroll still needs both the answer and the plan, even for existing organisations', () => {
    const org = seedOrganization()
    expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'hr.leave'), 403, /people and payroll/i)

    orgSetupProfileService.save(org.orgTenantId, { modules: ['people_payroll'], expectedRevision: 0 })
    const selected = orgSetupProfileService
      .get(org.orgTenantId)
      .access.modules.find((item) => item.id === 'people_payroll')
    expect(selected?.selected).toBe(true)
    if (!selected?.entitled) {
      expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'hr.leave'), 403, /plan/i)
      orgEntitlementService.setPlan(org.orgTenantId, { grantedModules: ['people_payroll'] })
    }
    expect(orgEntitlementService.hasModule(org.orgTenantId, 'people_payroll')).toBe(true)
  })

  test('settings skip the revision check, scope answers always need it (legacy too)', () => {
    const explicit = seedOrganization({ setup: 'new' })
    configure(explicit.orgTenantId, ['office'])
    expect(orgSetupProfileService.save(explicit.orgTenantId, { staffCardChange: 'stop_now' }).staffCardChange).toBe(
      'stop_now',
    )

    const legacy = seedOrganization()
    expectStatus(() => orgSetupProfileService.save(legacy.orgTenantId, { kinds: ['shop'], expectedRevision: 5 }), 409)
    expectStatus(() => orgSetupProfileService.save(legacy.orgTenantId, { kinds: ['shop'] }), 409)
    expect(orgSetupProfileService.save(legacy.orgTenantId, { kinds: ['shop'], expectedRevision: 0 }).kinds).toEqual([
      'shop',
    ])
  })

  test('instantiated catalogue workflows with a generic category are still gated by their work area', () => {
    const org = seedOrganization({ setup: 'new' })
    configure(org.orgTenantId, ['field'])
    const arWorkflow = { id: `tpl-ar-collections-${org.orgTenantId}-1700000000000`, category: 'finance' }
    const feptWorkflow = { id: `tpl-fept-field-execution-${org.orgTenantId}-1700000000000`, category: 'utilities' }
    expect(orgSetupProfileService.moduleForWorkflow(arWorkflow)).toBe('collections')
    expect(orgSetupProfileService.moduleForWorkflow(feptWorkflow)).toBe('field_jobs')
    expect(orgSetupProfileService.moduleForWorkflow({ id: 'tpl-employee-onboarding', category: 'hr' })).toBe(
      'people_payroll',
    )
    expectStatus(() => orgSetupProfileService.assertWorkflow(org.orgTenantId, arWorkflow), 403)
    expect(() => orgSetupProfileService.assertWorkflow(org.orgTenantId, feptWorkflow)).not.toThrow()
  })

  test('SSI identity stays a mandatory readiness item whatever the answers are', () => {
    const org = seedOrganization({ setup: 'new' })
    configure(org.orgTenantId, [], 'integration', [])
    const ssi = workflowReadinessService
      .evaluateOrganization(org.orgTenantId)
      .items.find((item) => item.key === 'ssi_identity')
    expect(ssi?.requirement).toBe('mandatory')
  })

  test('removal allows in-flight workflows to drain and reports active runs, not history', () => {
    for (const status of ['pending', 'running', 'paused', 'completed', 'cancelled', 'failed'] as const) {
      const org = seedOrganization({ setup: 'new' })
      configure(org.orgTenantId, ['field'])
      const id = `tpl-fept-field-execution-${org.orgTenantId}-1700000000000`
      workflowRepository.save({
        id,
        tenantId: org.orgTenantId,
        name: 'Field job',
        category: 'utilities',
        provider: 'test',
        description: '',
        inputSchema: {},
        actions: [{ id: 'original-step', type: 'test' }],
      })
      const run = workflowRunRepository.createRun({
        workflowId: id,
        tenantId: org.orgTenantId,
        status,
        actionsSnapshot: [{ id: 'original-step', type: 'test' }],
      })
      workflowRepository.save({
        id,
        tenantId: org.orgTenantId,
        name: 'Field job',
        category: 'utilities',
        provider: 'test',
        description: '',
        inputSchema: {},
        actions: [{ id: 'edited-step', type: 'test' }],
      })
      const saved = configure(org.orgTenantId, ['office'])
      expect(saved.modules).not.toContain('field_jobs')
      expect(saved.access.drainingWork).toEqual(
        ['pending', 'running', 'paused'].includes(status)
          ? [expect.objectContaining({ moduleId: 'field_jobs', activeWorkflowRuns: 1, activeRequests: 0 })]
          : [],
      )
      expect(workflowRunRepository.findRunById(run.id)?.status).toBe(status)
      expect(workflowRunRepository.findRunById(run.id)?.actionsSnapshot).toEqual([
        { id: 'original-step', type: 'test' },
      ])
    }
  })

  test('a chosen but unentitled module stays selected, but cannot be used', () => {
    const org = seedOrganization({ setup: 'new' })
    orgEntitlementService.setPlan(org.orgTenantId, { plan: 'free', grantedModules: [] })
    const profile = configure(org.orgTenantId, ['office'], 'internal', ['people_payroll'])
    expect(profile.access.modules.find((module) => module.id === 'people_payroll')).toMatchObject({
      selected: true,
      entitled: false,
      available: false,
    })
    expect(profile.requestTypes).toEqual([])
    expectStatus(() => raise(org.orgTenantId, org.ownerUserId, 'hr.leave'), 403, /plan/i)
    expectStatus(
      () =>
        orgSetupProfileService.assertWorkflow(org.orgTenantId, {
          id: `tpl-payslip-issuance-${org.orgTenantId}`,
          category: 'hr',
        }),
      403,
      /plan/i,
    )
    orgEntitlementService.setPlan(org.orgTenantId, { grantedModules: ['people_payroll'] })
    expect(orgSetupProfileService.get(org.orgTenantId).requestTypes).toEqual(['hr_requests'])
  })

  test('catalogue aliases, concrete instance IDs and meaningful custom categories agree', () => {
    for (const [operation, module] of [
      ['payment_collection', 'collections'],
      ['tpl-payment-collection', 'collections'],
      ['tpl-ar-collections-org-123', 'collections'],
      ['tpl-ap-payables-org-123', 'payables'],
      ['tpl-education-fee-org-123', 'school_fees'],
      ['tpl-delivery-escrow-org-123', 'commerce'],
      ['tpl-payroll-reporting-org-123', 'people_payroll'],
      ['internal_requisitions', 'purchases'],
      ['field-execution-fept', 'field_jobs'],
    ]) {
      expect(orgSetupProfileService.moduleForOperation(operation)).toBe(module)
    }
    expect(orgSetupProfileService.moduleForWorkflow({ id: 'custom', category: 'accounts_payable' })).toBe('payables')
    expect(orgSetupProfileService.moduleForWorkflow({ id: 'custom', category: 'finance' })).toBeUndefined()
    expect(orgSetupProfileService.moduleForOperation('tpl-ar-collection')).toBeUndefined()
  })
})

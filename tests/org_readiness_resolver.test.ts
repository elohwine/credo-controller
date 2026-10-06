/**
 * Org readiness replaces workflow activation.
 *
 * These tests exercise the single readiness resolver (WorkflowReadinessService)
 * against a real SQLite database: an owner-only organization is missing items,
 * and adding roles / members / payment services flips them to ready without any
 * `enabled` flag or sector activation.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { workflowReadinessService } from '../src/services/WorkflowReadinessService'

import {
  addMember,
  addPaymentService,
  addRole,
  addTrustAnchor,
  configureFeptTemplate,
  configurePaymentCollectionTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-readiness-resolver-')
})

afterAll(() => {
  databases.cleanup()
})

function itemByKey(items: Array<{ key: string; status: string }>, key: string) {
  return items.find((item) => item.key === key)
}

describe('WorkflowReadinessService — owner-only organization', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Owner Only Ltd' })
    configureFeptTemplate(org.orgTenantId)
  })

  test('core items derived from org facts, not from an enabled flag', () => {
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')

    expect(report.configured).toBe(true)
    expect(report.workflowType).toBe('field_execution_fept')
    expect(itemByKey(report.items, 'organization_profile')?.status).toBe('ready')
    expect(itemByKey(report.items, 'primary_admin')?.status).toBe('ready')
    expect(itemByKey(report.items, 'active_members')?.status).toBe('ready')
    expect(itemByKey(report.items, 'ssi_identity')?.status).toBe('ready')
  })

  test('is not operational while roles are missing; who goes out is asked on the first job', () => {
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')

    expect(report.ready).toBe(false)
    const blockingKeys = report.blocking.map((item) => item.key)
    expect(blockingKeys).toContain('roles')
    expect(blockingKeys).not.toContain('stage_actor:assign_field_worker')
    expect(itemByKey(report.items, 'stage_actor:assign_field_worker')?.status).toBe('optional')
    expect(itemByKey(report.items, 'stage_actor:assign_field_worker')?.askedOnFirstUse).toBe(true)

    // Payout prerequisites only apply when the template has payment modes configured.
    expect(blockingKeys).not.toContain('payment_provider')
    expect(blockingKeys).not.toContain('stage_actor:trigger_payout')

    // Recommended actors never block; they surface as optional when the owner would be used.
    expect(itemByKey(report.items, 'stage_actor:acknowledge_execution')?.status).toBe('optional')
  })

  test('adding a role makes jobs operational; the field worker is not required first', () => {
    addRole(org.organizationId, 'Field Worker')
    let report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')
    expect(itemByKey(report.items, 'roles')?.status).toBe('ready')
    expect(report.ready).toBe(true)
    expect(itemByKey(report.items, 'stage_actor:assign_field_worker')?.askedOnFirstUse).toBe(true)

    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'field_worker' })
    report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'field_execution_fept')
    expect(itemByKey(report.items, 'stage_actor:assign_field_worker')?.status).toBe('ready')
    expect(report.ready).toBe(true)
    expect(report.blocking).toHaveLength(0)
  })

  test('assertExecutable throws a WorkflowPrerequisitesError carrying the report when blocked', () => {
    const blocked = seedOrganization({ name: 'Blocked Ltd' })
    configureFeptTemplate(blocked.orgTenantId)

    expect(() => workflowReadinessService.assertExecutable(blocked.orgTenantId, 'field_execution_fept')).toThrow(
      /not operational/,
    )
    try {
      workflowReadinessService.assertExecutable(blocked.orgTenantId, 'field_execution_fept')
    } catch (error: any) {
      expect(error.code).toBe('WORKFLOW_PREREQUISITES_MISSING')
      expect(error.report.blocking.map((item: { key: string }) => item.key)).toContain('roles')
    }
  })
})

describe('WorkflowReadinessService — finance template prerequisites', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Collections Ltd' })
    addRole(org.organizationId, 'Cashier')
    configurePaymentCollectionTemplate(org.orgTenantId)
  })

  test('payment collection is blocked until a payment provider service exists', () => {
    let report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'tpl-payment-collection')
    expect(report.configured).toBe(true)
    expect(report.ready).toBe(false)
    expect(report.blocking.map((item) => item.key)).toEqual(['payment_provider'])
    expect(itemByKey(report.items, 'payment_provider')?.actionPath).toBe('/organization/integrations')

    addPaymentService(org.orgTenantId)
    report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'tpl-payment-collection')
    expect(report.ready).toBe(true)
  })

  test('unconfigured templates still resolve prerequisites from the registry', () => {
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'internal_requisitions')
    expect(report.configured).toBe(false)
    expect(report.items.map((item) => item.key)).toEqual(
      expect.arrayContaining(['authorities', 'departments', 'stage_actor:approve_requisition']),
    )
  })
})

describe('WorkflowReadinessService — organization-wide evaluation', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Multi Workflow Ltd' })
    configureFeptTemplate(org.orgTenantId, { paymentModes: ['ecocash'] })
    configurePaymentCollectionTemplate(org.orgTenantId)
  })

  test('shared prerequisites list every workflow that requires them', () => {
    const evaluation = workflowReadinessService.evaluateOrganization(org.orgTenantId)

    expect(evaluation.templates.map((report) => report.workflowType)).toEqual(
      expect.arrayContaining(['field_execution_fept', 'collect_payments', 'internal_requisitions']),
    )
    expect(evaluation.templates.find((report) => report.workflowType === 'internal_requisitions')?.configured).toBe(false)
    const paymentProvider = itemByKey(evaluation.items, 'payment_provider') as any
    expect(paymentProvider?.status).toBe('needs_attention')
    expect(paymentProvider?.requiredFor).toEqual(expect.arrayContaining(['field_execution_fept', 'collect_payments']))

    const payoutActor = itemByKey(evaluation.items, 'stage_actor:trigger_payout') as any
    expect(payoutActor?.requiredFor).toEqual(['field_execution_fept'])
  })

  test('pending trust anchor surfaces as pending_external and still blocks', () => {
    const trustOrg = seedOrganization({ name: 'Awaiting Trust Ltd' })
    addRole(trustOrg.organizationId, 'Field Worker')
    addMember({ orgTenantId: trustOrg.orgTenantId, organizationId: trustOrg.organizationId, role: 'field_worker' })
    configureFeptTemplate(trustOrg.orgTenantId, { evidencePolicy: { requireApproval: true } })
    addTrustAnchor(trustOrg.organizationId, 'pending')

    const report = workflowReadinessService.evaluateTemplate(trustOrg.orgTenantId, 'field_execution_fept')
    const trusted = itemByKey(report.items, 'trusted_issuers')
    expect(trusted?.status).toBe('pending_external')
    expect(report.ready).toBe(false)
    expect(report.blocking.map((item) => item.key)).toEqual(['trusted_issuers'])

    addTrustAnchor(trustOrg.organizationId, 'active')
    expect(workflowReadinessService.evaluateTemplate(trustOrg.orgTenantId, 'field_execution_fept').ready).toBe(true)
  })
})

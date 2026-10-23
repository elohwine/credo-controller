/**
 * Org structure never holds work back, and the setup answers bootstrap the whole structure.
 *
 * - Every organisation gets a "General" department; departments and named approval limits
 *   refine routing but never block a request.
 * - One bootstrap call (with a dry-run preview) turns the setup answers into teams, roles,
 *   money people and a payment method, reusing the services that own each part.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { suggestedDepartmentsFor } from '../src/config/orgStructure'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { applyOrgSetupBootstrap, type OrgSetupBootstrapRequest } from '../src/services/OrgSetupBootstrap'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { ensureDefaultDepartment, ensureDepartments, planDepartments } from '../src/services/OrgStarterDepartments'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

// OrganizationService adds only the admin check and its own profile follow-ups around this.
function bootstrap(org: { orgTenantId: string; organizationId: string }, input: OrgSetupBootstrapRequest) {
  return applyOrgSetupBootstrap(org.orgTenantId, org.organizationId, input, {
    saveProfile: async (answers) => orgSetupProfileService.save(org.orgTenantId, answers),
  })
}

beforeAll(() => {
  databases = initTestDatabases('credo-org-structure-')
})

afterAll(() => {
  databases.cleanup()
})

function activeDepartments(organizationId: string): string[] {
  return (
    DatabaseManager.getDatabase()
      .prepare(`SELECT name FROM departments WHERE organization_id = ? AND status = 'active' ORDER BY created_at`)
      .all(organizationId) as Array<{ name: string }>
  ).map((row) => row.name)
}

function roleSlugs(organizationId: string): string[] {
  return (
    DatabaseManager.getDatabase()
      .prepare(`SELECT membership_role FROM roles WHERE organization_id = ?`)
      .all(organizationId) as Array<{ membership_role: string }>
  ).map((row) => row.membership_role)
}

describe('Org structure defaults', () => {
  test('requisitions are not blocked by missing departments or approval limits', () => {
    const org = seedOrganization({ name: 'No Structure Ltd' })
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'internal_requisitions')
    const blocking = report.blocking.map((item) => item.key)
    expect(blocking).not.toContain('departments')
    expect(blocking).not.toContain('authorities')
    // Reading readiness gave the organisation its default team.
    expect(activeDepartments(org.organizationId)).toEqual(['General'])
    expect(report.items.find((item) => item.key === 'departments')?.status).toBe('ready')
  })

  test('the default is created once and never brought back after the owner archives it', () => {
    const org = seedOrganization({ name: 'Archived Teams Ltd' })
    expect(ensureDefaultDepartment(org.organizationId)).toBe(true)
    expect(ensureDefaultDepartment(org.organizationId)).toBe(false)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE departments SET status = 'archived' WHERE organization_id = ?`)
      .run(org.organizationId)
    expect(ensureDefaultDepartment(org.organizationId)).toBe(false)
    expect(activeDepartments(org.organizationId)).toEqual([])
    // Still not a blocker: the item is only a recommendation.
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'internal_requisitions')
    expect(report.blocking.map((item) => item.key)).not.toContain('departments')
  })

  test('naming teams adds missing ones, restores archived ones and leaves the rest', () => {
    const org = seedOrganization({ name: 'Named Teams Ltd' })
    ensureDepartments(org.organizationId, ['Finance'])
    DatabaseManager.getDatabase()
      .prepare(`UPDATE departments SET status = 'archived' WHERE organization_id = ? AND name = 'Finance'`)
      .run(org.organizationId)
    ensureDepartments(org.organizationId, ['Sales'])
    expect(planDepartments(org.organizationId, [' finance ', 'Sales', 'sales', '', 'Field operations'])).toEqual([
      { name: 'Sales', status: 'existing' },
      { name: 'Finance', status: 'restored' },
      { name: 'Field operations', status: 'new' },
    ])
    ensureDepartments(org.organizationId, ['finance', 'Field operations'])
    expect(activeDepartments(org.organizationId).sort()).toEqual(['Field operations', 'Finance', 'Sales'])
  })

  test('suggested teams follow the answers', () => {
    expect(suggestedDepartmentsFor({ kinds: ['office'], modules: [] })).toEqual(['General'])
    expect(
      suggestedDepartmentsFor({
        kinds: ['field', 'shop'],
        modules: ['payables', 'people_payroll'],
        approvalPresetId: 'owner_handles_money',
      }),
    ).toEqual(['General', 'Field operations', 'Sales', 'Finance', 'HR'])
  })
})

describe('Setup bootstrap', () => {
  const answers = (revision: number) => ({
    operatingModel: 'internal' as const,
    expectedRevision: revision,
    kinds: ['office', 'field'],
    modules: ['purchases', 'payables', 'field_jobs'],
    departments: ['General', 'Field operations', 'Finance'],
    moneyPresetId: 'finance_team',
    paymentChoice: 'simulated',
  })

  test('a dry run previews the structure and saves nothing', async () => {
    const org = seedOrganization({ name: 'Preview Ltd', setup: 'new' })
    const before = orgSetupProfileService.get(org.orgTenantId)
    const plan = await bootstrap(org, {
      ...answers(before.access.revision),
      dryRun: true,
    })

    expect(plan.applied).toBe(false)
    expect(plan.departments.map((item) => [item.name, item.status])).toEqual([
      ['General', 'new'],
      ['Field operations', 'new'],
      ['Finance', 'new'],
    ])
    expect(plan.roles.filter((role) => role.status === 'new').map((role) => role.membershipRole)).toEqual(
      expect.arrayContaining(['field_worker', 'supervisor', 'manager', 'finance_manager', 'director']),
    )
    expect(plan.money).toMatchObject({
      keepCurrent: false,
      presetId: 'finance_team',
      approves: 'Manager',
      financeConfirms: 'Finance officer',
      releases: 'Director',
    })
    expect(plan.workAreas.map((area) => area.id)).toEqual(['purchases', 'payables', 'field_jobs'])
    expect(plan.payment).toEqual({ method: 'simulated', name: 'Simulated pay' })
    expect(plan.askedOnFirstUse).toHaveLength(1)

    // Nothing written.
    expect(orgSetupProfileService.get(org.orgTenantId).access.mode).toBe('unconfigured')
    expect(activeDepartments(org.organizationId)).toEqual([])
    expect(roleSlugs(org.organizationId)).not.toContain('director')
  })

  test('applying sets up answers, teams, roles, money people and payments in one call; repeating is safe', async () => {
    const org = seedOrganization({ name: 'Bootstrap Ltd', setup: 'new' })
    const result = await bootstrap(org, answers(orgSetupProfileService.get(org.orgTenantId).access.revision))

    expect(result.applied).toBe(true)
    expect(result.profile?.access.mode).toBe('explicit')
    expect(result.profile?.approvalPresetId).toBe('finance_team')
    expect(result.profile?.approvalTitle).toBe('Manager, then finance')
    expect(activeDepartments(org.organizationId)).toEqual(['General', 'Field operations', 'Finance'])
    expect(roleSlugs(org.organizationId)).toEqual(
      expect.arrayContaining(['owner', 'field_worker', 'supervisor', 'manager', 'finance_manager', 'director']),
    )
    const directorUserId = `director-${org.orgTenantId}`
    addMember({ ...org, userId: directorUserId, role: 'director' })
    const release = orgWorkflowActorService.resolveActor({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'release_funds',
    })
    expect(release).toMatchObject({ role: 'director', userId: directorUserId })

    const requisitions = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'internal_requisitions')
    expect(requisitions.blocking.map((item) => item.key)).not.toEqual(
      expect.arrayContaining(['departments', 'authorities']),
    )

    const again = await bootstrap(org, {
      ...answers(result.profile!.access.revision),
      dryRun: true,
    })
    expect(again.departments.every((item) => item.status === 'existing')).toBe(true)
    expect(again.roles.every((role) => role.status === 'existing')).toBe(true)
  })

  test('keep_current leaves Who does what alone and unknown choices are refused before writing', async () => {
    const org = seedOrganization({ name: 'Keep Ltd', setup: 'new' })
    const revision = orgSetupProfileService.get(org.orgTenantId).access.revision
    await expect(
      bootstrap(org, {
        ...answers(revision),
        moneyPresetId: 'everyone_pays',
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      bootstrap(org, {
        ...answers(revision),
        paymentChoice: 'barter',
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(orgSetupProfileService.get(org.orgTenantId).access.mode).toBe('unconfigured')

    const result = await bootstrap(org, {
      ...answers(revision),
      moneyPresetId: 'keep_current',
      departments: [],
    })
    expect(result.money.keepCurrent).toBe(true)
    expect(result.profile?.approvalPresetId).toBeUndefined()
    expect(activeDepartments(org.organizationId)).toEqual(['General'])
  })
})

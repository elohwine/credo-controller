/**
 * Payroll belongs to one organisation: a signed-in owner or pay role with People & payroll switched
 * on sees only that organisation's staff and runs, and a run is paid once.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { PayrollController } from '../src/controllers/finance/PayrollController'
import { orgEntitlementService } from '../src/services/OrgEntitlementService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { payoutService } from '../src/services/PayoutService'
import { DatabaseManager } from '../src/persistence/DatabaseManager'

import { initTestDatabases, seedOrganization, type SeededOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
let shop: SeededOrganization
let rival: SeededOrganization

function asUser(tenantId: string, orgRole: string, headers: Record<string, string> = {}): any {
  return { user: { tenantId, orgRole, id: `user-${orgRole}` }, headers }
}

function switchOnPayroll(orgTenantId: string) {
  orgEntitlementService.setPlan(orgTenantId, { grantedModules: ['people_payroll'] })
  orgSetupProfileService.save(orgTenantId, { modules: ['people_payroll'], expectedRevision: 0 })
}

beforeAll(() => {
  databases = initTestDatabases('credo-payroll-access-')
  shop = seedOrganization({ name: 'Payroll Shop' })
  rival = seedOrganization({ name: 'Other Shop' })
  switchOnPayroll(shop.orgTenantId)
  switchOnPayroll(rival.orgTenantId)
})

afterAll(() => {
  databases.cleanup()
})

describe('Payroll access', () => {
  const controller = new PayrollController()

  test('no organisation, wrong role, or People & payroll switched off: refused in plain words', async () => {
    await expect(controller.listEmployees({ user: undefined, headers: {} } as any)).rejects.toMatchObject({ status: 401 })
    await expect(controller.listEmployees(asUser(shop.orgTenantId, 'field_worker'))).rejects.toThrow(
      'Only an owner, admin, HR or finance manager can run payroll.',
    )
    // In this edition People & payroll is always on, so an organisation that never ticked it still has it.
    const plain = seedOrganization({ name: 'Never Ticked Co' })
    // The owner is on the team, so the list is the owner's own record and nobody else.
    const people = await controller.listEmployees(asUser(plain.orgTenantId, 'owner'))
    expect(people).toHaveLength(1)
    expect(people[0]).toMatchObject({ tenantId: plain.orgTenantId, baseSalary: 0 })
    // The plan is what can still switch it off.
    const off = seedOrganization({ name: 'No Payroll Co' })
    orgEntitlementService.setPlan(off.orgTenantId, { plan: 'free', grantedModules: [] })
    await expect(controller.listEmployees(asUser(off.orgTenantId, 'owner'))).rejects.toThrow(
      /has not switched on People & payroll/,
    )
  })

  test("each organisation sees only its own staff and runs", async () => {
    await controller.saveEmployee(asUser(shop.orgTenantId, 'hr_manager'), {
      firstName: 'Tendai',
      lastName: 'Ncube',
      baseSalary: 500,
    })
    await controller.saveEmployee(asUser(rival.orgTenantId, 'owner'), { firstName: 'Other', lastName: 'Person', baseSalary: 400 })

    const mine = await controller.listEmployees(asUser(shop.orgTenantId, 'accountant'))
    // Tendai, plus the owner, who is on the team and so has a record with no salary yet.
    expect(mine.map((e) => e.firstName)).toContain('Tendai')
    expect(mine.map((e) => e.firstName)).not.toContain('Other')
    expect(mine.every((e) => e.tenantId === shop.orgTenantId)).toBe(true)
    expect(mine.filter((e) => e.firstName !== 'Tendai').every((e) => e.baseSalary === 0 && e.userId)).toBe(true)

    const run = await controller.createRun(asUser(shop.orgTenantId, 'finance_manager'), { period: '2026-10' })
    expect(run.tenantId).toBe(shop.orgTenantId)
    expect((await controller.listRuns(asUser(rival.orgTenantId, 'owner'))).map((r) => r.id)).not.toContain(run.id)
    await expect(controller.getRunDetails(asUser(rival.orgTenantId, 'owner'), run.id)).rejects.toMatchObject({ status: 404 })
    await expect(controller.createRun(asUser(shop.orgTenantId, 'owner'), { period: 'October' })).rejects.toThrow(
      'Choose a month as YYYY-MM.',
    )
  })

  test('a run is paid only after its payslips are issued, and only once', async () => {
    const owner = asUser(shop.orgTenantId, 'owner')
    const run = await controller.createRun(owner, { period: '2026-11' })
    await expect(controller.processPayout(owner, run.id)).rejects.toThrow('Issue the payslips for this run before paying it.')

    DatabaseManager.getDatabase().prepare(`UPDATE payroll_runs SET status = 'completed' WHERE id = ?`).run(run.id)
    const pay = jest.spyOn(payoutService, 'processRunPayout')
    const first = await controller.processPayout(owner, run.id)
    const again = await controller.processPayout(owner, run.id)
    expect(again).toEqual(first)
    expect(pay).toHaveBeenCalledTimes(1)
    pay.mockRestore()
  })
})

import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { PayrollService } from '../PayrollService'

function migration(file: string): string {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8')
}

describe('employee qualifications', () => {
  let db: Database.Database
  let restore: { mockRestore: () => void }
  const service = new PayrollService()

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(migration('009_create_payroll.sql'))
    db.exec(migration('153_employee_staff_link.sql'))
    db.exec('ALTER TABLE employees ADD COLUMN branch TEXT; ALTER TABLE employees ADD COLUMN legacy_username TEXT')
    db.exec(migration('160_employee_qualifications.sql'))
    db.exec(migration('164_employee_intended_role.sql'))
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db)
  })

  afterEach(() => {
    restore.mockRestore()
    db.close()
  })

  it('saves expiry dates and preserves qualifications during unrelated employee updates', async () => {
    const saved = await service.saveEmployee({
      tenantId: 'org-sgk',
      firstName: 'Tariro',
      lastName: 'Moyo',
      baseSalary: 0,
      qualifications: [{ name: 'First Aid', expiresAt: '2027-04-30', issuer: 'Red Cross' }],
    })

    const updated = await service.saveEmployee({
      id: saved.id,
      tenantId: 'org-sgk',
      firstName: 'Tariro',
      lastName: 'Moyo',
      baseSalary: 0,
      skills: ['Electrical'],
    })

    expect(updated.qualifications).toEqual([{ name: 'First Aid', expiresAt: '2027-04-30', issuer: 'Red Cross' }])
    expect(updated.skills).toEqual(['Electrical'])
  })

  it('gives the next staff number to anyone added without one, and keeps it on later saves', async () => {
    db.exec(`CREATE TABLE organizations (tenant_id TEXT, name TEXT); INSERT INTO organizations VALUES ('org-sgk', 'SGK Construction')`)
    db.prepare(
      `INSERT INTO employees (id, tenant_id, first_name, last_name, base_salary, currency, status, staff_number, created_at)
       VALUES ('old-1', 'org-sgk', 'Old', 'Hand', 0, 'GBP', 'active', NULL, '2020-01-01'), ('old-2', 'org-sgk', 'Kept', 'Number', 0, 'GBP', 'active', 'SGK007', '2020-01-02')`,
    ).run()

    const added = await service.saveEmployee({ tenantId: 'org-sgk', firstName: 'New', lastName: 'Starter', baseSalary: 0 })
    expect(added.staffNumber).toBe('SGK008')
    const resaved = await service.saveEmployee({ id: added.id, tenantId: 'org-sgk', firstName: 'New', lastName: 'Starter', baseSalary: 0 })
    expect(resaved.staffNumber).toBe('SGK008')

    const everyone = await service.listEmployees('org-sgk')
    expect(everyone.find((e) => e.id === 'old-1')?.staffNumber).toBe('SGK009')
  })

  it('rejects invalid expiry dates instead of saving an untrackable qualification', async () => {
    await expect(
      service.saveEmployee({
        tenantId: 'org-sgk',
        firstName: 'Tariro',
        lastName: 'Moyo',
        baseSalary: 0,
        qualifications: [{ name: 'First Aid', expiresAt: '2027-02-31' }],
      }),
    ).rejects.toThrow('valid YYYY-MM-DD')
  })
})

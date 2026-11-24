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
    db.exec(migration('160_employee_qualifications.sql'))
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

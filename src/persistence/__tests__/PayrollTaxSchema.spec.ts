import fs from 'fs'
import os from 'os'
import path from 'path'

import { DatabaseManager } from '../DatabaseManager'

describe('payroll tax schema', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-tax-'))

  afterAll(() => {
    DatabaseManager.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates tax filings and the pay period tax columns that share migration version 13', () => {
    const db = DatabaseManager.initialize({ path: path.join(tempDir, 'test.db') })

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tax_compliance'").all()
    expect(tables).toHaveLength(1)

    const columns = (db.prepare('PRAGMA table_info(payroll_runs)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(columns).toEqual(
      expect.arrayContaining(['total_nssa', 'total_paye', 'total_aids_levy', 'run_vc_id', 'run_vc_offer_uri']),
    )
  })
})

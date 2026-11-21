import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { findContactByStoreNumber, listContacts } from '../../persistence/ContactRepository'
import { FieldDataImportService, importDate, importPhone } from '../FieldDataImportService'
import { JobRegisterService } from '../JobRegisterService'
import { OrganizationService } from '../OrganizationService'

const ORG = 'org-sgk'
const OWNER = 'user-owner'

function migration(file: string): string {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8')
}

describe('Importing stores, jobs, vans and rates from a file the old system exported', () => {
  let db: Database.Database
  const restores: Array<{ mockRestore: () => void }> = []
  const importer = new FieldDataImportService()
  const register = new JobRegisterService()

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (id TEXT, phone_hash TEXT, email_hash TEXT);
      CREATE TABLE org_contacts (
        id TEXT PRIMARY KEY, org_tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, did TEXT,
        notes TEXT, created_at TEXT, updated_at TEXT, wallet_tenant_id TEXT, linked_at TEXT, link_token TEXT,
        link_token_expires_at TEXT, contact_scope TEXT
      );
      CREATE TABLE workflows (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, category TEXT);
      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY, workflow_id TEXT, tenant_id TEXT, status TEXT, input TEXT, output TEXT, error TEXT,
        trigger_type TEXT, trigger_ref TEXT, actions_snapshot TEXT, current_step INTEGER, total_steps INTEGER,
        started_at TEXT, completed_at TEXT, created_at TEXT
      );
      CREATE TABLE payment_links (
        id TEXT PRIMARY KEY, merchant_id TEXT, description TEXT, amount REAL, currency TEXT, invoice_ref TEXT,
        status TEXT, metadata TEXT, created_at TEXT, shortlink_url TEXT
      );
      CREATE TABLE organizations (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT);
      CREATE TABLE organization_registry (tenant_id TEXT, display_name TEXT);
    `)
    db.exec(migration('009_create_payroll.sql'))
    db.exec(migration('129_job_intake.sql'))
    db.exec(migration('152_stores_staff_vans_mail_intake.sql'))
    db.exec(migration('153_employee_staff_link.sql'))
    db.exec(migration('155_job_mail_checks_rates_links.sql'))
    db.exec(migration('156_job_history_imports.sql'))
    restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
    restores.push(jest.spyOn(OrganizationService.prototype, 'listOrgMembers').mockReturnValue([] as any))
  })

  afterEach(() => {
    while (restores.length) restores.pop()!.mockRestore()
    db.close()
  })

  it('reads the dates and phone numbers a spreadsheet writes', () => {
    expect(importDate('21/11/2026')).toBe('2026-11-21')
    expect(importDate('2026-11-21 08:30')).toBe('2026-11-21')
    expect(importDate('3-Mar-2026')).toBe('2026-03-03')
    expect(importDate('3 March 2026')).toBe('2026-03-03')
    expect(importDate('')).toBe('')
    expect(importDate('31/02/2026')).toBeNull()
    expect(importDate('soon')).toBeNull()
    expect(importPhone('0772 123 456')).toBe('+263772123456')
    expect(importPhone('+263 77 212 3456')).toBe('+263772123456')
    expect(importPhone('')).toBe('')
    expect(importPhone('123')).toBeNull()
  })

  it('saves stores and clients as outside contacts with one contact per store number', () => {
    const csv = [
      '\uFEFFStore No,Store Name,Cell,E-mail,Address,Address,Contact Person',
      '"Store #1042","Greendale Spar, Main Rd",0772123456,greendale@example.com,12 Main Rd,Harare,Tendai',
      '2001,Borrowdale Pharmacy,,,,,',
      'STORE 1042,Duplicate of the first,0772000000,,,,',
      ',,,,,,',
      '3003,,,not-an-email,,,',
      ',Walk-in Client,0771999888,,,,',
      ',Walk-in Client,0771999888,,,,',
      '4004,Short Phone,123,,,,',
    ].join('\r\n')

    const preview = importer.preview(ORG, 'stores', csv)
    expect(preview.counts).toMatchObject({ total: 7, new: 3, exists: 1, problem: 3 })
    expect(preview.understood.map((entry) => entry.meaning)).toEqual(
      expect.arrayContaining(['Store number', 'Name', 'Phone', 'Email', 'Address (kept in notes)']),
    )
    expect(listContacts(ORG, 'external')).toHaveLength(0)

    const result = importer.commit(ORG, OWNER, 'stores', csv)
    expect(result).toMatchObject({ added: 3, alreadyThere: 1, problems: 3 })
    const greendale = findContactByStoreNumber(ORG, '1042')!
    expect(greendale).toMatchObject({
      name: 'Greendale Spar, Main Rd',
      phone: '+263772123456',
      email: 'greendale@example.com',
      contactScope: 'external',
    })
    expect(greendale.notes).toContain('Address: 12 Main Rd, Harare')
    expect(greendale.notes).toContain('Contact: Tendai')
    expect(findContactByStoreNumber(ORG, '2001')!.phone).toBeUndefined()
    expect(result.rows.find((row) => row.summary.includes('Store 3003'))!.problem).toMatch(/not an email/)
    expect(result.rows.find((row) => /already on row/.test(row.problem || ''))).toBeTruthy()
    expect(listContacts(ORG, 'external')).toHaveLength(3)

    // Same file again: nothing new, nothing doubled.
    const again = importer.commit(ORG, OWNER, 'stores', csv)
    expect(again.added).toBe(0)
    expect(listContacts(ORG, 'external')).toHaveLength(3)
    // The store with no phone says why a bill cannot reach it.
    expect(preview.rows.find((row) => row.summary.includes('2001'))!.note).toMatch(/cannot be texted/)
  })

  it('keeps stores of one organisation apart from another', () => {
    importer.commit(ORG, OWNER, 'stores', 'Store Number,Name\n1042,Greendale')
    const other = importer.commit('org-other', OWNER, 'stores', 'Store Number,Name\n1042,Somewhere Else')
    expect(other.added).toBe(1)
    expect(findContactByStoreNumber(ORG, '1042')!.name).toBe('Greendale')
    expect(findContactByStoreNumber('org-other', '1042')!.name).toBe('Somewhere Else')
  })

  it('puts open jobs in the waiting list and finished jobs in history, and never books or bills history', () => {
    importer.commit(ORG, OWNER, 'stores', 'Store Number,Name,Phone\n1042,Greendale Spar,0772123456')
    const csv = [
      'Job No,Job Description,Customer Number,Status,Scheduled Date,Completed Date,Technician,Price,PO No',
      'J-100,Replace door closer,1042,Assigned,24/11/2026,,Farai Ncube,$85.50,PO-77',
      'J-101,Fix fridge door,1042,Completed,01/11/2026,03/11/2026,Farai Ncube,"1,200.00",',
      'J-102,Paint wall,1042,Cancelled,05/11/2026,,,,',
      'J-103,Unknown store job,9999,Open,,,,,',
      'J-104,Signed off without a status,1042,,02/11/2026,04/11/2026,,,',
      'J-105,Bad date,1042,Open,someday,,,,',
      ',No number,1042,Open,,,,,',
      'J-106,,1042,Open,,,,,',
      'J-107,Bad amount,1042,Open,,,,lots,',
    ].join('\n')

    const preview = importer.preview(ORG, 'jobs', csv)
    expect(preview.counts).toMatchObject({ total: 9, new: 5, problem: 4, waiting: 2, history: 3 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_intakes').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_history').get()).toEqual({ n: 0 })

    const result = importer.commit(ORG, OWNER, 'jobs', csv)
    expect(result).toMatchObject({ added: 5, waiting: 2, history: 3, problems: 4 })

    // Open jobs wait to be booked, with the store's phone so the bill can reach the client.
    const intakes = db.prepare('SELECT payload_json AS p FROM job_intakes ORDER BY created_at').all() as Array<{ p: string }>
    expect(intakes).toHaveLength(2)
    const door = intakes.map((row) => JSON.parse(row.p)).find((payload) => payload.reference === 'J-100')
    expect(door).toMatchObject({
      sourceType: 'import',
      storeNumber: '1042',
      clientName: 'Greendale Spar',
      clientPhone: '+263772123456',
      amount: 85.5,
      poNumber: 'PO-77',
      scheduledDate: '2026-11-24',
      importedWorkerName: 'Farai Ncube',
    })
    // History starts no job, no bill and no payout.
    expect(db.prepare('SELECT COUNT(*) AS n FROM workflow_runs').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM payment_links').get()).toEqual({ n: 0 })
    const unknown = result.rows.find((row) => row.summary.startsWith('J-103'))!
    expect(unknown.note).toMatch(/Store 9999 is not saved yet/)

    const rows = register.rows(ORG)
    const byRef = new Map(rows.map((row) => [row.reference, row]))
    expect(byRef.get('J-100')).toMatchObject({ kind: 'intake', source: 'import', category: 'not_booked' })
    expect(byRef.get('J-101')).toMatchObject({
      kind: 'history',
      source: 'import',
      category: 'completed',
      workerName: 'Farai Ncube',
      amount: 1200,
      completedAt: '2026-11-03',
    })
    expect(byRef.get('J-102')).toMatchObject({ kind: 'history', category: 'cancelled' })
    expect(byRef.get('J-104')).toMatchObject({ kind: 'history', category: 'completed' })
    expect(register.rows(ORG, { source: 'import' })).toHaveLength(5)
    expect(register.rows(ORG, { source: 'email' })).toHaveLength(0)
    expect(register.rows(ORG, { category: 'completed' }).map((row) => row.reference).sort()).toEqual(['J-101', 'J-104'])
    expect(register.rows(ORG, { storeNumber: '1042' })).toHaveLength(4)
    // The date range reads the booked day, as it does for every job.
    expect(register.rows(ORG, { from: '2026-11-01', to: '2026-11-01' }).map((row) => row.reference)).toEqual(['J-101'])
    // A worker filter means a team member, so history (a name only) stays out of it.
    expect(register.rows(ORG, { assigneeId: OWNER })).toHaveLength(0)
    expect(register.csv(ORG)).toContain('Farai Ncube')
    // Imported jobs do not distort the average days to finish.
    expect(register.report(ORG).averageDaysToComplete).toBeUndefined()
    expect(register.report(ORG).bySource).toEqual([{ source: 'import', label: 'Imported from a file', count: 5 }])

    // The same file again: nothing is added, nothing is doubled.
    const again = importer.commit(ORG, OWNER, 'jobs', csv)
    expect(again).toMatchObject({ added: 0, waiting: 0, history: 0 })
    expect(again.alreadyThere).toBe(5)
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_intakes').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM job_history').get()).toEqual({ n: 3 })
  })

  it('finds the store from its name when the jobs file has no store number', () => {
    importer.commit(ORG, OWNER, 'stores', 'Store Number,Name,Phone\n1042,Greendale Spar,0772123456')
    importer.commit(ORG, OWNER, 'jobs', 'Reference,Description,Customer\nJ-1,Leaking tap,Greendale Spar')
    const payload = JSON.parse((db.prepare('SELECT payload_json AS p FROM job_intakes').get() as { p: string }).p)
    expect(payload).toMatchObject({ storeNumber: '1042', clientName: 'Greendale Spar', clientPhone: '+263772123456' })
  })

  it('accepts a JSON list and refuses a file that has not got what a kind needs', () => {
    const json = JSON.stringify([{ Registration: 'ae 1234', Make: 'Toyota', Model: 'Hiace', 'Service Day': 'Monday', 'MOT Due': '30/06/2027' }])
    const result = importer.commit(ORG, OWNER, 'vans', json)
    expect(result.added).toBe(1)
    const van = db.prepare('SELECT registration, description, service_day AS d, mot_due AS m FROM org_vans').get() as any
    expect(van).toEqual({ registration: 'AE 1234', description: 'Toyota, Hiace', d: 'monday', m: '2027-06-30' })

    const preview = importer.preview(ORG, 'jobs', 'Foo,Bar\n1,2')
    expect(preview.missing).toEqual(expect.arrayContaining(['job number', 'what the job is']))
    expect(preview.ignored).toEqual(['Foo', 'Bar'])
    expect(() => importer.commit(ORG, OWNER, 'jobs', 'Foo,Bar\n1,2')).toThrow(/no job number/)
    expect(() => importer.preview(ORG, 'jobs', '')).toThrow(/empty/)
    expect(() => importer.preview(ORG, 'jobs', 'Job No,Description')).toThrow(/header row and at least one row/)
    expect(() => importer.preview(ORG, 'jobs', '[1,2]')).toThrow(/list of records/)
  })

  it('adds vans once and says which rows are wrong', () => {
    const csv = [
      'Reg,Make,Day,MOT',
      'AB 111,Isuzu,Tuesday,01/01/2027',
      'AB 111,Isuzu again,,',
      'AB 222,Nissan,Funday,',
      'AB 333,Ford,,not a date',
      ',Ghost,,',
    ].join('\n')
    const result = importer.commit(ORG, OWNER, 'vans', csv)
    expect(result).toMatchObject({ added: 1, problems: 4 })
    expect(importer.commit(ORG, OWNER, 'vans', csv)).toMatchObject({ added: 0, alreadyThere: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM org_vans').get()).toEqual({ n: 1 })
  })

  it('adds rates once, reads decimal commas and rejects prices that are not numbers', () => {
    const csv = ['Item,Unit Price,Per,Currency', 'Call-out,45,visit,USD', 'Labour per hour,"12,50",hour,usd', 'Mystery,abc,,', 'call-out,50,,'].join('\n')
    const result = importer.commit(ORG, OWNER, 'rates', csv)
    expect(result).toMatchObject({ added: 2, problems: 2 })
    const cards = db.prepare('SELECT name, unit, unit_price AS price, currency FROM org_rate_cards ORDER BY name').all()
    expect(cards).toEqual([
      { name: 'Call-out', unit: 'visit', price: 45, currency: 'USD' },
      { name: 'Labour per hour', unit: 'hour', price: 12.5, currency: 'USD' },
    ])
    expect(importer.commit(ORG, OWNER, 'rates', csv)).toMatchObject({ added: 0, alreadyThere: 2 })
  })

  it('reads semicolon files and stops a file that is far too long', () => {
    const result = importer.commit(ORG, OWNER, 'stores', 'Store Number;Name;Phone\n1;Spar One;0772000001\n2;Spar Two;0772000002')
    expect(result.added).toBe(2)
    const rows = Array.from({ length: 2001 }, (_, i) => `${i},Shop ${i}`).join('\n')
    expect(() => importer.preview(ORG, 'stores', `Store Number,Name\n${rows}`)).toThrow(/Import up to 2000/)
  })
})

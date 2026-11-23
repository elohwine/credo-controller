import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { findContactByStoreNumber, listContacts } from '../../persistence/ContactRepository'
import { FieldDataImportService, importDate, importPhone } from '../FieldDataImportService'
import { JobHistoryPromotionService } from '../JobHistoryPromotionService'
import { JobRegisterService } from '../JobRegisterService'
import { operationsRegisterService } from '../OperationsRegisterService'
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
    db.exec(migration('157_old_system_import_details.sql'))
    db.exec(migration('158_job_history_runs.sql'))
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
    // A UK office: local numbers become +44, the first of several is used, and "N/A" is blank.
    expect(importPhone('07700 900123', 'GB')).toBe('+447700900123')
    expect(importPhone('01215550000 / 07700900123', 'GB')).toBe('+441215550000')
    expect(importPhone('+263 77 212 3456', 'GB')).toBe('+263772123456')
    expect(importPhone('N/A', 'GB')).toBe('')
    expect(importDate('15/10/26')).toBe('2026-10-15')
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
    expect(preview.counts).toMatchObject({ total: 7, new: 4, exists: 2, problem: 1 })
    expect(preview.understood.map((entry) => entry.meaning)).toEqual(
      expect.arrayContaining(['Store number', 'Name', 'Phone', 'Email', 'Address (kept in notes)']),
    )
    expect(listContacts(ORG, 'external')).toHaveLength(0)

    const result = importer.commit(ORG, OWNER, 'stores', csv)
    expect(result).toMatchObject({ added: 4, alreadyThere: 2, problems: 1 })
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
    // A second row for a store keeps the first; a mangled phone is left out instead of losing the store.
    expect(result.rows.find((row) => /Same store as row 2/.test(row.note || ''))!.status).toBe('exists')
    expect(findContactByStoreNumber(ORG, '1042')!.name).toBe('Greendale Spar, Main Rd')
    expect(findContactByStoreNumber(ORG, '4004')!.phone).toBeUndefined()
    expect(result.rows.find((row) => row.summary.includes('4004'))!.note).toMatch(/"123" is not a phone number/)
    expect(listContacts(ORG, 'external')).toHaveLength(4)

    // Same file again: nothing new, nothing doubled.
    const again = importer.commit(ORG, OWNER, 'stores', csv)
    expect(again.added).toBe(0)
    expect(listContacts(ORG, 'external')).toHaveLength(4)
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
    expect(van).toEqual({ registration: 'AE 1234', description: 'Toyota Hiace', d: 'monday', m: '2027-06-30' })

    const preview = importer.preview(ORG, 'jobs', 'Foo,Bar\n1,2')
    expect(preview.missing).toEqual(['job number'])
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

  it('brings in a MyMobileWorkers export: staff, vans, tools, jobs with their details and check results', () => {
    const options = { country: 'GB' as const, currency: 'GBP' }
    importer.commit(
      ORG,
      OWNER,
      'stores',
      [
        'Customer,Contact Name,Address,Postcode,Contact Number,Contact Email,External ID,Store No.',
        '1007 - Great Bridge,Store Manager,1 High St,dy4 7aa,01215550000,N/A,1007,',
        '1012 - Oldbury,-,2 Low St,B69 1AA,-,-,1012,1012',
      ].join('\n'),
      undefined,
      options,
    )
    const store = findContactByStoreNumber(ORG, '1007')!
    expect(store).toMatchObject({ name: '1007 - Great Bridge', phone: '+441215550000', postcode: 'DY4 7AA', externalId: '1007' })
    expect(store.email).toBeUndefined()

    const people = importer.commit(
      ORG,
      OWNER,
      'people',
      [
        'External ID,Username,Full name,Email,Contact number,Branch,Archived',
        'SGK01,GeorgeTavenenhamo,,george@example.com,07700900123,Midlands,',
        'Jordan Smith,JordanSmith_deleted,,,,Midlands,yes',
        ',Head Office,Head Office,,,,',
        'SGK01,GeorgeTavenenhamo,,,,,',
      ].join('\n'),
      undefined,
      options,
    )
    expect(people).toMatchObject({ added: 2, alreadyThere: 1, problems: 1 })
    const staff = db
      .prepare('SELECT first_name AS f, last_name AS l, phone, status, staff_number AS n, branch, legacy_username AS u, currency FROM employees ORDER BY first_name')
      .all()
    expect(staff).toEqual([
      { f: 'George', l: 'Tavenenhamo', phone: '+447700900123', status: 'active', n: 'SGK01', branch: 'Midlands', u: 'GeorgeTavenenhamo', currency: 'GBP' },
      // A name in the staff-number column is not a staff number.
      { f: 'Jordan', l: 'Smith', phone: null, status: 'terminated', n: null, branch: 'Midlands', u: 'JordanSmith', currency: 'GBP' },
    ])

    const vans = importer.commit(
      ORG,
      OWNER,
      'vans',
      [
        'Registration,Make,Model,Branch,Mileage,MOT Expiry,Tax Expiry,Last check,Passed Checks,Vehicle Status,Archived',
        'ab12 cde,Ford,Transit,Midlands,85000,01/03/2027,-,20/11/2026 07:45,FAIL,Checked Out,',
        'XY99 ZZZ,Vauxhall,Vivaro,,850000000,,,,,Active,yes',
      ].join('\n'),
    )
    expect(vans).toMatchObject({ added: 2, problems: 0 })
    expect(vans.rows[1].note).toMatch(/Mileage 850000000 looks wrong/)
    const [transit, vivaro] = operationsRegisterService.listVans(ORG)
    expect(transit).toMatchObject({
      registration: 'AB12 CDE',
      description: 'Ford Transit',
      branch: 'Midlands',
      mileage: 85000,
      motDue: '2027-03-01',
      lastCheckDate: '2026-11-20',
      lastCheckOutcome: 'defect',
      status: 'active',
    })
    expect(transit.taxDue).toBeUndefined()
    expect(vivaro).toMatchObject({ status: 'retired' })
    expect(vivaro.mileage).toBeUndefined()

    const tools = importer.commit(
      ORG,
      OWNER,
      'equipment',
      ['External ID,Name,Product code,Notes,Price,Category', 'T1,Samsung Tablet,SM-T500,Assigned to Jordan on 04/02/22,199,Devices', ',Makita Drill,,,,Tools'].join('\n'),
      undefined,
      options,
    )
    expect(tools.added).toBe(2)
    expect(operationsRegisterService.listEquipment(ORG)[0]).toMatchObject({
      name: 'Samsung Tablet',
      serialNumber: 'T1',
      holderName: 'Jordan',
      value: 199,
      currency: 'GBP',
      category: 'Devices',
    })
    expect(importer.commit(ORG, OWNER, 'equipment', 'Name,Category\nMakita Drill,Tools')).toMatchObject({ added: 0, alreadyThere: 1 })

    const jobs = [
      'Job Type,Priority,Job Number,Status,External ID,Failure Type,Assigned to,Planned Vehicles,Secondary Users,Branch,Contact Name,Contact Numbers,Timeslot,Customer,Address,Postcode,Task,Arrived At,Completed At,Created At,Special Instructions,Notes,Invoice Number,Invoice sent to Lidl?',
      'Job Card v2,Urgent,1007ABC,Viewed,,,GeorgeTavenenhamo,AB12 CDE,JordanSmith_deleted,Midlands,Jane,07700900999,30-11-2026 22:00,1007 - Great Bridge,1 High St,DY4 7AA,,,,23-11-2026 09:15,Freezer not cooling,,Attend on 30/11/26 @ 22:00hrs,',
      'Job Card v2,Not Set,5739WZYEO7OBL,Failed,1012,Access Denied,GeorgeTavenenhamo,,,Midlands,,,21-11-2026 Any Time,Somewhere Unknown,,,,21-11-2026 10:00,,20-11-2026 08:00,Check door,No one on site,,',
      'Job Card v2,Normal,1007XYZ,Completed without signature,,,JordanSmith_deleted,,,,,,22-11-2026,1007 - Great Bridge,,,Replace bulb,,22-11-2026 14:30,22-11-2026 08:00,,Done,HSS Attached,15/10/26',
    ].join('\n')
    const result = importer.commit(ORG, OWNER, 'jobs', jobs, undefined, options)
    expect(result).toMatchObject({ added: 3, waiting: 1, history: 2, problems: 0 })

    const byRef = new Map(register.rows(ORG).map((row) => [row.reference, row]))
    expect(byRef.get('1007ABC')).toMatchObject({
      kind: 'intake',
      storeNumber: '1007',
      description: 'Freezer not cooling',
      callOut: true,
      workerName: 'George Tavenenhamo',
      createdAt: '2026-11-23T09:15:00',
      details: {
        oldStatus: 'Viewed',
        priority: 'Urgent',
        timeslot: '22:00',
        jobType: 'Job Card v2',
        contactName: 'Jane',
        invoiceNote: 'Attend on 30/11/26 @ 22:00hrs',
        vehicle: 'AB12 CDE',
        helpers: 'Jordan Smith',
      },
    })
    expect(byRef.get('1007ABC')!.problemType).toBeUndefined()
    const intake = JSON.parse((db.prepare('SELECT payload_json AS p FROM job_intakes').get() as { p: string }).p)
    expect(intake).toMatchObject({ clientPhone: '+447700900999', currency: 'GBP', vehicleReference: 'AB12 CDE' })
    // A failed visit is history; its store comes from the client reference when the name has no number.
    expect(byRef.get('5739WZYEO7OBL')).toMatchObject({
      kind: 'history',
      category: 'failed',
      storeNumber: '1012',
      description: 'Check door',
      details: { failureType: 'Access Denied', notes: 'No one on site', arrivedAt: '2026-11-21T10:00:00' },
    })
    expect(byRef.get('5739WZYEO7OBL')!.details!.priority).toBeUndefined()
    expect(byRef.get('1007XYZ')).toMatchObject({
      kind: 'history',
      category: 'completed',
      description: 'Replace bulb',
      workerName: 'Jordan Smith',
      completedAt: '2026-11-22',
      details: { oldStatus: 'Completed without signature', invoiceNote: 'HSS Attached', invoiceSentOn: '2026-10-15' },
    })

    const checks = [
      'Name,Checklist Result,Job Number,Job Status',
      'Freezer temperature,Pass,1007ABC,Viewed',
      'Site safe,Fail,1007XYZ,Completed',
      'Site safe,Fail,1007XYZ,Completed',
      'Lights,Pass,NOPE,Completed',
    ].join('\n')
    expect(importer.preview(ORG, 'checks', checks).counts).toMatchObject({ new: 2, exists: 1, problem: 1 })
    expect(importer.commit(ORG, OWNER, 'checks', checks)).toMatchObject({ added: 2, alreadyThere: 1, problems: 1 })
    expect(importer.commit(ORG, OWNER, 'checks', checks)).toMatchObject({ added: 0, alreadyThere: 3 })
    const after = new Map(register.rows(ORG).map((row) => [row.reference, row]))
    expect(after.get('1007ABC')!.details!.checks).toEqual([{ name: 'Freezer temperature', result: 'Pass' }])
    expect(after.get('1007XYZ')!.details!.checks).toEqual([{ name: 'Site safe', result: 'Fail' }])
    // Nothing imported starts a job or a bill.
    expect(db.prepare('SELECT COUNT(*) AS n FROM workflow_runs').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM payment_links').get()).toEqual({ n: 0 })
  })

  it('turns finished jobs from the old system into closed jobs on the Jobs list, once', () => {
    importer.commit(
      ORG,
      OWNER,
      'jobs',
      'Job Number,Status,Customer,Task,Assigned to,Created At,Completed At,Priority\n' +
        'MMW-1,Completed,Greendale Spar,Fix door,Tendai Moyo,03/11/2026 08:15,03/11/2026 11:40,High\n' +
        'MMW-2,Cancelled,Greendale Spar,Paint wall,,04/11/2026 09:00,,\n' +
        'MMW-3,Scheduled,Greendale Spar,Check lights,,05/11/2026 10:00,,',
    )
    const promotion = new JobHistoryPromotionService(() => ({ id: 'wf-field' }) as any)
    expect(promotion.promote(ORG)).toEqual({ converted: 2, updated: 0 })
    expect(promotion.promote(ORG)).toEqual({ converted: 0, updated: 2 })

    const runs = db
      .prepare("SELECT workflow_id, status, input, output, created_at FROM workflow_runs WHERE tenant_id = ? ORDER BY created_at")
      .all(ORG) as Array<Record<string, string>>
    expect(runs.map((run) => [run.workflow_id, run.status])).toEqual([
      ['wf-field', 'completed'],
      ['wf-field', 'cancelled'],
    ])
    expect(runs[0].created_at).toBe('2026-11-03 08:15:00')
    const input = JSON.parse(runs[0].input)
    expect(input).toMatchObject({ sourceType: 'import', reference: 'MMW-1', workerName: 'Tendai Moyo' })
    expect(input.importedDetails).toMatchObject({ priority: 'High' })
    expect(JSON.parse(runs[0].output)).toMatchObject({ workflowStage: 'COMPLETED', workflowInput: input })

    // Converted jobs are listed as jobs, not a second time as history; the open one still waits to be booked.
    const rows = register.rows(ORG)
    expect(rows.filter((row) => row.kind === 'history')).toHaveLength(0)
    expect(rows.filter((row) => row.kind === 'intake').map((row) => row.reference)).toEqual(['MMW-3'])
  })
})

import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { upsertContact } from '../../persistence/ContactRepository'
import { jobIntakeRepository } from '../../persistence/JobIntakeRepository'
import { OrganizationService } from '../OrganizationService'
import { OperationsRegisterService } from '../OperationsRegisterService'
import { parseJobEmail } from '../integrations/jobEmailParser'
import { MicrosoftGraphMailIntakeService, type MailIntakeConfig } from '../integrations/MicrosoftGraphMailIntakeService'

const ORG = 'org-sgk'
const FARAI = 'user-farai'
const TINO = 'user-tino'

function migration(file: string): string {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8')
}

describe('Stores, attendants and vans', () => {
  let db: Database.Database
  const restores: Array<{ mockRestore: () => void }> = []
  const service = new OperationsRegisterService()

  function addJob(id: string, input: Record<string, unknown>, status = 'paused', output: Record<string, unknown> = {}) {
    db.prepare(
      `INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, output, created_at)
       VALUES (?, 'tpl-fept-field-execution-org', ?, ?, ?, ?, ?)`,
    ).run(id, ORG, status, JSON.stringify(input), JSON.stringify(output), '2026-11-20T08:00:00Z')
  }

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
        id TEXT PRIMARY KEY, workflow_id TEXT, tenant_id TEXT, status TEXT, input TEXT, output TEXT, created_at TEXT
      );
      CREATE TABLE payment_links (
        id TEXT PRIMARY KEY, merchant_id TEXT, description TEXT, amount REAL, currency TEXT, invoice_ref TEXT,
        status TEXT, metadata TEXT, created_at TEXT
      );
      CREATE TABLE organizations (id TEXT PRIMARY KEY, tenant_id TEXT);
      CREATE TABLE people (id TEXT PRIMARY KEY, organization_id TEXT, subject_ref TEXT);
      CREATE TABLE requests (
        id TEXT PRIMARY KEY, organization_id TEXT, requester_person_id TEXT, request_type TEXT, status TEXT,
        context_json TEXT, created_at TEXT
      );
    `)
    db.exec(migration('009_create_payroll.sql'))
    db.exec(migration('129_job_intake.sql'))
    db.exec(migration('152_stores_staff_vans_mail_intake.sql'))
    db.exec(migration('153_employee_staff_link.sql'))
    db.prepare(`INSERT INTO workflows (id, tenant_id, name, category) VALUES ('tpl-fept-field-execution-org', ?, 'Field job', 'field_execution_fept')`).run(ORG)
    restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
    restores.push(
      jest.spyOn(OrganizationService.prototype, 'listOrgMembers').mockReturnValue([
        { userId: FARAI, role: 'field_worker', status: 'active', displayName: 'Farai', createdAt: '' },
        { userId: TINO, role: 'field_worker', status: 'active', displayName: 'Tino', createdAt: '' },
      ] as any),
    )
  })

  afterEach(() => {
    while (restores.length) restores.pop()!.mockRestore()
    db.close()
  })

  it('files every job, quote, invoice and call-out under the store number', () => {
    upsertContact({ orgTenantId: ORG, name: 'Spar Borrowdale', phone: '+263771000001', storeNumber: 'Store #1042' })
    addJob('RUN-OPEN', { storeNumber: '1042', poNumber: 'PO-77', description: 'Leaking tap', scheduledDate: '2026-11-24', assigneeId: FARAI })
    addJob('RUN-CALLOUT', { storeNumber: '1042', description: 'Burst pipe', callOut: true }, 'completed')
    addJob('RUN-LEGACY', { poNumber: '1042', description: 'Old job with the store in the PO box' }, 'cancelled')
    addJob('RUN-OTHER', { storeNumber: '2001', description: 'Another store' })
    db.prepare(`INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, created_at) VALUES ('BILL-RUN', 'tpl-payment-collection-org', ?, 'completed', ?, '2026-11-21')`).run(
      ORG,
      JSON.stringify({ parentRunId: 'RUN-CALLOUT' }),
    )
    db.prepare(`INSERT INTO payment_links VALUES ('L1', ?, 'Invoice for burst pipe', 120, 'USD', 'INV-1', 'paid', ?, '2026-11-21')`).run(
      ORG,
      JSON.stringify({ kind: 'invoice', workflowRunId: 'BILL-RUN' }),
    )
    db.prepare(`INSERT INTO payment_links VALUES ('L2', ?, 'Extra work quote', 40, 'USD', 'Q-1', 'active', ?, '2026-11-21')`).run(
      ORG,
      JSON.stringify({ kind: 'quote', workflowRunId: 'RUN-OPEN' }),
    )

    const file = service.storeFile(ORG, '1042')!
    expect(file.store).toMatchObject({ storeNumber: '1042', name: 'Spar Borrowdale', totalJobs: 3, openJobs: 1 })
    expect(file.jobCards.map((job) => job.runId).sort()).toEqual(['RUN-CALLOUT', 'RUN-LEGACY', 'RUN-OPEN'])
    expect(file.outstanding.map((job) => job.runId)).toEqual(['RUN-OPEN'])
    expect(file.callOuts.map((job) => job.runId)).toEqual(['RUN-CALLOUT'])
    expect(file.cancelled.map((job) => job.runId)).toEqual(['RUN-LEGACY'])
    expect(file.invoices.map((bill) => bill.id)).toEqual(['L1'])
    expect(file.quotes.map((bill) => bill.id)).toEqual(['L2'])
    expect(service.listStores(ORG).map((store) => store.storeNumber)).toEqual(['1042', '2001'])
  })

  it('refuses a second contact with the same store number', () => {
    upsertContact({ orgTenantId: ORG, name: 'Spar Borrowdale', storeNumber: '1042' })
    expect(() => upsertContact({ orgTenantId: ORG, name: 'Someone else', storeNumber: ' store 1042' })).toThrow(
      'Store 1042 is already saved for Spar Borrowdale',
    )
  })

  it("builds an attendant's file: jobs, failed, leave, sick days, van and accidents", () => {
    db.prepare(
      `INSERT INTO employees (id, tenant_id, first_name, last_name, base_salary, user_id) VALUES ('E1', ?, 'Farai', 'Ncube', 0, ?), ('E2', ?, 'Tino', 'Dube', 0, ?)`,
    ).run(ORG, FARAI, ORG, TINO)
    service.saveAttendantProfile(ORG, FARAI, { staffNumber: 'sgk-007', skills: ['Plumbing', 'Electrical', 'plumbing'] })
    expect(() => service.saveAttendantProfile(ORG, TINO, { staffNumber: 'SGK-007' })).toThrow('already in use')
    addJob('RUN-A', { description: 'Fix tap', assigneeId: FARAI })
    addJob('RUN-B', { description: 'Fix door', assigneeId: FARAI }, 'failed')
    addJob('RUN-C', { description: 'Paint wall', assigneeId: FARAI }, 'completed')
    db.exec(`INSERT INTO organizations VALUES ('o1', '${ORG}'); INSERT INTO people VALUES ('p1', 'o1', '${FARAI}');`)
    db.prepare(`INSERT INTO requests VALUES ('LV1', 'o1', 'p1', 'hr.leave', 'approved', ?, '2026-11-01')`).run(
      JSON.stringify({ leaveType: 'annual', startDate: '2026-12-20', endDate: '2026-12-31' }),
    )
    db.prepare(`INSERT INTO requests VALUES ('LV2', 'o1', 'p1', 'hr.leave', 'approved', ?, '2026-11-02')`).run(
      JSON.stringify({ leaveType: 'sick', startDate: '2026-11-10', endDate: '2026-11-11' }),
    )
    const van = service.saveVan(ORG, 'owner', { registration: 'aeb 1234', serviceDay: 'Friday', driverUserId: FARAI })
    service.addVanEvent(ORG, 'owner', van.id, { kind: 'accident', eventDate: '2026-11-15', notes: 'Reversed into a bollard' })

    const file = service.attendantFile(ORG, FARAI)!
    expect(file.attendant).toMatchObject({ staffNumber: 'SGK-007', skills: ['Plumbing', 'Electrical'], van: { registration: 'AEB 1234' } })
    expect(file.jobCards).toHaveLength(3)
    expect(file.failed.map((job) => job.runId)).toEqual(['RUN-B'])
    expect(file.completed.map((job) => job.runId)).toEqual(['RUN-C'])
    expect(file.holidays.map((item) => item.requestId)).toEqual(['LV1'])
    expect(file.offSick.map((item) => item.requestId)).toEqual(['LV2'])
    expect(file.accidents).toEqual([expect.objectContaining({ notes: 'Reversed into a bollard', userId: FARAI })])
  })

  it('keeps a van file: service day, MOT, drivers, accidents and the jobs it went to', () => {
    const van = service.saveVan(ORG, 'owner', { registration: 'AEB 1234', serviceDay: 'friday', motDue: '2026-12-01', driverUserId: FARAI })
    service.saveVan(ORG, 'owner', { id: van.id, driverUserId: TINO })
    service.addVanEvent(ORG, 'owner', van.id, { kind: 'mot', eventDate: '2026-11-20', notes: 'Passed', nextDue: '2027-11-20' })
    service.addVanEvent(ORG, 'owner', van.id, { kind: 'service', eventDate: '2026-11-14' })
    addJob('RUN-VAN', { description: 'Job with the van', vanId: van.id, vehicleReference: 'AEB 1234' })
    expect(() => service.saveVan(ORG, 'owner', { registration: 'aeb  1234' })).toThrow('already on the register')

    const file = service.vanFile(ORG, van.id)!
    expect(file.van).toMatchObject({ motDue: '2027-11-20', serviceDay: 'friday', driverUserId: TINO, driverName: 'Tino' })
    expect(file.drivers.map((event) => event.userName).sort()).toEqual(['Farai', 'Tino'])
    expect(file.mots).toHaveLength(1)
    expect(file.services).toHaveLength(1)
    expect(file.jobs.map((job) => job.vehicle)).toEqual(['AEB 1234'])
  })

  it('warns before a store, a worker or a van is booked twice', () => {
    const van = service.saveVan(ORG, 'owner', { registration: 'AEB 1234', serviceDay: 'tuesday' })
    addJob('RUN-1', { storeNumber: '1042', description: 'Fix tap', scheduledDate: '2026-11-24', assigneeId: FARAI, vanId: van.id })
    addJob('RUN-DONE', { storeNumber: '1042', description: 'Old job', scheduledDate: '2026-11-24' }, 'completed')
    jobIntakeRepository.create(ORG, 'mail:jobs', { storeNumber: '1042', description: 'From email', amount: 0, currency: 'USD' })

    const check = service.scheduleCheck(ORG, { storeNumber: 'store 1042', date: '2026-11-24', assigneeId: FARAI, vanId: van.id })
    expect(check.storeOpenJobs.map((job) => job.runId)).toEqual(['RUN-1'])
    expect(check.storeWaiting).toHaveLength(1)
    expect(check.workerSameDay.map((job) => job.runId)).toEqual(['RUN-1'])
    expect(check.vanSameDay.map((job) => job.runId)).toEqual(['RUN-1'])
    // 2026-11-24 is a Tuesday: the van's service day.
    expect(check.vanWarning).toBe('AEB 1234 goes in for its service on Tuesdays.')
    expect(service.scheduleCheck(ORG, { storeNumber: '1042', date: '2026-11-25', assigneeId: TINO }).workerSameDay).toEqual([])
  })

  it('flags an intake for a store and PO that is already booked', () => {
    addJob('RUN-PO', { storeNumber: '1042', poNumber: 'PO-77', description: 'Fix tap' })
    const repeat = jobIntakeRepository.create(ORG, 'mail:jobs', {
      storeNumber: '1042',
      poNumber: 'po-77',
      description: 'Same job, forwarded',
      amount: 0,
      currency: 'USD',
    })
    expect(repeat.duplicateOf).toBe('RUN-PO')
    const fresh = jobIntakeRepository.create(ORG, 'mail:jobs', { storeNumber: '1042', poNumber: 'PO-78', description: 'New job', amount: 0, currency: 'USD' })
    expect(fresh.duplicateOf).toBeUndefined()
    const second = jobIntakeRepository.create(ORG, 'mail:jobs', { storeNumber: '1042', poNumber: 'PO-78', description: 'Again', amount: 0, currency: 'USD' })
    expect(second.duplicateOf).toBe(fresh.id)
  })

  describe('jobs mailbox', () => {
    const config: MailIntakeConfig = {
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
      mailbox: 'jobs@sgk.test',
      orgTenantId: ORG,
      folder: 'inbox',
      pollSeconds: 120,
      firstSyncDays: 14,
    }
    const message = (id: string, subject: string, content: string) => ({
      id,
      internetMessageId: `<${id}@mail>`,
      subject,
      from: { emailAddress: { address: 'maintenance@spar.test', name: 'Spar Maintenance' } },
      body: { contentType: 'text', content },
    })

    function graphFetch(pages: Array<Record<string, unknown>>, calls: string[]) {
      return (async (url: string) => {
        calls.push(String(url))
        if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }))
        return new Response(JSON.stringify(pages.shift() || { value: [] }))
      }) as unknown as typeof fetch
    }

    it('turns each email into one intake, once, and picks up the store from the sender', async () => {
      upsertContact({ orgTenantId: ORG, name: 'Spar Borrowdale', email: 'maintenance@spar.test', phone: '+263771000001', storeNumber: '1042' })
      const calls: string[] = []
      const service = new MicrosoftGraphMailIntakeService(
        () => config,
        graphFetch(
          [
            {
              value: [message('m1', 'New job PO 5531', 'Description: Replace broken door closer\nRequired by 25/11/2026')],
              '@odata.deltaLink': 'https://graph/delta?token=1',
            },
            { value: [message('m1', 'New job PO 5531', 'repeat delivery')], '@odata.deltaLink': 'https://graph/delta?token=2' },
          ],
          calls,
        ),
      )
      const first = await service.syncNow()
      expect(first).toMatchObject({ imported: 1, failed: 0 })
      const second = await service.syncNow()
      expect(second).toMatchObject({ imported: 0, alreadySaved: 1 })
      expect(calls.filter((url) => url.startsWith('https://graph/delta'))).toEqual(['https://graph/delta?token=1'])

      const [intake] = jobIntakeRepository.listForTenant(ORG)
      expect(intake.payload).toMatchObject({
        storeNumber: '1042',
        poNumber: '5531',
        clientName: 'Spar Borrowdale',
        clientPhone: '+263771000001',
        description: 'Replace broken door closer',
        scheduledDate: '2026-11-25',
        sourceType: 'email',
      })
      expect(service.status(ORG)).toMatchObject({ connected: true, imported: 1, lastError: undefined })
    })

    it('does not move past a page it could not save, so the email is read again', async () => {
      const calls: string[] = []
      const service = new MicrosoftGraphMailIntakeService(
        () => config,
        graphFetch([{ value: [message('m2', 'Job', 'Fix it')], '@odata.deltaLink': 'https://graph/delta?token=9' }], calls),
      )
      const spy = jest.spyOn(jobIntakeRepository, 'create').mockImplementation(() => {
        throw new Error('disk full')
      })
      const result = await service.syncNow()
      spy.mockRestore()
      expect(result.failed).toBe(1)
      expect(db.prepare('SELECT delta_link AS d FROM mail_intake_state').get()).toEqual({ d: null })
    })
  })
})

describe('parseJobEmail', () => {
  it('reads store, PO, problem, date, phone and call-out from a store email', () => {
    const parsed = parseJobEmail(
      'URGENT call out - Store 1042 - PO: 88231',
      '<p>Hi team</p><p>Description: Geyser leaking in the staff toilet</p><p>Address: 12 Main Rd, Borrowdale</p><p>Contact: 0772 123 456</p><p>Date required: 2026-11-26</p>',
    )
    expect(parsed).toMatchObject({
      storeNumber: '1042',
      poNumber: '88231',
      problemType: 'Plumbing',
      description: 'Geyser leaking in the staff toilet',
      location: '12 Main Rd, Borrowdale',
      clientPhone: '0772123456',
      scheduledDate: '2026-11-26',
      callOut: true,
    })
  })

  it('falls back to the first real sentence when there is no description label', () => {
    const parsed = parseJobEmail('Lights out', 'Hello,\nThe lights in aisle 4 have stopped working since this morning.\nRegards')
    expect(parsed.description).toBe('The lights in aisle 4 have stopped working since this morning.')
    expect(parsed.problemType).toBe('Electrical')
    expect(parsed.callOut).toBe(false)
  })
})

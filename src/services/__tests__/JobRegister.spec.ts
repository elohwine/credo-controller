import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { fieldJobSourceOf } from '../../config/fieldJobSource'
import { jobSheetMissing, quoteTotal } from '../../config/jobSheet'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { jobIntakeRepository } from '../../persistence/JobIntakeRepository'
import { FieldJobSheetService } from '../FieldJobSheetService'
import { JobRegisterService } from '../JobRegisterService'
import { JobStatusLinkService } from '../JobStatusLinkService'
import { OperationsRegisterService, VAN_DAILY_CHECKS } from '../OperationsRegisterService'
import { OrganizationService } from '../OrganizationService'
import { ReconciliationService } from '../ReconciliationService'

const ORG = 'org-sgk'
const FARAI = 'user-farai'
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function migration(file: string): string {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8')
}

describe('Jobs list, export, reports and what is filled in on site', () => {
  let db: Database.Database
  const restores: Array<{ mockRestore: () => void }> = []
  const events: string[] = []
  const register = new JobRegisterService()
  const operations = new OperationsRegisterService()
  const sheets = new FieldJobSheetService()
  const links = new JobStatusLinkService()

  function addJob(id: string, input: Record<string, unknown>, status = 'paused', output: Record<string, unknown> = {}, completedAt?: string) {
    db.prepare(
      `INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, output, created_at, completed_at)
       VALUES (?, 'tpl-fept-field-execution-org', ?, ?, ?, ?, '2026-11-20T08:00:00Z', ?)`,
    ).run(id, ORG, status, JSON.stringify(input), JSON.stringify(output), completedAt || null)
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
    db.prepare(`INSERT INTO workflows VALUES ('tpl-fept-field-execution-org', ?, 'Field job', 'field_execution_fept')`).run(ORG)
    events.length = 0
    restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
    restores.push(
      jest.spyOn(OrganizationService.prototype, 'listOrgMembers').mockReturnValue([
        { userId: FARAI, role: 'field_worker', status: 'active', displayName: 'Farai Ncube', createdAt: '' },
      ] as any),
    )
    restores.push(
      jest.spyOn(ReconciliationService.prototype, 'recordEvent').mockImplementation((_ref, type) => {
        events.push(type)
      }),
    )
  })

  afterEach(() => {
    while (restores.length) restores.pop()!.mockRestore()
    db.close()
  })

  it('names where a job came from the same way everywhere', () => {
    expect(fieldJobSourceOf({ sourceType: 'email' })).toBe('email')
    expect(fieldJobSourceOf({ sourceType: 'manual', jobIntakeId: 'i1' })).toBe('office')
    expect(fieldJobSourceOf({ bookedVia: 'app', serviceId: 's1' })).toBe('booking')
    expect(fieldJobSourceOf({ description: 'New job form' })).toBe('office')
  })

  it('filters and counts arrivals as open jobs and sorts statuses in lifecycle order', () => {
    addJob('RUN-ARRIVED', { assigneeId: FARAI }, 'paused', {
      workflowStage: 'IN_PROGRESS',
      assignment: { assigneeId: FARAI },
      checkpoints: { arrival: { status: 'completed' } },
    })
    addJob('RUN-PENDING', {}, 'paused', { workflowStage: 'REQUEST_CREATED' })
    addJob('RUN-DONE', {}, 'completed', { workflowStage: 'COMPLETED' })

    expect(register.rows(ORG, { category: 'arrived' }).map((row) => row.id)).toEqual(['RUN-ARRIVED'])
    expect(register.report(ORG).counts.arrived).toBe(1)
    expect(register.report(ORG).byWorker.find((worker) => worker.userId === FARAI)?.open).toBe(1)
    expect(register.page(ORG, {}, { sort: 'status', dir: 'asc' }).items.map((row) => row.id))
      .toEqual(['RUN-PENDING', 'RUN-ARRIVED', 'RUN-DONE'])
  })

  it('lists booked jobs and jobs waiting in intake together, and filters them by source, status, store, worker and date', () => {
    addJob(
      'RUN-MAIL',
      { sourceType: 'email', storeNumber: '1042', description: 'Door closer', assigneeId: FARAI, scheduledDate: '2026-11-24' },
      'paused',
      { workflowStage: 'ASSIGNED', assignment: { assigneeId: FARAI } },
    )
    addJob('RUN-HAND', { description: 'Paint wall', storeNumber: '2001', scheduledDate: '2026-11-30' }, 'completed', {}, '2026-11-22T08:00:00Z')
    addJob('RUN-BOOK', { bookedVia: 'app', serviceId: 's1', awaitAssignment: true, description: 'Fix tap' })
    jobIntakeRepository.create(ORG, 'mail:jobs@sgk.test', { description: 'Fridge door', amount: 0, currency: 'USD', sourceType: 'email', storeNumber: '1042' })
    jobIntakeRepository.create(ORG, 'office', { description: '=HYPERLINK("x")', amount: 10, currency: 'USD', sourceType: 'manual' })

    const all = register.rows(ORG)
    expect(all).toHaveLength(5)
    expect(all.filter((row) => row.kind === 'intake').map((row) => row.category)).toEqual(['not_booked', 'not_booked'])
    expect(register.rows(ORG, { source: 'email' }).map((row) => row.description).sort()).toEqual(['Door closer', 'Fridge door'])
    expect(register.rows(ORG, { source: 'booking' }).map((row) => row.id)).toEqual(['RUN-BOOK'])
    expect(register.rows(ORG, { source: 'office' })).toHaveLength(2)
    expect(register.rows(ORG, { category: 'not_booked' })).toHaveLength(2)
    expect(register.rows(ORG, { storeNumber: '1042' })).toHaveLength(2)
    expect(register.rows(ORG, { assigneeId: FARAI }).map((row) => row.id)).toEqual(['RUN-MAIL'])
    expect(register.rows(ORG, { from: '2026-11-24', to: '2026-11-24' }).map((row) => row.id)).toEqual(['RUN-MAIL'])
    expect(register.rows(ORG, { q: 'paint' }).map((row) => row.id)).toEqual(['RUN-HAND'])
    expect(() => register.rows(ORG, { from: '24/11/2026' })).toThrow('From must be a date')

    const csv = register.csv(ORG)
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Job,Source,Status,Store,PO,Client,Description,Location,Problem,Booked for,Worker,Van,Call-out,Amount,Currency,Received,Completed')
    expect(lines).toHaveLength(6)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines.find((line) => line.includes('Door closer'))).toContain('From email,Assigned,1042')
    expect(lines.find((line) => line.includes('Door closer'))).toContain('Farai Ncube')

    const report = register.report(ORG)
    expect(report.total).toBe(5)
    expect(report.counts).toMatchObject({ not_booked: 2, completed: 1 })
    expect(report.bySource.find((entry) => entry.source === 'email')).toMatchObject({ label: 'From email', count: 2 })
    expect(report.byStore.find((store) => store.storeNumber === '1042')).toMatchObject({ open: 2, total: 2 })
    expect(report.byWorker).toEqual([{ userId: FARAI, name: 'Farai Ncube', open: 1, completed: 0, failed: 0 }])
    expect(report.averageDaysToComplete).toBe(2)
  })

  it('pages a long imported or mailed-in list without losing jobs, with the total and the asked order', () => {
    for (let index = 0; index < 620; index += 1) {
      jobIntakeRepository.create(ORG, 'mail:jobs@sgk.test', {
        reference: `MAIL-${String(index).padStart(4, '0')}`,
        description: `Mailed job ${index}`,
        amount: 0,
        currency: 'USD',
        sourceType: 'email',
        ...(index % 2 ? { storeNumber: String(3000 + index) } : {}),
      })
    }
    addJob('RUN-A', { description: 'Booked job', storeNumber: '1001', scheduledDate: '2026-11-24' })

    expect(register.rows(ORG)).toHaveLength(621)
    const first = register.page(ORG, {}, { limit: 50 })
    expect(first.items).toHaveLength(50)
    expect(first).toMatchObject({ total: 621, offset: 0, limit: 50 })
    const last = register.page(ORG, {}, { limit: 50, offset: 600 })
    expect(last.items).toHaveLength(21)
    expect(new Set([...first.items, ...last.items].map((row) => row.id)).size).toBe(71)

    const byStore = register.page(ORG, { source: 'email' }, { sort: 'store', dir: 'asc', limit: 500 })
    expect(byStore.total).toBe(620)
    expect(byStore.items[0].storeNumber).toBe('3001')
    expect(register.page(ORG, { source: 'email' }, { sort: 'store', dir: 'desc', offset: 619 }).items[0].storeNumber).toBeUndefined()
    expect(register.page(ORG, {}, { sort: 'reference', dir: 'asc', limit: 1 }).items[0].reference).toBe('MAIL-0000')
    expect(register.page(ORG, { q: 'booked job' }).items.map((row) => row.id)).toEqual(['RUN-A'])

    expect(() => register.page(ORG, {}, { sort: 'password' })).toThrow('cannot be sorted')
    expect(() => register.page(ORG, {}, { limit: 0 })).toThrow('Page size')
    expect(register.page(ORG, {}, { limit: 5000 }).limit).toBe(500)
  })

  it('records a daily van check, needs a note for a defect, and keeps photos with an accident report', () => {
    const van = operations.saveVan(ORG, 'owner', { registration: 'AEB 1234' })
    const allOk = VAN_DAILY_CHECKS.map((item) => ({ item, ok: true }))
    expect(() => operations.recordDailyCheck(ORG, FARAI, van.id, { checks: allOk.slice(1) })).toThrow('Say whether "Tyres and wheels" is ok')
    const defect = allOk.map((check) => (check.item === 'Brakes' ? { ...check, ok: false } : check))
    expect(() => operations.recordDailyCheck(ORG, FARAI, van.id, { checks: defect })).toThrow('Say what is wrong with "Brakes"')
    const saved = operations.recordDailyCheck(ORG, FARAI, van.id, {
      checks: defect.map((check) => (check.item === 'Brakes' ? { ...check, note: 'Soft pedal' } : check)),
      mileage: 120400,
    })
    expect(saved).toMatchObject({ kind: 'daily_check', outcome: 'defect', mileage: 120400, userName: 'Farai Ncube' })
    expect(saved.checklist?.find((check) => check.item === 'Brakes')).toEqual({ item: 'Brakes', ok: false, note: 'Soft pedal' })
    expect(() => operations.recordDailyCheck(ORG, FARAI, van.id, { checks: allOk })).toThrow('already checked this van today')

    expect(() =>
      operations.reportAccident(ORG, FARAI, van.id, { notes: 'Reversed into a pole', photos: [{ filename: 'a.png', mediaType: 'image/jpeg', contentBase64: TINY_PNG }] }),
    ).toThrow('does not match')
    const accident = operations.reportAccident(ORG, FARAI, van.id, {
      notes: 'Reversed into a pole',
      photos: [{ filename: 'bumper.png', mediaType: 'image/png', contentBase64: TINY_PNG }],
    })
    expect(accident.photos).toHaveLength(1)
    const file = operations.vanFile(ORG, van.id)!
    expect(file.dailyChecks).toHaveLength(1)
    expect(file.accidents.map((event) => event.id)).toEqual([accident.id])
    const photo = operations.vanEventPhoto(ORG, van.id, accident.id, accident.photos![0].id)
    expect(photo?.content.toString('base64')).toBe(TINY_PNG)
  })

  it('saves the job sheet for the problem type, the items used and the store signature on the job', () => {
    sheets.saveSheet(ORG, 'Plumbing', [
      { id: 'water_off', label: 'Water turned off', kind: 'check', required: true },
      { id: 'pipe_length', label: 'Pipe replaced', kind: 'measure', unit: 'm', required: true },
    ])
    addJob('RUN-1', { reference: 'FR-1', problemType: 'plumbing', assigneeId: FARAI }, 'paused', { workflowStage: 'IN_PROGRESS' })
    expect(sheets.sheetFor(ORG, 'Electrical').general).toBe(true)
    expect(() => sheets.saveJobSheet(ORG, 'RUN-1', { answers: { pipe_length: { value: 'two' } } }, FARAI)).toThrow('must be a number')
    const saved = sheets.saveJobSheet(
      ORG,
      'RUN-1',
      { answers: { water_off: { ok: true }, pipe_length: { value: '2.5' }, stray: { value: 'x' } }, materials: [{ name: '15mm pipe', quantity: 3, unit: 'm' }] },
      FARAI,
    )
    expect(saved.answers).toEqual({ water_off: { ok: true }, pipe_length: { value: '2.5' } })
    expect(jobSheetMissing(saved.items, saved.answers)).toEqual([])
    expect(() => sheets.saveStoreSignature(ORG, 'RUN-1', { signerName: 'Mrs Moyo', imageDataUrl: 'not an image' }, FARAI)).toThrow('sign in the box')
    const signature = sheets.saveStoreSignature(ORG, 'RUN-1', { signerName: 'Mrs Moyo', signerRole: 'Store manager', imageDataUrl: `data:image/png;base64,${TINY_PNG}` }, FARAI)
    const state = JSON.parse((db.prepare(`SELECT output FROM workflow_runs WHERE id = 'RUN-1'`).get() as any).output)
    expect(state.jobSheet.materials).toEqual([{ name: '15mm pipe', quantity: 3, unit: 'm' }])
    expect(state.storeSignature).toMatchObject({ signerName: 'Mrs Moyo', signerRole: 'Store manager', by: FARAI })
    expect(signature.signedAt).toBeTruthy()
    expect(events).toEqual(['JOB_SHEET_SAVED', 'STORE_SIGNED'])
  })

  it('prices a quote from the rate card', () => {
    const callOut = sheets.saveRateCard(ORG, { name: 'Call-out', unitPrice: 35 })
    sheets.saveRateCard(ORG, { name: 'Labour', unit: 'hour', unitPrice: 20 })
    expect(() => sheets.saveRateCard(ORG, { name: 'Call-out', unitPrice: 40 })).toThrow('already saved')
    sheets.saveRateCard(ORG, { id: callOut.id, active: false })
    expect(sheets.listRateCards(ORG).map((card) => card.name)).toEqual(['Labour'])
    expect(quoteTotal([{ description: 'Call-out', quantity: 1, unitPrice: 35 }, { description: 'Labour', quantity: 2.5, unitPrice: 20 }])).toBe(85)
  })

  it('lets the client follow a job from a link, without ids or phone numbers, until the link is switched off', () => {
    db.prepare(`INSERT INTO organizations VALUES ('o1', ?, 'SGK Maintenance')`).run(ORG)
    addJob(
      'RUN-2',
      { reference: 'FR-2', storeNumber: '1042', description: 'Fix door', assigneeId: FARAI, customerMsisdn: '+263771000001' },
      'paused',
      {
        workflowStage: 'EVIDENCE_CAPTURED',
        checkpoints: { arrival: { status: 'completed' } },
        evidenceBefore: { evidenceHash: 'h1', photoUri: `data:image/png;base64,${TINY_PNG}` },
        evidenceAfter: { evidenceHash: 'h2', photoUri: 'https://elsewhere.example/p.png' },
        storeSignature: { signerName: 'Mrs Moyo', signerRole: 'Store manager', signedAt: '2026-11-21T10:00:00Z', imageDataUrl: 'data:image/png;base64,abc' },
      },
    )
    db.prepare(`INSERT INTO payment_links VALUES ('L1', ?, 'Invoice', 80, 'USD', 'INV-1', 'active', ?, '2026-11-21', 'https://pay.example/p/ABC')`).run(
      ORG,
      JSON.stringify({ kind: 'invoice', workflowRunId: 'RUN-2' }),
    )
    const { code, url } = links.create(ORG, 'RUN-2', 'owner')
    expect(url).toMatch(new RegExp(`/job/${code}$`))
    const view = links.view(code)!
    expect(view).toMatchObject({ organisation: 'SGK Maintenance', reference: 'FR-2', status: 'In progress', workerName: 'Farai' })
    expect(view.steps.find((step) => step.label === 'Signed off')?.done).toBe(false)
    expect(view.signature?.signerName).toBe('Mrs Moyo')
    expect(view.photos.before).toHaveLength(1)
    expect(view.photos.after).toHaveLength(0)
    expect(view.bills).toEqual([{ kind: 'invoice', amount: 80, currency: 'USD', status: 'active', payUrl: 'https://pay.example/p/ABC' }])
    expect(JSON.stringify(view)).not.toContain(FARAI)
    expect(JSON.stringify(view)).not.toContain('+263771000001')
    expect(links.view('not-a-real-code-at-all')).toBeUndefined()
    expect(links.revokeAll(ORG, 'RUN-2')).toBe(1)
    expect(links.view(code)).toBeUndefined()
  })
})

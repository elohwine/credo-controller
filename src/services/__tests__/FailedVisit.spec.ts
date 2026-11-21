import 'reflect-metadata'

import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { fieldJobCategory } from '../../config/fieldJobCategory'
import { FAILED_VISIT_REASONS, rebookDateError } from '../../config/failedVisit'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { ReconciliationService } from '../ReconciliationService'

const route = jest.fn<(params: any) => { routed: number; recipients: unknown[] }>(() => ({ routed: 1, recipients: [] }))
jest.unstable_mockModule('../WorkflowStageInboxService', () => ({ routeWorkflowStageInbox: route }))
const { FieldExecutionActions } = await import('../workflow/actions/FieldExecutionActions')

const ORG = 'org-sgk'
const FARAI = 'user-farai'
const OFFICE = 'user-kelvin'

describe('A failed visit and its re-booking', () => {
  let db: Database.Database
  const restores: Array<{ mockRestore: () => void }> = []
  const events: Array<{ type: string; metadata: any }> = []
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  function addJob(id: string, pauseReason: string, extra: Record<string, unknown> = {}) {
    db.prepare(
      `INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, output, created_at)
       VALUES (?, 'tpl-fept-field-execution-org', ?, 'paused', ?, ?, '2026-11-20T08:00:00Z')`,
    ).run(
      id,
      ORG,
      JSON.stringify({ reference: 'FR-1', storeNumber: '1042', assigneeId: FARAI, scheduledDate: '2026-11-20' }),
      JSON.stringify({ workflowStage: 'ASSIGNED', pauseReason, assignment: { assigneeId: FARAI }, ...extra }),
    )
  }
  const stateOf = (id: string) => JSON.parse((db.prepare(`SELECT output FROM workflow_runs WHERE id = ?`).get(id) as any).output)
  const inputOf = (id: string) => JSON.parse((db.prepare(`SELECT input FROM workflow_runs WHERE id = ?`).get(id) as any).input)

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY, workflow_id TEXT, tenant_id TEXT, status TEXT, input TEXT, output TEXT, error TEXT,
        trigger_type TEXT, trigger_ref TEXT, actions_snapshot TEXT, current_step INTEGER, total_steps INTEGER,
        started_at TEXT, completed_at TEXT, created_at TEXT
      );
      CREATE TABLE wallet_pending_offers (source_type TEXT, source_id TEXT, workflow_run_id TEXT, resolved_at TEXT);
      CREATE TABLE org_vans (id TEXT, org_tenant_id TEXT, registration TEXT, status TEXT);
      INSERT INTO org_vans VALUES ('VAN-1', '${ORG}', 'AEB 1234', 'active'), ('VAN-2', '${ORG}', 'AEC 9999', 'off_road');
    `)
    events.length = 0
    route.mockClear()
    restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
    restores.push(
      jest.spyOn(ReconciliationService.prototype, 'recordEvent').mockImplementation((_ref, type, _source, metadata) => {
        events.push({ type, metadata })
      }),
    )
  })

  afterEach(() => {
    while (restores.length) restores.pop()!.mockRestore()
    db.close()
  })

  it('records the reason, marks the job failed and tells whoever books jobs, once', () => {
    addJob('RUN-1', 'await_arrival')
    const first = FieldExecutionActions.reportFailedVisit('RUN-1', { reason: 'store_closed', note: 'Shutters down at 9' }, FARAI)
    expect(first.created).toBe(true)
    expect(first.visit).toMatchObject({ reason: 'store_closed', note: 'Shutters down at 9', by: FARAI, workerId: FARAI, status: 'open' })

    const again = FieldExecutionActions.reportFailedVisit('RUN-1', { reason: 'no_access' }, FARAI)
    expect(again).toEqual({ visit: first.visit, created: false })

    const state = stateOf('RUN-1')
    expect(state.failedVisits).toHaveLength(1)
    expect(state.pauseReason).toBe('await_arrival')
    expect(fieldJobCategory({ status: 'paused', input: inputOf('RUN-1'), output: state })).toBe('failed')
    expect(route).toHaveBeenCalledTimes(1)
    expect(route.mock.calls[0][0]).toMatchObject({
      requestType: 'field.failed_visit',
      title: 'Visit failed on job FR-1',
      body: 'The visit could not be finished. Store closed: Shutters down at 9. Re-book the job with a new date.',
    })
    expect(events.map((event) => event.type)).toEqual(['FAILED_VISIT_REPORTED'])
  })

  it('refuses a visit with no reason, "Other" without a note, and steps that are not on site', () => {
    addJob('RUN-2', 'await_evidence_before')
    expect(() => FieldExecutionActions.reportFailedVisit('RUN-2', { reason: '' }, FARAI)).toThrow('Choose why')
    expect(() => FieldExecutionActions.reportFailedVisit('RUN-2', { reason: 'other' }, FARAI)).toThrow('Say what stopped')
    addJob('RUN-3', 'await_acknowledgement')
    expect(() => FieldExecutionActions.reportFailedVisit('RUN-3', { reason: 'no_access' }, FARAI)).toThrow('out on site')
    addJob('RUN-4', 'await_assignment')
    expect(() => FieldExecutionActions.reportFailedVisit('RUN-4', { reason: 'no_access' }, FARAI)).toThrow('out on site')
    expect(route).not.toHaveBeenCalled()
  })

  it('re-books with a new date and van, closes the office card and tells the worker', () => {
    addJob('RUN-5', 'await_evidence_before')
    const { visit } = FieldExecutionActions.reportFailedVisit('RUN-5', { reason: 'parts_needed' }, FARAI)
    route.mockClear()

    expect(() => FieldExecutionActions.rebookFailedVisit('RUN-5', visit.id, { scheduledDate: '2020-01-01' }, OFFICE)).toThrow('past')
    expect(() => FieldExecutionActions.rebookFailedVisit('RUN-5', visit.id, { scheduledDate: tomorrow, vanId: 'VAN-2' }, OFFICE)).toThrow(
      'not on the road',
    )

    const result = FieldExecutionActions.rebookFailedVisit(
      'RUN-5',
      visit.id,
      { scheduledDate: tomorrow, vanId: 'VAN-1', note: 'Parts collected' },
      OFFICE,
    )
    expect(result.visit).toMatchObject({ status: 'rebooked', rebookedFor: tomorrow, rebookedBy: OFFICE, rebookedTo: FARAI })
    expect(inputOf('RUN-5')).toMatchObject({ scheduledDate: tomorrow, vanId: 'VAN-1', vehicleReference: 'AEB 1234' })
    const state = stateOf('RUN-5')
    expect(state.pauseReason).toBe('await_evidence_before')
    expect(fieldJobCategory({ status: 'paused', input: inputOf('RUN-5'), output: state })).not.toBe('failed')
    expect(route).toHaveBeenCalledTimes(1)
    expect(route.mock.calls[0][0]).toMatchObject({
      requestType: 'field.site_access',
      assigneeUserId: FARAI,
      title: `Job FR-1 re-booked for ${tomorrow}`,
    })
    expect(events.map((event) => event.type)).toEqual(['FAILED_VISIT_REPORTED', 'FAILED_VISIT_REBOOKED'])

    // Re-booking twice changes nothing; a new failure on the next visit is a second record.
    expect(FieldExecutionActions.rebookFailedVisit('RUN-5', visit.id, { scheduledDate: '2099-01-01' }, OFFICE).scheduledDate).toBe(tomorrow)
    const second = FieldExecutionActions.reportFailedVisit('RUN-5', { reason: 'weather' }, FARAI)
    expect(second.created).toBe(true)
    expect(stateOf('RUN-5').failedVisits).toHaveLength(2)
  })

  it('keeps one plain list of reasons and checks the new date', () => {
    expect(FAILED_VISIT_REASONS.map((item) => item.code)).toContain('no_access')
    expect(FAILED_VISIT_REASONS.every((item) => !/_/.test(item.label))).toBe(true)
    expect(rebookDateError('', '2026-11-21')).toBe('Choose the new date for the visit.')
    expect(rebookDateError('2026-11-20', '2026-11-21')).toBe('The new date cannot be in the past.')
    expect(rebookDateError('2026-11-21', '2026-11-21')).toBeUndefined()
  })
})

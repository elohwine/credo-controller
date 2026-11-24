import 'reflect-metadata'

import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { jobIntakeRepository } from '../../persistence/JobIntakeRepository'
import { JobAttentionService, jobLabel, weekKey } from '../JobAttentionService'
import { jobDashboardSettingsService } from '../JobDashboardSettingsService'

const ORG = 'org-sgk'
const OWNER_WALLET = 'wallet-owner'
const ADMIN_WALLET = 'wallet-admin'
const WORKER_WALLET = 'wallet-farai'

const HOUR = 3_600_000
const DAY = 24 * HOUR
// A Tuesday, after the summary hour.
const TUESDAY = new Date('2026-11-24T07:00:00Z')
const MONDAY = new Date('2026-11-23T07:00:00Z')

function migration(file: string): string {
  return readFileSync(join(process.cwd(), 'migrations', file), 'utf-8')
}

describe('Stuck job alerts', () => {
  let db: Database.Database
  const restores: Array<{ mockRestore: () => void }> = []
  const service = new JobAttentionService()
  const ago = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString()

  function addJob(
    id: string,
    input: Record<string, unknown>,
    status: string,
    createdAt: string,
    output: Record<string, unknown> = {},
    workflowId = 'tpl-fept-field-execution-org',
    completedAt?: string,
  ) {
    db.prepare(
      `INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, output, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workflowId, ORG, status, JSON.stringify(input), JSON.stringify(output), createdAt, completedAt ?? null)
  }

  function step(runId: string, at: string) {
    db.prepare(`INSERT INTO workflow_steps (id, run_id, completed_at) VALUES (?, ?, ?)`).run(
      `${runId}-${at}`,
      runId,
      at,
    )
  }

  const cardsFor = (wallet: string) =>
    db
      .prepare(
        `SELECT title, body, source_id AS sourceId, metadata, resolved_at AS resolvedAt FROM wallet_pending_offers WHERE tenant_id = ? ORDER BY created_at`,
      )
      .all(wallet) as Array<{
      title: string
      body: string
      sourceId: string
      metadata: string
      resolvedAt: string | null
    }>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT, phone_hash TEXT, email_hash TEXT);
      CREATE TABLE org_memberships (org_tenant_id TEXT, user_id TEXT, role TEXT, status TEXT);
      CREATE TABLE org_contacts (
        id TEXT PRIMARY KEY, org_tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, did TEXT,
        notes TEXT, created_at TEXT, updated_at TEXT, wallet_tenant_id TEXT, linked_at TEXT, link_token TEXT,
        link_token_expires_at TEXT, contact_scope TEXT
      );
      CREATE TABLE workflows (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, category TEXT);
      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY, workflow_id TEXT, tenant_id TEXT, status TEXT, input TEXT, output TEXT, created_at TEXT, completed_at TEXT
      );
      CREATE TABLE workflow_steps (id TEXT PRIMARY KEY, run_id TEXT, started_at TEXT, completed_at TEXT, created_at TEXT);
      CREATE TABLE payment_links (
        id TEXT PRIMARY KEY, merchant_id TEXT, description TEXT, amount REAL, currency TEXT, invoice_ref TEXT,
        status TEXT, metadata TEXT, created_at TEXT, shortlink_url TEXT
      );
      CREATE TABLE organizations (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT);
      CREATE TABLE wallet_pending_offers (
        id TEXT PRIMARY KEY, tenant_id TEXT, issuer_tenant_id TEXT, source_type TEXT, source_id TEXT,
        credential_type TEXT, offer_uri TEXT, title TEXT, body TEXT, metadata TEXT, workflow_run_id TEXT,
        created_at TEXT, resolved_at TEXT
      );
    `)
    db.exec(migration('009_create_payroll.sql'))
    db.exec(migration('129_job_intake.sql'))
    db.exec(migration('152_stores_staff_vans_mail_intake.sql'))
    db.exec(migration('153_employee_staff_link.sql'))
    db.exec(migration('155_job_mail_checks_rates_links.sql'))
    db.exec(migration('154_job_attention_log.sql'))
    db.exec(migration('156_job_history_imports.sql'))
    db.exec(migration('157_old_system_import_details.sql'))
    db.exec(migration('158_job_history_runs.sql'))
    db.exec(migration('159_job_dashboard_settings.sql'))
    db.prepare(`INSERT INTO organizations (id, tenant_id, name) VALUES ('o1', ?, 'SGK')`).run(ORG)
    db.prepare(
      `INSERT INTO workflows (id, tenant_id, name, category) VALUES ('tpl-fept-field-execution-org', ?, 'Field job', 'field_execution_fept')`,
    ).run(ORG)
    db.prepare(
      `INSERT INTO workflows (id, tenant_id, name, category) VALUES ('tpl-purchase-org', ?, 'Purchase', 'procurement')`,
    ).run(ORG)
    for (const [userId, wallet, role] of [
      ['u-owner', OWNER_WALLET, 'owner'],
      ['u-admin', ADMIN_WALLET, 'admin'],
      ['u-farai', WORKER_WALLET, 'field_worker'],
    ]) {
      db.prepare(`INSERT INTO ssi_users (id, tenant_id) VALUES (?, ?)`).run(userId, wallet)
      db.prepare(`INSERT INTO org_memberships (org_tenant_id, user_id, role, status) VALUES (?, ?, ?, 'active')`).run(
        ORG,
        userId,
        role,
      )
    }
    restores.push(jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db))
  })

  afterEach(() => {
    while (restores.length) restores.pop()!.mockRestore()
    db.close()
  })

  it('tells the owner and admin the moment a job stops, in plain words, and not the worker', () => {
    addJob(
      '11111111-2222-3333-4444-555555555555',
      { poNumber: 'PO-77', description: 'Leaking tap', assigneeId: 'u-farai' },
      'failed',
      ago(TUESDAY, 3 * HOUR),
      {},
      undefined,
      ago(TUESDAY, HOUR),
    )

    service.onRunFailed('11111111-2222-3333-4444-555555555555', TUESDAY)

    for (const wallet of [OWNER_WALLET, ADMIN_WALLET]) {
      const [card] = cardsFor(wallet)
      expect(card.title).toBe('Job PO-77 stopped')
      expect(card.body).toMatch(/could not finish/i)
      expect(card.body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
      expect(JSON.parse(card.metadata)).toMatchObject({ outcome: 'failed', attention: true, orgName: 'SGK' })
    }
    expect(cardsFor(WORKER_WALLET)).toHaveLength(0)
  })

  it('never names a job by its id', () => {
    expect(jobLabel({ reference: '11111111-2222-3333-4444-555555555555', description: 'Leaking tap' })).toBe(
      'the job "Leaking tap"',
    )
    expect(jobLabel({ reference: 'abcdef0123456789abcdef0123456789' })).toBe('a job')
    expect(jobLabel({ poNumber: 'PO-9', reference: 'ignored' })).toBe('job PO-9')
  })

  it('says it once: the same stuck job is not announced again by the next hourly check', () => {
    addJob('RUN-FAIL', { poNumber: 'PO-1' }, 'failed', ago(TUESDAY, 3 * HOUR), {}, undefined, ago(TUESDAY, HOUR))
    expect(service.sweepOrganisation(ORG, TUESDAY).announced).toBe(1)
    expect(service.sweepOrganisation(ORG, new Date(TUESDAY.getTime() + HOUR)).announced).toBe(0)
    expect(cardsFor(OWNER_WALLET).filter((card) => card.title.includes('PO-1'))).toHaveLength(1)
  })

  it('finds late, unassigned and not-moving jobs, and also tells the worker whose job is not moving', () => {
    addJob(
      'RUN-LATE',
      { poNumber: 'PO-2', scheduledDate: '2026-11-22', assigneeId: 'u-farai' },
      'paused',
      ago(TUESDAY, 3 * DAY),
      { assignment: { assigneeId: 'u-farai' }, workflowStage: 'ASSIGNED' },
    )
    addJob('RUN-NOBODY', { poNumber: 'PO-3' }, 'paused', ago(TUESDAY, 2 * DAY))
    addJob('RUN-SLOW', { poNumber: 'PO-4', assigneeId: 'u-farai' }, 'paused', ago(TUESDAY, 4 * DAY), {
      assignment: { assigneeId: 'u-farai' },
      workflowStage: 'IN_PROGRESS',
    })
    step('RUN-SLOW', ago(TUESDAY, 3 * DAY))
    addJob('RUN-FRESH', { poNumber: 'PO-5' }, 'paused', ago(TUESDAY, 2 * HOUR))
    addJob('RUN-BUSY', { poNumber: 'PO-6', assigneeId: 'u-farai' }, 'paused', ago(TUESDAY, 4 * DAY), {
      assignment: { assigneeId: 'u-farai' },
      workflowStage: 'IN_PROGRESS',
    })
    step('RUN-BUSY', ago(TUESDAY, 3 * HOUR))

    const items = service.attention(ORG, TUESDAY)
    expect(items.map((item) => `${item.kind}:${item.runId}`).sort()).toEqual([
      'overdue:RUN-LATE',
      'stalled:RUN-SLOW',
      'unassigned:RUN-NOBODY',
    ])

    service.sweepOrganisation(ORG, TUESDAY)
    const worker = cardsFor(WORKER_WALLET).map((card) => card.title)
    expect(worker).toEqual(expect.arrayContaining(['Job PO-4 has not moved', 'Job PO-2 is late']))
    expect(worker).not.toContain('Job PO-3 has nobody on it')
    expect(cardsFor(OWNER_WALLET).map((card) => card.title)).toEqual(
      expect.arrayContaining(['Job PO-3 has nobody on it']),
    )
  })

  it('catches a step that started and never finished', () => {
    addJob('RUN-CRASH', { poNumber: 'PO-7', assigneeId: 'u-farai' }, 'running', ago(TUESDAY, 3 * HOUR), {
      assignment: { assigneeId: 'u-farai' },
    })
    expect(service.attention(ORG, TUESDAY)[0]).toMatchObject({
      kind: 'stalled',
      headline: 'Job PO-7 is stuck mid-step',
    })
  })

  it('catches a job that came in and was never booked', () => {
    const intake = jobIntakeRepository.create(ORG, 'mail:jobs', {
      storeNumber: '1042',
      poNumber: 'PO-8',
      description: 'Door will not close',
      amount: 0,
      currency: 'USD',
    })
    db.prepare(`UPDATE job_intakes SET created_at = ? WHERE id = ?`).run(ago(TUESDAY, 2 * DAY), intake.id)
    const [item] = service.attention(ORG, TUESDAY)
    expect(item).toMatchObject({
      kind: 'waiting',
      intakeId: intake.id,
      headline: 'Job PO-8 is still waiting to be booked',
    })
    expect(service.sweepOrganisation(ORG, TUESDAY).announced).toBe(1)
  })

  it('only adds first-response alerts after the organisation configures a target', () => {
    jobDashboardSettingsService.saveResponseTargets(ORG, { urgent: 60 })
    addJob('RUN-RESPONSE', { poNumber: 'PO-RESP', priority: 'urgent' }, 'paused', ago(TUESDAY, 50 * 60_000))

    expect(service.attention(ORG, TUESDAY)[0]).toMatchObject({
      kind: 'response_at_risk',
      runId: 'RUN-RESPONSE',
      elapsedMinutes: 50,
      targetMinutes: 60,
    })
    db.prepare(`UPDATE workflow_runs SET created_at = ? WHERE id = 'RUN-RESPONSE'`).run(ago(TUESDAY, 70 * 60_000))
    expect(service.attention(ORG, TUESDAY)[0]).toMatchObject({
      kind: 'response_breached',
      elapsedMinutes: 70,
      targetMinutes: 60,
    })

    const intake = jobIntakeRepository.create(ORG, 'mail:jobs', {
      poNumber: 'PO-INTAKE',
      description: 'Door repair',
      amount: 0,
      currency: 'USD',
      importedDetails: { priority: 'urgent' },
    })
    db.prepare(`UPDATE job_intakes SET created_at = ? WHERE id = ?`).run(ago(TUESDAY, 50 * 60_000), intake.id)
    expect(service.attention(ORG, TUESDAY).find((item) => item.intakeId === intake.id)).toMatchObject({
      kind: 'response_at_risk',
      elapsedMinutes: 50,
      targetMinutes: 60,
    })
  })

  it('announces again when a job is fixed and then stops a second time, and closes the old card when it is fixed', () => {
    addJob('RUN-AGAIN', { poNumber: 'PO-9' }, 'failed', ago(TUESDAY, 3 * HOUR), {}, undefined, ago(TUESDAY, HOUR))
    service.sweepOrganisation(ORG, TUESDAY)
    expect(cardsFor(OWNER_WALLET)[0].resolvedAt).toBeNull()

    db.prepare(`UPDATE workflow_runs SET status = 'running', completed_at = NULL WHERE id = 'RUN-AGAIN'`).run()
    step('RUN-AGAIN', TUESDAY.toISOString())
    service.sweepOrganisation(ORG, new Date(TUESDAY.getTime() + 10 * 60_000))
    expect(cardsFor(OWNER_WALLET)[0].resolvedAt).not.toBeNull()

    const later = new Date(TUESDAY.getTime() + 20 * 60_000)
    db.prepare(`UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = 'RUN-AGAIN'`).run(
      later.toISOString(),
    )
    expect(service.sweepOrganisation(ORG, later).announced).toBe(1)
    expect(cardsFor(OWNER_WALLET).filter((card) => card.title === 'Job PO-9 stopped')).toHaveLength(2)
  })

  it('does not announce one by one a problem older than two weeks, but still lists and sums it up', () => {
    addJob('RUN-OLD', { poNumber: 'PO-10' }, 'failed', ago(TUESDAY, 40 * DAY), {}, undefined, ago(TUESDAY, 30 * DAY))
    expect(service.attention(ORG, TUESDAY)).toHaveLength(1)
    const result = service.sweepOrganisation(ORG, TUESDAY)
    expect(result.announced).toBe(0)
    expect(result.summaries).toBe(1)
    expect(cardsFor(OWNER_WALLET).map((card) => card.title)).toEqual(['Still stuck: 1 job needs attention'])
  })

  it('sends one daily summary for jobs stuck a day or more, replaces yesterday, and waits for the summary hour', () => {
    addJob('RUN-D1', { poNumber: 'PO-11' }, 'failed', ago(TUESDAY, 3 * DAY), {}, undefined, ago(TUESDAY, 2 * DAY))
    addJob('RUN-D2', { poNumber: 'PO-12' }, 'failed', ago(TUESDAY, 3 * HOUR), {}, undefined, ago(TUESDAY, HOUR))

    const early = new Date('2026-11-24T04:00:00Z')
    expect(service.sweepOrganisation(ORG, early).summaries).toBe(0)

    expect(service.sweepOrganisation(ORG, TUESDAY).summaries).toBe(1)
    expect(service.sweepOrganisation(ORG, new Date(TUESDAY.getTime() + HOUR)).summaries).toBe(0)
    const summary = cardsFor(OWNER_WALLET).find((card) => /needs? attention/.test(card.title))!
    expect(summary.title).toBe('1 job needs attention') // PO-12 is only hours old: announced, not summed up yet
    expect(summary.body).toContain('1 stopped')
    expect(summary.body).toContain('Longest: job PO-11, 2 days')
    expect(JSON.parse(summary.metadata)).toMatchObject({ outcome: 'daily', count: 1 })

    const wednesday = new Date('2026-11-25T07:00:00Z')
    expect(service.sweepOrganisation(ORG, wednesday).summaries).toBe(1)
    const summaries = cardsFor(OWNER_WALLET).filter((card) => /needs? attention/.test(card.title))
    expect(summaries).toHaveLength(2)
    expect(summaries[0].resolvedAt).not.toBeNull()
    expect(summaries[1].title).toBe('Still stuck: 2 jobs need attention')
  })

  it('sends the weekly list on Monday instead of the daily one, and nothing when nothing is stuck', () => {
    expect(service.sweepOrganisation(ORG, MONDAY).summaries).toBe(0)

    addJob('RUN-W1', { poNumber: 'PO-13' }, 'failed', ago(MONDAY, 2 * HOUR), {}, undefined, ago(MONDAY, HOUR))
    addJob('RUN-W2', { poNumber: 'PO-14' }, 'paused', ago(MONDAY, 3 * DAY))
    expect(service.sweepOrganisation(ORG, MONDAY).summaries).toBe(1)
    const week = cardsFor(ADMIN_WALLET).find((card) => card.title.startsWith('Weekly jobs check'))!
    expect(week.title).toBe('Weekly jobs check: 2 jobs need attention')
    expect(week.body).toContain('1 stopped, 1 with nobody on them')
    expect(week.body).toContain('1 job stopped this week')
    expect(JSON.parse(week.metadata).outcome).toBe('weekly')
    expect(weekKey(MONDAY)).toBe('2026-W48')
    expect(service.sweepOrganisation(ORG, new Date(MONDAY.getTime() + 3 * HOUR)).summaries).toBe(0)
  })

  it('leaves other workflows alone: a failed purchase is not a field job alert', () => {
    addJob(
      'RUN-BUY',
      { title: 'Buy pipes' },
      'failed',
      ago(TUESDAY, 3 * HOUR),
      {},
      'tpl-purchase-org',
      ago(TUESDAY, HOUR),
    )
    expect(service.attention(ORG, TUESDAY)).toEqual([])
    expect(service.sweep(TUESDAY)).toMatchObject({ announced: 0, summaries: 0 })
    expect(cardsFor(OWNER_WALLET)).toHaveLength(0)
  })

  it('keeps mailbox and uploaded jobs off the inbox until someone takes them up here', () => {
    addJob('RUN-MAIL', { poNumber: 'PO-MAIL', sourceType: 'email' }, 'paused', ago(TUESDAY, 2 * DAY))
    addJob('RUN-FILE', { poNumber: 'PO-FILE', sourceType: 'import' }, 'paused', ago(TUESDAY, 2 * DAY))
    const upload = jobIntakeRepository.create(ORG, 'import', {
      poNumber: 'PO-WAIT',
      description: 'Leaking tap',
      amount: 0,
      currency: 'USD',
      sourceType: 'import',
    })
    db.prepare(`UPDATE job_intakes SET created_at = ? WHERE id = ?`).run(ago(TUESDAY, 2 * DAY), upload.id)
    // An old card for the mailbox job, from before the rule, is closed by the next check.
    db.prepare(
      `INSERT INTO job_attention_log (org_tenant_id, scope, subject, kind, notified_at) VALUES (?, 'run', 'RUN-MAIL', 'unassigned', ?)`,
    ).run(ORG, ago(TUESDAY, DAY))
    db.prepare(
      `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, title, created_at)
       VALUES ('old', ?, ?, 'workflow_update', ?, 'Job PO-MAIL has nobody on it', ?)`,
    ).run(OWNER_WALLET, ORG, `run:RUN-MAIL:attention:unassigned:${ago(TUESDAY, DAY)}`, ago(TUESDAY, DAY))

    // Still listed on Jobs as needing attention.
    expect(
      service
        .attention(ORG, TUESDAY)
        .map((item) => `${item.kind}:${item.runId || item.intakeId}`)
        .sort(),
    ).toEqual(['unassigned:RUN-FILE', 'unassigned:RUN-MAIL', `waiting:${upload.id}`].sort())
    expect(service.sweepOrganisation(ORG, TUESDAY)).toEqual({ announced: 0, summaries: 0 })
    expect(cardsFor(OWNER_WALLET).filter((card) => !card.resolvedAt)).toHaveLength(0)

    // Handed out from the job view and then left: now it is inbox news.
    db.prepare(`UPDATE workflow_runs SET input = ?, output = ? WHERE id = 'RUN-MAIL'`).run(
      JSON.stringify({ poNumber: 'PO-MAIL', sourceType: 'email', scheduledDate: '2026-11-22', assigneeId: 'u-farai' }),
      JSON.stringify({
        assignment: { assigneeId: 'u-farai' },
        workflowStage: 'ASSIGNED',
        reassignments: [{ to: 'u-farai', by: 'u-admin' }],
      }),
    )
    service.sweepOrganisation(ORG, new Date(TUESDAY.getTime() + HOUR))
    expect(cardsFor(OWNER_WALLET).filter((card) => !card.resolvedAt).map((card) => card.title)).toContain(
      'Job PO-MAIL is late',
    )
  })
})

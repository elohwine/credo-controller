import Database from 'better-sqlite3'
import { readFileSync } from 'fs'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { clampDoneDays, finishedOutcome, InboxPreferenceService } from '../InboxPreferenceService'

describe('inbox Done window and job-finished updates', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/091_create_integration_outbox.sql', 'utf8'))
    db.exec(`
      CREATE TABLE organizations (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT);
      CREATE TABLE workflow_runs (id TEXT PRIMARY KEY, tenant_id TEXT, status TEXT, input TEXT, output TEXT);
      CREATE TABLE wallet_pending_offers (
        id TEXT PRIMARY KEY, tenant_id TEXT, issuer_tenant_id TEXT, source_type TEXT, source_id TEXT,
        credential_type TEXT, offer_uri TEXT, title TEXT, body TEXT, metadata TEXT, workflow_run_id TEXT,
        created_at TEXT, accepted_at TEXT, resolved_at TEXT, last_error TEXT
      );
    `)
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    db.exec(readFileSync('migrations/131_inbox_done_and_job_updates.sql', 'utf8'))
    db.exec(readFileSync('migrations/134_inbox_read_state.sql', 'utf8'))
    DatabaseManager.setDatabase(db)

    db.prepare('INSERT INTO organizations VALUES (?, ?, ?)').run('o1', 'org-a', 'Acme Works')
    db.prepare('INSERT INTO workflow_runs VALUES (?, ?, ?, ?, ?)').run(
      'run-1',
      'org-a',
      'running',
      JSON.stringify({ poNumber: 'FR-1' }),
      JSON.stringify({ workflowStage: 'EXECUTING' }),
    )
    const step = db.prepare(
      `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, workflow_run_id)
       VALUES (?, ?, 'org-a', ?, ?, 'run-1')`,
    )
    step.run('s1', 'wallet-1', 'workflow_stage_action', 'run-1:signoff')
    step.run('s2', 'wallet-1', 'workflow_stage_action', 'run-1:stage:await_ack')
    step.run('s3', 'wallet-2', 'workflow_stage_action', 'run-1:stage:await_pay')
    db.prepare(
      `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, workflow_run_id)
       VALUES ('c1', 'wallet-3', 'org-a', 'credential_offer', 'x', 'run-1')`,
    ).run()
  })

  const updates = () =>
    db
      .prepare(`SELECT * FROM wallet_pending_offers WHERE source_type = 'workflow_update' ORDER BY tenant_id`)
      .all() as Array<Record<string, any>>

  it('gives each person with a step one update when the job completes', () => {
    db.prepare(`UPDATE workflow_runs SET status = 'completed' WHERE id = 'run-1'`).run()
    const rows = updates()
    expect(rows.map((r) => r.tenant_id)).toEqual(['wallet-1', 'wallet-2'])
    expect(rows[0].title).toBe('Job FR-1 is complete')
    expect(rows[0].source_id).toBe('run:run-1:finished')
    expect(JSON.parse(rows[0].metadata)).toMatchObject({ outcome: 'completed', orgName: 'Acme Works' })

    const whatsapp = db
      .prepare(`SELECT COUNT(*) AS n FROM integration_outbox WHERE topic = 'wallet.inbox.whatsapp'`)
      .get() as { n: number }
    // 4 seeded cards + 2 updates, all forwarded through migration 130.
    expect(whatsapp.n).toBe(6)
  })

  it('fires once even if the stage also flips to COMPLETED afterwards', () => {
    db.prepare(`UPDATE workflow_runs SET status = 'completed' WHERE id = 'run-1'`).run()
    db.prepare(`UPDATE workflow_runs SET output = json_object('workflowStage', 'COMPLETED') WHERE id = 'run-1'`).run()
    db.prepare(`UPDATE workflow_runs SET status = 'running' WHERE id = 'run-1'`).run()
    db.prepare(`UPDATE workflow_runs SET status = 'completed' WHERE id = 'run-1'`).run()
    expect(updates()).toHaveLength(2)
  })

  it('says cancelled when the field stage is revoked', () => {
    db.prepare(`UPDATE workflow_runs SET output = json_object('workflowStage', 'REVOKED') WHERE id = 'run-1'`).run()
    const rows = updates()
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBe('Job FR-1 was cancelled')
  })

  it('ignores non-final stage moves', () => {
    db.prepare(`UPDATE workflow_runs SET output = json_object('workflowStage', 'RECONCILED') WHERE id = 'run-1'`).run()
    expect(updates()).toHaveLength(0)
  })

  it('stores the Done window per person and inbox', () => {
    const prefs = new InboxPreferenceService()
    expect(prefs.get('wallet-1').doneDays).toBe(7)
    prefs.set('wallet-1', 'personal', 30)
    prefs.set('wallet-1', 'org-a', 90)
    expect(prefs.get('wallet-1', 'personal').doneDays).toBe(30)
    expect(prefs.get('wallet-1', 'org-a').doneDays).toBe(90)
    expect(() => prefs.set('wallet-1', 'personal', 12)).toThrow()
    expect(clampDoneDays('abc')).toBe(7)
    expect(clampDoneDays(400)).toBe(90)
  })

  it('keeps read items and last seen per person and inbox, on the server', () => {
    const prefs = new InboxPreferenceService()
    const now = new Date('2026-03-01T10:00:00Z')
    expect(prefs.getReadState('wallet-1')).toEqual({ scope: 'personal', lastSeenAt: undefined, readKeys: [] })

    prefs.updateReadState('wallet-1', 'personal', { readKeys: ['run:1', 'offer:a', 'run:1'], lastSeenAt: '2026-03-01T09:00:00Z' }, now)
    prefs.updateReadState('wallet-1', 'org-a', { readKeys: ['wr:9'] }, now)
    const personal = prefs.getReadState('wallet-1', 'personal')
    expect(personal.readKeys.sort()).toEqual(['offer:a', 'run:1'])
    expect(personal.lastSeenAt).toBe('2026-03-01T09:00:00.000Z')
    expect(prefs.getReadState('wallet-1', 'org-a').readKeys).toEqual(['wr:9'])
    expect(prefs.getReadState('wallet-2', 'personal').readKeys).toEqual([])

    // Marking unread removes it; last seen never moves back, and is capped near "now".
    const after = prefs.updateReadState('wallet-1', 'personal', { unreadKeys: ['run:1'], lastSeenAt: '2026-01-01T00:00:00Z' }, now)
    expect(after.readKeys).toEqual(['offer:a'])
    expect(after.lastSeenAt).toBe('2026-03-01T09:00:00.000Z')
    expect(prefs.updateReadState('wallet-1', 'personal', { lastSeenAt: '2030-01-01T00:00:00Z' }, now).lastSeenAt).toBe('2026-03-01T10:05:00.000Z')

    // Old marks are dropped after 180 days.
    const later = new Date('2026-12-01T00:00:00Z')
    expect(prefs.updateReadState('wallet-1', 'personal', { readKeys: ['new:1'] }, later).readKeys).toEqual(['new:1'])

    expect(() => prefs.updateReadState('wallet-1', 'personal', { readKeys: 'run:1' })).toThrow()
    expect(() => prefs.updateReadState('wallet-1', 'personal', { readKeys: [''] })).toThrow()
    expect(() => prefs.updateReadState('wallet-1', 'personal', { readKeys: Array.from({ length: 501 }, (_, i) => `k${i}`) })).toThrow()
    expect(() => prefs.updateReadState('wallet-1', 'personal', { lastSeenAt: 'yesterday' })).toThrow()
  })

  it('names how a finished item ended', () => {
    expect(finishedOutcome({ sourceType: 'workflow_update' })).toBe('seen')
    expect(finishedOutcome({ sourceType: 'credential_offer', lastError: 'dismissed_by_user' })).toBe('dismissed')
    expect(finishedOutcome({ sourceType: 'workflow_request_assignment', requestStatus: 'rejected' })).toBe('rejected')
    expect(finishedOutcome({ sourceType: 'workflow_stage_action' })).toBe('done')
    expect(finishedOutcome({ sourceType: 'workflow_stage_action', requestStatus: 'approved' })).toBe('approved')
    expect(finishedOutcome({ sourceType: 'credential_offer', acceptedAt: '2024' })).toBe('accepted')
  })
})

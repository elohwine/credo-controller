import Database from 'better-sqlite3'
import fs from 'fs'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { JobIntakeRepository } from '../../../persistence/JobIntakeRepository'
import { JobIntakeController } from '../JobIntakeController'

describe('JobIntakeController', () => {
  const controller = new JobIntakeController()
  const repository = new JobIntakeRepository()

  beforeEach(() => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE org_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        org_tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `)
    db.exec(fs.readFileSync(`${process.cwd()}/migrations/129_job_intake.sql`, 'utf8'))
    DatabaseManager.setDatabase(db)
    db.prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-a', 'dispatcher-a', 'org-a', 'dispatcher', 'active')
  })

  afterEach(() => DatabaseManager.close())

  const requestFor = (tenantId: string, id: string, orgRole?: string) =>
    ({ user: { tenantId, id, orgRole }, headers: {} }) as any

  it('creates a server-referenced unassigned intake and retains the client PO separately', () => {
    const intake = controller.create(requestFor('org-a', 'dispatcher-a', 'dispatcher'), {
      poNumber: 'CLIENT-PO-41',
      description: 'Fix the leaking basin',
      amount: 60,
      currency: 'USD',
    })

    expect(intake).toMatchObject({
      tenantId: 'org-a',
      status: 'pending',
      payload: { poNumber: 'CLIENT-PO-41', description: 'Fix the leaking basin' },
    })
    expect(intake.payload.reference).toMatch(/^FR-/)
  })

  it('denies non-dispatch roles and rejects invalid field-worker assignment roles', async () => {
    expect(() =>
      controller.list(requestFor('org-a', 'dispatcher-a', 'member')),
    ).toThrow('Only an owner, admin, dispatcher, or manager')

    const intake = repository.create('org-a', 'dispatcher-a', {
      reference: 'FR-77',
      description: 'Repair the gate',
      amount: 100,
      currency: 'USD',
    })
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-b', 'member-b', 'org-a', 'member', 'active')

    await expect(
      controller.assign(requestFor('org-a', 'dispatcher-a', 'dispatcher'), intake.id, { assigneeId: 'member-b' }),
    ).rejects.toThrow('not an active field worker')
  })

  it('does not expose another tenant intake through the organization list', () => {
    repository.create('org-b', 'dispatcher-b', {
      reference: 'FR-private',
      description: 'Private job',
      amount: 10,
      currency: 'USD',
    })

    expect(controller.list(requestFor('org-a', 'dispatcher-a', 'dispatcher')).items).toEqual([])
  })

  it('lets only the assigned worker or an intake manager download source documents', () => {
    const bytes = Buffer.from('%PDF-1.4 source order')
    const intake = repository.create('org-a', 'dispatcher-a', {
      reference: 'FR-88',
      description: 'Repair the gate',
      amount: 100,
      currency: 'USD',
      attachments: [{
        filename: 'order.pdf',
        mediaType: 'application/pdf',
        contentBase64: bytes.toString('base64'),
      }],
    })
    const attachmentId = intake.attachments[0].id
    expect(repository.beginAssignment(intake.id, 'org-a', 'worker-a')).toBe(1)
    expect(repository.markAssigned(intake.id, 'org-a', 'run-1')).toBe(true)

    DatabaseManager.getDatabase()
      .prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-worker', 'worker-a', 'org-a', 'field_worker', 'active')
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-other', 'worker-b', 'org-a', 'field_worker', 'active')
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-cross-tenant', 'worker-a', 'org-b', 'field_worker', 'active')

    expect(controller.attachment(requestFor('org-a', 'worker-a', 'field_worker'), intake.id, attachmentId))
      .toMatchObject({
        filename: 'order.pdf',
        sha256: expect.any(String),
        dataBase64: bytes.toString('base64'),
      })
    expect(() =>
      controller.attachment(requestFor('org-a', 'worker-b', 'field_worker'), intake.id, attachmentId),
    ).toThrow('Only the assigned field worker or an intake manager')
    expect(() =>
      controller.attachment(requestFor('org-b', 'worker-a', 'field_worker'), intake.id, attachmentId),
    ).toThrow('Job intake not found')
  })
})

import { jest } from '@jest/globals'
import Database from 'better-sqlite3'
import fs from 'fs'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { JobIntakeRepository } from '../../../persistence/JobIntakeRepository'
import { operationsRegisterService } from '../../../services/OperationsRegisterService'
import { workflowService } from '../../../services/WorkflowService'
import { JobIntakeController } from '../JobIntakeController'

describe('JobIntakeController', () => {
  const controller = new JobIntakeController()
  const repository = new JobIntakeRepository()
  let executeWorkflow: any
  let runs = 0

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
    // 152 adds the repeat-booking key the repository writes.
    db.exec(
      'ALTER TABLE job_intakes ADD COLUMN dedupe_key TEXT; ALTER TABLE job_intakes ADD COLUMN duplicate_of TEXT; ALTER TABLE job_intakes ADD COLUMN source_conversation_id TEXT;',
    )
    DatabaseManager.setDatabase(db)
    executeWorkflow = jest
      .spyOn(workflowService, 'executeWorkflow')
      .mockImplementation(async () => ({ runId: `run-${++runs}`, status: 'paused' }) as any)
    jest.spyOn(operationsRegisterService, 'memberNamesSafe').mockReturnValue(new Map())
    db.prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-a', 'dispatcher-a', 'org-a', 'dispatcher', 'active')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    DatabaseManager.close()
  })

  const requestFor = (tenantId: string, id: string, orgRole?: string) =>
    ({ user: { tenantId, id, orgRole }, headers: {} }) as any

  it('puts a typed-in job straight onto the Jobs list as an unassigned job, keeping the client PO', async () => {
    const intake = await controller.create(requestFor('org-a', 'dispatcher-a', 'dispatcher'), {
      poNumber: 'CLIENT-PO-41',
      description: 'Fix the leaking basin',
      amount: 60,
      currency: 'USD',
    })

    expect(intake).toMatchObject({
      tenantId: 'org-a',
      status: 'assigned',
      workflowRunId: expect.stringMatching(/^run-/),
      payload: { poNumber: 'CLIENT-PO-41', description: 'Fix the leaking basin' },
    })
    expect(intake.payload.reference).toMatch(/^FR-/)
    const [workflow, input] = executeWorkflow.mock.calls[0]
    expect(workflow).toBe('field_execution_fept')
    expect(input).toMatchObject({ awaitAssignment: true, sourceType: 'manual', poNumber: 'CLIENT-PO-41' })
    expect(input.assigneeId).toBeUndefined()
  })

  it('opens imported jobs as ordinary jobs, gives one to the team member the old system named, and leaves a possible repeat to check', async () => {
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, ?, ?)')
      .run('membership-george', 'george', 'org-a', 'field_worker', 'active')
    jest.spyOn(operationsRegisterService, 'memberNamesSafe').mockReturnValue(new Map([['george', 'George  Tavenenhamo']]))
    const imported = (reference: string, importedWorkerName?: string) =>
      repository.create('org-a', 'dispatcher-a', {
        reference,
        description: 'Office walls need restoration',
        amount: 0,
        currency: 'GBP',
        callOut: true,
        sourceType: 'import',
        ...(importedWorkerName ? { importedWorkerName } : {}),
        importedDetails: { status: 'New', receivedAt: '2026-11-03T08:00:00' } as any,
      })
    const named = imported('MMW-1', 'george tavenenhamo')
    const nobody = imported('MMW-2', 'Peterborough')
    const repeat = imported('MMW-3')
    DatabaseManager.getDatabase().prepare('UPDATE job_intakes SET duplicate_of = ? WHERE id = ?').run(named.id, repeat.id)

    const result = await controller.openPending(requestFor('org-a', 'dispatcher-a', 'dispatcher'))

    expect(result).toEqual({ opened: 1, assigned: 1, skipped: 1, failed: 0 })
    const inputs = new Map(executeWorkflow.mock.calls.map(([, input]) => [input.reference, input]))
    expect(inputs.get('MMW-1')).toMatchObject({ assigneeId: 'george', callOut: true, sourceType: 'import' })
    expect(inputs.get('MMW-1').awaitAssignment).toBeUndefined()
    expect(inputs.get('MMW-2')).toMatchObject({ awaitAssignment: true, importedDetails: { status: 'New' } })
    expect(inputs.get('MMW-2').assigneeId).toBeUndefined()
    expect(repository.getForTenant(nobody.id, 'org-a')).toMatchObject({ status: 'assigned', workflowRunId: expect.any(String) })
    expect(repository.getForTenant(repeat.id, 'org-a')?.status).toBe('pending')

    await expect(controller.openPending(requestFor('org-a', 'dispatcher-a', 'dispatcher'))).resolves.toEqual({
      opened: 0,
      assigned: 0,
      skipped: 1,
      failed: 0,
    })
    expect(executeWorkflow).toHaveBeenCalledTimes(2)
  })

  it('keeps a job that could not start waiting to be booked', async () => {
    executeWorkflow.mockRejectedValueOnce(new Error('Field jobs are not set up'))
    const intake = await controller.create(requestFor('org-a', 'dispatcher-a', 'dispatcher'), {
      description: 'Repair the gate',
      amount: 100,
      currency: 'USD',
    })

    expect(intake).toMatchObject({ status: 'pending' })
    expect(intake.workflowRunId).toBeFalsy()
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

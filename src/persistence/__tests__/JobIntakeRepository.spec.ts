import fs from 'fs'
import path from 'path'

import Database from 'better-sqlite3'

import { DatabaseManager } from '../DatabaseManager'
import { JobIntakeRepository } from '../JobIntakeRepository'

describe('JobIntakeRepository', () => {
  const repository = new JobIntakeRepository()
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/129_job_intake.sql'), 'utf8'))
    DatabaseManager.setDatabase(db)
  })

  afterEach(() => {
    DatabaseManager.close()
  })

  const sample = (overrides: Record<string, unknown> = {}) => ({
    reference: 'FR-123',
    poNumber: 'PO-7',
    description: 'Repair a leaking tap',
    amount: 125,
    currency: 'USD',
    ...overrides,
  })

  it('stores source files and exposes them only to their tenant', () => {
    const bytes = Buffer.from('%PDF-1.4 sample document')
    const intake = repository.create('org-a', 'dispatcher-a', {
      ...sample(),
      attachments: [
        { filename: 'order.pdf', mediaType: 'application/pdf', contentBase64: bytes.toString('base64') },
      ],
    })

    expect(intake.payload.poNumber).toBe('PO-7')
    expect(intake.payload.reference).toBe('FR-123')
    expect(intake.attachments).toHaveLength(1)
    expect(repository.listForTenant('org-b')).toEqual([])
    expect(repository.getForTenant(intake.id, 'org-b')).toBeUndefined()
    expect(repository.getAttachmentForTenant(intake.id, intake.attachments[0].id, 'org-b')).toBeUndefined()
    expect(repository.getAttachmentForTenant(intake.id, intake.attachments[0].id, 'org-a')?.content).toEqual(bytes)
  })

  it('returns the original intake for a retried idempotency key', () => {
    const first = repository.create('org-a', 'dispatcher-a', sample(), 'retry-key')
    const second = repository.create('org-a', 'dispatcher-a', sample({ description: 'Changed retry payload' }), 'retry-key')

    expect(second.id).toBe(first.id)
    expect(repository.listForTenant('org-a')).toHaveLength(1)
    expect(second.payload.description).toBe('Repair a leaking tap')
  })

  it('allows one assignment attempt and increments the attempt on a safe retry', () => {
    const intake = repository.create('org-a', 'dispatcher-a', sample())

    expect(repository.beginAssignment(intake.id, 'org-a', 'worker-a')).toBe(1)
    expect(repository.beginAssignment(intake.id, 'org-a', 'worker-b')).toBeUndefined()
    expect(repository.markAssigned(intake.id, 'org-a', 'run-1')).toBe(true)
    expect(repository.getForTenant(intake.id, 'org-a')).toMatchObject({
      status: 'assigned',
      assignedTo: 'worker-a',
      workflowRunId: 'run-1',
      assignmentAttempt: 1,
    })
  })

  it('rejects mismatched file content types and rolls back the intake', () => {
    expect(() =>
      repository.create('org-a', 'dispatcher-a', {
        ...sample(),
        attachments: [{ filename: 'spoofed.pdf', mediaType: 'application/pdf', contentBase64: Buffer.from('not a pdf').toString('base64') }],
      }),
    ).toThrow('Attachment contents do not match')
    expect(repository.listForTenant('org-a')).toEqual([])
  })
})

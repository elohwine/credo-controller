import { createHash, randomUUID } from 'crypto'

import { DatabaseManager } from './DatabaseManager'

export type JobIntakeStatus = 'pending' | 'assigning' | 'assigned'

export interface JobIntakeAttachmentInput {
  filename: string
  mediaType: string
  contentBase64: string
}

export interface JobIntakeInput {
  reference?: string
  poNumber?: string
  problemType?: string
  description: string
  clientName?: string
  clientPhone?: string
  location?: string
  scheduledDate?: string
  amount: number
  payoutAmount?: number
  currency: string
  vehicleReference?: string
  requireConcealedWorkPhoto?: boolean
  sourceType?: 'manual' | 'email'
  sourceMessageId?: string
  sourceSender?: string
  sourceSubject?: string
  attachments?: JobIntakeAttachmentInput[]
}

export interface JobIntakeRecord {
  id: string
  tenantId: string
  createdBy: string
  status: JobIntakeStatus
  payload: Omit<JobIntakeInput, 'attachments'>
  assignedTo?: string
  workflowRunId?: string
  assignmentAttempt: number
  createdAt: string
  updatedAt: string
  attachments: Array<{
    id: string
    filename: string
    mediaType: string
    sizeBytes: number
    sha256: string
    createdAt: string
  }>
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024
const ALLOWED_MEDIA_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])

type IntakeRow = {
  id: string
  tenantId: string
  createdBy: string
  status: JobIntakeStatus
  payloadJson: string
  assignedTo?: string
  workflowRunId?: string
  assignmentAttempt: number
  createdAt: string
  updatedAt: string
}

export class JobIntakeRepository {
  public create(
    tenantId: string,
    createdBy: string,
    input: JobIntakeInput,
    idempotencyKey?: string,
  ): JobIntakeRecord {
    const db = DatabaseManager.getDatabase()
    const id = randomUUID()
    const {
      attachments = [],
      ...payload
    } = input
    const decodedAttachments = attachments.map((attachment) => ({
      attachment,
      bytes: this.decodeAttachment(attachment),
    }))
    if (decodedAttachments.reduce((total, entry) => total + entry.bytes.length, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error('Source attachments must total less than 20 MB')
    }
    const insert = db.transaction(() => {
      const existing = idempotencyKey
        ? (db
            .prepare(
              'SELECT id FROM job_intakes WHERE tenant_id = ? AND idempotency_key = ?',
            )
            .get(tenantId, idempotencyKey) as { id: string } | undefined)
        : input.sourceMessageId
          ? (db
              .prepare(
                'SELECT id FROM job_intakes WHERE tenant_id = ? AND source_message_id = ?',
              )
              .get(tenantId, input.sourceMessageId) as { id: string } | undefined)
          : undefined

      if (existing) return existing.id

      db.prepare(
        `INSERT INTO job_intakes
          (id, tenant_id, created_by, payload_json, idempotency_key, source_message_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        tenantId,
        createdBy,
        JSON.stringify(payload),
        idempotencyKey || null,
        input.sourceMessageId || null,
      )

      const insertAttachment = db.prepare(
        `INSERT INTO job_intake_attachments
          (id, intake_id, tenant_id, filename, media_type, size_bytes, sha256, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const { attachment, bytes } of decodedAttachments) {
        insertAttachment.run(
          randomUUID(),
          id,
          tenantId,
          attachment.filename,
          attachment.mediaType,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          bytes,
        )
      }
      return id
    })

    return this.getForTenant(insert(), tenantId)!
  }

  public listForTenant(tenantId: string, status?: JobIntakeStatus): JobIntakeRecord[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, tenant_id AS tenantId, created_by AS createdBy, status, payload_json AS payloadJson,
                assigned_to AS assignedTo, workflow_run_id AS workflowRunId,
                assignment_attempt AS assignmentAttempt, created_at AS createdAt,
                updated_at AS updatedAt
         FROM job_intakes WHERE tenant_id = ? ${status ? 'AND status = ?' : ''}
         ORDER BY created_at DESC LIMIT 200`,
      )
      .all(...(status ? [tenantId, status] : [tenantId])) as IntakeRow[]
    return rows.map((row) => this.toRecord(row))
  }

  public getForTenant(id: string, tenantId: string): JobIntakeRecord | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, tenant_id AS tenantId, created_by AS createdBy, status, payload_json AS payloadJson,
                assigned_to AS assignedTo, workflow_run_id AS workflowRunId,
                assignment_attempt AS assignmentAttempt, created_at AS createdAt,
                updated_at AS updatedAt
         FROM job_intakes WHERE id = ? AND tenant_id = ?`,
      )
      .get(id, tenantId) as IntakeRow | undefined
    return row ? this.toRecord(row) : undefined
  }

  public getAttachmentForTenant(id: string, attachmentId: string, tenantId: string) {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT filename, media_type AS mediaType, size_bytes AS sizeBytes, sha256,
                content, created_at AS createdAt
         FROM job_intake_attachments
         WHERE id = ? AND intake_id = ? AND tenant_id = ?`,
      )
      .get(attachmentId, id, tenantId) as
      | { filename: string; mediaType: string; sizeBytes: number; sha256: string; content: Buffer; createdAt: string }
      | undefined
  }

  public resetStaleAssignment(id: string, tenantId: string): boolean {
    const result = DatabaseManager.getDatabase()
      .prepare(
        `UPDATE job_intakes
         SET status = 'pending', assigned_to = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND status = 'assigning'
           AND datetime(updated_at) < datetime('now', '-10 minutes')`,
      )
      .run(id, tenantId)
    return result.changes === 1
  }

  public beginAssignment(id: string, tenantId: string, assigneeId: string): number | undefined {
    const db = DatabaseManager.getDatabase()
    const begin = db.transaction(() => {
      const result = db
        .prepare(
          `UPDATE job_intakes
           SET status = 'assigning', assigned_to = ?, assignment_attempt = assignment_attempt + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
        )
        .run(assigneeId, id, tenantId)
      if (result.changes !== 1) return undefined
      const row = db
        .prepare('SELECT assignment_attempt AS attempt FROM job_intakes WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as { attempt: number }
      return row.attempt
    })
    return begin()
  }

  public markAssigned(id: string, tenantId: string, workflowRunId: string): boolean {
    const result = DatabaseManager.getDatabase()
      .prepare(
        `UPDATE job_intakes
         SET status = 'assigned', workflow_run_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND status = 'assigning'`,
      )
      .run(workflowRunId, id, tenantId)
    return result.changes === 1
  }

  public resetAssignment(id: string, tenantId: string): void {
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE job_intakes
         SET status = 'pending', assigned_to = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND status = 'assigning'`,
      )
      .run(id, tenantId)
  }

  private toRecord(row: IntakeRow): JobIntakeRecord {
    const attachments = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, filename, media_type AS mediaType, size_bytes AS sizeBytes, sha256,
                created_at AS createdAt
         FROM job_intake_attachments WHERE intake_id = ? AND tenant_id = ? ORDER BY created_at`,
      )
      .all(row.id, row.tenantId) as JobIntakeRecord['attachments']
    return {
      id: row.id,
      tenantId: row.tenantId,
      createdBy: row.createdBy,
      status: row.status,
      payload: JSON.parse(row.payloadJson),
      assignedTo: row.assignedTo,
      workflowRunId: row.workflowRunId,
      assignmentAttempt: row.assignmentAttempt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      attachments,
    }
  }

  private decodeAttachment(attachment: JobIntakeAttachmentInput): Buffer {
    if (!attachment.filename.trim() || attachment.filename.length > 255) {
      throw new Error('Attachment filename must be between 1 and 255 characters')
    }
    if (!ALLOWED_MEDIA_TYPES.has(attachment.mediaType)) throw new Error('Attachment file type is not supported')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.contentBase64)) {
      throw new Error('Attachment data is not valid base64')
    }
    const bytes = Buffer.from(attachment.contentBase64, 'base64')
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new Error('Each attachment must be smaller than 5 MB')
    }
    const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value)
    const validContent =
      attachment.mediaType === 'application/pdf'
        ? startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)
        : attachment.mediaType === 'image/png'
          ? startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
          : attachment.mediaType === 'image/jpeg'
            ? startsWith(0xff, 0xd8, 0xff)
            : attachment.mediaType === 'image/webp'
              ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
              : attachment.mediaType === 'text/plain'
                ? !bytes.subarray(0, 4096).includes(0)
                : false
    if (!validContent) throw new Error('Attachment contents do not match the selected file type')
    return bytes
  }
}

export const jobIntakeRepository = new JobIntakeRepository()

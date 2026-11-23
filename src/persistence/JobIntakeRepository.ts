import { createHash, randomUUID } from 'crypto'

import type { ImportedJobDetails } from '../config/fieldDataImport'

import { intakeDedupeKey, operationsRegisterService } from '../services/OperationsRegisterService'

import { normalizeStoreNumber } from './ContactRepository'
import { DatabaseManager } from './DatabaseManager'

export type JobIntakeStatus = 'pending' | 'assigning' | 'assigned'

export interface JobIntakeAttachmentInput {
  filename: string
  mediaType: string
  contentBase64: string
}

export interface JobIntakeInput {
  reference?: string
  /** The client's store number: the job lands in that store's file. */
  storeNumber?: string
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
  /** A van from the register; its registration becomes the vehicle reference. */
  vanId?: string
  /** Unplanned work the store called in. */
  callOut?: boolean
  requireConcealedWorkPhoto?: boolean
  sourceType?: 'manual' | 'email' | 'import'
  /** Name of the worker in the old system, for a job brought in from a file. Not a team member. */
  importedWorkerName?: string
  /** What the old system said about the job, kept so nothing in the file is lost. */
  importedDetails?: ImportedJobDetails
  sourceMessageId?: string
  sourceSender?: string
  sourceSubject?: string
  /** The mail conversation: later replies in it are kept on this job instead of becoming new jobs. */
  sourceConversationId?: string
  attachments?: JobIntakeAttachmentInput[]
}

export interface JobMailMessage {
  id: string
  direction: 'in' | 'out'
  sender?: string
  subject?: string
  bodyText?: string
  receivedAt: string
  webLink?: string
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
  /** The job or intake already booked for the same store and client reference. */
  duplicateOf?: string
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
  duplicateOf?: string
  createdAt: string
  updatedAt: string
}

const INTAKE_COLUMNS = `id, tenant_id AS tenantId, created_by AS createdBy, status, payload_json AS payloadJson,
  assigned_to AS assignedTo, workflow_run_id AS workflowRunId,
  assignment_attempt AS assignmentAttempt, duplicate_of AS duplicateOf, created_at AS createdAt,
  updated_at AS updatedAt`

export class JobIntakeRepository {
  public create(
    tenantId: string,
    createdBy: string,
    input: JobIntakeInput,
    idempotencyKey?: string,
  ): JobIntakeRecord {
    const db = DatabaseManager.getDatabase()
    const id = randomUUID()
    const { attachments = [], ...rest } = input
    const storeNumber = normalizeStoreNumber(rest.storeNumber)
    const payload = { ...rest, ...(storeNumber ? { storeNumber } : {}) }
    const dedupeKey = intakeDedupeKey(storeNumber, payload.poNumber)
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

      const repeat = dedupeKey
        ? operationsRegisterService.findBookedRepeat(tenantId, storeNumber, String(payload.poNumber || ''))
        : undefined
      db.prepare(
        `INSERT INTO job_intakes
          (id, tenant_id, created_by, payload_json, idempotency_key, source_message_id, dedupe_key, duplicate_of,
           source_conversation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        tenantId,
        createdBy,
        JSON.stringify(payload),
        idempotencyKey || null,
        input.sourceMessageId || null,
        dedupeKey || null,
        repeat?.id || null,
        input.sourceConversationId || null,
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
        `SELECT ${INTAKE_COLUMNS}
         FROM job_intakes WHERE tenant_id = ? ${status ? 'AND status = ?' : ''}
         ORDER BY created_at DESC LIMIT 200`,
      )
      .all(...(status ? [tenantId, status] : [tenantId])) as IntakeRow[]
    return rows.map((row) => this.toRecord(row))
  }

  public getForTenant(id: string, tenantId: string): JobIntakeRecord | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT ${INTAKE_COLUMNS}
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

  /** Save details the dispatcher filled in before starting the job (price, van, store). */
  public updatePayload(id: string, tenantId: string, changes: Partial<Omit<JobIntakeInput, 'attachments'>>): void {
    const current = this.getForTenant(id, tenantId)
    if (!current || current.status !== 'pending') return
    const payload = { ...current.payload, ...changes }
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE job_intakes SET payload_json = ?, dedupe_key = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(payload), intakeDedupeKey(payload.storeNumber, payload.poNumber) || null, id, tenantId)
  }

  /** The job that started a mail conversation, so replies in it stay on that job. */
  public findByConversation(tenantId: string, conversationId: string): { id: string } | undefined {
    if (!conversationId) return undefined
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id FROM job_intakes WHERE tenant_id = ? AND source_conversation_id = ?
          ORDER BY created_at ASC LIMIT 1`,
      )
      .get(tenantId, conversationId) as { id: string } | undefined
  }

  /** Keeps one email on a job's thread. False when that email is already there. */
  public addMailMessage(
    tenantId: string,
    intakeId: string,
    message: Omit<JobMailMessage, 'id'> & { internetMessageId: string; conversationId?: string },
  ): boolean {
    const result = DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO job_mail_messages
           (id, org_tenant_id, intake_id, conversation_id, internet_message_id, direction, sender, subject, body_text,
            received_at, web_link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_tenant_id, internet_message_id) DO NOTHING`,
      )
      .run(
        randomUUID(),
        tenantId,
        intakeId,
        message.conversationId || null,
        message.internetMessageId.slice(0, 500),
        message.direction,
        message.sender?.slice(0, 320) || null,
        message.subject?.slice(0, 500) || null,
        message.bodyText?.slice(0, 8000) || null,
        message.receivedAt,
        message.webLink || null,
      )
    return result.changes === 1
  }

  public mailThread(tenantId: string, intakeId: string): JobMailMessage[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, direction, sender, subject, body_text AS bodyText, received_at AS receivedAt, web_link AS webLink
           FROM job_mail_messages WHERE org_tenant_id = ? AND intake_id = ?
          ORDER BY received_at ASC LIMIT 200`,
      )
      .all(tenantId, intakeId) as Array<Record<string, string | null>>
    return rows.map((row) => ({
      id: String(row.id),
      direction: row.direction === 'out' ? 'out' : 'in',
      sender: row.sender || undefined,
      subject: row.subject || undefined,
      bodyText: row.bodyText || undefined,
      receivedAt: String(row.receivedAt),
      webLink: row.webLink || undefined,
    }))
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
      duplicateOf: row.duplicateOf || undefined,
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

import crypto from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'OutboxService' })

interface EnqueueOutboxInput {
  topic: string
  aggregateKey?: string
  dedupeKey?: string
  payload: Record<string, unknown>
}

class OutboxService {
  private processing = false

  public enqueue(input: EnqueueOutboxInput): string {
    const db = DatabaseManager.getDatabase()
    const id = crypto.randomUUID()

    try {
      db.prepare(
        `INSERT OR IGNORE INTO integration_outbox (
          id, topic, aggregate_key, dedupe_key, payload, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(
        id,
        input.topic,
        input.aggregateKey || null,
        input.dedupeKey || null,
        JSON.stringify(input.payload || {}),
        new Date().toISOString(),
      )
    } catch (e: any) {
      logger.error({ error: e.message, topic: input.topic }, 'Failed to enqueue outbox event')
      throw e
    }

    void this.processPending(input.topic)
    return id
  }

  public async processPending(topic?: string): Promise<number> {
    if (this.processing) return 0

    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        topic
          ? `SELECT * FROM integration_outbox WHERE topic = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 20`
          : `SELECT * FROM integration_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20`,
      )
      .all(topic || undefined) as Array<{ id: string; topic: string; payload: string }>

    if (rows.length === 0) return 0

    this.processing = true
    try {
      let processed = 0
      for (const row of rows) {
        try {
          if (row.topic === 'workflow.vc.issue') {
            await this.processWorkflowVcIssue(row.id, JSON.parse(row.payload || '{}'))
          }

          db.prepare(`UPDATE integration_outbox SET status = 'processed', dispatched_at = ? WHERE id = ?`).run(
            new Date().toISOString(),
            row.id,
          )
          processed += 1
        } catch (error: any) {
          logger.error({ error: error.message, topic: row.topic, outboxId: row.id }, 'Failed to process outbox event')
          db.prepare(
            `UPDATE integration_outbox SET status = 'failed', error_message = ?, dispatched_at = ? WHERE id = ?`,
          ).run(error.message, new Date().toISOString(), row.id)
        }
      }
      return processed
    } finally {
      this.processing = false
    }
  }

  private async processWorkflowVcIssue(outboxId: string, payload: Record<string, any>): Promise<void> {
    const {
      credentialType,
      requisitionId,
      tenantId,
      approverDid,
      approverRole,
      approvalMethod,
      approvalStage,
      status,
      paymentUrl,
      amount,
      currency,
      acknowledgedBy,
      acknowledgedAt,
      notes,
    } = payload
    const { credentialIssuanceService } = await import('../services/CredentialIssuanceService')

    const claims: Record<string, any> = {
      requisitionId,
      ...(approverDid ? { approverDid } : {}),
      ...(approverRole ? { approverRole } : {}),
      ...(approvalMethod ? { approvalMethod } : {}),
      ...(approvalStage ? { approvalStage } : {}),
      ...(status ? { status } : {}),
      ...(paymentUrl ? { paymentUrl } : {}),
      ...(typeof amount !== 'undefined' ? { amount } : {}),
      ...(currency ? { currency } : {}),
      ...(acknowledgedBy ? { acknowledgedBy } : {}),
      ...(acknowledgedAt ? { acknowledgedAt } : {}),
      ...(notes ? { notes } : {}),
    }

    if (!credentialType || !tenantId) {
      throw new Error(
        `workflow.vc.issue requires credentialType and tenantId; got ${JSON.stringify({ credentialType, tenantId, requisitionId })}`,
      )
    }

    const result = await credentialIssuanceService.createOffer({
      credentialType: String(credentialType),
      claims,
      tenantId: String(tenantId),
    })

    logger.info(
      { outboxId, requisitionId, credentialType, offerId: result.offerId, tenantId },
      'Processed workflow.vc.issue outbox event',
    )
  }
}

export const outboxService = new OutboxService()

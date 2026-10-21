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

export class DispatchError extends Error {
  public constructor(
    message: string,
    public readonly disposition: 'retry' | 'permanent' | 'uncertain' = 'retry',
  ) {
    super(message)
  }
}

export class OutboxService {
  private processing = false
  private handlers = new Map<string, (id: string, payload: Record<string, any>) => Promise<void>>()

  public register(topic: string, handler: (id: string, payload: Record<string, any>) => Promise<void>): void {
    this.handlers.set(topic, handler)
  }

  public start(): NodeJS.Timeout {
    const drain = async () => {
      try {
        this.recoverInboxIntents()
        await this.processPending()
      } catch {
        logger.warn('Outbox drain deferred')
      }
    }
    void drain()
    const timer = setInterval(() => void drain(), 15000)
    timer.unref()
    return timer
  }

  public recoverInboxIntents(): number {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT tenant_id, issuer_tenant_id, source_type, source_id, credential_type, metadata
      FROM wallet_pending_offers WHERE resolved_at IS NULL AND json_valid(metadata)
      AND json_extract(metadata, '$.notificationOutboxDedupeKey') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM integration_outbox
        WHERE dedupe_key = json_extract(wallet_pending_offers.metadata, '$.notificationOutboxDedupeKey'))
      LIMIT 100`,
      )
      .all() as Array<Record<string, any>>
    for (const row of rows) {
      this.enqueue({
        topic: 'wallet.vc.offered',
        aggregateKey: row.tenant_id,
        dedupeKey: JSON.parse(row.metadata).notificationOutboxDedupeKey,
        payload: {
          tenantId: row.tenant_id,
          issuerTenantId: row.issuer_tenant_id,
          sourceType: row.source_type,
          sourceId: row.source_id,
          credentialType: row.credential_type,
        },
      })
    }
    return rows.length
  }

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

    const stored = input.dedupeKey
      ? (db.prepare('SELECT id FROM integration_outbox WHERE dedupe_key = ?').get(input.dedupeKey) as { id: string })
      : undefined
    // A microtask cannot run until a surrounding synchronous SQLite transaction commits.
    void Promise.resolve()
      .then(() => this.processPending(input.topic))
      .catch(() => logger.warn('Outbox drain deferred'))
    return stored?.id || id
  }

  public async processPending(topic?: string): Promise<number> {
    if (this.processing) return 0

    this.processing = true
    try {
      const db = DatabaseManager.getDatabase()
      const now = Date.now()
      const token = crypto.randomUUID()
      const rows = db
        .transaction(() => {
          // Legacy side effects have no provider reconciliation key. Never replay a crashed invocation blindly.
          db.prepare(
            `UPDATE integration_outbox SET status = 'uncertain', error_message = 'Lease expired: reconcile external outcome'
          WHERE status = 'processing' AND lease_until <= ? AND topic NOT IN ('notification.whatsapp', 'wallet.vc.offered', 'wallet.inbox.whatsapp')`,
          ).run(now)
          const candidates = db
            .prepare(
              `SELECT id, topic, payload FROM integration_outbox
          WHERE ((status IN ('pending', 'retry') AND available_at <= ?) OR (status = 'processing' AND lease_until <= ?))
          ${topic ? 'AND topic = ?' : ''} ORDER BY created_at LIMIT 20`,
            )
            .all(...(topic ? [now, now, topic] : [now, now])) as Array<{ id: string; topic: string; payload: string }>
          for (const row of candidates) {
            db.prepare(
              `UPDATE integration_outbox SET status = 'processing', attempts = attempts + 1,
            lease_until = ?, lease_token = ? WHERE id = ?`,
            ).run(now + 60000, token, row.id)
          }
          return candidates
        })
        .immediate()
      let processed = 0
      for (const row of rows) {
        const owned = db
          .prepare(
            `UPDATE integration_outbox SET lease_until = ?
          WHERE id = ? AND lease_token = ? AND status = 'processing'`,
          )
          .run(Date.now() + 60000, row.id, token)
        if (!owned.changes) continue
        try {
          if (this.handlers.has(row.topic)) {
            await this.handlers.get(row.topic)!(row.id, JSON.parse(row.payload))
          } else if (row.topic === 'notification.whatsapp') {
            const { notificationService } = await import('./NotificationService')
            await notificationService.processWhatsAppIntent(row.id, JSON.parse(row.payload))
          } else if (row.topic === 'workflow.vc.issue') {
            await this.processWorkflowVcIssue(row.id, JSON.parse(row.payload || '{}'))
          } else if (row.topic === 'wallet.inbox.whatsapp') {
            const { notificationService } = await import('./NotificationService')
            notificationService.queueInboxNotification(row.id, JSON.parse(row.payload))
          } else if (row.topic === 'wallet.vc.offered') {
            const { notificationService } = await import('./NotificationService')
            const payload = JSON.parse(row.payload || '{}')
            notificationService.queueInboxNotification(row.id, payload)
            this.enqueue({
              topic: 'wallet.android.popup',
              aggregateKey: payload.tenantId,
              dedupeKey: `android:${row.id}`,
              payload,
            })
          } else if (row.topic === 'wallet.android.popup') {
            const { notifyAndroidPopup } = await import('./AndroidPushService')
            await notifyAndroidPopup(JSON.parse(row.payload || '{}'))
          } else {
            throw new DispatchError('Unknown outbox topic', 'permanent')
          }

          db.prepare(
            `UPDATE integration_outbox SET status = 'processed', dispatched_at = ?, lease_until = NULL WHERE id = ? AND lease_token = ?`,
          ).run(new Date().toISOString(), row.id, token)
          processed += 1
        } catch (error: any) {
          const disposition = error instanceof DispatchError ? error.disposition : 'retry'
          const { attempts } = db.prepare('SELECT attempts FROM integration_outbox WHERE id = ?').get(row.id) as {
            attempts: number
          }
          const status =
            disposition === 'uncertain'
              ? 'uncertain'
              : disposition === 'permanent' || attempts >= 5
                ? 'failed'
                : 'retry'
          logger.warn({ topic: row.topic, outboxId: row.id, status }, 'Outbox dispatch deferred or failed')
          db.prepare(
            `UPDATE integration_outbox SET status = ?, error_message = ?, available_at = ?,
            lease_until = NULL WHERE id = ? AND lease_token = ?`,
          ).run(
            status,
            error instanceof DispatchError ? error.message : 'Handler failed',
            Date.now() + Math.min(3600000, 15000 * 2 ** attempts),
            row.id,
            token,
          )
          if (row.topic === 'notification.whatsapp' && status === 'failed') {
            db.prepare(
              `UPDATE notification_deliveries SET status = 'failed', reason = 'Dispatch attempts exhausted',
              updated_at = ? WHERE id = ? AND status IN ('queued', 'retry')`,
            ).run(new Date().toISOString(), row.id)
          }
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

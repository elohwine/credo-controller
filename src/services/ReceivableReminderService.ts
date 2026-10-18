import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { notificationService } from './NotificationService'

const logger = rootLogger.child({ module: 'ReceivableReminderService' })

export class ReceivableReminderService {
  public async sendInstallment(installmentId: string, reminder = false): Promise<boolean> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT i.id, i.amount, i.status, i.notified_at AS notifiedAt, i.reminder_sent_at AS reminderSentAt,
                p.payer_name AS payerName, p.payer_phone AS payerPhone, p.payer_email AS payerEmail,
                p.currency, p.buyer_tenant_id AS tenantId, l.shortlink_url AS url
           FROM ar_plan_installments i
           JOIN ar_payment_plans p ON p.id = i.plan_id
           JOIN payment_links l ON l.id = i.payment_link_id
          WHERE i.id = ? AND p.status = 'active' AND i.status IN ('pending', 'overdue')`,
      )
      .get(installmentId) as any
    if (!row?.url || (!row.payerPhone && !row.payerEmail)) return false
    if (!reminder && row.notifiedAt) return false
    if (reminder && row.reminderSentAt) {
      const lastReminder = new Date(row.reminderSentAt).getTime()
      if (Number.isFinite(lastReminder) && Date.now() - lastReminder < 7 * 24 * 60 * 60 * 1000) return false
    }
    const result = await notificationService.dispatchContactNotification({
      tenantId: row.tenantId,
      dedupeKey: `installment:${installmentId}:${reminder ? Math.floor(Date.now() / (7 * 86400000)) : 'initial'}`,
      contact: { name: row.payerName || 'there', phone: row.payerPhone, email: row.payerEmail },
      type: 'payment_link',
      url: row.url,
      amount: Number(row.amount),
      currency: row.currency,
    })
    if (!result.accepted) return false
    const column = reminder ? 'reminder_sent_at' : 'notified_at'
    db.prepare(`UPDATE ar_plan_installments SET ${column} = ? WHERE id = ?`).run(
      new Date().toISOString(),
      installmentId,
    )
    return true
  }

  public async processDue(): Promise<{ sent: number; reminded: number }> {
    const db = DatabaseManager.getDatabase()
    const due = db
      .prepare(
        `SELECT i.id, i.status, i.notified_at AS notifiedAt, i.reminder_sent_at AS reminderSentAt
           FROM ar_plan_installments i JOIN ar_payment_plans p ON p.id = i.plan_id
          WHERE p.status = 'active' AND i.status IN ('pending', 'overdue')
            AND i.due_date IS NOT NULL AND datetime(i.due_date) <= datetime('now', '+1 day')
            AND (
              i.notified_at IS NULL OR
              (i.status = 'overdue' AND (i.reminder_sent_at IS NULL OR datetime(i.reminder_sent_at) <= datetime('now', '-7 days')))
            )
          ORDER BY i.due_date LIMIT 100`,
      )
      .all() as any[]
    let sent = 0
    let reminded = 0
    for (const item of due) {
      const reminder = Boolean(item.notifiedAt)
      try {
        if (await this.sendInstallment(item.id, reminder)) {
          if (reminder) reminded += 1
          else sent += 1
        }
      } catch (error: any) {
        logger.warn({ installmentId: item.id, error: error?.message }, 'Receivable notification failed')
      }
    }
    return { sent, reminded }
  }
}

export const receivableReminderService = new ReceivableReminderService()

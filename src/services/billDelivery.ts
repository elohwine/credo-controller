import { DatabaseManager } from '../persistence/DatabaseManager'

export type BillDeliveryStatus = 'sent' | 'queued' | 'delivery_failed'

interface BillSend {
  accepted?: boolean
  inboxItemId?: string
  channels?: Array<{ status: string; notificationId?: string }>
}

/**
 * Where a bill's last send stands. The inbox card, or a provider that accepted the message, is a
 * delivery. A message still in the outbox is queued until the outbox records how it went.
 */
export function billDeliveryStatus(notification?: BillSend, inboxItemId?: string): BillDeliveryStatus {
  if (notification?.accepted || notification?.inboxItemId || inboxItemId) return 'sent'
  const ids = (notification?.channels || [])
    .filter((channel) => channel.status === 'queued' && channel.notificationId)
    .map((channel) => channel.notificationId as string)
  if (!ids.length) return 'delivery_failed'
  const db = DatabaseManager.getDatabase()
  const statuses = ids.map(
    (id) =>
      (db.prepare('SELECT status FROM notification_deliveries WHERE id = ?').get(id) as { status: string } | undefined)
        ?.status || 'failed',
  )
  if (statuses.some((status) => ['accepted', 'sent', 'delivered', 'read'].includes(status))) return 'sent'
  if (statuses.some((status) => ['queued', 'retry', 'sending'].includes(status))) return 'queued'
  return 'delivery_failed'
}

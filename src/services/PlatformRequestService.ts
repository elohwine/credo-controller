import { randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'

export type RequestStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'in_fulfilment' | 'completed' | 'cancelled'

export interface CreatePlatformRequestInput {
  organizationId: string
  requesterPersonId: string
  departmentId?: string
  requestType: string
  title: string
  description?: string
  amount?: number
  currency?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  targetModule?: string
  context?: Record<string, unknown>
  items?: Array<{
    description: string
    quantity?: number
    unitPrice?: number
    itemType?: string
    metadata?: Record<string, unknown>
  }>
}

/**
 * Generic organizational request layer.
 *
 * This deliberately knows nothing about procurement, finance, HR or field ops.
 * Those modules consume a request and provide the domain-specific fulfilment.
 */
export class PlatformRequestService {
  create(input: CreatePlatformRequestInput) {
    const db = DatabaseManager.getDatabase()
    const requestId = randomUUID()

    const create = db.transaction(() => {
      db.prepare(`
        INSERT INTO requests (
          id, organization_id, requester_person_id, department_id,
          request_type, title, description, amount, currency,
          priority, status, target_module, context_json
        ) VALUES (
          @id, @organizationId, @requesterPersonId, @departmentId,
          @requestType, @title, @description, @amount, @currency,
          @priority, 'draft', @targetModule, @contextJson
        )
      `).run({
        id: requestId,
        organizationId: input.organizationId,
        requesterPersonId: input.requesterPersonId,
        departmentId: input.departmentId ?? null,
        requestType: input.requestType,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        priority: input.priority ?? 'normal',
        targetModule: input.targetModule ?? null,
        contextJson: JSON.stringify(input.context ?? {})
      })

      for (const item of input.items ?? []) {
        db.prepare(`
          INSERT INTO request_items (
            id, request_id, item_type, description, quantity, unit_price, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          requestId,
          item.itemType ?? 'line_item',
          item.description,
          item.quantity ?? 1,
          item.unitPrice ?? null,
          JSON.stringify(item.metadata ?? {})
        )
      }

      this.recordEvent(requestId, 'request.created', input.requesterPersonId, null, 'draft', {
        requestType: input.requestType
      })
    })

    create()
    return this.get(requestId)
  }

  submit(requestId: string, actorPersonId: string) {
    return this.transition(requestId, 'submitted', actorPersonId)
  }

  transition(requestId: string, toStatus: RequestStatus, actorPersonId?: string, payload: Record<string, unknown> = {}) {
    const db = DatabaseManager.getDatabase()
    const current = db.prepare('SELECT status FROM requests WHERE id = ?').get(requestId) as { status?: RequestStatus } | undefined
    if (!current) throw new Error(`Request not found: ${requestId}`)

    const allowed: Record<RequestStatus, RequestStatus[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['in_review', 'rejected', 'cancelled'],
      in_review: ['approved', 'rejected', 'cancelled'],
      approved: ['in_fulfilment', 'completed', 'cancelled'],
      rejected: ['draft'],
      in_fulfilment: ['completed', 'cancelled'],
      completed: [],
      cancelled: []
    }

    if (!allowed[current.status ?? 'draft'].includes(toStatus)) {
      throw new Error(`Invalid request transition: ${current.status} -> ${toStatus}`)
    }

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`
        UPDATE requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP,
            submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, ?) ELSE submitted_at END,
            completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
        WHERE id = ?
      `).run(toStatus, toStatus, now, toStatus, now, requestId)

      this.recordEvent(requestId, 'request.status_changed', actorPersonId, current.status ?? null, toStatus, payload)
    })()

    return this.get(requestId)
  }

  get(requestId: string) {
    const db = DatabaseManager.getDatabase()
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as any
    if (!request) return undefined

    const items = db.prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY rowid').all(requestId)
    const approvals = db.prepare('SELECT * FROM request_approvals WHERE request_id = ? ORDER BY created_at').all(requestId)
    const events = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at').all(requestId)

    return {
      ...request,
      context: JSON.parse(request.context_json || '{}'),
      items,
      approvals,
      events
    }
  }

  list(organizationId: string, status?: RequestStatus, requestType?: string, limit = 100) {
    const db = DatabaseManager.getDatabase()
    let sql = 'SELECT * FROM requests WHERE organization_id = ?'
    const params: unknown[] = [organizationId]

    if (status) {
      sql += ' AND status = ?'
      params.push(status)
    }
    if (requestType) {
      sql += ' AND request_type = ?'
      params.push(requestType)
    }

    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(Math.min(Math.max(limit, 1), 500))
    return db.prepare(sql).all(...params)
  }

  private recordEvent(
    requestId: string,
    eventType: string,
    actorPersonId: string | undefined,
    fromStatus: string | null,
    toStatus: string | null,
    payload: Record<string, unknown>
  ) {
    DatabaseManager.getDatabase().prepare(`
      INSERT INTO request_events (
        id, request_id, event_type, actor_person_id, from_status, to_status, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), requestId, eventType, actorPersonId ?? null,
      fromStatus, toStatus, JSON.stringify(payload)
    )
  }
}

export const platformRequestService = new PlatformRequestService()

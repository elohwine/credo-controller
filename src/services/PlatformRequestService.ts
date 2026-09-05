import { randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'

export type RequestStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'in_fulfilment' | 'completed' | 'cancelled'

export interface CreatePlatformRequestInput {
  tenantId: string
  subjectRef: string
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

export class PlatformRequestService {
  private resolvePrincipal(tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const organization = db.prepare(`
      SELECT id, tenant_id AS tenantId
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `).get(tenantId) as { id?: string; tenantId?: string } | undefined

    if (!organization?.id) throw new Error('Organization context not found')

    const person = db.prepare(`
      SELECT p.id, p.organization_id AS organizationId
      FROM people p
      JOIN organization_memberships m ON m.person_id = p.id AND m.organization_id = p.organization_id
      WHERE p.organization_id = ? AND p.subject_ref = ?
        AND p.status = 'active' AND m.membership_status = 'active'
      LIMIT 1
    `).get(organization.id, subjectRef) as { id?: string; organizationId?: string } | undefined

    if (!person?.id) throw new Error('Authenticated subject is not an active organization member')
    return { organizationId: organization.id, personId: person.id }
  }

  create(input: CreatePlatformRequestInput) {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(input.tenantId, input.subjectRef)
    const requestId = randomUUID()

    db.transaction(() => {
      db.prepare(`
        INSERT INTO requests (
          id, organization_id, requester_person_id, request_type,
          title, description, amount, currency, priority,
          status, target_module, context_json
        ) VALUES (
          @id, @organizationId, @requesterPersonId, @requestType,
          @title, @description, @amount, @currency, @priority,
          'draft', @targetModule, @contextJson
        )
      `).run({
        id: requestId,
        organizationId: principal.organizationId,
        requesterPersonId: principal.personId,
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
          randomUUID(), requestId,
          item.itemType ?? 'line_item',
          item.description,
          item.quantity ?? 1,
          item.unitPrice ?? null,
          JSON.stringify(item.metadata ?? {})
        )
      }

      this.recordEvent(requestId, 'request.created', principal.personId, null, 'draft', {
        requestType: input.requestType
      })
    })()

    return this.getForTenant(requestId, input.tenantId)
  }

  submit(requestId: string, tenantId: string, subjectRef: string) {
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    return this.transition(requestId, tenantId, 'submitted', principal.personId)
  }

  transitionBySubject(
    requestId: string,
    tenantId: string,
    subjectRef: string,
    toStatus: RequestStatus,
    payload: Record<string, unknown> = {}
  ) {
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    return this.transition(requestId, tenantId, toStatus, principal.personId, payload)
  }

  transition(
    requestId: string,
    tenantId: string,
    toStatus: RequestStatus,
    actorPersonId: string,
    payload: Record<string, unknown> = {}
  ) {
    const db = DatabaseManager.getDatabase()
    const current = db.prepare(`
      SELECT r.status, r.organization_id AS organizationId
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `).get(requestId, tenantId) as { status?: RequestStatus; organizationId?: string } | undefined

    if (!current?.organizationId) throw new Error('Request not found')

    const actor = db.prepare(`
      SELECT p.id
      FROM people p
      JOIN organization_memberships m ON m.person_id = p.id AND m.organization_id = p.organization_id
      WHERE p.id = ? AND p.organization_id = ?
        AND p.status = 'active' AND m.membership_status = 'active'
      LIMIT 1
    `).get(actorPersonId, current.organizationId) as { id?: string } | undefined

    if (!actor?.id) throw new Error('Actor is not authorized for this organization')

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

      this.recordEvent(requestId, 'request.status_changed', actor.id, current.status ?? null, toStatus, payload)
    })()

    return this.getForTenant(requestId, tenantId)
  }

  getForTenant(requestId: string, tenantId: string) {
    const db = DatabaseManager.getDatabase()
    const request = db.prepare(`
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ?
    `).get(requestId, tenantId) as any
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

  list(tenantId: string, status?: RequestStatus, requestType?: string, limit = 100) {
    const db = DatabaseManager.getDatabase()
    let sql = `
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE o.tenant_id = ?
    `
    const params: unknown[] = [tenantId]

    if (status) {
      sql += ' AND r.status = ?'
      params.push(status)
    }
    if (requestType) {
      sql += ' AND r.request_type = ?'
      params.push(requestType)
    }

    sql += ' ORDER BY r.created_at DESC LIMIT ?'
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

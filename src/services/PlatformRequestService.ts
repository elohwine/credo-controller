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

/**
 * Generic organizational request layer.
 *
 * Identity is resolved from the authenticated tenant + opaque subject reference.
 * Lifecycle transitions are authorized server-side from organizational authority;
 * client-provided person/organization identifiers are never trusted as proof.
 */
export class PlatformRequestService {
  private resolvePrincipal(tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const organization = db.prepare(`
      SELECT id
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `).get(tenantId) as { id?: string } | undefined

    if (!organization?.id) throw new Error('Organization context not found')

    const person = db.prepare(`
      SELECT p.id
      FROM people p
      JOIN organization_memberships m ON m.person_id = p.id AND m.organization_id = p.organization_id
      WHERE p.organization_id = ? AND p.subject_ref = ?
        AND p.status = 'active' AND m.membership_status = 'active'
      LIMIT 1
    `).get(organization.id, subjectRef) as { id?: string } | undefined

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
    return this.transitionBySubject(requestId, tenantId, subjectRef, 'submitted')
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
      SELECT r.status, r.organization_id AS organizationId, r.requester_person_id AS requesterPersonId
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `).get(requestId, tenantId) as {
      status?: RequestStatus
      organizationId?: string
      requesterPersonId?: string
    } | undefined

    if (!current?.organizationId || !current.requesterPersonId) throw new Error('Request not found')

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

    const transitionPermission: Record<RequestStatus, string | undefined> = {
      draft: undefined,
      submitted: 'request.submit',
      in_review: 'request.review',
      approved: 'request.approve',
      rejected: 'request.reject',
      in_fulfilment: 'request.fulfil',
      completed: 'request.complete',
      cancelled: 'request.cancel',
    }

    const actorIsRequester = actorPersonId === current.requesterPersonId
    const permission = transitionPermission[toStatus]
    const requesterAllowed = actorIsRequester && (toStatus === 'submitted' || toStatus === 'cancelled')
    const authorityAllowed = permission
      ? this.hasAuthority(current.organizationId, actorPersonId, permission)
      : false

    if (!requesterAllowed && !authorityAllowed) {
      this.recordPolicyDecision({
        organizationId: current.organizationId,
        principalPersonId: actorPersonId,
        action: permission ?? `request.transition.${toStatus}`,
        resourceType: 'request',
        resourceId: requestId,
        decision: 'deny',
        reasonCode: 'insufficient_authority'
      })
      throw new Error('Insufficient authority for request transition')
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
      this.recordPolicyDecision({
        organizationId: current.organizationId as string,
        principalPersonId: actorPersonId,
        action: permission ?? `request.transition.${toStatus}`,
        resourceType: 'request',
        resourceId: requestId,
        decision: 'allow',
        reasonCode: requesterAllowed ? 'requester_action' : 'authority_grant'
      })
    })()

    return this.getForTenant(requestId, tenantId)
  }

  private hasAuthority(organizationId: string, personId: string, permission: string): boolean {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT 1
      FROM authority_grants a
      LEFT JOIN roles r ON r.id = a.role_id AND r.organization_id = a.organization_id
      WHERE a.organization_id = ?
        AND a.person_id = ?
        AND a.status = 'active'
        AND (a.valid_from IS NULL OR a.valid_from <= CURRENT_TIMESTAMP)
        AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_TIMESTAMP)
        AND (
          a.authority_type = ?
          OR EXISTS (
            SELECT 1
            FROM json_each(COALESCE(r.permissions, '[]'))
            WHERE json_each.value = ?
          )
        )
      LIMIT 1
    `).get(organizationId, personId, permission, permission)
    return !!row
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

  private recordPolicyDecision(input: {
    organizationId: string
    principalPersonId: string
    action: string
    resourceType: string
    resourceId: string
    decision: 'allow' | 'deny'
    reasonCode: string
  }) {
    DatabaseManager.getDatabase().prepare(`
      INSERT INTO policy_decisions (
        id, organization_id, principal_person_id, action,
        resource_type, resource_id, decision, reason_code, policy_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), input.organizationId, input.principalPersonId, input.action,
      input.resourceType, input.resourceId, input.decision, input.reasonCode, 'platform-v1'
    )
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

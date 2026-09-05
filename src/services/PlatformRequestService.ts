import { randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { authorizationService } from './AuthorizationService'

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
 * Lifecycle transitions are authorized through the centralized SSI-aware
 * AuthorizationService; business modules do not implement their own RBAC logic.
 */
export class PlatformRequestService {
  private resolvePrincipal(tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const organization = db.prepare(`
      SELECT id
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      LIMIT 1
    `).get(tenantId) as { id?: string } | undefined

    if (!organization?.id) throw new Error('Organization context not found')

    const person = db.prepare(`
      SELECT p.id
      FROM people p
      JOIN organization_memberships m
        ON m.person_id = p.id AND m.organization_id = p.organization_id
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

    return this.getForSubject(requestId, input.tenantId, input.subjectRef)
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
      SELECT
        r.status,
        r.organization_id AS organizationId,
        r.requester_person_id AS requesterPersonId,
        r.department_id AS departmentId,
        r.amount,
        r.currency,
        r.context_json AS contextJson
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `).get(requestId, tenantId) as {
      status?: RequestStatus
      organizationId?: string
      requesterPersonId?: string
      departmentId?: string
      amount?: number
      currency?: string
      contextJson?: string
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

    const permissions: Partial<Record<RequestStatus, string>> = {
      submitted: 'request.submit',
      in_review: 'request.review',
      approved: 'request.approve',
      rejected: 'request.reject',
      in_fulfilment: 'request.fulfil',
      completed: 'request.complete',
      cancelled: 'request.cancel',
    }
    const permission = permissions[toStatus]
    const actorIsRequester = actorPersonId === current.requesterPersonId

    if (actorIsRequester && (toStatus === 'submitted' || toStatus === 'cancelled')) {
      // Requester may submit/cancel their own request. No additional authority
      // is required for these user-owned lifecycle actions.
      this.recordDecisionEvent(current.organizationId, actorPersonId, requestId, `request.${toStatus}`, 'allow', 'requester_action')
    } else {
      const context = this.parseContext(current.contextJson)
      const separationOfDuties = this.getSeparationOfDuties(current.status as RequestStatus, toStatus, current.requesterPersonId)
      const decision = authorizationService.decide({
        tenantId,
        personId: actorPersonId,
        action: permission || `request.transition.${toStatus}`,
        requiredPermission: permission || `request.transition.${toStatus}`,
        resourceType: 'request',
        resourceId: requestId,
        amount: typeof current.amount === 'number' ? current.amount : undefined,
        currency: current.currency,
        departmentId: current.departmentId,
        projectRef: typeof context.projectRef === 'string' ? context.projectRef : undefined,
        costCentreRef: typeof context.costCentreRef === 'string' ? context.costCentreRef : undefined,
        separationOfDutiesPersonIds: separationOfDuties,
      })

      if (decision.decision !== 'allow') {
        throw new Error(`Insufficient authority: ${decision.reasonCode}`)
      }
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

    return this.getForSubject(requestId, tenantId, this.getSubjectRefForPerson(tenantId, actorPersonId))
  }

  private getSeparationOfDuties(fromStatus: RequestStatus, toStatus: RequestStatus, requesterPersonId: string): string[] {
    // Approval/review should not be performed by the requester by default.
    // Additional module-specific SoD rules are applied by the owning workflow.
    if (fromStatus === 'in_review' && ['approved', 'rejected'].includes(toStatus)) return [requesterPersonId]
    return []
  }

  private parseContext(value?: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private getSubjectRefForPerson(tenantId: string, personId: string): string {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT p.subject_ref AS subjectRef
      FROM people p
      JOIN organizations o ON o.id = p.organization_id
      WHERE p.id = ? AND o.tenant_id = ? AND o.status = 'active'
      LIMIT 1
    `).get(personId, tenantId) as { subjectRef?: string } | undefined
    if (!row?.subjectRef) throw new Error('Authenticated subject not found')
    return row.subjectRef
  }

  private recordDecisionEvent(
    organizationId: string,
    actorPersonId: string,
    requestId: string,
    action: string,
    decision: 'allow' | 'deny',
    reasonCode: string
  ) {
    DatabaseManager.getDatabase().prepare(`
      INSERT INTO policy_decisions (
        id, organization_id, principal_person_id, action,
        resource_type, resource_id, decision, reason_code, policy_version
      ) VALUES (?, ?, ?, ?, 'request', ?, ?, ?, ?)
    `).run(
      randomUUID(), organizationId, actorPersonId, action,
      requestId, decision, reasonCode, 'platform-v1'
    )
  }

  getForSubject(requestId: string, tenantId: string, subjectRef: string) {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    const request = db.prepare(`
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ? AND o.status = 'active'
    `).get(requestId, tenantId) as any
    if (!request) return undefined

    if (request.requester_person_id !== principal.personId) {
      const decision = authorizationService.decide({
        tenantId,
        personId: principal.personId,
        action: 'request.read',
        requiredPermission: 'request.read',
        resourceType: 'request',
        resourceId: requestId,
      })
      if (decision.decision !== 'allow') {
        throw new Error(`Insufficient authority: ${decision.reasonCode}`)
      }
    }

    return this.hydrateRequest(requestId, request)
  }

  /**
   * Compatibility method for internal callers that already operate on a
   * tenant-scoped request. New HTTP callers should use getForSubject().
   */
  getForTenant(requestId: string, tenantId: string) {
    const db = DatabaseManager.getDatabase()
    const request = db.prepare(`
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ? AND o.tenant_id = ?
    `).get(requestId, tenantId) as any
    if (!request) return undefined
    return this.hydrateRequest(requestId, request)
  }

  list(tenantId: string, subjectRef: string, status?: RequestStatus, requestType?: string, limit = 100) {
    const db = DatabaseManager.getDatabase()
    const principal = this.resolvePrincipal(tenantId, subjectRef)
    const readDecision = authorizationService.decide({
      tenantId,
      personId: principal.personId,
      action: 'request.read',
      requiredPermission: 'request.read',
      resourceType: 'request',
    })
    const canReadAll = readDecision.decision === 'allow'

    let sql = `
      SELECT r.*
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE o.tenant_id = ?
        AND (? = 1 OR r.requester_person_id = ?)
    `
    const params: unknown[] = [tenantId, canReadAll ? 1 : 0, principal.personId]

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

  private hydrateRequest(requestId: string, request: any) {
    const db = DatabaseManager.getDatabase()
    const items = db.prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY rowid').all(requestId)
    const approvals = db.prepare('SELECT * FROM request_approvals WHERE request_id = ? ORDER BY created_at').all(requestId)
    const tasks = db.prepare('SELECT * FROM request_tasks WHERE request_id = ? ORDER BY created_at').all(requestId)
    const events = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at').all(requestId)

    return {
      ...request,
      context: this.parseContext(request.context_json),
      items,
      approvals,
      tasks,
      events
    }
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
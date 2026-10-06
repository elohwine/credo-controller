/**
 * A request can start the next request.
 *
 * The remodel keeps one request lifecycle and lets execution continue by creating the
 * follow-on request (requisition → purchase order → payment, expense → payment,
 * site access → inspection → maintenance, quote → invoice → payment). Organizations
 * can disable a built-in handoff or add their own. The workflow action `request.trigger`
 * uses the same path when a template wants to name the next request explicitly.
 *
 * The child is a real platform request, submitted so its own stage actor (and delegates)
 * get an inbox card. It is not auto-approved: the next person still has to act.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { platformRequestService } from './PlatformRequestService'
import { requestContextValidator } from './RequestContextValidator'
import {
  collectHandoffFacts,
  handoffConditionLabel,
  handoffConditionMet,
  type HandoffConditionId,
  type HandoffFacts,
} from './workflow/HandoffConditions'

const logger = rootLogger.child({ module: 'RequestHandoffService' })

const MAX_CHAIN_DEPTH = 5

/** How the next request starts: by itself when the status is reached, or when someone asks. */
export type HandoffStartMode = 'auto' | 'manual'

export interface RequestHandoffRule {
  fromType: string
  onStatus: string
  toType: string
  title: string
  targetModule?: string
  copyItems: boolean
  /** Defaults to 'auto'. */
  startMode?: HandoffStartMode
  /** Platform-owned check on the request's own details. Defaults to 'always'. */
  when?: HandoffConditionId
}

/** A catalog entry as shown in organization settings (defaults plus this org's choice). */
export interface RequestHandoffSetting extends RequestHandoffRule {
  key: string
  startMode: HandoffStartMode
  enabled: boolean
  source: 'built_in' | 'custom'
  /** Plain description of when the platform starts it. */
  conditionLabel: string
}

export function requestHandoffKey(rule: Pick<RequestHandoffRule, 'fromType' | 'onStatus' | 'toType'>): string {
  return `request:${normalize(rule.fromType)}|${normalize(rule.onStatus)}|${normalize(rule.toType)}`
}

/**
 * Built-in chains from the remodel (procurement, finance, field, commercial).
 * An organization row in `request_handoffs` replaces or disables a matching rule.
 */
export const DEFAULT_REQUEST_HANDOFFS: RequestHandoffRule[] = [
  // Procurement: requisition → purchase order → supplier payment
  // A cash requisition is paid by its own release step and does not open procurement.
  {
    fromType: 'procurement.requisition',
    onStatus: 'approved',
    toType: 'finance.purchase_order',
    title: 'Purchase order',
    targetModule: 'finance',
    copyItems: true,
    when: 'needs_supplier_purchase',
  },
  {
    fromType: 'requisition',
    onStatus: 'approved',
    toType: 'finance.purchase_order',
    title: 'Purchase order',
    targetModule: 'finance',
    copyItems: true,
    when: 'needs_supplier_purchase',
  },
  {
    fromType: 'finance.purchase_order',
    onStatus: 'approved',
    toType: 'finance.payment_request',
    title: 'Supplier payment',
    targetModule: 'finance',
    copyItems: false,
  },
  // Finance: an approved expense becomes a payment request
  {
    fromType: 'finance.expense_claim',
    onStatus: 'approved',
    toType: 'finance.payment_request',
    title: 'Expense payment',
    targetModule: 'finance',
    copyItems: false,
  },
  // Commercial: accepted quote becomes an invoice, approved invoice becomes a payment
  {
    fromType: 'quote',
    onStatus: 'approved',
    toType: 'invoice',
    title: 'Invoice',
    targetModule: 'finance',
    copyItems: true,
  },
  {
    fromType: 'invoice',
    onStatus: 'approved',
    toType: 'finance.payment_request',
    title: 'Invoice payment',
    targetModule: 'finance',
    copyItems: false,
  },
  // Field: access → inspection → maintenance
  {
    fromType: 'field.site_access',
    onStatus: 'approved',
    toType: 'field.inspection',
    title: 'Site inspection',
    targetModule: 'field',
    copyItems: false,
  },
  {
    fromType: 'field.inspection',
    onStatus: 'completed',
    toType: 'field.maintenance',
    title: 'Maintenance follow-up',
    targetModule: 'field',
    copyItems: false,
  },
]

export interface SpawnedRequest {
  id: string
  requestType: string
  title: string
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function chainDepth(requestId: string): number {
  const db = DatabaseManager.getDatabase()
  let current: string | undefined = requestId
  let depth = 0
  while (current && depth < MAX_CHAIN_DEPTH + 1) {
    const row = db.prepare('SELECT parent_request_id AS parentId FROM requests WHERE id = ?').get(current) as
      | { parentId?: string | null }
      | undefined
    if (!row?.parentId) break
    current = row.parentId
    depth += 1
  }
  return depth
}

function seedContext(toType: string, parent: Record<string, unknown>, parentId: string): Record<string, unknown> {
  const short = parentId.replace(/-/g, '').slice(0, 8)
  if (toType === 'finance.purchase_order') {
    return {
      poRef: `PO-${short}`,
      supplierRef: typeof parent.supplierRef === 'string' ? parent.supplierRef : 'unassigned',
    }
  }
  if (toType === 'finance.payment_request') {
    return {
      paymentReference: `PAY-${short}`,
      payeeRef:
        typeof parent.payeeRef === 'string'
          ? parent.payeeRef
          : typeof parent.supplierRef === 'string'
            ? parent.supplierRef
            : 'unassigned',
    }
  }
  if (toType === 'field.inspection') {
    return { siteRef: typeof parent.siteRef === 'string' ? parent.siteRef : 'unassigned' }
  }
  if (toType === 'field.maintenance') {
    return {
      assetRef: typeof parent.assetRef === 'string' ? parent.assetRef : typeof parent.siteRef === 'string' ? parent.siteRef : 'unassigned',
      workOrderRef: `WO-${short}`,
    }
  }
  return {}
}

function contextForChild(toType: string, parent: Record<string, unknown>, parentId: string): Record<string, unknown> {
  const seeded = seedContext(toType, parent, parentId)
  const allowed = requestContextValidator.allowedKeys(toType)
  const merged = requestContextValidator.omitDeniedKeys({ ...parent, ...seeded })
  if (!allowed) {
    // Unknown types warn-and-allow, but never carry credential material keys.
    const safe: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') safe[key] = value
    }
    return safe
  }
  const filtered: Record<string, unknown> = {}
  for (const key of allowed) {
    if (merged[key] !== undefined) filtered[key] = merged[key]
  }
  return filtered
}

interface RequestHandoffRow {
  fromType: string
  onStatus: string
  toType: string
  title?: string | null
  targetModule?: string | null
  copyItems?: number
  enabled?: number
  startMode?: string | null
}

export class RequestHandoffService {
  private organizationRows(organizationId: string): RequestHandoffRow[] {
    try {
      return DatabaseManager.getDatabase()
        .prepare(
          `SELECT from_request_type AS fromType, on_status AS onStatus, to_request_type AS toType,
                  title, target_module AS targetModule, copy_items AS copyItems, enabled, start_mode AS startMode
           FROM request_handoffs WHERE organization_id = ?`,
        )
        .all(organizationId) as RequestHandoffRow[]
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'request_handoffs unavailable; using built-in handoffs')
      return []
    }
  }

  /**
   * Every hand-off this organization can see in settings: built-in defaults with the
   * organization's start choice applied, plus any custom rows it added.
   */
  public catalogFor(organizationId: string): RequestHandoffSetting[] {
    const byKey = new Map<string, RequestHandoffSetting>()
    for (const rule of DEFAULT_REQUEST_HANDOFFS) {
      byKey.set(requestHandoffKey(rule), {
        ...rule,
        key: requestHandoffKey(rule),
        startMode: rule.startMode || 'auto',
        enabled: true,
        source: 'built_in',
        conditionLabel: handoffConditionLabel(rule.when),
      })
    }
    for (const row of this.organizationRows(organizationId)) {
      const key = requestHandoffKey(row)
      const base = byKey.get(key)
      byKey.set(key, {
        key,
        fromType: row.fromType,
        onStatus: row.onStatus,
        toType: row.toType,
        title: row.title || base?.title || `Follow-on ${row.toType}`,
        targetModule: row.targetModule || base?.targetModule,
        copyItems: row.copyItems === undefined || row.copyItems === null ? (base?.copyItems ?? true) : row.copyItems !== 0,
        startMode: row.startMode === 'manual' ? 'manual' : 'auto',
        enabled: row.enabled !== 0,
        source: base ? 'built_in' : 'custom',
        when: base?.when,
        conditionLabel: handoffConditionLabel(base?.when),
      })
    }
    return [...byKey.values()]
  }

  /** Defaults merged with this organization's overrides; disabled rules are left out. */
  public rulesFor(organizationId: string): RequestHandoffRule[] {
    return this.catalogFor(organizationId).filter((rule) => rule.enabled)
  }

  /**
   * Save the organization's choice for one hand-off: start by itself, start when someone
   * asks, or switch it off. Built-in rules keep their title/module; custom rules need a title.
   */
  public saveSetting(
    organizationId: string,
    input: {
      fromType: string
      onStatus: string
      toType: string
      startMode?: HandoffStartMode
      enabled?: boolean
      title?: string
      targetModule?: string
      copyItems?: boolean
    },
  ): RequestHandoffSetting {
    const key = requestHandoffKey(input)
    const current = this.catalogFor(organizationId).find((rule) => rule.key === key)
    const next = {
      fromType: input.fromType.trim(),
      onStatus: input.onStatus.trim(),
      toType: input.toType.trim(),
      title: input.title?.trim() || current?.title || `Follow-on ${input.toType}`,
      targetModule: input.targetModule ?? current?.targetModule ?? null,
      copyItems: input.copyItems ?? current?.copyItems ?? true,
      startMode: input.startMode ?? current?.startMode ?? 'auto',
      enabled: input.enabled ?? current?.enabled ?? true,
    }
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO request_handoffs
           (id, organization_id, from_request_type, on_status, to_request_type, title, target_module, copy_items, enabled, start_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(organization_id, from_request_type, on_status, to_request_type) DO UPDATE SET
           title = excluded.title, target_module = excluded.target_module, copy_items = excluded.copy_items,
           enabled = excluded.enabled, start_mode = excluded.start_mode`,
      )
      .run(
        randomUUID(),
        organizationId,
        next.fromType,
        next.onStatus,
        next.toType,
        next.title,
        next.targetModule,
        next.copyItems ? 1 : 0,
        next.enabled ? 1 : 0,
        next.startMode,
      )
    return this.catalogFor(organizationId).find((rule) => rule.key === key)!
  }

  /**
   * Hand-offs that wait for someone to ask: rules set to 'manual' whose trigger status the
   * request has reached, and that have not been started yet.
   */
  public manualNextFor(params: { tenantId: string; organizationId?: string; requestId: string; requestType: string; status: string }) {
    const organizationId = params.organizationId || this.organizationId(params.tenantId)
    if (!organizationId) return []
    const db = DatabaseManager.getDatabase()
    const facts = this.factsFor(params.requestId, params.tenantId)
    return this.rulesFor(organizationId)
      .filter(
        (rule) =>
          rule.startMode === 'manual' &&
          normalize(rule.fromType) === normalize(params.requestType) &&
          normalize(rule.onStatus) === normalize(params.status) &&
          handoffConditionMet(rule.when, facts),
      )
      .map((rule) => {
        const existing = db
          .prepare(`SELECT id FROM requests WHERE parent_request_id = ? AND request_type = ? LIMIT 1`)
          .get(params.requestId, rule.toType) as { id?: string } | undefined
        return { key: requestHandoffKey(rule), title: rule.title, toType: rule.toType, startedRequestId: existing?.id }
      })
  }

  /** Someone asked for the next request. Only rules the organization allows can be started. */
  public startManual(params: { tenantId: string; parentRequestId: string; toType: string }): SpawnedRequest | undefined {
    const parent = this.loadParent(params.parentRequestId, params.tenantId)
    if (!parent) return undefined
    const facts = this.factsFor(params.parentRequestId, params.tenantId)
    const rule = this.rulesFor(parent.organizationId).find(
      (candidate) =>
        normalize(candidate.fromType) === normalize(parent.requestType) &&
        normalize(candidate.toType) === normalize(params.toType) &&
        handoffConditionMet(candidate.when, facts),
    )
    if (!rule) return undefined
    return this.triggerExplicit({
      tenantId: params.tenantId,
      parentRequestId: params.parentRequestId,
      toType: rule.toType,
      title: rule.title,
      targetModule: rule.targetModule,
      copyItems: rule.copyItems,
    })
  }

  /**
   * After a platform request changes status, create each matching follow-on request.
   * Failures are logged and do not undo the transition that already committed.
   */
  public continueFromPlatformRequest(params: {
    tenantId: string
    organizationId?: string
    requestId: string
    requestType: string
    toStatus: string
    title?: string
    amount?: number | null
    currency?: string | null
    departmentId?: string | null
    context?: Record<string, unknown>
    subjectRef?: string
  }): SpawnedRequest[] {
    const parent = this.loadParent(params.requestId, params.tenantId)
    const organizationId = params.organizationId || parent?.organizationId
    if (!organizationId) return []
    const requestType = params.requestType || parent?.requestType || ''
    const title = params.title || parent?.title
    const amount = params.amount ?? parent?.amount
    const currency = params.currency ?? parent?.currency
    const departmentId = params.departmentId ?? parent?.departmentId
    const context = params.context || parent?.context || {}

    // Rules set to 'manual' wait for someone to ask (see startManual); rules whose condition
    // does not apply to this request (a cash requisition and procurement) are skipped.
    const facts = collectHandoffFacts({ amount, context, items: this.copyItems(params.requestId) })
    const rules = this.rulesFor(organizationId).filter(
      (rule) =>
        rule.startMode !== 'manual' &&
        normalize(rule.fromType) === normalize(requestType) &&
        normalize(rule.onStatus) === normalize(params.toStatus) &&
        handoffConditionMet(rule.when, facts),
    )
    if (rules.length === 0) return []
    if (chainDepth(params.requestId) >= MAX_CHAIN_DEPTH) {
      logger.warn({ requestId: params.requestId }, 'Request handoff chain depth exceeded')
      return []
    }

    const subjectRef = params.subjectRef || this.subjectForPerson(params.requestId) || this.fallbackMember(params.tenantId)
    if (!subjectRef) return []

    const spawned: SpawnedRequest[] = []
    for (const rule of rules) {
      const child = this.spawn({
        tenantId: params.tenantId,
        organizationId,
        parentRequestId: params.requestId,
        subjectRef,
        rule,
        title: title || requestType,
        amount,
        currency,
        departmentId,
        context,
      })
      if (child) spawned.push(child)
    }
    return spawned
  }

  /**
   * Workflow-request approval (holder → org) continues into the same catalog.
   * A requisition approval opens a purchase order; a quote approval opens an invoice.
   */
  public continueFromWorkflowRequest(params: {
    orgTenantId: string
    requestId: string
    requestType: string
    workflowType?: string
    title?: string
    amount?: number
    currency?: string
    payload?: Record<string, unknown>
    actedByUserId?: string
  }): SpawnedRequest[] {
    const organizationId = this.organizationId(params.orgTenantId)
    if (!organizationId) return []
    const subjectRef = this.fallbackMember(params.orgTenantId, params.actedByUserId)
    if (!subjectRef) return []

    const fromType = params.requestType
    const payload =
      params.payload && Object.keys(params.payload).length > 0 ? params.payload : this.workflowRequestPayload(params.requestId)
    const facts = collectHandoffFacts({ amount: params.amount ?? payload.amount ?? payload.totalAmount, context: payload })
    const automatic = this.rulesFor(organizationId).filter(
      (rule) => rule.startMode !== 'manual' && handoffConditionMet(rule.when, facts),
    )
    const rules = automatic.filter((rule) => normalize(rule.fromType) === normalize(fromType) && rule.onStatus === 'approved')
    // Also match the workflow type label (internal_requisitions, education fees, …) when
    // the request type itself has no rule.
    const workflowRules =
      rules.length > 0
        ? rules
        : automatic.filter(
            (rule) =>
              params.workflowType &&
              normalize(rule.fromType) === normalize(params.workflowType) &&
              rule.onStatus === 'approved',
          )
    if (workflowRules.length === 0) return []

    const spawned: SpawnedRequest[] = []
    for (const rule of workflowRules) {
      const child = this.spawn({
        tenantId: params.orgTenantId,
        organizationId,
        parentRequestId: params.requestId,
        subjectRef,
        rule,
        title: params.title || params.requestType,
        amount: params.amount ?? facts.amount,
        currency: params.currency ?? (typeof payload.currency === 'string' ? payload.currency : undefined),
        departmentId: null,
        context: facts.supplier && !payload.supplierRef ? { ...payload, supplierRef: facts.supplier } : payload,
        parentIsPlatformRequest: false,
      })
      if (child) spawned.push(child)
    }
    return spawned
  }

  /** Explicit next request from a workflow step (`request.trigger`). */
  public triggerExplicit(params: {
    tenantId: string
    parentRequestId: string
    toType: string
    title?: string
    targetModule?: string
    copyItems?: boolean
  }): SpawnedRequest | undefined {
    const parent = this.loadParent(params.parentRequestId, params.tenantId)
    if (!parent) return undefined
    const subjectRef = this.subjectForPerson(params.parentRequestId) || this.fallbackMember(params.tenantId)
    if (!subjectRef) return undefined
    return this.spawn({
      tenantId: params.tenantId,
      organizationId: parent.organizationId,
      parentRequestId: params.parentRequestId,
      subjectRef,
      rule: {
        fromType: parent.requestType,
        onStatus: 'explicit',
        toType: params.toType,
        title: params.title || `Follow-on ${params.toType}`,
        targetModule: params.targetModule,
        copyItems: params.copyItems !== false,
      },
      title: parent.title,
      amount: parent.amount,
      currency: parent.currency,
      departmentId: parent.departmentId,
      context: parent.context,
    })
  }

  private spawn(params: {
    tenantId: string
    organizationId: string
    parentRequestId: string
    subjectRef: string
    rule: RequestHandoffRule
    title: string
    amount?: number | null
    currency?: string | null
    departmentId?: string | null
    context: Record<string, unknown>
    parentIsPlatformRequest?: boolean
  }): SpawnedRequest | undefined {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id, request_type AS requestType, title FROM requests
         WHERE parent_request_id = ? AND request_type = ? LIMIT 1`,
      )
      .get(params.parentRequestId, params.rule.toType) as { id?: string; requestType?: string; title?: string } | undefined
    if (existing?.id) {
      return { id: existing.id, requestType: existing.requestType || params.rule.toType, title: existing.title || params.rule.title }
    }

    const childTitle = `${params.rule.title}: ${params.title}`.slice(0, 180)
    const context = contextForChild(params.rule.toType, params.context, params.parentRequestId)
    let created: { id?: string } | undefined
    try {
      created = platformRequestService.create({
        tenantId: params.tenantId,
        subjectRef: params.subjectRef,
        requestType: params.rule.toType,
        title: childTitle,
        amount: typeof params.amount === 'number' ? params.amount : undefined,
        currency: params.currency || undefined,
        targetModule: params.rule.targetModule,
        context,
        items: params.rule.copyItems ? this.copyItems(params.parentRequestId) : undefined,
      }) as { id?: string }
    } catch (error: any) {
      logger.warn(
        { error: error?.message, parentRequestId: params.parentRequestId, toType: params.rule.toType },
        'Follow-on request was not created',
      )
      return undefined
    }

    const childId = created?.id
    if (!childId) return undefined

    db.prepare('UPDATE requests SET parent_request_id = ? WHERE id = ?').run(params.parentRequestId, childId)

    if (params.departmentId) {
      db.prepare('UPDATE requests SET department_id = ? WHERE id = ?').run(params.departmentId, childId)
    }

    try {
      platformRequestService.submit(childId, params.tenantId, params.subjectRef)
    } catch (error: any) {
      logger.warn({ error: error?.message, childId }, 'Follow-on request stayed in draft')
    }

    if (params.parentIsPlatformRequest !== false) {
      db.prepare(
        `INSERT INTO request_events (id, request_id, event_type, from_status, to_status, payload_json)
         VALUES (?, ?, 'request.handoff', NULL, NULL, ?)`,
      ).run(
        randomUUID(),
        params.parentRequestId,
        JSON.stringify({ childRequestId: childId, childRequestType: params.rule.toType }),
      )
    }

    logger.info(
      { parentRequestId: params.parentRequestId, childId, toType: params.rule.toType },
      'Request started the next request',
    )
    return { id: childId, requestType: params.rule.toType, title: childTitle }
  }

  private copyItems(parentRequestId: string): Array<{ description: string; quantity?: number; unitPrice?: number; itemType?: string }> {
    try {
      const rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT description, quantity, unit_price AS unitPrice, item_type AS itemType
           FROM request_items WHERE request_id = ?`,
        )
        .all(parentRequestId) as Array<{ description: string; quantity?: number; unitPrice?: number; itemType?: string }>
      return rows.map((row) => ({
        description: row.description,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        itemType: row.itemType,
      }))
    } catch {
      return []
    }
  }

  /**
   * The details a workflow request was raised with. Approval paths that only know the id
   * (the requisition approval, for instance) still get supplier, items and amount.
   */
  private workflowRequestPayload(requestId: string): Record<string, any> {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(
          `SELECT payload FROM workflow_requests
           WHERE id = ? OR json_extract(payload, '$.requisitionId') = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(requestId, requestId) as { payload?: string } | undefined
      const parsed = row?.payload ? JSON.parse(row.payload) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** Facts the platform checks before starting a follow-on for this request. */
  public factsFor(requestId: string, tenantId: string): HandoffFacts {
    const parent = this.loadParent(requestId, tenantId)
    if (parent) return collectHandoffFacts({ amount: parent.amount, context: parent.context, items: this.copyItems(requestId) })
    const payload = this.workflowRequestPayload(requestId)
    return collectHandoffFacts({ amount: payload.amount ?? payload.totalAmount, context: payload })
  }

  private loadParent(requestId: string, tenantId: string): {
    organizationId: string
    requestType: string
    title: string
    amount?: number
    currency?: string
    departmentId?: string
    context: Record<string, unknown>
  } | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT r.organization_id AS organizationId, r.request_type AS requestType, r.title,
                r.amount, r.currency, r.department_id AS departmentId, r.context_json AS contextJson
         FROM requests r
         JOIN organizations o ON o.id = r.organization_id
         WHERE r.id = ? AND o.tenant_id = ?`,
      )
      .get(requestId, tenantId) as
      | {
          organizationId: string
          requestType: string
          title: string
          amount?: number
          currency?: string
          departmentId?: string
          contextJson?: string
        }
      | undefined
    if (!row) return undefined
    let context: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(row.contextJson || '{}')
      if (parsed && typeof parsed === 'object') context = parsed
    } catch {
      context = {}
    }
    return { ...row, context }
  }

  private organizationId(tenantId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(tenantId) as { id?: string } | undefined
    return row?.id
  }

  private subjectForPerson(requestId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT p.subject_ref AS subjectRef
         FROM requests r JOIN people p ON p.id = r.requester_person_id
         WHERE r.id = ?`,
      )
      .get(requestId) as { subjectRef?: string } | undefined
    return row?.subjectRef
  }

  private fallbackMember(tenantId: string, preferredUserId?: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    if (preferredUserId) {
      const preferred = db
        .prepare(
          `SELECT user_id AS userId FROM org_memberships
           WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
        )
        .get(tenantId, preferredUserId) as { userId?: string } | undefined
      if (preferred?.userId) return preferred.userId
    }
    const owner = db
      .prepare(
        `SELECT user_id AS userId FROM org_memberships
         WHERE org_tenant_id = ? AND status = 'active' AND role IN ('owner', 'admin')
         ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1`,
      )
      .get(tenantId) as { userId?: string } | undefined
    return owner?.userId
  }
}

export const requestHandoffService = new RequestHandoffService()

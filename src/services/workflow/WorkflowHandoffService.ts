/**
 * A running job can hand control to another procedure and take it back.
 *
 * Examples: a field job starts a quote for extra work (quote → invoice → receipt) and
 * waits for it; a field job raises a materials purchase; an approved requisition starts
 * a purchase order. The engine already knows how to start other templates; this service
 * adds the two things that were missing:
 *
 *  - wait-and-return: the parent is held while a child it depends on is running, the
 *    child's result is written back, and the parent continues when the child finishes;
 *  - a per-organization choice for each hand-off: start by itself ('auto') when the
 *    required stages are done, or start when someone on the job asks ('manual').
 *
 * What moves across and whether the parent waits is defined here in the catalog, not by
 * each organization. Settings only expose: start mode, required stages, on/off.
 *
 * Durable row first (workflow_handoff_links), then side effects, so a retry never starts
 * the same child twice.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { workflowRunRepository, type WorkflowRun } from '../../persistence/WorkflowRunRepository'
import { outboxService } from '../OutboxService'
import { platformRequestService } from '../PlatformRequestService'
import { requestHandoffService, type HandoffStartMode, type RequestHandoffSetting } from '../RequestHandoffService'
import { rootLogger } from '../../utils/pinoLogger'

import { collectHandoffFacts, handoffConditionLabel, handoffConditionMet, type HandoffConditionId } from './HandoffConditions'
import { getWorkflowTypeCandidates, normalizeWorkflowTypeAlias } from './initiation'
import { ensureExecutableWorkflow } from './materialize'

const logger = rootLogger.child({ module: 'WorkflowHandoffService' })

export type HandoffChildKind = 'run' | 'request'
export type HandoffLinkStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface HandoffStageOption {
  id: string
  label: string
}

/** A field the person fills in when they start the hand-off by hand. */
export interface HandoffInputField {
  name: string
  label: string
  type: 'text' | 'number'
  required?: boolean
}

export interface WorkflowHandoffDefinition {
  key: string
  label: string
  description: string
  /** Parent workflow type (alias or template id). */
  fromWorkflowType: string
  childKind: HandoffChildKind
  /** Template id / workflow type for runs, request type for platform requests. */
  toType: string
  /** The parent waits for this child and continues when it finishes. */
  holdParent: boolean
  defaultStartMode: HandoffStartMode
  defaultRequiredStages: string[]
  /** Stages of the parent an organization may require before this hand-off is available. */
  stageOptions: HandoffStageOption[]
  /** What the person provides when starting by hand. Auto starts use parent data only. */
  fields: HandoffInputField[]
  /** May be started again once the previous child has finished. */
  repeatable: boolean
  /** Platform-owned check on the job's details; not shown when it does not apply. */
  when?: HandoffConditionId
  buildChildInput: (parent: ParentSnapshot, provided: Record<string, unknown>) => Record<string, unknown>
}

export interface WorkflowHandoffSetting {
  key: string
  kind: 'job' | 'request'
  label: string
  description: string
  from: string
  fromLabel: string
  to: string
  toLabel: string
  holdParent: boolean
  startMode: HandoffStartMode
  requiredStages: string[]
  stageOptions: HandoffStageOption[]
  enabled: boolean
  source: 'built_in' | 'custom'
  /** Plain description of when the platform offers or starts it. Not editable. */
  conditionLabel: string
}

export interface HandoffLink {
  id: string
  key: string
  label: string
  childKind: HandoffChildKind
  childId: string
  holdParent: boolean
  status: HandoffLinkStatus
  startedBy?: string
  startedAt?: string
  finishedAt?: string
  result?: Record<string, unknown>
}

export interface AvailableHandoff {
  key: string
  label: string
  description: string
  holdParent: boolean
  startMode: HandoffStartMode
  fields: HandoffInputField[]
}

export interface RunHandoffsView {
  available: AvailableHandoff[]
  active: HandoffLink[]
  /** The job cannot continue until these finish. */
  waitingFor: HandoffLink[]
  completedStages: string[]
}

interface ParentSnapshot {
  runId: string
  input: Record<string, any>
  state: Record<string, any>
}

const FIELD_JOB_STAGES: HandoffStageOption[] = [
  { id: 'await_site_inspection', label: 'Site inspection done' },
  { id: 'await_risk_assessment', label: 'Risk check done' },
  { id: 'await_worker_start', label: 'Worker started' },
  { id: 'await_arrival', label: 'Worker arrived' },
  { id: 'await_evidence_before', label: 'Before photos taken' },
  { id: 'await_evidence_after', label: 'After photos taken' },
  { id: 'await_evidence_receipt', label: 'Receipts captured' },
  { id: 'await_completion_review', label: 'Work reviewed' },
  { id: 'await_acknowledgement', label: 'Signed off' },
  { id: 'await_payout_release', label: 'Payment released' },
]

const TYPE_LABELS: Record<string, string> = {
  field_execution_fept: 'Field job',
  'tpl-fept-field-execution': 'Field job',
  'tpl-quote-invoice-receipt': 'Quote, invoice and receipt',
  'tpl-payment-collection': 'Payment collection',
  'tpl-ap-payables': 'Supplier payment',
  'tpl-ar-collections': 'Customer collections',
  'procurement.requisition': 'Purchase requisition',
  requisition: 'Requisition',
  internal_requisitions: 'Requisition',
  'finance.purchase_order': 'Purchase order',
  'finance.payment_request': 'Payment',
  'finance.expense_claim': 'Expense claim',
  quote: 'Quote',
  invoice: 'Invoice',
  'field.site_access': 'Site access',
  'field.inspection': 'Site inspection',
  'field.maintenance': 'Maintenance follow-up',
}

export function handoffTypeLabel(type: string): string {
  return TYPE_LABELS[type] || TYPE_LABELS[normalizeWorkflowTypeAlias(type)] || type.replace(/^tpl-/, '').replace(/[._-]/g, ' ')
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function text(value: unknown, fallback = ''): string {
  const s = String(value ?? '').trim()
  return s || fallback
}

/** Built-in catalog. An organization's row only changes start mode, required stages, on/off. */
export const WORKFLOW_HANDOFF_CATALOG: WorkflowHandoffDefinition[] = [
  {
    key: 'field_quote_extra_work',
    label: 'Quote for extra work',
    description: 'Send the client a quote for extra work found on site. The job waits until the quote is paid or declined, then continues.',
    fromWorkflowType: 'field_execution_fept',
    childKind: 'run',
    toType: 'tpl-quote-invoice-receipt',
    holdParent: true,
    defaultStartMode: 'manual',
    defaultRequiredStages: ['await_worker_start'],
    stageOptions: FIELD_JOB_STAGES,
    fields: [
      { name: 'description', label: 'What is the extra work?', type: 'text', required: true },
      { name: 'amount', label: 'Price', type: 'number', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number' },
    ],
    repeatable: true,
    when: 'has_customer',
    buildChildInput: (parent, provided) => {
      const description = text(provided.description, `Extra work on ${text(parent.input.reference, 'job')}`)
      const quantity = asNumber(provided.quantity) ?? 1
      const unitPrice = asNumber(provided.amount) ?? asNumber(parent.input.amount) ?? 0
      const items = Array.isArray(provided.items) && provided.items.length > 0 ? provided.items : [{ description, quantity, unitPrice }]
      return {
        items,
        buyerPhone: text(provided.buyerPhone, text(parent.input.customerMsisdn)),
        buyerName: text(provided.buyerName, text(parent.input.clientName)),
        buyerDid: text(parent.input.buyerDid) || undefined,
        currency: text(parent.input.currency) || undefined,
        reference: text(parent.input.reference) || undefined,
        requestId: text(parent.input.requestId) || undefined,
      }
    },
  },
  {
    key: 'field_buy_materials',
    label: 'Buy materials',
    description: 'Raise a purchase request for parts or materials the job needs. The job waits until the purchase is approved or declined, then continues.',
    fromWorkflowType: 'field_execution_fept',
    childKind: 'request',
    toType: 'procurement.requisition',
    holdParent: true,
    defaultStartMode: 'manual',
    defaultRequiredStages: ['await_worker_start'],
    stageOptions: FIELD_JOB_STAGES,
    fields: [
      { name: 'description', label: 'What do you need?', type: 'text', required: true },
      { name: 'amount', label: 'Estimated cost', type: 'number', required: true },
    ],
    repeatable: true,
    buildChildInput: (parent, provided) => ({
      title: `Materials for ${text(parent.input.reference, text(parent.input.description, 'field job'))}`.slice(0, 180),
      description: text(provided.description, 'Materials needed on site'),
      amount: asNumber(provided.amount),
      currency: text(parent.input.currency, 'USD'),
      items: [{ description: text(provided.description, 'Materials'), quantity: 1, unitPrice: asNumber(provided.amount) }],
      context: {
        categoryCode: 'materials',
        projectRef: text(parent.input.reference) || undefined,
        deliveryRef: text(parent.input.location) || undefined,
      },
    }),
  },
]

function stageLabel(options: HandoffStageOption[], id: string): string {
  return options.find((option) => option.id === id)?.label || id
}

export class WorkflowHandoffService {
  // ── Settings ────────────────────────────────────────────────────────────────

  private organizationRows(orgTenantId: string) {
    try {
      return DatabaseManager.getDatabase()
        .prepare(
          `SELECT handoff_key AS key, start_mode AS startMode, required_stages AS requiredStages, enabled
           FROM org_workflow_handoffs WHERE org_tenant_id = ?`,
        )
        .all(orgTenantId) as Array<{ key: string; startMode?: string; requiredStages?: string | null; enabled?: number }>
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'org_workflow_handoffs unavailable; using catalog defaults')
      return []
    }
  }

  private organizationId(orgTenantId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(orgTenantId) as { id?: string } | undefined
    return row?.id
  }

  /** Job hand-offs (catalog + org choice). */
  public jobSettingsFor(orgTenantId: string): WorkflowHandoffSetting[] {
    const rows = new Map(this.organizationRows(orgTenantId).map((row) => [row.key, row]))
    return WORKFLOW_HANDOFF_CATALOG.map((def) => {
      const row = rows.get(def.key)
      let requiredStages = def.defaultRequiredStages
      if (row?.requiredStages) {
        try {
          const parsed = JSON.parse(row.requiredStages)
          if (Array.isArray(parsed)) requiredStages = parsed.map(String).filter((id) => def.stageOptions.some((o) => o.id === id))
        } catch {
          requiredStages = def.defaultRequiredStages
        }
      }
      return {
        key: def.key,
        kind: 'job',
        label: def.label,
        description: def.description,
        from: def.fromWorkflowType,
        fromLabel: handoffTypeLabel(def.fromWorkflowType),
        to: def.toType,
        toLabel: handoffTypeLabel(def.toType),
        holdParent: def.holdParent,
        startMode: row?.startMode === 'auto' ? 'auto' : row?.startMode === 'manual' ? 'manual' : def.defaultStartMode,
        requiredStages,
        stageOptions: def.stageOptions,
        enabled: row ? row.enabled !== 0 : true,
        source: 'built_in',
        conditionLabel: handoffConditionLabel(def.when),
      }
    })
  }

  /** Request chains, in the same shape, so settings screens show one list. */
  public requestSettingsFor(orgTenantId: string): WorkflowHandoffSetting[] {
    const organizationId = this.organizationId(orgTenantId)
    if (!organizationId) return []
    return requestHandoffService.catalogFor(organizationId).map((rule) => this.requestSetting(rule))
  }

  private requestSetting(rule: RequestHandoffSetting): WorkflowHandoffSetting {
    const statusLabel = rule.onStatus === 'completed' ? 'Completed' : rule.onStatus === 'approved' ? 'Approved' : rule.onStatus
    return {
      key: rule.key,
      kind: 'request',
      label: rule.title,
      description: `${handoffTypeLabel(rule.fromType)} is ${statusLabel.toLowerCase()} → ${handoffTypeLabel(rule.toType)}`,
      from: rule.fromType,
      fromLabel: handoffTypeLabel(rule.fromType),
      to: rule.toType,
      toLabel: handoffTypeLabel(rule.toType),
      holdParent: false,
      startMode: rule.startMode,
      requiredStages: [rule.onStatus],
      stageOptions: [{ id: rule.onStatus, label: statusLabel }],
      enabled: rule.enabled,
      source: rule.source,
      conditionLabel: rule.conditionLabel,
    }
  }

  public settingsFor(orgTenantId: string): WorkflowHandoffSetting[] {
    return [...this.jobSettingsFor(orgTenantId), ...this.requestSettingsFor(orgTenantId)]
  }

  /** Save one hand-off choice. Unknown keys and unknown stage ids are rejected. */
  public saveSetting(
    orgTenantId: string,
    key: string,
    patch: { startMode?: HandoffStartMode; requiredStages?: string[]; enabled?: boolean },
  ): WorkflowHandoffSetting {
    if (patch.startMode && patch.startMode !== 'auto' && patch.startMode !== 'manual') {
      throw new Error("startMode must be 'auto' or 'manual'")
    }
    if (key.startsWith('request:')) {
      const organizationId = this.organizationId(orgTenantId)
      if (!organizationId) throw new Error('Organization not found')
      const rule = requestHandoffService.catalogFor(organizationId).find((entry) => entry.key === key)
      if (!rule) throw new Error(`Unknown hand-off: ${key}`)
      const saved = requestHandoffService.saveSetting(organizationId, {
        fromType: rule.fromType,
        onStatus: rule.onStatus,
        toType: rule.toType,
        startMode: patch.startMode,
        enabled: patch.enabled,
      })
      return this.requestSetting(saved)
    }

    const def = WORKFLOW_HANDOFF_CATALOG.find((entry) => entry.key === key)
    if (!def) throw new Error(`Unknown hand-off: ${key}`)
    const current = this.jobSettingsFor(orgTenantId).find((entry) => entry.key === key)!
    const requiredStages = patch.requiredStages
      ? patch.requiredStages.map(String).filter((id) => def.stageOptions.some((o) => o.id === id))
      : current.requiredStages
    const startMode = patch.startMode ?? current.startMode
    const enabled = patch.enabled ?? current.enabled
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO org_workflow_handoffs (id, org_tenant_id, handoff_key, start_mode, required_stages, enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_tenant_id, handoff_key) DO UPDATE SET
           start_mode = excluded.start_mode, required_stages = excluded.required_stages,
           enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(randomUUID(), orgTenantId, key, startMode, JSON.stringify(requiredStages), enabled ? 1 : 0)
    return this.jobSettingsFor(orgTenantId).find((entry) => entry.key === key)!
  }

  // ── Per-run view ────────────────────────────────────────────────────────────

  private runWorkflowType(run: WorkflowRun): string[] {
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const explicit = String(state.workflowType || run.input?.workflowType || '').trim()
    const candidates = new Set<string>()
    for (const raw of [explicit, run.workflowId]) {
      if (!raw) continue
      for (const candidate of getWorkflowTypeCandidates(raw)) candidates.add(candidate)
      // Org-specific materialized ids look like `<type>-<orgTenantId>-<ts>-<n>`.
      const base = raw.split('-')[0]
      if (base) for (const candidate of getWorkflowTypeCandidates(base)) candidates.add(candidate)
      const prefixed = raw.match(/^([a-z_]+)-[0-9a-f]{8}-/i)?.[1]
      if (prefixed) for (const candidate of getWorkflowTypeCandidates(prefixed)) candidates.add(candidate)
    }
    return [...candidates]
  }

  private matchesFrom(def: WorkflowHandoffDefinition, run: WorkflowRun): boolean {
    const fromCandidates = getWorkflowTypeCandidates(def.fromWorkflowType)
    return this.runWorkflowType(run).some((candidate) => fromCandidates.includes(candidate))
  }

  public completedStages(run: WorkflowRun): string[] {
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const done = new Set<string>(Array.isArray(state.completedStages) ? state.completedStages.map(String) : [])
    if (run.status === 'completed') for (const option of FIELD_JOB_STAGES) done.add(option.id)
    return [...done]
  }

  public links(parentRunId: string): HandoffLink[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, handoff_key AS key, child_kind AS childKind, child_id AS childId, hold_parent AS holdParent, status,
                started_by AS startedBy, started_at AS startedAt, finished_at AS finishedAt, result_json AS resultJson
         FROM workflow_handoff_links WHERE parent_run_id = ? ORDER BY started_at ASC`,
      )
      .all(parentRunId) as Array<Record<string, any>>
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      label: WORKFLOW_HANDOFF_CATALOG.find((def) => def.key === row.key)?.label || row.key,
      childKind: row.childKind,
      childId: row.childId,
      holdParent: row.holdParent !== 0,
      status: row.status,
      startedBy: row.startedBy || undefined,
      startedAt: row.startedAt || undefined,
      finishedAt: row.finishedAt || undefined,
      result: row.resultJson ? safeJson(row.resultJson) : undefined,
    }))
  }

  public waitingFor(parentRunId: string): HandoffLink[] {
    return this.links(parentRunId).filter((link) => link.status === 'running' && link.holdParent)
  }

  /** Hand-offs the job may start now, given the organization's choices and the stages done. */
  public availableFor(run: WorkflowRun): AvailableHandoff[] {
    if (run.status !== 'paused' && run.status !== 'running') return []
    const done = new Set(this.completedStages(run))
    const links = this.links(run.id)
    const facts = collectHandoffFacts({
      amount: run.input?.amount,
      context: { ...((run.input as Record<string, unknown>) || {}), ...((run.output as Record<string, unknown>) || {}) },
    })
    return this.jobSettingsFor(run.tenantId)
      .filter((setting) => setting.enabled)
      .map((setting) => ({ setting, def: WORKFLOW_HANDOFF_CATALOG.find((d) => d.key === setting.key)! }))
      .filter(({ def }) => this.matchesFrom(def, run))
      .filter(({ def }) => handoffConditionMet(def.when, facts))
      .filter(({ setting }) => setting.requiredStages.every((stage) => done.has(stage)))
      .filter(({ def }) => {
        const mine = links.filter((link) => link.key === def.key)
        if (mine.some((link) => link.status === 'running')) return false
        return def.repeatable || mine.length === 0
      })
      .map(({ setting, def }) => ({
        key: def.key,
        label: def.label,
        description: def.description,
        holdParent: def.holdParent,
        startMode: setting.startMode,
        fields: def.fields,
      }))
  }

  public viewFor(run: WorkflowRun): RunHandoffsView {
    return {
      available: this.availableFor(run),
      active: this.links(run.id),
      waitingFor: this.waitingFor(run.id),
      completedStages: this.completedStages(run),
    }
  }

  /** Plain-language reason the job cannot continue, or undefined. */
  public holdMessage(parentRunId: string): string | undefined {
    const waiting = this.waitingFor(parentRunId)
    if (waiting.length === 0) return undefined
    const labels = waiting.map((link) => link.label.toLowerCase())
    return `Finish "${labels.join('" and "')}" first. This job continues when it is done.`
  }

  // ── Starting ────────────────────────────────────────────────────────────────

  /**
   * Start one hand-off from a job. Returns the existing link when the same hand-off is already
   * running (safe to retry). `provided` is what the person typed; auto starts pass nothing.
   */
  public async start(params: {
    runId: string
    key: string
    provided?: Record<string, unknown>
    actedByUserId?: string
    mode: HandoffStartMode
  }): Promise<HandoffLink> {
    const run = workflowRunRepository.findRunById(params.runId)
    if (!run) throw new Error(`Run not found: ${params.runId}`)
    const def = WORKFLOW_HANDOFF_CATALOG.find((entry) => entry.key === params.key)
    if (!def) throw new Error(`Unknown hand-off: ${params.key}`)

    const running = this.links(run.id).find((link) => link.key === def.key && link.status === 'running')
    if (running) return running

    const available = this.availableFor(run).find((entry) => entry.key === def.key)
    if (!available) {
      const setting = this.jobSettingsFor(run.tenantId).find((entry) => entry.key === def.key)
      const missing = (setting?.requiredStages || []).filter((stage) => !this.completedStages(run).includes(stage))
      if (setting && !setting.enabled) throw new Error(`"${def.label}" is switched off for this organization.`)
      if (missing.length > 0) {
        throw new Error(`"${def.label}" is available after: ${missing.map((id) => stageLabel(def.stageOptions, id)).join(', ')}.`)
      }
      throw new Error(`"${def.label}" cannot be started from this job right now.`)
    }
    if (params.mode === 'manual') {
      for (const field of def.fields) {
        if (field.required && text(params.provided?.[field.name]) === '') throw new Error(`${field.label} is required.`)
      }
    }

    const parent: ParentSnapshot = {
      runId: run.id,
      input: (run.input && typeof run.input === 'object' ? run.input : {}) as Record<string, any>,
      state: (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>,
    }
    const childInput = def.buildChildInput(parent, params.provided || {})
    const db = DatabaseManager.getDatabase()
    const linkId = randomUUID()
    const startedAt = new Date().toISOString()

    // Durable row before any side effect; child id is filled in right after creation.
    db.prepare(
      `INSERT INTO workflow_handoff_links
         (id, org_tenant_id, parent_run_id, handoff_key, child_kind, child_id, hold_parent, status, started_by, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
    ).run(linkId, run.tenantId, run.id, def.key, def.childKind, `pending:${linkId}`, def.holdParent ? 1 : 0, params.actedByUserId || null, startedAt)

    let childId: string
    let childStatus: HandoffLinkStatus = 'running'
    let childOutput: Record<string, unknown> | undefined
    try {
      if (def.childKind === 'run') {
        const created = await this.startChildRun(run, def, childInput, params.actedByUserId)
        childId = created.runId
        if (created.status === 'completed') childStatus = 'completed'
        if (created.status === 'failed') childStatus = 'failed'
        childOutput = created.output
      } else {
        childId = this.startChildRequest(run, def, childInput, params.actedByUserId)
      }
    } catch (error: any) {
      db.prepare(`DELETE FROM workflow_handoff_links WHERE id = ?`).run(linkId)
      throw error
    }

    db.prepare(`UPDATE workflow_handoff_links SET child_id = ? WHERE id = ?`).run(childId, linkId)
    this.mirrorToParent(run.id)

    outboxService.enqueue({
      topic: 'workflow.handoff.started',
      aggregateKey: run.id,
      dedupeKey: `workflow.handoff.started:${linkId}`,
      payload: {
        tenantId: run.tenantId,
        parentRunId: run.id,
        handoffKey: def.key,
        childKind: def.childKind,
        childId,
        mode: params.mode,
        actedByUserId: params.actedByUserId,
      },
    })

    logger.info({ parentRunId: run.id, key: def.key, childKind: def.childKind, childId, mode: params.mode }, 'Job handed off to another procedure')

    // A child that finished synchronously (or failed to start) is settled right away.
    if (childStatus !== 'running') this.finishLink(linkId, childStatus, childOutput)

    return this.links(run.id).find((link) => link.id === linkId)!
  }

  private async startChildRun(
    parent: WorkflowRun,
    def: WorkflowHandoffDefinition,
    childInput: Record<string, unknown>,
    actedByUserId?: string,
  ): Promise<{ runId: string; status: string; output?: Record<string, unknown> }> {
    const { workflowReadinessService } = await import('../WorkflowReadinessService')
    const report = workflowReadinessService.evaluateTemplate(parent.tenantId, def.toType)
    if (!report.ready) {
      const missing = report.blocking.map((item) => item.title || item.key).filter(Boolean).slice(0, 3)
      throw new Error(`"${def.label}" needs setup first: ${missing.join(', ') || 'see Organization setup'}.`)
    }
    const workflow = ensureExecutableWorkflow(parent.tenantId, def.toType)
    if (!workflow) throw new Error(`"${def.label}" is not available for this organization yet.`)

    const { workflowService } = await import('../WorkflowService')
    const result = await workflowService.executeWorkflow(
      workflow.id,
      { ...childInput, parentRunId: parent.id, handoffKey: def.key, requesterId: actedByUserId },
      parent.tenantId,
      { triggerType: 'workflow', triggerRef: parent.id, async: false },
    )
    if (!result.runId) throw new Error(result.error || `"${def.label}" could not be started.`)
    return { runId: result.runId, status: result.status, output: result.output }
  }

  private startChildRequest(
    parent: WorkflowRun,
    def: WorkflowHandoffDefinition,
    childInput: Record<string, unknown>,
    actedByUserId?: string,
  ): string {
    const subjectRef = actedByUserId || this.fallbackMember(parent.tenantId)
    if (!subjectRef) throw new Error('No organization member can own this request.')
    const items = Array.isArray(childInput.items) ? (childInput.items as any[]) : undefined
    const created = platformRequestService.create({
      tenantId: parent.tenantId,
      subjectRef,
      requestType: def.toType,
      title: text(childInput.title, def.label),
      description: text(childInput.description) || undefined,
      amount: asNumber(childInput.amount),
      currency: text(childInput.currency) || undefined,
      targetModule: 'procurement',
      context: Object.fromEntries(
        Object.entries((childInput.context as Record<string, unknown>) || {}).filter(([, value]) => value !== undefined),
      ),
      items,
    }) as { id?: string }
    if (!created?.id) throw new Error(`"${def.label}" could not be started.`)
    try {
      platformRequestService.submit(created.id, parent.tenantId, subjectRef)
    } catch (error: any) {
      logger.warn({ error: error?.message, requestId: created.id }, 'Hand-off request stayed in draft')
    }
    return created.id
  }

  private fallbackMember(orgTenantId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT user_id AS userId FROM org_memberships
         WHERE org_tenant_id = ? AND status = 'active' AND role IN ('owner', 'admin')
         ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1`,
      )
      .get(orgTenantId) as { userId?: string } | undefined
    return row?.userId
  }

  /**
   * Called by the engine each time a job pauses. Starts every hand-off the organization set
   * to 'auto' that has just become available. Failures are recorded, never thrown.
   */
  public async autoStartFor(runId: string): Promise<void> {
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.status !== 'paused') return
    const candidates = this.availableFor(run).filter((entry) => entry.startMode === 'auto')
    for (const candidate of candidates) {
      try {
        await this.start({ runId, key: candidate.key, mode: 'auto' })
      } catch (error: any) {
        logger.warn({ runId, key: candidate.key, error: error?.message }, 'Automatic hand-off did not start')
        this.recordAutoStartProblem(runId, candidate.key, error?.message)
      }
    }
  }

  private recordAutoStartProblem(runId: string, key: string, message?: string) {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) return
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const problems = { ...(state.handoffProblems || {}), [key]: { message: message || 'Could not start', at: new Date().toISOString() } }
    workflowRunRepository.updateRun(runId, { output: { ...state, handoffProblems: problems } })
  }

  // ── Finishing ───────────────────────────────────────────────────────────────

  /** Engine hook: a run ended. If it was a hand-off child, settle the link and release the parent. */
  public async onRunFinished(childRunId: string, status: 'completed' | 'failed' | 'cancelled', output?: Record<string, unknown>): Promise<void> {
    const link = this.linkForChild('run', childRunId)
    if (!link) return
    await this.finishLink(link.id, status, output)
  }

  /** Request hook: a platform request reached a final status. */
  public async onRequestStatus(requestId: string, toStatus: string): Promise<void> {
    const link = this.linkForChild('request', requestId)
    if (!link || link.status !== 'running') return
    const status = toStatus === 'approved' || toStatus === 'completed' ? 'completed' : toStatus === 'rejected' || toStatus === 'cancelled' ? 'failed' : undefined
    if (!status) return
    await this.finishLink(link.id, status, { requestStatus: toStatus })
  }

  private linkForChild(kind: HandoffChildKind, childId: string): { id: string; parentRunId: string; status: HandoffLinkStatus } | undefined {
    return DatabaseManager.getDatabase()
      .prepare(`SELECT id, parent_run_id AS parentRunId, status FROM workflow_handoff_links WHERE child_kind = ? AND child_id = ?`)
      .get(kind, childId) as { id: string; parentRunId: string; status: HandoffLinkStatus } | undefined
  }

  private async finishLink(linkId: string, status: HandoffLinkStatus, output?: Record<string, unknown>): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(`SELECT parent_run_id AS parentRunId, handoff_key AS key, status, org_tenant_id AS orgTenantId FROM workflow_handoff_links WHERE id = ?`)
      .get(linkId) as { parentRunId: string; key: string; status: HandoffLinkStatus; orgTenantId: string } | undefined
    if (!row || row.status !== 'running') return

    const result = summarizeResult(output)
    db.prepare(`UPDATE workflow_handoff_links SET status = ?, finished_at = CURRENT_TIMESTAMP, result_json = ? WHERE id = ?`).run(
      status,
      JSON.stringify(result),
      linkId,
    )
    this.mirrorToParent(row.parentRunId)

    outboxService.enqueue({
      topic: 'workflow.handoff.finished',
      aggregateKey: row.parentRunId,
      dedupeKey: `workflow.handoff.finished:${linkId}`,
      payload: { tenantId: row.orgTenantId, parentRunId: row.parentRunId, handoffKey: row.key, status, result },
    })

    // A parent paused *for* this hand-off (template step `workflow.start` with waitForCompletion)
    // continues by itself. A parent paused at a person's step just loses its hold; that person continues.
    const parent = workflowRunRepository.findRunById(row.parentRunId)
    const state = (parent?.output && typeof parent.output === 'object' ? parent.output : {}) as Record<string, any>
    if (parent?.status === 'paused' && String(state.pauseReason || '') === `await_handoff:${row.key}` && this.waitingFor(parent.id).length === 0) {
      try {
        const { workflowService } = await import('../WorkflowService')
        await workflowService.resumeWorkflow(parent.id, { handoffResult: { key: row.key, status, ...result } })
      } catch (error: any) {
        logger.warn({ parentRunId: parent.id, error: error?.message }, 'Parent did not continue after hand-off')
      }
    }
  }

  /** Keep a copy of the links in the parent's state so run views and inbox cards can show them. */
  private mirrorToParent(parentRunId: string) {
    const run = workflowRunRepository.findRunById(parentRunId)
    if (!run) return
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const links = this.links(parentRunId)
    workflowRunRepository.updateRun(parentRunId, {
      output: { ...state, handoffs: links, waitingForHandoffs: links.filter((l) => l.status === 'running' && l.holdParent).map((l) => l.key) },
    })
  }
}

function safeJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Small, plain result written back to the parent (never the whole child state). */
function summarizeResult(output?: Record<string, unknown>): Record<string, unknown> {
  if (!output) return {}
  const out: Record<string, unknown> = {}
  const finance = output.finance as Record<string, unknown> | undefined
  const payment = output.payment as Record<string, unknown> | undefined
  if (finance?.grandTotal !== undefined) out.total = finance.grandTotal
  if (finance?.currency) out.currency = finance.currency
  if (payment?.status) out.paymentStatus = payment.status
  if (payment?.reference) out.paymentReference = payment.reference
  if (output.requestStatus) out.requestStatus = output.requestStatus
  const issued = output.issuedCredentials
  if (issued && typeof issued === 'object') out.records = Object.keys(issued as Record<string, unknown>)
  return out
}

export const workflowHandoffService = new WorkflowHandoffService()

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
 * each organization. Settings only expose: start mode, required stages, on/off, and for a
 * purchase, when the job continues (approved, or bought and received).
 *
 * A purchase is followed down its chain (requisition → purchase order → supplier payment):
 * the job sees each step, and the receipt and supplier bill numbers recorded along the way
 * come back to the job when the chain is done.
 *
 * Durable row first (workflow_handoff_links), then side effects, so a retry never starts
 * the same child twice.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { workflowRepository } from '../../persistence/WorkflowRepository'
import { workflowRunRepository, type WorkflowRun } from '../../persistence/WorkflowRunRepository'
import { outboxService } from '../OutboxService'
import { platformRequestService, type RequestReceipt } from '../PlatformRequestService'
import {
  DEFAULT_REQUEST_HANDOFFS,
  requestHandoffService,
  type HandoffStartMode,
  type RequestHandoffSetting,
} from '../RequestHandoffService'
import { rootLogger } from '../../utils/pinoLogger'

import {
  collectHandoffFacts,
  handoffConditionLabel,
  handoffConditionMet,
  type HandoffConditionId,
} from './HandoffConditions'
import { getWorkflowTypeCandidates, normalizeWorkflowTypeAlias } from './initiation'
import { ensureExecutableWorkflow } from './materialize'

const logger = rootLogger.child({ module: 'WorkflowHandoffService' })

export type HandoffChildKind = 'run' | 'request'
export type HandoffLinkStatus = 'running' | 'completed' | 'failed' | 'cancelled'
/** When a job waiting on a purchase continues. */
export type HandoffContinueOn = 'approved' | 'completed'

export interface HandoffStageOption {
  id: string
  label: string
}

/** A field the person fills in when they start the hand-off by hand. */
export interface HandoffInputField {
  name: string
  label: string
  type: 'text' | 'number' | 'select'
  required?: boolean
  options?: Array<{ value: string; label: string }>
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
  /** Request children only: the organization picks when the job continues. */
  defaultContinueOn?: HandoffContinueOn
  buildChildInput: (parent: ParentSnapshot, provided: Record<string, unknown>) => Record<string, unknown>
}

/** One step of a purchase chain as the job shows it. */
export interface HandoffChainStep {
  requestId: string
  label: string
  status: string
  statusLabel: string
}

export interface HandoffFinanceSummary {
  transactionId: string
  obligationId: string
  currency: string
  originalAmount: number
  balanceDue: number
  settledAmount: number
  matchStatus?: string
}

/**
 * A receipt or supplier bill recorded while the purchase was carried out: its number, the
 * photo taken of it (or the wallet record that stood in), and its fingerprint.
 */
export interface HandoffReceipt extends RequestReceipt {
  step: string
  currency?: string
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
  /** Purchases only: when the job continues, and the choices. */
  continueOn?: HandoffContinueOn
  continueOnOptions?: HandoffStageOption[]
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
  /** Purchases: where each step of the chain is now. */
  steps?: HandoffChainStep[]
  /** The purchase and its payable remain distinct from the request-chain statuses. */
  finance?: HandoffFinanceSummary
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
  billing?: {
    transactionId: string
    originalAmount: number
    balanceDue: number
    settledAmount: number
    currency: string
    nextDueDate?: string
    paymentLinkId?: string
  }
}

interface ParentSnapshot {
  runId: string
  input: Record<string, any>
  state: Record<string, any>
}

const FIELD_JOB_STAGES: HandoffStageOption[] = [
  { id: 'await_worker_start', label: 'Worker started' },
  { id: 'await_arrival', label: 'Worker arrived' },
  { id: 'await_site_inspection', label: 'Site inspection done' },
  { id: 'await_risk_assessment', label: 'Risk check done' },
  { id: 'await_evidence_before', label: 'Before photos taken' },
  { id: 'await_evidence_concealed', label: 'Concealed-work photo taken' },
  { id: 'await_evidence_after', label: 'After photos taken' },
  { id: 'await_evidence_receipt', label: 'Receipts captured' },
  { id: 'await_completion_review', label: 'Work reviewed' },
  { id: 'await_acknowledgement', label: 'Signed off' },
  { id: 'await_payout_release', label: 'Payment released' },
]

const PURCHASE_CONTINUE_OPTIONS: HandoffStageOption[] = [
  { id: 'completed', label: 'When it is bought and the receipt is in' },
  { id: 'approved', label: 'As soon as it is approved' },
]

const REQUEST_STATUS_LABELS: Record<string, string> = {
  draft: 'Not sent yet',
  submitted: 'Waiting for approval',
  in_review: 'Waiting for approval',
  approved: 'Approved',
  in_fulfilment: 'Being bought',
  completed: 'Done',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

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
  return (
    TYPE_LABELS[type] ||
    TYPE_LABELS[normalizeWorkflowTypeAlias(type)] ||
    type.replace(/^tpl-/, '').replace(/[._-]/g, ' ')
  )
}

export type FamilyStatusLabel = 'Done' | 'Waiting' | 'Next' | 'Declined'

export interface FamilyMember {
  kind: 'job' | 'request'
  id?: string
  label: string
  reference?: string
  title?: string
  status: string
  statusLabel: FamilyStatusLabel
  current?: boolean
}

/** One family, same words on the website and the phone. */
export interface WorkFamily {
  root?: FamilyMember
  parent?: FamilyMember
  chain: FamilyMember[]
  partOfLine: string
  fromLabel: string
  holdLine?: string
  inboxLine: string
}

function familyRequestLabel(type: string): string {
  const key = type.toLowerCase()
  if (key.includes('requisition')) return 'Purchase request'
  if (key.includes('purchase_order')) return 'Purchase order'
  if (key.includes('payment')) return 'Supplier payment'
  return handoffTypeLabel(type)
}

function familyStatusLabel(status: string): FamilyStatusLabel {
  const key = status.toLowerCase()
  if (key === 'completed' || key === 'paid') return 'Done'
  if (key === 'rejected' || key === 'cancelled' || key === 'declined') return 'Declined'
  return 'Waiting'
}

function familyHoldLine(linkStatus: string | undefined, requestType: string): string | undefined {
  if (!linkStatus) return undefined
  if (linkStatus === 'completed') return 'The job continues.'
  if (linkStatus === 'cancelled' || linkStatus === 'failed') return undefined
  const type = requestType.toLowerCase()
  if (type.includes('payment')) return 'The job continues when this is paid.'
  if (type.includes('purchase_order')) return 'The job continues when this is delivered.'
  if (linkStatus === 'running') return 'The job waits for this purchase.'
  return 'The job continues when this is bought and the receipt is in.'
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
    description:
      'Send the client a quote for extra work found on site. The job waits until the quote is paid or declined, then continues.',
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
      const items =
        Array.isArray(provided.items) && provided.items.length > 0
          ? provided.items
          : [{ description, quantity, unitPrice }]
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
    description:
      'Raise a purchase request for parts or materials the job needs. Bought with cash, it is approved, then marked bought with its receipt. Bought from a supplier, it goes on to a purchase order, the supplier bill and the supplier payment. The job waits and gets the receipts back.',
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
      { name: 'supplier', label: 'Supplier (leave empty when paying cash)', type: 'text' },
      {
        name: 'purchaseKind',
        label: 'What are you buying?',
        type: 'select',
        required: true,
        options: [
          { value: 'goods', label: 'Goods or materials' },
          { value: 'service', label: 'A service' },
        ],
      },
      {
        name: 'receivingRequired',
        label: 'Confirm delivery or service before payment?',
        type: 'select',
        required: true,
        options: [
          { value: 'yes', label: 'Yes, confirmation is required' },
          { value: 'no', label: 'No separate confirmation' },
        ],
      },
    ],
    repeatable: true,
    defaultContinueOn: 'completed',
    buildChildInput: (parent, provided) => ({
      title: `Materials for ${text(parent.input.reference, text(parent.input.description, 'field job'))}`.slice(0, 180),
      description: text(provided.description, 'Materials needed on site'),
      amount: asNumber(provided.amount),
      currency: text(parent.input.currency, 'USD'),
      items: [
        { description: text(provided.description, 'Materials'), quantity: 1, unitPrice: asNumber(provided.amount) },
      ],
      context: {
        categoryCode: 'materials',
        supplierRef: text(provided.supplier) || undefined,
        paymentMethod: text(provided.supplier) ? 'supplier' : 'cash',
        itemType: text(provided.purchaseKind),
        receivingRequired: text(provided.receivingRequired) === 'yes',
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
          `SELECT handoff_key AS key, start_mode AS startMode, required_stages AS requiredStages, enabled,
                  continue_on AS continueOn
           FROM org_workflow_handoffs WHERE org_tenant_id = ?`,
        )
        .all(orgTenantId) as Array<{
        key: string
        startMode?: string
        requiredStages?: string | null
        enabled?: number
        continueOn?: string | null
      }>
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
          if (Array.isArray(parsed))
            requiredStages = parsed.map(String).filter((id) => def.stageOptions.some((o) => o.id === id))
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
        ...(def.defaultContinueOn
          ? {
              continueOn:
                row?.continueOn === 'approved' || row?.continueOn === 'completed'
                  ? row.continueOn
                  : def.defaultContinueOn,
              continueOnOptions: PURCHASE_CONTINUE_OPTIONS,
            }
          : {}),
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
    const statusLabel =
      rule.onStatus === 'completed'
        ? rule.fromType === 'finance.purchase_order'
          ? 'Delivered'
          : 'Done'
        : rule.onStatus === 'approved'
          ? 'Approved'
          : rule.onStatus
    const startsWhen = `Starts when the ${handoffTypeLabel(rule.fromType).toLowerCase()} is ${statusLabel.toLowerCase()}`
    const conditionLabel =
      rule.conditionLabel === handoffConditionLabel(undefined) ? startsWhen : `${startsWhen}. ${rule.conditionLabel}`
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
      conditionLabel,
    }
  }

  public settingsFor(orgTenantId: string): WorkflowHandoffSetting[] {
    return [...this.jobSettingsFor(orgTenantId), ...this.requestSettingsFor(orgTenantId)]
  }

  /** Save one hand-off choice. Unknown keys and unknown stage ids are rejected. */
  public saveSetting(
    orgTenantId: string,
    key: string,
    patch: {
      startMode?: HandoffStartMode
      requiredStages?: string[]
      enabled?: boolean
      continueOn?: HandoffContinueOn
    },
  ): WorkflowHandoffSetting {
    if (patch.startMode && patch.startMode !== 'auto' && patch.startMode !== 'manual') {
      throw new Error("startMode must be 'auto' or 'manual'")
    }
    if (patch.continueOn && patch.continueOn !== 'approved' && patch.continueOn !== 'completed') {
      throw new Error("continueOn must be 'approved' or 'completed'")
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
    const continueOn = def.defaultContinueOn ? (patch.continueOn ?? current.continueOn ?? def.defaultContinueOn) : null
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO org_workflow_handoffs (id, org_tenant_id, handoff_key, start_mode, required_stages, enabled, continue_on)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_tenant_id, handoff_key) DO UPDATE SET
           start_mode = excluded.start_mode, required_stages = excluded.required_stages,
           enabled = excluded.enabled, continue_on = excluded.continue_on, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(randomUUID(), orgTenantId, key, startMode, JSON.stringify(requiredStages), enabled ? 1 : 0, continueOn)
    return this.jobSettingsFor(orgTenantId).find((entry) => entry.key === key)!
  }

  // ── Per-run view ────────────────────────────────────────────────────────────

  private runWorkflowType(run: WorkflowRun): string[] {
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const explicit = String(state.workflowType || run.input?.workflowType || '').trim()
    // The materialized workflow row keeps the type in `category` (see materialize.ts), which is
    // the only reliable source for org ids such as `tpl-fept-field-execution-<orgTenantId>`.
    const category = String(workflowRepository.findById(run.workflowId)?.category || '').trim()
    const candidates = new Set<string>()
    for (const raw of [explicit, category, run.workflowId]) {
      if (!raw) continue
      for (const candidate of getWorkflowTypeCandidates(raw)) candidates.add(candidate)
      // Org-specific materialized ids look like `<type>-<orgTenantId>-<ts>-<n>` or
      // `<builtin template id>-<orgTenantId>`.
      const base = raw.split('-')[0]
      if (base) for (const candidate of getWorkflowTypeCandidates(base)) candidates.add(candidate)
      const prefixed = raw.match(/^([a-z_]+)-[0-9a-f]{8}-/i)?.[1]
      if (prefixed) for (const candidate of getWorkflowTypeCandidates(prefixed)) candidates.add(candidate)
      const withoutOrg = raw.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-.*)?$/i, '')
      if (withoutOrg && withoutOrg !== raw)
        for (const candidate of getWorkflowTypeCandidates(withoutOrg)) candidates.add(candidate)
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
      steps:
        row.childKind === 'request' && !String(row.childId).startsWith('pending:')
          ? this.chainSteps(row.childId)
          : undefined,
      finance:
        row.childKind === 'request' && !String(row.childId).startsWith('pending:')
          ? this.financeForRequest(row.childId)
          : undefined,
    }))
  }

  // ── Purchase chains ─────────────────────────────────────────────────────────

  /** The request and every follow-on it started (purchase order, supplier payment), oldest first. */
  private chain(rootRequestId: string): Array<{ id: string; requestType: string; status: string; currency?: string }> {
    return DatabaseManager.getDatabase()
      .prepare(
        `WITH RECURSIVE chain(id, depth) AS (
           SELECT id, 0 FROM requests WHERE id = ?
           UNION ALL
           SELECT r.id, chain.depth + 1 FROM requests r JOIN chain ON r.parent_request_id = chain.id WHERE chain.depth < 6
         )
         SELECT r.id, r.request_type AS requestType, r.status, r.currency
         FROM chain JOIN requests r ON r.id = chain.id
         ORDER BY chain.depth ASC, r.created_at ASC`,
      )
      .all(rootRequestId) as Array<{ id: string; requestType: string; status: string; currency?: string }>
  }

  private chainSteps(rootRequestId: string): HandoffChainStep[] {
    return this.chain(rootRequestId).map((row) => ({
      requestId: row.id,
      label: familyRequestLabel(row.requestType),
      status: row.status,
      statusLabel: REQUEST_STATUS_LABELS[row.status] || row.status,
    }))
  }

  private financeForRequest(requestId: string): HandoffFinanceSummary | undefined {
    try {
      const { accountsPayableLedgerService } =
        require('../AccountsPayableLedgerService') as typeof import('../AccountsPayableLedgerService')
      const bill = accountsPayableLedgerService.ledgerForRequest(requestId)
      if (!bill?.transactionId || !bill.obligationId) return undefined
      return {
        transactionId: bill.transactionId,
        obligationId: bill.obligationId,
        currency: bill.currency,
        originalAmount: bill.amount,
        balanceDue: bill.balanceDue,
        settledAmount: Number(bill.settledAmount || 0),
        matchStatus: bill.matchStatus,
      }
    } catch {
      return undefined
    }
  }

  /** Receipts, supplier bills and their photos recorded when each step of the chain was finished. */
  private chainReceipts(rootRequestId: string): HandoffReceipt[] {
    const receipts: HandoffReceipt[] = []
    for (const row of this.chain(rootRequestId)) {
      const receipt = platformRequestService.completionReceipt(row.id)
      if (!receipt) continue
      receipts.push({ step: handoffTypeLabel(row.requestType), currency: row.currency || undefined, ...receipt })
    }
    return receipts
  }

  /**
   * Where a request sits in its family: the job that raised it, or the request it follows,
   * then each step of the chain. Stand-alone requests have no family.
   * One shape for the request list, the request page, and the inbox card.
   */
  public familyOf(requestId: string): WorkFamily | undefined {
    const id = String(requestId || '').trim()
    if (!id) return undefined
    const rootId = this.requestAncestor(id)
    const rows = this.chain(rootId)
    if (rows.length === 0) return undefined
    const link = this.linkForChild('request', rootId)
    if (!link && rows.length < 2) return undefined

    const run = link ? workflowRunRepository.findRunById(link.parentRunId) : undefined
    const input = (run?.input && typeof run.input === 'object' ? run.input : {}) as Record<string, unknown>
    const reference = text(input.reference)
    const jobTitle = text(input.description)
    const job: FamilyMember | undefined = link
      ? {
          kind: 'job',
          id: link.parentRunId,
          label: reference ? `Job ${reference}` : 'Job',
          reference: reference || undefined,
          title: jobTitle || undefined,
          status: String(run?.status || link.status),
          statusLabel: run?.status === 'completed' ? 'Done' : 'Waiting',
        }
      : undefined

    const chain: FamilyMember[] = []
    if (job) chain.push(job)
    for (const row of rows) {
      chain.push({
        kind: 'request',
        id: row.id,
        label: familyRequestLabel(row.requestType),
        status: row.status,
        statusLabel: familyStatusLabel(row.status),
        current: row.id === id,
      })
    }
    const rootRow = rows[0]
    const context = this.requestContext(rootId)
    const successor = this.nextFamilyLabel(rows, context)
    if (successor) chain.push({ kind: 'request', label: successor, status: 'next', statusLabel: 'Next' })

    const currentIndex = chain.findIndex((member) => member.current)
    const parent = currentIndex > 0 ? chain[currentIndex - 1] : job
    const fromLabel = !job
      ? parent?.label === 'Purchase order'
        ? 'From a purchase order'
        : 'From a purchase request'
      : parent?.kind === 'request'
        ? parent.label === 'Purchase order'
          ? 'From a purchase order'
          : 'From a purchase request'
        : 'From a job'
    const partOfLine = job
      ? `Part of job ${reference || job.label.replace(/^Job /, '')}${jobTitle ? ` · ${jobTitle}` : ''}`
          .replace(/\s+/g, ' ')
          .trim()
      : `Part of ${parent?.label || 'a request'}`
    const currentType = rows.find((row) => row.id === id)?.requestType || rootRow.requestType
    const holdLine = familyHoldLine(link?.status, currentType)
    const inboxLine = [partOfLine, holdLine].filter(Boolean).join('. ')
    return {
      root: job || chain[0],
      parent,
      chain,
      partOfLine,
      fromLabel,
      holdLine,
      inboxLine,
    }
  }

  /** Top of a request chain (the request a job raised, or the first request). */
  private requestAncestor(requestId: string): string {
    const db = DatabaseManager.getDatabase()
    let current = requestId
    for (let depth = 0; depth < 7; depth += 1) {
      const row = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(current) as
        | { parentId?: string | null }
        | undefined
      if (!row?.parentId) return current
      current = row.parentId
    }
    return current
  }

  private requestContext(requestId: string): Record<string, unknown> {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT context_json AS contextJson FROM requests WHERE id = ?`)
      .get(requestId) as { contextJson?: string } | undefined
    return safeJson(String(row?.contextJson || '')) || {}
  }

  /** The step that follows the last one that exists, when the chain says there is one. */
  private nextFamilyLabel(
    rows: Array<{ requestType: string; status: string }>,
    context: Record<string, unknown>,
  ): string | undefined {
    const have = new Set(rows.map((row) => row.requestType))
    const last = rows[rows.length - 1]
    if (!last || last.status === 'rejected' || last.status === 'cancelled') return undefined
    const rule = DEFAULT_REQUEST_HANDOFFS.find(
      (entry) => entry.fromType === last.requestType && !have.has(entry.toType),
    )
    if (!rule) return undefined
    if (rule.when === 'needs_supplier_purchase' && !text(context.supplierRef)) return undefined
    return rule.title
  }

  /** Walk up from a follow-on to the request a job raised. */
  private linkedRoot(requestId: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    let current: string | undefined = requestId
    for (let depth = 0; current && depth < 7; depth += 1) {
      if (this.linkForChild('request', current)) return current
      const row = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(current) as
        | { parentId?: string | null }
        | undefined
      current = row?.parentId || undefined
    }
    return undefined
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
      context: {
        ...((run.input as Record<string, unknown>) || {}),
        ...((run.output as Record<string, unknown>) || {}),
      },
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
      billing: this.billingForRun(run.id),
    }
  }

  private billingForRun(runId: string): RunHandoffsView['billing'] {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT t.id AS transactionId,
                COALESCE(SUM(o.original_amount), 0) AS originalAmount,
                COALESCE(SUM(o.balance_due), 0) AS balanceDue,
                COALESCE(SUM(o.original_amount - o.balance_due), 0) AS settledAmount,
                MAX(o.currency) AS currency,
                MIN(CASE WHEN o.status IN ('open', 'partially_settled') THEN o.due_date END) AS nextDueDate,
                MIN(CASE WHEN p.status = 'active' THEN p.id END) AS paymentLinkId
           FROM business_transactions t
           JOIN financial_obligations o ON o.business_transaction_id = t.id AND o.direction = 'receivable'
           LEFT JOIN payment_links p ON p.obligation_id = o.id
          WHERE t.source_type = 'workflow_run' AND t.source_id = ?
            AND o.status != 'cancelled'
          GROUP BY t.id`,
      )
      .get(runId) as any
    if (!row) return undefined
    return {
      transactionId: row.transactionId,
      originalAmount: Number(row.originalAmount || 0),
      balanceDue: Number(row.balanceDue || 0),
      settledAmount: Number(row.settledAmount || 0),
      currency: row.currency || 'USD',
      nextDueDate: row.nextDueDate || undefined,
      paymentLinkId: row.paymentLinkId || undefined,
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
        throw new Error(
          `"${def.label}" is available after: ${missing.map((id) => stageLabel(def.stageOptions, id)).join(', ')}.`,
        )
      }
      throw new Error(`"${def.label}" cannot be started from this job right now.`)
    }
    // Start-mode settings carry no purchase answers; auto mode must not invent them.
    if (params.mode === 'manual' || def.key === 'field_buy_materials') {
      const missingFields = def.fields.filter((field) => field.required && text(params.provided?.[field.name]) === '')
      if (missingFields.length > 0) {
        throw new Error(
          `"${def.label}" needs input: ${missingFields.map((field) => field.label).join('; ')}. Start it manually and supply these answers.`,
        )
      }
      for (const field of def.fields) {
        const value = text(params.provided?.[field.name])
        if (value && field.options && !field.options.some((option) => option.value === value)) {
          throw new Error(`${field.label}: choose ${field.options.map((option) => option.label).join(' or ')}.`)
        }
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
    ).run(
      linkId,
      run.tenantId,
      run.id,
      def.key,
      def.childKind,
      `pending:${linkId}`,
      def.holdParent ? 1 : 0,
      params.actedByUserId || null,
      startedAt,
    )

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

    logger.info(
      { parentRunId: run.id, key: def.key, childKind: def.childKind, childId, mode: params.mode },
      'Job handed off to another procedure',
    )

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
      const missing = report.blocking
        .map((item) => item.title || item.key)
        .filter(Boolean)
        .slice(0, 3)
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
        Object.entries((childInput.context as Record<string, unknown>) || {}).filter(
          ([, value]) => value !== undefined,
        ),
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
    const problems = {
      ...(state.handoffProblems || {}),
      [key]: { message: message || 'Could not start', at: new Date().toISOString() },
    }
    workflowRunRepository.updateRun(runId, { output: { ...state, handoffProblems: problems } })
  }

  // ── Finishing ───────────────────────────────────────────────────────────────

  /** Engine hook: a run ended. If it was a hand-off child, settle the link and release the parent. */
  public async onRunFinished(
    childRunId: string,
    status: 'completed' | 'failed' | 'cancelled',
    output?: Record<string, unknown>,
  ): Promise<void> {
    const link = this.linkForChild('run', childRunId)
    if (!link) return
    await this.finishLink(link.id, status, output)
  }

  /**
   * Request hook: a request a job raised, or one of its follow-ons, changed status.
   * A decline anywhere in the chain ends the hand-off. Otherwise the organization's choice
   * decides: continue once the purchase is approved, or once every step is done.
   */
  public async onRequestStatus(requestId: string, toStatus: string): Promise<void> {
    const rootId = this.linkedRoot(requestId)
    if (!rootId) return
    const link = this.linkForChild('request', rootId)
    if (!link || link.status !== 'running') {
      if (link) this.mirrorToParent(link.parentRunId)
      return
    }
    const chain = this.chain(rootId)
    const root = chain[0]
    if (!root) return
    const declined = chain.find((row) => row.status === 'rejected' || row.status === 'cancelled')
    const continueOn =
      this.jobSettingsFor(link.orgTenantId).find((setting) => setting.key === link.key)?.continueOn ||
      WORKFLOW_HANDOFF_CATALOG.find((def) => def.key === link.key)?.defaultContinueOn ||
      'approved'
    let status: HandoffLinkStatus | undefined
    if (declined) status = 'failed'
    else if (continueOn === 'approved' && ['approved', 'in_fulfilment', 'completed'].includes(root.status))
      status = 'completed'
    else if (continueOn === 'completed' && chain.every((row) => row.status === 'completed')) status = 'completed'
    if (!status) {
      this.mirrorToParent(link.parentRunId)
      return
    }
    await this.finishLink(link.id, status, {
      requestStatus: declined ? declined.status : toStatus,
      steps: this.chainSteps(rootId),
      receipts: this.chainReceipts(rootId),
    })
  }

  private linkForChild(
    kind: HandoffChildKind,
    childId: string,
  ): { id: string; parentRunId: string; status: HandoffLinkStatus; key: string; orgTenantId: string } | undefined {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, parent_run_id AS parentRunId, status, handoff_key AS key, org_tenant_id AS orgTenantId
         FROM workflow_handoff_links WHERE child_kind = ? AND child_id = ?`,
      )
      .get(kind, childId) as
      | { id: string; parentRunId: string; status: HandoffLinkStatus; key: string; orgTenantId: string }
      | undefined
  }

  /** Purchase receipts from finished hand-offs, for the job's receipts step. */
  public purchaseReceipts(parentRunId: string): HandoffReceipt[] {
    return this.links(parentRunId)
      .filter((link) => link.status === 'completed' && Array.isArray(link.result?.receipts))
      .flatMap((link) => link.result!.receipts as HandoffReceipt[])
  }

  private async finishLink(linkId: string, status: HandoffLinkStatus, output?: Record<string, unknown>): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT parent_run_id AS parentRunId, handoff_key AS key, status, org_tenant_id AS orgTenantId FROM workflow_handoff_links WHERE id = ?`,
      )
      .get(linkId) as { parentRunId: string; key: string; status: HandoffLinkStatus; orgTenantId: string } | undefined
    if (!row || row.status !== 'running') return

    const result = summarizeResult(output)
    db.prepare(
      `UPDATE workflow_handoff_links SET status = ?, finished_at = CURRENT_TIMESTAMP, result_json = ? WHERE id = ?`,
    ).run(status, JSON.stringify(result), linkId)
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
    if (
      parent?.status === 'paused' &&
      String(state.pauseReason || '') === `await_handoff:${row.key}` &&
      this.waitingFor(parent.id).length === 0
    ) {
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
      output: {
        ...state,
        handoffs: links,
        waitingForHandoffs: links.filter((l) => l.status === 'running' && l.holdParent).map((l) => l.key),
      },
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
  if (Array.isArray(output.steps)) out.steps = output.steps
  if (Array.isArray(output.receipts)) out.receipts = output.receipts
  const issued = output.issuedCredentials
  if (issued && typeof issued === 'object') out.records = Object.keys(issued as Record<string, unknown>)
  return out
}

export const workflowHandoffService = new WorkflowHandoffService()

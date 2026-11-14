/**
 * What each kind of request does in this organisation, as one flow: who decides it, in order,
 * and what starts after it is decided.
 *
 * - Approval steps are the `stage.await_actor` steps of the request's flow template. The
 *   organisation changes them by saving its own copy of the template (the built-in one stays).
 * - "Then" steps are the request hand-offs (purchase order, payment, …). They keep their own
 *   settings (Settings → What happens next); this view only lists them under their request.
 *
 * Only member requests whose work area is switched on are listed.
 */
import type { WorkflowTemplateDefinition } from '../types/WorkflowTemplate'

import { MEMBER_REQUEST_FLOWS, requestFlowFor, type RequestFlowDefinition } from '../config/requestFlows'
import { StatusException } from '../errors'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'

import { orgSetupProfileService } from './OrgSetupProfileService'
import { platformRequestService } from './PlatformRequestService'
import { workflowHandoffService } from './workflow/WorkflowHandoffService'
import { findOrgTemplate } from './workflow/materialize'
import { getTemplateById } from './workflow/templates'

/** The approvals an organisation can put on a request. Each names who acts in Who does what. */
export type RequestFlowStepKind = 'review' | 'finance'

export interface RequestFlowStepView {
  kind: RequestFlowStepKind | 'custom'
  stageAction: string
  workflowType: string
  title: string
  /** The step only applies from this amount up. */
  amountAtLeast?: number
  /** The organisation chose: only a staff-card share from the wallet decides this step. */
  staffCardNeeded: boolean
  /**
   * What the step asks for when it is not marked: `required` (setting says always), `offered`
   * (money approvals: offered, and needed above the organisation's amount), `sign_in` (no card).
   */
  staffCardDefault: 'required' | 'offered' | 'sign_in'
}

export interface RequestFlowThenView {
  /** Key for `PUT /api/organizations/{org}/workflows/handoffs/{key}`. */
  key: string
  label: string
  startMode: 'auto' | 'manual'
  enabled: boolean
  conditionLabel: string
}

export interface RequestFlowView {
  requestType: string
  label: string
  templateId: string
  steps: RequestFlowStepView[]
  /** The organisation saved its own steps; otherwise the built-in single approval applies. */
  customised: boolean
  then: RequestFlowThenView[]
}

export interface RequestFlowStepInput {
  kind: RequestFlowStepKind
  amountAtLeast?: number
  /** Only a staff-card share from the wallet decides this step. */
  staffCardNeeded?: boolean
}

const MAX_STEPS = 3

/**
 * Finance decides under the request's own flow type, so a person set for this flow wins;
 * otherwise the finance main person, then the purchase-request finance people.
 */
const FINANCE_STEP = {
  stageAction: 'finance_approve_requisition',
  workflowType: 'internal_requisitions',
  title: 'Finance approval',
}

const templates = new WorkflowTemplateRepository()

function flowAvailable(orgTenantId: string, flow: RequestFlowDefinition): boolean {
  if (!flow.templateId) return false
  if (!flow.module) return true
  try {
    orgSetupProfileService.assertModule(orgTenantId, flow.module)
    return true
  } catch {
    return false
  }
}

function positiveAmount(value: unknown): number | undefined {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

export class RequestFlowSettingsService {
  public list(orgTenantId: string): RequestFlowView[] {
    const handoffs = workflowHandoffService.requestSettingsFor(orgTenantId)
    return MEMBER_REQUEST_FLOWS.filter((flow) => flowAvailable(orgTenantId, flow)).map((flow) =>
      this.view(orgTenantId, flow, handoffs),
    )
  }

  public get(orgTenantId: string, requestType: string): RequestFlowView {
    const flow = this.editableFlow(orgTenantId, requestType)
    const handoffs = workflowHandoffService.requestSettingsFor(orgTenantId)
    return this.view(orgTenantId, flow, handoffs)
  }

  /**
   * Replace the approval steps of one kind of request. The first step is always the request's
   * own reviewer and always applies; finance can follow, optionally only from an amount up.
   */
  public saveSteps(orgTenantId: string, requestType: string, steps: RequestFlowStepInput[]): RequestFlowView {
    const flow = this.editableFlow(orgTenantId, requestType)
    if (!Array.isArray(steps) || steps.length === 0) throw new StatusException('Keep at least one approval.', 400)
    if (steps.length > MAX_STEPS) throw new StatusException(`At most ${MAX_STEPS} approvals.`, 400)
    const kinds = steps.map((step) => step?.kind)
    if (kinds.some((kind) => kind !== 'review' && kind !== 'finance')) {
      throw new StatusException('Each approval is the usual approver or finance.', 400)
    }
    if (new Set(kinds).size !== kinds.length) throw new StatusException('The same approval is listed twice.', 400)
    if (kinds[0] !== 'review') throw new StatusException('The usual approver decides first.', 400)
    if (steps[0].amountAtLeast !== undefined && steps[0].amountAtLeast !== null) {
      throw new StatusException('The first approval always applies; only later ones can start from an amount.', 400)
    }
    for (const step of steps) {
      if (step.amountAtLeast !== undefined && step.amountAtLeast !== null && !positiveAmount(step.amountAtLeast)) {
        throw new StatusException('An amount must be more than 0.', 400)
      }
    }

    const builtIn = getTemplateById(flow.templateId!)
    if (!builtIn) throw new StatusException('This request has no flow to change.', 404)
    const review = platformRequestService.configuredStagesFor(orgTenantId, requestType).stages[0]
    const builtInReview = builtIn.steps.find((step) => step.action === 'stage.await_actor')
    const reviewTitle = String(builtInReview?.config?.title || builtInReview?.description || 'Approval')

    const decisionSteps = steps.map((step) => {
      const amountAtLeast = positiveAmount(step.amountAtLeast)
      const base =
        step.kind === 'finance'
          ? { ...FINANCE_STEP, workflowType: review.workflowType }
          : { stageAction: review.stageAction, workflowType: review.workflowType, title: reviewTitle }
      return {
        action: 'stage.await_actor',
        description: amountAtLeast ? `${base.title} from ${amountAtLeast}` : base.title,
        config: {
          stageAction: base.stageAction,
          workflowType: base.workflowType,
          requestType: flow.requestType,
          requestDecision: true,
          title: base.title,
          ...(step.staffCardNeeded === true ? { requireProof: true } : {}),
          ...(amountAtLeast ? { when: { amountAtLeast } } : {}),
        },
      }
    })

    const existing = findOrgTemplate(orgTenantId, flow.templateId!)
    // Steps that are not approvals (none in the built-in flows today) stay where they were.
    const otherSteps = (existing?.steps || []).filter(
      (step) => !(step.action === 'stage.await_actor' && (step.config as any)?.requestDecision),
    )
    const record: WorkflowTemplateDefinition = {
      ...(existing || {}),
      id: existing?.id || `${flow.templateId}-own-${orgTenantId}`,
      tenantId: orgTenantId,
      workflowType: flow.templateId!,
      name: existing?.name || builtIn.name,
      sector: (existing?.sector || 'custom') as WorkflowTemplateDefinition['sector'],
      enabled: true,
      version: (existing?.version || 0) + 1,
      steps: [...decisionSteps, ...otherSteps] as WorkflowTemplateDefinition['steps'],
      paymentModes: existing?.paymentModes || [],
      credentialPolicy: existing?.credentialPolicy || { outputVCs: [], autoIssue: false },
      reconciliationPolicy: existing?.reconciliationPolicy || { mode: 'manual_close', events: [] },
      evidencePolicy: existing?.evidencePolicy || {},
      brandingPolicy: existing?.brandingPolicy || {},
    } as WorkflowTemplateDefinition
    templates.save(record)
    return this.get(orgTenantId, requestType)
  }

  private editableFlow(orgTenantId: string, requestType: string): RequestFlowDefinition {
    const flow = requestFlowFor(requestType)
    if (!flow || flow.audience !== 'members' || !flow.templateId) {
      throw new StatusException('This kind of request has no approval steps to change.', 404)
    }
    if (!flowAvailable(orgTenantId, flow)) {
      throw new StatusException(`${flow.label} is not switched on for this organisation.`, 403)
    }
    return flow
  }

  private view(
    orgTenantId: string,
    flow: RequestFlowDefinition,
    handoffs: ReturnType<typeof workflowHandoffService.requestSettingsFor>,
  ): RequestFlowView {
    const { stages, own } = platformRequestService.configuredStagesFor(orgTenantId, flow.requestType)
    const builtIn = getTemplateById(flow.templateId!)
    const builtInReview = builtIn?.steps.find((step) => step.action === 'stage.await_actor')
    const reviewTitle = String(builtInReview?.config?.title || 'Approval')
    const defaultMode = platformRequestService.defaultApprovalCardMode(orgTenantId, flow.requestType)
    const staffCardDefault: RequestFlowStepView['staffCardDefault'] =
      defaultMode === 'card_required' ? 'required' : defaultMode === 'card_optional' ? 'offered' : 'sign_in'
    const steps: RequestFlowStepView[] = stages.map((stage, index) => {
      const finance = index > 0 && stage.stageAction === FINANCE_STEP.stageAction
      const kind: RequestFlowStepView['kind'] = index === 0 ? 'review' : finance ? 'finance' : 'custom'
      return {
        kind,
        stageAction: stage.stageAction,
        workflowType: stage.workflowType,
        title: stage.title || (kind === 'review' ? reviewTitle : finance ? FINANCE_STEP.title : stage.stageAction),
        ...(positiveAmount(stage.when?.amountAtLeast) ? { amountAtLeast: positiveAmount(stage.when?.amountAtLeast) } : {}),
        staffCardNeeded: stage.requireProof === true,
        staffCardDefault,
      }
    })
    const customised =
      own && (steps.length > 1 || steps.some((step) => step.amountAtLeast || step.staffCardNeeded))
    return {
      requestType: flow.requestType,
      label: flow.label,
      templateId: flow.templateId!,
      steps,
      customised,
      then: handoffs
        .filter((entry) => entry.from === flow.requestType)
        .map((entry) => ({
          key: entry.key,
          label: entry.label || entry.toLabel,
          startMode: entry.startMode,
          enabled: entry.enabled,
          conditionLabel: entry.conditionLabel,
        })),
    }
  }
}

export const requestFlowSettingsService = new RequestFlowSettingsService()

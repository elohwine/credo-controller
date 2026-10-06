/**
 * Workflow prerequisite registry.
 *
 * Every workflow template declares which organizational configuration it needs
 * before it is operational: people, roles, approval authority, departments,
 * trust anchors, payment providers, and per-stage actors.
 *
 * This replaces feature / workflow activation. A workflow is usable when its
 * prerequisites are satisfied for the organization, not when an `enabled` flag
 * is set. The Setup Center readiness API, the execution gate and the
 * `workflow.start` action all read from this single declaration.
 *
 * Declarations are data-only so they can be persisted with a tenant template and
 * overridden per organization.
 */

import type {
  WorkflowPrerequisite,
  WorkflowPrerequisiteCondition,
  WorkflowTemplateDefinition,
} from '../../types/WorkflowTemplate'

/** Prerequisites every organization needs regardless of workflow. */
export const CORE_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'organization_profile', requirement: 'mandatory', title: 'Organization profile exists' },
  { key: 'primary_admin', requirement: 'mandatory', title: 'Primary administrator assigned' },
  { key: 'active_members', requirement: 'mandatory', title: 'At least one active member' },
  { key: 'ssi_identity', requirement: 'mandatory', title: 'Issuer and verifier identities provisioned' },
  { key: 'roles', requirement: 'mandatory', title: 'At least one organization role' },
]

/** Recommended items surfaced for every organization but never blocking. */
export const RECOMMENDED_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'delegations', requirement: 'recommended', title: 'Delegation readiness' },
  { key: 'people_records', requirement: 'recommended', title: 'Organization member records mapped to people' },
]

const PAYOUT_CONFIGURED: WorkflowPrerequisiteCondition = { field: 'paymentModes', nonEmpty: true }

function stageActor(
  stageAction: string,
  title: string,
  requirement: WorkflowPrerequisite['requirement'] = 'conditional',
  when?: WorkflowPrerequisiteCondition,
): WorkflowPrerequisite {
  return { key: 'stage_actor', stageAction, requirement, title, when }
}

const FEPT_PREREQUISITES: WorkflowPrerequisite[] = [
  stageActor('assign_field_worker', 'Who goes out on jobs'),
  stageActor('inspect_site', 'Inspector who clears the site before work starts (defaults to the field worker)', 'recommended'),
  stageActor('review_completion', 'Supervisor who reviews finished work before customer sign-off', 'recommended'),
  stageActor('acknowledge_execution', 'Customer sign-off', 'recommended'),
  stageActor('trigger_payout', 'Who releases job payments', 'conditional', PAYOUT_CONFIGURED),
  {
    key: 'payment_provider',
    requirement: 'conditional',
    title: 'Payment provider for field payouts',
    when: PAYOUT_CONFIGURED,
  },
  { key: 'departments', requirement: 'recommended', title: 'Department for job routing' },
  {
    key: 'trusted_issuers',
    requirement: 'conditional',
    title: 'Trusted partners whose approvals we accept',
    when: { field: 'evidencePolicy.requireApproval', equals: true },
  },
]

const REQUISITION_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'authorities', requirement: 'conditional', title: 'Approval authority for requisitions' },
  { key: 'departments', requirement: 'conditional', title: 'Department for requisition routing' },
  stageActor('approve_requisition', 'Who approves a request'),
  stageActor('finance_approve_requisition', 'Finance approval of a request', 'recommended'),
  stageActor('release_funds', 'Who releases the money'),
  stageActor('acknowledge_execution', 'Requester confirms it arrived', 'recommended'),
]

const PAYMENT_COLLECTION_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'payment_provider', requirement: 'conditional', title: 'Payment provider for collections' },
  stageActor('record_payment', 'Who records payments', 'recommended'),
  stageActor('issue_receipt_vc', 'Who issues receipts', 'recommended'),
]

const AP_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'authorities', requirement: 'conditional', title: 'Payment approval authority for supplier invoices' },
  stageActor('record_payment', 'Who records supplier payments'),
  stageActor('acknowledge_remittance', 'Who confirms money arrived', 'recommended'),
]

const COMMERCE_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'payment_provider', requirement: 'conditional', title: 'Payment provider for customer payments' },
  { key: 'trusted_issuers', requirement: 'recommended', title: 'Trusted supplier / courier partners' },
  stageActor('issue_receipt_vc', 'Who issues receipts', 'recommended'),
]

const HR_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'roles', requirement: 'mandatory', title: 'HR roles defined' },
  { key: 'departments', requirement: 'conditional', title: 'Departments for employee placement' },
  { key: 'authorities', requirement: 'conditional', title: 'HR approval authority' },
  stageActor('approve_onboarding', 'HR approver'),
]

const PAYSLIP_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'roles', requirement: 'mandatory', title: 'Payroll roles defined' },
  { key: 'departments', requirement: 'recommended', title: 'Departments for payroll grouping' },
  stageActor('issue_payslip', 'Payroll actor who issues payslips'),
]

const ISSUER_ONLY_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'ssi_identity', requirement: 'mandatory', title: 'Issuer identity provisioned' },
]

const ISSUER_WITH_VERIFICATION_PREREQUISITES: WorkflowPrerequisite[] = [
  { key: 'ssi_identity', requirement: 'mandatory', title: 'Issuer identity provisioned' },
  { key: 'trusted_issuers', requirement: 'conditional', title: 'Trusted partners whose evidence we accept' },
]

/**
 * Registry keyed by canonical template id AND by workflow type aliases so both
 * in-memory templates and persisted tenant templates resolve.
 */
export const TEMPLATE_PREREQUISITES: Record<string, WorkflowPrerequisite[]> = {
  // Field operations
  'tpl-fept-field-execution': FEPT_PREREQUISITES,
  field_execution_fept: FEPT_PREREQUISITES,
  field_execution: FEPT_PREREQUISITES,
  field_service: FEPT_PREREQUISITES,
  'default-field-execution': FEPT_PREREQUISITES,

  // Procurement / requisitions
  'tpl-requisition-approval': REQUISITION_PREREQUISITES,
  'default-internal-requisitions': REQUISITION_PREREQUISITES,
  internal_requisitions: REQUISITION_PREREQUISITES,
  requisition_workflow: REQUISITION_PREREQUISITES,
  internal_requisition_approval: REQUISITION_PREREQUISITES,
  'procurement.requisition': REQUISITION_PREREQUISITES,
  requisition: REQUISITION_PREREQUISITES,

  // Payments / collections
  'tpl-education-fee': PAYMENT_COLLECTION_PREREQUISITES,
  'default-education-fee': PAYMENT_COLLECTION_PREREQUISITES,
  education_fee_payment: PAYMENT_COLLECTION_PREREQUISITES,
  school_fee_payment: PAYMENT_COLLECTION_PREREQUISITES,
  school_fees: PAYMENT_COLLECTION_PREREQUISITES,
  'tpl-cash-counter': PAYMENT_COLLECTION_PREREQUISITES,
  'default-cash-counter': PAYMENT_COLLECTION_PREREQUISITES,
  cash_counter_payment: PAYMENT_COLLECTION_PREREQUISITES,
  cash_payment: PAYMENT_COLLECTION_PREREQUISITES,
  'tpl-payment-collection': PAYMENT_COLLECTION_PREREQUISITES,
  collect_payments: PAYMENT_COLLECTION_PREREQUISITES,
  payment_collection: PAYMENT_COLLECTION_PREREQUISITES,
  'tpl-ar-collections': PAYMENT_COLLECTION_PREREQUISITES,
  accounts_receivable: PAYMENT_COLLECTION_PREREQUISITES,
  ar_collections: PAYMENT_COLLECTION_PREREQUISITES,
  invoice: PAYMENT_COLLECTION_PREREQUISITES,
  'tpl-receipt-trail': ISSUER_ONLY_PREREQUISITES,

  // Accounts payable
  'tpl-ap-payables': AP_PREREQUISITES,
  accounts_payable: AP_PREREQUISITES,
  ap_payables: AP_PREREQUISITES,
  'finance.payment_request': AP_PREREQUISITES,
  'finance.expense_claim': AP_PREREQUISITES,
  'finance.purchase_order': AP_PREREQUISITES,

  // Commerce
  'tpl-quote-invoice-receipt': COMMERCE_PREREQUISITES,
  'default-ecommerce-delivery': COMMERCE_PREREQUISITES,
  ecommerce_delivery: COMMERCE_PREREQUISITES,
  'tpl-delivery-escrow': COMMERCE_PREREQUISITES,
  quote: COMMERCE_PREREQUISITES,

  // Field requests share the field-execution prerequisite group
  'field.site_access': FEPT_PREREQUISITES,
  'field.inspection': FEPT_PREREQUISITES,
  'field.maintenance': FEPT_PREREQUISITES,

  // HR / payroll
  'tpl-employee-onboarding': HR_PREREQUISITES,
  'hr.onboarding': HR_PREREQUISITES,
  'hr.offboarding': HR_PREREQUISITES,
  'hr.delegation_request': HR_PREREQUISITES,
  'tpl-payslip-issuance': PAYSLIP_PREREQUISITES,
  'tpl-payroll-reporting': PAYSLIP_PREREQUISITES,

  // Issuer-only / verification templates
  'tpl-digital-twin': ISSUER_ONLY_PREREQUISITES,
  'tpl-policy-issuance': ISSUER_WITH_VERIFICATION_PREREQUISITES,
  'tpl-credit-eligibility': ISSUER_WITH_VERIFICATION_PREREQUISITES,
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * Look up registry prerequisites for a template id / workflow type and any aliases.
 * Returns undefined when nothing is declared so callers can fall back to core-only.
 */
export function lookupRegistryPrerequisites(candidates: string[]): WorkflowPrerequisite[] | undefined {
  for (const candidate of candidates) {
    const direct = TEMPLATE_PREREQUISITES[candidate]
    if (direct) return direct
    const lowered = TEMPLATE_PREREQUISITES[normalize(candidate)]
    if (lowered) return lowered
  }
  return undefined
}

/**
 * Resolve the effective prerequisites for a template definition.
 * Persisted per-tenant declarations win; otherwise the registry applies.
 * `candidates` should include the template id, its workflow type, and known aliases.
 */
export function getDeclaredPrerequisites(
  template: Pick<WorkflowTemplateDefinition, 'id' | 'workflowType' | 'prerequisites'>,
  candidates: string[] = [],
): WorkflowPrerequisite[] {
  if (Array.isArray(template.prerequisites) && template.prerequisites.length > 0) {
    return template.prerequisites
  }
  const lookup = [template.id, template.workflowType, ...candidates].filter(Boolean)
  return lookupRegistryPrerequisites(lookup) ?? []
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, source)
}

/** Evaluate a prerequisite condition against a template definition. */
export function prerequisiteApplies(
  prerequisite: WorkflowPrerequisite,
  template: Partial<WorkflowTemplateDefinition> | undefined,
): boolean {
  const when = prerequisite.when
  if (!when) return true
  const value = readPath(template, when.field)
  if (when.nonEmpty !== undefined) {
    const nonEmpty = Array.isArray(value)
      ? value.length > 0
      : typeof value === 'string'
        ? value.length > 0
        : Boolean(value)
    if (nonEmpty !== when.nonEmpty) return false
  }
  if (when.equals !== undefined && value !== when.equals) {
    return false
  }
  return true
}

/** Stable key used in readiness items for a prerequisite. */
export function prerequisiteItemKey(prerequisite: Pick<WorkflowPrerequisite, 'key' | 'stageAction'>): string {
  if (prerequisite.key === 'stage_actor') {
    return `stage_actor:${normalize(prerequisite.stageAction)}`
  }
  return prerequisite.key
}

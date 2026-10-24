/**
 * Approval areas on the Approvals page (Settings → Permissions). An area grant lets the person
 * review, approve and decline requests in that area's workflows, up to an optional limit.
 */
export const APPROVAL_PERMISSIONS = ['request.review', 'request.approve', 'request.reject']

const AREA_WORKFLOWS: Record<string, string[] | undefined> = {
  finance: ['internal_requisitions', 'accounts_payable', 'accounts_receivable', 'education_fee_payment'],
  procurement: ['internal_requisitions', 'accounts_payable'],
  hr: ['hr_requests', 'employee_onboarding'],
  operations: ['field_execution_fept'],
  // Trust approvals are not request decisions.
  trust: [],
  // General: any workflow.
  general: undefined,
}

export interface AreaGrantScope {
  permissions: string[]
  workflowTypes?: string[]
  maxAmount?: number
  currency?: string
}

export function scopeForApprovalArea(input: { domain?: string; thresholdAmount?: number; currency?: string }): AreaGrantScope {
  const area = String(input.domain || 'general').trim().toLowerCase()
  const workflowTypes = area in AREA_WORKFLOWS ? AREA_WORKFLOWS[area] : []
  return {
    permissions: [...APPROVAL_PERMISSIONS],
    ...(workflowTypes ? { workflowTypes: [...workflowTypes] } : {}),
    ...(typeof input.thresholdAmount === 'number' ? { maxAmount: input.thresholdAmount } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
  }
}

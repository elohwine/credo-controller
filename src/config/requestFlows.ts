/**
 * Every request an organisation can receive, and the flow it starts.
 *
 * A request is the trigger of a workflow: someone asks, the organisation's flow for that kind of
 * ask runs, and it waits at zero or more decision steps before the work is done. What can be
 * asked therefore follows the work areas the organisation switched on in setup:
 *
 * - Internal (members): people in the organisation ask it for something — leave, an expense
 *   back, an item, a payment for a job. Raised from Home on both apps.
 * - Public: the services an organisation publishes for anyone to find — book a job, get a bill,
 *   ask for a quote. Derived from `ORG_OFFERINGS`, so the two lists cannot drift.
 *
 * `templateId` names the flow. Its `stage.await_actor` steps marked `requestDecision` are the
 * decision steps, in order; an organisation adds a step (for example finance above an amount)
 * by saving its own copy of the template. Without a template the request has one decision step:
 * the review step of its request family.
 */
import type { OrgModule } from './orgModules'

import { ORG_OFFERINGS } from './orgOfferings'

export type RequestAudience = 'members' | 'public'

export interface RequestFlowDefinition {
  /** `requests.request_type` for members; `offering:<key>` for a public service. */
  requestType: string
  audience: RequestAudience
  /** Work area that must be on in setup. `null`: every organisation. */
  module: OrgModule | null
  /** The flow the request starts. Missing: the request is decided on its own record. */
  templateId?: string
  label: string
}

export const MEMBER_REQUEST_FLOWS: readonly RequestFlowDefinition[] = [
  {
    requestType: 'hr.leave',
    audience: 'members',
    module: 'people_payroll',
    templateId: 'tpl-request-leave',
    label: 'Leave',
  },
  {
    requestType: 'finance.expense_claim',
    audience: 'members',
    module: 'people_payroll',
    templateId: 'tpl-request-expense',
    label: 'Expense claim',
  },
  // Payroll: an advance on pay. Approved, it becomes a payment request for finance to pay out.
  {
    requestType: 'hr.salary_advance',
    audience: 'members',
    module: 'people_payroll',
    templateId: 'tpl-request-salary-advance',
    label: 'Salary advance',
  },
  {
    requestType: 'procurement.requisition',
    audience: 'members',
    module: 'purchases',
    templateId: 'tpl-request-purchase',
    label: 'Item or purchase',
  },
  // A payout request nudges the job's own payout step; the job flow decides it, not a second flow.
  {
    requestType: 'finance.payout_request',
    audience: 'members',
    module: 'field_jobs',
    label: 'Payment for a job',
  },
  {
    requestType: 'platform.general',
    audience: 'members',
    module: null,
    templateId: 'tpl-request-general',
    label: 'Something else',
  },
]

export const PUBLIC_REQUEST_FLOWS: readonly RequestFlowDefinition[] = ORG_OFFERINGS.map((offering) => ({
  requestType: `offering:${offering.key}`,
  audience: 'public' as const,
  module: offering.module,
  templateId: offering.workflowTemplateId,
  label: offering.name,
}))

export const REQUEST_FLOWS: readonly RequestFlowDefinition[] = [...MEMBER_REQUEST_FLOWS, ...PUBLIC_REQUEST_FLOWS]

export function requestFlowFor(requestType: string | undefined | null): RequestFlowDefinition | undefined {
  const key = String(requestType || '')
    .trim()
    .toLowerCase()
  return REQUEST_FLOWS.find((flow) => flow.requestType === key)
}

/** Request types a member can raise by hand, in menu order. */
export const MEMBER_REQUEST_TYPE_KEYS: readonly string[] = MEMBER_REQUEST_FLOWS.map((flow) => flow.requestType)

/** Member requests that only exist where staff and payroll work is switched on. */
export function memberRequestTypesForModule(module: OrgModule): string[] {
  return MEMBER_REQUEST_FLOWS.filter((flow) => flow.module === module).map((flow) => flow.requestType)
}

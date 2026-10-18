export const REQUEST_STAGE_ACTIONS = [
  'approve_request',
  'approve_requisition',
  'finance_approve_requisition',
  'release_funds',
  'record_payment',
  'present_payment_proof',
  'acknowledge_remittance',
  'issue_receipt_vc',
  'assign_field_worker',
  'inspect_site',
  'assess_risk',
  'resolve_safety_hold',
  'review_completion',
  'confirm_arrival',
  'start_job',
  'capture_evidence',
  'dispatch_job',
  'trigger_payout',
  'approve_onboarding',
  'issue_payslip',
  'acknowledge_execution',
  'resolve_dispute',
  'mark_disputed',
] as const

export type RequestStageAction = (typeof REQUEST_STAGE_ACTIONS)[number]
export type RequestPhase = 'draft' | 'submitted' | 'in_review' | 'approved' | 'in_fulfilment' | 'completed'

/** Presentation/routing metadata for the existing request lifecycle, not executable workflow steps. */
export interface RequestExperienceDefinition {
  version: 1
  family: string
  reviewAction: RequestStageAction
  fulfilmentAction?: RequestStageAction
  labels?: Partial<Record<RequestPhase, string>>
  decisionOnly?: boolean
}

interface RequestFamilyDeclaration {
  workflowType: string
  aliases: string[]
  experience: RequestExperienceDefinition
}

export const REQUEST_FAMILIES: RequestFamilyDeclaration[] = [
  {
    workflowType: 'hr_requests',
    aliases: ['hr.leave', 'hr_requests', 'hr-requests', 'approve_request'],
    experience: { version: 1, family: 'people', reviewAction: 'approve_request', decisionOnly: true },
  },
  {
    workflowType: 'hr_requests',
    aliases: ['finance.expense_claim'],
    experience: {
      version: 1,
      family: 'people',
      reviewAction: 'approve_request',
      labels: { in_fulfilment: 'Reimbursement in progress' },
    },
  },
  {
    workflowType: 'internal_requisitions',
    aliases: [
      'procurement.requisition',
      'requisition',
      'internal_requisitions',
      'internal_requisition_approval',
      'requisition_workflow',
      'tpl-requisition-approval',
      'default-internal-requisitions',
      'procurement.supplier_onboarding',
      'department_request',
    ],
    experience: {
      version: 1,
      family: 'purchases',
      reviewAction: 'approve_requisition',
      fulfilmentAction: 'release_funds',
    },
  },
  {
    workflowType: 'accounts_payable',
    aliases: ['finance.payment_request', 'accounts_payable', 'ap_payables', 'ap_workflow', 'tpl-ap-payables'],
    experience: {
      version: 1,
      family: 'payables',
      reviewAction: 'record_payment',
      fulfilmentAction: 'record_payment',
    },
  },
  {
    workflowType: 'accounts_payable',
    aliases: ['finance.purchase_order'],
    experience: {
      version: 1,
      family: 'purchases',
      reviewAction: 'approve_requisition',
      fulfilmentAction: 'release_funds',
    },
  },
  {
    workflowType: 'accounts_receivable',
    aliases: [
      'invoice',
      'accounts_receivable',
      'ar_collections',
      'ar_workflow',
      'tpl-ar-collections',
      'collect_payments',
      'payment_collection',
      'tpl-payment-collection',
      'tpl-receipt-trail',
    ],
    experience: {
      version: 1,
      family: 'collections',
      reviewAction: 'record_payment',
      fulfilmentAction: 'issue_receipt_vc',
    },
  },
  {
    workflowType: 'education_fee_payment',
    aliases: [
      'education_fee_payment',
      'school_fee_payment',
      'school_fees',
      'tpl-education-fee',
      'default-education-fee',
    ],
    experience: {
      version: 1,
      family: 'school_fees',
      reviewAction: 'record_payment',
      fulfilmentAction: 'issue_receipt_vc',
    },
  },
  {
    workflowType: 'accounts_receivable',
    aliases: [
      'quote',
      'ecommerce_delivery',
      'tpl-quote-invoice-receipt',
      'tpl-delivery-escrow',
      'default-ecommerce-delivery',
      'cash_counter_payment',
      'cash_payment',
      'tpl-cash-counter',
      'default-cash-counter',
    ],
    experience: {
      version: 1,
      family: 'commerce',
      reviewAction: 'record_payment',
      fulfilmentAction: 'acknowledge_execution',
    },
  },
  {
    workflowType: 'employee_onboarding',
    aliases: [
      'hr.onboarding',
      'hr.offboarding',
      'hr.delegation_request',
      'employee_onboarding',
      'tpl-employee-onboarding',
    ],
    experience: { version: 1, family: 'people', reviewAction: 'approve_onboarding' },
  },
  {
    workflowType: 'employee_onboarding',
    aliases: [
      'payslip',
      'payroll',
      'payslip_issuance',
      'payroll_reporting',
      'tpl-payslip-issuance',
      'tpl-payroll-reporting',
    ],
    experience: { version: 1, family: 'people', reviewAction: 'issue_payslip' },
  },
  ...(
    [
      [
        'assign_field_worker',
        [
          'field_execution_fept',
          'field_execution',
          'field_service',
          'field_job',
          'field.site_access',
          'field.maintenance',
          'tpl-fept-field-execution',
          'default-field-execution',
        ],
      ],
      ['inspect_site', ['field.inspection', 'field_inspection', 'inspect_site']],
      ['review_completion', ['field.review', 'field_review', 'review_completion']],
      ['resolve_safety_hold', ['field.safety_hold', 'field_safety_hold', 'resolve_safety_hold']],
      ['assess_risk', ['field.safety_resume', 'field_safety_resume', 'assess_risk']],
      ['acknowledge_execution', ['field.signoff', 'field_signoff', 'acknowledge_execution']],
      ['trigger_payout', ['field.payout', 'field_payout', 'trigger_payout', 'finance.payout_request']],
    ] satisfies Array<[RequestStageAction, string[]]>
  ).map(([reviewAction, aliases]) => ({
    workflowType: 'field_execution_fept',
    aliases,
    experience: { version: 1 as const, family: 'field_jobs', reviewAction },
  })),
  {
    workflowType: 'general',
    aliases: ['platform.general', 'general'],
    experience: { version: 1, family: 'requests', reviewAction: 'approve_request', decisionOnly: true },
  },
]

const token = (value: string) => value.trim().toLowerCase().replace(/-/g, '_')

export function requestFamily(requestType: string, workflowType?: string): RequestFamilyDeclaration | undefined {
  // A concrete task (e.g. field inspection) wins over its containing workflow.
  return [requestType, workflowType]
    .filter((value): value is string => Boolean(value))
    .map((value) => REQUEST_FAMILIES.find((entry) => entry.aliases.some((alias) => token(alias) === token(value))))
    .find((entry) => entry !== undefined)
}

const PHASE_LABELS: Record<RequestPhase, string> = {
  draft: 'Draft',
  submitted: 'Request submitted',
  in_review: 'Review',
  approved: 'Approved',
  in_fulfilment: 'Fulfilment',
  completed: 'Completed',
}

export function validateRequestExperience(value: RequestExperienceDefinition): void {
  if (value.version !== 1 || typeof value.family !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value.family)) {
    throw new Error('Unsupported request experience version or family')
  }
  for (const action of [value.reviewAction, value.fulfilmentAction].filter(Boolean)) {
    if (!REQUEST_STAGE_ACTIONS.some((supported) => supported === action)) {
      throw new Error(`Unsupported request stage action: ${action}`)
    }
  }
  if (!value.reviewAction) throw new Error('A request experience must declare its review action')
  if (value.decisionOnly !== undefined && typeof value.decisionOnly !== 'boolean') {
    throw new Error('Request experience decisionOnly must be a boolean')
  }
  if (value.decisionOnly && value.fulfilmentAction) {
    throw new Error('A decision-only request cannot declare a fulfilment action')
  }
  if (value.labels) {
    if (typeof value.labels !== 'object' || Array.isArray(value.labels)) throw new Error('Invalid request stage labels')
    for (const [key, label] of Object.entries(value.labels)) {
      if (
        !Object.prototype.hasOwnProperty.call(PHASE_LABELS, key) ||
        typeof label !== 'string' ||
        !label.trim() ||
        label.length > 120
      ) {
        throw new Error(`Unsupported request stage label: ${key}`)
      }
    }
  }
}

export interface RequestExperienceEvent {
  event_type?: string
  to_status?: string | null
  created_at?: string
  actor_user_id?: string | null
}

export interface RequestProgressStage {
  key: string
  label: string
  proof: string
  vcType: string
  stageAction?: RequestStageAction
  status: 'done' | 'active' | 'pending' | 'skipped' | 'held'
  at?: string
  actorUserId?: string
  note?: string
}

export interface RequestExperience {
  version: 1
  resourceType: 'request'
  resourceId: string
  family: string
  workflowType: string
  stages: RequestProgressStage[]
}

export function projectRequestExperience(input: {
  id: string
  requestType: string
  workflowType?: string
  status: string
  events?: RequestExperienceEvent[]
  definition?: RequestExperienceDefinition
}): RequestExperience {
  const declaration = requestFamily(input.requestType, input.workflowType)
  const definition = input.definition ||
    declaration?.experience || {
      version: 1,
      family: 'requests',
      reviewAction: 'approve_request',
    }
  validateRequestExperience(definition)
  const events = input.events || []
  // A declined request can be revised and resubmitted. Prior decisions remain in history,
  // not as completed stages of the new attempt.
  const reset = events.reduce((last, event, index) => (event.to_status === 'draft' ? index : last), 0)
  const attempt = events.slice(reset)
  const current = input.status.toLowerCase()
  const stopped = ['rejected', 'cancelled', 'expired'].includes(current)
  const phases: RequestPhase[] = [
    'submitted',
    'in_review',
    'approved',
    ...(definition.decisionOnly ? [] : (['in_fulfilment', 'completed'] as const)),
  ]
  if (current === 'draft') phases.unshift('draft')
  const index = phases.indexOf(current as RequestPhase)
  const terminal = current === 'completed' || (definition.decisionOnly && current === 'approved')
  const stages = phases.map((key): RequestProgressStage => {
    const recorded = attempt.filter((event) => event.to_status === key).at(-1)
    const passed = index > phases.indexOf(key)
    const closure =
      key === 'in_review'
        ? attempt.find((event) => event.to_status === 'approved')
        : key === 'in_fulfilment'
          ? attempt.find((event) => event.to_status === 'completed')
          : undefined
    const active =
      (key === 'in_review' && ['submitted', 'in_review'].includes(current)) ||
      (key === 'in_fulfilment' && ['approved', 'in_fulfilment'].includes(current)) ||
      (key === 'draft' && current === key)
    const ongoing = key === 'in_review' || key === 'in_fulfilment'
    let status: RequestProgressStage['status'] = 'pending'
    if (active) status = 'active'
    else if (stopped) status = recorded ? (ongoing && !closure ? 'held' : 'done') : 'skipped'
    else if (recorded || (current === key && (terminal || key === 'submitted' || key === 'approved'))) status = 'done'
    else if (passed || terminal) status = input.events ? 'skipped' : 'done'
    const evidence = status === 'done' && ongoing ? closure : recorded
    return {
      key,
      label: definition.labels?.[key] || PHASE_LABELS[key],
      proof: 'Record',
      vcType: '',
      stageAction:
        key === 'in_review'
          ? definition.reviewAction
          : key === 'in_fulfilment'
            ? definition.fulfilmentAction
            : undefined,
      status,
      at: evidence?.created_at,
      actorUserId: evidence?.actor_user_id || undefined,
    }
  })
  if (stopped) {
    const event = attempt.filter((entry) => entry.to_status === current).at(-1)
    stages.push({
      key: current,
      label: current === 'rejected' ? 'Declined' : current === 'expired' ? 'Expired' : 'Cancelled',
      proof: 'Record',
      vcType: '',
      status: 'held',
      at: event?.created_at,
      actorUserId: event?.actor_user_id || undefined,
    })
  } else if (index === -1 && !terminal) {
    stages.push({
      key: current || 'unknown',
      label: 'Status needs review',
      proof: 'Record',
      vcType: '',
      status: 'held',
      note: `Unsupported request status: ${input.status}`,
    })
  }
  return {
    version: 1,
    resourceType: 'request',
    resourceId: input.id,
    family: definition.family,
    workflowType: input.workflowType || declaration?.workflowType || input.requestType,
    stages,
  }
}

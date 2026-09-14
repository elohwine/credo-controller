export type WorkflowCapability =
  | 'payment_collection'
  | 'ar_collections'
  | 'ap_payables'
  | 'education_fees'
  | 'internal_requisitions'
  | 'field_execution'
  | 'cash_counter'
  | 'ecommerce'
  | 'hr_ops'

export interface WorkflowTemplateLike {
  id?: string | null
  workflowType?: string | null
  sector?: string | null
  enabled?: boolean
}

const WORKFLOW_TYPE_ALIASES: Record<string, string> = {
  'ecommerce-delivery': 'tpl-quote-invoice-receipt',
  'education-fee-payment': 'tpl-education-fee',
  'cash-counter-payment': 'tpl-cash-counter',
  'collect-payments': 'tpl-payment-collection',
  'payment-collection': 'tpl-payment-collection',
  'accounts-receivable': 'tpl-ar-collections',
  'ar-collections': 'tpl-ar-collections',
  'accounts-payable': 'tpl-ap-payables',
  'ap-payables': 'tpl-ap-payables',
  'field-execution-fept': 'tpl-fept-field-execution',
}

const CAPABILITY_TOKENS: Record<WorkflowCapability, string[]> = {
  payment_collection: ['tpl-payment-collection'],
  ar_collections: ['tpl-ar-collections'],
  ap_payables: ['tpl-ap-payables'],
  education_fees: ['tpl-education-fee'],
  internal_requisitions: [
    'tpl-internal-requisition',
    'tpl-internal-requisitions',
    'tpl-requisition',
    'tpl-requisitions',
    'internal-requisition',
    'internal-requisitions',
    'requisition',
    'requisitions',
  ],
  field_execution: ['tpl-fept-field-execution'],
  cash_counter: ['tpl-cash-counter'],
  ecommerce: ['tpl-quote-invoice-receipt', 'tpl-delivery-escrow'],
  hr_ops: ['tpl-employee-onboarding', 'tpl-payslip-issuance', 'tpl-payroll-reporting'],
}

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function isEnabled(template: WorkflowTemplateLike): boolean {
  return template.enabled !== false
}

export function resolveCanonicalWorkflowType(value: unknown): string {
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  return WORKFLOW_TYPE_ALIASES[normalized] ?? normalized
}

function matchesCapabilityToken(capability: WorkflowCapability, token: string): boolean {
  if (!token) return false

  const allowed = CAPABILITY_TOKENS[capability]
  if (allowed.includes(token)) return true

  if (capability === 'internal_requisitions') {
    return (
      /^tpl-(internal-)?requisitions?([-.].*)?$/.test(token) ||
      /(^|[-.])internal-requisitions?([-.]|$)/.test(token) ||
      /(^|[-.])requisitions?([-.]|$)/.test(token)
    )
  }

  return false
}

function matchesCapabilitySector(capability: WorkflowCapability, sector: string): boolean {
  if (!sector) return false
  if (capability === 'education_fees') return sector === 'education'
  if (capability === 'field_execution') return sector === 'field_execution'
  return false
}

function templateSignals(template: WorkflowTemplateLike): { tokens: Set<string>; sector: string } {
  const id = normalizeToken(template.id)
  const workflowType = normalizeToken(template.workflowType)
  const canonicalType = resolveCanonicalWorkflowType(workflowType || id)
  const sector = normalizeToken(template.sector)

  const tokens = new Set<string>()
  if (id) tokens.add(id)
  if (workflowType) tokens.add(workflowType)
  if (canonicalType) tokens.add(canonicalType)

  return { tokens, sector }
}

export function deriveWorkflowCapabilities(templates: WorkflowTemplateLike[]): Set<WorkflowCapability> {
  const capabilities = new Set<WorkflowCapability>()
  if (!Array.isArray(templates) || templates.length === 0) return capabilities

  for (const template of templates) {
    if (!isEnabled(template)) continue
    const { tokens, sector } = templateSignals(template)

    for (const capability of Object.keys(CAPABILITY_TOKENS) as WorkflowCapability[]) {
      if (matchesCapabilitySector(capability, sector)) {
        capabilities.add(capability)
        continue
      }

      const matched = Array.from(tokens).some((token) => matchesCapabilityToken(capability, token))
      if (matched) capabilities.add(capability)
    }
  }

  return capabilities
}

export function getWorkflowCapabilityFlags(templates: WorkflowTemplateLike[]) {
  const capabilities = deriveWorkflowCapabilities(templates)
  return {
    paymentCollection: capabilities.has('payment_collection'),
    arCollections: capabilities.has('ar_collections'),
    apPayables: capabilities.has('ap_payables'),
    educationFees: capabilities.has('education_fees'),
    internalRequisitions: capabilities.has('internal_requisitions'),
    fieldExecution: capabilities.has('field_execution'),
    cashCounter: capabilities.has('cash_counter'),
    ecommerce: capabilities.has('ecommerce'),
    hrOps: capabilities.has('hr_ops'),
  }
}

export function findTemplateForCapability(
  templates: WorkflowTemplateLike[],
  capability: WorkflowCapability,
): WorkflowTemplateLike | undefined {
  if (!Array.isArray(templates) || templates.length === 0) return undefined

  const ranked = templates
    .filter(isEnabled)
    .map((template) => {
      const { tokens, sector } = templateSignals(template)
      const tokenScore = Array.from(tokens).some((token) => CAPABILITY_TOKENS[capability].includes(token)) ? 2 : 0
      const sectorScore = matchesCapabilitySector(capability, sector) ? 1 : 0
      const fallbackScore = Array.from(tokens).some((token) => matchesCapabilityToken(capability, token)) ? 1 : 0
      return { template, score: tokenScore + sectorScore + fallbackScore }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.template
}

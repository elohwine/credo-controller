/**
 * Pure configuration contract shared by the API, portal and mobile app. SSI is not a module.
 * `templateIds` are catalogue workflow templates whose instantiated workflows carry a generic
 * category (e.g. `finance`), so the gate can still tell which work area they belong to.
 */
export const ORG_MODULE_CATALOGUE = [
  {
    id: 'purchases',
    label: 'Purchase requests',
    detail: 'Request and approve purchases.',
    opens: 'Purchase requests',
    requestTypes: ['internal_requisitions'],
    templateIds: [],
    paid: false,
  },
  {
    id: 'payables',
    label: 'Supplier bills',
    detail: 'Record supplier invoices and settlements.',
    opens: 'Supplier bills',
    requestTypes: ['accounts_payable'],
    templateIds: ['tpl-ap-payables'],
    paid: false,
  },
  {
    id: 'collections',
    label: 'Customer payments',
    detail: 'Collect payments and manage receivables.',
    opens: 'Customer payments',
    requestTypes: ['payment_collection', 'accounts_receivable'],
    templateIds: ['tpl-ar-collections', 'tpl-payment-collection'],
    paid: false,
  },
  {
    id: 'field_jobs',
    label: 'Field jobs',
    detail: 'Jobs with evidence, sign-off and payment.',
    opens: 'Jobs',
    requestTypes: ['field_execution_fept'],
    templateIds: ['tpl-fept-field-execution'],
    paid: false,
  },
  {
    id: 'school_fees',
    label: 'School fees',
    detail: 'Fee assessments and parent payments.',
    opens: 'School fees',
    requestTypes: ['education_fee_payment'],
    templateIds: ['tpl-education-fee'],
    paid: false,
  },
  {
    id: 'commerce',
    label: 'Shop and services',
    detail: 'Catalogue, counter sales and deliveries.',
    opens: 'Shop and services',
    requestTypes: ['cash_counter_payment', 'ecommerce_delivery'],
    templateIds: ['tpl-quote-invoice-receipt', 'tpl-delivery-escrow', 'tpl-cash-counter'],
    paid: false,
  },
  {
    id: 'people_payroll',
    label: 'People and payroll',
    detail: 'Staff leave, expenses and payslips.',
    opens: 'Staff requests',
    requestTypes: ['hr_requests'],
    templateIds: ['tpl-employee-onboarding', 'tpl-payslip-issuance', 'tpl-payroll-reporting'],
    paid: true,
  },
] as const

export type OrgModule = (typeof ORG_MODULE_CATALOGUE)[number]['id']
export const ORG_MODULES: OrgModule[] = ORG_MODULE_CATALOGUE.map((module) => module.id)
export type OrgOperatingModel = 'internal' | 'integration' | 'hybrid'
export const ORG_OPERATING_MODELS: OrgOperatingModel[] = ['internal', 'integration', 'hybrid']

/** Plain reasons per questionnaire answer; GenUI onboarding reuses this mapping later. */
const SUGGESTIONS_BY_KIND: Record<string, Array<{ id: OrgModule; reason: string }>> = {
  office: [
    { id: 'purchases', reason: 'Because you run an office that buys things.' },
    { id: 'payables', reason: 'Because you run an office that pays suppliers.' },
    { id: 'collections', reason: 'Because you run an office that collects payments.' },
  ],
  field: [{ id: 'field_jobs', reason: 'Because you send people out to do jobs.' }],
  school: [{ id: 'school_fees', reason: 'Because you collect school fees.' }],
  shop: [{ id: 'commerce', reason: 'Because you sell goods or services.' }],
}

export interface OrgModuleSuggestion {
  id: OrgModule
  reason: string
}

export function suggestOrgSetup(kinds: readonly string[], operatingModel: OrgOperatingModel): OrgModuleSuggestion[] {
  if (operatingModel === 'integration') return []
  return kinds.flatMap((kind) => SUGGESTIONS_BY_KIND[kind] ?? [])
}

export function suggestedOrgModules(kinds: readonly string[], operatingModel: OrgOperatingModel): OrgModule[] {
  return Array.from(new Set(suggestOrgSetup(kinds, operatingModel).map((item) => item.id)))
}

export interface OrgModuleAccess {
  id: OrgModule
  selected: boolean
  entitled: boolean
  available: boolean
  reason?: string
}

export interface OrgConfigurationAccess {
  revision: number
  mode: 'legacy' | 'explicit' | 'unconfigured'
  operatingModel: OrgOperatingModel
  /** Foundation cannot be disabled by selections or commercial entitlements. */
  ssiIdentity: true
  modules: OrgModuleAccess[]
  /** Derived from the questionnaire answers; the UI shows these, never the full catalogue. */
  suggestions: OrgModuleSuggestion[]
  /** Work still running in areas that are not currently available for new work. */
  drainingWork: Array<{
    moduleId: OrgModule
    label: string
    activeRequests: number
    activeWorkflowRuns: number
  }>
}

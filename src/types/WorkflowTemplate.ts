/**
 * Workflow Template type definitions for sector-driven onboarding.
 *
 * A WorkflowTemplateDefinition is a persisted, tenant-configurable version of
 * the in-memory WorkflowTemplate from templates.ts. It adds payment modes,
 * credential/reconciliation/evidence/branding policies, and versioning.
 */

export type SectorType = 'ecommerce' | 'education' | 'cash' | 'field_execution' | 'custom'

export type CredentialOfferMode = 'required' | 'optional' | 'disabled'

export interface WorkflowStepDefinition {
  action: string
  description: string
  config?: Record<string, unknown>
}

export interface CredentialPolicy {
  outputVCs: string[]
  autoIssue: boolean
  // Per VC type offer behavior. Optional VCs are not offered unless sendOptionalOffers=true.
  vcOfferModes?: Record<string, CredentialOfferMode>
  // Global gate for optional VC offers. Defaults to false.
  sendOptionalOffers?: boolean
}

export interface ReconciliationPolicy {
  mode: 'automatic' | 'daily_batch' | 'manual_close' | 'bank_import'
  events: string[]
}

export interface EvidencePolicy {
  requireDeliveryPhoto?: boolean
  requireSignature?: boolean
  requireStudentId?: boolean
  requireTermReference?: boolean
  requireCashierRef?: boolean
  requireGps?: boolean
  requirePhoto?: boolean
  requireAcknowledgementSignature?: boolean
  requireApproval?: boolean
}

export interface BrandingPolicy {
  logo?: string
  primaryColor?: string
  receiptFooter?: string
  supportContact?: string
}

export type WorkflowInitiationMode = 'none' | 'optional' | 'required'

export interface WorkflowInitiationDefinition {
  mode: WorkflowInitiationMode
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface WorkflowTemplateDefinition {
  id: string
  tenantId: string | null
  workflowType: string
  name: string
  sector: SectorType
  enabled: boolean
  version: number
  steps: WorkflowStepDefinition[]
  paymentModes: string[]
  credentialPolicy: CredentialPolicy
  reconciliationPolicy: ReconciliationPolicy
  evidencePolicy: EvidencePolicy
  brandingPolicy: BrandingPolicy
  initiation?: WorkflowInitiationDefinition
  createdAt?: Date
  updatedAt?: Date
}

/** Sector metadata for the onboarding UI */
export interface SectorInfo {
  id: SectorType
  name: string
  description: string
  icon: string
  examples: string[]
  defaultTemplateId: string
}

export const SECTORS: SectorInfo[] = [
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    description: 'Online and delivery-based sales with quote → invoice → payment → receipt → delivery flows.',
    icon: 'IconBuildingStore',
    examples: ['Retail shops', 'Market vendors', 'Delivery services'],
    defaultTemplateId: 'default-ecommerce-delivery',
  },
  {
    id: 'education',
    name: 'Education',
    description: 'School and university fee collection with invoice → payment → receipt flows.',
    icon: 'IconSchool',
    examples: ['Primary schools', 'Universities', 'Training centres'],
    defaultTemplateId: 'default-education-fee',
  },
  {
    id: 'cash',
    name: 'Cash Counter',
    description: 'Walk-in point-of-sale with cash/mobile capture and daily reconciliation.',
    icon: 'IconCash',
    examples: ['Tuckshops', 'Pharmacies', 'Service counters'],
    defaultTemplateId: 'default-cash-counter',
  },
  {
    id: 'field_execution',
    name: 'Field Execution',
    description:
      'Mobile workforce operations with assignment, evidence capture, acknowledgement, payment, and reconciliation.',
    icon: 'IconRoute',
    examples: ['Deliveries', 'Inspections', 'Service teams'],
    defaultTemplateId: 'default-field-execution',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Build your own workflow from scratch or clone an existing template.',
    icon: 'IconSettings',
    examples: ['HR onboarding', 'Insurance claims', 'Supply chain'],
    defaultTemplateId: 'default-ecommerce-delivery',
  },
]
/** Capability metadata for the modular onboarding UI */
export interface CapabilityInfo {
  id: string
  name: string
  description: string
  icon: string
  benefits: string[]
  associatedTemplates: string[]
}

export const CAPABILITIES: CapabilityInfo[] = [
  {
    id: 'collect_payments',
    name: 'Collect Payments',
    description: 'Proactive payment collection with invoicing and receipts.',
    icon: 'IconCreditCard',
    benefits: ['Reduce collection time', 'Issue verifiable receipts', 'Build credit history'],
    associatedTemplates: ['tpl-payment-collection', 'tpl-receipt-trail'],
  },
  {
    id: 'accounts_receivable',
    name: 'Accounts Receivable',
    description: 'Customer invoicing, payment links, instalment plans, and receipt tracking.',
    icon: 'IconReceipt',
    benefits: ['Create payment links', 'Track instalments', 'Issue verifiable receipts'],
    associatedTemplates: ['tpl-ar-collections'],
  },
  {
    id: 'accounts_payable',
    name: 'Accounts Payable',
    description: 'Supplier invoice capture, payment execution, and remittance advice management.',
    icon: 'IconBuildingBank',
    benefits: ['Track supplier balances', 'Issue remittance advice', 'Reduce payment errors'],
    associatedTemplates: ['tpl-ap-payables'],
  },
  {
    id: 'sales_delivery',
    name: 'Sales & Delivery',
    description: 'Full e-commerce pipeline from quote to escrow-protected delivery.',
    icon: 'IconBuildingStore',
    benefits: ['Secure escrow payments', 'Proof of delivery VCs', 'Automated inventory updates'],
    associatedTemplates: ['tpl-quote-invoice-receipt', 'tpl-delivery-escrow', 'ecommerce_delivery'],
  },
  {
    id: 'field_operations',
    name: 'Field Operations',
    description: 'Manage mobile teams with proof of execution (FEPT).',
    icon: 'IconRoute',
    benefits: ['Real-time team oversight', 'Tamper-proof evidence', 'Automated payouts'],
    associatedTemplates: ['tpl-fept-field-execution', 'field_execution_fept'],
  },
  {
    id: 'education_fees',
    name: 'Education Fees',
    description: 'Specialized fee collection for schools and universities.',
    icon: 'IconSchool',
    benefits: ['Direct student billing', 'Scholarship verification', 'Academic trust building'],
    associatedTemplates: ['tpl-education-fee', 'education_fee_payment'],
  },
  {
    id: 'hr_payroll',
    name: 'HR & Payroll',
    description: 'Employee onboarding, verifiable payslips, and statutory reporting.',
    icon: 'IconUsers',
    benefits: ['Compliant reporting', 'Digital employment contracts', 'Verified income history'],
    associatedTemplates: ['tpl-employee-onboarding', 'tpl-payslip-issuance', 'tpl-payroll-reporting'],
  },
  {
    id: 'internal_requisitions',
    name: 'Internal Requisitions',
    description: 'Corporate procurement and expense management with multi-stage approval.',
    icon: 'IconBuildingBank',
    benefits: ['Control spend', 'Audit-ready approvals', 'Integrated with Finance'],
    associatedTemplates: ['tpl-requisition-approval', 'internal_requisitions'],
  },
]

/**
 * What an organisation can offer the public, derived from the work areas it set up.
 *
 * Two different things, never mixed:
 * - Services: work done for someone (a job, a bill to pay, school fees). A customer asks or
 *   books; that becomes a workflow request in the organisation's inbox. Stored in
 *   `service_catalog`, one row per offering, `is_active` is the owner's "show it" switch.
 * - Goods: products with a price that people buy from the shop and that can be delivered.
 *   Stored in `catalog_items` and only available with the `commerce` work area.
 *
 * Staff and payroll work never leaves the organisation, so it has no public offering.
 */
import type { OrgModule } from './orgModules'

export type OfferingRequestType = 'quote' | 'invoice' | 'service'

export interface OrgOfferingDefinition {
  key: string
  /** Work area that must be on for this service to be shown. `null`: every organisation. */
  module: OrgModule | null
  name: string
  description: string
  requestType: OfferingRequestType
  serviceType: 'workflow' | 'payment' | 'other'
  workflowTemplateId?: string
  /** Cards the customer keeps when the work is done. */
  vcTypes: string[]
  requirements: string[]
  /** Shown to the public until the owner turns it off. */
  defaultOn: boolean
}

export const ORG_OFFERINGS: OrgOfferingDefinition[] = [
  {
    key: 'ask_quote',
    module: null,
    name: 'Ask for a quote',
    description: 'Tell us what you need and we send you a price.',
    requestType: 'quote',
    serviceType: 'other',
    vcTypes: [],
    requirements: ['What you need, how many and by when'],
    defaultOn: true,
  },
  {
    key: 'book_job',
    module: 'field_jobs',
    name: 'Book a job',
    description: 'We send someone to do the work, with photos as proof and a sign-off from you.',
    requestType: 'service',
    serviceType: 'workflow',
    workflowTemplateId: 'tpl-fept-field-execution',
    vcTypes: ['ExecutionAckVC', 'ReceiptVC'],
    requirements: ['Where the job is', 'When it suits you'],
    defaultOn: true,
  },
  {
    key: 'pay_bill',
    module: 'collections',
    name: 'Get a bill and pay it',
    description: 'We send you a bill you pay in the app. You keep the receipt as a verifiable card.',
    requestType: 'invoice',
    serviceType: 'payment',
    workflowTemplateId: 'tpl-ar-collections',
    vcTypes: ['ReceiptVC'],
    requirements: ['What the bill is for'],
    defaultOn: true,
  },
  {
    key: 'school_fees',
    module: 'school_fees',
    name: 'Pay school fees',
    description: 'Get the fee statement for a learner and pay it. The receipt stays on your phone.',
    requestType: 'invoice',
    serviceType: 'payment',
    workflowTemplateId: 'tpl-education-fee',
    vcTypes: ['InvoiceVC', 'SchoolFeeReceiptVC'],
    requirements: ['Learner name', 'Grade or class'],
    defaultOn: true,
  },
  {
    key: 'order_quote',
    module: 'commerce',
    name: 'Order with a quote',
    description: 'For bigger or custom orders: we quote, you accept, pay and get the receipt.',
    requestType: 'quote',
    serviceType: 'workflow',
    workflowTemplateId: 'tpl-quote-invoice-receipt',
    vcTypes: ['QuoteVC', 'InvoiceVC', 'PaymentReceiptVC'],
    requirements: ['Items and quantities'],
    defaultOn: false,
  },
  {
    key: 'become_supplier',
    module: 'payables',
    name: 'Become a supplier',
    description: 'Tell us what you supply. Approved suppliers send bills here and get paid in the app.',
    requestType: 'service',
    serviceType: 'other',
    vcTypes: ['RemittanceAdviceVC'],
    requirements: ['What you supply', 'Your business name'],
    defaultOn: false,
  },
]

/** Work area that unlocks goods (products for sale). */
export const GOODS_MODULE: OrgModule = 'commerce'

/** Plain names for the cards a customer keeps, for the public profile. */
export const OFFERING_VC_LABELS: Record<string, string> = {
  ExecutionAckVC: 'Job done card',
  ReceiptVC: 'Receipt',
  InvoiceVC: 'Bill',
  SchoolFeeReceiptVC: 'School fee receipt',
  QuoteVC: 'Quote',
  PaymentReceiptVC: 'Receipt',
  RemittanceAdviceVC: 'Payment advice',
}

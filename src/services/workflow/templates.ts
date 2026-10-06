/**
 * IdenEx Credentis - Workflow Templates Registry
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Pre-built, configurable workflow templates for common use cases.
 * SMEs can pick, configure, and deploy these without engineering cycles.
 *
 * Templates cover:
 * - Finance: Payment receipts, credit eligibility, loan workflows
 * - E-commerce: Quote → Invoice → Receipt flows, escrow delivery
 * - HR/Payroll: Employee onboarding, payslips, statutory reporting
 * - Supply Chain: Digital twins, provenance tracking
 * - Insurance: Policy issuance and claims
 *
 * @module services/workflow/templates
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { WorkflowRecord } from '../../persistence/WorkflowRepository'
import type { WorkflowPrerequisite } from '../../types/WorkflowTemplate'

import { TEMPLATE_PREREQUISITES } from './prerequisites'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'finance' | 'ecommerce' | 'hr' | 'supply-chain' | 'healthcare' | 'education' | 'insurance' | 'utilities'
  industry: string[]
  triggerTypes: ('webhook' | 'payment' | 'schedule' | 'manual' | 'agent-intent')[]
  inputSchema: any
  outputVCs: string[]
  steps: Array<{
    action: string
    config: any
    description: string
  }>
  configurable: {
    field: string
    label: string
    type: 'string' | 'number' | 'boolean' | 'select'
    options?: string[]
    default?: any
  }[]
  /**
   * Organizational prerequisites (people, authority, trust, providers, stage actors)
   * that must exist before this workflow is operational. Replaces feature activation:
   * a workflow runs when these are satisfied, not when a flag is flipped.
   */
  prerequisites?: WorkflowPrerequisite[]
}

// =============================================================================
// FINANCE & MICRO-LOANS TEMPLATES
// =============================================================================

export const ReceiptTrailTemplate: WorkflowTemplate = {
  id: 'tpl-receipt-trail',
  name: 'Payment Receipt Trail',
  description: 'Issue verifiable receipts on payment confirmation. Builds credit history for merchants.',
  category: 'finance',
  industry: ['retail', 'ecommerce', 'services'],
  triggerTypes: ['webhook', 'payment'],
  inputSchema: {
    type: 'object',
    properties: {
      transactionId: { type: 'string', title: 'Transaction ID' },
      amount: { type: 'number', title: 'Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      merchantDid: { type: 'string', title: 'Merchant DID' },
      buyerPhoneHash: { type: 'string', title: 'Buyer Phone Hash' },
      items: { type: 'array', title: 'Line Items' },
      paymentRef: { type: 'string', title: 'EcoCash/MNEE Reference' },
    },
    required: ['transactionId', 'amount', 'paymentRef'],
  },
  outputVCs: ['PaymentReceiptVC'],
  steps: [
    {
      action: 'finance.validate_payment',
      config: { requireRef: true },
      description: 'Validate payment reference against provider',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PaymentReceiptVC',
        mapping: {
          receiptId: 'state.offer.offerId',
          transactionId: 'input.transactionId',
          amount: 'input.amount',
          currency: 'input.currency',
          merchantDid: 'input.merchantDid',
          buyerPhoneHash: 'input.buyerPhoneHash',
          items: 'input.items',
          paymentRef: 'input.paymentRef',
          timestamp: 'state.validation.timestamp',
        },
      },
      description: 'Issue PaymentReceiptVC signed by merchant + platform co-sign',
    },
    {
      action: 'trust.update_score',
      config: { event: 'payment_completed', weight: 1 },
      description: 'Update merchant trust score',
    },
  ],
  configurable: [
    { field: 'coSign', label: 'Require Platform Co-signature', type: 'boolean', default: true },
    { field: 'notifyBuyer', label: 'Send Receipt to Buyer', type: 'boolean', default: true },
    {
      field: 'deliveryChannel',
      label: 'Delivery Channel',
      type: 'select',
      options: ['wallet', 'whatsapp', 'email'],
      default: 'wallet',
    },
  ],
}

export const CreditEligibilityTemplate: WorkflowTemplate = {
  id: 'tpl-credit-eligibility',
  name: 'Credit Eligibility Check',
  description: 'Verify payment history and issue credit eligibility VC for loan applications.',
  category: 'finance',
  industry: ['lending', 'microfinance'],
  triggerTypes: ['manual', 'agent-intent'],
  inputSchema: {
    type: 'object',
    properties: {
      applicantDid: { type: 'string', title: 'Applicant DID' },
      requestedAmount: { type: 'number', title: 'Requested Loan Amount' },
      receiptVCIds: { type: 'array', title: 'Receipt VC IDs to Verify' },
    },
    required: ['applicantDid', 'requestedAmount'],
  },
  outputVCs: ['CreditEligibilityVC'],
  steps: [
    {
      action: 'credential.verify_presentation',
      config: { requiredTypes: ['PaymentReceiptVC'], minCount: 3 },
      description: 'Verify applicant payment history VCs',
    },
    {
      action: 'trust.calculate_credit_score',
      config: {},
      description: 'Calculate credit score from verified receipts',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'CreditEligibilityVC',
        mapping: {
          applicantDid: 'input.applicantDid',
          eligibleAmount: 'state.creditScore.eligibleAmount',
          score: 'state.creditScore.score',
          verifiedReceipts: 'state.verifiedReceipts.count',
          validUntil: 'state.creditScore.validUntil',
        },
      },
      description: 'Issue CreditEligibilityVC',
    },
  ],
  configurable: [
    { field: 'minReceipts', label: 'Minimum Receipts Required', type: 'number', default: 3 },
    { field: 'lookbackDays', label: 'Lookback Period (days)', type: 'number', default: 90 },
  ],
}

// =============================================================================
// E-COMMERCE TEMPLATES
// =============================================================================

export const QuoteInvoiceReceiptTemplate: WorkflowTemplate = {
  id: 'tpl-quote-invoice-receipt',
  name: 'Quote → Invoice → Receipt Pipeline',
  description: 'Complete e-commerce transaction flow with verifiable documents at each stage.',
  category: 'ecommerce',
  industry: ['retail', 'wholesale', 'services', 'whatsapp-commerce'],
  triggerTypes: ['manual', 'webhook', 'agent-intent'],
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', title: 'Line Items' },
      buyerDid: { type: 'string', title: 'Buyer DID' },
      buyerPhone: { type: 'string', title: 'Buyer Phone' },
      discount: { type: 'string', title: 'Discount' },
      taxRate: { type: 'number', title: 'Tax Rate %' },
    },
    required: ['items'],
  },
  outputVCs: ['QuoteVC', 'InvoiceVC', 'PaymentReceiptVC'],
  steps: [
    {
      action: 'finance.calculate_invoice',
      config: { taxRate: 15, taxInclusive: false },
      description: 'Calculate totals with tax and discounts',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'QuoteVC',
        mapping: {
          quoteId: 'state.offer.offerId',
          items: 'input.items',
          subtotal: 'state.finance.subtotal',
          taxAmount: 'state.finance.taxAmount',
          discountAmount: 'state.finance.discountAmount',
          grandTotal: 'state.finance.grandTotal',
          currency: 'state.finance.currency',
          buyerDid: 'input.buyerDid',
          validUntil: 'state.quote.validUntil',
        },
      },
      description: 'Issue QuoteVC',
    },
    {
      action: 'workflow.pause_for_event',
      config: { eventType: 'quote_accepted', timeout: '7d' },
      description: 'Wait for buyer to accept quote',
    },
    {
      action: 'external.call_provider',
      config: {
        providerId: 'ecocash-zw',
        endpoint: '/payment/instant/c2b',
        bodyMapping: {
          amount: 'state.finance.grandTotal',
          customerMsisdn: 'input.buyerPhone',
        },
      },
      description: 'Initiate payment via EcoCash',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'InvoiceVC',
        mapping: {
          invoiceId: 'state.offer.offerId',
          quoteRef: 'state.quote.id',
          amount: 'state.finance.grandTotal',
          paymentStatus: 'state.payment.status',
          paymentRef: 'state.payment.reference',
        },
      },
      description: 'Issue InvoiceVC',
    },
    {
      action: 'workflow.pause_for_event',
      config: { eventType: 'payment_confirmed', timeout: '24h' },
      description: 'Wait for payment confirmation webhook',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PaymentReceiptVC',
        mapping: {
          receiptId: 'state.offer.offerId',
          invoiceRef: 'state.invoice.id',
          amount: 'state.payment.amount',
          paymentRef: 'state.payment.reference',
          timestamp: 'state.payment.timestamp',
        },
      },
      description: 'Issue PaymentReceiptVC',
    },
  ],
  configurable: [
    { field: 'taxRate', label: 'Tax Rate %', type: 'number', default: 15 },
    { field: 'quoteValidDays', label: 'Quote Valid (days)', type: 'number', default: 7 },
    {
      field: 'paymentProvider',
      label: 'Payment Provider',
      type: 'select',
      options: ['ecocash-zw', 'innbucks-zw', 'mnee'],
      default: 'ecocash-zw',
    },
  ],
}

export const DeliveryEscrowTemplate: WorkflowTemplate = {
  id: 'tpl-delivery-escrow',
  name: 'Delivery with Escrow',
  description: 'Escrow payment released on delivery confirmation. Supports MNEE on-chain.',
  category: 'ecommerce',
  industry: ['delivery', 'logistics', 'whatsapp-commerce'],
  triggerTypes: ['webhook', 'payment'],
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', title: 'Order ID' },
      amount: { type: 'number', title: 'Amount' },
      buyerDid: { type: 'string', title: 'Buyer DID' },
      sellerDid: { type: 'string', title: 'Seller DID' },
      deliveryAgentDid: { type: 'string', title: 'Delivery Agent DID' },
      deliveryAddress: { type: 'string', title: 'Delivery Address' },
    },
    required: ['orderId', 'amount', 'buyerDid', 'sellerDid'],
  },
  outputVCs: ['EscrowVC', 'DeliveryConfirmationVC', 'PaymentReceiptVC'],
  steps: [
    {
      action: 'escrow.create',
      config: { releaseCondition: 'delivery_confirmed' },
      description: 'Create escrow holding funds',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'EscrowVC',
        mapping: {
          escrowId: 'state.escrow.id',
          orderId: 'input.orderId',
          amount: 'input.amount',
          buyerDid: 'input.buyerDid',
          sellerDid: 'input.sellerDid',
          status: 'state.escrow.status',
        },
      },
      description: 'Issue EscrowVC',
    },
    {
      action: 'notification.send',
      config: { type: 'whatsapp', template: 'delivery_assigned' },
      description: 'Notify delivery agent',
    },
    {
      action: 'workflow.pause_for_event',
      config: { eventType: 'delivery_confirmed', timeout: '48h' },
      description: 'Wait for delivery confirmation',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'DeliveryConfirmationVC',
        mapping: {
          orderId: 'input.orderId',
          deliveryAgentDid: 'input.deliveryAgentDid',
          confirmedAt: 'state.delivery.confirmedAt',
          signature: 'state.delivery.buyerSignature',
        },
      },
      description: 'Issue DeliveryConfirmationVC',
    },
    {
      action: 'escrow.release',
      config: {},
      description: 'Release escrow to seller',
    },
    {
      action: 'credential.issue',
      config: { type: 'PaymentReceiptVC' },
      description: 'Issue final PaymentReceiptVC',
    },
  ],
  configurable: [
    {
      field: 'escrowProvider',
      label: 'Escrow Provider',
      type: 'select',
      options: ['platform', 'mnee'],
      default: 'platform',
    },
    { field: 'deliveryTimeout', label: 'Delivery Timeout (hours)', type: 'number', default: 48 },
    { field: 'requirePhoto', label: 'Require Delivery Photo', type: 'boolean', default: true },
  ],
}

// =============================================================================
// HR / PAYROLL TEMPLATES
// =============================================================================

export const EmployeeOnboardingTemplate: WorkflowTemplate = {
  id: 'tpl-employee-onboarding',
  name: 'Employee Onboarding',
  description: 'Verify identity, collect consent, issue employment contract and ID credentials.',
  category: 'hr',
  industry: ['all'],
  triggerTypes: ['manual', 'webhook'],
  inputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string', title: 'Employee ID' },
      fullName: { type: 'string', title: 'Full Name' },
      nationalId: { type: 'string', title: 'National ID' },
      email: { type: 'string', title: 'Email' },
      phone: { type: 'string', title: 'Phone' },
      department: { type: 'string', title: 'Department' },
      position: { type: 'string', title: 'Position' },
      salary: { type: 'number', title: 'Salary' },
      startDate: { type: 'string', title: 'Start Date' },
      bankAccount: { type: 'string', title: 'Bank Account' },
      ecocashNumber: { type: 'string', title: 'EcoCash Number' },
    },
    required: ['employeeId', 'fullName', 'nationalId', 'department', 'position'],
  },
  outputVCs: ['ConsentVC', 'IdentityVerificationVC', 'EmploymentContractVC'],
  steps: [
    {
      action: 'consent.capture',
      config: {
        purposes: ['employment', 'payroll', 'verification'],
        retentionPeriod: '7y',
      },
      description: 'Capture employee consent for data processing',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'ConsentVC',
        mapping: {
          subjectDid: 'input.employeeDid',
          purposes: 'state.consent.purposes',
          timestamp: 'state.consent.timestamp',
        },
      },
      description: 'Issue ConsentVC',
    },
    {
      action: 'external.call_provider',
      config: {
        providerId: 'zimra-tax',
        endpoint: '/verify/identity',
        bodyMapping: { nationalId: 'input.nationalId', fullName: 'input.fullName' },
      },
      description: 'Verify identity with ZIMRA',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'IdentityVerificationVC',
        mapping: {
          employeeId: 'input.employeeId',
          fullNameHash: 'state.identity.nameHash',
          verificationSource: 'state.identity.source',
          verifiedAt: 'state.identity.timestamp',
        },
      },
      description: 'Issue IdentityVerificationVC',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'EmploymentContractVC',
        mapping: {
          employeeId: 'input.employeeId',
          department: 'input.department',
          position: 'input.position',
          startDate: 'input.startDate',
          employerDid: 'state.tenant.issuerDid',
        },
      },
      description: 'Issue EmploymentContractVC',
    },
    {
      action: 'notification.send',
      config: { type: 'email', template: 'welcome_employee' },
      description: 'Send welcome email with credential offer',
    },
  ],
  configurable: [
    { field: 'requireIdVerification', label: 'Require ID Verification', type: 'boolean', default: true },
    {
      field: 'verificationProvider',
      label: 'ID Verification Provider',
      type: 'select',
      options: ['zimra-tax', 'manual'],
      default: 'zimra-tax',
    },
  ],
}

export const PayslipIssuanceTemplate: WorkflowTemplate = {
  id: 'tpl-payslip-issuance',
  name: 'Payslip Issuance',
  description: 'Issue verifiable payslips and trigger salary payments via EcoCash.',
  category: 'hr',
  industry: ['all'],
  triggerTypes: ['schedule', 'manual'],
  inputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string', title: 'Employee ID' },
      employeeDid: { type: 'string', title: 'Employee DID' },
      payPeriod: { type: 'string', title: 'Pay Period' },
      baseSalary: { type: 'number', title: 'Base Salary' },
      deductions: { type: 'array', title: 'Deductions' },
      allowances: { type: 'array', title: 'Allowances' },
      paymentMethod: { type: 'string', title: 'Payment Method' },
      paymentAccount: { type: 'string', title: 'Payment Account' },
    },
    required: ['employeeId', 'payPeriod', 'baseSalary'],
  },
  outputVCs: ['PayslipVC'],
  steps: [
    {
      action: 'finance.calculate_payslip',
      config: {},
      description: 'Calculate net pay from salary, deductions, allowances',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PayslipVC',
        mapping: {
          employeeId: 'input.employeeId',
          payPeriod: 'input.payPeriod',
          baseSalary: 'input.baseSalary',
          totalDeductions: 'state.payroll.totalDeductions',
          totalAllowances: 'state.payroll.totalAllowances',
          netPay: 'state.payroll.netPay',
          currency: 'state.payroll.currency',
        },
      },
      description: 'Issue PayslipVC',
    },
    {
      action: 'external.call_provider',
      config: {
        providerId: 'ecocash-zw',
        endpoint: '/payment/b2c',
        bodyMapping: {
          amount: 'state.payroll.netPay',
          recipientMsisdn: 'input.paymentAccount',
        },
      },
      description: 'Trigger salary payment via EcoCash',
    },
    {
      action: 'notification.send',
      config: { type: 'email', template: 'payslip_ready' },
      description: 'Notify employee payslip is ready',
    },
  ],
  configurable: [
    { field: 'autoPayment', label: 'Auto-trigger Payment', type: 'boolean', default: true },
    {
      field: 'paymentProvider',
      label: 'Payment Provider',
      type: 'select',
      options: ['ecocash-zw', 'bank-transfer'],
      default: 'ecocash-zw',
    },
  ],
}

export const PayrollReportingTemplate: WorkflowTemplate = {
  id: 'tpl-payroll-reporting',
  name: 'Regulator Payroll Report',
  description: 'Generate and submit signed payroll reports to NSSA/ZIMRA.',
  category: 'hr',
  industry: ['all'],
  triggerTypes: ['schedule'],
  inputSchema: {
    type: 'object',
    properties: {
      reportPeriod: { type: 'string', title: 'Report Period' },
      employeeCount: { type: 'number', title: 'Employee Count' },
      totalGross: { type: 'number', title: 'Total Gross' },
      totalNSSA: { type: 'number', title: 'Total NSSA' },
      totalPAYE: { type: 'number', title: 'Total PAYE' },
    },
    required: ['reportPeriod'],
  },
  outputVCs: ['PayrollReportVC'],
  steps: [
    {
      action: 'payroll.aggregate_period',
      config: {},
      description: 'Aggregate payroll data for period',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PayrollReportVC',
        mapping: {
          reportPeriod: 'input.reportPeriod',
          employerDid: 'state.tenant.issuerDid',
          employeeCount: 'state.payroll.employeeCount',
          totalGross: 'state.payroll.totalGross',
          totalNSSA: 'state.payroll.totalNSSA',
          totalPAYE: 'state.payroll.totalPAYE',
          generatedAt: 'state.report.timestamp',
        },
      },
      description: 'Issue PayrollReportVC',
    },
    {
      action: 'external.call_provider',
      config: {
        providerId: 'zimra-tax',
        endpoint: '/submit/payroll-return',
        bodyMapping: { reportVC: 'state.offer.credentialJwt' },
      },
      description: 'Submit to ZIMRA',
    },
  ],
  configurable: [{ field: 'autoSubmit', label: 'Auto-submit to Regulator', type: 'boolean', default: false }],
}

// =============================================================================
// SUPPLY CHAIN TEMPLATES
// =============================================================================

export const DigitalTwinTemplate: WorkflowTemplate = {
  id: 'tpl-digital-twin',
  name: 'Product Digital Twin',
  description: 'Issue verifiable product credentials with provenance and authenticity.',
  category: 'supply-chain',
  industry: ['manufacturing', 'agriculture', 'pharmaceuticals'],
  triggerTypes: ['manual', 'webhook'],
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string', title: 'Product ID / SKU' },
      batchNumber: { type: 'string', title: 'Batch Number' },
      serialNumbers: { type: 'array', title: 'Serial Numbers' },
      manufacturerDid: { type: 'string', title: 'Manufacturer DID' },
      productionDate: { type: 'string', title: 'Production Date' },
      expiryDate: { type: 'string', title: 'Expiry Date' },
      qcInspector: { type: 'string', title: 'QC Inspector' },
      qcPassed: { type: 'boolean', title: 'QC Passed' },
      metadata: { type: 'object', title: 'Product Metadata' },
    },
    required: ['productId', 'batchNumber', 'manufacturerDid'],
  },
  outputVCs: ['DigitalTwinVC'],
  steps: [
    {
      action: 'supply_chain.validate_batch',
      config: {},
      description: 'Validate batch and QC data',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'DigitalTwinVC',
        mapping: {
          productDid: 'state.product.did',
          productId: 'input.productId',
          batchNumber: 'input.batchNumber',
          serialNumbers: 'input.serialNumbers',
          manufacturerDid: 'input.manufacturerDid',
          productionDate: 'input.productionDate',
          expiryDate: 'input.expiryDate',
          qcStatus: 'state.qc.status',
          provenanceHash: 'state.provenance.hash',
        },
      },
      description: 'Issue DigitalTwinVC',
    },
    {
      action: 'supply_chain.anchor_hash',
      config: { ledger: 'optional' },
      description: 'Optionally anchor hash to permissioned ledger',
    },
  ],
  configurable: [
    { field: 'anchorToLedger', label: 'Anchor to Ledger', type: 'boolean', default: false },
    { field: 'generateQR', label: 'Generate Product QR', type: 'boolean', default: true },
  ],
}

// =============================================================================
// INSURANCE TEMPLATES
// =============================================================================

export const PolicyIssuanceTemplate: WorkflowTemplate = {
  id: 'tpl-policy-issuance',
  name: 'Insurance Policy Issuance',
  description: 'Issue verifiable insurance policies on premium payment.',
  category: 'insurance',
  industry: ['microinsurance', 'insurance'],
  triggerTypes: ['payment', 'manual'],
  inputSchema: {
    type: 'object',
    properties: {
      policyType: { type: 'string', title: 'Policy Type' },
      holderDid: { type: 'string', title: 'Policy Holder DID' },
      holderName: { type: 'string', title: 'Holder Name' },
      coverAmount: { type: 'number', title: 'Cover Amount' },
      premium: { type: 'number', title: 'Premium' },
      startDate: { type: 'string', title: 'Start Date' },
      endDate: { type: 'string', title: 'End Date' },
      beneficiaries: { type: 'array', title: 'Beneficiaries' },
    },
    required: ['policyType', 'holderDid', 'coverAmount', 'premium'],
  },
  outputVCs: ['PolicyVC'],
  steps: [
    {
      action: 'external.call_provider',
      config: { providerId: 'ecocash-zw' },
      description: 'Process premium payment',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PolicyVC',
        mapping: {
          policyId: 'state.offer.offerId',
          policyType: 'input.policyType',
          holderDid: 'input.holderDid',
          coverAmount: 'input.coverAmount',
          premium: 'input.premium',
          startDate: 'input.startDate',
          endDate: 'input.endDate',
          status: 'active',
        },
      },
      description: 'Issue PolicyVC',
    },
    {
      action: 'notification.send',
      config: { type: 'sms', template: 'policy_active' },
      description: 'Notify policy holder',
    },
  ],
  configurable: [],
}

// =============================================================================
// EDUCATION TEMPLATES
// =============================================================================

export const EducationFeeTemplate: WorkflowTemplate = {
  id: 'tpl-education-fee',
  name: 'Education Fee Payment',
  description: 'School/university fee collection: invoice → payment → verifiable receipt. No delivery step.',
  category: 'education',
  industry: ['education', 'training'],
  triggerTypes: ['manual', 'webhook', 'schedule'],
  inputSchema: {
    type: 'object',
    properties: {
      studentId: { type: 'string', title: 'Student ID' },
      studentName: { type: 'string', title: 'Student Name' },
      term: { type: 'string', title: 'Term / Semester' },
      feeType: { type: 'string', title: 'Fee Type', enum: ['tuition', 'boarding', 'exam', 'levy', 'other'] },
      amount: { type: 'number', title: 'Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      schoolName: { type: 'string', title: 'School / Institution Name' },
      payerPhone: { type: 'string', title: 'Payer Phone Number' },
    },
    required: ['studentId', 'studentName', 'term', 'feeType', 'amount', 'schoolName'],
  },
  outputVCs: ['InvoiceVC', 'SchoolFeeReceiptVC'],
  steps: [
    {
      action: 'finance.calculate_invoice',
      config: { taxRate: 0, taxInclusive: true },
      description: 'Generate fee invoice for student/term',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'InvoiceVC',
        mapping: {
          invoiceId: 'state.offer.offerId',
          amount: 'input.amount',
          currency: 'input.currency',
          metadata: {
            type: 'education_fees',
            studentId: 'input.studentId',
            studentName: 'input.studentName',
            term: 'input.term',
            feeType: 'input.feeType',
            schoolName: 'input.schoolName',
          },
        },
      },
      description: 'Issue generalized InvoiceVC with education metadata',
    },
    {
      action: 'external.ecocash_payment',
      config: { provider: 'ecocash-zw' },
      description: 'Capture fee payment via EcoCash / mobile money',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'SchoolFeeReceiptVC',
        mapping: {
          receiptId: 'state.payment.receiptId',
          amount: 'input.amount',
          currency: 'input.currency',
          paymentRef: 'state.payment.providerRef',
          paidAt: 'state.payment.timestamp',
          metadata: {
            type: 'education_fees',
            studentId: 'input.studentId',
            studentName: 'input.studentName',
            term: 'input.term',
            feeType: 'input.feeType',
            schoolName: 'input.schoolName',
          },
        },
      },
      description: 'Issue SchoolFeeReceiptVC with education metadata',
    },
    {
      action: 'trust.update_score',
      config: { event: 'fee_payment_completed', weight: 1 },
      description: 'Update institution trust score',
    },
  ],
  configurable: [
    {
      field: 'paymentMethods',
      label: 'Accepted Payment Methods',
      type: 'select',
      options: ['ecocash', 'bank_transfer', 'cash'],
      default: 'ecocash',
    },
    { field: 'autoReconcile', label: 'Auto-reconcile Payments', type: 'boolean', default: true },
    { field: 'notifyPayer', label: 'SMS Notify Payer on Receipt', type: 'boolean', default: true },
  ],
}

// =============================================================================
// CASH / POS TEMPLATES
// =============================================================================

export const CashCounterTemplate: WorkflowTemplate = {
  id: 'tpl-cash-counter',
  name: 'Cash Counter Payment',
  description: 'Walk-in point-of-sale with cash/mobile capture, receipt VC, and daily batch reconciliation.',
  category: 'finance',
  industry: ['retail', 'services', 'pharmacy'],
  triggerTypes: ['manual', 'webhook'],
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', title: 'Line Items' },
      amount: { type: 'number', title: 'Total Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      paymentMethod: { type: 'string', title: 'Payment Method', enum: ['cash', 'ecocash', 'pos'] },
      cashierRef: { type: 'string', title: 'Cashier Reference' },
      buyerPhone: { type: 'string', title: 'Buyer Phone (optional)' },
    },
    required: ['amount', 'paymentMethod'],
  },
  outputVCs: ['InvoiceVC', 'PaymentReceiptVC'],
  steps: [
    {
      action: 'finance.calculate_invoice',
      config: { taxRate: 15, taxInclusive: true },
      description: 'Generate point-of-sale invoice',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'InvoiceVC',
        mapping: {
          invoiceId: 'state.offer.offerId',
          items: 'input.items',
          amount: 'input.amount',
          currency: 'input.currency',
          cashierRef: 'input.cashierRef',
        },
      },
      description: 'Issue InvoiceVC',
    },
    {
      action: 'external.cash_capture',
      config: {},
      description: 'Record cash or POS payment',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PaymentReceiptVC',
        mapping: {
          receiptId: 'state.payment.receiptId',
          amount: 'input.amount',
          currency: 'input.currency',
          paymentMethod: 'input.paymentMethod',
          cashierRef: 'input.cashierRef',
          paidAt: 'state.payment.timestamp',
        },
      },
      description: 'Issue PaymentReceiptVC',
    },
    {
      action: 'trust.update_score',
      config: { event: 'counter_sale_completed', weight: 1 },
      description: 'Update merchant trust score',
    },
  ],
  configurable: [
    { field: 'requireCashierRef', label: 'Require Cashier Reference', type: 'boolean', default: true },
    {
      field: 'reconciliationMode',
      label: 'Reconciliation Mode',
      type: 'select',
      options: ['manual_close', 'daily_batch', 'automatic'],
      default: 'manual_close',
    },
  ],
}

// =============================================================================
// FIELD EXECUTION / FEPT TEMPLATES
// =============================================================================

export const FieldExecutionProofTemplate: WorkflowTemplate = {
  id: 'tpl-fept-field-execution',
  name: 'Field Execution & Proof (FEPT)',
  description:
    'Mobile field workflow: assignment, pre-job site inspection, field worker risk assessment, start, arrival proof, BEFORE evidence, work, AFTER evidence, receipts, completion review, customer sign-off, payout trigger, and reconciliation.',
  category: 'utilities',
  industry: ['delivery', 'field-service', 'procurement', 'operations'],
  triggerTypes: ['manual', 'webhook'],
  inputSchema: {
    type: 'object',
    properties: {
      reference: { type: 'string', title: 'Workflow Reference' },
      requestId: { type: 'string', title: 'Request ID' },
      requesterId: { type: 'string', title: 'Requester ID' },
      assigneeId: { type: 'string', title: 'Field Worker ID' },
      receiverId: { type: 'string', title: 'Receiver / Customer ID' },
      amount: { type: 'number', title: 'Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      customerMsisdn: { type: 'string', title: 'Payout Mobile Number' },
      providerReference: { type: 'string', title: 'Provider Reference' },
      evidenceHash: { type: 'string', title: 'Evidence Hash' },
      approvalRef: { type: 'string', title: 'Approval Reference' },
      approvalPresentation: { type: 'object', title: 'Approval VP (OID4VP response payload)' },
      approvalSignature: { type: 'string', title: 'Approval Signature (fallback)' },
      requireSiteInspection: { type: 'boolean', title: 'Require pre-job site inspection', default: true },
      requireRiskAssessment: { type: 'boolean', title: 'Require field worker risk assessment', default: true },
      requireArrivalProof: { type: 'boolean', title: 'Require arrival proof (GPS / site code)', default: true },
      requireCompletionReview: { type: 'boolean', title: 'Require completion review before sign-off', default: true },
      requireCustomerSignoff: { type: 'boolean', title: 'Require customer sign-off before payout', default: true },
    },
    required: ['reference', 'requestId', 'assigneeId', 'amount'],
  },
  // SGK reuse matrix: job card = RequisitionVC (job profile), material receipt = ReceiptVC
  // (material profile), completion = ExecutionAckVC. Invoice / payment receipt are
  // issued by the follow-on payment workflow started via `workflow.start`.
  outputVCs: ['RequisitionVC', 'ReceiptVC', 'ExecutionAckVC'],
  steps: [
    {
      action: 'field.transition',
      config: { to: 'REQUEST_CREATED' },
      description: 'Move workflow to request created state',
    },
    {
      action: 'field.assign',
      config: {
        assigneeId: 'input.assigneeId',
      },
      description: 'Assign work to a field worker and wait for them to start the job',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'RequisitionVC',
        recipientStage: 'assign_field_worker',
        mapping: {
          requisitionId: 'input.requestId',
          jobId: 'runId',
          reference: 'input.reference',
          requesterId: 'input.requesterId',
          assignment: 'state.assignment',
          location: 'input.location',
          description: 'input.description',
          scheduledDate: 'input.scheduledDate',
          approvedAmount: 'input.amount',
          currency: 'input.currency',
          workflowRunId: 'runId',
        },
      },
      description: 'Issue job card (RequisitionVC job profile) to the assigned field worker',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_site_inspection', checkpoint: 'site_inspection' },
      description: 'Pause until the pre-job site inspection is submitted (waivable per job with requireSiteInspection=false)',
    },
    {
      action: 'field.checkpoint',
      config: { checkpoint: 'site_inspection' },
      description: 'Record the pre-job site inspection (outcome, access, findings) before work is allowed to start',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_risk_assessment', checkpoint: 'risk_assessment' },
      description: 'Pause until the field worker completes the risk assessment before starting',
    },
    {
      action: 'field.checkpoint',
      config: { checkpoint: 'risk_assessment' },
      description: 'Record the field worker risk assessment (hazards, controls, PPE, safe to proceed)',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_worker_start' },
      description: 'Pause until the worker starts the job from the mobile inbox',
    },
    {
      action: 'field.transition',
      config: { to: 'IN_PROGRESS' },
      description: 'Move workflow to in progress state once the worker starts the job',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_arrival', checkpoint: 'arrival' },
      description: 'Pause until the worker proves arrival on site (location or site code)',
    },
    {
      action: 'field.checkpoint',
      config: { checkpoint: 'arrival' },
      description: 'Record arrival proof (GPS or QR) in the run output',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_evidence_before' },
      description: 'Pause until the worker captures BEFORE-work evidence from the mobile app',
    },
    {
      action: 'field.capture_evidence',
      config: { phase: 'before' },
      description: 'Capture BEFORE evidence (site state prior to work)',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_evidence_after' },
      description: 'Pause until the worker captures AFTER-work evidence from the mobile app',
    },
    {
      action: 'field.capture_evidence',
      config: { phase: 'after' },
      description: 'Capture AFTER evidence (post-work proof)',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_evidence_receipt' },
      description:
        'Pause until the worker captures RECEIPT evidence (parts, materials or physical receipts) from the mobile app',
    },
    {
      action: 'field.capture_evidence',
      config: { phase: 'receipt' },
      description: 'Capture RECEIPT evidence (manual receipts / photos)',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'ReceiptVC',
        recipientStage: 'trigger_payout',
        mapping: {
          receiptId: 'state.evidenceReceipt.evidenceHash',
          jobId: 'runId',
          workflowRunId: 'runId',
          requisitionId: 'input.requestId',
          evidenceHash: 'state.evidenceReceipt.evidenceHash',
          photoUri: 'state.evidenceReceipt.photoUri',
          capturedBy: 'state.evidenceReceipt.capturedBy',
          capturedAt: 'state.evidenceReceipt.capturedAt',
          notes: 'state.evidenceReceipt.notes',
          linkedEvidenceIds: ['state.evidenceBefore.evidenceHash', 'state.evidenceAfter.evidenceHash'],
        },
      },
      description: 'Issue material receipt (ReceiptVC material profile) linked to the job evidence chain',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_completion_review', checkpoint: 'completion_review' },
      description: 'Pause until a reviewer checks the finished work (AFTER evidence, receipts) before customer sign-off',
    },
    {
      action: 'field.checkpoint',
      config: { checkpoint: 'completion_review' },
      description: 'Record the completion review (approved / approved with notes; rework holds the job)',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_acknowledgement', requireFlag: 'requireCustomerSignoff' },
      description: 'Pause until the customer / receiver signs off the completed work',
    },
    {
      action: 'field.acknowledge',
      config: {
        receiverId: 'input.receiverId',
        requireProof: true,
      },
      description: 'Capture receiver acknowledgement (wallet proof from the sign-off person)',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'ExecutionAckVC',
        recipientStage: 'acknowledge_execution',
        mapping: {
          requisitionId: 'input.requestId',
          jobId: 'runId',
          workflowRunId: 'runId',
          receiverId: 'state.ack.receiverId',
          acknowledgedAt: 'state.ack.acknowledgedAt',
          completionStatus: 'state.ack.status',
          customerSignoff: 'state.ack.isVerifiable',
          evidenceRefs: [
            'state.evidenceBefore.evidenceHash',
            'state.evidenceAfter.evidenceHash',
            'state.evidenceReceipt.evidenceHash',
          ],
        },
      },
      description: 'Issue completion acknowledgement (ExecutionAckVC completion profile)',
    },
    {
      action: 'field.pause',
      config: { reason: 'await_payout_release', requireFlag: 'requirePayoutRelease' },
      description: 'Pause until the payout person releases payment for the signed-off work',
    },
    {
      action: 'field.trigger_payment',
      config: { requireProof: true },
      description: 'Trigger payout/payment state and log reconciliation payment event (wallet proof from the payout person)',
    },
    {
      action: 'workflow.start',
      config: {
        workflow: 'tpl-payment-collection',
        onNotReady: 'skip',
        when: 'has_customer_charge',
        inputMapping: {
          payerName: 'input.clientName',
          payerDescription: 'input.reference',
          amount: 'input.amount',
          currency: 'input.currency',
          payerPhone: 'input.customerMsisdn',
          reference: 'input.reference',
          requestId: 'input.requestId',
        },
      },
      description: 'Start payment collection (InvoiceVC + PaymentReceiptVC) when the org has payments configured',
    },
    {
      action: 'field.mark_receipt_issued',
      config: {},
      description: 'Mark receipt issued and log reconciliation receipt event',
    },
    {
      action: 'field.reconcile',
      config: { mode: 'automatic' },
      description: 'Finalize reconciliation for this workflow run',
    },
    {
      action: 'external.send_notification',
      config: {
        type: 'whatsapp',
        to: 'input.receiverId',
        template: 'field_execution_completed',
      },
      description: 'Notify receiver or requester about workflow completion',
    },
    {
      action: 'trust.update_score',
      config: { event: 'field_execution_completed', weight: 1 },
      description: 'Update trust score on successful FEPT completion',
    },
  ],
  configurable: [
    {
      field: 'walletPolicy',
      label: 'Wallet Policy',
      type: 'select',
      options: ['wallet_required', 'wallet_offered', 'wallet_not_applicable'],
      default: 'wallet_offered',
    },
    { field: 'requireApproval', label: 'Require Approval Step', type: 'boolean', default: true },
    { field: 'requireGps', label: 'Require GPS Evidence', type: 'boolean', default: true },
    { field: 'requirePhoto', label: 'Require Photo Evidence', type: 'boolean', default: true },
    { field: 'requireAcknowledgementSignature', label: 'Require Ack Signature', type: 'boolean', default: false },
    {
      field: 'reconciliationMode',
      label: 'Reconciliation Mode',
      type: 'select',
      options: ['automatic', 'daily_batch', 'manual_close'],
      default: 'automatic',
    },
  ],
}

export const PaymentCollectionTemplate: WorkflowTemplate = {
  id: 'tpl-payment-collection',
  name: 'General Payment Collection',
  description:
    'Universal payment collection flow: request payment → capture → verifiable receipt. Ideal for services, subscriptions, and simple billing.',
  category: 'finance',
  industry: ['all'],
  triggerTypes: ['manual', 'webhook', 'agent-intent'],
  inputSchema: {
    type: 'object',
    properties: {
      payerName: { type: 'string', title: 'Payer Name' },
      payerDescription: { type: 'string', title: 'Payment Description / Reason' },
      amount: { type: 'number', title: 'Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      payerPhone: { type: 'string', title: 'Payer Phone Number' },
      reference: { type: 'string', title: 'External Reference / Account Number' },
    },
    required: ['amount', 'payerDescription'],
  },
  outputVCs: ['InvoiceVC', 'PaymentReceiptVC'],
  steps: [
    {
      action: 'finance.calculate_invoice',
      config: { taxRate: 0, taxInclusive: true },
      description: 'Generate payment request / invoice',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'InvoiceVC',
        recipientStage: 'trigger_payout',
        mapping: {
          invoiceId: 'state.offer.offerId',
          payerName: 'input.payerName',
          description: 'input.payerDescription',
          amount: 'input.amount',
          currency: 'input.currency',
          reference: 'input.reference',
        },
      },
      description: 'Issue InvoiceVC as a payment request',
    },
    {
      action: 'external.ecocash_payment',
      config: { provider: 'ecocash-zw' },
      description: 'Capture payment via mobile money or digital wallet',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'PaymentReceiptVC',
        recipientStage: 'trigger_payout',
        mapping: {
          receiptId: 'state.payment.receiptId',
          amount: 'input.amount',
          currency: 'input.currency',
          paymentRef: 'state.payment.providerRef',
          paidAt: 'state.payment.timestamp',
        },
      },
      description: 'Issue Verifiable Payment Receipt',
    },
    {
      action: 'trust.update_score',
      config: { event: 'payment_collection_completed', weight: 1 },
      description: 'Update trust score on successful collection',
    },
  ],
  configurable: [
    {
      field: 'paymentMethods',
      label: 'Accepted Payment Methods',
      type: 'select',
      options: ['ecocash', 'bank_transfer', 'cash'],
      default: 'ecocash',
    },
    { field: 'autoIssueReceipt', label: 'Auto-issue Receipt on Payment', type: 'boolean', default: true },
    { field: 'notifyPayer', label: 'Notify Payer via SMS/WhatsApp', type: 'boolean', default: true },
  ],
}

// =============================================================================
// ACCOUNTS PAYABLE TEMPLATE
// =============================================================================

export const AccountsPayableTemplate: WorkflowTemplate = {
  id: 'tpl-ap-payables',
  name: 'Accounts Payable',
  description:
    'Buyer-side supplier management: onboard suppliers, record invoices, pay with verifiable remittance credentials, and reconcile balances with suppliers.',
  category: 'finance',
  industry: ['all'],
  triggerTypes: ['manual', 'webhook'],
  inputSchema: {
    type: 'object',
    properties: {
      supplierName: { type: 'string', title: 'Supplier Name' },
      invoiceRef: { type: 'string', title: 'Supplier Invoice Reference' },
      amount: { type: 'number', title: 'Invoice Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      dueDate: { type: 'string', title: 'Due Date (ISO8601)' },
      amountPaid: { type: 'number', title: 'Payment Amount' },
      paymentMethod: { type: 'string', title: 'Payment Method', enum: ['ecocash', 'bank_transfer', 'cash', 'cheque'] },
      reference: { type: 'string', title: 'Payment Reference' },
    },
    required: ['supplierName', 'invoiceRef', 'amount'],
  },
  outputVCs: ['RemittanceAdviceVC'],
  steps: [
    {
      action: 'ap.record_invoice',
      config: {},
      description: 'Record supplier invoice into AP ledger',
    },
    {
      action: 'ap.record_payment',
      config: {},
      description: 'Record payment and deduct from invoice balance',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'RemittanceAdviceVC',
        mapping: {
          paymentId: 'state.payment.id',
          invoiceRef: 'input.invoiceRef',
          buyerName: 'state.tenant.label',
          supplierName: 'input.supplierName',
          amountPaid: 'input.amountPaid',
          currency: 'input.currency',
          remainingBalance: 'state.payment.remainingBalance',
          paymentMethod: 'input.paymentMethod',
          paidAt: 'state.payment.paidAt',
          acknowledgeUrl: 'state.payment.acknowledgeUrl',
        },
      },
      description: 'Issue RemittanceAdviceVC to supplier wallet',
    },
    {
      action: 'notification.send',
      config: { type: 'remittance', channels: ['whatsapp', 'email'] },
      description: 'Notify supplier with payment amount and remaining balance',
    },
  ],
  configurable: [
    {
      field: 'defaultCurrency',
      label: 'Default Currency',
      type: 'select',
      options: ['USD', 'ZWL', 'ZAR', 'BWP'],
      default: 'USD',
    },
    {
      field: 'paymentMethods',
      label: 'Allowed Payment Methods',
      type: 'select',
      options: ['ecocash', 'bank_transfer', 'cash', 'cheque'],
      default: 'ecocash',
    },
    { field: 'requireAcknowledge', label: 'Require Supplier Acknowledgment', type: 'boolean', default: true },
    { field: 'autoAgeing', label: 'Auto-flag Overdue Invoices', type: 'boolean', default: true },
  ],
}

// =============================================================================
// ACCOUNTS RECEIVABLE (AR) — COLLECTIONS TEMPLATE
// =============================================================================

export const AccountsReceivableTemplate: WorkflowTemplate = {
  id: 'tpl-ar-collections',
  name: 'Accounts Receivable — Collections',
  description:
    'Collect payments from customers via one-time links, instalment plans, or recurring billing. Issue ReceiptVCs for every payment received.',
  category: 'finance',
  industry: ['all'],
  triggerTypes: ['manual', 'schedule', 'payment'],
  inputSchema: {
    type: 'object',
    properties: {
      collectionType: { type: 'string', title: 'Collection Type', enum: ['one_time', 'instalment', 'recurring'] },
      payerName: { type: 'string', title: 'Payer / Customer Name' },
      payerPhone: { type: 'string', title: 'Payer Phone' },
      payerEmail: { type: 'string', title: 'Payer Email' },
      description: { type: 'string', title: 'Description' },
      totalAmount: { type: 'number', title: 'Total Amount' },
      currency: { type: 'string', title: 'Currency', default: 'USD' },
      instalments: { type: 'number', title: 'Number of Instalments', default: 1 },
      cadence: { type: 'string', title: 'Billing Cadence (recurring)', enum: ['weekly', 'monthly', 'quarterly'] },
      firstDueDate: { type: 'string', title: 'First Due Date (YYYY-MM-DD)' },
    },
    required: ['collectionType', 'description', 'totalAmount'],
  },
  outputVCs: ['ReceiptVC'],
  steps: [
    {
      action: 'ar.create_plan',
      config: {},
      description: 'Create AR payment plan and generate payment links for each instalment',
    },
    {
      action: 'notification.send',
      config: { type: 'payment_request', channels: ['whatsapp', 'email'] },
      description: 'Notify payer with payment link(s)',
    },
    {
      action: 'credential.issue',
      config: {
        type: 'ReceiptVC',
        trigger: 'on_payment',
        mapping: {
          payerName: 'input.payerName',
          amount: 'state.payment.amount',
          currency: 'input.currency',
          instalmentNumber: 'state.instalment.number',
          totalInstalments: 'input.instalments',
          paidAt: 'state.payment.paidAt',
        },
      },
      description: 'Issue ReceiptVC to payer wallet on each payment',
    },
  ],
  configurable: [
    {
      field: 'defaultCurrency',
      label: 'Default Currency',
      type: 'select',
      options: ['USD', 'ZWL', 'ZIG', 'ZAR', 'BWP'],
      default: 'USD',
    },
    {
      field: 'defaultCollectionType',
      label: 'Default Collection Type',
      type: 'select',
      options: ['one_time', 'instalment', 'recurring'],
      default: 'one_time',
    },
    { field: 'sendReceiptVC', label: 'Issue ReceiptVC on Payment', type: 'boolean', default: true },
    { field: 'notifyOnPayment', label: 'Notify Collector on Payment', type: 'boolean', default: true },
  ],
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export const workflowTemplates: WorkflowTemplate[] = [
  // Finance — AR
  AccountsReceivableTemplate,
  // Finance — AP
  AccountsPayableTemplate,
  // Finance — General
  ReceiptTrailTemplate,
  CreditEligibilityTemplate,
  PaymentCollectionTemplate,
  // E-commerce
  QuoteInvoiceReceiptTemplate,
  DeliveryEscrowTemplate,
  // HR / Payroll
  EmployeeOnboardingTemplate,
  PayslipIssuanceTemplate,
  PayrollReportingTemplate,
  // Supply Chain
  DigitalTwinTemplate,
  // Insurance
  PolicyIssuanceTemplate,
  // Education
  EducationFeeTemplate,
  // Cash / POS
  CashCounterTemplate,
  // Field execution / FEPT
  FieldExecutionProofTemplate,
]

// Attach organizational prerequisites from the registry so every in-memory
// template carries its own readiness declaration (no activation flags).
for (const template of workflowTemplates) {
  if (!template.prerequisites) {
    template.prerequisites = TEMPLATE_PREREQUISITES[template.id] ?? []
  }
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find((t) => t.id === id)
}

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter((t) => t.category === category)
}

export function getTemplatesByIndustry(industry: string): WorkflowTemplate[] {
  return workflowTemplates.filter((t) => t.industry.includes(industry) || t.industry.includes('all'))
}

/**
 * Convert a template to a workflow record with tenant-specific configuration
 */
export function instantiateTemplate(
  template: WorkflowTemplate,
  tenantId: string,
  config: Record<string, any> = {},
): Omit<WorkflowRecord, 'createdAt'> {
  // Apply configurable defaults
  const appliedConfig: Record<string, any> = {}
  for (const field of template.configurable) {
    appliedConfig[field.field] = config[field.field] ?? field.default
  }

  // Deep clone steps and apply config
  const steps = template.steps.map((step) => ({
    action: step.action,
    config: {
      ...step.config,
      ...appliedConfig, // Merge tenant config into step config
    },
  }))

  return {
    id: `${template.id}-${tenantId}-${Date.now()}`,
    tenantId,
    name: config.name || template.name,
    category: template.category,
    provider: 'template',
    description: template.description,
    inputSchema: template.inputSchema,
    actions: steps,
  }
}

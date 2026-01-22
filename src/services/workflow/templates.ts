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

import { WorkflowRecord } from '../../persistence/WorkflowRepository'

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
            paymentRef: { type: 'string', title: 'EcoCash/MNEE Reference' }
        },
        required: ['transactionId', 'amount', 'paymentRef']
    },
    outputVCs: ['PaymentReceiptVC'],
    steps: [
        {
            action: 'finance.validate_payment',
            config: { requireRef: true },
            description: 'Validate payment reference against provider'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'PaymentReceiptVC',
                mapping: {
                    'receiptId': 'state.offer.offerId',
                    'transactionId': 'input.transactionId',
                    'amount': 'input.amount',
                    'currency': 'input.currency',
                    'merchantDid': 'input.merchantDid',
                    'buyerPhoneHash': 'input.buyerPhoneHash',
                    'items': 'input.items',
                    'paymentRef': 'input.paymentRef',
                    'timestamp': 'state.validation.timestamp'
                }
            },
            description: 'Issue PaymentReceiptVC signed by merchant + platform co-sign'
        },
        {
            action: 'trust.update_score',
            config: { event: 'payment_completed', weight: 1 },
            description: 'Update merchant trust score'
        }
    ],
    configurable: [
        { field: 'coSign', label: 'Require Platform Co-signature', type: 'boolean', default: true },
        { field: 'notifyBuyer', label: 'Send Receipt to Buyer', type: 'boolean', default: true },
        { field: 'deliveryChannel', label: 'Delivery Channel', type: 'select', options: ['wallet', 'whatsapp', 'email'], default: 'wallet' }
    ]
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
            receiptVCIds: { type: 'array', title: 'Receipt VC IDs to Verify' }
        },
        required: ['applicantDid', 'requestedAmount']
    },
    outputVCs: ['CreditEligibilityVC'],
    steps: [
        {
            action: 'credential.verify_presentation',
            config: { requiredTypes: ['PaymentReceiptVC'], minCount: 3 },
            description: 'Verify applicant payment history VCs'
        },
        {
            action: 'trust.calculate_credit_score',
            config: {},
            description: 'Calculate credit score from verified receipts'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'CreditEligibilityVC',
                mapping: {
                    'applicantDid': 'input.applicantDid',
                    'eligibleAmount': 'state.creditScore.eligibleAmount',
                    'score': 'state.creditScore.score',
                    'verifiedReceipts': 'state.verifiedReceipts.count',
                    'validUntil': 'state.creditScore.validUntil'
                }
            },
            description: 'Issue CreditEligibilityVC'
        }
    ],
    configurable: [
        { field: 'minReceipts', label: 'Minimum Receipts Required', type: 'number', default: 3 },
        { field: 'lookbackDays', label: 'Lookback Period (days)', type: 'number', default: 90 }
    ]
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
            taxRate: { type: 'number', title: 'Tax Rate %' }
        },
        required: ['items']
    },
    outputVCs: ['QuoteVC', 'InvoiceVC', 'PaymentReceiptVC'],
    steps: [
        {
            action: 'finance.calculate_invoice',
            config: { taxRate: 15, taxInclusive: false },
            description: 'Calculate totals with tax and discounts'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'QuoteVC',
                mapping: {
                    'quoteId': 'state.offer.offerId',
                    'items': 'input.items',
                    'subtotal': 'state.finance.subtotal',
                    'taxAmount': 'state.finance.taxAmount',
                    'discountAmount': 'state.finance.discountAmount',
                    'grandTotal': 'state.finance.grandTotal',
                    'currency': 'state.finance.currency',
                    'buyerDid': 'input.buyerDid',
                    'validUntil': 'state.quote.validUntil'
                }
            },
            description: 'Issue QuoteVC'
        },
        {
            action: 'workflow.pause_for_event',
            config: { eventType: 'quote_accepted', timeout: '7d' },
            description: 'Wait for buyer to accept quote'
        },
        {
            action: 'external.call_provider',
            config: {
                providerId: 'ecocash-zw',
                endpoint: '/payment/instant/c2b',
                bodyMapping: {
                    'amount': 'state.finance.grandTotal',
                    'customerMsisdn': 'input.buyerPhone'
                }
            },
            description: 'Initiate payment via EcoCash'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'InvoiceVC',
                mapping: {
                    'invoiceId': 'state.offer.offerId',
                    'quoteRef': 'state.quote.id',
                    'amount': 'state.finance.grandTotal',
                    'paymentStatus': 'state.payment.status',
                    'paymentRef': 'state.payment.reference'
                }
            },
            description: 'Issue InvoiceVC'
        },
        {
            action: 'workflow.pause_for_event',
            config: { eventType: 'payment_confirmed', timeout: '24h' },
            description: 'Wait for payment confirmation webhook'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'PaymentReceiptVC',
                mapping: {
                    'receiptId': 'state.offer.offerId',
                    'invoiceRef': 'state.invoice.id',
                    'amount': 'state.payment.amount',
                    'paymentRef': 'state.payment.reference',
                    'timestamp': 'state.payment.timestamp'
                }
            },
            description: 'Issue PaymentReceiptVC'
        }
    ],
    configurable: [
        { field: 'taxRate', label: 'Tax Rate %', type: 'number', default: 15 },
        { field: 'quoteValidDays', label: 'Quote Valid (days)', type: 'number', default: 7 },
        { field: 'paymentProvider', label: 'Payment Provider', type: 'select', options: ['ecocash-zw', 'innbucks-zw', 'mnee'], default: 'ecocash-zw' }
    ]
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
            deliveryAddress: { type: 'string', title: 'Delivery Address' }
        },
        required: ['orderId', 'amount', 'buyerDid', 'sellerDid']
    },
    outputVCs: ['EscrowVC', 'DeliveryConfirmationVC', 'PaymentReceiptVC'],
    steps: [
        {
            action: 'escrow.create',
            config: { releaseCondition: 'delivery_confirmed' },
            description: 'Create escrow holding funds'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'EscrowVC',
                mapping: {
                    'escrowId': 'state.escrow.id',
                    'orderId': 'input.orderId',
                    'amount': 'input.amount',
                    'buyerDid': 'input.buyerDid',
                    'sellerDid': 'input.sellerDid',
                    'status': 'state.escrow.status'
                }
            },
            description: 'Issue EscrowVC'
        },
        {
            action: 'notification.send',
            config: { type: 'whatsapp', template: 'delivery_assigned' },
            description: 'Notify delivery agent'
        },
        {
            action: 'workflow.pause_for_event',
            config: { eventType: 'delivery_confirmed', timeout: '48h' },
            description: 'Wait for delivery confirmation'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'DeliveryConfirmationVC',
                mapping: {
                    'orderId': 'input.orderId',
                    'deliveryAgentDid': 'input.deliveryAgentDid',
                    'confirmedAt': 'state.delivery.confirmedAt',
                    'signature': 'state.delivery.buyerSignature'
                }
            },
            description: 'Issue DeliveryConfirmationVC'
        },
        {
            action: 'escrow.release',
            config: {},
            description: 'Release escrow to seller'
        },
        {
            action: 'credential.issue',
            config: { type: 'PaymentReceiptVC' },
            description: 'Issue final PaymentReceiptVC'
        }
    ],
    configurable: [
        { field: 'escrowProvider', label: 'Escrow Provider', type: 'select', options: ['platform', 'mnee'], default: 'platform' },
        { field: 'deliveryTimeout', label: 'Delivery Timeout (hours)', type: 'number', default: 48 },
        { field: 'requirePhoto', label: 'Require Delivery Photo', type: 'boolean', default: true }
    ]
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
            ecocashNumber: { type: 'string', title: 'EcoCash Number' }
        },
        required: ['employeeId', 'fullName', 'nationalId', 'department', 'position']
    },
    outputVCs: ['ConsentVC', 'IdentityVerificationVC', 'EmploymentContractVC'],
    steps: [
        {
            action: 'consent.capture',
            config: {
                purposes: ['employment', 'payroll', 'verification'],
                retentionPeriod: '7y'
            },
            description: 'Capture employee consent for data processing'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'ConsentVC',
                mapping: {
                    'subjectDid': 'input.employeeDid',
                    'purposes': 'state.consent.purposes',
                    'timestamp': 'state.consent.timestamp'
                }
            },
            description: 'Issue ConsentVC'
        },
        {
            action: 'external.call_provider',
            config: {
                providerId: 'zimra-tax',
                endpoint: '/verify/identity',
                bodyMapping: { 'nationalId': 'input.nationalId', 'fullName': 'input.fullName' }
            },
            description: 'Verify identity with ZIMRA'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'IdentityVerificationVC',
                mapping: {
                    'employeeId': 'input.employeeId',
                    'fullNameHash': 'state.identity.nameHash',
                    'verificationSource': 'state.identity.source',
                    'verifiedAt': 'state.identity.timestamp'
                }
            },
            description: 'Issue IdentityVerificationVC'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'EmploymentContractVC',
                mapping: {
                    'employeeId': 'input.employeeId',
                    'department': 'input.department',
                    'position': 'input.position',
                    'startDate': 'input.startDate',
                    'employerDid': 'state.tenant.issuerDid'
                }
            },
            description: 'Issue EmploymentContractVC'
        },
        {
            action: 'notification.send',
            config: { type: 'email', template: 'welcome_employee' },
            description: 'Send welcome email with credential offer'
        }
    ],
    configurable: [
        { field: 'requireIdVerification', label: 'Require ID Verification', type: 'boolean', default: true },
        { field: 'verificationProvider', label: 'ID Verification Provider', type: 'select', options: ['zimra-tax', 'manual'], default: 'zimra-tax' }
    ]
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
            paymentAccount: { type: 'string', title: 'Payment Account' }
        },
        required: ['employeeId', 'payPeriod', 'baseSalary']
    },
    outputVCs: ['PayslipVC'],
    steps: [
        {
            action: 'finance.calculate_payslip',
            config: {},
            description: 'Calculate net pay from salary, deductions, allowances'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'PayslipVC',
                mapping: {
                    'employeeId': 'input.employeeId',
                    'payPeriod': 'input.payPeriod',
                    'baseSalary': 'input.baseSalary',
                    'totalDeductions': 'state.payroll.totalDeductions',
                    'totalAllowances': 'state.payroll.totalAllowances',
                    'netPay': 'state.payroll.netPay',
                    'currency': 'state.payroll.currency'
                }
            },
            description: 'Issue PayslipVC'
        },
        {
            action: 'external.call_provider',
            config: {
                providerId: 'ecocash-zw',
                endpoint: '/payment/b2c',
                bodyMapping: {
                    'amount': 'state.payroll.netPay',
                    'recipientMsisdn': 'input.paymentAccount'
                }
            },
            description: 'Trigger salary payment via EcoCash'
        },
        {
            action: 'notification.send',
            config: { type: 'email', template: 'payslip_ready' },
            description: 'Notify employee payslip is ready'
        }
    ],
    configurable: [
        { field: 'autoPayment', label: 'Auto-trigger Payment', type: 'boolean', default: true },
        { field: 'paymentProvider', label: 'Payment Provider', type: 'select', options: ['ecocash-zw', 'bank-transfer'], default: 'ecocash-zw' }
    ]
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
            totalPAYE: { type: 'number', title: 'Total PAYE' }
        },
        required: ['reportPeriod']
    },
    outputVCs: ['PayrollReportVC'],
    steps: [
        {
            action: 'payroll.aggregate_period',
            config: {},
            description: 'Aggregate payroll data for period'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'PayrollReportVC',
                mapping: {
                    'reportPeriod': 'input.reportPeriod',
                    'employerDid': 'state.tenant.issuerDid',
                    'employeeCount': 'state.payroll.employeeCount',
                    'totalGross': 'state.payroll.totalGross',
                    'totalNSSA': 'state.payroll.totalNSSA',
                    'totalPAYE': 'state.payroll.totalPAYE',
                    'generatedAt': 'state.report.timestamp'
                }
            },
            description: 'Issue PayrollReportVC'
        },
        {
            action: 'external.call_provider',
            config: {
                providerId: 'zimra-tax',
                endpoint: '/submit/payroll-return',
                bodyMapping: { 'reportVC': 'state.offer.credentialJwt' }
            },
            description: 'Submit to ZIMRA'
        }
    ],
    configurable: [
        { field: 'autoSubmit', label: 'Auto-submit to Regulator', type: 'boolean', default: false }
    ]
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
            metadata: { type: 'object', title: 'Product Metadata' }
        },
        required: ['productId', 'batchNumber', 'manufacturerDid']
    },
    outputVCs: ['DigitalTwinVC'],
    steps: [
        {
            action: 'supply_chain.validate_batch',
            config: {},
            description: 'Validate batch and QC data'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'DigitalTwinVC',
                mapping: {
                    'productDid': 'state.product.did',
                    'productId': 'input.productId',
                    'batchNumber': 'input.batchNumber',
                    'serialNumbers': 'input.serialNumbers',
                    'manufacturerDid': 'input.manufacturerDid',
                    'productionDate': 'input.productionDate',
                    'expiryDate': 'input.expiryDate',
                    'qcStatus': 'state.qc.status',
                    'provenanceHash': 'state.provenance.hash'
                }
            },
            description: 'Issue DigitalTwinVC'
        },
        {
            action: 'supply_chain.anchor_hash',
            config: { ledger: 'optional' },
            description: 'Optionally anchor hash to permissioned ledger'
        }
    ],
    configurable: [
        { field: 'anchorToLedger', label: 'Anchor to Ledger', type: 'boolean', default: false },
        { field: 'generateQR', label: 'Generate Product QR', type: 'boolean', default: true }
    ]
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
            beneficiaries: { type: 'array', title: 'Beneficiaries' }
        },
        required: ['policyType', 'holderDid', 'coverAmount', 'premium']
    },
    outputVCs: ['PolicyVC'],
    steps: [
        {
            action: 'external.call_provider',
            config: { providerId: 'ecocash-zw' },
            description: 'Process premium payment'
        },
        {
            action: 'credential.issue',
            config: {
                type: 'PolicyVC',
                mapping: {
                    'policyId': 'state.offer.offerId',
                    'policyType': 'input.policyType',
                    'holderDid': 'input.holderDid',
                    'coverAmount': 'input.coverAmount',
                    'premium': 'input.premium',
                    'startDate': 'input.startDate',
                    'endDate': 'input.endDate',
                    'status': 'active'
                }
            },
            description: 'Issue PolicyVC'
        },
        {
            action: 'notification.send',
            config: { type: 'sms', template: 'policy_active' },
            description: 'Notify policy holder'
        }
    ],
    configurable: []
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export const workflowTemplates: WorkflowTemplate[] = [
    // Finance
    ReceiptTrailTemplate,
    CreditEligibilityTemplate,
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
    PolicyIssuanceTemplate
]

export function getTemplateById(id: string): WorkflowTemplate | undefined {
    return workflowTemplates.find(t => t.id === id)
}

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return workflowTemplates.filter(t => t.category === category)
}

export function getTemplatesByIndustry(industry: string): WorkflowTemplate[] {
    return workflowTemplates.filter(t => t.industry.includes(industry) || t.industry.includes('all'))
}

/**
 * Convert a template to a workflow record with tenant-specific configuration
 */
export function instantiateTemplate(
    template: WorkflowTemplate,
    tenantId: string,
    config: Record<string, any> = {}
): Omit<WorkflowRecord, 'createdAt'> {
    // Apply configurable defaults
    const appliedConfig: Record<string, any> = {}
    for (const field of template.configurable) {
        appliedConfig[field.field] = config[field.field] ?? field.default
    }

    // Deep clone steps and apply config
    const steps = template.steps.map(step => ({
        action: step.action,
        config: {
            ...step.config,
            ...appliedConfig  // Merge tenant config into step config
        }
    }))

    return {
        id: `${template.id}-${tenantId}-${Date.now()}`,
        tenantId,
        name: config.name || template.name,
        category: template.category,
        provider: 'template',
        description: template.description,
        inputSchema: template.inputSchema,
        actions: steps
    }
}

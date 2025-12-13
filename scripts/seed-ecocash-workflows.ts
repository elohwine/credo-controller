/**
 * Seed script to register EcoCash Finance workflows
 * Run with: npx ts-node scripts/seed-ecocash-workflows.ts
 */

import 'reflect-metadata'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'

const ECOCASH_API_KEY = process.env.ECOCASH_API_KEY || '405mvFAY3Tz6o3V48JX6NDeSWGneVLaB'

async function seedWorkflows() {
    // Initialize database
    DatabaseManager.initialize({ path: './data/persistence.db' })

    console.log('Seeding EcoCash Finance workflows...')

    // 1. Quote Workflow
    const quoteWorkflow = {
        id: 'finance-quote-v1',
        tenantId: 'default',
        name: 'Create Quote',
        category: 'Finance',
        provider: 'EcoCash',
        description: 'Issue a Quote VC to a buyer with calculated totals',
        inputSchema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    title: 'Line Items (JSON)',
                    description: 'Array of items: [{"description":"Item","unitPrice":10,"qty":1}]'
                },
                discount: {
                    type: 'string',
                    title: 'Discount',
                    description: 'e.g. "10" for $10 or "10%" for 10%'
                },
                taxRate: {
                    type: 'number',
                    title: 'Tax Rate (%)',
                    description: 'e.g. 15 for 15%'
                },
                buyerDid: {
                    type: 'string',
                    title: 'Buyer DID',
                    description: 'DID of the buyer'
                }
            },
            required: ['items']
        },
        actions: [
            {
                action: 'finance.calculate_invoice',
                config: {
                    taxRate: 15,
                    taxInclusive: false
                }
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
                        'buyerDid': 'input.buyerDid'
                    },
                    copyInput: false
                }
            }
        ]
    }

    workflowRepository.save(quoteWorkflow)
    console.log('✓ Registered: finance-quote-v1')

    // 2. Invoice Workflow
    const invoiceWorkflow = {
        id: 'finance-invoice-v1',
        tenantId: 'default',
        name: 'Create Invoice',
        category: 'Finance',
        provider: 'EcoCash',
        description: 'Generate Invoice VC after quote acceptance with EcoCash payment instructions',
        inputSchema: {
            type: 'object',
            properties: {
                quoteId: {
                    type: 'string',
                    title: 'Quote ID',
                    description: 'Reference to the accepted quote'
                },
                customerMsisdn: {
                    type: 'string',
                    title: 'Customer Phone',
                    description: 'EcoCash phone number (e.g. 263774222475)'
                },
                amount: {
                    type: 'number',
                    title: 'Amount',
                    description: 'Payment amount'
                },
                currency: {
                    type: 'string',
                    title: 'Currency',
                    description: 'USD or ZWL'
                }
            },
            required: ['quoteId', 'customerMsisdn', 'amount']
        },
        actions: [
            {
                action: 'external.ecocash_payment',
                config: {
                    apiKey: ECOCASH_API_KEY,
                    sandboxMode: true
                }
            },
            {
                action: 'credential.issue',
                config: {
                    type: 'InvoiceVC',
                    mapping: {
                        'invoiceId': 'state.offer.offerId',
                        'quoteId': 'input.quoteId',
                        'amount': 'input.amount',
                        'currency': 'input.currency',
                        'paymentInstructions': 'state.ecocashPayment.sourceReference',
                        'status': 'state.ecocashPayment.status'
                    }
                }
            }
        ]
    }

    workflowRepository.save(invoiceWorkflow)
    console.log('✓ Registered: finance-invoice-v1')

    // 3. Receipt Workflow (triggered by webhook)
    const receiptWorkflow = {
        id: 'finance-receipt-v1',
        tenantId: 'default',
        name: 'Issue Receipt',
        category: 'Finance',
        provider: 'EcoCash',
        description: 'Issue Receipt VC after successful EcoCash payment (webhook-triggered)',
        inputSchema: {
            type: 'object',
            properties: {
                transactionId: {
                    type: 'string',
                    title: 'Transaction ID'
                },
                amount: {
                    type: 'number',
                    title: 'Amount'
                },
                currency: {
                    type: 'string',
                    title: 'Currency'
                },
                sourceReference: {
                    type: 'string',
                    title: 'Source Reference'
                }
            },
            required: ['transactionId', 'amount']
        },
        actions: [
            {
                action: 'credential.issue',
                config: {
                    type: 'ReceiptVC',
                    mapping: {
                        'receiptId': 'state.offer.offerId',
                        'transactionId': 'input.transactionId',
                        'amount': 'input.amount',
                        'currency': 'input.currency',
                        'sourceReference': 'input.sourceReference',
                        'timestamp': 'input.metadata.timestamp'
                    }
                }
            }
        ]
    }

    workflowRepository.save(receiptWorkflow)
    console.log('✓ Registered: finance-receipt-v1')

    console.log('\n✅ All EcoCash workflows registered successfully!')
    console.log('\nYou can now:')
    console.log('1. Navigate to http://localhost:5000/workflows')
    console.log('2. Select "Finance > Create Quote"')
    console.log('3. Test the full Quote → Invoice → Receipt flow')

    DatabaseManager.close()
}

seedWorkflows().catch(console.error)

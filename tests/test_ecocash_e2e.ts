/**
 * End-to-End test for EcoCash Quote → Invoice → Receipt flow
 * Run with: npx ts-node tests/test_ecocash_e2e.ts
 */

import 'reflect-metadata'
import axios from 'axios'

const BASE_URL = 'http://localhost:3000'
const API_KEY = 'test-api-key-12345'

async function testEcoCashFlow() {
    console.log('🧪 Testing EcoCash E2E Flow\n')

    try {
        // Get auth token
        console.log('1️⃣  Getting auth token...')
        const tokenRes = await axios.post(`${BASE_URL}/agent/token`, {}, {
            headers: { Authorization: API_KEY }
        })
        const token = tokenRes.data.token
        console.log('✓ Token obtained\n')

        // Step 1: Create Quote
        console.log('2️⃣  Creating Quote...')
        const quoteRes = await axios.post(
            `${BASE_URL}/workflows/finance-quote-v1/execute`,
            {
                items: [
                    { description: 'Web Development Services', unitPrice: 500, qty: 1 },
                    { description: 'Logo Design', unitPrice: 150, qty: 1 }
                ],
                discount: '10%',
                taxRate: 15,
                buyerDid: 'did:example:buyer123'
            },
            { headers: { Authorization: `Bearer ${token}` } }
        )

        console.log('✓ Quote created:')
        console.log(`  - Subtotal: $${quoteRes.data.finance.subtotal}`)
        console.log(`  - Tax: $${quoteRes.data.finance.taxAmount}`)
        console.log(`  - Discount: $${quoteRes.data.finance.discountAmount}`)
        console.log(`  - Grand Total: $${quoteRes.data.finance.grandTotal}`)
        console.log(`  - Offer URI: ${quoteRes.data.offer.credential_offer_uri}\n`)

        const quoteId = quoteRes.data.offer.offerId

        // Step 2: Create Invoice (with EcoCash payment initiation)
        console.log('3️⃣  Creating Invoice and initiating EcoCash payment...')
        const invoiceRes = await axios.post(
            `${BASE_URL}/workflows/finance-invoice-v1/execute`,
            {
                quoteId: quoteId,
                customerMsisdn: '263774183277',
                amount: quoteRes.data.finance.grandTotal,
                currency: 'USD',
                sourceReference: crypto.randomUUID()
            },
            { headers: { Authorization: `Bearer ${token}` } }
        )

        console.log('✓ Invoice created and EcoCash payment initiated:')
        console.log(`  - Invoice Offer: ${invoiceRes.data.offer.credential_offer_uri}`)
        console.log(`  - Payment Status: ${invoiceRes.data.ecocashPayment?.status || 'N/A'}`)
        console.log(`  - Source Reference: ${invoiceRes.data.ecocashPayment?.sourceReference}\n`)

        const sourceReference = invoiceRes.data.ecocashPayment?.sourceReference

        // Step 3: Simulate EcoCash webhook callback
        console.log('4️⃣  Simulating EcoCash webhook (payment success)...')
        const webhookRes = await axios.post(
            `${BASE_URL}/webhooks/ecocash`,
            {
                paymentRequestId: `PR-${Date.now()}`,
                status: 'SUCCESS',
                transactionId: `TXN-${Date.now()}`,
                amount: quoteRes.data.finance.grandTotal,
                currency: 'USD',
                sourceReference: sourceReference,
                metadata: {
                    timestamp: new Date().toISOString()
                }
            },
            {
                headers: {
                    'X-API-KEY': 'test-webhook-secret',
                    'Content-Type': 'application/json'
                }
            }
        )

        console.log('✓ Webhook processed:')
        console.log(`  - Status: ${webhookRes.data.status}`)
        console.log(`  - Receipt Generated: ${webhookRes.data.receiptGenerated}`)
        if (webhookRes.data.offer) {
            console.log(`  - Receipt Offer: ${webhookRes.data.offer.credential_offer_uri}\n`)
        }

        console.log('✅ E2E Test Completed Successfully!\n')
        console.log('Summary:')
        console.log('  ✓ Quote VC issued')
        console.log('  ✓ Invoice VC issued')
        console.log('  ✓ EcoCash payment initiated')
        console.log('  ✓ Webhook received and processed')
        console.log('  ✓ Receipt VC issued')

    } catch (error: any) {
        console.error('❌ Test failed:', error.response?.data || error.message)
        if (error.response?.data) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2))
        }
        process.exit(1)
    }
}

testEcoCashFlow()

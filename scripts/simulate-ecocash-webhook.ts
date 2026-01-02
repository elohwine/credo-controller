/**
 * Simulation script for EcoCash Webhook
 * Run with: npx ts-node scripts/simulate-ecocash-webhook.ts
 */

import axios from 'axios'

const API_KEY = 'test-webhook-secret'
const BASE_URL = 'http://localhost:3000'

async function simulateWebhook() {
    console.log('Simulating EcoCash Webhook call...')

    const payload = {
        paymentRequestId: 'pay-' + Math.random().toString(36).substring(7),
        status: 'SUCCESS',
        transactionId: 'txn-' + Math.random().toString(36).substring(7).toUpperCase(),
        amount: 25.00,
        currency: 'USD',
        sourceReference: '263774222475',
        metadata: {
            timestamp: new Date().toISOString(),
            customerName: 'John Doe'
        }
    }

    try {
        const response = await axios.post(`${BASE_URL}/webhooks/ecocash`, payload, {
            headers: {
                'X-API-KEY': API_KEY,
                'Content-Type': 'application/json'
            }
        })

        console.log('Webhook Response:', JSON.stringify(response.data, null, 2))

        if (response.data.receiptGenerated) {
            console.log('\n✅ Success! Receipt VC Offer created.')
            console.log('Offer URI:', response.data.offer.credential_offer_uri)
            console.log('Deeplink:', response.data.offer.credential_offer_deeplink)
        } else {
            console.log('\n❌ Webhook acknowledged but receipt not generated.')
        }
    } catch (error: any) {
        console.error('\n❌ Webhook Call Failed')
        if (error.response) {
            console.error('Status:', error.response.status)
            console.error('Data:', JSON.stringify(error.response.data, null, 2))
        } else {
            console.error('Error:', error.message)
        }
    }
}

simulateWebhook().catch(console.error)

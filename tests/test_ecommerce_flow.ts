import axios from 'axios'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000'
const API_KEY = 'test-api-key-12345'

async function testEcommerceFlow() {
    console.log('\n=== TEST: E-Commerce Issuance Flow ===')
    try {
        // 1. Get Root Token
        const rootTokResp = await axios.post(`${BASE_URL}/agent/token`, {}, { headers: { Authorization: API_KEY } })
        const rootToken = rootTokResp.data.token
        const rootAuth = { Authorization: `Bearer ${rootToken}` }

        // 2. Create a test user/tenant or find the e-commerce one
        // For simplicity, let's create a fresh tenant for this test
        const username = `merchant_${randomUUID().substring(0, 8)}`
        const tenantResp = await axios.post(
            `${BASE_URL}/multi-tenancy/create-tenant`,
            { baseUrl: BASE_URL, displayName: `Merchant ${username}`, config: { label: username, tenantType: 'ORG' } },
            { headers: rootAuth },
        )
        const tenantId = tenantResp.data.tenantId
        const tenantToken = tenantResp.data.token
        const auth = { Authorization: `Bearer ${tenantToken}` }
        console.log(`✓ Tenant created: ${tenantId}`)

        // 3. Issue CartSnapshot
        console.log('3. Issuing CartSnapshotVC...')
        const cartId = `CART-${randomUUID().substring(0, 8)}`
        const snapshotResp = await axios.post(`${BASE_URL}/api/finance/cart/${cartId}/issue-snapshot`, {
            cartId,
            items: [
                { id: 'item-1', name: 'MacBook Pro', price: 1999, quantity: 1 },
                { id: 'item-2', name: 'Magic Mouse', price: 79, quantity: 1 }
            ],
            totalAmount: 2078,
            currency: 'USD'
        }, { headers: auth })

        console.log('✓ Offer created for CartSnapshotVC')
        console.log('Offer URI:', snapshotResp.data.credential_offer_uri)

        // 4. Issue Invoice
        console.log('4. Issuing InvoiceVC...')
        const invoiceResp = await axios.post(`${BASE_URL}/api/finance/invoices/issue`, {
            cartRef: cartId,
            amount: 2078,
            currency: 'USD'
        }, { headers: auth })

        console.log('✓ Offer created for InvoiceVC')
        console.log('Offer URI:', invoiceResp.data.credential_offer_uri)

        console.log('\n=== Test Complete ===')
        console.log('You can now use these URIs in the Wallet to accept the credentials.')

    } catch (error: any) {
        console.error('✗ Test failed:', error.message)
        if (error.response) {
            console.error('  Status:', error.response.status)
            console.error('  Data:', JSON.stringify(error.response.data, null, 2))
        }
    }
}

testEcommerceFlow()

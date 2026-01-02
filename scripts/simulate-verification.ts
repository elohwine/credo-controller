/**
 * Simulation script for OIDC4VP Verification flow
 * Run with: npx ts-node scripts/simulate-verification.ts
 */

import axios from 'axios'

const API_KEY = 'test-api-key-12345'
const BASE_URL = 'http://localhost:3000'

async function simulateVerification() {
    console.log('--- OIDC4VP Verification Simulation ---')

    try {
        // 1. Get Root Token
        console.log('1. Fetching root agent token...')
        const rootTokResp = await axios.post(`${BASE_URL}/agent/token`, {}, {
            headers: { 'x-api-key': API_KEY }
        })
        const rootToken = rootTokResp.data.token
        console.log('✓ Root token obtained')

        // 2. List tenants to find a valid one
        console.log('2. Listing tenants to find a valid one...')
        const tenantsResp = await axios.get(`${BASE_URL}/multi-tenancy`, {
            headers: { 'Authorization': `Bearer ${rootToken}` }
        })
        const tenants = tenantsResp.data

        if (!tenants || tenants.length === 0) {
            throw new Error('No tenants found. Please run seed-ecommerce-models.ts first.')
        }

        // Find the first tenant that has persistence metadata (and thus a verifier DID)
        const tenant = tenants.find((t: any) => t.persistence && t.persistence.verifierDid) || tenants[0]
        const tenantId = tenant.id
        console.log(`✓ Using tenant: ${tenant.label} (${tenantId})`)

        // Use verifier KID (full DID URL) from persistence if available, otherwise fall back to DID
        let verifierDid = tenant.persistence?.verifierKid || tenant.persistence?.verifierDid

        if (!verifierDid) {
            console.log(`3. Fetching verifier metadata for tenant ${tenantId}...`)
            const metaResp = await axios.get(`${BASE_URL}/multi-tenancy/${tenantId}/metadata/verifier`, {
                headers: { 'Authorization': `Bearer ${rootToken}` }
            })
            // OpenID4VP Verifier metadata uses 'issuer' for the DID
            verifierDid = metaResp.data.issuer || metaResp.data.did
        }

        if (!verifierDid) {
            throw new Error(`Could not find verifier DID for tenant ${tenantId}`)
        }
        console.log(`✓ Verifier DID: ${verifierDid}`)

        // 4. Get Tenant Token
        console.log('4. Fetching tenant token...')
        const tokenResp = await axios.post(`${BASE_URL}/multi-tenancy/get-token/${tenantId}`, {}, {
            headers: { 'Authorization': `Bearer ${rootToken}` }
        })
        const tenantToken = tokenResp.data.token
        const auth = { 'Authorization': `Bearer ${tenantToken}` }
        console.log('✓ Tenant token obtained')

        // 5. Create Presentation Request using TENANT token
        console.log('\n5. Creating Presentation Request for ReceiptVC using tenant token...')
        const presentationDefinition = {
            id: 'receipt-verification',
            input_descriptors: [
                {
                    id: 'receipt_descriptor',
                    name: 'EcoCash Receipt',
                    purpose: 'Verify payment for services',
                    constraints: {
                        fields: [
                            {
                                path: ['$.type'],
                                filter: {
                                    type: 'array',
                                    contains: { const: 'ReceiptVC' }
                                }
                            }
                        ]
                    }
                }
            ]
        }

        const requestResp = await axios.post(`${BASE_URL}/oidc/verifier/presentation-requests`, {
            verifierDid,
            presentationDefinition
        }, { headers: auth })

        console.log('✓ Presentation Request Created!')
        console.log('Request ID:', requestResp.data.requestId)
        console.log('Request URL:', requestResp.data.presentation_request_url)

        console.log('\n--- Simulation Summary ---')
        console.log('The "Request URL" above would be encoded as a QR code for a wallet to scan.')
        console.log('The wallet would then POST the Verifiable Presentation back to our server.')
        console.log('Finally, the verifier would call /oidc/verifier/verify with the requestId to complete the process.')

    } catch (error: any) {
        console.error('\n❌ Verification Simulation Failed')
        if (error.response) {
            console.error('Status:', error.response.status)
            console.error('Data:', JSON.stringify(error.response.data, null, 2))
        } else {
            console.error('Error:', error.message)
        }
    }
}

simulateVerification().catch(console.error)

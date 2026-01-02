#!/usr/bin/env ts-node
import axios from 'axios'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const args = yargs(hideBin(process.argv))
    .option('backend', { type: 'string', default: 'http://localhost:3000' })
    .option('apiKey', { type: 'string', demandOption: true })
    .option('tenantLabel', { type: 'string', default: 'IdenEx E-Commerce Tenant' })
    .parseSync()

const BACKEND = args.backend.replace(/\/$/, '')
const API_KEY = args.apiKey
const TENANT_LABEL = args.tenantLabel

async function main() {
    console.log(`Seeding E-Commerce VC models against: ${BACKEND}`)

    // 1. Root token
    const rootTokResp = await axios.post(`${BACKEND}/agent/token`, {}, { headers: { Authorization: API_KEY } })
    const rootToken = rootTokResp.data.token
    const rootAuth = { Authorization: `Bearer ${rootToken}` }

    // 2. Create/Get Tenant
    let tenantId: string
    let tenantToken: string
    let issuerDid: string

    try {
        const tenantResp = await axios.post(
            `${BACKEND}/multi-tenancy/create-tenant`,
            { baseUrl: BACKEND, displayName: TENANT_LABEL, config: { label: TENANT_LABEL, tenantType: 'ORG' } },
            { headers: rootAuth },
        )
        tenantId = tenantResp.data.tenantId || tenantResp.data.id
        tenantToken = tenantResp.data.token
        issuerDid = tenantResp.data.issuerDid
        console.log(`✓ Tenant created: ${tenantId}`)
    } catch (e: any) {
        if (e.response?.status === 409) {
            console.log(`! Tenant already exists, fetching existing...`)
            // Logic to find existing tenant by label would go here, 
            // but for seeding we assume a fresh start or we use the existing one if we can.
            // For now, let's assume we can use the root token to list and find.
            const listResp = await axios.get(`${BACKEND}/multi-tenancy`, { headers: rootAuth })
            const existing = listResp.data.find((t: any) => t.config?.label === TENANT_LABEL)
            if (!existing) throw new Error('Could not find existing tenant')
            tenantId = existing.id
            // We need a token for the tenant
            const tokenResp = await axios.post(`${BACKEND}/agent/token`, { tenantId }, { headers: { Authorization: API_KEY } })
            tenantToken = tokenResp.data.token
            issuerDid = existing.metadata?.issuerDid || existing.id // fallback
            console.log(`✓ Using existing tenant: ${tenantId}`)
        } else throw e
    }

    const auth = { Authorization: `Bearer ${tenantToken}` }

    // 3. Register Schemas (JSON-LD context style)
    const schemas = [
        {
            name: 'CartSnapshotVC',
            version: '1.0.0',
            jsonSchema: {
                $id: 'CartSnapshotVC-1.0.0',
                type: 'object',
                required: ['credentialSubject'],
                properties: {
                    credentialSubject: {
                        type: 'object',
                        required: ['cartId', 'items', 'totalAmount'],
                        properties: {
                            cartId: { type: 'string' },
                            items: { type: 'array', items: { type: 'object' } },
                            totalAmount: { type: 'number' },
                            currency: { type: 'string' },
                            merchantDid: { type: 'string' }
                        }
                    }
                }
            }
        },
        {
            name: 'InvoiceVC',
            version: '1.0.0',
            jsonSchema: {
                $id: 'InvoiceVC-1.0.0',
                type: 'object',
                required: ['credentialSubject'],
                properties: {
                    credentialSubject: {
                        type: 'object',
                        required: ['invoiceId', 'cartRef', 'amount', 'dueDate'],
                        properties: {
                            invoiceId: { type: 'string' },
                            cartRef: { type: 'string' }, // cartId or CartSnapshotVC hash
                            amount: { type: 'number' },
                            currency: { type: 'string' },
                            dueDate: { type: 'string', format: 'date-time' }
                        }
                    }
                }
            }
        },
        {
            name: 'ReceiptVC',
            version: '1.0.0',
            jsonSchema: {
                $id: 'ReceiptVC-1.0.0',
                type: 'object',
                required: ['credentialSubject'],
                properties: {
                    credentialSubject: {
                        type: 'object',
                        required: ['receiptId', 'invoiceRef', 'paymentRef', 'timestamp'],
                        properties: {
                            receiptId: { type: 'string' },
                            invoiceRef: { type: 'string' },
                            paymentRef: { type: 'string' }, // EcoCash TX ID
                            timestamp: { type: 'string', format: 'date-time' }
                        }
                    }
                }
            }
        },
        {
            name: 'QuoteVC',
            version: '1.0.0',
            jsonSchema: {
                $id: 'QuoteVC-1.0.0',
                type: 'object',
                required: ['credentialSubject'],
                properties: {
                    credentialSubject: {
                        type: 'object',
                        required: ['quoteId', 'items', 'grandTotal'],
                        properties: {
                            quoteId: { type: 'string' },
                            items: { type: 'array', items: { type: 'object' } },
                            grandTotal: { type: 'number' },
                            currency: { type: 'string' },
                            buyerDid: { type: 'string' }
                        }
                    }
                }
            }
        }
    ]

    for (const s of schemas) {
        try {
            await axios.post(`${BACKEND}/oidc/schemas`, s, { headers: auth })
            console.log(`✓ Schema registered: ${s.name}`)
        } catch (e: any) {
            if (e.response?.status === 409) console.log(`- Schema ${s.name} exists`)
            else console.error(`✗ Failed to register ${s.name}:`, e.response?.data || e.message)
        }
    }

    // 4. Register Credential Definitions
    const defs = [
        { name: 'CartSnapshotVC', type: ['VerifiableCredential', 'CartSnapshotVC'], schema: 'CartSnapshotVC' },
        { name: 'InvoiceVC', type: ['VerifiableCredential', 'InvoiceVC'], schema: 'InvoiceVC' },
        { name: 'ReceiptVC', type: ['VerifiableCredential', 'ReceiptVC'], schema: 'ReceiptVC' },
        { name: 'QuoteVC', type: ['VerifiableCredential', 'QuoteVC'], schema: 'QuoteVC' }
    ]

    for (const d of defs) {
        try {
            // Get schemaId
            const schemasResp = await axios.get(`${BACKEND}/oidc/schemas`, { headers: auth })
            const schema = schemasResp.data.find((s: any) => s.name === d.schema)

            await axios.post(`${BACKEND}/oidc/credential-definitions`, {
                name: d.name,
                version: '1.0.0',
                schemaId: schema.schemaId,
                issuerDid,
                credentialType: d.type,
                format: 'jwt_vc_json'
            }, { headers: auth })
            console.log(`✓ CredDef registered: ${d.name}`)
        } catch (e: any) {
            if (e.response?.status === 409) console.log(`- CredDef ${d.name} exists`)
            else console.error(`✗ Failed to register ${d.name}:`, e.response?.data || e.message)
        }
    }

    console.log('\n=== Seeding Complete ===')
}

main().catch(e => console.error(e))

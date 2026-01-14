import { Controller, Post, Get, Route, Tags, Body, Path, Request, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { container } from 'tsyringe'
import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { SCOPES } from '../../enums'
import { inventoryService } from '../../services/InventoryService'

interface CartItem {
    id: string
    name: string
    price: number
    quantity: number
}

interface CartSnapshotRequest {
    cartId: string
    items: CartItem[]
    totalAmount: number
    currency: string
    merchantDid?: string
}

interface InvoiceRequest {
    cartRef: string
    amount: number
    currency: string
    dueDate?: string
}

@Route('api/finance')
@Tags('Finance & E-Commerce')
export class FinanceController extends Controller {

    /**
     * Issue a CartSnapshotVC for the current shopping cart.
     * This provides a verifiable record of what the user intends to purchase.
     */
    @Post('cart/{cartId}/issue-snapshot')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async issueCartSnapshot(
        @Path() cartId: string,
        @Body() body: CartSnapshotRequest,
        @Request() request: ExRequest
    ): Promise<any> {
        const agent = container.resolve(Agent)
        const tenantAgent = request.agent as any
        const tenantId = (request as any).user?.tenantId

        // In Phase 1, we use the custom-oidc issuer flow
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'

        try {
            // Use x-api-key header for API key authentication (issuer expects this)
            const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
            const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    credentials: [
                        {
                            credentialDefinitionId: 'CartSnapshotVC',
                            format: 'jwt_vc_json',
                            type: ['VerifiableCredential', 'CartSnapshotVC'],
                            claims: {
                                cartId: body.cartId,
                                items: body.items,
                                totalAmount: body.totalAmount,
                                currency: body.currency,
                                merchantDid: body.merchantDid || 'did:example:merchant',
                                timestamp: new Date().toISOString()
                            }
                        }
                    ]
                })
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Failed to create offer: ${error}`)
            }

            return await response.json()
        } catch (error: any) {
            this.setStatus(500)
            return { error: error.message }
        }
    }

    /**
     * Issue an InvoiceVC based on a cart reference.
     */
    @Post('invoices/issue')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async issueInvoice(
        @Body() body: InvoiceRequest,
        @Request() request: ExRequest
    ): Promise<any> {
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
        const invoiceId = `INV-${randomUUID().substring(0, 8)}`

        try {
            // Use x-api-key header for API key authentication (issuer expects this)
            const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
            const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    credentials: [
                        {
                            credentialDefinitionId: 'InvoiceVC',
                            format: 'jwt_vc_json',
                            type: ['VerifiableCredential', 'InvoiceVC'],
                            claims: {
                                invoiceId,
                                cartRef: body.cartRef,
                                amount: body.amount,
                                currency: body.currency,
                                dueDate: body.dueDate || new Date(Date.now() + 86400000).toISOString(),
                                timestamp: new Date().toISOString()
                            }
                        }
                    ]
                })
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Failed to create offer: ${error}`)
            }

            return await response.json()
        } catch (error: any) {
            this.setStatus(500)
            return { error: error.message }
        }
    }

    /**
     * Issue a ReceiptVC after payment is confirmed.
     */
    @Post('receipts/issue')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async issueReceipt(
        @Body() body: { invoiceRef: string, cartId?: string, amount: number, currency: string, transactionId: string },
        @Request() request: ExRequest
    ): Promise<any> {
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
        const tenantId = (request as any).user?.tenantId || 'default'
        const receiptId = `RCP-${randomUUID().substring(0, 8)}`
        let inventoryAllocations: any[] = []

        try {
            // Phase 7C: Fulfill inventory
            try {
                const cartIdToUse = body.cartId || body.invoiceRef
                const result = await inventoryService.fulfillSale({
                    tenantId,
                    cartId: cartIdToUse,
                    receiptId: receiptId,
                    actorId: 'finance-controller'
                })
                
                if (result && result.events) {
                    inventoryAllocations = await Promise.all(result.events.map(async (e) => {
                        const lot = e.lotId ? await inventoryService.getLot(e.lotId) : null
                        return {
                            itemId: e.catalogItemId,
                            lotNumber: lot?.lotNumber,
                            serialNumber: lot?.serialNumber,
                            quantity: Math.abs(e.quantity)
                        }
                    }))
                }
            } catch (e: any) {
                console.warn(`[Finance] Inventory fulfillment failed: ${e.message}`)
            }

            // Use x-api-key header for API key authentication (issuer expects this)
            const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
            const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    credentials: [
                        {
                            credentialDefinitionId: 'ReceiptVC',
                            format: 'jwt_vc_json',
                            type: ['VerifiableCredential', 'ReceiptVC'],
                            claims: {
                                receiptId,
                                invoiceRef: body.invoiceRef,
                                amount: body.amount,
                                currency: body.currency,
                                transactionId: body.transactionId,
                                timestamp: new Date().toISOString(),
                                inventoryAllocations: inventoryAllocations.length > 0 ? inventoryAllocations : undefined
                            }
                        }
                    ]
                })
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Failed to create offer: ${error}`)
            }

            return await response.json()
        } catch (error: any) {
            this.setStatus(500)
            return { error: error.message }
        }
    }
}

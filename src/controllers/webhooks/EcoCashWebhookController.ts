import { Controller, Post, Route, Tags, Body, Request, Security, Header } from 'tsoa'
import { Request as ExRequest } from 'express'
import { workflowService } from '../../services/WorkflowService'
import { triggerService } from '../../services/TriggerService'
import { rootLogger } from '../../utils/pinoLogger'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import axios from 'axios'

const logger = rootLogger.child({ module: 'EcoCashWebhookController' })

interface EcoCashWebhookPayload {
    paymentRequestId?: string
    status: string
    transactionId?: string
    amount?: number
    currency?: string
    sourceReference?: string
    metadata?: any
}

@Route('webhooks')
@Tags('Webhooks')
export class EcoCashWebhookController extends Controller {
    /**
     * EcoCash webhook endpoint for payment status updates
     * This endpoint is called by EcoCash when payment status changes
     * 
     * Flow on SUCCESS:
     * 1. Validate idempotency via sourceReference
     * 2. Update ack_payments record state to 'paid'
     * 3. Issue ReceiptVC (PaymentReceiptCredential)
     * 4. Send receipt to WhatsApp via WhatsAppPayloadController
     * 5. Update cart status to 'paid'
     */
    @Post('ecocash')
    public async handleEcoCashWebhook(
        @Body() payload: EcoCashWebhookPayload,
        @Header('X-API-KEY') apiKey?: string,
        @Request() request?: ExRequest
    ): Promise<any> {
        const db = DatabaseManager.getDatabase()

        try {
            logger.info({ payload }, 'Received EcoCash webhook')

            // Validate API key (simple validation - in production use HMAC)
            const expectedApiKey = process.env.ECOCASH_WEBHOOK_SECRET || 'test-webhook-secret'
            if (apiKey !== expectedApiKey) {
                logger.warn({ providedKey: apiKey }, 'Invalid webhook API key')
                this.setStatus(401)
                return { error: 'Unauthorized' }
            }

            // Idempotency check: Look up payment by sourceReference
            const existingPayment = db.prepare(`
                SELECT * FROM ack_payments WHERE idempotency_key = ? OR payment_request_token = ?
            `).get(payload.sourceReference, payload.sourceReference) as any

            if (existingPayment && existingPayment.state === 'paid') {
                logger.info({ sourceReference: payload.sourceReference }, 'Payment already processed (idempotency check)')
                return {
                    status: 'acknowledged',
                    receiptGenerated: false,
                    reason: 'Payment already processed'
                }
            }

            // Check if payment was successful
            if (payload.status === 'SUCCESS' || payload.status === 'COMPLETED') {
                logger.info({ sourceReference: payload.sourceReference }, 'Payment successful, processing receipt')

                const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
                const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
                const baseUrl = process.env.NGROK_URL || 'http://localhost:3000'
                // Use default tenant for issuer metadata refresh
                const tenantId = existingPayment?.tenant_id || 'default'

                // Get cart if we have a payment record
                let cartId: string | undefined
                let cart: any
                if (existingPayment?.cart_id) {
                    cartId = existingPayment.cart_id
                    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId)
                }

                // Issue PaymentReceipt (ReceiptVC) - uses modelRegistry registered type
                try {
                    const receiptResponse = await axios.post(
                        `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
                        {
                            credentials: [{
                                // Use PaymentReceipt which is registered in modelRegistry
                                credentialDefinitionId: 'PaymentReceipt',
                                format: 'jwt_vc_json',
                                type: ['VerifiableCredential', 'PaymentReceipt'],
                                claims: {
                                    transactionId: payload.transactionId,
                                    amount: String(payload.amount || existingPayment?.amount || '0'),
                                    currency: payload.currency || existingPayment?.currency || 'USD',
                                    merchant: existingPayment?.tenant_id || 'unknown',
                                }
                            }]
                        },
                        {
                            headers: {
                                'x-api-key': apiKey,
                                'x-tenant-id': tenantId,
                                'Content-Type': 'application/json'
                            }
                        }
                    )

                    const receiptOfferUrl = receiptResponse.data?.offerUrl || receiptResponse.data?.credentialOffer

                    logger.info({ receiptOfferUrl, transactionId: payload.transactionId }, 'ReceiptVC issued')

                    // Update payment record state
                    if (existingPayment) {
                        db.prepare(`
                            UPDATE ack_payments 
                            SET state = 'paid', provider_ref = ?, updated_at = ?
                            WHERE id = ?
                        `).run(payload.transactionId, new Date().toISOString(), existingPayment.id)

                        // Store receipt in ack_payment_receipts
                        db.prepare(`
                            INSERT INTO ack_payment_receipts (id, payment_id, credential_offer_url, credential_type, issued_at)
                            VALUES (?, ?, ?, ?, ?)
                        `).run(
                            `rcp-${Date.now()}`,
                            existingPayment.id,
                            receiptOfferUrl,
                            'PaymentReceiptCredential',
                            new Date().toISOString()
                        )
                    }

                    // Send receipt to WhatsApp if we have a cart with buyer phone
                    if (cartId && receiptOfferUrl) {
                        try {
                            await axios.post(
                                `${baseUrl}/api/wa/cart/${cartId}/send-receipt`,
                                {
                                    receiptOfferUrl,
                                    transactionId: payload.transactionId
                                },
                                { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
                            )
                            logger.info({ cartId }, 'Receipt sent to WhatsApp')
                        } catch (waErr: any) {
                            logger.warn({ error: waErr.message }, 'Failed to send receipt to WhatsApp')
                        }
                    }

                    // Also execute the workflow for any additional actions
                    try {
                        await workflowService.executeWorkflow(
                            'finance-receipt-v1',
                            {
                                transactionId: payload.transactionId,
                                amount: payload.amount,
                                currency: payload.currency || 'USD',
                                sourceReference: payload.sourceReference,
                                paymentRequestId: payload.paymentRequestId,
                                cartId: cartId,
                                receiptOfferUrl,
                                metadata: payload.metadata
                            },
                            'default'
                        )
                    } catch (workflowErr: any) {
                        logger.warn({ error: workflowErr.message }, 'Workflow execution failed (non-critical)')
                    }

                    // Emit payment.completed event to trigger any listening workflows
                    try {
                        await triggerService.emitEvent('payment.completed', {
                            transactionId: payload.transactionId,
                            amount: payload.amount,
                            currency: payload.currency || 'USD',
                            sourceReference: payload.sourceReference,
                            paymentMethod: 'EcoCash',
                            cartId: cartId,
                            merchantId: existingPayment?.tenant_id,
                            receiptOfferUrl,
                            timestamp: new Date().toISOString()
                        }, 'ecocash-webhook')
                    } catch (eventErr: any) {
                        logger.warn({ error: eventErr.message }, 'Event emission failed (non-critical)')
                    }

                    return {
                        status: 'acknowledged',
                        receiptGenerated: true,
                        receiptOfferUrl,
                        transactionId: payload.transactionId
                    }
                } catch (receiptError: any) {
                    logger.error({ error: receiptError.message }, 'Failed to issue ReceiptVC')
                    // Still acknowledge the webhook to prevent retries
                    return {
                        status: 'acknowledged',
                        receiptGenerated: false,
                        error: receiptError.message
                    }
                }
            } else if (payload.status === 'FAILED' || payload.status === 'CANCELLED') {
                // Update payment record to failed state
                if (existingPayment) {
                    db.prepare(`
                        UPDATE ack_payments 
                        SET state = 'failed', updated_at = ?
                        WHERE id = ?
                    `).run(new Date().toISOString(), existingPayment.id)
                }

                logger.info({ status: payload.status }, 'Payment failed/cancelled')
                return {
                    status: 'acknowledged',
                    receiptGenerated: false,
                    reason: `Payment status is ${payload.status}`
                }
            } else {
                logger.info({ status: payload.status }, 'Payment pending, no action taken')
                return {
                    status: 'acknowledged',
                    receiptGenerated: false,
                    reason: `Payment status is ${payload.status}`
                }
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Webhook processing error')
            this.setStatus(500)
            return { error: error.message }
        }
    }
}


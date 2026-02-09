import { Controller, Get, Post, Body, Route, Tags, Query, Path, Security } from 'tsoa'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'PaymentController' })

interface PaymentRecord {
    id: string
    tenantId: string
    cartId: string
    paymentRequestToken: string
    providerRef: string
    payerPhone: string
    amount: number
    currency: string
    state: string
    idempotencyKey: string
    createdAt: string
    updatedAt: string
}

interface ReceiptRecord {
    id: string
    paymentId: string
    credentialOfferUrl: string
    credentialType: string
    issuedAt: string
}

interface PaymentLookupResult {
    found: boolean
    payment?: PaymentRecord
    receipt?: ReceiptRecord
    error?: string
}

interface ReceiptVerificationResult {
    verified: boolean
    receipt?: {
        receiptId: string
        transactionId: string
        amount: number
        currency: string
        payerPhone: string
        merchantId: string
        cartId: string
        items: any[]
        paymentMethod: string
        timestamp: string
    }
    error?: string
}

@Route('api/payments')
@Tags('Payments')
export class PaymentController extends Controller {
    /**
     * Look up a payment by reference (sourceReference, transactionId, or idempotency key)
     */
    @Get('lookup')
    public async lookupPayment(
        @Query() ref: string
    ): Promise<PaymentLookupResult> {
        const db = DatabaseManager.getDatabase()

        try {
            // Search by multiple reference types
            const payment = db.prepare(`
                SELECT * FROM ack_payments 
                WHERE payment_request_token = ? 
                   OR provider_ref = ? 
                   OR idempotency_key = ?
                LIMIT 1
            `).get(ref, ref, ref) as any

            if (!payment) {
                return { found: false, error: 'Payment not found' }
            }

            // Look up associated receipt
            const receipt = db.prepare(`
                SELECT * FROM ack_payment_receipts WHERE payment_id = ?
            `).get(payment.id) as any

            return {
                found: true,
                payment: {
                    id: payment.id,
                    tenantId: payment.tenant_id,
                    cartId: payment.cart_id,
                    paymentRequestToken: payment.payment_request_token,
                    providerRef: payment.provider_ref,
                    payerPhone: payment.payer_phone,
                    amount: payment.amount,
                    currency: payment.currency,
                    state: payment.state,
                    idempotencyKey: payment.idempotency_key,
                    createdAt: payment.created_at,
                    updatedAt: payment.updated_at
                },
                receipt: receipt ? {
                    id: receipt.id,
                    paymentId: receipt.payment_id,
                    credentialOfferUrl: receipt.credential_offer_url,
                    credentialType: receipt.credential_type,
                    issuedAt: receipt.issued_at
                } : undefined
            }
        } catch (error: any) {
            logger.error({ error: error.message, ref }, 'Payment lookup failed')
            this.setStatus(500)
            return { found: false, error: error.message }
        }
    }

    /**
     * Get payment by ID
     */
    @Get('{paymentId}')
    public async getPaymentById(
        @Path() paymentId: string
    ): Promise<PaymentLookupResult> {
        const db = DatabaseManager.getDatabase()

        try {
            const payment = db.prepare('SELECT * FROM ack_payments WHERE id = ?').get(paymentId) as any

            if (!payment) {
                this.setStatus(404)
                return { found: false, error: 'Payment not found' }
            }

            const receipt = db.prepare('SELECT * FROM ack_payment_receipts WHERE payment_id = ?').get(paymentId) as any

            return {
                found: true,
                payment: {
                    id: payment.id,
                    tenantId: payment.tenant_id,
                    cartId: payment.cart_id,
                    paymentRequestToken: payment.payment_request_token,
                    providerRef: payment.provider_ref,
                    payerPhone: payment.payer_phone,
                    amount: payment.amount,
                    currency: payment.currency,
                    state: payment.state,
                    idempotencyKey: payment.idempotency_key,
                    createdAt: payment.created_at,
                    updatedAt: payment.updated_at
                },
                receipt: receipt ? {
                    id: receipt.id,
                    paymentId: receipt.payment_id,
                    credentialOfferUrl: receipt.credential_offer_url,
                    credentialType: receipt.credential_type,
                    issuedAt: receipt.issued_at
                } : undefined
            }
        } catch (error: any) {
            logger.error({ error: error.message, paymentId }, 'Get payment by ID failed')
            this.setStatus(500)
            return { found: false, error: error.message }
        }
    }

    /**
     * List all payments with optional filters
     */
    @Get('')
    public async listPayments(
        @Query() state?: string,
        @Query() tenantId?: string,
        @Query() limit?: number
    ): Promise<{ payments: PaymentRecord[] }> {
        const db = DatabaseManager.getDatabase()

        let query = 'SELECT * FROM ack_payments WHERE 1=1'
        const params: any[] = []

        if (state) {
            query += ' AND state = ?'
            params.push(state)
        }
        if (tenantId) {
            query += ' AND tenant_id = ?'
            params.push(tenantId)
        }

        query += ' ORDER BY created_at DESC LIMIT ?'
        params.push(limit || 100)

        const payments = db.prepare(query).all(...params) as any[]

        return {
            payments: payments.map(p => ({
                id: p.id,
                tenantId: p.tenant_id,
                cartId: p.cart_id,
                paymentRequestToken: p.payment_request_token,
                providerRef: p.provider_ref,
                payerPhone: p.payer_phone,
                amount: p.amount,
                currency: p.currency,
                state: p.state,
                idempotencyKey: p.idempotency_key,
                createdAt: p.created_at,
                updatedAt: p.updated_at
            }))
        }
    }
}

@Route('api/receipts')
@Tags('Receipts')
export class ReceiptController extends Controller {
    /**
     * Verify a receipt by transaction ID
     * Used by delivery agents to confirm payment before releasing goods
     */
    @Get('verify/{transactionId}')
    public async verifyReceipt(
        @Path() transactionId: string
    ): Promise<ReceiptVerificationResult> {
        const db = DatabaseManager.getDatabase()

        try {
            // Look up payment by transaction ID (provider_ref) or source reference
            const payment = db.prepare(`
                SELECT p.*, c.items as cart_items, c.total as cart_total, c.currency as cart_currency
                FROM ack_payments p
                LEFT JOIN carts c ON p.cart_id = c.id
                WHERE p.provider_ref = ? 
                   OR p.payment_request_token = ?
                   OR p.idempotency_key = ?
            `).get(transactionId, transactionId, transactionId) as any

            if (!payment) {
                return { verified: false, error: 'Transaction not found' }
            }

            if (payment.state !== 'paid') {
                return { 
                    verified: false, 
                    error: `Payment is ${payment.state}, not confirmed` 
                }
            }

            // Parse cart items if available
            let items: any[] = []
            try {
                items = payment.cart_items ? JSON.parse(payment.cart_items) : []
            } catch (e) {
                // Ignore parse errors
            }

            return {
                verified: true,
                receipt: {
                    receiptId: `RCP-${payment.provider_ref || payment.id}`,
                    transactionId: payment.provider_ref || payment.payment_request_token,
                    amount: payment.amount || payment.cart_total,
                    currency: payment.currency || payment.cart_currency || 'USD',
                    payerPhone: payment.payer_phone,
                    merchantId: payment.tenant_id,
                    cartId: payment.cart_id,
                    items: items,
                    paymentMethod: 'EcoCash',
                    timestamp: payment.updated_at
                }
            }
        } catch (error: any) {
            logger.error({ error: error.message, transactionId }, 'Receipt verification failed')
            this.setStatus(500)
            return { verified: false, error: error.message }
        }
    }

    /**
     * List all receipts
     */
    @Get('')
    public async listReceipts(
        @Query() limit?: number
    ): Promise<{ receipts: ReceiptRecord[] }> {
        const db = DatabaseManager.getDatabase()

        const receipts = db.prepare(`
            SELECT * FROM ack_payment_receipts 
            ORDER BY issued_at DESC 
            LIMIT ?
        `).all(limit || 100) as any[]

        return {
            receipts: receipts.map(r => ({
                id: r.id,
                paymentId: r.payment_id,
                credentialOfferUrl: r.credential_offer_url,
                credentialType: r.credential_type,
                issuedAt: r.issued_at
            }))
        }
    }

    /**
     * Confirm delivery of goods associated with a transaction
     * Updates payment/order status to 'delivered' to release escrow
     */
    @Post('confirm-delivery')
    public async confirmDelivery(
        @Body() body: { transactionId: string; allowPending?: boolean }
    ): Promise<{ success: boolean, message: string, newState: string }> {
        const db = DatabaseManager.getDatabase()
        const { transactionId, allowPending } = body

        try {
            // Find payment record
            const payment = db.prepare(`
                SELECT * FROM ack_payments 
                WHERE provider_ref = ? 
                   OR payment_request_token = ?
                   OR idempotency_key = ?
            `).get(transactionId, transactionId, transactionId) as any

            if (!payment) {
                this.setStatus(404)
                return { success: false, message: 'Transaction not found', newState: 'unknown' }
            }

            if (payment.state !== 'paid' && payment.state !== 'delivered') {
                if (allowPending && payment.state === 'pending' && payment.provider_ref) {
                    logger.warn({ transactionId, paymentId: payment.id }, 'Confirming delivery while payment is pending (allowPending=true)')
                } else {
                    this.setStatus(400)
                    return { 
                        success: false, 
                        message: `Cannot confirm delivery. Payment state is '${payment.state}' (must be 'paid')`, 
                        newState: payment.state 
                    }
                }
            }

            if (payment.state === 'delivered') {
                return { 
                    success: true, 
                    message: 'Delivery already confirmed', 
                    newState: 'delivered' 
                }
            }

            // Update state to delivered
            db.prepare(`
                UPDATE ack_payments 
                SET state = 'delivered', updated_at = ? 
                WHERE id = ?
            `).run(new Date().toISOString(), payment.id)

            logger.info({ transactionId, paymentId: payment.id }, 'Delivery confirmed')

            return { 
                success: true, 
                message: 'Delivery confirmed successfully', 
                newState: 'delivered' 
            }
        } catch (error: any) {
            logger.error({ error: error.message, transactionId }, 'Delivery confirmation failed')
            this.setStatus(500)
            return { success: false, message: error.message, newState: 'error' }
        }
    }
}

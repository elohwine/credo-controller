import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { randomUUID, createHash } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { inventoryService } from '../../services/InventoryService'
import { container } from 'tsyringe'
import { SSIAuthService } from '../../services/SSIAuthService'
import axios from 'axios'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'WhatsAppPayloadController' })

/**
 * WhatsApp payload format: wa.me/<number>?text=<encoded>
 * Encoded payload: base64 of JSON { merchantId, itemId, nonce, qty? }
 */
export interface WaPayload {
    merchantId: string
    itemId: string
    nonce?: string
    qty?: number
}

export interface WaCartItem {
    itemId: string
    title: string
    price: number
    quantity: number
}

export interface Cart {
    id: string
    merchantId: string
    buyerPhone?: string
    items: WaCartItem[]
    total: number
    currency: string
    status: 'pending' | 'quoted' | 'invoiced' | 'paid' | 'cancelled'
    createdAt: string
    quoteOfferUrl?: string
    invoiceOfferUrl?: string
    receiptOfferUrl?: string
}

export interface CreateCartRequest {
    /** Base64-encoded wa.me payload OR raw JSON payload */
    payload: string
    /** Buyer's phone number (from WhatsApp) */
    buyerPhone?: string
}

export interface CheckoutResponse {
    cartId: string
    status: string
    quoteOfferUrl?: string
    invoiceOfferUrl?: string
    invoiceOfferId?: string
    ecocashRef?: string
    paymentInstructions?: string
    sandbox?: boolean
    message: string
}

/**
 * WhatsApp Business Cloud API Message Service
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
class WhatsAppMessageService {
    private phoneNumberId: string
    private accessToken: string
    private apiVersion: string = 'v21.0'

    constructor() {
        this.phoneNumberId = process.env.WABA_PHONE_NUMBER_ID || ''
        this.accessToken = process.env.WABA_TOKEN || ''
    }

    get isConfigured(): boolean {
        return !!(this.phoneNumberId && this.accessToken)
    }

    /**
     * Send a text message to a WhatsApp user
     */
    async sendTextMessage(to: string, body: string, previewUrl: boolean = false): Promise<any> {
        if (!this.isConfigured) {
            logger.warn('WhatsApp Business API not configured, skipping message send')
            return { skipped: true, reason: 'not_configured' }
        }

        try {
            const response = await axios.post(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'text',
                    text: {
                        preview_url: previewUrl,
                        body: body
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            )
            logger.info({ to, messageId: response.data?.messages?.[0]?.id }, 'WhatsApp text message sent')
            return response.data
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message, to }, 'Failed to send WhatsApp message')
            throw error
        }
    }

    /**
     * Send an interactive CTA URL button message
     * Perfect for sending credential offer links
     */
    async sendCtaUrlButton(
        to: string,
        headerText: string,
        bodyText: string,
        buttonText: string,
        url: string
    ): Promise<any> {
        if (!this.isConfigured) {
            logger.warn('WhatsApp Business API not configured, skipping message send')
            return { skipped: true, reason: 'not_configured' }
        }

        try {
            const response = await axios.post(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'interactive',
                    interactive: {
                        type: 'cta_url',
                        header: {
                            type: 'text',
                            text: headerText
                        },
                        body: {
                            text: bodyText
                        },
                        action: {
                            name: 'cta_url',
                            parameters: {
                                display_text: buttonText,
                                url: url
                            }
                        }
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            )
            logger.info({ to, messageId: response.data?.messages?.[0]?.id }, 'WhatsApp CTA button sent')
            return response.data
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message, to }, 'Failed to send WhatsApp CTA button')
            throw error
        }
    }

    /**
     * Send interactive reply buttons (up to 3 options)
     * Good for consent/confirmation flows
     */
    async sendReplyButtons(
        to: string,
        bodyText: string,
        buttons: Array<{ id: string, title: string }>,
        headerText?: string
    ): Promise<any> {
        if (!this.isConfigured) {
            logger.warn('WhatsApp Business API not configured, skipping message send')
            return { skipped: true, reason: 'not_configured' }
        }

        try {
            const response = await axios.post(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        ...(headerText ? { header: { type: 'text', text: headerText } } : {}),
                        body: { text: bodyText },
                        action: {
                            buttons: buttons.slice(0, 3).map(b => ({
                                type: 'reply',
                                reply: { id: b.id, title: b.title.substring(0, 20) }
                            }))
                        }
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            )
            logger.info({ to, messageId: response.data?.messages?.[0]?.id }, 'WhatsApp reply buttons sent')
            return response.data
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message, to }, 'Failed to send WhatsApp reply buttons')
            throw error
        }
    }
}

const waMessageService = new WhatsAppMessageService()

@Route('api/wa')
@Tags('WhatsApp Commerce')
export class WhatsAppPayloadController extends Controller {

    /**
     * Parse a wa.me payload and create a shopping cart.
     * The payload is typically base64-encoded JSON from the wa.me link.
     */
    @Post('cart/create')
    public async createCartFromPayload(
        @Body() body: CreateCartRequest
    ): Promise<Cart> {
        const db = DatabaseManager.getDatabase()

        // Decode payload
        let waPayload: WaPayload
        try {
            // Try base64 first
            const decoded = Buffer.from(body.payload, 'base64').toString('utf-8')
            waPayload = JSON.parse(decoded)
        } catch {
            // Try raw JSON
            try {
                waPayload = JSON.parse(body.payload)
            } catch {
                this.setStatus(400)
                throw new Error('Invalid payload format. Expected base64-encoded JSON or raw JSON.')
            }
        }

        // Validate required fields
        if (!waPayload.merchantId || !waPayload.itemId) {
            this.setStatus(400)
            throw new Error('Payload must contain merchantId and itemId')
        }

        // Lookup catalog item
        const item = db.prepare(`
            SELECT * FROM catalog_items WHERE id = ? AND merchant_id = ?
        `).get(waPayload.itemId, waPayload.merchantId) as any

        if (!item) {
            this.setStatus(404)
            throw new Error(`Item ${waPayload.itemId} not found for merchant ${waPayload.merchantId}`)
        }

        // Create cart
        const cartId = `CART-${randomUUID()}`
        const quantity = waPayload.qty || 1
        const cartItems: WaCartItem[] = [{
            itemId: item.id,
            title: item.title,
            price: item.price,
            quantity
        }]
        const total = item.price * quantity
        const timestamp = new Date().toISOString()

        db.prepare(`
            INSERT INTO carts (id, merchant_id, buyer_phone, items, total, currency, status, nonce, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            cartId,
            waPayload.merchantId,
            body.buyerPhone || null,
            JSON.stringify(cartItems),
            total,
            item.currency || 'USD',
            'pending',
            waPayload.nonce || null,
            timestamp,
            timestamp
        )

        // Phase 7C: Auto-reserve inventory
        try {
            // Find default location (warehouse)
            const location = db.prepare(`
                SELECT id FROM inventory_locations 
                WHERE tenant_id = ? AND type = 'warehouse' AND status = 'active' 
                LIMIT 1
            `).get(waPayload.merchantId) as any

            if (location) {
                await inventoryService.reserveStock({
                    tenantId: waPayload.merchantId,
                    cartId: cartId,
                    items: cartItems.map(i => ({
                        catalogItemId: i.itemId,
                        quantity: i.quantity,
                        locationId: location.id
                    })),
                    actorId: 'whatsapp-bot'
                })
                console.log(`[WhatsApp] Reserved stock for cart ${cartId}`)
            } else {
                console.warn(`[WhatsApp] No active warehouse found for tenant ${waPayload.merchantId}, skipping reservation`)
            }
        } catch (err: any) {
            console.error(`[WhatsApp] Failed to reserve stock for cart ${cartId}: ${err.message}`)
            // We don't fail the cart creation, just log the error (soft reservation failure)
        }

        this.setStatus(201)
        return {
            id: cartId,
            merchantId: waPayload.merchantId,
            buyerPhone: body.buyerPhone,
            items: cartItems,
            total,
            currency: item.currency || 'USD',
            status: 'pending',
            createdAt: timestamp
        }
    }

    /**
     * Get cart by ID
     */
    @Get('cart/{cartId}')
    public async getCart(
        @Path() cartId: string
    ): Promise<Cart> {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!row) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        // Fetch receipt offer URL if exists
        const receipt = db.prepare(`
            SELECT r.credential_offer_url 
            FROM ack_payment_receipts r
            JOIN ack_payments p ON r.payment_id = p.id
            WHERE p.cart_id = ?
        `).get(cartId) as any

        return {
            id: row.id,
            merchantId: row.merchant_id,
            buyerPhone: row.buyer_phone,
            items: JSON.parse(row.items || '[]'),
            total: row.total,
            currency: row.currency,
            status: row.status,
            createdAt: row.created_at,
            receiptOfferUrl: receipt?.credential_offer_url
        }
    }

    /**
     * Add item to existing cart
     */
    @Post('cart/{cartId}/items')
    public async addItemToCart(
        @Path() cartId: string,
        @Body() body: { itemId: string, quantity?: number }
    ): Promise<Cart> {
        const db = DatabaseManager.getDatabase()

        const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!cart) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        // Lookup item
        const item = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(body.itemId) as any
        if (!item) {
            this.setStatus(404)
            throw new Error(`Item ${body.itemId} not found`)
        }

        // Update cart items
        const items: WaCartItem[] = JSON.parse(cart.items || '[]')
        const qty = body.quantity || 1
        const existingIdx = items.findIndex(i => i.itemId === body.itemId)

        if (existingIdx >= 0) {
            items[existingIdx].quantity += qty
        } else {
            items.push({
                itemId: item.id,
                title: item.title,
                price: item.price,
                quantity: qty
            })
        }

        const newTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0)

        db.prepare(`
            UPDATE carts SET items = ?, total = ?, updated_at = ? WHERE id = ?
        `).run(JSON.stringify(items), newTotal, new Date().toISOString(), cartId)

        return {
            id: cart.id,
            merchantId: cart.merchant_id,
            buyerPhone: cart.buyer_phone,
            items,
            total: newTotal,
            currency: cart.currency,
            status: cart.status,
            createdAt: cart.created_at
        }
    }

    /**
     * Generate a wa.me link for a catalog item
     */
    @Get('link/{merchantId}/{itemId}')
    public async generateWaLink(
        @Path() merchantId: string,
        @Path() itemId: string,
        @Query() waNumber?: string
    ): Promise<{ link: string, payload: string }> {
        const payload: WaPayload = {
            merchantId,
            itemId,
            nonce: randomUUID().substring(0, 8)
        }

        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
        const number = waNumber || process.env.WABA_NUMBER || '15550001234'

        return {
            link: `https://wa.me/${number}?text=${encodeURIComponent(encoded)}`,
            payload: encoded
        }
    }

    /**
     * Present cart options to WhatsApp user.
     * Shows interactive menu with:
     * - 📄 Save Quote (optional - for wallet users)
     * - 💳 Pay Now (proceed to EcoCash payment)
     * - ❌ Cancel Order
     */
    @Post('cart/{cartId}/present-options')
    public async presentCartOptions(
        @Path() cartId: string
    ): Promise<{ success: boolean, message: string }> {
        const db = DatabaseManager.getDatabase()

        const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!cart) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        if (!cart.buyer_phone) {
            return { success: false, message: 'No buyer phone number on cart' }
        }

        const items = JSON.parse(cart.items || '[]')
        const itemsSummary = items.map((i: WaCartItem) => `• ${i.title} x${i.quantity}`).join('\n')

        try {
            // Send cart summary with options
            await waMessageService.sendReplyButtons(
                cart.buyer_phone,
                `🛒 *Your Order*\n\n` +
                `${itemsSummary}\n\n` +
                `💰 *Total: ${cart.currency} ${cart.total.toFixed(2)}*\n\n` +
                `What would you like to do?`,
                [
                    { id: `quote_${cartId}`, title: '📄 Save Quote' },
                    { id: `pay_${cartId}`, title: '💳 Pay Now' },
                    { id: `cancel_${cartId}`, title: '❌ Cancel' }
                ],
                '📦 Order Summary'
            )

            return { success: true, message: 'Options presented to customer' }
        } catch (error: any) {
            logger.error({ error: error.message, cartId }, 'Failed to present options')
            return { success: false, message: error.message }
        }
    }

    /**
     * Issue a QuoteVC for wallet users (OPTIONAL step).
     * User can save this quote to their wallet before deciding to pay.
     * Does NOT change cart status - user can still proceed to payment.
     */
    @Post('cart/{cartId}/issue-quote')
    public async issueQuoteVC(
        @Path() cartId: string,
        @Body() body: { sendToWhatsApp?: boolean }
    ): Promise<CheckoutResponse> {
        const db = DatabaseManager.getDatabase()

        const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!cart) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        if (!['pending', 'quoted'].includes(cart.status)) {
            this.setStatus(400)
            throw new Error(`Cart is ${cart.status}, quote not applicable`)
        }

        const items = JSON.parse(cart.items || '[]')
        const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'

        // 1. Calculate Cart Hash (Audit Trail)
        const cartHash = createHash('sha256').update(JSON.stringify(items)).digest('hex')
        const quoteId = `QUOTE-${randomUUID().substring(0, 8)}`

        const quoteClaims = {
            quoteId: quoteId,
            cartId: cartId,
            cartHash: cartHash, // Link to Cart
            previousRecordHash: cartHash, // Generic chain link
            merchantId: cart.merchant_id,
            items: items,
            subtotal: cart.total,
            taxAmount: 0,
            discountAmount: 0,
            grandTotal: cart.total,
            currency: cart.currency,
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            timestamp: new Date().toISOString()
        }

        // 2. Calculate Quote Hash
        const quoteHash = createHash('sha256').update(JSON.stringify(quoteClaims)).digest('hex')

        try {
            // Issue QuoteVC via credential offer
            const quoteResponse = await axios.post(
                `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
                {
                    credentials: [{
                        credentialDefinitionId: 'QuoteVC',
                        format: 'jwt_vc_json',
                        type: ['VerifiableCredential', 'QuoteVC'],
                        claims: quoteClaims
                    }]
                },
                { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
            )

            const quoteOfferUrl = quoteResponse.data?.offerUrl || quoteResponse.data?.credentialOffer

            // Mark quote was issued (but don't block payment)
            // Updated to store quoteId and quoteHash for audit trail
            db.prepare(`
                UPDATE carts SET quote_offer_url = ?, quote_id = ?, quote_hash = ?, updated_at = ? WHERE id = ?
            `).run(quoteOfferUrl, quoteId, quoteHash, new Date().toISOString(), cartId)

            // Send WhatsApp message with quote credential
            if (body.sendToWhatsApp && cart.buyer_phone) {
                await waMessageService.sendCtaUrlButton(
                    cart.buyer_phone,
                    '📄 Your Quote',
                    `Quote for ${cart.currency} ${cart.total.toFixed(2)} saved!\n\nTap below to add to your wallet. You can pay anytime within 7 days.`,
                    '💾 Save to Wallet',
                    quoteOfferUrl
                )

                // Follow up with payment option
                await waMessageService.sendReplyButtons(
                    cart.buyer_phone,
                    `Ready to pay now?`,
                    [
                        { id: `pay_${cartId}`, title: '💳 Pay Now' },
                        { id: `later_${cartId}`, title: '⏰ Pay Later' }
                    ]
                )
            }

            return {
                cartId,
                status: cart.status,
                quoteOfferUrl,
                message: 'Quote credential issued. Customer can save to wallet and pay when ready.'
            }
        } catch (error: any) {
            logger.error({ error: error.message, cartId }, 'Failed to issue quote')
            this.setStatus(500)
            throw new Error(`Failed to issue quote: ${error.message}`)
        }
    }

    /**
     * Full checkout flow: Quote → EcoCash Payment → InvoiceVC
     * Initiates EcoCash payment and issues InvoiceVC.
     * 
     * Flow:
     * 1. Validate cart status (must be 'pending' or 'quoted')
     * 2. Call EcoCash API to initiate C2B payment
     * 3. Issue InvoiceVC with payment instructions
     * 4. Send WhatsApp message with payment instructions
     * 5. Wait for EcoCash webhook to trigger ReceiptVC issuance
     */
    @Post('cart/{cartId}/checkout')
    public async checkout(
        @Path() cartId: string,
        @Body() body: {
            customerMsisdn: string  // EcoCash phone number (e.g., 263774222475)
            skipQuote?: boolean     // If true, skip quote step
            sendToWhatsApp?: boolean
            tenantId?: string       // Optional: browser tenant ID for phone linking
        }
    ): Promise<CheckoutResponse> {
        const db = DatabaseManager.getDatabase()

        const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!cart) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        if (!['pending', 'quoted'].includes(cart.status)) {
            this.setStatus(400)
            throw new Error(`Cart is ${cart.status}, cannot checkout`)
        }

        if (body.tenantId && body.customerMsisdn) {
            try {
                const ssiAuthService = container.resolve(SSIAuthService)
                // 1. Check if this phone number is ALREADY REGISTERED to a main account
                // If so, we should use THAT tenant instead of the temp/guest one
                const registeredTenantId = await ssiAuthService.findRegisteredTenantByPhone(body.customerMsisdn)
                
                if (registeredTenantId) {
                   logger.info({ registeredTenantId, guestTenantId: body.tenantId }, 'Redirecting guest checkout to existing registered tenant')
                   
                   // CRITICAL: We MUST still link the phone to the current guest tenant temporarily.
                   // Why? Because if the user later goes to "View Receipts" and enters this phone,
                   // the system needs to find this *Guest Tenant* to migrate its VCs to the Registered Tenant.
                   // See SSIAuthService.register() migration logic.
                   await ssiAuthService.linkPhoneTemporarily(body.tenantId, body.customerMsisdn)

                } else {
                   // 2. Only create temp link if NOT registered (new user flow)
                   await ssiAuthService.linkPhoneTemporarily(body.tenantId, body.customerMsisdn)
                   logger.info({ tenantId: body.tenantId }, 'Phone linked (encrypted) for Fastlane SSI flow')
                }
            } catch (linkErr: any) {
                // Non-blocking - log but continue checkout
                logger.warn({ error: linkErr.message, tenantId: body.tenantId }, 'Failed to link phone to tenant')
            }
        }

        const items = JSON.parse(cart.items || '[]')
        const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
        const ecocashApiKey = process.env.ECOCASH_API_KEY || '405mvFAY3Tz6o3V48JX6NDeSWGneVLaB'
        const ecocashBaseUrl = process.env.ECOCASH_BASE_URL || 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2'
        const webhookUrl = process.env.NGROK_URL
            ? `${process.env.NGROK_URL}/webhooks/ecocash`
            : 'http://localhost:3000/webhooks/ecocash'

        // Generate unique source reference for idempotency
        const sourceRef = `INV-${randomUUID().substring(0, 8).toUpperCase()}`

        // Check sandbox mode - default to sandbox for safety
        const isSandbox = process.env.ECOCASH_SANDBOX !== 'false'

        try {
            // Step 1: Initiate EcoCash C2B payment
            logger.info({ cartId, msisdn: body.customerMsisdn, amount: cart.total, sandbox: isSandbox }, 'Initiating EcoCash payment')

            let ecocashRef = `SIM-${sourceRef}` // Simulated ref for sandbox
            let paymentInstructions = isSandbox
                ? `🧪 SANDBOX MODE: Payment will auto-complete in 3 seconds`
                : `Dial *151*2*1# and enter reference: ${sourceRef}`

            // Call actual EcoCash API in LIVE mode (ECOCASH_SANDBOX=false)
            if (!isSandbox) {
                try {
                    const ecocashResponse = await axios.post(
                        `${ecocashBaseUrl}/payment/instant/c2b`,
                        {
                            merchantNumber: process.env.ECOCASH_MERCHANT_NUMBER || '0771234567',
                            amount: cart.total,
                            currency: cart.currency === 'ZWL' ? 'ZWL' : 'USD',
                            customerMsisdn: body.customerMsisdn,
                            sourceReference: sourceRef,
                            callbackUrl: webhookUrl
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${ecocashApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 30000
                        }
                    )
                    ecocashRef = ecocashResponse.data?.transactionId || ecocashRef
                    paymentInstructions = `A PIN prompt has been sent to ${body.customerMsisdn}. Enter your EcoCash PIN to complete payment.`
                    logger.info({ ecocashRef, cartId }, 'EcoCash LIVE payment initiated - USSD PIN push sent')
                } catch (ecoErr: any) {
                    logger.error({ error: ecoErr.response?.data || ecoErr.message }, 'EcoCash API call failed')
                    throw new Error(`EcoCash payment failed: ${ecoErr.response?.data?.message || ecoErr.message}`)
                }
            }

            // 3. Prepare Audit Trail (Invoice Hash)
            const quoteId = cart.quote_id
            const quoteHash = cart.quote_hash
            const cartHash = createHash('sha256').update(JSON.stringify(items)).digest('hex')
            const previousHash = quoteHash || cartHash

            const invoiceClaims = {
                invoiceId: sourceRef,
                cartId: cartId,
                quoteId: quoteId, // Link to Quote (nullable)
                quoteHash: quoteHash, // Link to Quote Hash
                previousRecordHash: previousHash, // Chain link
                items: items,
                amount: cart.total,
                currency: cart.currency,
                customerMsisdn: body.customerMsisdn,
                ecocashRef: ecocashRef,
                paymentInstructions: paymentInstructions,
                status: 'pending',
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                timestamp: new Date().toISOString()
            }

            const invoiceHash = createHash('sha256').update(JSON.stringify(invoiceClaims)).digest('hex')

            // Step 2: Issue InvoiceVC
            const invoiceResponse = await axios.post(
                `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
                {
                    credentials: [{
                        credentialDefinitionId: 'InvoiceVC',
                        format: 'jwt_vc_json',
                        type: ['VerifiableCredential', 'InvoiceVC'],
                        claims: invoiceClaims
                    }]
                },
                { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
            )

            const invoiceOfferUrl = invoiceResponse.data?.offerUrl || invoiceResponse.data?.credentialOffer || invoiceResponse.data?.credential_offer_url || invoiceResponse.data?.credential_offer_uri

            // Step 3: Update cart status and buyer phone
            db.prepare(`
                UPDATE carts SET status = 'invoiced', buyer_phone = ?, updated_at = ? WHERE id = ?
            `).run(body.customerMsisdn, new Date().toISOString(), cartId)

            // Step 4: Store pending payment for webhook correlation
            // Added invoice_id and invoice_hash for audit trail
            db.prepare(`
                INSERT OR REPLACE INTO ack_payments (
                    id, tenant_id, cart_id, payment_request_token, provider_ref, payer_phone, 
                    amount, currency, state, idempotency_key, created_at, updated_at,
                    invoice_id, invoice_hash
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                randomUUID(),
                cart.merchant_id,
                cartId,
                sourceRef,
                ecocashRef,
                body.customerMsisdn,
                cart.total,
                cart.currency,
                'pending',
                sourceRef,
                new Date().toISOString(),
                new Date().toISOString(),
                sourceRef,
                invoiceHash
            )

            // Step 5: Send WhatsApp messages
            const targetPhone = body.customerMsisdn || cart.buyer_phone;
            if (body.sendToWhatsApp && targetPhone) {
                // Send payment instructions
                await waMessageService.sendTextMessage(
                    targetPhone,
                    `💳 *Payment Required*\n\n` +
                    `Order: ${cartId}\n` +
                    `Amount: ${cart.currency} ${cart.total.toFixed(2)}\n\n` +
                    `📱 *EcoCash Instructions:*\n` +
                    `${paymentInstructions}\n\n` +
                    `Reference: ${sourceRef}\n\n` +
                    `⏱️ Payment will expire in 24 hours.`
                )

                // Send invoice credential offer
                if (invoiceOfferUrl) {
                    await waMessageService.sendCtaUrlButton(
                        targetPhone,
                        '🧾 Your Invoice',
                        'Tap below to save your invoice credential to your wallet.',
                        'Save Invoice',
                        invoiceOfferUrl
                    )
                }
            }

            // SANDBOX MODE: Auto-trigger success webhook after 3 seconds
            if (isSandbox) {
                setTimeout(async () => {
                    try {
                        const webhookPayload = {
                            paymentRequestId: sourceRef,
                            status: 'SUCCESS',
                            transactionId: ecocashRef,
                            amount: cart.total,
                            currency: cart.currency,
                            sourceReference: sourceRef,
                            customerMsisdn: body.customerMsisdn,
                            timestamp: new Date().toISOString()
                        }
                        logger.info({ cartId, sourceRef }, '🧪 SANDBOX: Auto-triggering EcoCash success webhook')
                        
                        const internalWebhookUrl = `http://localhost:${process.env.PORT || 3000}/webhooks/ecocash`
                        await axios.post(internalWebhookUrl, webhookPayload, {
                            headers: {
                                'Content-Type': 'application/json',
                                'X-API-KEY': process.env.ECOCASH_WEBHOOK_SECRET || 'test-webhook-secret'
                            }
                        })
                        logger.info({ cartId, sourceRef }, '🧪 SANDBOX: Payment auto-completed, receipt VC issued')
                    } catch (simErr: any) {
                        logger.error({ error: simErr.message, cartId }, '🧪 SANDBOX: Auto-webhook failed')
                    }
                }, 3000)
            }

            return {
                cartId,
                status: 'invoiced',
                invoiceOfferUrl,
                invoiceOfferId: invoiceResponse.data?.id || invoiceResponse.data?.offerId,
                ecocashRef,
                paymentInstructions,
                sandbox: isSandbox,
                message: isSandbox
                    ? `🧪 SANDBOX: Payment will auto-complete in 3 seconds. Reference: ${sourceRef}`
                    : `Payment initiated. PIN push sent to ${body.customerMsisdn}. Reference: ${sourceRef}`
            }
        } catch (error: any) {
            logger.error({ error: error.message, cartId }, 'Checkout failed')
            this.setStatus(500)
            throw new Error(`Checkout failed: ${error.message}`)
        }
    }

    /**
     * Get all carts (for portal dashboard)
     */
    @Get('carts')
    public async getAllCarts(
        @Query() status?: string,
        @Query() merchantId?: string
    ): Promise<{ carts: Cart[] }> {
        const db = DatabaseManager.getDatabase()

        let query = 'SELECT * FROM carts WHERE 1=1'
        const params: any[] = []

        if (status) {
            query += ' AND status = ?'
            params.push(status)
        }
        if (merchantId) {
            query += ' AND merchant_id = ?'
            params.push(merchantId)
        }

        query += ' ORDER BY created_at DESC LIMIT 100'

        const rows = db.prepare(query).all(...params) as any[]

        return {
            carts: rows.map(row => ({
                id: row.id,
                merchantId: row.merchant_id,
                buyerPhone: row.buyer_phone,
                items: JSON.parse(row.items || '[]'),
                total: row.total,
                currency: row.currency,
                status: row.status,
                createdAt: row.created_at
            }))
        }
    }

    /**
     * Send a receipt credential to WhatsApp after payment confirmation
     * Called by EcoCash webhook handler after successful payment
     */
    @Post('cart/{cartId}/send-receipt')
    public async sendReceiptToWhatsApp(
        @Path() cartId: string,
        @Body() body: {
            receiptOfferUrl: string
            transactionId: string
            verificationUrl?: string
            verificationCode?: string
        }
    ): Promise<{ success: boolean, message: string }> {
        const db = DatabaseManager.getDatabase()

        const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any
        if (!cart) {
            this.setStatus(404)
            throw new Error(`Cart ${cartId} not found`)
        }

        if (!cart.buyer_phone) {
            return { success: false, message: 'No buyer phone number on cart' }
        }

        try {
            // Send confirmation message
            await waMessageService.sendTextMessage(
                cart.buyer_phone,
                `✅ *Payment Confirmed!*\n\n` +
                `Order: ${cartId}\n` +
                `Amount: ${cart.currency} ${cart.total.toFixed(2)}\n` +
                `Transaction: ${body.transactionId}\n\n` +
                `Thank you for your purchase! Your receipt credential is ready.`
            )

            // Send receipt credential offer
            await waMessageService.sendCtaUrlButton(
                cart.buyer_phone,
                '🧾 Your Receipt',
                'Tap below to save your verifiable receipt to your wallet. Present this at delivery for verification.',
                'Save Receipt',
                body.receiptOfferUrl
            )

            // Send verification code (for drivers)
            if (body.verificationUrl && body.verificationCode) {
                await waMessageService.sendCtaUrlButton(
                    cart.buyer_phone,
                    '🚚 Delivery Verification',
                    `Show this code to your driver for verification:\n\n*${body.verificationCode}*`,
                    'Show QR Code',
                    body.verificationUrl
                )
            }

            // Update cart status
            db.prepare(`
                UPDATE carts SET status = 'paid', updated_at = ? WHERE id = ?
            `).run(new Date().toISOString(), cartId)

            return { success: true, message: 'Receipt sent to WhatsApp' }
        } catch (error: any) {
            logger.error({ error: error.message, cartId }, 'Failed to send receipt to WhatsApp')
            return { success: false, message: error.message }
        }
    }
}

import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'

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
}

export interface CreateCartRequest {
    /** Base64-encoded wa.me payload OR raw JSON payload */
    payload: string
    /** Buyer's phone number (from WhatsApp) */
    buyerPhone?: string
}

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

        return {
            id: row.id,
            merchantId: row.merchant_id,
            buyerPhone: row.buyer_phone,
            items: JSON.parse(row.items || '[]'),
            total: row.total,
            currency: row.currency,
            status: row.status,
            createdAt: row.created_at
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
}

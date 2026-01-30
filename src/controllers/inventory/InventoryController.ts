/**
 * InventoryController - REST API for inventory management
 * 
 * Phase 1 Extension: Provides endpoints for:
 * - Location management
 * - Goods receipt (with optional GoodsReceivedVC)
 * - Stock queries and barcode scanning
 * - Hash chain verification for cryptographic audit
 * 
 * Integrates with existing catalog and finance flows.
 */

import { Controller, Post, Get, Route, Tags, Body, Path, Query, Security, Request } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID } from 'crypto'
import { SCOPES } from '../../enums'
import {
    inventoryService,
    InventoryLocation,
    InventoryLot,
    InventoryEvent,
    StockLevel,
    ReceiveGoodsRequest,
    ReserveStockRequest
} from '../../services/InventoryService'

// ============================================================================
// Request/Response Types
// ============================================================================

interface CreateLocationRequest {
    name: string
    type?: 'warehouse' | 'shop' | 'transit' | 'virtual'
    address?: string
    did?: string
}

interface ReceiveGoodsBody {
    catalogItemId: string
    locationId: string
    quantity: number
    unitCost?: number
    currency?: string
    lotNumber?: string
    serialNumber?: string
    barcode?: string
    expiryDate?: string
    supplierId?: string
    supplierInvoiceRef?: string
    issueVC?: boolean
}

interface ReserveStockBody {
    items: Array<{
        catalogItemId: string
        locationId: string
        quantity: number
        preferredLotId?: string
    }>
    cartId: string
    expiresInMs?: number
}

interface ScanBarcodeResponse {
    catalogItem?: any
    lots: InventoryLot[]
    stockLevel?: StockLevel
}

interface VerifyChainResponse {
    valid: boolean
    errors: string[]
    eventCount?: number
}

interface TraceReceiptResponse {
    receiptId: string
    events: InventoryEvent[]
    fulfillments: Array<{
        lotId: string
        lotNumber?: string
        serialNumber?: string
        quantity: number
        eventHash: string
        grnVcId?: string
    }>
    chainValid: boolean
}

// ============================================================================
// Controller
// ============================================================================

@Route('api/inventory')
@Tags('Inventory Management')
export class InventoryController extends Controller {

    // --------------------------------------------------------------------------
    // Locations
    // --------------------------------------------------------------------------

    /**
     * Create an inventory location (warehouse, shop, etc.)
     */
    @Post('locations')
    @Security('apiKey')
    public async createLocation(
        @Body() body: CreateLocationRequest,
        @Request() request: ExRequest
    ): Promise<InventoryLocation> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const location = await inventoryService.createLocation(tenantId, body)
        this.setStatus(201)
        return location
    }

    /**
     * List all active locations for tenant
     */
    @Get('locations')
    @Security('apiKey')
    public async getLocations(
        @Request() request: ExRequest
    ): Promise<InventoryLocation[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return inventoryService.getLocations(tenantId)
    }

    // --------------------------------------------------------------------------
    // Goods Receipt
    // --------------------------------------------------------------------------

    /**
     * Receive goods into inventory (supplier → warehouse/shop).
     * Creates a new lot and appends a RECEIVE event to the hash chain.
     * Optionally issues a GoodsReceivedVC for cryptographic verification.
     */
    @Post('receive')
    @Security('apiKey')
    public async receiveGoods(
        @Body() body: ReceiveGoodsBody,
        @Request() request: ExRequest
    ): Promise<{ lot: InventoryLot; event: InventoryEvent; vcOffer?: any }> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const actorId = (request as any).user?.id

        const result = await inventoryService.receiveGoods({
            tenantId,
            catalogItemId: body.catalogItemId,
            locationId: body.locationId,
            quantity: body.quantity,
            unitCost: body.unitCost,
            currency: body.currency,
            lotNumber: body.lotNumber,
            serialNumber: body.serialNumber,
            barcode: body.barcode,
            expiryDate: body.expiryDate,
            supplierId: body.supplierId,
            supplierInvoiceRef: body.supplierInvoiceRef,
            actorId,
            issueVC: body.issueVC
        })

        this.setStatus(201)
        return result
    }

    // --------------------------------------------------------------------------
    // Stock Reservation
    // --------------------------------------------------------------------------

    /**
     * Reserve stock for a cart/order.
     * Uses FIFO allocation and creates RESERVE events.
     */
    @Post('reserve')
    @Security('apiKey')
    public async reserveStock(
        @Body() body: ReserveStockBody,
        @Request() request: ExRequest
    ): Promise<{ allocations: any[]; events: InventoryEvent[] }> {
        const tenantId = (request as any).user?.tenantId || 'default'

        const result = await inventoryService.reserveStock({
            tenantId,
            items: body.items,
            cartId: body.cartId,
            expiresInMs: body.expiresInMs
        })

        this.setStatus(201)
        return result
    }

    // --------------------------------------------------------------------------
    // Stock Queries
    // --------------------------------------------------------------------------

    /**
     * Get current stock levels.
     * Query by catalog item and/or location.
     */
    @Get('levels')
    @Security('apiKey')
    public async getStockLevels(
        @Request() request: ExRequest,
        @Query() catalogItemId?: string,
        @Query() locationId?: string
    ): Promise<StockLevel[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return inventoryService.getStockLevels(tenantId, catalogItemId, locationId)
    }

    /**
     * Get a specific lot by ID
     */
    @Get('lots/{lotId}')
    @Security('apiKey')
    public async getLot(
        @Path() lotId: string
    ): Promise<InventoryLot | null> {
        const lot = await inventoryService.getLot(lotId)
        if (!lot) {
            this.setStatus(404)
            return null
        }
        return lot
    }

    /**
     * Scan barcode to lookup item and stock.
     * Works with lot barcodes or catalog SKUs.
     */
    @Get('scan/{barcode}')
    @Security('apiKey')
    public async scanBarcode(
        @Path() barcode: string,
        @Request() request: ExRequest,
        @Query() locationId?: string
    ): Promise<ScanBarcodeResponse> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return inventoryService.scanBarcode(tenantId, barcode, locationId)
    }

    // --------------------------------------------------------------------------
    // Event Chain & Verification
    // --------------------------------------------------------------------------

    /**
     * Get event history for an item at a location.
     * Returns the hash-chained event log.
     */
    @Get('events')
    @Security('apiKey')
    public async getEvents(
        @Request() request: ExRequest,
        @Query() catalogItemId: string,
        @Query() locationId: string,
        @Query() limit?: number
    ): Promise<InventoryEvent[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return inventoryService.getEventChain(tenantId, catalogItemId, locationId, limit || 100)
    }

    /**
     * Verify the integrity of the event hash chain.
     * Checks that all hashes are correct and chain links are valid.
     */
    @Get('verify-chain')
    @Security('apiKey')
    public async verifyChain(
        @Request() request: ExRequest,
        @Query() catalogItemId: string,
        @Query() locationId: string
    ): Promise<VerifyChainResponse> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const result = await inventoryService.verifyEventChain(tenantId, catalogItemId, locationId)
        const events = await inventoryService.getEventChain(tenantId, catalogItemId, locationId)
        return { ...result, eventCount: events.length }
    }

    /**
     * Trace inventory events behind a receipt.
     * Returns the full provenance chain from receipt back to goods received.
     */
    @Get('trace/receipt/{receiptId}')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async traceReceipt(
        @Path() receiptId: string,
        @Request() request: ExRequest
    ): Promise<TraceReceiptResponse> {
        const events = await inventoryService.getEventsByReceipt(receiptId)

        // Build fulfillment details
        const fulfillments = await Promise.all(events.map(async (event) => {
            const lot = event.lotId ? await inventoryService.getLot(event.lotId) : undefined
            return {
                lotId: event.lotId || '',
                lotNumber: lot?.lotNumber,
                serialNumber: lot?.serialNumber,
                quantity: Math.abs(event.quantity),
                eventHash: event.eventHash,
                grnVcId: lot?.grnVcId
            }
        }))

        // Verify chain for each unique item+location
        let chainValid = true
        const verified = new Set<string>()
        for (const event of events) {
            const key = `${event.catalogItemId}:${event.locationId}`
            if (!verified.has(key)) {
                const tenantId = (request as any).user?.tenantId || 'default'
                const result = await inventoryService.verifyEventChain(tenantId, event.catalogItemId, event.locationId)
                if (!result.valid) chainValid = false
                verified.add(key)
            }
        }

        return {
            receiptId,
            events,
            fulfillments,
            chainValid
        }
    }

    // --------------------------------------------------------------------------
    // Analytics Endpoints (Phase 7D)
    // --------------------------------------------------------------------------

    /**
     * Get inventory valuation across all locations
     */
    @Get('analytics/valuation')
    @Security('apiKey')
    public async getValuation(@Request() request: ExRequest): Promise<any> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return await inventoryService.getValuation(tenantId)
    }

    /**
     * Get inventory aging report (time since receipt)
     */
    @Get('analytics/aging')
    @Security('apiKey')
    public async getAging(@Request() request: ExRequest): Promise<any[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return await inventoryService.getAging(tenantId)
    }

    /**
     * Get profit analytics (revenue potential vs cost)
     */
    @Get('analytics/profit')
    @Security('apiKey')
    public async getProfitAnalytics(@Request() request: ExRequest): Promise<any> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return await inventoryService.getProfitAnalytics(tenantId)
    }

    /**
     * Process a direct purchase (Scan to Buy)
     * Deducts stock using a SELL event and returns a Receipt reference.
     */
    @Post('buy')
    @Security('apiKey')
    public async buyItem(
        @Body() body: { lotId: string, quantity: number, priceOverride?: number },
        @Request() request: ExRequest
    ): Promise<any> {
        const tenantId = (request as any).user?.tenantId || 'default'
        const actorId = (request as any).user?.id

        // This is a simplified direct buy that bypasses the long cart/reservation flow
        // for immediate "in-store" scanning transactions.
        const receiptId = `RCPT-${randomUUID().substring(0, 8)}`

        // Use fulfillSale-like logic but for a direct lot purchase
        // First we "reserve" it for a split second then fulfill
        const reservation = await inventoryService.reserveStock({
            tenantId,
            items: [{ catalogItemId: '', locationId: '', quantity: body.quantity, preferredLotId: body.lotId }],
            cartId: receiptId,
            actorId
        })

        const fulfillment = await inventoryService.fulfillSale({
            tenantId,
            cartId: receiptId,
            receiptId,
            actorId
        })

        return { receiptId, ...fulfillment }
    }
}

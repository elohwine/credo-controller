/**
 * InventoryService - Secure inventory management with hash-chained event ledger
 * 
 * Phase 1 Extension: Provides real-time inventory tracking with cryptographic verification.
 * Eliminates month-end stocktakes by maintaining an append-only, tamper-evident event log.
 * 
 * Key features:
 * - Hash-chained events (each event includes hash of previous for tamper detection)
 * - Lot/serial tracking for unit-level provenance
 * - Integration with ReceiptVC for end-to-end verification
 * - Real-time stock projections derived from event stream
 */

import { createHash, randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { credentialIssuanceService } from './CredentialIssuanceService'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'InventoryService' })

// ============================================================================
// Types
// ============================================================================

export type InventoryEventType =
    | 'RECEIVE'      // Goods received from supplier
    | 'TRANSFER_OUT' // Sent to another location
    | 'TRANSFER_IN'  // Received from another location
    | 'RESERVE'      // Reserved for cart/invoice
    | 'UNRESERVE'    // Released reservation
    | 'SELL'         // Sold (payment confirmed)
    | 'ADJUST'       // Manual adjustment (audit, damage, etc)
    | 'RETURN'       // Customer return
    | 'WRITE_OFF'    // Written off (expired, damaged beyond repair)

export interface InventoryLocation {
    id: string
    tenantId: string
    name: string
    type: 'warehouse' | 'shop' | 'transit' | 'virtual'
    address?: string
    did?: string
    status: 'active' | 'inactive'
    createdAt: string
}

export interface InventoryLot {
    id: string
    tenantId: string
    catalogItemId: string
    locationId: string
    lotNumber?: string
    serialNumber?: string
    barcode?: string
    quantityInitial: number
    quantityOnHand: number
    quantityReserved: number
    quantityAvailable: number
    unitCost?: number
    currency: string
    expiryDate?: string
    receivedAt?: string
    supplierId?: string
    supplierInvoiceRef?: string
    grnVcId?: string
    status: 'active' | 'depleted' | 'expired' | 'quarantine'
    metadata?: Record<string, any>
    createdAt: string
}

export interface InventoryEvent {
    id: string
    tenantId: string
    eventType: InventoryEventType
    catalogItemId: string
    lotId?: string
    locationId: string
    quantity: number
    unitCost?: number
    currency: string
    referenceType?: string
    referenceId?: string
    counterpartyId?: string
    eventHash: string
    prevEventHash?: string
    sequenceNumber: number
    vcId?: string
    vcType?: string
    actorId?: string
    reason?: string
    metadata?: Record<string, any>
    createdAt: string
}

export interface InventoryAllocation {
    id: string
    tenantId: string
    lotId: string
    cartId?: string
    invoiceId?: string
    receiptId?: string
    quantity: number
    status: 'reserved' | 'fulfilled' | 'released' | 'expired'
    reservedAt: string
    fulfilledAt?: string
    expiresAt?: string
    eventId?: string
    fulfillmentEventId?: string
}

export interface StockLevel {
    catalogItemId: string
    locationId: string
    quantityOnHand: number
    quantityReserved: number
    quantityAvailable: number
    totalCost: number
    avgUnitCost?: number
    lastEventHash?: string
    lastEventAt?: string
}

export interface ReceiveGoodsRequest {
    tenantId: string
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
    actorId?: string
    issueVC?: boolean // If true, issue GoodsReceivedVC
}

export interface TransferStockRequest {
    tenantId: string
    lotId: string
    fromLocationId: string
    toLocationId: string
    quantity: number
    actorId?: string
    reason?: string
    issueVC?: boolean
}

export interface AdjustStockRequest {
    tenantId: string
    lotId: string
    locationId: string
    quantityDelta: number // Positive to add, negative to remove
    reason: string
    actorId?: string
    issueVC?: boolean
}

export interface ReserveStockRequest {
    tenantId: string
    items: Array<{
        catalogItemId: string
        locationId: string
        quantity: number
        preferredLotId?: string // Optional specific lot
    }>
    cartId: string
    expiresInMs?: number // Default 30 minutes
    actorId?: string // Who initiated the reservation
}

export interface FulfillSaleRequest {
    tenantId: string
    cartId?: string
    invoiceId?: string
    receiptId: string
    transactionId?: string
    actorId?: string
}

// ============================================================================
// Service Implementation
// ============================================================================

export class InventoryService {

    // --------------------------------------------------------------------------
    // Location Management
    // --------------------------------------------------------------------------

    async createLocation(tenantId: string, data: Partial<InventoryLocation>): Promise<InventoryLocation> {
        const db = DatabaseManager.getDatabase()
        const id = `LOC-${randomUUID().substring(0, 8)}`
        const now = new Date().toISOString()

        const location: InventoryLocation = {
            id,
            tenantId,
            name: data.name || 'Default Location',
            type: data.type || 'warehouse',
            address: data.address,
            did: data.did,
            status: 'active',
            createdAt: now
        }

        db.prepare(`
            INSERT INTO inventory_locations (id, tenant_id, name, type, address, did, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, tenantId, location.name, location.type, location.address, location.did, location.status, now, now)

        logger.info({ locationId: id, tenantId }, 'Created inventory location')
        return location
    }

    async getLocations(tenantId: string): Promise<InventoryLocation[]> {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare('SELECT * FROM inventory_locations WHERE tenant_id = ? AND status = ?')
            .all(tenantId, 'active') as any[]

        return rows.map(this.mapLocation)
    }

    // --------------------------------------------------------------------------
    // Goods Receipt (Supplier → Inventory)
    // --------------------------------------------------------------------------

    async receiveGoods(request: ReceiveGoodsRequest): Promise<{ lot: InventoryLot; event: InventoryEvent; vcOffer?: any }> {
        const db = DatabaseManager.getDatabase()
        const now = new Date().toISOString()
        const lotId = `LOT-${randomUUID().substring(0, 8)}`
        const eventId = `EVT-${randomUUID()}`

        // Get previous event hash for this item+location stream
        const prevEvent = this.getLastEvent(request.tenantId, request.catalogItemId, request.locationId)
        const sequenceNumber = (prevEvent?.sequenceNumber || 0) + 1

        // Create event data for hashing
        const eventData = {
            id: eventId,
            tenantId: request.tenantId,
            eventType: 'RECEIVE' as InventoryEventType,
            catalogItemId: request.catalogItemId,
            lotId,
            locationId: request.locationId,
            quantity: request.quantity,
            unitCost: request.unitCost,
            currency: request.currency || 'USD',
            referenceType: 'grn',
            referenceId: lotId,
            counterpartyId: request.supplierId,
            prevEventHash: prevEvent?.eventHash,
            sequenceNumber,
            actorId: request.actorId,
            createdAt: now
        }

        // Compute hash
        const eventHash = this.computeEventHash(eventData)

        // Insert lot
        db.prepare(`
            INSERT INTO inventory_lots 
            (id, tenant_id, catalog_item_id, location_id, lot_number, serial_number, barcode,
             quantity_initial, quantity_on_hand, quantity_reserved, unit_cost, currency,
             expiry_date, received_at, supplier_id, supplier_invoice_ref, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(
            lotId, request.tenantId, request.catalogItemId, request.locationId,
            request.lotNumber, request.serialNumber, request.barcode,
            request.quantity, request.quantity, request.unitCost, request.currency || 'USD',
            request.expiryDate, now, request.supplierId, request.supplierInvoiceRef, now, now
        )

        // Insert event
        db.prepare(`
            INSERT INTO inventory_events
            (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity, unit_cost, currency,
             reference_type, reference_id, counterparty_id, event_hash, prev_event_hash, sequence_number,
             actor_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            eventId, request.tenantId, 'RECEIVE', request.catalogItemId, lotId, request.locationId,
            request.quantity, request.unitCost, request.currency || 'USD',
            'grn', lotId, request.supplierId, eventHash, prevEvent?.eventHash, sequenceNumber,
            request.actorId, now
        )

        // Update projection
        this.updateProjection(request.tenantId, request.catalogItemId, request.locationId, request.quantity, request.unitCost || 0, eventHash, now)

        const lot = await this.getLot(lotId)
        const event: InventoryEvent = { ...eventData, eventHash }

        logger.info({ lotId, eventId, quantity: request.quantity, tenantId: request.tenantId }, 'Goods received')

        // Optionally issue GoodsReceivedVC
        let vcOffer
        if (request.issueVC) {
            try {
                vcOffer = await credentialIssuanceService.createOffer({
                    tenantId: request.tenantId,
                    credentialType: 'GoodsReceivedDef',
                    claims: {
                        eventId,
                        lotId,
                        catalogItemId: request.catalogItemId,
                        quantity: request.quantity,
                        unitCost: request.unitCost,
                        currency: request.currency || 'USD',
                        supplierId: request.supplierId,
                        supplierInvoiceRef: request.supplierInvoiceRef,
                        locationId: request.locationId,
                        eventHash,
                        prevEventHash: prevEvent?.eventHash,
                        sequenceNumber,
                        receivedAt: now
                    }
                })

                // Update event with VC reference
                db.prepare('UPDATE inventory_events SET vc_id = ?, vc_type = ? WHERE id = ?')
                    .run(vcOffer.offerId, 'GoodsReceivedVC', eventId)

                // Update lot with GRN VC
                db.prepare('UPDATE inventory_lots SET grn_vc_id = ? WHERE id = ?')
                    .run(vcOffer.offerId, lotId)

                logger.info({ eventId, vcOfferId: vcOffer.offerId }, 'GoodsReceivedVC offer created')
            } catch (e: any) {
                logger.warn({ error: e.message }, 'Failed to create GoodsReceivedVC (non-fatal)')
            }
        }

        return { lot: lot!, event, vcOffer }
    }

    // --------------------------------------------------------------------------
    // Stock Reservation (Cart/Invoice → Reserve)
    // --------------------------------------------------------------------------

    async reserveStock(request: ReserveStockRequest): Promise<{ allocations: InventoryAllocation[]; events: InventoryEvent[] }> {
        const db = DatabaseManager.getDatabase()
        const now = new Date().toISOString()
        const expiresAt = new Date(Date.now() + (request.expiresInMs || 30 * 60 * 1000)).toISOString()

        const allocations: InventoryAllocation[] = []
        const events: InventoryEvent[] = []

        for (const item of request.items) {
            // Find available lot (FIFO by received_at)
            let lot: InventoryLot | undefined
            if (item.preferredLotId) {
                lot = await this.getLot(item.preferredLotId)
            }
            if (!lot || lot.quantityAvailable < item.quantity) {
                lot = await this.findAvailableLot(request.tenantId, item.catalogItemId, item.locationId, item.quantity)
            }

            if (!lot) {
                throw new Error(`Insufficient stock for item ${item.catalogItemId} at location ${item.locationId}`)
            }

            const eventId = `EVT-${randomUUID()}`
            const allocId = `ALLOC-${randomUUID().substring(0, 8)}`

            // Get previous event
            const prevEvent = this.getLastEvent(request.tenantId, item.catalogItemId, item.locationId)
            const sequenceNumber = (prevEvent?.sequenceNumber || 0) + 1

            const eventData = {
                id: eventId,
                tenantId: request.tenantId,
                eventType: 'RESERVE' as InventoryEventType,
                catalogItemId: item.catalogItemId,
                lotId: lot.id,
                locationId: item.locationId,
                quantity: -item.quantity, // Negative = reduction in available
                referenceType: 'cart',
                referenceId: request.cartId,
                prevEventHash: prevEvent?.eventHash,
                sequenceNumber,
                createdAt: now
            }

            const eventHash = this.computeEventHash(eventData)

            // Update lot reserved qty
            db.prepare('UPDATE inventory_lots SET quantity_reserved = quantity_reserved + ?, updated_at = ? WHERE id = ?')
                .run(item.quantity, now, lot.id)

            // Insert event
            db.prepare(`
                INSERT INTO inventory_events
                (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity,
                 reference_type, reference_id, event_hash, prev_event_hash, sequence_number, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                eventId, request.tenantId, 'RESERVE', item.catalogItemId, lot.id, item.locationId,
                -item.quantity, 'cart', request.cartId, eventHash, prevEvent?.eventHash, sequenceNumber, now
            )

            // Insert allocation
            db.prepare(`
                INSERT INTO inventory_allocations
                (id, tenant_id, lot_id, cart_id, quantity, status, reserved_at, expires_at, event_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)
            `).run(allocId, request.tenantId, lot.id, request.cartId, item.quantity, now, expiresAt, eventId, now, now)

            // Update projection (reserved increases, available decreases)
            this.updateProjectionReserve(request.tenantId, item.catalogItemId, item.locationId, item.quantity, eventHash, now)

            allocations.push({
                id: allocId,
                tenantId: request.tenantId,
                lotId: lot.id,
                cartId: request.cartId,
                quantity: item.quantity,
                status: 'reserved',
                reservedAt: now,
                expiresAt,
                eventId
            })

            events.push({ ...eventData, eventHash, currency: 'USD' })
        }

        logger.info({ cartId: request.cartId, itemCount: request.items.length }, 'Stock reserved')
        return { allocations, events }
    }

    // --------------------------------------------------------------------------
    // Sale Fulfillment (Payment → Consume Reserved Stock)
    // --------------------------------------------------------------------------

    async fulfillSale(request: FulfillSaleRequest): Promise<{ events: InventoryEvent[]; vcOffer?: any }> {
        const db = DatabaseManager.getDatabase()
        const now = new Date().toISOString()

        // Find allocations for this cart/invoice
        const allocations = db.prepare(`
            SELECT * FROM inventory_allocations 
            WHERE tenant_id = ? AND (cart_id = ? OR invoice_id = ?) AND status = 'reserved'
        `).all(request.tenantId, request.cartId, request.invoiceId) as any[]

        if (allocations.length === 0) {
            throw new Error('No reserved allocations found for this sale')
        }

        const events: InventoryEvent[] = []
        const fulfillmentData: any[] = []

        for (const alloc of allocations) {
            const eventId = `EVT-${randomUUID()}`
            const lot = await this.getLot(alloc.lot_id)
            if (!lot) continue

            // Get previous event
            const prevEvent = this.getLastEvent(request.tenantId, lot.catalogItemId, lot.locationId)
            const sequenceNumber = (prevEvent?.sequenceNumber || 0) + 1

            const eventData = {
                id: eventId,
                tenantId: request.tenantId,
                eventType: 'SELL' as InventoryEventType,
                catalogItemId: lot.catalogItemId,
                lotId: lot.id,
                locationId: lot.locationId,
                quantity: -alloc.quantity,
                unitCost: lot.unitCost,
                currency: lot.currency,
                referenceType: 'receipt',
                referenceId: request.receiptId,
                prevEventHash: prevEvent?.eventHash,
                sequenceNumber,
                actorId: request.actorId,
                createdAt: now
            }

            const eventHash = this.computeEventHash(eventData)

            // Update lot: reduce on_hand, reduce reserved
            db.prepare(`
                UPDATE inventory_lots 
                SET quantity_on_hand = quantity_on_hand - ?, 
                    quantity_reserved = quantity_reserved - ?,
                    status = CASE WHEN quantity_on_hand - ? <= 0 THEN 'depleted' ELSE status END,
                    updated_at = ?
                WHERE id = ?
            `).run(alloc.quantity, alloc.quantity, alloc.quantity, now, lot.id)

            // Insert event
            db.prepare(`
                INSERT INTO inventory_events
                (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity, unit_cost, currency,
                 reference_type, reference_id, event_hash, prev_event_hash, sequence_number, actor_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                eventId, request.tenantId, 'SELL', lot.catalogItemId, lot.id, lot.locationId,
                -alloc.quantity, lot.unitCost, lot.currency, 'receipt', request.receiptId,
                eventHash, prevEvent?.eventHash, sequenceNumber, request.actorId, now
            )

            // Update allocation
            db.prepare(`
                UPDATE inventory_allocations 
                SET status = 'fulfilled', receipt_id = ?, fulfilled_at = ?, fulfillment_event_id = ?, updated_at = ?
                WHERE id = ?
            `).run(request.receiptId, now, eventId, now, alloc.id)

            // Update projection
            this.updateProjectionSell(request.tenantId, lot.catalogItemId, lot.locationId, alloc.quantity, lot.unitCost || 0, eventHash, now)

            events.push({ ...eventData, eventHash })
            fulfillmentData.push({
                lotId: lot.id,
                lotNumber: lot.lotNumber,
                serialNumber: lot.serialNumber,
                quantity: alloc.quantity,
                unitCost: lot.unitCost,
                eventHash
            })
        }

        logger.info({ receiptId: request.receiptId, eventCount: events.length }, 'Sale fulfilled')

        // Issue SaleFulfillmentVC with all lot references
        let vcOffer
        try {
            vcOffer = await credentialIssuanceService.createOffer({
                tenantId: request.tenantId,
                credentialType: 'SaleFulfillmentDef',
                claims: {
                    receiptId: request.receiptId,
                    transactionId: request.transactionId,
                    fulfillments: fulfillmentData,
                    totalItems: fulfillmentData.reduce((sum, f) => sum + f.quantity, 0),
                    eventHashes: events.map(e => e.eventHash),
                    fulfilledAt: now
                }
            })

            // Update events with VC reference
            for (const event of events) {
                db.prepare('UPDATE inventory_events SET vc_id = ?, vc_type = ? WHERE id = ?')
                    .run(vcOffer.offerId, 'SaleFulfillmentVC', event.id)
            }
        } catch (e: any) {
            logger.warn({ error: e.message }, 'Failed to create SaleFulfillmentVC (non-fatal)')
        }

        return { events, vcOffer }
    }

    // --------------------------------------------------------------------------
    // Stock Queries
    // --------------------------------------------------------------------------

    async getStockLevels(tenantId: string, catalogItemId?: string, locationId?: string): Promise<StockLevel[]> {
        const db = DatabaseManager.getDatabase()
        let sql = 'SELECT * FROM inventory_projections WHERE tenant_id = ?'
        const params: any[] = [tenantId]

        if (catalogItemId) {
            sql += ' AND catalog_item_id = ?'
            params.push(catalogItemId)
        }
        if (locationId) {
            sql += ' AND location_id = ?'
            params.push(locationId)
        }

        const rows = db.prepare(sql).all(...params) as any[]
        return rows.map(this.mapProjection)
    }

    async getLot(lotId: string): Promise<InventoryLot | undefined> {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare('SELECT * FROM inventory_lots WHERE id = ?').get(lotId) as any
        return row ? this.mapLot(row) : undefined
    }

    async getEventsByReceipt(receiptId: string): Promise<InventoryEvent[]> {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare(`
            SELECT * FROM inventory_events 
            WHERE reference_type = 'receipt' AND reference_id = ?
            ORDER BY created_at ASC
        `).all(receiptId) as any[]

        return rows.map(this.mapEvent)
    }

    async getEventChain(tenantId: string, catalogItemId: string, locationId: string, limit = 100): Promise<InventoryEvent[]> {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare(`
            SELECT * FROM inventory_events 
            WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
            ORDER BY sequence_number DESC
            LIMIT ?
        `).all(tenantId, catalogItemId, locationId, limit) as any[]

        return rows.map(this.mapEvent)
    }

    // --------------------------------------------------------------------------
    // Hash Chain Verification
    // --------------------------------------------------------------------------

    async verifyEventChain(tenantId: string, catalogItemId: string, locationId: string): Promise<{ valid: boolean; errors: string[] }> {
        const events = await this.getEventChain(tenantId, catalogItemId, locationId, 10000)
        const errors: string[] = []

        // Events are returned DESC, reverse for verification
        const orderedEvents = events.reverse()

        for (let i = 0; i < orderedEvents.length; i++) {
            const event = orderedEvents[i]

            // Verify hash
            const computedHash = this.computeEventHash({
                id: event.id,
                tenantId: event.tenantId,
                eventType: event.eventType,
                catalogItemId: event.catalogItemId,
                lotId: event.lotId,
                locationId: event.locationId,
                quantity: event.quantity,
                unitCost: event.unitCost,
                currency: event.currency,
                referenceType: event.referenceType,
                referenceId: event.referenceId,
                counterpartyId: event.counterpartyId,
                prevEventHash: event.prevEventHash,
                sequenceNumber: event.sequenceNumber,
                actorId: event.actorId,
                createdAt: event.createdAt
            })

            if (computedHash !== event.eventHash) {
                errors.push(`Event ${event.id} hash mismatch: stored=${event.eventHash}, computed=${computedHash}`)
            }

            // Verify chain link (except first event)
            if (i > 0) {
                const prevEvent = orderedEvents[i - 1]
                if (event.prevEventHash !== prevEvent.eventHash) {
                    errors.push(`Event ${event.id} prev_hash mismatch: points to ${event.prevEventHash}, but prev event hash is ${prevEvent.eventHash}`)
                }
            }

            // Verify sequence
            if (event.sequenceNumber !== i + 1) {
                errors.push(`Event ${event.id} sequence mismatch: expected ${i + 1}, got ${event.sequenceNumber}`)
            }
        }

        logger.info({ tenantId, catalogItemId, locationId, eventCount: events.length, errorCount: errors.length }, 'Event chain verified')
        return { valid: errors.length === 0, errors }
    }

    // --------------------------------------------------------------------------
    // Barcode Scan Handler
    // --------------------------------------------------------------------------

    async scanBarcode(tenantId: string, barcode: string, locationId?: string): Promise<{
        catalogItem?: any
        lots: InventoryLot[]
        stockLevel?: StockLevel
        provenanceTrial?: InventoryEvent[]
    }> {
        const db = DatabaseManager.getDatabase()

        // First check if barcode matches a lot
        let lotQuery = 'SELECT * FROM inventory_lots WHERE tenant_id = ? AND barcode = ?'
        const lotParams: any[] = [tenantId, barcode]
        if (locationId) {
            lotQuery += ' AND location_id = ?'
            lotParams.push(locationId)
        }
        const lotRows = db.prepare(lotQuery).all(...lotParams) as any[]

        if (lotRows.length > 0) {
            const lots = lotRows.map(this.mapLot)
            const catalogItemId = lots[0].catalogItemId

            // Get catalog item
            const catalogItem = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(catalogItemId)

            // Get stock level
            const stockLevels = await this.getStockLevels(tenantId, catalogItemId, locationId)

            // Get provenance (events for these specific lots)
            const lotIds = lots.map(l => l.id)
            const events = db.prepare(`
                SELECT * FROM inventory_events 
                WHERE lot_id IN (${lotIds.map(() => '?').join(',')})
                ORDER BY created_at DESC
            `).all(...lotIds) as any[]

            return { catalogItem, lots, stockLevel: stockLevels[0], provenanceTrial: events.map(this.mapEvent) }
        }

        // Check if barcode matches catalog item SKU/barcode field
        const catalogItem = db.prepare('SELECT * FROM catalog_items WHERE merchant_id = ? AND sku = ?')
            .get(tenantId, barcode) as any

        if (catalogItem) {
            const stockLevels = await this.getStockLevels(tenantId, catalogItem.id, locationId)
            const lots = await this.getLotsByCatalogItem(tenantId, catalogItem.id, locationId)

            return { catalogItem, lots, stockLevel: stockLevels[0] }
        }

        return { lots: [] }
    }

    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------

    private computeEventHash(data: Record<string, any>): string {
        const hashInput = JSON.stringify({
            id: data.id,
            tenantId: data.tenantId,
            eventType: data.eventType,
            catalogItemId: data.catalogItemId,
            lotId: data.lotId,
            locationId: data.locationId,
            quantity: data.quantity,
            unitCost: data.unitCost,
            currency: data.currency,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            counterpartyId: data.counterpartyId,
            prevEventHash: data.prevEventHash,
            sequenceNumber: data.sequenceNumber,
            actorId: data.actorId,
            createdAt: data.createdAt
        })
        return createHash('sha256').update(hashInput).digest('hex')
    }

    private getLastEvent(tenantId: string, catalogItemId: string, locationId: string): InventoryEvent | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT * FROM inventory_events 
            WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
            ORDER BY sequence_number DESC LIMIT 1
        `).get(tenantId, catalogItemId, locationId) as any

        return row ? this.mapEvent(row) : undefined
    }

    private async findAvailableLot(tenantId: string, catalogItemId: string, locationId: string, quantity: number): Promise<InventoryLot | undefined> {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT * FROM inventory_lots 
            WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ? 
              AND status = 'active' AND (quantity_on_hand - quantity_reserved) >= ?
            ORDER BY received_at ASC
            LIMIT 1
        `).get(tenantId, catalogItemId, locationId, quantity) as any

        return row ? this.mapLot(row) : undefined
    }

    private async getLotsByCatalogItem(tenantId: string, catalogItemId: string, locationId?: string): Promise<InventoryLot[]> {
        const db = DatabaseManager.getDatabase()
        let sql = 'SELECT * FROM inventory_lots WHERE tenant_id = ? AND catalog_item_id = ? AND status = ?'
        const params: any[] = [tenantId, catalogItemId, 'active']

        if (locationId) {
            sql += ' AND location_id = ?'
            params.push(locationId)
        }

        const rows = db.prepare(sql).all(...params) as any[]
        return rows.map(this.mapLot)
    }

    private updateProjection(tenantId: string, catalogItemId: string, locationId: string, quantityDelta: number, costDelta: number, eventHash: string, eventTime: string) {
        const db = DatabaseManager.getDatabase()
        const existing = db.prepare('SELECT * FROM inventory_projections WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?')
            .get(tenantId, catalogItemId, locationId) as any

        if (existing) {
            const newQty = existing.quantity_on_hand + quantityDelta
            const newCost = existing.total_cost + (quantityDelta * costDelta)
            const avgCost = newQty > 0 ? newCost / newQty : 0

            db.prepare(`
                UPDATE inventory_projections 
                SET quantity_on_hand = ?, quantity_available = quantity_on_hand - quantity_reserved,
                    total_cost = ?, avg_unit_cost = ?, last_event_hash = ?, last_event_at = ?, updated_at = ?
                WHERE id = ?
            `).run(newQty, newCost, avgCost, eventHash, eventTime, eventTime, existing.id)
        } else {
            const id = `PROJ-${randomUUID().substring(0, 8)}`
            db.prepare(`
                INSERT INTO inventory_projections 
                (id, tenant_id, catalog_item_id, location_id, quantity_on_hand, quantity_reserved, quantity_available,
                 total_cost, avg_unit_cost, last_event_hash, last_event_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
            `).run(id, tenantId, catalogItemId, locationId, quantityDelta, quantityDelta, quantityDelta * costDelta, costDelta, eventHash, eventTime, eventTime)
        }
    }

    private updateProjectionReserve(tenantId: string, catalogItemId: string, locationId: string, reserveQty: number, eventHash: string, eventTime: string) {
        const db = DatabaseManager.getDatabase()
        db.prepare(`
            UPDATE inventory_projections 
            SET quantity_reserved = quantity_reserved + ?, 
                quantity_available = quantity_on_hand - (quantity_reserved + ?),
                last_event_hash = ?, last_event_at = ?, updated_at = ?
            WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
        `).run(reserveQty, reserveQty, eventHash, eventTime, eventTime, tenantId, catalogItemId, locationId)
    }

    private updateProjectionSell(tenantId: string, catalogItemId: string, locationId: string, soldQty: number, unitCost: number, eventHash: string, eventTime: string) {
        const db = DatabaseManager.getDatabase()
        db.prepare(`
            UPDATE inventory_projections 
            SET quantity_on_hand = quantity_on_hand - ?, 
                quantity_reserved = quantity_reserved - ?,
                quantity_available = (quantity_on_hand - ?) - (quantity_reserved - ?),
                total_cost = total_cost - ?,
                last_event_hash = ?, last_event_at = ?, updated_at = ?
            WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
        `).run(soldQty, soldQty, soldQty, soldQty, soldQty * unitCost, eventHash, eventTime, eventTime, tenantId, catalogItemId, locationId)
    }

    private mapLocation(row: any): InventoryLocation {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            name: row.name,
            type: row.type,
            address: row.address,
            did: row.did,
            status: row.status,
            createdAt: row.created_at
        }
    }

    // --------------------------------------------------------------------------
    // Analytics
    // --------------------------------------------------------------------------

    async getValuation(tenantId: string): Promise<{ totalValue: number, currency: string, byLocation: any[] }> {
        const db = DatabaseManager.getDatabase()
        const lots = db.prepare(`
            SELECT location_id, currency, SUM(quantity_on_hand * unit_cost) as value
            FROM inventory_lots
            WHERE tenant_id = ? AND quantity_on_hand > 0
            GROUP BY location_id, currency
        `).all(tenantId) as any[]

        const totalValue = lots.reduce((sum, l) => sum + (l.value || 0), 0)

        return {
            totalValue,
            currency: lots[0]?.currency || 'USD',
            byLocation: lots
        }
    }

    async getAging(tenantId: string): Promise<any[]> {
        const db = DatabaseManager.getDatabase()
        const lots = db.prepare(`
            SELECT 
                CASE 
                    WHEN (julianday('now') - julianday(received_at)) <= 30 THEN '0-30 days'
                    WHEN (julianday('now') - julianday(received_at)) <= 60 THEN '31-60 days'
                    WHEN (julianday('now') - julianday(received_at)) <= 90 THEN '61-90 days'
                    ELSE '90+ days'
                END as age_bucket,
                SUM(quantity_on_hand * unit_cost) as value,
                AVG(julianday('now') - julianday(received_at)) as avg_days,
                COUNT(*) as lot_count
            FROM inventory_lots
            WHERE tenant_id = ? AND quantity_on_hand > 0
            GROUP BY age_bucket
        `).all(tenantId) as any[]
        return lots
    }

    async getProfitAnalytics(tenantId: string): Promise<any> {
        const db = DatabaseManager.getDatabase()

        // Detailed profit analysis by joining lots with catalog items
        const results = db.prepare(`
            SELECT 
                c.title as item_name,
                c.sku,
                SUM(l.quantity_on_hand) as total_qty,
                AVG(l.unit_cost) as avg_cost,
                c.price as selling_price,
                SUM(l.quantity_on_hand * (c.price - l.unit_cost)) as projected_profit,
                AVG(julianday('now') - julianday(l.received_at)) as avg_days_in_stock
            FROM inventory_lots l
            JOIN catalog_items c ON l.catalog_item_id = c.id
            WHERE l.tenant_id = ? AND l.quantity_on_hand > 0
            GROUP BY c.id
            ORDER BY projected_profit DESC
        `).all(tenantId) as any[]

        const totals = results.reduce((acc, r) => ({
            totalProfit: acc.totalProfit + r.projected_profit,
            totalItems: acc.totalItems + r.total_qty
        }), { totalProfit: 0, totalItems: 0 })

        return {
            items: results,
            summary: {
                ...totals,
                overallMargin: totals.totalProfit > 0 ? (totals.totalProfit / results.reduce((s, r) => s + (r.selling_price * r.total_qty), 0)) * 100 : 0
            }
        }
    }

    private mapLot(row: any): InventoryLot {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            catalogItemId: row.catalog_item_id,
            locationId: row.location_id,
            lotNumber: row.lot_number,
            serialNumber: row.serial_number,
            barcode: row.barcode,
            quantityInitial: row.quantity_initial,
            quantityOnHand: row.quantity_on_hand,
            quantityReserved: row.quantity_reserved,
            quantityAvailable: row.quantity_available,
            unitCost: row.unit_cost,
            currency: row.currency,
            expiryDate: row.expiry_date,
            receivedAt: row.received_at,
            supplierId: row.supplier_id,
            supplierInvoiceRef: row.supplier_invoice_ref,
            grnVcId: row.grn_vc_id,
            status: row.status,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            createdAt: row.created_at
        }
    }

    private mapEvent(row: any): InventoryEvent {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            eventType: row.event_type,
            catalogItemId: row.catalog_item_id,
            lotId: row.lot_id,
            locationId: row.location_id,
            quantity: row.quantity,
            unitCost: row.unit_cost,
            currency: row.currency,
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            counterpartyId: row.counterparty_id,
            eventHash: row.event_hash,
            prevEventHash: row.prev_event_hash,
            sequenceNumber: row.sequence_number,
            vcId: row.vc_id,
            vcType: row.vc_type,
            actorId: row.actor_id,
            reason: row.reason,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            createdAt: row.created_at
        }
    }

    private mapProjection(row: any): StockLevel {
        return {
            catalogItemId: row.catalog_item_id,
            locationId: row.location_id,
            quantityOnHand: row.quantity_on_hand,
            quantityReserved: row.quantity_reserved,
            quantityAvailable: row.quantity_available,
            totalCost: row.total_cost,
            avgUnitCost: row.avg_unit_cost,
            lastEventHash: row.last_event_hash,
            lastEventAt: row.last_event_at
        }
    }
}

// Singleton export
export const inventoryService = new InventoryService()

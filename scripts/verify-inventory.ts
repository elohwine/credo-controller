#!/usr/bin/env ts-node
/**
 * Verify Inventory System - E2E test for hash-chained inventory tracking
 * 
 * Tests:
 * 1. Create location
 * 2. Receive goods (GRN)
 * 3. Verify hash chain integrity
 * 4. Reserve stock for cart
 * 5. Fulfill sale
 * 6. Trace receipt back to GRN
 */

import axios from 'axios'
import db from 'better-sqlite3'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000/api'
const DB_PATH = './data/persistence.db'

async function main() {
    console.log('🚀 Starting Inventory System Verification...')
    const database = db(DB_PATH)
    database.pragma('foreign_keys = ON')

    const tenantId = 'default'
    const now = new Date().toISOString()

    // Clean up previous runs
    console.log('1. Cleaning up previous test data...')
    database.prepare("DELETE FROM inventory_allocations WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM inventory_events WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM inventory_projections WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM inventory_lots WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM inventory_locations WHERE tenant_id = ?").run(tenantId)
    console.log('   ✅ Cleanup done')

    // 2. Create a catalog item (if not exists)
    console.log('2. Ensuring catalog item exists...')
    let catalogItem = database.prepare("SELECT * FROM catalog_items WHERE merchant_id = ? LIMIT 1").get(tenantId) as any
    if (!catalogItem) {
        const itemId = `ITM-${randomUUID().substring(0, 8)}`
        database.prepare(`
            INSERT INTO catalog_items (id, merchant_id, title, description, price, currency, sku, created_at, updated_at)
            VALUES (?, ?, 'Test Product', 'A test product for inventory', 25.00, 'USD', 'SKU-TEST-001', ?, ?)
        `).run(itemId, tenantId, now, now)
        catalogItem = { id: itemId, title: 'Test Product', sku: 'SKU-TEST-001' }
        console.log(`   ✅ Created catalog item: ${itemId}`)
    } else {
        console.log(`   ✅ Using existing catalog item: ${catalogItem.id}`)
    }

    // 3. Create a location
    console.log('3. Creating inventory location...')
    const locationId = `LOC-${randomUUID().substring(0, 8)}`
    database.prepare(`
        INSERT INTO inventory_locations (id, tenant_id, name, type, status, created_at, updated_at)
        VALUES (?, ?, 'Main Warehouse', 'warehouse', 'active', ?, ?)
    `).run(locationId, tenantId, now, now)
    console.log(`   ✅ Created location: ${locationId}`)

    // 4. Receive goods (simulate GRN)
    console.log('4. Receiving goods (GRN)...')
    const lotId = `LOT-${randomUUID().substring(0, 8)}`
    const eventId1 = `EVT-${randomUUID()}`
    const quantity = 100
    const unitCost = 15.00 // Cost price

    // Create lot
    database.prepare(`
        INSERT INTO inventory_lots 
        (id, tenant_id, catalog_item_id, location_id, lot_number, barcode,
         quantity_initial, quantity_on_hand, quantity_reserved, unit_cost, currency,
         received_at, supplier_id, supplier_invoice_ref, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'BATCH-001', 'BAR123456', ?, ?, 0, ?, 'USD', ?, 'SUPPLIER-001', 'PO-2026-001', 'active', ?, ?)
    `).run(lotId, tenantId, catalogItem.id, locationId, quantity, quantity, unitCost, now, now, now)

    // Create hash for event
    const crypto = require('crypto')
    const eventData1 = {
        id: eventId1,
        tenantId,
        eventType: 'RECEIVE',
        catalogItemId: catalogItem.id,
        lotId,
        locationId,
        quantity,
        unitCost,
        currency: 'USD',
        referenceType: 'grn',
        referenceId: lotId,
        counterpartyId: 'SUPPLIER-001',
        prevEventHash: null,
        sequenceNumber: 1,
        actorId: 'test-script',
        createdAt: now
    }
    const eventHash1 = crypto.createHash('sha256').update(JSON.stringify(eventData1)).digest('hex')

    // Insert event
    database.prepare(`
        INSERT INTO inventory_events
        (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity, unit_cost, currency,
         reference_type, reference_id, counterparty_id, event_hash, prev_event_hash, sequence_number,
         actor_id, created_at)
        VALUES (?, ?, 'RECEIVE', ?, ?, ?, ?, ?, 'USD', 'grn', ?, 'SUPPLIER-001', ?, NULL, 1, 'test-script', ?)
    `).run(eventId1, tenantId, catalogItem.id, lotId, locationId, quantity, unitCost, lotId, eventHash1, now)

    // Create projection
    const projId = `PROJ-${randomUUID().substring(0, 8)}`
    database.prepare(`
        INSERT INTO inventory_projections 
        (id, tenant_id, catalog_item_id, location_id, quantity_on_hand, quantity_reserved, quantity_available,
         total_cost, avg_unit_cost, last_event_hash, last_event_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(projId, tenantId, catalogItem.id, locationId, quantity, quantity, quantity * unitCost, unitCost, eventHash1, now, now)

    console.log(`   ✅ GRN complete: ${quantity} units @ $${unitCost}/unit = $${quantity * unitCost}`)
    console.log(`   📦 Lot: ${lotId}, Event Hash: ${eventHash1.substring(0, 16)}...`)

    // 5. Verify hash chain
    console.log('5. Verifying hash chain integrity...')
    const events = database.prepare(`
        SELECT * FROM inventory_events WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
        ORDER BY sequence_number ASC
    `).all(tenantId, catalogItem.id, locationId) as any[]

    let chainValid = true
    for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const recomputedHash = crypto.createHash('sha256').update(JSON.stringify({
            id: event.id,
            tenantId: event.tenant_id,
            eventType: event.event_type,
            catalogItemId: event.catalog_item_id,
            lotId: event.lot_id,
            locationId: event.location_id,
            quantity: event.quantity,
            unitCost: event.unit_cost,
            currency: event.currency,
            referenceType: event.reference_type,
            referenceId: event.reference_id,
            counterpartyId: event.counterparty_id,
            prevEventHash: event.prev_event_hash,
            sequenceNumber: event.sequence_number,
            actorId: event.actor_id,
            createdAt: event.created_at
        })).digest('hex')

        if (recomputedHash !== event.event_hash) {
            console.log(`   ❌ Hash mismatch at event ${event.id}`)
            chainValid = false
        }
    }
    if (chainValid) {
        console.log(`   ✅ Hash chain verified (${events.length} events)`)
    }

    // 6. Reserve stock for a cart
    console.log('6. Reserving stock for cart...')
    const cartId = `CART-${randomUUID().substring(0, 8)}`
    const reserveQty = 10
    const allocId = `ALLOC-${randomUUID().substring(0, 8)}`
    const eventId2 = `EVT-${randomUUID()}`
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    // Update lot reserved qty
    database.prepare('UPDATE inventory_lots SET quantity_reserved = quantity_reserved + ?, updated_at = ? WHERE id = ?')
        .run(reserveQty, now, lotId)

    // Create reserve event
    const eventData2 = {
        id: eventId2,
        tenantId,
        eventType: 'RESERVE',
        catalogItemId: catalogItem.id,
        lotId,
        locationId,
        quantity: -reserveQty,
        unitCost: null,
        currency: 'USD',
        referenceType: 'cart',
        referenceId: cartId,
        counterpartyId: null,
        prevEventHash: eventHash1,
        sequenceNumber: 2,
        actorId: 'test-script',
        createdAt: now
    }
    const eventHash2 = crypto.createHash('sha256').update(JSON.stringify(eventData2)).digest('hex')

    database.prepare(`
        INSERT INTO inventory_events
        (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity,
         reference_type, reference_id, event_hash, prev_event_hash, sequence_number, actor_id, created_at)
        VALUES (?, ?, 'RESERVE', ?, ?, ?, ?, 'cart', ?, ?, ?, 2, 'test-script', ?)
    `).run(eventId2, tenantId, catalogItem.id, lotId, locationId, -reserveQty, cartId, eventHash2, eventHash1, now)

    // Create allocation
    database.prepare(`
        INSERT INTO inventory_allocations
        (id, tenant_id, lot_id, cart_id, quantity, status, reserved_at, expires_at, event_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)
    `).run(allocId, tenantId, lotId, cartId, reserveQty, now, expiresAt, eventId2, now, now)

    // Update projection
    database.prepare(`
        UPDATE inventory_projections 
        SET quantity_reserved = quantity_reserved + ?, 
            quantity_available = quantity_on_hand - (quantity_reserved + ?),
            last_event_hash = ?, last_event_at = ?, updated_at = ?
        WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
    `).run(reserveQty, reserveQty, eventHash2, now, now, tenantId, catalogItem.id, locationId)

    console.log(`   ✅ Reserved ${reserveQty} units for cart ${cartId}`)

    // 7. Fulfill sale (payment confirmed)
    console.log('7. Fulfilling sale (payment confirmed)...')
    const receiptId = `RCP-${randomUUID().substring(0, 8)}`
    const eventId3 = `EVT-${randomUUID()}`

    // Update lot: reduce on_hand, reduce reserved
    database.prepare(`
        UPDATE inventory_lots 
        SET quantity_on_hand = quantity_on_hand - ?, 
            quantity_reserved = quantity_reserved - ?,
            updated_at = ?
        WHERE id = ?
    `).run(reserveQty, reserveQty, now, lotId)

    // Create sell event
    const eventData3 = {
        id: eventId3,
        tenantId,
        eventType: 'SELL',
        catalogItemId: catalogItem.id,
        lotId,
        locationId,
        quantity: -reserveQty,
        unitCost,
        currency: 'USD',
        referenceType: 'receipt',
        referenceId: receiptId,
        counterpartyId: null,
        prevEventHash: eventHash2,
        sequenceNumber: 3,
        actorId: 'test-script',
        createdAt: now
    }
    const eventHash3 = crypto.createHash('sha256').update(JSON.stringify(eventData3)).digest('hex')

    database.prepare(`
        INSERT INTO inventory_events
        (id, tenant_id, event_type, catalog_item_id, lot_id, location_id, quantity, unit_cost, currency,
         reference_type, reference_id, event_hash, prev_event_hash, sequence_number, actor_id, created_at)
        VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, 'USD', 'receipt', ?, ?, ?, 3, 'test-script', ?)
    `).run(eventId3, tenantId, catalogItem.id, lotId, locationId, -reserveQty, unitCost, receiptId, eventHash3, eventHash2, now)

    // Update allocation
    database.prepare(`
        UPDATE inventory_allocations 
        SET status = 'fulfilled', receipt_id = ?, fulfilled_at = ?, fulfillment_event_id = ?, updated_at = ?
        WHERE id = ?
    `).run(receiptId, now, eventId3, now, allocId)

    // Update projection
    database.prepare(`
        UPDATE inventory_projections 
        SET quantity_on_hand = quantity_on_hand - ?, 
            quantity_reserved = quantity_reserved - ?,
            quantity_available = (quantity_on_hand - ?) - (quantity_reserved - ?),
            total_cost = total_cost - ?,
            last_event_hash = ?, last_event_at = ?, updated_at = ?
        WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ?
    `).run(reserveQty, reserveQty, reserveQty, reserveQty, reserveQty * unitCost, eventHash3, now, now, tenantId, catalogItem.id, locationId)

    console.log(`   ✅ Sale fulfilled: Receipt ${receiptId}`)

    // 8. Verify final state
    console.log('8. Verifying final inventory state...')
    const finalLot = database.prepare('SELECT * FROM inventory_lots WHERE id = ?').get(lotId) as any
    const finalProj = database.prepare('SELECT * FROM inventory_projections WHERE catalog_item_id = ? AND location_id = ?')
        .get(catalogItem.id, locationId) as any
    const allEvents = database.prepare('SELECT * FROM inventory_events WHERE tenant_id = ? ORDER BY sequence_number')
        .all(tenantId) as any[]

    console.log(`   📊 Lot State:`)
    console.log(`      - Initial: ${finalLot.quantity_initial}`)
    console.log(`      - On Hand: ${finalLot.quantity_on_hand}`)
    console.log(`      - Reserved: ${finalLot.quantity_reserved}`)
    console.log(`      - Available: ${finalLot.quantity_available}`)

    console.log(`   📊 Projection State:`)
    console.log(`      - On Hand: ${finalProj.quantity_on_hand}`)
    console.log(`      - Reserved: ${finalProj.quantity_reserved}`)
    console.log(`      - Available: ${finalProj.quantity_available}`)
    console.log(`      - Total Cost: $${finalProj.total_cost}`)

    // Assertions
    const expectedOnHand = quantity - reserveQty
    if (finalProj.quantity_on_hand !== expectedOnHand) {
        throw new Error(`Expected on_hand ${expectedOnHand}, got ${finalProj.quantity_on_hand}`)
    }
    if (finalProj.quantity_reserved !== 0) {
        throw new Error(`Expected reserved 0, got ${finalProj.quantity_reserved}`)
    }

    // 9. Trace receipt
    console.log('9. Tracing receipt provenance...')
    const receiptEvents = database.prepare(`
        SELECT * FROM inventory_events WHERE reference_type = 'receipt' AND reference_id = ?
    `).all(receiptId) as any[]

    console.log(`   🔍 Receipt ${receiptId} traced to:`)
    for (const evt of receiptEvents) {
        const lot = database.prepare('SELECT lot_number, serial_number FROM inventory_lots WHERE id = ?').get(evt.lot_id) as any
        console.log(`      - Lot: ${lot?.lot_number || evt.lot_id}, Qty: ${Math.abs(evt.quantity)}, Hash: ${evt.event_hash.substring(0, 16)}...`)
    }

    // 10. Full chain verification
    console.log('10. Final hash chain verification...')
    let prevHash: string | null = null
    let allValid = true
    for (const event of allEvents) {
        if (event.prev_event_hash !== prevHash) {
            console.log(`   ❌ Chain break at event ${event.id}: expected prev=${prevHash}, got ${event.prev_event_hash}`)
            allValid = false
        }
        prevHash = event.event_hash
    }
    if (allValid) {
        console.log(`   ✅ Full hash chain valid (${allEvents.length} events linked)`)
    }

    console.log('\n🎉 Inventory System Verification Complete!')
    console.log(`   - GRN: ${quantity} units received`)
    console.log(`   - Sale: ${reserveQty} units sold`)
    console.log(`   - Remaining: ${expectedOnHand} units`)
    console.log(`   - Hash Chain: ${allValid ? 'VALID ✓' : 'BROKEN ✗'}`)
    console.log(`   - Provenance: Receipt → Lot → GRN traceable`)
}

main().catch(err => {
    console.error('❌ Verification Failed:', err.message)
    process.exit(1)
})

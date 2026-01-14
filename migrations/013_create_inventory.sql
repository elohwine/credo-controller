-- Migration: 013_create_inventory.sql
-- Description: Inventory management with hash-chained event ledger for cryptographic verification
-- Phase 1 Extension: Ties catalog items to traceable inventory events (receive → sell → receipt)

-- Locations (warehouses, shops, virtual bins)
CREATE TABLE IF NOT EXISTS inventory_locations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'warehouse', -- 'warehouse', 'shop', 'transit', 'virtual'
    address TEXT,
    did TEXT, -- Optional DID for location (for VC subjects)
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_locations_tenant ON inventory_locations(tenant_id);

-- Inventory Lots (batch/lot tracking with optional serial)
-- Each lot represents a batch of items received together (same supplier, date, cost)
CREATE TABLE IF NOT EXISTS inventory_lots (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    catalog_item_id TEXT NOT NULL, -- FK to catalog_items.id (SKU reference)
    location_id TEXT NOT NULL,     -- FK to inventory_locations.id
    lot_number TEXT,               -- Supplier lot/batch number (optional)
    serial_number TEXT,            -- Unique serial for unit-level tracking (optional)
    barcode TEXT,                  -- Scannable barcode (EAN/UPC/QR)
    quantity_initial REAL NOT NULL DEFAULT 0,
    quantity_on_hand REAL NOT NULL DEFAULT 0,
    quantity_reserved REAL NOT NULL DEFAULT 0,
    quantity_available REAL GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
    unit_cost REAL,                -- Cost per unit at receipt (for FIFO/margin)
    currency TEXT NOT NULL DEFAULT 'USD',
    expiry_date DATE,              -- For perishables
    received_at DATETIME,
    supplier_id TEXT,              -- Optional reference to supplier
    supplier_invoice_ref TEXT,     -- Supplier invoice/PO reference
    grn_vc_id TEXT,                -- GoodsReceivedVC credential ID (cryptographic anchor)
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'depleted', 'expired', 'quarantine'
    metadata TEXT,                 -- JSON for custom attributes
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_lots_tenant ON inventory_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_lots_item ON inventory_lots(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_lots_location ON inventory_lots(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_lots_barcode ON inventory_lots(barcode);
CREATE INDEX IF NOT EXISTS idx_inv_lots_serial ON inventory_lots(serial_number);
CREATE INDEX IF NOT EXISTS idx_inv_lots_lot ON inventory_lots(lot_number);

-- Inventory Events (append-only ledger with hash chain for tamper evidence)
-- This is the source of truth; projections/lots are derived from this
CREATE TABLE IF NOT EXISTS inventory_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    event_type TEXT NOT NULL,      -- 'RECEIVE', 'TRANSFER_OUT', 'TRANSFER_IN', 'RESERVE', 'UNRESERVE', 'SELL', 'ADJUST', 'RETURN', 'WRITE_OFF'
    catalog_item_id TEXT NOT NULL,
    lot_id TEXT,                   -- FK to inventory_lots.id (null for initial receive before lot created)
    location_id TEXT NOT NULL,
    quantity REAL NOT NULL,        -- Positive for in, negative for out
    unit_cost REAL,                -- Cost snapshot at event time
    currency TEXT DEFAULT 'USD',
    
    -- References to related entities
    reference_type TEXT,           -- 'cart', 'invoice', 'receipt', 'transfer', 'adjustment', 'grn', 'return'
    reference_id TEXT,             -- ID of related cart/invoice/receipt/etc
    counterparty_id TEXT,          -- Supplier/customer/location DID or ID
    
    -- Hash chain for cryptographic verification
    event_hash TEXT NOT NULL,      -- SHA-256 of this event's data
    prev_event_hash TEXT,          -- Hash of previous event in this item+location stream
    sequence_number INTEGER,       -- Monotonic sequence per tenant+item+location
    
    -- VC anchor (optional - for events that warrant a VC)
    vc_id TEXT,                    -- Credential ID if a VC was issued for this event
    vc_type TEXT,                  -- 'GoodsReceivedVC', 'StockTransferVC', 'SaleFulfillmentVC', etc
    
    -- Audit trail
    actor_id TEXT,                 -- User/system that created event
    reason TEXT,                   -- Human-readable reason (for adjustments)
    metadata TEXT,                 -- JSON for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_events_tenant ON inventory_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_item ON inventory_events(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_lot ON inventory_events(lot_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_location ON inventory_events(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_type ON inventory_events(event_type);
CREATE INDEX IF NOT EXISTS idx_inv_events_ref ON inventory_events(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_hash ON inventory_events(event_hash);
CREATE INDEX IF NOT EXISTS idx_inv_events_created ON inventory_events(created_at);

-- Inventory Allocations (reservations linked to carts/invoices)
-- Tracks which lots are reserved for pending sales
CREATE TABLE IF NOT EXISTS inventory_allocations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    lot_id TEXT NOT NULL,
    cart_id TEXT,                  -- Cart that reserved this
    invoice_id TEXT,               -- Invoice after cart conversion
    receipt_id TEXT,               -- Receipt after payment (fulfillment complete)
    quantity REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved', 'fulfilled', 'released', 'expired'
    reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at DATETIME,
    expires_at DATETIME,           -- Auto-release if not fulfilled
    event_id TEXT,                 -- FK to the RESERVE event
    fulfillment_event_id TEXT,     -- FK to the SELL event
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lot_id) REFERENCES inventory_lots(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_alloc_tenant ON inventory_allocations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_lot ON inventory_allocations(lot_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_cart ON inventory_allocations(cart_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_invoice ON inventory_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_receipt ON inventory_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_status ON inventory_allocations(status);

-- Materialized view: Current stock levels per item+location (for fast queries)
-- This is updated by triggers/service on each event
CREATE TABLE IF NOT EXISTS inventory_projections (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    catalog_item_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    quantity_on_hand REAL NOT NULL DEFAULT 0,
    quantity_reserved REAL NOT NULL DEFAULT 0,
    quantity_available REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0, -- Sum of (qty * unit_cost) for valuation
    avg_unit_cost REAL,                 -- Weighted average cost
    last_event_hash TEXT,               -- Hash of last event (for verification)
    last_event_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, catalog_item_id, location_id),
    FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_proj_tenant ON inventory_projections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_proj_item ON inventory_projections(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_proj_location ON inventory_projections(location_id);

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { StatusListAllocatorService, STATUS_LIST_MIN_SIZE } from '../StatusListAllocatorService'

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER, name TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS credential_status_lists (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, issuer_ref TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('revocation', 'suspension')),
  list_size INTEGER NOT NULL DEFAULT 131072, allocated_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sealed')),
  signed_vc_json TEXT, published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS credential_status_allocations (
  id TEXT PRIMARY KEY, status_list_id TEXT NOT NULL, status_index INTEGER NOT NULL,
  organization_id TEXT NOT NULL, issuer_ref TEXT NOT NULL, purpose TEXT NOT NULL,
  issued_credential_ref TEXT,
  current_status TEXT NOT NULL DEFAULT 'valid' CHECK (current_status IN ('valid', 'revoked', 'suspended')),
  allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP, status_updated_at DATETIME,
  UNIQUE (status_list_id, status_index)
);
`

function initTestDb() {
  const dbPath = path.join(tmpdir(), `test-status-${randomUUID()}.db`)
  const db = new Database(dbPath)
  db.exec(MIGRATION_SQL)
  ;(DatabaseManager as any).instance = db
  return db
}

describe('StatusListAllocatorService', () => {
  let service: StatusListAllocatorService
  let organizationId: string
  let db: Database.Database

  beforeEach(() => {
    db = initTestDb()
    organizationId = randomUUID()
    db.prepare(`INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, 'Test Org', 'active')`).run(
      organizationId,
      `tenant-${organizationId}`,
    )
    service = new StatusListAllocatorService()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  // ── Allocation basics ───────────────────────────────────────────────────────

  it('allocates an index for a new issuer/purpose pair', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer1', 'revocation')
    expect(allocation.statusIndex).toBeGreaterThanOrEqual(0)
    expect(allocation.statusIndex).toBeLessThan(STATUS_LIST_MIN_SIZE)
    expect(allocation.entry.type).toBe('BitstringStatusListEntry')
    expect(allocation.entry.statusPurpose).toBe('revocation')
    expect(allocation.entry.statusListIndex).toBe(String(allocation.statusIndex))
    expect(allocation.entry.statusListCredential).toContain(allocation.statusListId)
  })

  it('creates a new status list on the first allocation', () => {
    service.allocate(organizationId, 'did:key:issuer2', 'revocation')
    const row = db
      .prepare(`SELECT * FROM credential_status_lists WHERE organization_id = ? AND issuer_ref = ?`)
      .get(organizationId, 'did:key:issuer2') as any
    expect(row).toBeDefined()
    expect(row.list_size).toBe(STATUS_LIST_MIN_SIZE)
    expect(row.allocated_count).toBe(1)
  })

  it('reuses the same status list for subsequent allocations', () => {
    const a1 = service.allocate(organizationId, 'did:key:issuer3', 'revocation')
    const a2 = service.allocate(organizationId, 'did:key:issuer3', 'revocation')
    expect(a1.statusListId).toBe(a2.statusListId)
    expect(a1.statusIndex).not.toBe(a2.statusIndex)
  })

  it('uses separate lists for different purposes', () => {
    const rev = service.allocate(organizationId, 'did:key:issuer4', 'revocation')
    const sus = service.allocate(organizationId, 'did:key:issuer4', 'suspension')
    expect(rev.statusListId).not.toBe(sus.statusListId)
  })

  it('does not assign the same index twice', () => {
    const indexes = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const a = service.allocate(organizationId, 'did:key:issuer5', 'revocation')
      expect(indexes.has(a.statusIndex)).toBe(false)
      indexes.add(a.statusIndex)
    }
  })

  // ── Status operations ───────────────────────────────────────────────────────

  it('revokes an allocation and reflects it in the bitstring', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer6', 'revocation')
    service.revoke(allocation.allocationId)

    const buf = service.buildBitstringBuffer(allocation.statusListId)
    const byteIndex = Math.floor(allocation.statusIndex / 8)
    const bitPosition = 7 - (allocation.statusIndex % 8)
    const bit = (buf[byteIndex] >> bitPosition) & 1
    expect(bit).toBe(1)
  })

  it('keeps a valid allocation as zero bits in the bitstring', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer7', 'revocation')
    const buf = service.buildBitstringBuffer(allocation.statusListId)
    const byteIndex = Math.floor(allocation.statusIndex / 8)
    const bitPosition = 7 - (allocation.statusIndex % 8)
    const bit = (buf[byteIndex] >> bitPosition) & 1
    expect(bit).toBe(0)
  })

  it('can reactivate a previously revoked allocation', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer8', 'revocation')
    service.revoke(allocation.allocationId)
    service.reactivate(allocation.allocationId)

    const buf = service.buildBitstringBuffer(allocation.statusListId)
    const byteIndex = Math.floor(allocation.statusIndex / 8)
    const bitPosition = 7 - (allocation.statusIndex % 8)
    const bit = (buf[byteIndex] >> bitPosition) & 1
    expect(bit).toBe(0)
  })

  it('invalidates cached signed_vc_json when status changes', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer9', 'revocation')
    // Manually set a cached VC
    db.prepare(`UPDATE credential_status_lists SET signed_vc_json = 'fake-vc' WHERE id = ?`).run(
      allocation.statusListId,
    )
    service.revoke(allocation.allocationId)
    const row = db
      .prepare(`SELECT signed_vc_json FROM credential_status_lists WHERE id = ?`)
      .get(allocation.statusListId) as any
    expect(row.signed_vc_json).toBeNull()
  })

  // ── Bitstring encoding ──────────────────────────────────────────────────────

  it('produces a multibase-u encoded string', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer10', 'revocation')
    const buf = service.buildBitstringBuffer(allocation.statusListId)
    const encoded = service.encodeList(buf)
    expect(encoded.startsWith('u')).toBe(true)
  })

  it('produces at least STATUS_LIST_MIN_SIZE / 8 bytes in the buffer', () => {
    const allocation = service.allocate(organizationId, 'did:key:issuer11', 'revocation')
    const buf = service.buildBitstringBuffer(allocation.statusListId)
    expect(buf.length).toBeGreaterThanOrEqual(STATUS_LIST_MIN_SIZE / 8)
  })

  // ── allocateForTenant ───────────────────────────────────────────────────────

  it('allocateForTenant resolves org from tenantId and allocates', () => {
    const tenantId = `tenant-${organizationId}`
    const allocation = service.allocateForTenant(tenantId, 'did:key:issuer12', 'revocation')
    expect(allocation).not.toBeNull()
    expect(allocation!.statusIndex).toBeGreaterThanOrEqual(0)
  })

  it('allocateForTenant returns null for unknown tenantId', () => {
    const result = service.allocateForTenant('tenant-unknown-xyz', 'did:key:issuer13', 'revocation')
    expect(result).toBeNull()
  })
})

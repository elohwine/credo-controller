/**
 * DID Repository - Persistent storage for DID metadata
 * Replaces in-memory didStore with SQLite-backed persistence
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface DidRecord {
  id: string
  tenantId: string
  did: string
  publicKeyBase58: string
  keyType: string
  keyRef: string
  method: string
  createdAt?: Date
  updatedAt?: Date
}

export class DidRepository {
  private logger = rootLogger.child({ module: 'DidRepository' })

  /**
   * Save or update DID record
   */
  save(record: DidRecord): void {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO dids (
        id, tenant_id, did, public_key_base58, key_type, key_ref, method, created_at, updated_at
      ) VALUES (
        @id, @tenantId, @did, @publicKeyBase58, @keyType, @keyRef, @method, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        public_key_base58 = @publicKeyBase58,
        key_type = @keyType,
        key_ref = @keyRef,
        method = @method,
        updated_at = CURRENT_TIMESTAMP
    `)

    try {
      stmt.run({
        id: record.id,
        tenantId: record.tenantId,
        did: record.did,
        publicKeyBase58: record.publicKeyBase58,
        keyType: record.keyType,
        keyRef: record.keyRef,
        method: record.method,
      })

      this.logger.debug(`Saved DID: ${record.did} for tenant: ${record.tenantId}`)
    } catch (error) {
      this.logger.error({ error, did: record.did }, 'Failed to save DID')
      throw error
    }
  }

  /**
   * Find DID by DID string
   */
  findByDid(did: string): DidRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, did, public_key_base58 as publicKeyBase58,
        key_type as keyType, key_ref as keyRef, method, created_at as createdAt, updated_at as updatedAt
      FROM dids
      WHERE did = ?
    `)

    const row = stmt.get(did) as DidRecord | undefined

    if (row) {
      this.logger.debug(`Found DID: ${did}`)
    }

    return row
  }

  /**
   * Find DID by ID
   */
  findById(id: string): DidRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, did, public_key_base58 as publicKeyBase58,
        key_type as keyType, key_ref as keyRef, method, created_at as createdAt, updated_at as updatedAt
      FROM dids
      WHERE id = ?
    `)

    return stmt.get(id) as DidRecord | undefined
  }

  /**
   * Find all DIDs for a tenant
   */
  findByTenantId(tenantId: string): DidRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, did, public_key_base58 as publicKeyBase58,
        key_type as keyType, key_ref as keyRef, method, created_at as createdAt, updated_at as updatedAt
      FROM dids
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `)

    return stmt.all(tenantId) as DidRecord[]
  }

  /**
   * Delete DID by ID
   */
  deleteById(id: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM dids WHERE id = ?')
    const result = stmt.run(id)

    const deleted = result.changes > 0
    if (deleted) {
      this.logger.debug(`Deleted DID with id: ${id}`)
    }

    return deleted
  }

  /**
   * Delete all DIDs for a tenant
   */
  deleteByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM dids WHERE tenant_id = ?')
    const result = stmt.run(tenantId)

    this.logger.debug(`Deleted ${result.changes} DIDs for tenant: ${tenantId}`)

    return result.changes
  }

  /**
   * Get count of DIDs for a tenant
   */
  countByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT COUNT(*) as count FROM dids WHERE tenant_id = ?')
    const result = stmt.get(tenantId) as { count: number }

    return result.count
  }

  /**
   * Check if DID exists
   */
  exists(did: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT 1 FROM dids WHERE did = ? LIMIT 1')
    const result = stmt.get(did)

    return !!result
  }

  /**
   * Get all DIDs (use with caution in production)
   */
  findAll(): DidRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, did, public_key_base58 as publicKeyBase58,
        key_type as keyType, key_ref as keyRef, method, created_at as createdAt, updated_at as updatedAt
      FROM dids
      ORDER BY created_at DESC
    `)

    return stmt.all() as DidRecord[]
  }
}

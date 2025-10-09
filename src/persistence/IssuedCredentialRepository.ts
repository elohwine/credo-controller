/**
 * Issued Credential Repository - Persistent storage for issued verifiable credentials
 * Replaces in-memory issuedVcStore with SQLite-backed persistence
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface IssuedCredentialRecord {
  id: string
  tenantId: string
  credentialId: string
  holderDid?: string
  credentialDefinitionId: string
  schemaId?: string
  credentialData: any
  format: string
  revoked: boolean
  revocationReason?: string
  issuedAt?: Date
  revokedAt?: Date
}

export class IssuedCredentialRepository {
  private logger = rootLogger.child({ module: 'IssuedCredentialRepository' })

  /**
   * Save or update issued credential
   */
  save(record: IssuedCredentialRecord): void {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO issued_credentials (
        id, tenant_id, credential_id, holder_did, credential_definition_id,
        schema_id, credential_data, format, revoked, issued_at
      ) VALUES (
        @id, @tenantId, @credentialId, @holderDid, @credentialDefinitionId,
        @schemaId, @credentialData, @format, @revoked, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        holder_did = @holderDid,
        credential_data = @credentialData,
        format = @format,
        revoked = @revoked
    `)

    try {
      stmt.run({
        id: record.id,
        tenantId: record.tenantId,
        credentialId: record.credentialId,
        holderDid: record.holderDid || null,
        credentialDefinitionId: record.credentialDefinitionId,
        schemaId: record.schemaId || null,
        credentialData: JSON.stringify(record.credentialData),
        format: record.format,
        revoked: record.revoked ? 1 : 0,
      })

      this.logger.debug(`Saved issued credential: ${record.credentialId} for tenant: ${record.tenantId}`)
    } catch (error) {
      this.logger.error({ error, credentialId: record.credentialId }, 'Failed to save issued credential')
      throw error
    }
  }

  /**
   * Find credential by credential ID
   */
  findByCredentialId(credentialId: string): IssuedCredentialRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_id as credentialId, holder_did as holderDid,
        credential_definition_id as credentialDefinitionId, schema_id as schemaId,
        credential_data as credentialData, format, revoked, revocation_reason as revocationReason,
        issued_at as issuedAt, revoked_at as revokedAt
      FROM issued_credentials
      WHERE credential_id = ?
    `)

    const row = stmt.get(credentialId) as any

    if (row) {
      return {
        ...row,
        credentialData: JSON.parse(row.credentialData),
        revoked: Boolean(row.revoked),
        issuedAt: row.issuedAt ? new Date(row.issuedAt) : undefined,
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find credential by ID
   */
  findById(id: string): IssuedCredentialRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_id as credentialId, holder_did as holderDid,
        credential_definition_id as credentialDefinitionId, schema_id as schemaId,
        credential_data as credentialData, format, revoked, revocation_reason as revocationReason,
        issued_at as issuedAt, revoked_at as revokedAt
      FROM issued_credentials
      WHERE id = ?
    `)

    const row = stmt.get(id) as any

    if (row) {
      return {
        ...row,
        credentialData: JSON.parse(row.credentialData),
        revoked: Boolean(row.revoked),
        issuedAt: row.issuedAt ? new Date(row.issuedAt) : undefined,
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find all credentials for a tenant
   */
  findByTenantId(tenantId: string): IssuedCredentialRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_id as credentialId, holder_did as holderDid,
        credential_definition_id as credentialDefinitionId, schema_id as schemaId,
        credential_data as credentialData, format, revoked, revocation_reason as revocationReason,
        issued_at as issuedAt, revoked_at as revokedAt
      FROM issued_credentials
      WHERE tenant_id = ?
      ORDER BY issued_at DESC
    `)

    const rows = stmt.all(tenantId) as any[]

    return rows.map((row) => ({
      ...row,
      credentialData: JSON.parse(row.credentialData),
      revoked: Boolean(row.revoked),
      issuedAt: row.issuedAt ? new Date(row.issuedAt) : undefined,
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
    }))
  }

  /**
   * Find credentials by holder DID
   */
  findByHolderDid(holderDid: string): IssuedCredentialRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_id as credentialId, holder_did as holderDid,
        credential_definition_id as credentialDefinitionId, schema_id as schemaId,
        credential_data as credentialData, format, revoked, revocation_reason as revocationReason,
        issued_at as issuedAt, revoked_at as revokedAt
      FROM issued_credentials
      WHERE holder_did = ?
      ORDER BY issued_at DESC
    `)

    const rows = stmt.all(holderDid) as any[]

    return rows.map((row) => ({
      ...row,
      credentialData: JSON.parse(row.credentialData),
      revoked: Boolean(row.revoked),
      issuedAt: row.issuedAt ? new Date(row.issuedAt) : undefined,
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
    }))
  }

  /**
   * Revoke a credential
   */
  revoke(credentialId: string, reason?: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      UPDATE issued_credentials 
      SET revoked = 1, revocation_reason = ?, revoked_at = CURRENT_TIMESTAMP
      WHERE credential_id = ?
    `)

    const result = stmt.run(reason || null, credentialId)

    const updated = result.changes > 0
    if (updated) {
      this.logger.info(`Revoked credential: ${credentialId}${reason ? ` (${reason})` : ''}`)
    }

    return updated
  }

  /**
   * Check if credential is revoked
   */
  isRevoked(credentialId: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT revoked FROM issued_credentials WHERE credential_id = ?')
    const result = stmt.get(credentialId) as { revoked: number } | undefined

    return result ? Boolean(result.revoked) : false
  }

  /**
   * Delete credential by ID
   */
  deleteById(id: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM issued_credentials WHERE id = ?')
    const result = stmt.run(id)

    const deleted = result.changes > 0
    if (deleted) {
      this.logger.debug(`Deleted issued credential: ${id}`)
    }

    return deleted
  }

  /**
   * Delete all credentials for a tenant
   */
  deleteByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM issued_credentials WHERE tenant_id = ?')
    const result = stmt.run(tenantId)

    this.logger.debug(`Deleted ${result.changes} issued credentials for tenant: ${tenantId}`)

    return result.changes
  }

  /**
   * Get count of issued credentials for a tenant
   */
  countByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT COUNT(*) as count FROM issued_credentials WHERE tenant_id = ?')
    const result = stmt.get(tenantId) as { count: number }

    return result.count
  }

  /**
   * Get count of revoked credentials for a tenant
   */
  countRevokedByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT COUNT(*) as count FROM issued_credentials WHERE tenant_id = ? AND revoked = 1')
    const result = stmt.get(tenantId) as { count: number }

    return result.count
  }
}

/**
 * Credential Definition Repository - Persistent storage for credential definitions
 * Replaces in-memory credentialDefinitionStore with SQLite-backed persistence
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface CredentialDefinitionRecord {
  id: string
  tenantId: string
  credentialDefinitionId: string
  schemaId: string
  definitionData: any
  issuerDid: string
  tag?: string
  createdAt?: Date
}

export class CredentialDefinitionRepository {
  private logger = rootLogger.child({ module: 'CredentialDefinitionRepository' })

  /**
   * Save or update credential definition
   */
  save(record: CredentialDefinitionRecord): void {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO credential_definitions (
        id, tenant_id, credential_definition_id, schema_id, definition_data,
        issuer_did, tag, created_at
      ) VALUES (
        @id, @tenantId, @credentialDefinitionId, @schemaId, @definitionData,
        @issuerDid, @tag, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        schema_id = @schemaId,
        definition_data = @definitionData,
        issuer_did = @issuerDid,
        tag = @tag
    `)

    try {
      stmt.run({
        id: record.id,
        tenantId: record.tenantId,
        credentialDefinitionId: record.credentialDefinitionId,
        schemaId: record.schemaId,
        definitionData: JSON.stringify(record.definitionData),
        issuerDid: record.issuerDid,
        tag: record.tag || null,
      })

      this.logger.debug(
        `Saved credential definition: ${record.credentialDefinitionId} for tenant: ${record.tenantId}`,
      )
    } catch (error) {
      this.logger.error(
        { error, credentialDefinitionId: record.credentialDefinitionId },
        'Failed to save credential definition',
      )
      throw error
    }
  }

  /**
   * Find credential definition by definition ID
   */
  findByDefinitionId(credentialDefinitionId: string): CredentialDefinitionRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE credential_definition_id = ?
    `)

    const row = stmt.get(credentialDefinitionId) as any

    if (row) {
      return {
        ...row,
        definitionData: JSON.parse(row.definitionData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find credential definition by ID
   */
  findById(id: string): CredentialDefinitionRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE id = ?
    `)

    const row = stmt.get(id) as any

    if (row) {
      return {
        ...row,
        definitionData: JSON.parse(row.definitionData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find all credential definitions for a tenant
   */
  findByTenantId(tenantId: string): CredentialDefinitionRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(tenantId) as any[]

    return rows.map((row) => ({
      ...row,
      definitionData: JSON.parse(row.definitionData),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }))
  }

  /**
   * Find credential definitions by schema ID
   */
  findBySchemaId(schemaId: string): CredentialDefinitionRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE schema_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(schemaId) as any[]

    return rows.map((row) => ({
      ...row,
      definitionData: JSON.parse(row.definitionData),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }))
  }

  /**
   * Find credential definition by tenant and definition ID (unique combination)
   */
  findByTenantAndDefinitionId(tenantId: string, credentialDefinitionId: string): CredentialDefinitionRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE tenant_id = ? AND credential_definition_id = ?
    `)

    const row = stmt.get(tenantId, credentialDefinitionId) as any

    if (row) {
      return {
        ...row,
        definitionData: JSON.parse(row.definitionData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find credential definitions by issuer DID
   */
  findByIssuerDid(issuerDid: string): CredentialDefinitionRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, credential_definition_id as credentialDefinitionId,
        schema_id as schemaId, definition_data as definitionData, issuer_did as issuerDid,
        tag, created_at as createdAt
      FROM credential_definitions
      WHERE issuer_did = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(issuerDid) as any[]

    return rows.map((row) => ({
      ...row,
      definitionData: JSON.parse(row.definitionData),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }))
  }

  /**
   * Delete credential definition by ID
   */
  deleteById(id: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM credential_definitions WHERE id = ?')
    const result = stmt.run(id)

    const deleted = result.changes > 0
    if (deleted) {
      this.logger.debug(`Deleted credential definition: ${id}`)
    }

    return deleted
  }

  /**
   * Delete all credential definitions for a tenant
   */
  deleteByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM credential_definitions WHERE tenant_id = ?')
    const result = stmt.run(tenantId)

    this.logger.debug(`Deleted ${result.changes} credential definitions for tenant: ${tenantId}`)

    return result.changes
  }

  /**
   * Get count of credential definitions for a tenant
   */
  countByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT COUNT(*) as count FROM credential_definitions WHERE tenant_id = ?')
    const result = stmt.get(tenantId) as { count: number }

    return result.count
  }

  /**
   * Check if credential definition exists
   */
  exists(credentialDefinitionId: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT 1 FROM credential_definitions WHERE credential_definition_id = ? LIMIT 1')
    const result = stmt.get(credentialDefinitionId)

    return !!result
  }
}

/**
 * Schema Repository - Persistent storage for JSON schemas
 * Replaces in-memory schemaStore with SQLite-backed persistence
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface SchemaRecord {
  id: string
  tenantId: string
  schemaId: string
  schemaData: any
  name: string
  version: string
  createdAt?: Date
}

export class SchemaRepository {
  private logger = rootLogger.child({ module: 'SchemaRepository' })

  /**
   * Save or update schema
   */
  save(record: SchemaRecord): void {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO json_schemas (
        id, tenant_id, schema_id, schema_data, name, version, created_at
      ) VALUES (
        @id, @tenantId, @schemaId, @schemaData, @name, @version, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        schema_data = @schemaData,
        name = @name,
        version = @version
    `)

    try {
      stmt.run({
        id: record.id,
        tenantId: record.tenantId,
        schemaId: record.schemaId,
        schemaData: JSON.stringify(record.schemaData),
        name: record.name,
        version: record.version,
      })

      this.logger.debug(`Saved schema: ${record.schemaId} for tenant: ${record.tenantId}`)
    } catch (error) {
      this.logger.error({ error, schemaId: record.schemaId }, 'Failed to save schema')
      throw error
    }
  }

  /**
   * Find schema by schema ID
   */
  findBySchemaId(schemaId: string): SchemaRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, schema_id as schemaId, schema_data as schemaData,
        name, version, created_at as createdAt
      FROM json_schemas
      WHERE schema_id = ?
    `)

    const row = stmt.get(schemaId) as any

    if (row) {
      return {
        ...row,
        schemaData: JSON.parse(row.schemaData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find schema by ID
   */
  findById(id: string): SchemaRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, schema_id as schemaId, schema_data as schemaData,
        name, version, created_at as createdAt
      FROM json_schemas
      WHERE id = ?
    `)

    const row = stmt.get(id) as any

    if (row) {
      return {
        ...row,
        schemaData: JSON.parse(row.schemaData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find all schemas for a tenant
   */
  findByTenantId(tenantId: string): SchemaRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, schema_id as schemaId, schema_data as schemaData,
        name, version, created_at as createdAt
      FROM json_schemas
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(tenantId) as any[]

    return rows.map((row) => ({
      ...row,
      schemaData: JSON.parse(row.schemaData),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }))
  }

  /**
   * Find schema by tenant and schema ID (unique combination)
   */
  findByTenantAndSchemaId(tenantId: string, schemaId: string): SchemaRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, schema_id as schemaId, schema_data as schemaData,
        name, version, created_at as createdAt
      FROM json_schemas
      WHERE tenant_id = ? AND schema_id = ?
    `)

    const row = stmt.get(tenantId, schemaId) as any

    if (row) {
      return {
        ...row,
        schemaData: JSON.parse(row.schemaData),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Search schemas by name (case-insensitive)
   */
  searchByName(tenantId: string, namePattern: string): SchemaRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, schema_id as schemaId, schema_data as schemaData,
        name, version, created_at as createdAt
      FROM json_schemas
      WHERE tenant_id = ? AND name LIKE ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(tenantId, `%${namePattern}%`) as any[]

    return rows.map((row) => ({
      ...row,
      schemaData: JSON.parse(row.schemaData),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }))
  }

  /**
   * Delete schema by ID
   */
  deleteById(id: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM json_schemas WHERE id = ?')
    const result = stmt.run(id)

    const deleted = result.changes > 0
    if (deleted) {
      this.logger.debug(`Deleted schema: ${id}`)
    }

    return deleted
  }

  /**
   * Delete all schemas for a tenant
   */
  deleteByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM json_schemas WHERE tenant_id = ?')
    const result = stmt.run(tenantId)

    this.logger.debug(`Deleted ${result.changes} schemas for tenant: ${tenantId}`)

    return result.changes
  }

  /**
   * Get count of schemas for a tenant
   */
  countByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT COUNT(*) as count FROM json_schemas WHERE tenant_id = ?')
    const result = stmt.get(tenantId) as { count: number }

    return result.count
  }

  /**
   * Check if schema exists
   */
  exists(schemaId: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('SELECT 1 FROM json_schemas WHERE schema_id = ? LIMIT 1')
    const result = stmt.get(schemaId)

    return !!result
  }
}

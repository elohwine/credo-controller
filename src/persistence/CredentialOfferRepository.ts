/**
 * Credential Offer Repository - Persistent storage for pre-authorized code offers
 * Replaces in-memory credentialOfferStore with SQLite-backed persistence
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

export interface CredentialOfferRecord {
  id: string
  tenantId: string
  preAuthorizedCode: string
  credentialDefinitionId: string
  attributes: Record<string, any>
  userPinRequired: boolean
  txCode?: string
  createdAt?: Date
  expiresAt?: Date
  redeemedAt?: Date
}

export class CredentialOfferRepository {
  private logger = rootLogger.child({ module: 'CredentialOfferRepository' })

  /**
   * Save or update credential offer
   */
  save(record: CredentialOfferRecord): void {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO credential_offers (
        id, tenant_id, pre_authorized_code, credential_definition_id, 
        attributes, user_pin_required, tx_code, created_at, expires_at
      ) VALUES (
        @id, @tenantId, @preAuthorizedCode, @credentialDefinitionId,
        @attributes, @userPinRequired, @txCode, CURRENT_TIMESTAMP, @expiresAt
      )
      ON CONFLICT(id) DO UPDATE SET
        credential_definition_id = @credentialDefinitionId,
        attributes = @attributes,
        user_pin_required = @userPinRequired,
        tx_code = @txCode,
        expires_at = @expiresAt
    `)

    try {
      stmt.run({
        id: record.id,
        tenantId: record.tenantId,
        preAuthorizedCode: record.preAuthorizedCode,
        credentialDefinitionId: record.credentialDefinitionId,
        attributes: JSON.stringify(record.attributes),
        userPinRequired: record.userPinRequired ? 1 : 0,
        txCode: record.txCode || null,
        expiresAt: record.expiresAt?.toISOString() || null,
      })

      this.logger.debug(`Saved credential offer: ${record.id} for tenant: ${record.tenantId}`)
    } catch (error) {
      this.logger.error({ error, offerId: record.id }, 'Failed to save credential offer')
      throw error
    }
  }

  /**
   * Find offer by pre-authorized code
   */
  findByCode(code: string): CredentialOfferRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, pre_authorized_code as preAuthorizedCode,
        credential_definition_id as credentialDefinitionId, attributes,
        user_pin_required as userPinRequired, tx_code as txCode,
        created_at as createdAt, expires_at as expiresAt, redeemed_at as redeemedAt
      FROM credential_offers
      WHERE pre_authorized_code = ?
    `)

    const row = stmt.get(code) as any

    if (row) {
      return {
        ...row,
        attributes: JSON.parse(row.attributes),
        userPinRequired: Boolean(row.userPinRequired),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
        redeemedAt: row.redeemedAt ? new Date(row.redeemedAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Find offer by ID
   */
  findById(id: string): CredentialOfferRecord | undefined {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, pre_authorized_code as preAuthorizedCode,
        credential_definition_id as credentialDefinitionId, attributes,
        user_pin_required as userPinRequired, tx_code as txCode,
        created_at as createdAt, expires_at as expiresAt, redeemed_at as redeemedAt
      FROM credential_offers
      WHERE id = ?
    `)

    const row = stmt.get(id) as any

    if (row) {
      return {
        ...row,
        attributes: JSON.parse(row.attributes),
        userPinRequired: Boolean(row.userPinRequired),
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
        redeemedAt: row.redeemedAt ? new Date(row.redeemedAt) : undefined,
      }
    }

    return undefined
  }

  /**
   * Mark offer as redeemed
   */
  markRedeemed(code: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      UPDATE credential_offers 
      SET redeemed_at = CURRENT_TIMESTAMP
      WHERE pre_authorized_code = ?
    `)

    const result = stmt.run(code)

    const updated = result.changes > 0
    if (updated) {
      this.logger.debug(`Marked credential offer as redeemed: ${code}`)
    }

    return updated
  }

  /**
   * Find all offers for a tenant
   */
  findByTenantId(tenantId: string): CredentialOfferRecord[] {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      SELECT 
        id, tenant_id as tenantId, pre_authorized_code as preAuthorizedCode,
        credential_definition_id as credentialDefinitionId, attributes,
        user_pin_required as userPinRequired, tx_code as txCode,
        created_at as createdAt, expires_at as expiresAt, redeemed_at as redeemedAt
      FROM credential_offers
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(tenantId) as any[]

    return rows.map((row) => ({
      ...row,
      attributes: JSON.parse(row.attributes),
      userPinRequired: Boolean(row.userPinRequired),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      redeemedAt: row.redeemedAt ? new Date(row.redeemedAt) : undefined,
    }))
  }

  /**
   * Find unredeemed offers
   */
  findUnredeemed(tenantId?: string): CredentialOfferRecord[] {
    const db = DatabaseManager.getDatabase()

    const sql = tenantId
      ? `SELECT 
          id, tenant_id as tenantId, pre_authorized_code as preAuthorizedCode,
          credential_definition_id as credentialDefinitionId, attributes,
          user_pin_required as userPinRequired, tx_code as txCode,
          created_at as createdAt, expires_at as expiresAt, redeemed_at as redeemedAt
        FROM credential_offers
        WHERE tenant_id = ? AND redeemed_at IS NULL
        ORDER BY created_at DESC`
      : `SELECT 
          id, tenant_id as tenantId, pre_authorized_code as preAuthorizedCode,
          credential_definition_id as credentialDefinitionId, attributes,
          user_pin_required as userPinRequired, tx_code as txCode,
          created_at as createdAt, expires_at as expiresAt, redeemed_at as redeemedAt
        FROM credential_offers
        WHERE redeemed_at IS NULL
        ORDER BY created_at DESC`

    const stmt = db.prepare(sql)
    const rows = tenantId ? (stmt.all(tenantId) as any[]) : (stmt.all() as any[])

    return rows.map((row) => ({
      ...row,
      attributes: JSON.parse(row.attributes),
      userPinRequired: Boolean(row.userPinRequired),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      redeemedAt: row.redeemedAt ? new Date(row.redeemedAt) : undefined,
    }))
  }

  /**
   * Delete offer by ID
   */
  deleteById(id: string): boolean {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM credential_offers WHERE id = ?')
    const result = stmt.run(id)

    const deleted = result.changes > 0
    if (deleted) {
      this.logger.debug(`Deleted credential offer: ${id}`)
    }

    return deleted
  }

  /**
   * Delete all offers for a tenant
   */
  deleteByTenantId(tenantId: string): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare('DELETE FROM credential_offers WHERE tenant_id = ?')
    const result = stmt.run(tenantId)

    this.logger.debug(`Deleted ${result.changes} credential offers for tenant: ${tenantId}`)

    return result.changes
  }

  /**
   * Clean up expired offers
   */
  deleteExpired(): number {
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      DELETE FROM credential_offers 
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `)

    const result = stmt.run()

    this.logger.info(`Deleted ${result.changes} expired credential offers`)

    return result.changes
  }
}

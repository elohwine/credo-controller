/**
 * Database connection and migration management
 * Uses better-sqlite3 for synchronous, type-safe SQLite operations
 */

import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { rootLogger } from '../utils/pinoLogger'

export interface DbConfig { path: string; readonly?: boolean; verbose?: boolean }

export class DatabaseManager {
  private static instance: Database.Database | null = null
  private static logger = rootLogger.child({ module: 'DatabaseManager' })

  static initialize(config: DbConfig): Database.Database {
    if (this.instance) return this.instance
    const dbPath = config.path || process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
    const dbDir = dirname(dbPath)
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
    this.instance = new Database(dbPath, {
      readonly: config.readonly || false,
      verbose: config.verbose ? ((message?: unknown) => this.logger.debug(`SQL: ${String(message)}`)) : undefined,
    })
    this.instance.pragma('foreign_keys = ON')
    this.instance.pragma('journal_mode = WAL')
    this.instance.pragma('synchronous = NORMAL')
    this.instance.pragma('cache_size = -64000')
    this.instance.pragma('temp_store = MEMORY')
    this.instance.pragma('mmap_size = 268435456')
    this.instance.pragma('busy_timeout = 5000')
    this.logger.info(`Database initialized at: ${dbPath}`)
    this.runMigrations()
    return this.instance
  }

  static getDatabase(): Database.Database {
    if (!this.instance) throw new Error('Database not initialized. Call DatabaseManager.initialize() first.')
    return this.instance
  }

  static close(): void {
    if (this.instance) { this.instance.close(); this.instance = null; this.logger.info('Database connection closed') }
  }

  private static runMigrations(): void {
    const db = this.getDatabase()
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number | null }
    const currentVersion = row?.version || 0
    const migrationFiles = [
      { version: 1, file: '001_create_stores.sql', name: 'create_stores' },
      { version: 2, file: '002_wallet_auth_tables.sql', name: 'wallet_auth_tables' },
      { version: 3, file: '003_create_workflows.sql', name: 'create_workflows' },
      { version: 4, file: '004_add_credential_columns.sql', name: 'add_credential_columns' },
      { version: 5, file: '005_create_catalog_items.sql', name: 'create_catalog_items' },
      { version: 6, file: '006_create_carts.sql', name: 'create_carts' },
      { version: 7, file: '007_create_trust_tables.sql', name: 'create_trust_tables' },
      { version: 8, file: '008_create_escalations.sql', name: 'create_escalations' },
      { version: 9, file: '009_create_payroll.sql', name: 'create_payroll' },
      { version: 10, file: '010_create_onboarding.sql', name: 'create_onboarding' },
      { version: 11, file: '011_create_audit_logs.sql', name: 'create_audit_logs' },
      { version: 12, file: '012_create_operations.sql', name: 'create_operations' },
      { version: 13, file: '013_create_inventory.sql', name: 'create_inventory' },
      { version: 14, file: '014_add_offer_uri_columns.sql', name: 'add_offer_uri_columns' },
      { version: 15, file: '015_create_ack_payments.sql', name: 'create_ack_payments' },
      { version: 16, file: '016_add_catalog_category.sql', name: 'add_catalog_category' },
      { version: 17, file: '017_add_delivered_state.sql', name: 'add_delivered_state' },
      { version: 18, file: '018_add_phone_to_tenants.sql', name: 'add_phone_to_tenants' },
      { version: 19, file: '019_ssi_auth_tables.sql', name: 'ssi_auth_tables' },
      { version: 20, file: '020_add_audit_columns.sql', name: 'add_audit_columns' },
      { version: 21, file: '021_create_platform_workflow_core.sql', name: 'create_platform_workflow_core' },
      { version: 22, file: '022_create_ssi_trust_and_consent.sql', name: 'create_ssi_trust_and_consent' }
    ]
    for (const migration of migrationFiles) {
      if (migration.version <= currentVersion) continue
      const migrationPath = join(__dirname, '../../migrations', migration.file)
      if (!existsSync(migrationPath)) { this.logger.warn(`Migration file not found: ${migrationPath}`); continue }
      const sql = readFileSync(migrationPath, 'utf-8')
      try {
        db.transaction(() => {
          db.exec(sql)
          db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
        })()
        this.logger.info(`Migration ${migration.version} applied successfully`)
      } catch (error) { this.logger.error({ error }, `Failed to apply migration ${migration.version}`); throw error }
    }
  }

  static healthCheck(): boolean {
    try { return (this.getDatabase().prepare('SELECT 1 as ok').get() as { ok: number }).ok === 1 }
    catch (error) { this.logger.error({ error }, 'Database health check failed'); return false }
  }

  static getStats(): { dids: number; credentialOffers: number; issuedCredentials: number; schemas: number; credentialDefinitions: number } {
    const db = this.getDatabase()
    const getCount = (table: string) => (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count
    return { dids: getCount('dids'), credentialOffers: getCount('credential_offers'), issuedCredentials: getCount('issued_credentials'), schemas: getCount('json_schemas'), credentialDefinitions: getCount('credential_definitions') }
  }
}
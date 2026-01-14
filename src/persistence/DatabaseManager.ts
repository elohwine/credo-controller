/**
 * Database connection and migration management
 * Uses better-sqlite3 for synchronous, type-safe SQLite operations
 */

import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { rootLogger } from '../utils/pinoLogger'

export interface DbConfig {
  path: string
  readonly?: boolean
  verbose?: boolean
}

export class DatabaseManager {
  private static instance: Database.Database | null = null
  private static logger = rootLogger.child({ module: 'DatabaseManager' })

  /**
   * Initialize database connection with migration support
   */
  static initialize(config: DbConfig): Database.Database {
    if (this.instance) {
      return this.instance
    }

    const dbPath = config.path || process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
    const dbDir = dirname(dbPath)

    // Ensure data directory exists
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
      this.logger.info(`Created database directory: ${dbDir}`)
    }

    // Create database connection
    this.instance = new Database(dbPath, {
      readonly: config.readonly || false,
      verbose: config.verbose ? ((message?: unknown) => this.logQuery(String(message))) : undefined,
    })

    // Performance optimizations for production
    this.instance.pragma('foreign_keys = ON')
    this.instance.pragma('journal_mode = WAL')           // Write-Ahead Logging for concurrency
    this.instance.pragma('synchronous = NORMAL')         // Balance durability vs speed
    this.instance.pragma('cache_size = -64000')          // 64MB cache (negative = KB)
    this.instance.pragma('temp_store = MEMORY')          // Temp tables in memory
    this.instance.pragma('mmap_size = 268435456')        // 256MB memory-mapped I/O
    this.instance.pragma('busy_timeout = 5000')          // 5s timeout for locks

    this.logger.info(`Database initialized at: ${dbPath}`)

    // Run migrations
    this.runMigrations()

    return this.instance
  }

  /**
   * Get database instance (throws if not initialized)
   */
  static getDatabase(): Database.Database {
    if (!this.instance) {
      throw new Error('Database not initialized. Call DatabaseManager.initialize() first.')
    }
    return this.instance
  }

  /**
   * Close database connection
   */
  static close(): void {
    if (this.instance) {
      this.instance.close()
      this.instance = null
      this.logger.info('Database connection closed')
    }
  }

  /**
   * Run database migrations
   */
  private static runMigrations(): void {
    if (!this.instance) {
      throw new Error('Database not initialized')
    }

    const db = this.instance

    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get current version
    const currentVersionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as {
      version: number | null
    }
    const currentVersion = currentVersionRow?.version || 0

    this.logger.info(`Current database version: ${currentVersion}`)

    // Load and apply migrations
    const migrationsDir = join(__dirname, '../../migrations')
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
      { version: 12, file: '012_create_operations.sql', name: 'create_operations' }
    ]

    for (const migration of migrationFiles) {
      if (migration.version > currentVersion) {
        this.logger.info(`Applying migration ${migration.version}: ${migration.name}`)
        const migrationPath = join(migrationsDir, migration.file)

        if (!existsSync(migrationPath)) {
          this.logger.warn(`Migration file not found: ${migrationPath}`)
          continue
        }

        const sql = readFileSync(migrationPath, 'utf-8')

        // Execute migration in transaction
        const applyMigration = db.transaction(() => {
          db.exec(sql)
          this.logger.info(`Migration ${migration.version} applied successfully`)
        })

        try {
          applyMigration()
        } catch (error) {
          this.logger.error({ error }, `Failed to apply migration ${migration.version}`)
          throw error
        }
      }
    }

    this.logger.info('All migrations applied successfully')
  }

  /**
   * Log SQL queries (used when verbose mode is enabled)
   */
  private static logQuery(sql: string): void {
    this.logger.debug(`SQL: ${sql}`)
  }

  /**
   * Health check - verify database is accessible
   */
  static healthCheck(): boolean {
    try {
      const db = this.getDatabase()
      const result = db.prepare('SELECT 1 as ok').get() as { ok: number }
      return result.ok === 1
    } catch (error) {
      this.logger.error({ error }, 'Database health check failed')
      return false
    }
  }

  /**
   * Get database statistics
   */
  static getStats(): {
    dids: number
    credentialOffers: number
    issuedCredentials: number
    schemas: number
    credentialDefinitions: number
  } {
    const db = this.getDatabase()

    const getCount = (table: string): number => {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }
      return result.count
    }

    return {
      dids: getCount('dids'),
      credentialOffers: getCount('credential_offers'),
      issuedCredentials: getCount('issued_credentials'),
      schemas: getCount('json_schemas'),
      credentialDefinitions: getCount('credential_definitions'),
    }
  }
}

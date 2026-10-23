/* eslint-disable @typescript-eslint/explicit-member-accessibility */
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

  static initialize(config: DbConfig): Database.Database {
    if (this.instance) return this.instance

    const dbPath = config.path || process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
    const dbDir = dirname(dbPath)

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
      this.logger.info(`Created database directory: ${dbDir}`)
    }

    this.instance = new Database(dbPath, {
      readonly: config.readonly || false,
      verbose: config.verbose ? (message?: unknown) => this.logQuery(String(message)) : undefined,
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

  static setDatabase(db: Database.Database): void {
    this.instance = db
    this.logger.info('Database instance set for testing')
  }

  static getDatabase(): Database.Database {
    if (!this.instance) throw new Error('Database not initialized. Call DatabaseManager.initialize() first.')
    return this.instance
  }

  static close(): void {
    if (this.instance) {
      this.instance.close()
      this.instance = null
      this.logger.info('Database connection closed')
    }
  }

  private static runMigrations(): void {
    if (!this.instance) throw new Error('Database not initialized')

    const db = this.instance
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const currentVersionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as {
      version: number | null
    }
    const currentVersion = currentVersionRow?.version || 0
    this.logger.info(`Current database version: ${currentVersion}`)

    // `__dirname` is unavailable under ESM test runners; fall back to the repo layout.
    const migrationsDir =
      typeof __dirname !== 'undefined' ? join(__dirname, '../../migrations') : join(process.cwd(), 'migrations')
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
      { version: 22, file: '022_create_ssi_trust_and_consent.sql', name: 'create_ssi_trust_and_consent' },
      { version: 23, file: '023_add_oid4vp_verification_session.sql', name: 'add_oid4vp_verification_session' },
      { version: 24, file: '024_add_verifier_registration_bindings.sql', name: 'add_verifier_registration_bindings' },
      { version: 89, file: '089_create_platform_org_compat_schema.sql', name: 'create_platform_org_compat_schema' },
      { version: 90, file: '090_create_ssi_trust_compat_schema.sql', name: 'create_ssi_trust_compat_schema' },
      { version: 91, file: '091_create_integration_outbox.sql', name: 'create_integration_outbox' },
      { version: 92, file: '092_create_workflow_requests.sql', name: 'create_workflow_requests' },
      { version: 93, file: '093_create_org_workflow_actor_defaults.sql', name: 'create_org_workflow_actor_defaults' },
      { version: 94, file: '094_seed_internal_requisitions_template.sql', name: 'seed_internal_requisitions_template' },
      { version: 95, file: '095_create_workflow_idempotency_keys.sql', name: 'create_workflow_idempotency_keys' },
      { version: 96, file: '096_add_workflow_template_prerequisites.sql', name: 'add_workflow_template_prerequisites' },
      {
        version: 97,
        file: '097_create_workflow_runtime_compat_schema.sql',
        name: 'create_workflow_runtime_compat_schema',
      },
      { version: 98, file: '098_create_org_workflow_actor_policies.sql', name: 'create_org_workflow_actor_policies' },
      {
        version: 99,
        file: '099_create_wallet_pending_offers_compat_schema.sql',
        name: 'create_wallet_pending_offers_compat_schema',
      },
      {
        version: 100,
        file: '100_create_org_proof_vc_policies_compat.sql',
        name: 'create_org_proof_vc_policies_compat',
      },
      { version: 101, file: '101_request_handoffs.sql', name: 'request_handoffs' },
      { version: 102, file: '102_org_workflow_handoffs.sql', name: 'org_workflow_handoffs' },
      { version: 103, file: '103_payment_method_catalogue.sql', name: 'payment_method_catalogue' },
      { version: 104, file: '104_org_setup_profiles.sql', name: 'org_setup_profiles' },
      {
        version: 105,
        file: '105_org_setup_profiles_staff_card_change.sql',
        name: 'org_setup_profiles_staff_card_change',
      },
      {
        version: 106,
        file: '106_create_credential_status_lists_compat.sql',
        name: 'create_credential_status_lists_compat',
      },
      { version: 107, file: '107_roles_membership_role.sql', name: 'roles_membership_role' },
      { version: 108, file: '108_device_push_tokens.sql', name: 'device_push_tokens' },
      { version: 109, file: '109_ar_ap_and_payment_links.sql', name: 'ar_ap_and_payment_links' },
      { version: 110, file: '110_handoff_continue_on.sql', name: 'handoff_continue_on' },
      { version: 111, file: '111_org_contacts_compat.sql', name: 'org_contacts_compat' },
      { version: 112, file: '112_ap_ledger_request_links.sql', name: 'ap_ledger_request_links' },
      { version: 113, file: '113_org_modules_and_plans.sql', name: 'org_modules_and_plans' },
      { version: 114, file: '114_holder_activity.sql', name: 'holder_activity' },
      {
        version: 115,
        file: '115_business_transactions_and_obligations.sql',
        name: 'business_transactions_and_obligations',
      },
      { version: 116, file: '116_finance_gap_closure.sql', name: 'finance_gap_closure' },
      { version: 117, file: '117_org_configuration.sql', name: 'org_configuration' },
      { version: 119, file: '119_payment_receipt_resolution.sql', name: 'payment_receipt_resolution' },
      { version: 120, file: '120_wallet_login_sessions.sql', name: 'wallet_login_sessions' },
      { version: 121, file: '121_wallet_custody_rebinds.sql', name: 'wallet_custody_rebinds' },
      { version: 122, file: '122_partner_clients.sql', name: 'partner_clients' },
      { version: 124, file: '124_transactional_notifications.sql', name: 'transactional_notifications' },
      { version: 125, file: '125_workflow_request_experience.sql', name: 'workflow_request_experience' },
      { version: 126, file: '126_connected_systems.sql', name: 'connected_systems' },
      { version: 127, file: '127_organization_entry_proofs.sql', name: 'organization_entry_proofs' },
      { version: 128, file: '128_device_trust.sql', name: 'device_trust' },
      { version: 129, file: '129_job_intake.sql', name: 'job_intake' },
      { version: 130, file: '130_wallet_inbox_whatsapp.sql', name: 'wallet_inbox_whatsapp' },
      { version: 131, file: '131_inbox_done_and_job_updates.sql', name: 'inbox_done_and_job_updates' },
      { version: 132, file: '132_ap_payment_proof.sql', name: 'ap_payment_proof' },
      { version: 133, file: '133_org_public_offerings.sql', name: 'org_public_offerings' },
      { version: 134, file: '134_inbox_read_state.sql', name: 'inbox_read_state' },
      { version: 135, file: '135_member_invites.sql', name: 'member_invites' },
    ]

    for (const migration of migrationFiles) {
      if (migration.version <= currentVersion) continue

      this.logger.info(`Applying migration ${migration.version}: ${migration.name}`)
      const migrationPath = join(migrationsDir, migration.file)
      if (!existsSync(migrationPath)) {
        this.logger.warn(`Migration file not found: ${migrationPath}`)
        continue
      }

      const sql = readFileSync(migrationPath, 'utf-8')
      const recordVersion = db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
      const applyMigration = db.transaction(() => {
        db.exec(sql)
        // Not every migration file records itself; always record here so a migration
        // that is not idempotent (e.g. ALTER TABLE ... ADD COLUMN) never re-runs.
        recordVersion.run(migration.version, migration.name)
      })

      try {
        applyMigration()
        this.logger.info(`Migration ${migration.version} applied successfully`)
      } catch (error) {
        // A previous start applied this ALTER TABLE but crashed before the version was recorded
        // (or the file never recorded itself). The column exists, so treat it as applied.
        if (error instanceof Error && /duplicate column name/i.test(error.message)) {
          this.logger.warn(`Migration ${migration.version} already applied (${error.message}); recording version`)
          recordVersion.run(migration.version, migration.name)
          continue
        }
        this.logger.error({ error }, `Failed to apply migration ${migration.version}`)
        throw error
      }
    }

    this.logger.info('All migrations applied successfully')
    this.repairPresentationProtocolColumns(db)
    this.repairDiscoveryColumns(db)
  }

  /**
   * Public discovery columns that older databases got from migrations since removed: the
   * storefront reads payment rails and services keep the workflow they start.
   */
  private static repairDiscoveryColumns(db: Database.Database): void {
    const repairs: Record<string, Array<[string, string]>> = {
      service_catalog: [['workflow_template_id', 'TEXT']],
      organization_registry: [['payment_rails', "TEXT DEFAULT '[]'"]],
    }
    for (const [table, columns] of Object.entries(repairs)) {
      const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      if (existing.length === 0) continue
      const names = new Set(existing.map((column) => column.name))
      for (const [column, definition] of columns) {
        if (names.has(column)) continue
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        this.logger.info(`Added missing column ${table}.${column}`)
      }
    }
  }

  /**
   * Migrations 023, 024 and 049 share version numbers with older migrations, so the runner skips
   * them and 090 recreates the tables without their columns. Add whatever is missing, column by
   * column, so the OpenID4VP request binding works on every database.
   */
  private static repairPresentationProtocolColumns(db: Database.Database): void {
    const repairs: Record<string, Array<[string, string]>> = {
      presentation_requests: [
        ['protocol', "TEXT NOT NULL DEFAULT 'openid4vp'"],
        ['credo_verification_session_id', 'TEXT'],
        ['verifier_client_id_ref', 'TEXT'],
        ['protocol_state', 'TEXT'],
      ],
      verifier_registrations: [
        ['signer_did_url_ref', 'TEXT'],
        ['credo_verifier_id_ref', 'TEXT'],
      ],
    }
    for (const [table, columns] of Object.entries(repairs)) {
      const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      if (existing.length === 0) continue
      const names = new Set(existing.map((column) => column.name))
      for (const [column, definition] of columns) {
        if (names.has(column)) continue
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        this.logger.info(`Added missing column ${table}.${column}`)
      }
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_presentation_credo_session
        ON presentation_requests(credo_verification_session_id) WHERE credo_verification_session_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_requests_protocol_state
        ON presentation_requests(protocol_state) WHERE protocol_state IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_verifier_credo_id
        ON verifier_registrations(organization_id, credo_verifier_id_ref) WHERE credo_verifier_id_ref IS NOT NULL;
    `)
  }

  private static logQuery(sql: string): void {
    this.logger.debug(`SQL: ${sql}`)
  }

  static healthCheck(): boolean {
    try {
      const result = this.getDatabase().prepare('SELECT 1 as ok').get() as { ok: number }
      return result.ok === 1
    } catch (error) {
      this.logger.error({ error }, 'Database health check failed')
      return false
    }
  }

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

/**
 * One-shot wipe of every organisation and registered user so onboarding can start again with the
 * same phone numbers and emails. Platform rows (global VC schemas and definitions, system payment
 * providers, the seeded workflow template, migration history) and the root agent are kept.
 *
 * Triggered at boot by a flag file next to the persistence database whose content is the exact
 * confirmation phrase. The caller passes Credo and Hydra hooks so this module stays testable
 * without loading Credo.
 */
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'

export const RESET_FLAG_FILENAME = 'RESET_ORG_USER_DATA'
export const RESET_CONFIRMATION = 'wipe-org-and-user-data'

/**
 * Rows that survive the wipe. `null` keeps the whole table; a string is a SQL condition that
 * selects the rows to keep. Every other table in persistence.db is emptied.
 */
export const PLATFORM_KEEP_ROWS: Record<string, string | null> = {
  schema_migrations: null,
  credential_definitions: "tenant_id = 'global'",
  json_schemas: "tenant_id = 'global'",
  service_providers: "tenant_id = 'system'",
  workflow_templates: 'tenant_id IS NULL',
}

export interface ResetFlag {
  path: string
  present: boolean
  confirmed: boolean
}

export function resetFlagPath(dataDir: string): string {
  return join(dataDir, RESET_FLAG_FILENAME)
}

export function readResetFlag(dataDir: string): ResetFlag {
  const path = resetFlagPath(dataDir)
  if (!existsSync(path)) return { path, present: false, confirmed: false }
  const content = readFileSync(path, 'utf8').trim()
  return { path, present: true, confirmed: content === RESET_CONFIRMATION }
}

/** Copies each existing SQLite file with the online backup API, so WAL contents are included. */
export async function backupSqliteFiles(files: string[], backupDir: string): Promise<string[]> {
  mkdirSync(backupDir, { recursive: true })
  const written: string[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const target = join(backupDir, `${basename(dirname(file))}-${basename(file)}`)
    const source = new Database(file, { readonly: true, fileMustExist: true })
    try {
      await source.backup(target)
    } finally {
      source.close()
    }
    written.push(target)
  }
  return written
}

export interface TableWipePlan {
  table: string
  total: number
  keep: number
  remove: number
}

function userTables(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name)
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function count(db: Database.Database, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS n FROM ${quote(table)}${where ? ` WHERE ${where}` : ''}`
  return (db.prepare(sql).get() as { n: number }).n
}

export function planPersistenceWipe(db: Database.Database): TableWipePlan[] {
  return userTables(db).map((table) => {
    const total = count(db, table)
    const rule = PLATFORM_KEEP_ROWS[table]
    const keep = rule === undefined ? 0 : rule === null ? total : count(db, table, rule)
    return { table, total, keep, remove: total - keep }
  })
}

class DryRunRollback extends Error {}

/**
 * Empties every org and user table in one transaction and fails if it leaves broken references.
 * With `dryRun` the same deletes and checks run and are then rolled back.
 */
export function wipePersistence(db: Database.Database, options: { dryRun?: boolean } = {}): TableWipePlan[] {
  const plan = planPersistenceWipe(db)
  // Tables are emptied in name order, so foreign keys are checked once at the end instead of per delete.
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      for (const entry of plan) {
        if (entry.remove === 0) continue
        const rule = PLATFORM_KEEP_ROWS[entry.table]
        db.prepare(`DELETE FROM ${quote(entry.table)}${rule ? ` WHERE NOT (${rule})` : ''}`).run()
      }
      const broken = db.pragma('foreign_key_check') as Array<{ table: string; parent: string }>
      if (broken.length > 0) {
        const pairs = Array.from(new Set(broken.map((row) => `${row.table}->${row.parent}`))).join(', ')
        throw new Error(`Wipe would leave ${broken.length} broken foreign key reference(s) (${pairs}); rolled back`)
      }
      if (options.dryRun) throw new DryRunRollback()
    })()
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return plan
}

export function clearTenantStore(tenantsDbPath: string): number {
  if (!existsSync(tenantsDbPath)) return 0
  const db = new Database(tenantsDbPath)
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tenants'").get()
    return hasTable ? db.prepare('DELETE FROM tenants').run().changes : 0
  } finally {
    db.close()
  }
}

export interface PlatformDataResetHooks {
  /** Every Credo tenant id under the root agent (organisation and personal wallets). */
  listCredoTenantIds: () => Promise<string[]>
  deleteCredoTenant: (tenantId: string) => Promise<void>
  /** Removes an org-owned OAuth client from Hydra; a missing client is not an error. */
  deleteHydraClient?: (clientId: string) => Promise<void>
  /** Replaces the JWT signing secret so every issued session stops working. */
  rotateJwtSecret: () => Promise<void>
}

export interface PlatformDataResetInput {
  persistenceDb: Database.Database
  tenantsDbPath: string
  hooks: PlatformDataResetHooks
  log?: (message: string) => void
}

export interface PlatformDataResetReport {
  startedAt: string
  finishedAt: string
  credoTenantsDeleted: string[]
  hydraClientsDeleted: string[]
  hydraClientFailures: Array<{ clientId: string; error: string }>
  tenantStoreRowsDeleted: number
  persistence: TableWipePlan[]
  rowsDeleted: number
  jwtSecretRotated: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function partnerClientIds(db: Database.Database): string[] {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'partner_clients'").get()
  if (!exists) return []
  return (db.prepare('SELECT client_id FROM partner_clients').all() as Array<{ client_id: string }>).map(
    (row) => row.client_id,
  )
}

export async function runPlatformDataReset(input: PlatformDataResetInput): Promise<PlatformDataResetReport> {
  const { persistenceDb, tenantsDbPath, hooks } = input
  const log = input.log ?? (() => undefined)
  const startedAt = new Date().toISOString()

  // Prove the database wipe will succeed before anything irreversible happens to the wallets.
  wipePersistence(persistenceDb, { dryRun: true })

  const credoTenantsDeleted: string[] = []
  const credoTenantFailures: string[] = []
  for (const tenantId of await hooks.listCredoTenantIds()) {
    try {
      await hooks.deleteCredoTenant(tenantId)
      credoTenantsDeleted.push(tenantId)
    } catch (error) {
      credoTenantFailures.push(`${tenantId} (${errorMessage(error)})`)
    }
  }
  log(`Deleted ${credoTenantsDeleted.length} Credo tenant(s)`)
  if (credoTenantFailures.length > 0) {
    // Wiping the records of a wallet that still exists would orphan it, so stop before touching data.
    throw new Error(`Could not delete Credo tenant(s): ${credoTenantFailures.join(', ')}`)
  }

  const hydraClientsDeleted: string[] = []
  const hydraClientFailures: PlatformDataResetReport['hydraClientFailures'] = []
  if (hooks.deleteHydraClient) {
    for (const clientId of partnerClientIds(persistenceDb)) {
      try {
        await hooks.deleteHydraClient(clientId)
        hydraClientsDeleted.push(clientId)
      } catch (error) {
        hydraClientFailures.push({ clientId, error: errorMessage(error) })
      }
    }
  }

  const persistence = wipePersistence(persistenceDb)
  const rowsDeleted = persistence.reduce((sum, entry) => sum + entry.remove, 0)
  log(`Removed ${rowsDeleted} org and user row(s) from persistence`)

  const tenantStoreRowsDeleted = clearTenantStore(tenantsDbPath)

  await hooks.rotateJwtSecret()
  log('Rotated the JWT secret; every existing session is signed out')

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    credoTenantsDeleted,
    hydraClientsDeleted,
    hydraClientFailures,
    tenantStoreRowsDeleted,
    persistence: persistence.filter((entry) => entry.total > 0),
    rowsDeleted,
    jwtSecretRotated: true,
  }
}

/**
 * Removes the flag after success. On failure, or when the phrase is wrong, renames it to `.failed`
 * with the reason so the next restart does not try again.
 */
export function settleResetFlag(flag: ResetFlag, error?: unknown): void {
  if (!existsSync(flag.path)) return
  if (!error) {
    unlinkSync(flag.path)
    return
  }
  const failedPath = `${flag.path}.failed`
  renameSync(flag.path, failedPath)
  writeFileSync(failedPath, `${new Date().toISOString()} ${errorMessage(error)}\n`)
}

export function writeResetReport(backupDir: string, report: unknown): string {
  mkdirSync(backupDir, { recursive: true })
  const path = join(backupDir, 'report.json')
  writeFileSync(path, JSON.stringify(report, null, 2))
  return path
}

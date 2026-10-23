import type { TestDatabases } from './utils/orgReadinessFixture'

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import {
  RESET_CONFIRMATION,
  backupSqliteFiles,
  planPersistenceWipe,
  readResetFlag,
  resetFlagPath,
  runPlatformDataReset,
  settleResetFlag,
  wipePersistence,
} from '../src/services/platform/PlatformDataResetService'

import { addDepartment, addMember, addRole, initTestDatabases, seedOrganization } from './utils/orgReadinessFixture'

/** Inserts a row, filling required columns that have no default so the test only names what matters. */
function insertRow(db: Database.Database, table: string, values: Record<string, unknown>): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
    notnull: number
    dflt_value: unknown
    pk: number
  }>
  const row: Record<string, unknown> = {}
  for (const column of columns) {
    if (column.name in values) row[column.name] = values[column.name]
    else if (column.notnull && column.dflt_value === null) row[column.name] = `${column.name}-${randomUUID()}`
  }
  const names = Object.keys(row)
  db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(
    ...names.map((name) => row[name]),
  )
}

function rowCount(db: Database.Database, table: string, where = '1 = 1'): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n
}

describe('platform org and user data reset', () => {
  let dbs: TestDatabases
  let db: Database.Database

  beforeEach(() => {
    dbs = initTestDatabases('credo-reset-')
    db = DatabaseManager.getDatabase()
  })

  afterEach(() => dbs.cleanup())

  function seedPlatformAndOrgData() {
    const org = seedOrganization({ setup: 'new' })
    addRole(org.organizationId, 'Approver', ['approve'])
    addDepartment(org.organizationId, 'Finance')
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member' })

    insertRow(db, 'credential_definitions', { tenant_id: 'global' })
    insertRow(db, 'credential_definitions', { tenant_id: org.orgTenantId })
    insertRow(db, 'json_schemas', { tenant_id: 'global' })
    insertRow(db, 'json_schemas', { tenant_id: org.orgTenantId })
    insertRow(db, 'service_providers', { tenant_id: org.orgTenantId })
    insertRow(db, 'workflow_templates', { tenant_id: org.orgTenantId })
    insertRow(db, 'partner_clients', { client_id: 'partner-1', org_tenant_id: org.orgTenantId })
    return org
  }

  function hooks(tenantIds: string[]) {
    const deleted: string[] = []
    return {
      deleted,
      rotated: { count: 0 },
      hydraDeleted: [] as string[],
      build() {
        return {
          listCredoTenantIds: async () => tenantIds,
          deleteCredoTenant: async (id: string) => {
            deleted.push(id)
          },
          deleteHydraClient: async (id: string) => {
            this.hydraDeleted.push(id)
          },
          rotateJwtSecret: async () => {
            this.rotated.count += 1
          },
        }
      },
    }
  }

  it('wipes org and user rows but keeps platform schemas, providers, templates and migrations', async () => {
    const org = seedPlatformAndOrgData()
    const before = {
      migrations: rowCount(db, 'schema_migrations'),
      systemProviders: rowCount(db, 'service_providers', "tenant_id = 'system'"),
      platformTemplates: rowCount(db, 'workflow_templates', 'tenant_id IS NULL'),
    }
    expect(rowCount(db, 'organizations')).toBeGreaterThan(0)

    const h = hooks([org.orgTenantId, 'personal-wallet-1'])
    const report = await runPlatformDataReset({ persistenceDb: db, tenantsDbPath: dbs.tenantsPath, hooks: h.build() })

    for (const table of ['organizations', 'org_memberships', 'people', 'roles', 'departments', 'partner_clients']) {
      expect(rowCount(db, table)).toBe(0)
    }
    expect(rowCount(db, 'credential_definitions')).toBe(1)
    expect(rowCount(db, 'credential_definitions', "tenant_id = 'global'")).toBe(1)
    expect(rowCount(db, 'json_schemas')).toBe(1)
    expect(rowCount(db, 'json_schemas', "tenant_id = 'global'")).toBe(1)
    expect(rowCount(db, 'service_providers')).toBe(before.systemProviders)
    expect(rowCount(db, 'workflow_templates')).toBe(before.platformTemplates)
    expect(rowCount(db, 'schema_migrations')).toBe(before.migrations)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)

    const tenants = new Database(dbs.tenantsPath, { readonly: true })
    expect(rowCount(tenants, 'tenants')).toBe(0)
    tenants.close()

    expect(h.deleted).toEqual([org.orgTenantId, 'personal-wallet-1'])
    expect(h.hydraDeleted).toEqual(['partner-1'])
    expect(h.rotated.count).toBe(1)
    expect(report.credoTenantsDeleted).toHaveLength(2)
    expect(report.rowsDeleted).toBeGreaterThan(0)
    expect(report.tenantStoreRowsDeleted).toBeGreaterThan(0)
  })

  it('lets the same email and phone onboard again after the wipe', async () => {
    const org = seedPlatformAndOrgData()
    const h = hooks([org.orgTenantId])
    await runPlatformDataReset({ persistenceDb: db, tenantsDbPath: dbs.tenantsPath, hooks: h.build() })

    const again = seedOrganization({ setup: 'new' })
    expect(rowCount(db, 'organizations')).toBe(1)
    expect(again.orgTenantId).toBeTruthy()
  })

  it('touches nothing when a Credo tenant cannot be deleted', async () => {
    const org = seedPlatformAndOrgData()
    const organizations = rowCount(db, 'organizations')
    let rotated = false

    await expect(
      runPlatformDataReset({
        persistenceDb: db,
        tenantsDbPath: dbs.tenantsPath,
        hooks: {
          listCredoTenantIds: async () => [org.orgTenantId],
          deleteCredoTenant: async () => {
            throw new Error('profile locked')
          },
          rotateJwtSecret: async () => {
            rotated = true
          },
        },
      }),
    ).rejects.toThrow(/profile locked/)

    expect(rowCount(db, 'organizations')).toBe(organizations)
    expect(rotated).toBe(false)
  })

  it('dry run reports the plan and rolls everything back', () => {
    seedPlatformAndOrgData()
    const organizations = rowCount(db, 'organizations')
    const plan = wipePersistence(db, { dryRun: true })

    expect(plan.find((entry) => entry.table === 'organizations')?.remove).toBe(organizations)
    expect(plan.find((entry) => entry.table === 'credential_definitions')).toMatchObject({ keep: 1, remove: 1 })
    expect(rowCount(db, 'organizations')).toBe(organizations)
    expect(planPersistenceWipe(db).find((entry) => entry.table === 'organizations')?.total).toBe(organizations)
  })

  it('backs up a live WAL database including uncheckpointed rows', async () => {
    const livePath = path.join(dbs.dir, 'live.db')
    const live = new Database(livePath)
    live.pragma('journal_mode = WAL')
    live.pragma('wal_autocheckpoint = 0')
    live.exec('CREATE TABLE tenants (id TEXT PRIMARY KEY)')
    live.prepare('INSERT INTO tenants (id) VALUES (?)').run('tenant-backup')

    const written = await backupSqliteFiles(
      [dbs.persistencePath, livePath, path.join(dbs.dir, 'missing.db')],
      path.join(dbs.dir, 'backup'),
    )
    live.close()

    expect(written).toHaveLength(2)
    const copy = new Database(written[1], { readonly: true })
    expect(rowCount(copy, 'tenants', "id = 'tenant-backup'")).toBe(1)
    copy.close()
  })

  describe('flag file', () => {
    it('is ignored when absent', () => {
      expect(readResetFlag(dbs.dir)).toMatchObject({ present: false, confirmed: false })
    })

    it('needs the exact confirmation phrase', () => {
      writeFileSync(resetFlagPath(dbs.dir), 'yes please')
      expect(readResetFlag(dbs.dir)).toMatchObject({ present: true, confirmed: false })
      writeFileSync(resetFlagPath(dbs.dir), `${RESET_CONFIRMATION}\n`)
      expect(readResetFlag(dbs.dir)).toMatchObject({ present: true, confirmed: true })
    })

    it('is removed after success and renamed with the reason after failure', () => {
      writeFileSync(resetFlagPath(dbs.dir), RESET_CONFIRMATION)
      settleResetFlag(readResetFlag(dbs.dir))
      expect(existsSync(resetFlagPath(dbs.dir))).toBe(false)

      writeFileSync(resetFlagPath(dbs.dir), RESET_CONFIRMATION)
      settleResetFlag(readResetFlag(dbs.dir), new Error('boom'))
      expect(existsSync(resetFlagPath(dbs.dir))).toBe(false)
      const failed = readFileSync(`${resetFlagPath(dbs.dir)}.failed`, 'utf8')
      expect(failed).toContain('boom')
      expect(failed).not.toContain(RESET_CONFIRMATION)
      expect(readResetFlag(dbs.dir).present).toBe(false)
    })
  })
})

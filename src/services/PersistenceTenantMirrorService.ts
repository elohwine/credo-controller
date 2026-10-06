import type { TenantPersistenceRecord } from '../persistence/TenantRepository'
import type { Database } from 'better-sqlite3'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'PersistenceTenantMirrorService' })

type TenantResolver = (tenantId: string) => TenantPersistenceRecord | null

interface EnsureTenantMirrorOptions {
  db?: Database
  resolveTenant?: TenantResolver
}

function assertTenantExistsInCanonicalStore(tenantId: string, resolveTenant: TenantResolver): TenantPersistenceRecord {
  const tenant = resolveTenant(tenantId)
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found in canonical tenant store`)
  }

  return tenant
}

function upsertPersistenceTenant(db: Database, tenant: TenantPersistenceRecord): void {
  db.prepare(
    `
    INSERT INTO tenants (
      id, label, status, created_at,
      issuer_did, issuer_kid, verifier_did, verifier_kid,
      askar_profile, metadata, tenant_type, domain
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      status = excluded.status,
      created_at = excluded.created_at,
      issuer_did = excluded.issuer_did,
      issuer_kid = excluded.issuer_kid,
      verifier_did = excluded.verifier_did,
      verifier_kid = excluded.verifier_kid,
      askar_profile = excluded.askar_profile,
      metadata = excluded.metadata,
      tenant_type = excluded.tenant_type,
      domain = excluded.domain
  `,
  ).run(
    tenant.id,
    tenant.label,
    tenant.status,
    tenant.createdAt,
    tenant.issuerDid,
    tenant.issuerKid,
    tenant.verifierDid,
    tenant.verifierKid,
    tenant.askarProfile,
    JSON.stringify(tenant.metadata ?? {}),
    tenant.tenantType ?? 'USER',
    tenant.domain ?? null,
  )
}

/**
 * Ensures tenant rows exist in persistence.db for FK-bound writes.
 * Canonical tenant metadata is sourced from the dedicated tenant store.
 */
export function ensureTenantMirrorsForFk(
  tenantIds: Array<string | null | undefined>,
  options?: EnsureTenantMirrorOptions,
): void {
  const db = options?.db ?? DatabaseManager.getDatabase()
  const resolveTenant = options?.resolveTenant ?? getTenantById

  const ids = Array.from(
    new Set(tenantIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter((id) => id.length > 0)),
  )

  if (ids.length === 0) return

  const ensureTx = db.transaction((tenantIdsToEnsure: string[]) => {
    for (const tenantId of tenantIdsToEnsure) {
      const exists = db.prepare('SELECT 1 FROM tenants WHERE id = ? LIMIT 1').get(tenantId)
      if (exists) continue

      const canonicalTenant = assertTenantExistsInCanonicalStore(tenantId, resolveTenant)
      upsertPersistenceTenant(db, canonicalTenant)

      logger.info({ tenantId }, 'Mirrored tenant row into persistence DB for FK consistency')
    }
  })

  ensureTx(ids)
}

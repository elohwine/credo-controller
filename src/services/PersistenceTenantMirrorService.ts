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

/**
 * A person's wallet tenant lives in `ssi_users`, not in the canonical tenant store. When such a
 * person writes to an FK-bound table (for example asks a business for a quote), mirror a minimal
 * USER tenant row so the foreign key holds. No PII: the label is generic and the DID is public.
 */
function personalWalletTenant(db: Database, tenantId: string): TenantPersistenceRecord | null {
  const row = db
    .prepare('SELECT tenant_id, did, created_at FROM ssi_users WHERE tenant_id = ? LIMIT 1')
    .get(tenantId) as { tenant_id: string; did: string; created_at: string | null } | undefined
  if (!row) return null
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  return {
    id: row.tenant_id,
    label: 'Personal wallet',
    status: 'active',
    createdAt,
    issuerDid: row.did,
    issuerKid: `${row.did}#key-1`,
    verifierDid: row.did,
    verifierKid: `${row.did}#key-1`,
    askarProfile: row.tenant_id,
    metadata: { source: 'ssi_users' },
    tenantType: 'USER',
  }
}

function assertTenantExistsInCanonicalStore(
  tenantId: string,
  resolveTenant: TenantResolver,
  db?: Database,
): TenantPersistenceRecord {
  const tenant = resolveTenant(tenantId) || (db ? personalWalletTenant(db, tenantId) : null)
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

      const canonicalTenant = assertTenantExistsInCanonicalStore(tenantId, resolveTenant, db)
      upsertPersistenceTenant(db, canonicalTenant)

      logger.info({ tenantId }, 'Mirrored tenant row into persistence DB for FK consistency')
    }
  })

  ensureTx(ids)
}

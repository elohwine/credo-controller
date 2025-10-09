import type { Database } from 'better-sqlite3'

import DatabaseConstructor from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

export interface TenantMetadata {
  issuer?: Record<string, unknown>
  verifier?: Record<string, unknown>
  [key: string]: unknown
}

export interface TenantPersistenceRecord {
  id: string
  label: string
  status: string
  createdAt: string
  issuerDid: string
  issuerKid: string
  verifierDid: string
  verifierKid: string
  askarProfile: string
  metadata: TenantMetadata
}

interface TenantRow {
  id: string
  label: string
  status: string
  created_at: string
  issuer_did: string
  issuer_kid: string
  verifier_did: string
  verifier_kid: string
  askar_profile: string
  metadata?: string | null
}

let db: Database | undefined

const DEFAULT_DB_PATH = () => path.resolve(process.cwd(), 'data', 'tenants.db')

export const TENANT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  issuer_kid TEXT NOT NULL,
  verifier_did TEXT NOT NULL,
  verifier_kid TEXT NOT NULL,
  askar_profile TEXT NOT NULL,
  metadata TEXT NOT NULL
)`

export function initTenantStore(dbPath?: string): Database {
  if (db) {
    return db
  }

  const resolvedPath = dbPath ?? process.env.TENANT_DB_PATH ?? DEFAULT_DB_PATH()
  const dir = path.dirname(resolvedPath)
  fs.mkdirSync(dir, { recursive: true })
  db = new DatabaseConstructor(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.prepare(TENANT_TABLE_SQL).run()
  return db
}

function ensureDb(): Database {
  if (!db) {
    return initTenantStore()
  }
  return db
}

export function upsertTenant(record: TenantPersistenceRecord) {
  const database = ensureDb()
  const stmt = database.prepare(`
    INSERT INTO tenants(
      id, label, status, created_at, issuer_did, issuer_kid, verifier_did, verifier_kid, askar_profile, metadata
    ) VALUES (@id, @label, @status, @createdAt, @issuerDid, @issuerKid, @verifierDid, @verifierKid, @askarProfile, @metadata)
    ON CONFLICT(id) DO UPDATE SET
      label=excluded.label,
      status=excluded.status,
      created_at=excluded.created_at,
      issuer_did=excluded.issuer_did,
      issuer_kid=excluded.issuer_kid,
      verifier_did=excluded.verifier_did,
      verifier_kid=excluded.verifier_kid,
      askar_profile=excluded.askar_profile,
      metadata=excluded.metadata
  `)
  stmt.run({
    ...record,
    metadata: JSON.stringify(record.metadata ?? {}),
  })
}

export function getTenantById(id: string): TenantPersistenceRecord | null {
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM tenants WHERE id = ?').get(id)
  if (!isTenantRow(row)) return null
  return mapTenantRow(row)
}

export function listTenants(): TenantPersistenceRecord[] {
  const database = ensureDb()
  const rows = database.prepare('SELECT * FROM tenants').all()
  return Array.isArray(rows) ? rows.filter(isTenantRow).map(mapTenantRow) : []
}

export function removeTenant(id: string) {
  const database = ensureDb()
  database.prepare('DELETE FROM tenants WHERE id = ?').run(id)
}

function isTenantRow(value: unknown): value is TenantRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<TenantRow>
  return (
    typeof row.id === 'string' &&
    typeof row.label === 'string' &&
    typeof row.status === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.issuer_did === 'string' &&
    typeof row.issuer_kid === 'string' &&
    typeof row.verifier_did === 'string' &&
    typeof row.verifier_kid === 'string' &&
    typeof row.askar_profile === 'string'
  )
}

function mapTenantRow(row: TenantRow): TenantPersistenceRecord {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    createdAt: row.created_at,
    issuerDid: row.issuer_did,
    issuerKid: row.issuer_kid,
    verifierDid: row.verifier_did,
    verifierKid: row.verifier_kid,
    askarProfile: row.askar_profile,
    metadata: normalizeMetadata(JSON.parse(row.metadata ?? '{}')),
  }
}

function normalizeMetadata(value: unknown): TenantMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const metadata = value as Record<string, unknown>
  const issuer = metadata.issuer
  const verifier = metadata.verifier
  return {
    ...metadata,
    issuer: isRecord(issuer) ? issuer : undefined,
    verifier: isRecord(verifier) ? verifier : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * OIDC Store Repository - Persistent storage for OIDC flows
 * Replaces in-memory stores (credentialOfferStore, issuedVcStore, presentationRequestStore)
 */

import type { Database } from 'better-sqlite3'

import DatabaseConstructor from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db: Database | undefined

const DEFAULT_DB_PATH = () => path.resolve(process.cwd(), 'data', 'oidc.db')

const OIDC_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS credential_offers (
  pre_authorized_code TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  tenant_id TEXT,
  issuer_did TEXT,
  credentials TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issued_credentials (
  id TEXT PRIMARY KEY,
  jwt TEXT NOT NULL,
  subject TEXT NOT NULL,
  issuer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  schema_id TEXT,
  tenant_id TEXT
);

CREATE TABLE IF NOT EXISTS presentation_requests (
  id TEXT PRIMARY KEY,
  definition TEXT,
  created_at INTEGER NOT NULL,
  tenant_id TEXT,
  nonce TEXT,
  audience TEXT
);
`

export function initOidcStore(dbPath?: string): Database {
  if (db) {
    return db
  }

  const resolvedPath = dbPath ?? process.env.OIDC_DB_PATH ?? DEFAULT_DB_PATH()
  const dir = path.dirname(resolvedPath)
  fs.mkdirSync(dir, { recursive: true })
  db = new DatabaseConstructor(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.exec(OIDC_TABLES_SQL)
  return db
}

function ensureDb(): Database {
  if (!db) {
    return initOidcStore()
  }
  return db
}

// ========== Credential Offers ==========

export interface StoredCredentialOffer {
  offerId: string
  preAuthorizedCode: string
  credentials: any[]
  issuerDid?: string
  expiresAt: string
  tenantId?: string
}

export function saveCredentialOffer(offer: StoredCredentialOffer) {
  const database = ensureDb()
  const stmt = database.prepare(`
    INSERT INTO credential_offers (pre_authorized_code, offer_id, tenant_id, issuer_did, credentials, expires_at)
    VALUES (@preAuthorizedCode, @offerId, @tenantId, @issuerDid, @credentials, @expiresAt)
    ON CONFLICT(pre_authorized_code) DO UPDATE SET
      offer_id=excluded.offer_id,
      tenant_id=excluded.tenant_id,
      issuer_did=excluded.issuer_did,
      credentials=excluded.credentials,
      expires_at=excluded.expires_at
  `)
  stmt.run({
    preAuthorizedCode: offer.preAuthorizedCode,
    offerId: offer.offerId,
    tenantId: offer.tenantId || null,
    issuerDid: offer.issuerDid || null,
    credentials: JSON.stringify(offer.credentials),
    expiresAt: offer.expiresAt,
  })
}

export function getCredentialOfferByCode(code: string): StoredCredentialOffer | null {
  const database = ensureDb()
  const row = database
    .prepare(
      'SELECT pre_authorized_code as preAuthorizedCode, offer_id as offerId, tenant_id as tenantId, issuer_did as issuerDid, credentials, expires_at as expiresAt FROM credential_offers WHERE pre_authorized_code = ?',
    )
    .get(code) as any
  if (!row) return null
  return {
    ...row,
    credentials: JSON.parse(row.credentials),
  }
}

export function deleteCredentialOffer(code: string) {
  const database = ensureDb()
  database.prepare('DELETE FROM credential_offers WHERE pre_authorized_code = ?').run(code)
}

export function deleteExpiredOffers() {
  const database = ensureDb()
  const result = database.prepare("DELETE FROM credential_offers WHERE expires_at < datetime('now')").run()
  return result.changes
}

// ========== Issued Credentials ==========

export interface StoredIssuedCredential {
  id: string
  jwt: string
  subject: string
  issuer: string
  createdAt: string
  revoked: boolean
  revokedAt?: string
  schemaId?: string
  tenantId?: string
}

export function saveIssuedCredential(cred: StoredIssuedCredential) {
  const database = ensureDb()
  const stmt = database.prepare(`
    INSERT INTO issued_credentials (id, jwt, subject, issuer, created_at, revoked, revoked_at, schema_id, tenant_id)
    VALUES (@id, @jwt, @subject, @issuer, @createdAt, @revoked, @revokedAt, @schemaId, @tenantId)
    ON CONFLICT(id) DO UPDATE SET
      jwt=excluded.jwt,
      subject=excluded.subject,
      issuer=excluded.issuer,
      revoked=excluded.revoked,
      revoked_at=excluded.revoked_at,
      schema_id=excluded.schema_id,
      tenant_id=excluded.tenant_id
  `)
  stmt.run({
    id: cred.id,
    jwt: cred.jwt,
    subject: cred.subject,
    issuer: cred.issuer,
    createdAt: cred.createdAt,
    revoked: cred.revoked ? 1 : 0,
    revokedAt: cred.revokedAt || null,
    schemaId: cred.schemaId || null,
    tenantId: cred.tenantId || null,
  })
}

export function getIssuedCredentialById(id: string): StoredIssuedCredential | null {
  const database = ensureDb()
  const row = database
    .prepare(
      'SELECT id, jwt, subject, issuer, created_at as createdAt, revoked, revoked_at as revokedAt, schema_id as schemaId, tenant_id as tenantId FROM issued_credentials WHERE id = ?',
    )
    .get(id) as any
  if (!row) return null
  return {
    ...row,
    revoked: Boolean(row.revoked),
  }
}

export function listIssuedCredentials(filters?: { subject?: string; issuer?: string; tenantId?: string }): StoredIssuedCredential[] {
  const database = ensureDb()
  let sql = 'SELECT id, jwt, subject, issuer, created_at as createdAt, revoked, revoked_at as revokedAt, schema_id as schemaId, tenant_id as tenantId FROM issued_credentials WHERE 1=1'
  const params: any[] = []

  if (filters?.subject) {
    sql += ' AND subject = ?'
    params.push(filters.subject)
  }
  if (filters?.issuer) {
    sql += ' AND issuer = ?'
    params.push(filters.issuer)
  }
  if (filters?.tenantId) {
    sql += ' AND tenant_id = ?'
    params.push(filters.tenantId)
  }

  const rows = database.prepare(sql).all(...params) as any[]
  return rows.map((row) => ({
    ...row,
    revoked: Boolean(row.revoked),
  }))
}

export function revokeCredential(id: string) {
  const database = ensureDb()
  const stmt = database.prepare("UPDATE issued_credentials SET revoked = 1, revoked_at = datetime('now') WHERE id = ?")
  stmt.run(id)
}

// ========== Presentation Requests ==========

export interface StoredPresentationRequest {
  id: string
  definition?: any
  createdAt: number
  tenantId?: string
  nonce?: string
  audience?: string
}

export function savePresentationRequest(req: StoredPresentationRequest) {
  const database = ensureDb()
  const stmt = database.prepare(`
    INSERT INTO presentation_requests (id, definition, created_at, tenant_id, nonce, audience)
    VALUES (@id, @definition, @createdAt, @tenantId, @nonce, @audience)
    ON CONFLICT(id) DO UPDATE SET
      definition=excluded.definition,
      created_at=excluded.created_at,
      tenant_id=excluded.tenant_id,
      nonce=excluded.nonce,
      audience=excluded.audience
  `)
  stmt.run({
    id: req.id,
    definition: req.definition ? JSON.stringify(req.definition) : null,
    createdAt: req.createdAt,
    tenantId: req.tenantId || null,
    nonce: req.nonce || null,
    audience: req.audience || null,
  })
}

export function getPresentationRequestById(id: string): StoredPresentationRequest | null {
  const database = ensureDb()
  const row = database
    .prepare('SELECT id, definition, created_at as createdAt, tenant_id as tenantId, nonce, audience FROM presentation_requests WHERE id = ?')
    .get(id) as any
  if (!row) return null
  return {
    ...row,
    definition: row.definition ? JSON.parse(row.definition) : undefined,
  }
}

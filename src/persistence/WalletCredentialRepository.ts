import type { Database } from 'better-sqlite3'
import { DatabaseManager } from './DatabaseManager'

export interface WalletCredential {
    id: string
    walletId: string
    credentialId: string
    credentialData: string // JSON string
    issuerDid: string
    type: string
    addedOn: string
}

interface WalletCredentialRow {
    id: string
    wallet_id: string
    credential_id: string
    credential_data: string
    issuer_did: string
    type: string
    added_on: string
}

let db: Database | undefined

export const WALLET_CREDENTIALS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS wallet_credentials (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  credential_data TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  type TEXT NOT NULL,
  added_on DATETIME DEFAULT CURRENT_TIMESTAMP
)`

export function initWalletCredentialStore(): Database {
    if (db) {
        return db
    }

    db = DatabaseManager.getDatabase()
    // Ensure table exists
    db.prepare(WALLET_CREDENTIALS_TABLE_SQL).run()
    return db
}

function ensureDb(): Database {
    if (!db) {
        return initWalletCredentialStore()
    }
    return db
}

export function saveWalletCredential(credential: Omit<WalletCredential, 'addedOn'>): WalletCredential {
    const database = ensureDb()
    const now = new Date().toISOString()
    const stmt = database.prepare(`
    INSERT INTO wallet_credentials(id, wallet_id, credential_id, credential_data, issuer_did, type, added_on)
    VALUES (@id, @walletId, @credentialId, @credentialData, @issuerDid, @type, @addedOn)
  `)

    const record = {
        ...credential,
        addedOn: now
    }

    stmt.run({
        id: record.id,
        walletId: record.walletId,
        credentialId: record.credentialId,
        credentialData: record.credentialData,
        issuerDid: record.issuerDid,
        type: record.type,
        addedOn: record.addedOn
    })

    return record
}

export function getWalletCredentialsByWalletId(walletId: string): WalletCredential[] {
    const database = ensureDb()
    const rows = database.prepare('SELECT * FROM wallet_credentials WHERE wallet_id = ? ORDER BY added_on DESC').all(walletId)
    return Array.isArray(rows) ? rows.filter(isWalletCredentialRow).map(mapWalletCredentialRow) : []
}

export function getWalletCredentialById(id: string): WalletCredential | null {
    const database = ensureDb()
    const row = database.prepare('SELECT * FROM wallet_credentials WHERE id = ?').get(id)
    if (!isWalletCredentialRow(row)) return null
    return mapWalletCredentialRow(row)
}

function isWalletCredentialRow(value: unknown): value is WalletCredentialRow {
    if (!value || typeof value !== 'object') return false
    const row = value as Partial<WalletCredentialRow>
    return (
        typeof row.id === 'string' &&
        typeof row.wallet_id === 'string' &&
        typeof row.credential_id === 'string' &&
        typeof row.credential_data === 'string' &&
        typeof row.issuer_did === 'string' &&
        typeof row.type === 'string' &&
        typeof row.added_on === 'string'
    )
}

function mapWalletCredentialRow(row: WalletCredentialRow): WalletCredential {
    return {
        id: row.id,
        walletId: row.wallet_id,
        credentialId: row.credential_id,
        credentialData: row.credential_data,
        issuerDid: row.issuer_did,
        type: row.type,
        addedOn: row.added_on,
    }
}

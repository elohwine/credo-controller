import type { Database } from 'better-sqlite3'
import { DatabaseManager } from './DatabaseManager'

export interface WalletCredential {
    id: string
    walletId: string
    credentialId: string
    credentialData: string // JSON string
    issuerDid: string
    type: string
    format: string
    addedOn: string
}

interface WalletCredentialRow {
    id: string
    wallet_id: string
    credential_id: string
    credential_data: string
    issuer_did: string
    type: string
    format: string
    added_on: string
}

export const WALLET_CREDENTIALS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS wallet_credentials (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  credential_data TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  type TEXT NOT NULL,
  added_on DATETIME DEFAULT CURRENT_TIMESTAMP
)`

let tableInitialized = false

function ensureDb(): Database {
    // Always get the database from DatabaseManager to ensure consistency
    const database = DatabaseManager.getDatabase()
    
    // Ensure table exists (only check once per session)
    if (!tableInitialized) {
        try {
            database.prepare(WALLET_CREDENTIALS_TABLE_SQL).run()
        } catch (e) {
            // Table might already exist, that's fine
        }
        tableInitialized = true
    }
    
    return database
}

export function initWalletCredentialStore(): Database {
    return ensureDb()
}

export function saveWalletCredential(credential: Omit<WalletCredential, 'addedOn'>): WalletCredential {
    const database = ensureDb()
    const now = new Date().toISOString()
    
    // Check which timestamp column exists
    const info = database.prepare("PRAGMA table_info('wallet_credentials')").all()
    const cols = (info as any[]).map((c: any) => c.name)
    const timestampCol = cols.includes('added_on') ? 'added_on' : 'added_at'
    
    const stmt = database.prepare(`
    INSERT INTO wallet_credentials(id, wallet_id, credential_id, credential_data, issuer_did, type, format, ${timestampCol})
    VALUES (@id, @walletId, @credentialId, @credentialData, @issuerDid, @type, @format, @addedOn)
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
        issuerDid: record.issuerDid || '',
        type: record.type || 'VerifiableCredential',
        format: record.format || 'jwt_vc',
        addedOn: record.addedOn
    })

    return record
}

export function getWalletCredentialsByWalletId(walletId: string): WalletCredential[] {
    const database = ensureDb()
    // Attempt to detect available timestamp column name and query accordingly
    const info = database.prepare("PRAGMA table_info('wallet_credentials')").all()
    const cols = info.map((c: any) => c.name)
    let orderBy = 'added_on'
    if (!cols.includes(orderBy)) {
        if (cols.includes('added_at')) orderBy = 'added_at'
        else if (cols.includes('addedOn')) orderBy = 'addedOn'
        else orderBy = cols.includes('created_at') ? 'created_at' : cols[0]
    }
    const rows = database.prepare(`SELECT * FROM wallet_credentials WHERE wallet_id = ? ORDER BY ${orderBy} DESC`).all(walletId) as any[]
    if (!Array.isArray(rows)) return []
    // Map rows flexibly
    return rows.map((r: any) => {
        // normalize keys to expected shape
        const row = r as any
        const added = row.added_on ?? row.added_at ?? row.addedOn ?? row.created_at ?? new Date().toISOString()
        return {
            id: row.id,
            walletId: row.wallet_id ?? row.walletId,
            credentialId: row.credential_id ?? row.credentialId,
            credentialData: row.credential_data ?? row.credentialData,
            issuerDid: row.issuer_did ?? row.issuerDid,
            type: row.type,
            addedOn: typeof added === 'string' ? added : new Date(added).toISOString(),
        } as WalletCredential
    })
}

export function getWalletCredentialById(id: string): WalletCredential | null {
    const database = ensureDb()
    const row: any = database.prepare('SELECT * FROM wallet_credentials WHERE id = ?').get(id)
    if (!row) return null
    const added = row.added_on ?? row.added_at ?? row.addedOn ?? row.created_at ?? new Date().toISOString()
    return {
        id: row.id,
        walletId: row.wallet_id ?? row.walletId,
        credentialId: row.credential_id ?? row.credentialId,
        credentialData: row.credential_data ?? row.credentialData,
        issuerDid: row.issuer_did ?? row.issuerDid,
        type: row.type,
        format: row.format || 'jwt_vc',
        addedOn: typeof added === 'string' ? added : new Date(added).toISOString(),
    }
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
        (typeof row.added_on === 'string' || typeof (row as any).added_at === 'string' || typeof (row as any).addedOn === 'string' || typeof (row as any).created_at === 'string')
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
        format: row.format || 'jwt_vc',
        addedOn: row.added_on,
    }
}

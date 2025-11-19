import type { Database } from 'better-sqlite3'
import { DatabaseManager } from './DatabaseManager'

export interface LoginChallenge {
    id: string // The nonce
    createdAt: string
    expiresAt: string
}

interface LoginChallengeRow {
    id: string
    created_at: string
    expires_at: string
}

let db: Database | undefined

export const LOGIN_CHALLENGES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS login_challenges (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
)`

export function initLoginChallengeStore(): Database {
    if (db) {
        return db
    }

    db = DatabaseManager.getDatabase()
    // Ensure table exists
    db.prepare(LOGIN_CHALLENGES_TABLE_SQL).run()
    return db
}

function ensureDb(): Database {
    if (!db) {
        return initLoginChallengeStore()
    }
    return db
}

export function saveLoginChallenge(challenge: LoginChallenge): void {
    const database = ensureDb()
    const stmt = database.prepare(`
    INSERT INTO login_challenges(id, created_at, expires_at)
    VALUES (@id, @createdAt, @expiresAt)
  `)

    stmt.run({
        id: challenge.id,
        createdAt: challenge.createdAt,
        expiresAt: challenge.expiresAt
    })
}

export function getLoginChallenge(id: string): LoginChallenge | null {
    const database = ensureDb()
    const row = database.prepare('SELECT * FROM login_challenges WHERE id = ?').get(id)
    if (!isLoginChallengeRow(row)) return null
    return mapLoginChallengeRow(row)
}

export function deleteLoginChallenge(id: string): void {
    const database = ensureDb()
    database.prepare('DELETE FROM login_challenges WHERE id = ?').run(id)
}

export function cleanupExpiredChallenges(): void {
    const database = ensureDb()
    const now = new Date().toISOString()
    database.prepare('DELETE FROM login_challenges WHERE expires_at < ?').run(now)
}

function isLoginChallengeRow(value: unknown): value is LoginChallengeRow {
    if (!value || typeof value !== 'object') return false
    const row = value as Partial<LoginChallengeRow>
    return (
        typeof row.id === 'string' &&
        typeof row.created_at === 'string' &&
        typeof row.expires_at === 'string'
    )
}

function mapLoginChallengeRow(row: LoginChallengeRow): LoginChallenge {
    return {
        id: row.id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
    }
}

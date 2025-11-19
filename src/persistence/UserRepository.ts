import type { Database } from 'better-sqlite3'

import { DatabaseManager } from './DatabaseManager'

export interface WalletUser {
  id: string
  username: string
  email: string
  passwordHash: string
  walletId: string // This will be the user DID
  createdAt: string
  updatedAt: string
}

interface WalletUserRow {
  id: string
  username: string
  email: string
  password_hash: string
  wallet_id: string
  created_at: string
  updated_at: string
}

let db: Database | undefined

export const WALLET_USERS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS wallet_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  wallet_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`

export function initWalletUserStore(): Database {
  if (db) {
    return db
  }

  db = DatabaseManager.getDatabase()
  // Ensure table exists
  db.prepare(WALLET_USERS_TABLE_SQL).run()
  return db
}

function ensureDb(): Database {
  if (!db) {
    return initWalletUserStore()
  }
  return db
}

export function createWalletUser(user: Omit<WalletUser, 'id' | 'createdAt' | 'updatedAt'>): WalletUser {
  const database = ensureDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const stmt = database.prepare(`
    INSERT INTO wallet_users(id, username, email, password_hash, wallet_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(id, user.username, user.email, user.passwordHash, user.walletId, now, now)
  return {
    id,
    ...user,
    createdAt: now,
    updatedAt: now,
  }
}

export function getWalletUserById(id: string): WalletUser | null {
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM wallet_users WHERE id = ?').get(id)
  if (!isWalletUserRow(row)) return null
  return mapWalletUserRow(row)
}

export function getWalletUserByUsername(username: string): WalletUser | null {
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM wallet_users WHERE username = ?').get(username)
  if (!isWalletUserRow(row)) return null
  return mapWalletUserRow(row)
}

export function getWalletUserByEmail(email: string): WalletUser | null {
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM wallet_users WHERE email = ?').get(email)
  if (!isWalletUserRow(row)) return null
  return mapWalletUserRow(row)
}

export function getWalletUserByWalletId(walletId: string): WalletUser | null {
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM wallet_users WHERE wallet_id = ?').get(walletId)
  if (!isWalletUserRow(row)) return null
  return mapWalletUserRow(row)
}

export function updateWalletUser(id: string, updates: Partial<Pick<WalletUser, 'username' | 'email' | 'passwordHash' | 'walletId'>>): WalletUser | null {
  const database = ensureDb()
  const now = new Date().toISOString()
  const setParts: string[] = []
  const values: unknown[] = []

  if (updates.username !== undefined) {
    setParts.push('username = ?')
    values.push(updates.username)
  }
  if (updates.email !== undefined) {
    setParts.push('email = ?')
    values.push(updates.email)
  }
  if (updates.passwordHash !== undefined) {
    setParts.push('password_hash = ?')
    values.push(updates.passwordHash)
  }
  if (updates.walletId !== undefined) {
    setParts.push('wallet_id = ?')
    values.push(updates.walletId)
  }

  if (setParts.length === 0) return getWalletUserById(id)

  setParts.push('updated_at = ?')
  values.push(now)
  values.push(id)

  const stmt = database.prepare(`UPDATE wallet_users SET ${setParts.join(', ')} WHERE id = ?`)
  const result = stmt.run(...values)
  if (result.changes === 0) return null
  return getWalletUserById(id)
}

export function deleteWalletUser(id: string): boolean {
  const database = ensureDb()
  const result = database.prepare('DELETE FROM wallet_users WHERE id = ?').run(id)
  return result.changes > 0
}

function isWalletUserRow(value: unknown): value is WalletUserRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<WalletUserRow>
  return (
    typeof row.id === 'string' &&
    typeof row.username === 'string' &&
    typeof row.email === 'string' &&
    typeof row.password_hash === 'string' &&
    typeof row.wallet_id === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string'
  )
}

function mapWalletUserRow(row: WalletUserRow): WalletUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    walletId: row.wallet_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
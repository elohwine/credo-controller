import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'

import { DatabaseManager } from '../../DatabaseManager'
import { createDatabaseAdapter, getDatabaseAdapter, resetDatabaseAdapter } from '../AdapterFactory'
import { PostgresDatabaseAdapter } from '../PostgresDatabaseAdapter'
import { SqliteDatabaseAdapter } from '../SqliteDatabaseAdapter'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS adapter_test (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
);
`

function initTestDb(): Database.Database {
  const dbPath = path.join(tmpdir(), `test-adapter-${randomUUID()}.db`)
  const db = new Database(dbPath)
  db.exec(SCHEMA)
  ;(DatabaseManager as any).instance = db
  return db
}

describe('SqliteDatabaseAdapter', () => {
  let db: Database.Database
  let adapter: SqliteDatabaseAdapter

  beforeEach(() => {
    db = initTestDb()
    adapter = new SqliteDatabaseAdapter(db)
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    resetDatabaseAdapter()
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  // ── Identity ─────────────────────────────────────────────────────────────

  it('reports adapterType as sqlite', () => {
    expect(adapter.adapterType).toBe('sqlite')
  })

  it('reports isReady as true', () => {
    expect(adapter.isReady).toBe(true)
  })

  // ── prepare / run / get / all ─────────────────────────────────────────────

  it('inserts a row and reads it back', () => {
    const id = randomUUID()
    adapter.prepare('INSERT INTO adapter_test (id, name, value) VALUES (?, ?, ?)').run(id, 'alpha', 42)
    const row = adapter.prepare('SELECT * FROM adapter_test WHERE id = ?').get(id) as any
    expect(row?.name).toBe('alpha')
    expect(row?.value).toBe(42)
  })

  it('returns undefined from get() when row does not exist', () => {
    const row = adapter.prepare('SELECT * FROM adapter_test WHERE id = ?').get('nonexistent')
    expect(row).toBeUndefined()
  })

  it('returns all matching rows from all()', () => {
    for (let i = 0; i < 3; i++) {
      adapter.prepare('INSERT INTO adapter_test (id, name, value) VALUES (?, ?, ?)').run(randomUUID(), 'bulk', i)
    }
    const rows = adapter.prepare("SELECT * FROM adapter_test WHERE name = 'bulk'").all()
    expect(rows).toHaveLength(3)
  })

  it('run() returns changes count', () => {
    const id = randomUUID()
    adapter.prepare('INSERT INTO adapter_test (id, name, value) VALUES (?, ?, ?)').run(id, 'x', 1)
    const result = adapter.prepare('UPDATE adapter_test SET value = 99 WHERE id = ?').run(id)
    expect(result.changes).toBe(1)
  })

  // ── transaction ───────────────────────────────────────────────────────────

  it('commits a transaction', () => {
    const id = randomUUID()
    const txn = adapter.transaction(() => {
      adapter.prepare('INSERT INTO adapter_test (id, name, value) VALUES (?, ?, ?)').run(id, 'tx', 7)
    })
    txn()
    const row = adapter.prepare('SELECT * FROM adapter_test WHERE id = ?').get(id) as any
    expect(row?.value).toBe(7)
  })

  it('rolls back a transaction on error', () => {
    const id = randomUUID()
    const txn = adapter.transaction(() => {
      adapter.prepare('INSERT INTO adapter_test (id, name, value) VALUES (?, ?, ?)').run(id, 'rollback', 5)
      throw new Error('forced rollback')
    })
    expect(() => txn()).toThrow('forced rollback')
    const row = adapter.prepare('SELECT * FROM adapter_test WHERE id = ?').get(id)
    expect(row).toBeUndefined()
  })

  // ── pragma / exec ─────────────────────────────────────────────────────────

  it('exec() runs DDL without error', () => {
    expect(() => adapter.exec('CREATE TABLE IF NOT EXISTS pragma_test (x TEXT)')).not.toThrow()
  })

  it('pragma() reads a value', () => {
    const result = adapter.pragma('journal_mode')
    expect(result).toBeDefined()
  })

  // ── unwrap ────────────────────────────────────────────────────────────────

  it('unwrap() returns the underlying Database instance', () => {
    expect(adapter.unwrap()).toBe(db)
  })
})

// ── AdapterFactory ────────────────────────────────────────────────────────────

describe('AdapterFactory', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initTestDb()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    resetDatabaseAdapter()
    delete process.env.DATABASE_ADAPTER
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  it('returns a SqliteDatabaseAdapter by default', () => {
    const adapter = createDatabaseAdapter()
    expect(adapter.adapterType).toBe('sqlite')
    expect(adapter).toBeInstanceOf(SqliteDatabaseAdapter)
  })

  it('returns a PostgresDatabaseAdapter when DATABASE_ADAPTER=postgres', () => {
    process.env.DATABASE_ADAPTER = 'postgres'
    const adapter = createDatabaseAdapter()
    expect(adapter.adapterType).toBe('postgres')
    expect(adapter).toBeInstanceOf(PostgresDatabaseAdapter)
  })

  it('getDatabaseAdapter() returns same instance on repeated calls', () => {
    const a = getDatabaseAdapter()
    const b = getDatabaseAdapter()
    expect(a).toBe(b)
  })

  it('resetDatabaseAdapter() clears the singleton', () => {
    const a = getDatabaseAdapter()
    resetDatabaseAdapter()
    const b = getDatabaseAdapter()
    expect(a).not.toBe(b)
  })
})

// ── PostgresDatabaseAdapter ───────────────────────────────────────────────────

describe('PostgresDatabaseAdapter', () => {
  const adapter = new PostgresDatabaseAdapter()

  it('reports adapterType as postgres', () => {
    expect(adapter.adapterType).toBe('postgres')
  })

  it('reports isReady as false (not implemented)', () => {
    expect(adapter.isReady).toBe(false)
  })

  it('prepare() throws NotImplemented', () => {
    expect(() => adapter.prepare('SELECT 1')).toThrow(/not yet implemented/)
  })

  it('transaction() throws NotImplemented', () => {
    expect(() => adapter.transaction(() => {})).toThrow(/not yet implemented/)
  })

  it('exec() throws NotImplemented', () => {
    expect(() => adapter.exec('SELECT 1')).toThrow(/not yet implemented/)
  })

  it('pragma() silently returns undefined (no-op for postgres)', () => {
    expect(adapter.pragma('journal_mode')).toBeUndefined()
  })
})

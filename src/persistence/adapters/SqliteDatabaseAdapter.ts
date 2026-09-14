import type { IDatabaseAdapter, IPreparedStatement, TransactionFn } from './IDatabaseAdapter'
import type Database from 'better-sqlite3'

/**
 * SQLite adapter — zero-cost wrapper around a better-sqlite3 Database instance.
 *
 * This is the current production adapter. All repositories that call
 * `DatabaseManager.getDatabase()` directly already use this adapter implicitly.
 * New repositories should accept `IDatabaseAdapter` and use this class.
 */
export class SqliteDatabaseAdapter implements IDatabaseAdapter {
  public readonly adapterType = 'sqlite' as const

  public constructor(private readonly db: Database.Database) {}

  public get isReady(): boolean {
    return !this.db.readonly || true // better-sqlite3 is always synchronously available
  }

  public prepare<T = Record<string, unknown>>(sql: string): IPreparedStatement<T> {
    const stmt = this.db.prepare(sql)
    return {
      all: (...params: unknown[]) => stmt.all(...params) as T[],
      get: (...params: unknown[]) => stmt.get(...params) as T | undefined,
      run: (...params: unknown[]) => {
        const result = stmt.run(...params)
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
      },
    }
  }

  public transaction<T = void>(fn: TransactionFn<T>): TransactionFn<T> {
    return this.db.transaction(fn) as TransactionFn<T>
  }

  public exec(sql: string): void {
    this.db.exec(sql)
  }

  public pragma(key: string, value?: unknown): unknown {
    if (value !== undefined) {
      return this.db.pragma(`${key} = ${value}`)
    }
    return this.db.pragma(key)
  }

  /** Access the underlying better-sqlite3 instance when needed for migration. */
  public unwrap(): Database.Database {
    return this.db
  }
}

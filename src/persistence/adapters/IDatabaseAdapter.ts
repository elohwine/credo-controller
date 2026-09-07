/**
 * Database adapter abstraction.
 *
 * The synchronous interface matches better-sqlite3's PreparedStatement API so
 * that the SQLite adapter can be a zero-cost wrapper. The PostgreSQL adapter
 * must implement an equivalent synchronous surface via connection-pool
 * pre-fetching or a worker_threads bridge — see PostgresDatabaseAdapter for
 * details.
 *
 * Only the methods actually used by platform repositories are included here.
 * Legacy repositories that call DatabaseManager.getDatabase() directly are
 * NOT required to migrate immediately.
 */

// ── Statement ─────────────────────────────────────────────────────────────────

/** A single prepared SQL statement. */
export interface IPreparedStatement<T = Record<string, unknown>> {
  /** Execute and return all rows. */
  all(...params: unknown[]): T[]
  /** Execute and return the first row, or undefined. */
  get(...params: unknown[]): T | undefined
  /** Execute a write statement and return change metadata. */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
}

// ── Transaction ───────────────────────────────────────────────────────────────

/** A transaction wrapper that executes synchronously. */
export type TransactionFn<T = void> = () => T
export type TransactionWrapper = <T>(fn: TransactionFn<T>) => TransactionFn<T>

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface IDatabaseAdapter {
  /**
   * Prepares a SQL statement for repeated execution.
   * Named parameters use `@name` syntax (SQLite) or `$1` positional syntax
   * (PostgreSQL shim handles the translation transparently).
   */
  prepare<T = Record<string, unknown>>(sql: string): IPreparedStatement<T>

  /**
   * Wraps a function in an atomic transaction.
   * The returned function is synchronous and runs all statements atomically.
   */
  transaction<T = void>(fn: TransactionFn<T>): TransactionFn<T>

  /**
   * Executes raw DDL or multi-statement SQL without parameters.
   * Used by DatabaseManager during migration.
   */
  exec(sql: string): void

  /**
   * Sets a database pragma (SQLite-specific).
   * PostgreSQL adapters should ignore unsupported pragmas silently.
   */
  pragma(key: string, value?: unknown): unknown

  /** Adapter type identifier — for logging and conditional behaviour. */
  readonly adapterType: 'sqlite' | 'postgres'

  /** Whether the adapter is currently connected and ready. */
  readonly isReady: boolean
}

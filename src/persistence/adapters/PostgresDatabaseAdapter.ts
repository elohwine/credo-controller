import type { IDatabaseAdapter, IPreparedStatement, TransactionFn } from './IDatabaseAdapter'

/**
 * PostgreSQL adapter — production-path adapter for when the platform migrates
 * from SQLite to PostgreSQL.
 *
 * ## Synchronous bridging strategy
 *
 * The platform domain layer uses the synchronous `IDatabaseAdapter` interface
 * (matching better-sqlite3). PostgreSQL's `pg` client is asynchronous.
 *
 * Two viable migration paths:
 *
 * A. **Worker-thread bridge (recommended for gradual migration)**
 *    Run a dedicated worker thread that owns the pg connection pool. The main
 *    thread sends SQL + params via `Atomics.wait`, the worker executes them
 *    and writes the result to a SharedArrayBuffer. This preserves the
 *    synchronous call-site while upgrading the transport layer.
 *
 * B. **Async repository layer (recommended for greenfield)**
 *    Replace IDatabaseAdapter with an async version. All repositories become
 *    `async` methods. This is the correct long-term design but requires
 *    updating every call-site.
 *
 * This file documents the intended API for path A. When the migration is
 * ready, replace the bodies of `prepare`, `transaction`, `exec`, and `pragma`
 * with the actual worker bridge implementation.
 *
 * ## Connection configuration
 *
 * Set DATABASE_URL in the environment (standard `pg` connection string):
 *   postgres://user:password@host:5432/dbname
 *
 * TLS is required in production — ensure the connection string includes
 * `?sslmode=require` or configure it via the pool options.
 *
 * ## Status
 *
 * NOT PRODUCTION READY. This adapter is a documented skeleton.
 * Enabling it (via DATABASE_ADAPTER=postgres) will throw on any operation.
 */
export class PostgresDatabaseAdapter implements IDatabaseAdapter {
  public readonly adapterType = 'postgres' as const

  public get isReady(): boolean {
    return false // not yet implemented
  }

  public prepare<T = Record<string, unknown>>(_sql: string): IPreparedStatement<T> {
    throw new Error(
      'PostgresDatabaseAdapter is not yet implemented. ' +
        'Set DATABASE_ADAPTER=sqlite (default) or implement the worker-thread bridge.',
    )
  }

  public transaction<T = void>(_fn: TransactionFn<T>): TransactionFn<T> {
    throw new Error('PostgresDatabaseAdapter is not yet implemented.')
  }

  public exec(_sql: string): void {
    throw new Error('PostgresDatabaseAdapter is not yet implemented.')
  }

  public pragma(_key: string, _value?: unknown): unknown {
    // PostgreSQL has no pragma concept — silently ignore.
    return undefined
  }
}

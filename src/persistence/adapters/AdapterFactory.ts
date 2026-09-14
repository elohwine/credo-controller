import type { IDatabaseAdapter } from './IDatabaseAdapter'

import { DatabaseManager } from '../DatabaseManager'

import { PostgresDatabaseAdapter } from './PostgresDatabaseAdapter'
import { SqliteDatabaseAdapter } from './SqliteDatabaseAdapter'

export type AdapterType = 'sqlite' | 'postgres'

/**
 * Creates the appropriate IDatabaseAdapter from the environment.
 *
 * DATABASE_ADAPTER=sqlite  (default) — uses the already-initialised
 *   DatabaseManager.getDatabase() instance.
 * DATABASE_ADAPTER=postgres — uses PostgresDatabaseAdapter (not yet
 *   implemented; will throw on first use).
 *
 * Call this after DatabaseManager.initialize() has been called.
 */
export function createDatabaseAdapter(): IDatabaseAdapter {
  const adapterType = (process.env.DATABASE_ADAPTER ?? 'sqlite') as AdapterType

  if (adapterType === 'postgres') {
    return new PostgresDatabaseAdapter()
  }

  // Default: SQLite — wrap the already-initialized better-sqlite3 instance
  const db = DatabaseManager.getDatabase()
  return new SqliteDatabaseAdapter(db)
}

/** Singleton adapter instance — created lazily on first access. */
let _adapter: IDatabaseAdapter | null = null

export function getDatabaseAdapter(): IDatabaseAdapter {
  if (!_adapter) {
    _adapter = createDatabaseAdapter()
  }
  return _adapter
}

/** Reset the adapter singleton — for testing only. */
export function resetDatabaseAdapter(): void {
  _adapter = null
}

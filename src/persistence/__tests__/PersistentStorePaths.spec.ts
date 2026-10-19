import type { Database } from 'better-sqlite3'

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe.each([
  { modulePath: '../TenantRepository', init: 'initTenantStore', env: 'TENANT_DB_PATH', filename: 'tenants.db' },
  { modulePath: '../OidcStoreRepository', init: 'initOidcStore', env: 'OIDC_DB_PATH', filename: 'oidc.db' },
])('$filename persistent location', ({ modulePath, init, env, filename }) => {
  let directory: string
  let previousPersistence: string | undefined
  let previousOverride: string | undefined
  const connections: Database[] = []

  async function open(explicitPath?: string): Promise<Database> {
    let connection: Database
    await jest.isolateModulesAsync(async () => {
      const repository = await import(modulePath)
      connection = repository[init](explicitPath)
    })
    connections.push(connection!)
    return connection!
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'persistent-store-path-'))
    previousPersistence = process.env.PERSISTENCE_DB_PATH
    previousOverride = process.env[env]
    process.env.PERSISTENCE_DB_PATH = path.join(directory, 'volume', 'persistence.db')
    delete process.env[env]
  })

  afterEach(() => {
    for (const connection of connections.splice(0)) {
      if (connection.open) connection.close()
    }
    if (previousPersistence === undefined) delete process.env.PERSISTENCE_DB_PATH
    else process.env.PERSISTENCE_DB_PATH = previousPersistence
    if (previousOverride === undefined) delete process.env[env]
    else process.env[env] = previousOverride
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('keeps the default store beside the persistent database across process-module reloads', async () => {
    const first = await open()
    expect(first.name).toBe(path.join(directory, 'volume', filename))
    first.exec('CREATE TABLE persistence_probe (id TEXT PRIMARY KEY)')
    first.prepare('INSERT INTO persistence_probe (id) VALUES (?)').run('survives-reload')
    first.close()
    expect((await open()).prepare('SELECT id FROM persistence_probe').get()).toEqual({ id: 'survives-reload' })
  })

  it('honours an explicit store environment override', async () => {
    process.env[env] = path.join(directory, 'override', filename)
    expect((await open()).name).toBe(process.env[env])
  })

  it('prefers the initializer path over environment overrides', async () => {
    process.env[env] = path.join(directory, 'override', filename)
    const explicitPath = path.join(directory, 'explicit', filename)
    expect((await open(explicitPath)).name).toBe(explicitPath)
  })
})

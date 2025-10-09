import 'reflect-metadata'
import type { Express } from 'express'

import { Agent as CoreAgent, InitConfig, LogLevel } from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { TenantsModule as TenantsModuleClass } from '@credo-ts/tenants'
import express from 'express'
import { randomUUID } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'

import { buildModules, RestMultiTenantAgentModules } from '../../src/cliAgent'
import { generateSecretKey } from '../../src/utils/helpers'
import { setupServer } from '../../src/server'
import { TsLogger } from '../../src/utils/logger'
import { otelSDK, otelLoggerProviderInstance } from '../../src/tracer'

export interface TestServerContext {
  app: Express
  agent: CoreAgent<RestMultiTenantAgentModules>
  apiKey: string
  tempDir: string
  tenantDbPath: string
  cleanup: () => Promise<void>
}

function ensureRateLimitDefaults() {
  if (!process.env.windowMs) {
    process.env.windowMs = '60000'
  }
  if (!process.env.maxRateLimit) {
    process.env.maxRateLimit = '1000'
  }
}

export async function createTestServerContext(): Promise<TestServerContext> {
  ensureRateLimitDefaults()

  const tempDir = mkdtempSync(join(tmpdir(), 'credo-controller-tests-'))
  const tenantDbPath = join(tempDir, 'tenants.db')
  const previousTenantDbPath = process.env.TENANT_DB_PATH
  process.env.TENANT_DB_PATH = tenantDbPath

  const walletStoragePath = join(tempDir, 'wallets')
  const walletId = `test-root-${randomUUID()}`
  const logger = new TsLogger(LogLevel.error)

  const agentConfig: InitConfig = {
    label: 'Test Credo Controller',
    endpoints: ['http://localhost:3000'],
    autoUpdateStorageOnStartup: true,
    backupBeforeStorageUpdate: false,
    processDidCommMessagesConcurrently: true,
    walletConfig: {
      id: walletId,
      key: 'test-wallet-key',
      storage: {
        type: 'sqlite',
        path: walletStoragePath,
      },
    },
    logger,
  }

  const baseModules = buildModules({
    autoAcceptConnections: true,
    walletScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
  })

  const modules: RestMultiTenantAgentModules = {
    ...baseModules,
    tenants: new TenantsModuleClass<typeof baseModules>({
      sessionAcquireTimeout: Number(process.env.SESSION_ACQUIRE_TIMEOUT) || 5000,
      sessionLimit: Number(process.env.SESSION_LIMIT) || 10,
    }),
  }

  const agentInstance = new CoreAgent({
    config: agentConfig,
    modules: modules as any,
    dependencies: agentDependencies,
  })

  const agent = agentInstance as unknown as CoreAgent<RestMultiTenantAgentModules>

  await agent.initialize()

  const genericRecords = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
  if (!genericRecords[0]) {
    const secretKey = await generateSecretKey()
    await agent.genericRecords.save({
      content: { secretKey },
      tags: { hasSecretKey: 'true' },
    })
  }

  const appInstance = express()
  const apiKey = `test-${randomUUID()}`
  const app = await setupServer(agent, { port: 0, app: appInstance }, apiKey)

  const cleanup = async () => {
    try {
      await agent.shutdown()
    } catch {}

    try {
      await agent.wallet.delete()
    } catch {}

    try {
      await otelSDK.shutdown()
    } catch {}

    try {
      await otelLoggerProviderInstance.shutdown()
    } catch {}

    if (previousTenantDbPath) {
      process.env.TENANT_DB_PATH = previousTenantDbPath
    } else {
      delete process.env.TENANT_DB_PATH
    }

    rmSync(tempDir, { recursive: true, force: true })
  }

  return {
    app,
    agent,
    apiKey,
    tempDir,
    tenantDbPath,
    cleanup,
  }
}

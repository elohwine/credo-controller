import type { InitConfig } from '@credo-ts/core'
import type { WalletConfig } from '@credo-ts/core/build/types'
import type { TenantsModule } from '@credo-ts/tenants'

import { PolygonDidRegistrar, PolygonDidResolver, PolygonModule } from '@ayanworks/credo-polygon-w3c-module'
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  Agent,
  AutoAcceptCredential,
  AutoAcceptProof,
  CacheModule,
  ConnectionsModule,
  CredentialsModule,
  DidsModule,
  HttpOutboundTransport,
  InMemoryLruCache,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  ProofsModule,
  WebDidResolver,
  W3cCredentialsModule,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { QuestionAnswerModule } from '@credo-ts/question-answer'
import { TenantsModule as TenantsModuleClass } from '@credo-ts/tenants'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'
import { readFile } from 'fs/promises'

import { setupServer } from './server'
import { generateSecretKey } from './utils/helpers'
import { TsLogger } from './utils/logger'

export interface AriesRestConfig {
  label: string
  walletConfig: WalletConfig
  adminPort: number
  endpoints?: string[]
  autoAcceptConnections?: boolean
  autoAcceptCredentials?: AutoAcceptCredential
  autoAcceptProofs?: AutoAcceptProof
  logLevel?: LogLevel
  inboundTransports?: { transport: 'http'; port: number }[]
  outboundTransports?: 'http'[]
  tenancy?: boolean
  webhookUrl?: string
  didRegistryContractAddress?: string
  schemaManagerContractAddress?: string
  rpcUrl?: string
  fileServerUrl?: string
  fileServerToken?: string
  walletScheme?: AskarMultiWalletDatabaseScheme
  schemaFileServerURL?: string
  apiKey: string
  updateJwtSecret?: boolean
}

export async function readRestConfig(path: string) {
  const configString = await readFile(path, { encoding: 'utf-8' })
  return JSON.parse(configString)
}

export const buildModules = (cfg: {
  didRegistryContractAddress?: string
  schemaManagerContractAddress?: string
  fileServerToken?: string
  fileServerUrl?: string
  rpcUrl?: string
  autoAcceptConnections?: boolean
  autoAcceptCredentials?: AutoAcceptCredential
  autoAcceptProofs?: AutoAcceptProof
  walletScheme?: AskarMultiWalletDatabaseScheme
}) => {
  return {
    askar: new AskarModule({
      ariesAskar,
      multiWalletDatabaseScheme: cfg.walletScheme || AskarMultiWalletDatabaseScheme.ProfilePerWallet,
    }),
    dids: new DidsModule({
      registrars: [new KeyDidRegistrar(), new PolygonDidRegistrar()],
      resolvers: [new KeyDidResolver(), new WebDidResolver(), new PolygonDidResolver()],
    }),
    connections: new ConnectionsModule({ autoAcceptConnections: cfg.autoAcceptConnections ?? true }),
    proofs: new ProofsModule({
      autoAcceptProofs: cfg.autoAcceptProofs || AutoAcceptProof.ContentApproved,
      proofProtocols: [],
    }),
    credentials: new CredentialsModule({
      autoAcceptCredentials: cfg.autoAcceptCredentials ?? AutoAcceptCredential.ContentApproved,
    }),
    w3cCredentials: new W3cCredentialsModule({}),
    cache: new CacheModule({
      cache: new InMemoryLruCache({ limit: Number(process.env.INMEMORY_LRU_CACHE_LIMIT) || Infinity }),
    }),
    questionAnswer: new QuestionAnswerModule(),
    polygon: new PolygonModule({
      didContractAddress: cfg.didRegistryContractAddress || (process.env.DID_CONTRACT_ADDRESS as string),
      schemaManagerContractAddress:
        cfg.schemaManagerContractAddress || (process.env.SCHEMA_MANAGER_CONTRACT_ADDRESS as string),
      fileServerToken: cfg.fileServerToken || (process.env.FILE_SERVER_TOKEN as string),
      rpcUrl: cfg.rpcUrl || (process.env.RPC_URL as string),
      serverUrl: cfg.fileServerUrl || (process.env.SERVER_URL as string),
    }),
  }
}

export async function runRestAgent(restConfig: AriesRestConfig) {
  const {
    schemaFileServerURL,
    logLevel,
    inboundTransports = [],
    outboundTransports = [],
    webhookUrl,
    adminPort,
    didRegistryContractAddress,
    fileServerToken,
    fileServerUrl,
    rpcUrl,
    schemaManagerContractAddress,
    walletConfig,
    autoAcceptConnections,
    autoAcceptCredentials,
    autoAcceptProofs,
    walletScheme,
    apiKey,
    updateJwtSecret,
    tenancy,
    ...afjConfig
  } = restConfig

  const logger = new TsLogger(logLevel ?? LogLevel.error)
  const agentConfig: InitConfig = {
    walletConfig: { id: walletConfig.id, key: walletConfig.key, storage: walletConfig.storage },
    ...afjConfig,
    logger,
    autoUpdateStorageOnStartup: true,
    backupBeforeStorageUpdate: false,
    processDidCommMessagesConcurrently: true,
  }

  const baseModules = buildModules({
    didRegistryContractAddress,
    schemaManagerContractAddress,
    fileServerToken,
    fileServerUrl,
    rpcUrl,
    autoAcceptConnections,
    autoAcceptCredentials,
    autoAcceptProofs,
    walletScheme,
  })

  const tenantModules = tenancy
    ? {
        tenants: new TenantsModuleClass<typeof baseModules>({
          sessionAcquireTimeout: Number(process.env.SESSION_ACQUIRE_TIMEOUT) || Infinity,
          sessionLimit: Number(process.env.SESSION_LIMIT) || Infinity,
        }),
        ...baseModules,
      }
    : baseModules

  const agent = new Agent({ config: agentConfig, modules: tenantModules as any, dependencies: agentDependencies })

  for (const ot of outboundTransports) {
    if (ot === 'http') agent.registerOutboundTransport(new HttpOutboundTransport())
  }
  for (const it of inboundTransports) {
    if (it.transport === 'http') {
      const { HttpInboundTransport } = await import('@credo-ts/node')
      agent.registerInboundTransport(new HttpInboundTransport({ port: it.port }))
    }
  }

  await agent.initialize()

  const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
  const record = genericRecord[0]
  if (!record) {
    const secretKeyInfo = await generateSecretKey()
    await agent.genericRecords.save({
      content: { secretKey: secretKeyInfo },
      tags: { hasSecretKey: 'true' },
    })
  } else if (updateJwtSecret) {
    record.content.secretKey = await generateSecretKey()
    record.setTag('hasSecretKey', true)
    await agent.genericRecords.update(record)
  }

  const app = await setupServer(agent, { webhookUrl, port: adminPort, schemaFileServerURL }, apiKey)
  logger.info(`*** API Key: ${apiKey}`)
  app.listen(adminPort, () => logger.info(`Server started on ${adminPort}`))
}

// Re-export module map types for use across the codebase
export type RestAgentModules = ReturnType<typeof buildModules>
export type RestMultiTenantAgentModules = RestAgentModules & { tenants: TenantsModule<RestAgentModules> }

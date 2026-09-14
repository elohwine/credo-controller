/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
import type { DidCommAutoAcceptProof } from '@credo-ts/didcomm'

import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  Agent,
  CacheModule,
  ClaimFormat,
  DidsModule,
  InMemoryLruCache,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  W3cCredentialsModule,
  WebDidResolver,
  type InitConfig,
} from '@credo-ts/core'
import { DidCommModule } from '@credo-ts/didcomm'
import { DidCommHttpOutboundTransport } from '@credo-ts/didcomm'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
import { QuestionAnswerModule } from '@credo-ts/question-answer'
import { TenantsModule as TenantsModuleClass, type TenantsModule } from '@credo-ts/tenants'
import { askar } from '@openwallet-foundation/askar-nodejs'
import express, { type Express } from 'express'
import { readFile } from 'fs/promises'

import { setupServer } from './server'
import { generateSecretKey } from './utils/helpers'
import { TsLogger } from './utils/logger'

type WalletConfig = {
  id: string
  key: string
  storage?: {
    type: string
    config?: Record<string, unknown>
    credentials?: Record<string, unknown>
  }
}

export type CliAutoAcceptProof = DidCommAutoAcceptProof

export interface AriesRestConfig {
  label: string
  walletConfig: WalletConfig
  adminPort: number
  endpoints?: string[]
  autoAcceptConnections?: boolean
  autoAcceptProofs?: CliAutoAcceptProof
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
  app: Express
  didRegistryContractAddress?: string
  schemaManagerContractAddress?: string
  fileServerToken?: string
  fileServerUrl?: string
  rpcUrl?: string
  autoAcceptConnections?: boolean
  walletScheme?: AskarMultiWalletDatabaseScheme
  walletConfig?: WalletConfig
  endpoints?: string[]
  inboundTransports?: { transport: 'http'; port: number }[]
  outboundTransports?: 'http'[]
}) => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
  const normalizedBaseUrl = publicBaseUrl.replace(/\/$/, '')

  const walletId = cfg.walletConfig?.id || process.env.WALLET_ID || 'default-wallet'
  const walletKey = cfg.walletConfig?.key || process.env.WALLET_KEY || 'default-wallet-key'
  const didcommInboundTransports = (cfg.inboundTransports || []).flatMap((transport) =>
    transport.transport === 'http' ? [new DidCommHttpInboundTransport({ port: transport.port })] : [],
  )
  const didcommOutboundTransports = (cfg.outboundTransports || []).flatMap((transport) =>
    transport === 'http' ? [new DidCommHttpOutboundTransport()] : [],
  )

  return {
    askar: new AskarModule({
      askar,
      store: {
        id: walletId,
        key: walletKey,
      },
      multiWalletDatabaseScheme: cfg.walletScheme || AskarMultiWalletDatabaseScheme.ProfilePerWallet,
    }),
    didcomm: new DidCommModule({
      endpoints: cfg.endpoints || [normalizedBaseUrl],
      transports: {
        inbound: didcommInboundTransports,
        outbound: didcommOutboundTransports,
      },
      connections: {
        autoAcceptConnections: cfg.autoAcceptConnections ?? true,
      },
    }),
    dids: new DidsModule({
      registrars: [new KeyDidRegistrar()],
      resolvers: [new KeyDidResolver(), new WebDidResolver()],
    }),
    w3cCredentials: new W3cCredentialsModule({}),
    cache: new CacheModule({
      cache: new InMemoryLruCache({ limit: Number(process.env.INMEMORY_LRU_CACHE_LIMIT) || Infinity }),
    }),
    questionAnswer: new QuestionAnswerModule(),
    openid4vc: new OpenId4VcModule({
      app: cfg.app,
      issuer: {
        baseUrl: `${normalizedBaseUrl}/oidc/issuer`,
        credentialRequestToCredentialMapper: async ({
          agentContext,
          issuanceSession,
          holderBinding,
          credentialConfigurationId,
          credentialConfiguration,
        }) => {
          const metadata = (issuanceSession.issuanceMetadata as any) ?? {}
          const claims = metadata?.claims || {}

          let subjectDid = metadata?.subjectDid || 'did:example:unknown'
          if (holderBinding && typeof holderBinding === 'object' && 'did' in holderBinding) {
            subjectDid = (holderBinding as any).did
          }

          const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')
          const credDef = credentialDefinitionStore.get(credentialConfigurationId)
          if (!credDef) {
            throw new Error(`Credential definition not found for: ${credentialConfigurationId}`)
          }

          const { DidsApi } = await import('@credo-ts/core')
          const didsApi = agentContext.dependencyManager.resolve(DidsApi)
          const [didRecord] = await didsApi.getCreatedDids({ method: 'key' })
          const issuerDid = credDef.issuerDid || didRecord?.did || 'did:example:issuer'

          const verificationMethod = `${issuerDid}#${issuerDid.split(':').pop()}`
          const credentialId = metadata?.credentialId || `urn:uuid:${issuanceSession.id}`
          const tenantId = metadata?.tenantId || 'default'

          const credentialPayload: Record<string, unknown> = {
            id: credentialId,
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: credDef.credentialType || ['VerifiableCredential', credentialConfigurationId],
            issuer: issuerDid,
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              id: subjectDid,
              ...claims,
            },
          }

          try {
            const { statusListAllocatorService } = await import('./services/ssi/StatusListAllocatorService')
            const allocation = statusListAllocatorService.allocateForTenant(
              tenantId,
              issuerDid,
              'revocation',
              credentialId,
            )
            if (allocation) {
              credentialPayload.credentialStatus = allocation.entry
            }
          } catch (statusErr: any) {
            agentContext.config.logger.warn(
              `Status list allocation failed — credential issued without credentialStatus: ${statusErr?.message}`,
            )
          }

          try {
            const { IssuedCredentialRepository } = await import('./persistence/IssuedCredentialRepository')
            const issuedCredentialRepository = new IssuedCredentialRepository()
            issuedCredentialRepository.save({
              id: issuanceSession.id,
              tenantId,
              credentialId,
              holderDid: subjectDid,
              credentialDefinitionId: metadata?.credentialDefinitionId || credentialConfigurationId,
              credentialData: credentialPayload,
              format: ClaimFormat.JwtVc,
              revoked: false,
            })
          } catch (err: any) {
            console.warn('[CredentialMapper] Failed to persist issued credential:', err?.message)
          }

          return {
            type: 'credentials',
            format: ClaimFormat.JwtVc,
            credentials: [
              {
                credentialSupportedId: credentialConfigurationId,
                verificationMethod,
                credential: credentialPayload as any,
              },
            ],
          } as any
        },
      },
      verifier: {
        baseUrl: `${normalizedBaseUrl}/oidc/verifier`,
      },
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
    autoAcceptProofs,
    walletScheme,
    apiKey,
    updateJwtSecret,
    tenancy,
    endpoints,
    ...afjConfig
  } = restConfig

  const logger = new TsLogger(logLevel ?? LogLevel.Error)
  const appInstance = express()
  const agentConfig: InitConfig = {
    ...afjConfig,
    logger,
    autoUpdateStorageOnStartup: true,
  }

  const baseModules = buildModules({
    app: appInstance,
    didRegistryContractAddress,
    schemaManagerContractAddress,
    fileServerToken,
    fileServerUrl,
    rpcUrl,
    autoAcceptConnections,
    walletScheme,
    walletConfig,
    endpoints,
    inboundTransports,
    outboundTransports,
  })

  const tenantModules = tenancy
    ? {
        tenants: new TenantsModuleClass<typeof baseModules>({
          sessionAcquireTimeout: Number(process.env.SESSION_ACQUIRE_TIMEOUT) || 2_147_483_647,
          sessionLimit: Number(process.env.SESSION_LIMIT) || 2_147_483_647,
        }),
        ...baseModules,
      }
    : baseModules

  const agent = new Agent({ config: agentConfig, modules: tenantModules as any, dependencies: agentDependencies })

  await agent.initialize()

  // Initialize OpenID4VC Issuer with ALL supported credentials from DB
  // Reference: https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module
  try {
    const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')

    // Load ALL credential definitions from the database
    const allDefs = credentialDefinitionStore.list()
    agent.config.logger.info(`Found ${allDefs.length} credential definitions in database`)

    if (allDefs.length === 0) {
      agent.config.logger.warn('No credential definitions found. Issuer will have empty metadata.')
    }

    // Build credentialsSupported from ALL definitions.
    // IMPORTANT: advertise both definition-name IDs (e.g., FinancialStatementDef_jwt_vc_json)
    // and leaf-type IDs (e.g., FinancialStatementCredential_jwt_vc_json) for compatibility.
    const credentialsSupported = allDefs.flatMap((def) => {
      const leafType =
        Array.isArray(def.credentialType) && def.credentialType.length
          ? def.credentialType[def.credentialType.length - 1]
          : def.name

      const idBases = Array.from(new Set([def.name, leafType].filter(Boolean)))

      return idBases.map((base) => ({
        format: def.format === 'sd_jwt' ? 'vc+sd-jwt' : 'jwt_vc_json',
        id: `${base}_jwt_vc_json`,
        cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
        cryptographic_suites_supported: ['EdDSA', 'ES256'],
        types: def.credentialType || ['VerifiableCredential', base],
      }))
    })

    const displayMetadata = [
      {
        name: 'Credo Controller',
        description: 'Multi-tenant SSI platform',
        text_color: '#000000',
        background_color: '#FFFFFF',
      },
    ]

    // Check for existing issuers first
    const existingIssuers = await agent.openid4vc.issuer.getAllIssuers()

    if (existingIssuers && existingIssuers.length > 0) {
      const issuer = existingIssuers[0]
      agent.config.logger.info(
        `Reusing existing issuer: ${issuer.issuerId}. Updating metadata with ${credentialsSupported.length} credentials...`,
      )

      await agent.openid4vc.issuer.updateIssuerMetadata({
        issuerId: issuer.issuerId,
        credentialConfigurationsSupported: Object.fromEntries(
          credentialsSupported.map((credentialSupported) => [credentialSupported.id, credentialSupported]),
        ),
        display: displayMetadata,
      })

      agent.config.logger.info(`OpenID4VC Issuer ${issuer.issuerId} updated successfully`)
    } else {
      const openId4VcIssuer = await agent.openid4vc.issuer.createIssuer({
        issuerId: 'default-platform-issuer',
        credentialConfigurationsSupported: Object.fromEntries(
          credentialsSupported.map((credentialSupported) => [credentialSupported.id, credentialSupported]),
        ),
        display: displayMetadata,
      })
      agent.config.logger.info(`OpenID4VC Issuer created with ID: ${openId4VcIssuer.issuerId}`)
    }
  } catch (e: any) {
    agent.config.logger.error(`Failed to initialize/update OpenID4VC Issuer: ${e.message}`)
    agent.config.logger.error(e.stack)
  }

  // Seed platform-level credential definitions (PlatformIdentityVC for SSI auth)
  try {
    const { seedPlatformCredentialDefinitions } = await import('./services/modelRegistry')
    const rootDids = await agent.dids.getCreatedDids({ method: 'key' })
    let rootIssuerDid = rootDids[0]?.did

    // Create a root DID if none exists
    if (!rootIssuerDid) {
      agent.config.logger.info('No root DID found, creating one for platform credentials...')
      const didResult = await agent.dids.create({
        method: 'key',
        options: {
          createKey: {
            type: {
              kty: 'OKP',
              crv: 'Ed25519',
            },
          },
        },
      })
      rootIssuerDid = didResult.didState.did!
    }

    await seedPlatformCredentialDefinitions(rootIssuerDid)
    agent.config.logger.info(`Platform credentials seeded with root DID: ${rootIssuerDid}`)
  } catch (e: any) {
    agent.config.logger.warn(`Failed to seed platform credentials: ${e.message}`)
  }

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

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    console.log('[cliAgent] Agent modules before setupServer:', Object.keys((agent.modules as any) || {}))
    console.log('[cliAgent] Has openid4vc?', !!(agent as any)?.openid4vc)
    console.log('[cliAgent] Has tenants?', !!(agent.modules as any)?.tenants)
  }

  const app = await setupServer(agent, { webhookUrl, port: adminPort, schemaFileServerURL, app: appInstance }, apiKey)
  logger.info(`*** API Key: ${apiKey}`)
  app.listen(adminPort, () => logger.info(`Server started on ${adminPort}`))
}

// Re-export module map types for use across the codebase
export type RestAgentModules = ReturnType<typeof buildModules>
export type RestMultiTenantAgentModules = RestAgentModules & { tenants: TenantsModule<RestAgentModules> }

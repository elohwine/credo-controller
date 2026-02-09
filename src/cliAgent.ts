import type { InitConfig } from '@credo-ts/core'
import { Router } from 'express'
import type { WalletConfig } from '@credo-ts/core/build/types'
import type { TenantsModule } from '@credo-ts/tenants'

import { OpenId4VcHolderModule, OpenId4VcVerifierModule, OpenId4VcIssuerModule } from '@credo-ts/openid4vc'

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
  ClaimFormat,
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
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
  const normalizedBaseUrl = publicBaseUrl.replace(/\/$/, '')
  const oidcIssuerBaseUrl = `${normalizedBaseUrl}/oidc/issuer`
  const oidcVerifierBaseUrl = `${normalizedBaseUrl}/oidc/verifier`

  return {
    askar: new AskarModule({
      ariesAskar,
      multiWalletDatabaseScheme: cfg.walletScheme || AskarMultiWalletDatabaseScheme.ProfilePerWallet,
    }),
    dids: new DidsModule({
      registrars: [new KeyDidRegistrar()],
      resolvers: [new KeyDidResolver(), new WebDidResolver()],
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
    // OpenID4VC Issuer module - for issuing credentials via OIDC4VCI
    openId4VcIssuer: new OpenId4VcIssuerModule({
      baseUrl: oidcIssuerBaseUrl,
      router: Router(),
      endpoints: {
        credentialOffer: {},
        accessToken: {},
        credential: {
          credentialRequestToCredentialMapper: async ({ agentContext, issuanceSession, holderBinding, credentialConfigurationIds }) => {
            const credentialConfigurationId = credentialConfigurationIds[0]

            const metadata = (issuanceSession.issuanceMetadata as any) ?? {}
            const claims = metadata?.claims || {}

            // Debug logging to trace claims flow
            console.log('[CredentialMapper] credentialConfigurationId:', credentialConfigurationId)
            console.log('[CredentialMapper] issuanceMetadata:', JSON.stringify(metadata, null, 2))
            console.log('[CredentialMapper] extracted claims:', JSON.stringify(claims))
            console.log('[CredentialMapper] holderBinding:', JSON.stringify(holderBinding))

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

            const credentialPayload = {
              id: credentialId,
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              type: credDef.credentialType || ['VerifiableCredential', credentialConfigurationId],
              issuer: issuerDid,
              issuanceDate: new Date().toISOString(),
              credentialSubject: {
                id: subjectDid,
                ...claims,
              },
            } as any

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
              credentialSupportedId: credentialConfigurationId,
              format: ClaimFormat.JwtVc,
              verificationMethod,
              credential: credentialPayload,
            }
          },
        },
      },
    }),
    // OpenID4VC Verifier module - for verifying credentials via OIDC4VP
    openId4VcVerifier: new OpenId4VcVerifierModule({
      baseUrl: oidcVerifierBaseUrl,
      router: Router(),
      endpoints: {
        authorizationRequest: {},
        authorization: {},
      },
    }),
    // OpenID4VC Holder module - for wallets to receive and present credentials
    openId4VcHolder: new OpenId4VcHolderModule(),
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

  // Node.js timers use 32-bit signed integers. Using Infinity will clamp to 1ms and emit warnings.
  const maxTimerMs = 2_147_483_647

  const tenantModules = tenancy
    ? {
      tenants: new TenantsModuleClass<typeof baseModules>({
        sessionAcquireTimeout: Number(process.env.SESSION_ACQUIRE_TIMEOUT) || maxTimerMs,
        sessionLimit: Number(process.env.SESSION_LIMIT) || maxTimerMs,
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
      const leafType = Array.isArray(def.credentialType) && def.credentialType.length
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
    const existingIssuers = await agent.modules.openId4VcIssuer.getAllIssuers()

    if (existingIssuers && existingIssuers.length > 0) {
      // Reuse existing issuer - just update its metadata with all credentials
      const issuer = existingIssuers[0]
      agent.config.logger.info(`Reusing existing issuer: ${issuer.issuerId}. Updating metadata with ${credentialsSupported.length} credentials...`)

      await agent.modules.openId4VcIssuer.updateIssuerMetadata({
        issuerId: issuer.issuerId,
        credentialsSupported,
        display: displayMetadata,
      })

      agent.config.logger.info(`OpenID4VC Issuer ${issuer.issuerId} updated successfully`)
    } else {
      // Create new issuer only if none exists
      const openId4VcIssuer = await agent.modules.openId4VcIssuer.createIssuer({
        issuerId: 'default-platform-issuer',
        display: displayMetadata,
        credentialsSupported,
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
      const didResult = await agent.dids.create({ method: 'key', options: { keyType: 'ed25519' } })
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
    console.log('[cliAgent] Has openId4VcIssuer?', !!(agent.modules as any)?.openId4VcIssuer)
    console.log('[cliAgent] Has tenants?', !!(agent.modules as any)?.tenants)
  }

  const app = await setupServer(agent, { webhookUrl, port: adminPort, schemaFileServerURL }, apiKey)
  logger.info(`*** API Key: ${apiKey}`)
  app.listen(adminPort, () => logger.info(`Server started on ${adminPort}`))
}

// Re-export module map types for use across the codebase
export type RestAgentModules = ReturnType<typeof buildModules>
export type RestMultiTenantAgentModules = RestAgentModules & { tenants: TenantsModule<RestAgentModules> }

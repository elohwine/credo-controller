import type { InitConfig } from '@credo-ts/core'
import { Router } from 'express'
import type { WalletConfig } from '@credo-ts/core/build/types'
import type { TenantsModule } from '@credo-ts/tenants'

import { OpenId4VcHolderModule, OpenId4VcVerifierModule, OpenId4VcIssuerModule } from '@credo-ts/openid4vc'

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
    // OpenID4VC Issuer module - for issuing credentials via OIDC4VCI
    openId4VcIssuer: new OpenId4VcIssuerModule({
      baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
      endpoints: {
        credentialOffer: '/credential-offers',
        accessToken: '/token',
        credential: '/credential',
        jwks: '/jwks',
      },
      // We provide a dummy router which we will mount in server.ts
      app: Router() as any,
      // Simple mapper that returns the credential matching the request
      credentialRequestToCredentialMapper: async ({ credentialConfigurationId, holderBinding, agentContext, issuanceSession }) => {
        // Load actual user data from issuance session metadata
        // Reference: https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module#implementing-the-credential-mapper
        const metadata = issuanceSession.issuanceMetadata as any
        const claims = metadata?.claims || {}

        // Extract subject DID from holder binding
        let subjectDid = 'did:example:unknown'
        if (holderBinding && 'did' in holderBinding) {
          subjectDid = (holderBinding as any).did
        } else if (metadata?.subjectDid) {
          subjectDid = metadata.subjectDid
        }

        // Query credential definition from database
        const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')
        const credDef = credentialDefinitionStore.get(credentialConfigurationId)

        if (!credDef) {
          throw new Error(`Credential definition not found for: ${credentialConfigurationId}`)
        }

        // Get issuer DID from agent
        const { DidsApi } = await import('@credo-ts/core')
        const didsApi = agentContext.dependencyManager.resolve(DidsApi)
        const [didRecord] = await didsApi.getCreatedDids({ method: 'key' })
        const issuerDid = credDef.issuerDid || didRecord?.did || 'did:example:issuer'

        // Build credential payload with REAL user data
        return {
          credentialSupportedId: credentialConfigurationId,
          format: (credDef.format === 'sd_jwt' ? 'vc+sd-jwt' : 'jwt_vc_json') as any,
          holder: holderBinding,
          payload: {
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: credDef.credentialType || ['VerifiableCredential', credentialConfigurationId],
            issuer: issuerDid,
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              id: subjectDid,
              ...claims // Map all claims from registration: name, email, walletId, role
            }
          },
          issuer: {
            method: 'did' as const,
            didUrl: `${issuerDid}#${issuerDid.split(':').pop()}`
          }
        }
      }
    }),
    // OpenID4VC Verifier module - for verifying credentials via OIDC4VP
    openId4VcVerifier: new OpenId4VcVerifierModule({
      baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
      authorizationRequestEndpoint: '/oidc/presentation-requests',
      authorizationEndpoint: '/oidc/present',
      // We provide a dummy router because we handle routing via TSOA/OidcVerifierController
      // The module might attach routes, but we won't expose them directly via this router
      app: Router() as any,
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

  // Initialize OpenID4VC Issuer with supported credentials from DB
  // Reference: https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module
  try {
    const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')

    // Query for GenericID credential definition
    const genericIdDef = credentialDefinitionStore.get('GenericID')

    if (!genericIdDef) {
      agent.config.logger.warn('GenericID credential definition not found in database. Skipping OpenID4VC Issuer initialization.')
    } else {
      const openId4VcIssuer = await agent.modules.openId4VcIssuer.createIssuer({
        display: [
          {
            name: 'Credo Controller',
            description: 'Multi-tenant SSI platform',
            text_color: '#000000',
            background_color: '#FFFFFF',
          },
        ],
        credentialsSupported: [
          {
            format: genericIdDef.format === 'sd_jwt' ? 'vc+sd-jwt' : 'jwt_vc_json',
            id: 'GenericID',
            cryptographic_binding_methods_supported: ['did:key', 'did:web'],
            cryptographic_suites_supported: ['EdDSA'],
            types: genericIdDef.credentialType || ['VerifiableCredential', 'GenericID'],
          },
        ],
      })
      agent.config.logger.info(`OpenID4VC Issuer initialized with ID: ${openId4VcIssuer.issuerId}`)
    }
  } catch (e: any) {
    agent.config.logger.error(`Failed to initialize OpenID4VC Issuer: ${e.message}`)
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

  const app = await setupServer(agent, { webhookUrl, port: adminPort, schemaFileServerURL }, apiKey)
  logger.info(`*** API Key: ${apiKey}`)
  app.listen(adminPort, () => logger.info(`Server started on ${adminPort}`))
}

// Re-export module map types for use across the codebase
export type RestAgentModules = ReturnType<typeof buildModules>
export type RestMultiTenantAgentModules = RestAgentModules & { tenants: TenantsModule<RestAgentModules> }

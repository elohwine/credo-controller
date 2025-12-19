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
    try {
    const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')

    // Build credentialsSupported/credentialConfigurationsSupported from
    // actual credential definitions in the DB so config IDs match what
    // the `OidcMetadataController` publishes and what holders discover.
    const definitions = credentialDefinitionStore.list() || []
    const supportedFormats = ['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']

    const credentialsSupported: any[] = []
    const credentialConfigurationsSupported: Record<string, any> = {}

    definitions.forEach((def: any) => {
      const types = def.credentialType || ['VerifiableCredential', def.name || 'GenericIDCredential']
      const defName = def.name || 'GenericIDCredential'
      supportedFormats.forEach((fmt) => {
        const advertised = fmt
        const idByUuid = `${def.credentialDefinitionId}_${advertised}`
        const idByName = `${defName}_${advertised}`

        // Primary: register a UUID-based config id
        credentialsSupported.push({
          format: advertised,
          id: idByUuid,
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          cryptographic_suites_supported: ['EdDSA'],
          types,
        })
        credentialConfigurationsSupported[idByUuid] = {
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          credential_signing_alg_values_supported: ['EdDSA'],
          proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['EdDSA'] } },
          format: advertised,
          credential_definition: { type: types },
        }

        // Secondary: also register a human-friendly name-based config id
        if (!credentialConfigurationsSupported[idByName]) {
          credentialsSupported.push({
            format: advertised,
            id: idByName,
            cryptographic_binding_methods_supported: ['did:key', 'did:web'],
            cryptographic_suites_supported: ['EdDSA'],
            types,
          })
          credentialConfigurationsSupported[idByName] = {
            cryptographic_binding_methods_supported: ['did:key', 'did:web'],
            credential_signing_alg_values_supported: ['EdDSA'],
            proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['EdDSA'] } },
            format: advertised,
            credential_definition: { type: types },
          }
        }
      })

      // For backward compatibility, also register a short id without suffix
      // for the canonical 'jwt_vc' format (some clients expect 'GenericIDCredential')
      const shortId = defName
      if (!credentialConfigurationsSupported[shortId]) {
        credentialConfigurationsSupported[shortId] = {
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          credential_signing_alg_values_supported: ['EdDSA'],
          proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['EdDSA'] } },
          format: 'jwt_vc',
          credential_definition: { type: types },
        }
        credentialsSupported.push({
          format: 'jwt_vc',
          id: shortId,
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          cryptographic_suites_supported: ['EdDSA'],
          types,
        })
      }
    })
      serverUrl: cfg.fileServerUrl || (process.env.SERVER_URL as string),
    }),
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

            const payload = {
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              type: credDef.credentialType || ['VerifiableCredential', credentialConfigurationId],
              issuanceDate: new Date().toISOString(),
              credentialSubject: {
                id: subjectDid,
                ...claims,
              },
            } as any

            // For SD-JWT we must return an issuer object matching SdJwtVcIssuer
            return {
              credentialSupportedId: credentialConfigurationId,
              format: ClaimFormat.SdJwtVc,
              issuer: { method: 'did', didUrl: issuerDid },
              payload,
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

  // Initialize OpenID4VC Issuer with supported credentials from DB
  // Reference: https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module
  try {
    const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')

    // Query for GenericIDCredential definition (matches modelRegistry.ts naming)
      const genericIdDef = credentialDefinitionStore.get('GenericIDCredential')

      if (!genericIdDef) {
        agent.config.logger.warn('GenericIDCredential definition not found in database. Will still ensure issuer metadata is present and use canonical format (jwt_vc).')
      }

      // Compute baseFormat and credential metadata using either the stored definition or sensible defaults
      // Prefer SD-JWT format for GenericIDCredential when requested
      let baseFormat = 'vc+sd-jwt'
      let types = ['VerifiableCredential', 'GenericIDCredential']
      if (genericIdDef) {
        types = genericIdDef.credentialType || types
        if (genericIdDef.format === 'sd_jwt') {
          baseFormat = 'vc+sd-jwt'
        } else if (genericIdDef.format && typeof genericIdDef.format === 'string') {
          const fmt = genericIdDef.format.toLowerCase()
          if (fmt === 'sd_jwt') {
            baseFormat = 'vc+sd-jwt'
          } else if (fmt === 'jwt_vc' || fmt === 'jwt_vc_json' || fmt === 'jwt_json' || fmt === 'jwt_vc_json-ld') {
            baseFormat = 'jwt_vc'
          }
        }
      }

      // Advertise a set of common formats so holders that support different
      // variants can discover compatible credential configurations. Use the
      // actual credentialDefinitionId from the DB to construct config IDs so
      // they match the IDs produced by the metadata controller and the
      // holder's well-known document.
      const supportedFormats = ['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']

      const credentialsSupported: any[] = []
      const credentialConfigurationsSupported: Record<string, any> = {}

      // If we have a persisted GenericID definition, build configs per-format
      // using its credentialDefinitionId so consumers can reference them.
      const defs = credentialDefinitionStore.list()
      const genericDefs = defs.filter((d: any) => (d.name === 'GenericIDDef' || d.name === 'GenericIDCredential' || (d.credentialType || []).includes('GenericIDCredential')))

      if (genericDefs.length > 0) {
        for (const def of genericDefs) {
          for (const fmt of supportedFormats) {
            const advertised = fmt
            const configId = `${def.credentialDefinitionId}_${advertised}`

            credentialsSupported.push({
              format: advertised,
              id: configId,
              cryptographic_binding_methods_supported: ['did:key', 'did:web'],
              cryptographic_suites_supported: ['EdDSA'],
              types: def.credentialType || types,
            })

            credentialConfigurationsSupported[configId] = {
              cryptographic_binding_methods_supported: ['did:key', 'did:web'],
              credential_signing_alg_values_supported: ['EdDSA'],
              proof_types_supported: {
                jwt: {
                  proof_signing_alg_values_supported: ['EdDSA'],
                },
              },
              format: advertised,
              credential_definition: {
                type: def.credentialType || types,
              },
            }
          }
        }
      } else {
        // Fallback: advertise GenericIDCredential with a canonical id
        for (const fmt of supportedFormats) {
          const advertised = fmt
          const configId = `GenericIDCredential_${advertised}`

          credentialsSupported.push({
            format: advertised,
            id: configId,
            cryptographic_binding_methods_supported: ['did:key', 'did:web'],
            cryptographic_suites_supported: ['EdDSA'],
            types,
          })

          credentialConfigurationsSupported[configId] = {
            cryptographic_binding_methods_supported: ['did:key', 'did:web'],
            credential_signing_alg_values_supported: ['EdDSA'],
            proof_types_supported: {
              jwt: {
                proof_signing_alg_values_supported: ['EdDSA'],
              },
            },
            format: advertised,
            credential_definition: {
              type: types,
            },
          }
        }
      }
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
        // Update existing issuer's metadata to include GenericIDCredential
        const issuer = existingIssuers[0]
        agent.config.logger.info(`Found existing issuer: ${issuer.issuerId}. Updating metadata with GenericIDCredential...`)

        // Update the issuer's metadata using updateIssuerMetadata
        await agent.modules.openId4VcIssuer.updateIssuerMetadata({
          issuerId: issuer.issuerId,
          credentialsSupported,
          credentialConfigurationsSupported: credentialConfigurationsSupported,
          display: displayMetadata,
        })

        agent.config.logger.info(`OpenID4VC Issuer ${issuer.issuerId} updated with GenericIDCredential config`)
      } else {
        // Create new issuer if none exists
        const openId4VcIssuer = await agent.modules.openId4VcIssuer.createIssuer({
          display: displayMetadata,
          credentialsSupported,
          credentialConfigurationsSupported: credentialConfigurationsSupported,
        })
        agent.config.logger.info(`OpenID4VC Issuer created with ID: ${openId4VcIssuer.issuerId}`)
      }
  } catch (e: any) {
    agent.config.logger.error(`Failed to initialize/update OpenID4VC Issuer: ${e.message}`)
    agent.config.logger.error(e.stack)
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

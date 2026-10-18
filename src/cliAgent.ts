/* eslint-disable no-console */

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
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'
import express, { type Express } from 'express'
import { readFile } from 'fs/promises'

import { setupServer } from './server'
import { generateSecretKey } from './utils/helpers'
import { createLoopbackFetch } from './utils/loopbackFetch'
import { TsLogger } from './utils/logger'
import { holderBindingDid } from './utils/openidMetadata'

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
  const oid4vcBaseUrl = (() => {
    const configured = (process.env.OID4VC_BASE_URL || normalizedBaseUrl).replace(/\/$/, '')
    try {
      const parsed = new URL(configured)
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'

      // OpenID4VP requires HTTPS for response_uri. Keep this scoped to OID4VC only.
      if (isLoopback && parsed.protocol === 'http:') {
        parsed.protocol = 'https:'
      }

      return parsed.toString().replace(/\/$/, '')
    } catch {
      return configured
    }
  })()

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
      askar: askarNodeJS,
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
        baseUrl: `${oid4vcBaseUrl}/oidc/issuer`,
        // Inbox offers (role cards, job records) are accepted at the holder's convenience, not
        // within Credo's 3-minute default. Keep the pre-authorized offer alive for 30 days.
        statefulCredentialOfferExpirationInSeconds:
          Number(process.env.OID4VCI_OFFER_EXPIRES_IN_SECONDS) || 30 * 24 * 60 * 60,
        credentialRequestToCredentialMapper: async ({
          agentContext,
          issuanceSession,
          holderBinding,
          credentialConfigurationId,
          credentialConfiguration,
        }) => {
          const metadata = (issuanceSession.issuanceMetadata as any) ?? {}
          const claims = metadata?.claims || {}

          const assignmentRecordType = String(metadata.credentialDefinitionId || '').startsWith('JobAssignmentVC')
            ? 'JobAssignmentVC'
            : String(metadata.credentialDefinitionId || '').startsWith('RequisitionVC') &&
                claims.jobId &&
                claims.assignment
              ? 'RequisitionVC'
              : undefined
          if (assignmentRecordType) {
            const { workflowVcOfferDispatcher } = await import('./services/workflow/WorkflowVcOfferDispatcher')
            workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(
              String(metadata.tenantId || ''),
              String(claims.jobId || ''),
              issuanceSession.id,
              String(claims.assignment?.assigneeId || ''),
              assignmentRecordType,
            )
          }

          let subjectDid = metadata?.subjectDid || 'did:example:unknown'
          const boundDid = holderBindingDid(holderBinding)
          if (boundDid) subjectDid = boundDid

          const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')
          const credDef = credentialDefinitionStore.get(
            credentialConfigurationId,
            metadata?.tenantId ? String(metadata.tenantId) : undefined,
          )
          if (!credDef) {
            throw new Error(`Credential definition not found for: ${credentialConfigurationId}`)
          }

          // Only a DID this wallet holds can sign: the organisation's DID when the offer came from
          // its issuer, otherwise the platform DID (root) or the tenant's own DID.
          const { signingDidFor } = await import('./services/ssi/PlatformIssuerDid')
          const issuerDid = await signingDidFor(agentContext, credDef.issuerDid)

          const verificationMethod = `${issuerDid}#${issuerDid.split(':').pop()}`
          const credentialId = metadata?.credentialId || `urn:uuid:${issuanceSession.id}`
          const tenantId = metadata?.tenantId || 'default'

          // Selective disclosure: the staff card and role card are issued as IETF SD-JWT VC.
          // Every claim is its own disclosure, so a share can reveal only the details a
          // request names and keep the rest on the phone.
          const configuredFormat = String((credentialConfiguration as any)?.format || '')
          if (configuredFormat === 'vc+sd-jwt' || configuredFormat === 'dc+sd-jwt') {
            const { SD_JWT_CONFIG_SUFFIX, sdJwtDisclosureFrame } = await import('./utils/credentialDefinitionStore')
            const vct =
              (credentialConfiguration as any)?.vct ||
              (credentialConfigurationId.endsWith(SD_JWT_CONFIG_SUFFIX)
                ? credentialConfigurationId.slice(0, -SD_JWT_CONFIG_SUFFIX.length)
                : credentialConfigurationId)
            const sdClaims: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(claims as Record<string, unknown>)) {
              if (value === undefined || key === 'id') continue
              sdClaims[key] = value
            }
            // One signed card per holder key in the request (Credo requires the counts to match).
            const bindingKeys: any[] = Array.isArray((holderBinding as any)?.keys) ? (holderBinding as any).keys : []
            const holders = bindingKeys.map((key) =>
              key?.method === 'did' && typeof key.didUrl === 'string'
                ? { method: 'did', didUrl: key.didUrl }
                : key?.jwk
                  ? { method: 'jwk', jwk: key.jwk }
                  : undefined,
            )
            if (holders.length === 0) holders.push(undefined)

            // Status entry and issued row, so the card can be withdrawn later. `jti` and
            // `status` stay outside the disclosure frame: a checker must always see them.
            const { credentialLifecycleService } = await import('./services/ssi/CredentialLifecycleService')
            const statusEntry = credentialLifecycleService.registerIssued({
              issuanceSessionId: issuanceSession.id,
              tenantId,
              issuerDid,
              credentialId,
              holderDid: subjectDid,
              credentialDefinitionId: metadata?.credentialDefinitionId || credentialConfigurationId,
              format: ClaimFormat.SdJwtDc,
              credentialData: {
                vct,
                type: ['VerifiableCredential', vct],
                credentialSubject: { id: subjectDid, ...sdClaims },
              },
            })

            return {
              type: 'credentials',
              format: ClaimFormat.SdJwtDc,
              credentials: holders.map((holder) => ({
                payload: { vct, jti: credentialId, ...(statusEntry ? { status: statusEntry } : {}), ...sdClaims },
                ...(holder ? { holder } : {}),
                issuer: { method: 'did', didUrl: verificationMethod },
                disclosureFrame: sdJwtDisclosureFrame(sdClaims),
              })),
            } as any
          }

          const credentialPayload: Record<string, unknown> = {
            id: credentialId,
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: credDef.credentialType || ['VerifiableCredential', credentialConfigurationId],
            issuer: issuerDid,
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              ...claims,
              id: subjectDid,
            },
          }

          const { credentialLifecycleService } = await import('./services/ssi/CredentialLifecycleService')
          const statusEntry = credentialLifecycleService.registerIssued({
            issuanceSessionId: issuanceSession.id,
            tenantId,
            issuerDid,
            credentialId,
            holderDid: subjectDid,
            credentialDefinitionId: metadata?.credentialDefinitionId || credentialConfigurationId,
            format: ClaimFormat.JwtVc,
            credentialData: credentialPayload,
          })
          if (statusEntry) credentialPayload.credentialStatus = statusEntry

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
        baseUrl: `${oid4vcBaseUrl}/oidc/verifier`,
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

  const selfUrls = [process.env.PUBLIC_BASE_URL, process.env.OID4VC_BASE_URL].filter((url): url is string => !!url)
  const dependencies =
    process.env.OID4VC_LOOPBACK_FETCH === 'false'
      ? agentDependencies
      : {
          ...agentDependencies,
          fetch: createLoopbackFetch(agentDependencies.fetch, selfUrls, `http://127.0.0.1:${adminPort}`) as any,
        }
  const agent = new Agent({ config: agentConfig, modules: tenantModules as any, dependencies })

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
    // Selective-disclosure types (staff card, role card) are also advertised as `vc+sd-jwt`.
    const { issuerConfigurationsForDefinition } = await import('./utils/credentialDefinitionStore')
    const credentialsSupported = allDefs.flatMap((def) => issuerConfigurationsForDefinition(def))

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
    const { credentialDefinitionStore } = await import('./utils/credentialDefinitionStore')
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

    const platformDef = credentialDefinitionStore.get('PlatformIdentityCredential')
    const existingIssuers = await agent.openid4vc.issuer.getAllIssuers()
    if (platformDef && existingIssuers?.length) {
      const platformSupported = {
        format: 'jwt_vc_json',
        id: 'PlatformIdentityCredential_jwt_vc_json',
        cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
        cryptographic_suites_supported: ['EdDSA', 'ES256'],
        types: platformDef.credentialType || ['VerifiableCredential', 'PlatformIdentityCredential'],
        credential_signing_alg_values_supported: ['EdDSA'],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['EdDSA'] },
        },
        credential_definition: {
          type: platformDef.credentialType || ['VerifiableCredential', 'PlatformIdentityCredential'],
        },
      }

      // Definitions seeded just now (staff card, role card, delegation) were not in the
      // metadata built above on a first boot; add any configuration that is still missing.
      const { issuerConfigurationsForDefinition } = await import('./utils/credentialDefinitionStore')
      const seededConfigs = Object.fromEntries(
        credentialDefinitionStore
          .list()
          .flatMap((def) => issuerConfigurationsForDefinition(def))
          .map((c) => [c.id, c]),
      )

      await Promise.all(
        existingIssuers.map((issuer: any) =>
          agent.openid4vc.issuer.updateIssuerMetadata({
            issuerId: issuer.issuerId,
            credentialConfigurationsSupported: {
              ...seededConfigs,
              ...(issuer.credentialConfigurationsSupported || {}),
              [platformSupported.id]: platformSupported,
            },
            display: issuer.display || [],
          }),
        ),
      )

      agent.config.logger.info('Registered PlatformIdentityCredential in OpenID4VC issuer metadata')
    }
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

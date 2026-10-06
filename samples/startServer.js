require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { startServer } = require('../build/index')
const express = require('express')
const {
  Agent,
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  WebDidResolver,
  W3cCredentialsModule,
  ClaimFormat,
} = require('@credo-ts/core')
const { AskarModule, AskarMultiWalletDatabaseScheme } = require('@credo-ts/askar')
const { DidCommModule, DidCommHttpOutboundTransport } = require('@credo-ts/didcomm')
const { TenantsModule } = require('@credo-ts/tenants')
const { OpenId4VcModule } = require('@credo-ts/openid4vc')
const { agentDependencies, DidCommHttpInboundTransport } = require('@credo-ts/node')
const { askarNodeJS } = require('@openwallet-foundation/askar-nodejs')
const { TsLogger } = require('../build/utils/logger')

async function run() {
  const logger = new TsLogger(LogLevel.info)
  const walletId = process.env.WALLET_ID || 'shared-controller-agent'
  const walletKey = process.env.WALLET_KEY || 'shared-controller-key'
  // Askar store location. docker-compose.full.yml sets ASKAR_STORAGE_PATH=/home/credo/.afj and bind-mounts
  // ./data/askar-issuer there. Honouring the same variable locally (ASKAR_STORAGE_PATH=./data/askar-issuer)
  // means a non-docker start opens exactly the same wallet file as the compose stack instead of ~/.afj.
  const askarStoragePath = process.env.ASKAR_STORAGE_PATH
    ? require('path').resolve(process.env.ASKAR_STORAGE_PATH)
    : undefined
  const askarDatabase = askarStoragePath
    ? { type: 'sqlite', config: { path: `${askarStoragePath}/data/wallet/${walletId}/sqlite.db` } }
    : undefined
  console.log(`ℹ️ Askar store: ${askarDatabase ? askarDatabase.config.path : '~/.afj (credo default)'}`)

  // Node.js timers use 32-bit signed integers. Using Infinity will clamp to 1ms and emit warnings.
  const maxTimerMs = 2147483647

  // Initialize persistence before loading dynamic definitions
  const { DatabaseManager } = require('../build/persistence/DatabaseManager')
  DatabaseManager.initialize({ path: process.env.PERSISTENCE_DB_PATH || './data/persistence.db' })
  console.log('✅ Persistence initialized')

  // Use a single Express app instance that is shared
  const app = express()

  // DEBUG ENDPOINT TO INSPECT ISSUER CONFIG
  app.get('/debug/issuer', async (req, res) => {
    try {
      if (!agent.isInitialized) {
        return res.status(503).json({ error: 'Agent not initialized' })
      }
      const issuers = await agent.openid4vc.issuer.getAllIssuers()
      res.json({
        count: issuers.length,
        issuers: issuers.map((i) => ({
          id: i.issuerId,
          credentialConfigurationsSupported: i.credentialConfigurationsSupported,
          display: i.display,
        })),
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Credo >= 0.6 (@openid4vc/*) rejects http:// credential_issuer URLs unless the agent
  // opts in. Local dev runs on plain http (localhost / LAN IP); production and ngrok-wrapped
  // deployments expose https and keep the strict check.
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://api:3000'
  const allowInsecureHttpUrls =
    process.env.ALLOW_INSECURE_HTTP_URLS === 'true' ||
    (process.env.ALLOW_INSECURE_HTTP_URLS !== 'false' && !publicBaseUrl.startsWith('https://'))
  const agent = new Agent({
    config: {
      walletConfig: {
        id: walletId,
        key: walletKey,
      },
      label: 'Multi-Tenant Test Agent',
      endpoints: ['http://127.0.0.1:3001'],
      logger,
      autoUpdateStorageOnStartup: true,
      backupBeforeStorageUpdate: false,
      allowInsecureHttpUrls,
    },
    modules: {
      askar: new AskarModule({
        askar: askarNodeJS,
        store: {
          id: walletId,
          key: walletKey,
          ...(askarDatabase ? { database: askarDatabase } : {}),
        },
        multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
      }),
      tenants: new TenantsModule({
        sessionAcquireTimeout: maxTimerMs,
        sessionLimit: maxTimerMs,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      didcomm: new DidCommModule({
        endpoints: ['http://127.0.0.1:3001'],
        transports: {
          inbound: [new DidCommHttpInboundTransport({ port: 3001 })],
          outbound: [new DidCommHttpOutboundTransport()],
        },
        connections: {
          autoAcceptConnections: true,
        },
      }),
      w3cCredentials: new W3cCredentialsModule(),
      openid4vc: new OpenId4VcModule({
        app,
        issuer: {
          baseUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/issuer`,
          // Inbox offers (role cards, job records) are accepted at the holder's convenience, not
          // within Credo's 3-minute default. Keep the pre-authorized offer alive for 30 days.
          statefulCredentialOfferExpirationInSeconds:
            Number(process.env.OID4VCI_OFFER_EXPIRES_IN_SECONDS) || 30 * 24 * 60 * 60,
          credentialRequestToCredentialMapper: async ({
            agentContext,
            issuanceSession,
            holderBinding,
            credentialConfigurationId,
            credentialConfigurationIds,
          }) => {
            console.log('[startServer] === CREDENTIAL MAPPER START ===')
            console.log('[startServer] issuanceSession keys:', Object.keys(issuanceSession || {}))
            const metadata = issuanceSession?.issuanceMetadata || {}
            console.log('[startServer] metadata:', JSON.stringify(metadata))
            const claims = metadata?.claims || {}
            console.log('[startServer] extracted claims:', JSON.stringify(claims))
            console.log('[startServer] credentialConfigurationIds:', credentialConfigurationIds)

            const supportedId = credentialConfigurationId || credentialConfigurationIds?.[0]

            let subjectDid = metadata?.subjectDid || 'did:example:unknown'
            // Credo 0.7: `{ bindingMethod: 'did', keys: [{ didUrl }] }`; 0.5: `{ method: 'did', did }`.
            const { holderBindingDid } = require('../build/utils/openidMetadata')
            const boundDid = holderBindingDid(holderBinding)
            if (boundDid) subjectDid = boundDid

            const { DidsApi, KeyType } = require('@credo-ts/core')
            const didsApi = agentContext.dependencyManager.resolve(DidsApi)
            let issuerDids = await didsApi.getCreatedDids({ method: 'key' })
            let issuerDid

            if (issuerDids.length === 0) {
              const created = await didsApi.create({
                method: 'key',
                options: {
                  keyType: KeyType.Ed25519,
                },
              })
              issuerDid = created.didState.did
            } else {
              issuerDid = issuerDids[0].did
            }

            const issuerDidDocument = await didsApi.resolveDidDocument(issuerDid)
            const verificationMethod =
              issuerDidDocument.verificationMethod?.[0]?.id || `${issuerDid}#${issuerDid.replace('did:key:', '')}`

            let normalizedClaims = claims || {}
            if (normalizedClaims.claims && typeof normalizedClaims.claims === 'object') {
              normalizedClaims = { ...normalizedClaims, ...normalizedClaims.claims }
            }

            const credentialType = (supportedId || 'GenericIDCredential').replace(/_jwt_vc_json$/, '')
            const credentialJson = {
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              type: ['VerifiableCredential', credentialType],
              issuer: issuerDid,
              issuerId: issuerDid,
              issuanceDate: new Date().toISOString(),
              credentialSubject: {
                id: subjectDid,
                ...normalizedClaims,
              },
              credentialSubjectIds: [subjectDid],
            }

            console.log('[startServer] Constructed Credential (Plain):', JSON.stringify(credentialJson))

            return {
              type: 'credentials',
              format: ClaimFormat.JwtVc,
              credentials: [
                {
                  credentialSupportedId: supportedId,
                  verificationMethod,
                  credential: credentialJson,
                },
              ],
            }
          },
        },
        verifier: {
          baseUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/verifier`,
        },
      }),
    },
    dependencies: agentDependencies,
  })

  await agent.initialize()
  console.log('✅ Agent initialized')

  // Initialize JWT secret key if missing (required for /agent/token)
  const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
  if (genericRecord.length === 0) {
    const { generateSecretKey } = require('../build/utils/helpers')
    const secretKeyInfo = await generateSecretKey()
    await agent.genericRecords.save({
      content: { secretKey: secretKeyInfo },
      tags: { hasSecretKey: 'true' },
    })
    console.log('✅ JWT Secret Key initialized')
  }

  // Initialize OpenID4VC issuer instance so offers can be created
  try {
    // Advertise a broad set of formats so wallets can discover compatible configs
    // NOTE: Credo will try to convert *all* configured credential configurations between draft versions
    // during offer creation. Some formats require extra metadata fields (e.g., sd-jwt needs `vct`).
    // To keep the sample stable, advertise jwt_vc_json (most compatible) AND jwt_vc (internal default).
    const supportedFormats = ['jwt_vc_json']

    const credentialsSupported = []
    const credentialConfigurationsSupported = {}

    // Seed platform-level definitions (PlatformIdentityCredential, OrgWorkflowActorCredential)
    // so the root issuer advertises them and the definition store stays consistent.
    try {
      const { seedPlatformCredentialDefinitions } = require('../build/services/modelRegistry')
      const rootDids = await agent.dids.getCreatedDids({ method: 'key' })
      const rootIssuerDid = rootDids[0]?.did
      if (rootIssuerDid) {
        await seedPlatformCredentialDefinitions(rootIssuerDid)
      }
    } catch (seedErr) {
      console.warn('Platform credential definition seeding skipped:', seedErr.message)
    }

    // Load ALL types from credentialDefinitionStore dynamically
    // This ensures QuoteVC, ReceiptVC etc are all registered correctly.
    const { credentialDefinitionStore } = require('../build/utils/credentialDefinitionStore')
    const allDefinitions = credentialDefinitionStore.list() || []
    const demoTypes = Array.from(
      new Set([
        'GenericIDCredential',
        'CartSnapshotVC',
        'InvoiceVC',
        'ReceiptVC',
        'EmploymentContractVC',
        'QuoteVC',
        'ApprovalVC',
        // Identity + org actor credentials used by workflow stage OIDC4VP presentations
        'PlatformIdentityCredential',
        'OrgWorkflowActorCredential',
        'EmployeeCredential',
        'DelegationCredential',
        ...allDefinitions.map((d) => d.name),
      ]),
    )

    console.log(`ℹ️ Advertising ${demoTypes.length} types: ${demoTypes.join(', ')}`)

    demoTypes.forEach((type) => {
      supportedFormats.forEach((fmt) => {
        const id = `${type}_${fmt}`
        credentialsSupported.push({
          format: fmt,
          id,
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          cryptographic_suites_supported: ['EdDSA'],
          types: ['VerifiableCredential', type],
          display: [
            {
              name: type,
              locale: 'en-US',
            },
          ],
        })

        credentialConfigurationsSupported[id] = {
          cryptographic_binding_methods_supported: ['did:key', 'did:web'],
          credential_signing_alg_values_supported: ['EdDSA'],
          proof_types_supported: {
            jwt: { proof_signing_alg_values_supported: ['EdDSA'] },
          },
          format: fmt,
          credential_definition: {
            type: ['VerifiableCredential', type],
          },
          display: [
            {
              name: type,
              locale: 'en-US',
            },
          ],
        }
      })
    })

    const display = [
      {
        name: 'Credo Controller Sample',
        description: 'Sample OpenID4VC issuer',
        locale: 'en-US',
      },
    ]

    const existingIssuers = await agent.openid4vc.issuer.getAllIssuers()

    let issuerToUse = null

    if (existingIssuers && existingIssuers.length > 0) {
      // Reuse the FIRST existing issuer - just update its metadata
      issuerToUse = existingIssuers[0]
      console.log(`ℹ️ Reusing existing issuer: ${issuerToUse.issuerId} (found ${existingIssuers.length} total)`)

      try {
        await agent.openid4vc.issuer.updateIssuerMetadata({
          issuerId: issuerToUse.issuerId,
          display,
          credentialConfigurationsSupported,
        })
        console.log(`✅ OpenID4VC Issuer metadata updated: ${issuerToUse.issuerId}`)
      } catch (updateErr) {
        console.warn(`Failed to update issuer metadata:`, updateErr.message)
      }
    } else {
      // Create a new issuer only if none exist
      try {
        issuerToUse = await agent.openid4vc.issuer.createIssuer({
          issuerId: 'default-platform-issuer',
          display,
          credentialConfigurationsSupported,
        })
        console.log(`✅ OpenID4VC Issuer created: ${issuerToUse.issuerId}`)
      } catch (createErr) {
        console.error('❌ Failed to create OpenID4VC Issuer:', createErr)
      }
    }

    // Populate cache for the issuer
    if (issuerToUse) {
      try {
        const { issuerMetadataCache } = require('../build/utils/issuerMetadataCache')
        const publicBase = process.env.PUBLIC_BASE_URL || 'http://api:3000'
        const issuerUrl = `${publicBase}/oidc/issuer/${issuerToUse.issuerId}`
        const metadata = {
          credential_issuer: issuerUrl,
          credentials_supported: credentialsSupported,
          credential_configurations_supported: credentialConfigurationsSupported,
          credential_endpoint: `${issuerUrl}/credential`,
        }
        issuerMetadataCache.set(issuerUrl, metadata, 'did:example:unknown', 'kid-1')
        console.log(`✅ Cached Metadata for Root Issuer: ${issuerUrl}`)
      } catch (err) {
        console.warn('Failed to cache root issuer metadata:', err.message)
      }
    }
  } catch (e) {
    console.error('❌ Failed to initialize/update OpenID4VC Issuer:', e)
  }

  // DEBUG ENDPOINT MOVED HERE (after agent is init)
  app.get('/debug/issuer', async (req, res) => {
    try {
      const issuers = await agent.openid4vc.issuer.getAllIssuers()
      res.json({
        count: issuers.length,
        issuers: issuers.map((i) => ({
          id: i.issuerId,
          credentialConfigurationsSupported: i.credentialConfigurationsSupported,
          issuerUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/issuer/${i.issuerId}`, // Debug helper
        })),
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  process.env.ISSUER_API_PORT = process.env.ISSUER_API_PORT || '3000'
  process.env.ISSUER_API_KEY = process.env.ISSUER_API_KEY || 'test-api-key-12345'
  // NOTE: Push URL is disabled by default - offers should be manually accepted by users
  // Set OFFER_PUSH_URL env var to enable auto-accept (e.g., for testing)
  // process.env.OFFER_PUSH_URL = process.env.OFFER_PUSH_URL || 'http://localhost:6000/api/wallet/holder-wallet/exchange/useOfferRequest'
  process.env.OFFER_PUSH_API_KEY = process.env.OFFER_PUSH_API_KEY || 'test-api-key-12345'

  const server = await startServer(
    agent,
    {
      port: 3000,
      cors: true,
      webhookUrl: process.env.WEBHOOK_URL,
      app,
    },
    'test-api-key-12345',
  )
  // server.keepAliveTimeout = 0; // Disable keep-alive to prevent socket hang ups
  // server.headersTimeout = 66000; // Not needed if keep-alive is 0

  console.log(`🚀 Server running on http://localhost:3000`)
  console.log(`🔌 Inbound transport on http://localhost:3001`)

  // Optional: seed VC models after server starts.
  // NOTE: the current seed script provisions a tenant via /multi-tenancy/create-tenant,
  // which spins up a TenantAgent (extra wallet/profile) and looks like a “second agent init”.
  // For a single-tenant/platform-default setup, keep this disabled.
  if (process.env.SEED_VC_MODELS === 'true') {
    setTimeout(() => {
      console.log('Seeding VC models...')
      const { exec } = require('child_process')
      exec('yarn seed:models --backend http://localhost:3000 --apiKey test-api-key-12345', (error) => {
        if (error) {
          console.log('Seeding failed or skipped:', error.message)
        } else {
          console.log('Seeding completed')
        }
      })
    }, 3000)
  }
}

run().catch((error) => {
  console.error('Error starting server:', error)
  process.exit(1)
})

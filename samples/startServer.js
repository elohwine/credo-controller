const { startServer } = require('../build/index')
const express = require('express')
const { Router } = require('express')
const { Agent, AutoAcceptCredential, AutoAcceptProof, ConnectionsModule, CredentialsModule, DidsModule, HttpOutboundTransport, KeyDidRegistrar, KeyDidResolver, LogLevel, ProofsModule, WebDidResolver, W3cCredentialsModule, W3cCredential, W3cCredentialSubject, W3cIssuer, ClaimFormat, JsonTransformer } = require('@credo-ts/core')
const { AskarModule, AskarMultiWalletDatabaseScheme } = require('@credo-ts/askar')
const { TenantsModule } = require('@credo-ts/tenants')
const { OpenId4VcIssuerModule, OpenId4VcVerifierModule, OpenId4VcHolderModule } = require('@credo-ts/openid4vc')
const { agentDependencies, HttpInboundTransport } = require('@credo-ts/node')
const { ariesAskar } = require('@hyperledger/aries-askar-nodejs')
const { TsLogger } = require('../build/utils/logger')

async function run() {
  const logger = new TsLogger(LogLevel.info)

  // Node.js timers use 32-bit signed integers. Using Infinity will clamp to 1ms and emit warnings.
  const maxTimerMs = 2147483647

  // Initialize persistence before loading dynamic definitions
  const { DatabaseManager } = require('../build/persistence/DatabaseManager')
  DatabaseManager.initialize({ path: process.env.PERSISTENCE_DB_PATH || './data/persistence.db' })
  console.log('✅ Persistence initialized')

  // Use a single Express app instance that is shared
  const app = express()
  const issuerRouter = Router()
  const verifierRouter = Router()

  // DEBUG ENDPOINT TO INSPECT ISSUER CONFIG
  app.get('/debug/issuer', async (req, res) => {
    try {
      if (!agent.isInitialized) {
        return res.status(503).json({ error: 'Agent not initialized' })
      }
      const issuers = await agent.modules.openId4VcIssuer.getAllIssuers()
      res.json({
        count: issuers.length,
        issuers: issuers.map(i => ({
          id: i.issuerId,
          credentialsSupported: i.credentialsSupported,
          display: i.display
        }))
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  const agent = new Agent({
    config: {
      walletConfig: {
        id: 'shared-controller-agent',
        key: 'shared-controller-key',
      },
      label: 'Multi-Tenant Test Agent',
      endpoints: ['http://127.0.0.1:3001'],
      logger,
      autoUpdateStorageOnStartup: true,
      backupBeforeStorageUpdate: false,
    },
    modules: {
      askar: new AskarModule({
        ariesAskar,
        multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
        config: {
          storagePath: process.env.ASKAR_STORAGE_PATH || './data/askar-issuer'
        }
      }),
      tenants: new TenantsModule({
        sessionAcquireTimeout: maxTimerMs,
        sessionLimit: maxTimerMs,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      connections: new ConnectionsModule({ autoAcceptConnections: true }),
      credentials: new CredentialsModule({ autoAcceptCredentials: AutoAcceptCredential.Always }),
      proofs: new ProofsModule({ autoAcceptProofs: AutoAcceptProof.Always }),
      w3cCredentials: new W3cCredentialsModule(),
      // OpenID4VC modules (Issuer & Verifier)
      openId4VcIssuer: new OpenId4VcIssuerModule({
        baseUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/issuer`,
        router: issuerRouter,
        endpoints: {
          credentialOffer: {},
          accessToken: {},
          credential: {
            credentialRequestToCredentialMapper: async ({ agentContext, issuanceSession, holderBinding, credentialConfigurationIds }) => {
              console.log('[startServer] === CREDENTIAL MAPPER START ===')
              console.log('[startServer] issuanceSession keys:', Object.keys(issuanceSession || {}))
              const metadata = issuanceSession?.issuanceMetadata || {}
              console.log('[startServer] metadata:', JSON.stringify(metadata))
              const claims = metadata?.claims || {}
              console.log('[startServer] extracted claims:', JSON.stringify(claims))
              console.log('[startServer] credentialConfigurationIds:', credentialConfigurationIds)

              const credentialConfigurationId = credentialConfigurationIds[0]

              let subjectDid = metadata?.subjectDid || 'did:example:unknown'
              if (holderBinding && typeof holderBinding === 'object' && 'did' in holderBinding) {
                subjectDid = holderBinding.did
              }

              // Get or create an issuer DID from the agent
              const { DidsApi, KeyType } = require('@credo-ts/core')
              const didsApi = agentContext.dependencyManager.resolve(DidsApi)
              let issuerDids = await didsApi.getCreatedDids({ method: 'key' })
              let issuerDid

              if (issuerDids.length === 0) {
                // Create a did:key for the issuer with Ed25519 key
                const created = await didsApi.create({
                  method: 'key',
                  options: {
                    keyType: KeyType.Ed25519
                  }
                })
                issuerDid = created.didState.did
              } else {
                issuerDid = issuerDids[0].did
              }

              // Get the verification method (key reference) for signing
              const issuerDidDocument = await didsApi.resolveDidDocument(issuerDid)
              const verificationMethod = issuerDidDocument.verificationMethod?.[0]?.id || `${issuerDid}#${issuerDid.replace('did:key:', '')}`

              // Normalize claims - ensure we have a flat object
              let normalizedClaims = claims || {}
              if (normalizedClaims.claims && typeof normalizedClaims.claims === 'object') {
                normalizedClaims = { ...normalizedClaims, ...normalizedClaims.claims }
              }

              const credentialType = credentialConfigurationId.replace(/_jwt_vc_json$/, '')
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
                credentialSupportedId: credentialConfigurationId,
                format: ClaimFormat.JwtVc,
                credential: credentialJson,
                verificationMethod,
              }
            },
          },
        },
      }),
      openId4VcVerifier: new OpenId4VcVerifierModule({
        baseUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/verifier`,
        router: verifierRouter,
      }),
      // OpenID4VC Holder module - for wallets to receive credentials
      openId4VcHolder: new OpenId4VcHolderModule(),
    },
    dependencies: agentDependencies,
  })

  agent.registerOutboundTransport(new HttpOutboundTransport())
  agent.registerInboundTransport(new HttpInboundTransport({ port: 3001 }))

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

    // Load ALL types from credentialDefinitionStore dynamically
    // This ensures QuoteVC, ReceiptVC etc are all registered correctly.
    const { credentialDefinitionStore } = require('../build/utils/credentialDefinitionStore')
    const allDefinitions = credentialDefinitionStore.list() || []
    const demoTypes = Array.from(new Set([
      'GenericIDCredential',
      'CartSnapshotVC',
      'InvoiceVC',
      'ReceiptVC',
      'EmploymentContractVC',
      'QuoteVC',
      'ApprovalVC',
      ...allDefinitions.map(d => d.name)
    ]))

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

    const existingIssuers = await agent.modules.openId4VcIssuer.getAllIssuers()

    let issuerToUse = null

    if (existingIssuers && existingIssuers.length > 0) {
      // Reuse the FIRST existing issuer - just update its metadata
      issuerToUse = existingIssuers[0]
      console.log(`ℹ️ Reusing existing issuer: ${issuerToUse.issuerId} (found ${existingIssuers.length} total)`)

      try {
        await agent.modules.openId4VcIssuer.updateIssuerMetadata({
          issuerId: issuerToUse.issuerId,
          display,
          credentialsSupported,
          credentialConfigurationsSupported,
        })
        console.log(`✅ OpenID4VC Issuer metadata updated: ${issuerToUse.issuerId}`)
      } catch (updateErr) {
        console.warn(`Failed to update issuer metadata:`, updateErr.message)
      }
    } else {
      // Create a new issuer only if none exist
      try {
        issuerToUse = await agent.modules.openId4VcIssuer.createIssuer({
          issuerId: 'default-platform-issuer',
          display,
          credentialsSupported,
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
      const issuers = await agent.modules.openId4VcIssuer.getAllIssuers()
      res.json({
        count: issuers.length,
        issuers: issuers.map(i => ({
          id: i.issuerId,
          credentialsSupported: i.credentialsSupported,
          issuerUrl: `${process.env.PUBLIC_BASE_URL || 'http://api:3000'}/oidc/issuer/${i.issuerId}` // Debug helper
        }))
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  process.env.ISSUER_API_PORT = process.env.ISSUER_API_PORT || '3000'
  process.env.ISSUER_API_KEY = process.env.ISSUER_API_KEY || 'test-api-key-12345'
  // NOTE: Push URL is disabled by default - offers should be manually accepted by users
  // Set OFFER_PUSH_URL env var to enable auto-accept (e.g., for testing)
  // process.env.OFFER_PUSH_URL = process.env.OFFER_PUSH_URL || 'http://localhost:6000/api/wallet/wallet/holder-wallet/exchange/useOfferRequest'
  process.env.OFFER_PUSH_API_KEY = process.env.OFFER_PUSH_API_KEY || 'holder-api-key-12345'


  const server = await startServer(
    agent,
    {
      port: 3000,
      cors: true,
      webhookUrl: process.env.WEBHOOK_URL,
      app,
    },
    'test-api-key-12345'
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

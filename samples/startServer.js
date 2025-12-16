const { startServer } = require('../build/index')
const express = require('express')
const { Router } = require('express')
const { Agent, AutoAcceptCredential, AutoAcceptProof, ConnectionsModule, CredentialsModule, DidsModule, HttpOutboundTransport, KeyDidRegistrar, KeyDidResolver, LogLevel, ProofsModule, WebDidResolver, W3cCredentialsModule } = require('@credo-ts/core')
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

  // Use a single Express app instance that is shared between:
  // - OpenID4VC modules (they register endpoints on the app)
  // - credo-controller setupServer (it mounts tsoa routes on the app)
  const app = express()
  const issuerRouter = Router()
  const verifierRouter = Router()

  // Mount routers so the module endpoints are reachable
  app.use('/oidc/issuer', issuerRouter)
  app.use('/oidc/verifier', verifierRouter)

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
        id: 'sample-wallet',
        key: 'sample-wallet-key',
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
        baseUrl: 'http://127.0.0.1:3000/oidc/issuer',
        router: issuerRouter,
        endpoints: {
          credentialOffer: {},
          accessToken: {},
          credential: {
            credentialRequestToCredentialMapper: async ({ issuanceSession, holderBinding, credentialConfigurationIds }) => {
              const metadata = issuanceSession?.issuanceMetadata || {}
              const claims = metadata?.claims || {}

              const credentialConfigurationId = credentialConfigurationIds[0]

              let subjectDid = metadata?.subjectDid || 'did:example:unknown'
              if (holderBinding && typeof holderBinding === 'object' && 'did' in holderBinding) {
                subjectDid = holderBinding.did
              }

              // Minimal example VC payload.
              return {
                credentialSupportedId: credentialConfigurationId,
                format: 'jwt_vc',
                verificationMethod: 'did:example:issuer#key-1',
                credential: {
                  '@context': ['https://www.w3.org/2018/credentials/v1'],
                  type: ['VerifiableCredential', credentialConfigurationId],
                  issuer: 'did:example:issuer',
                  issuanceDate: new Date().toISOString(),
                  credentialSubject: {
                    id: subjectDid,
                    ...claims,
                  },
                },
              }
            },
          },
        },
      }),
      openId4VcVerifier: new OpenId4VcVerifierModule({
        baseUrl: 'http://127.0.0.1:3000/oidc/verifier',
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

  // Initialize OpenID4VC issuer instance so offers can be created
  try {
    const credentialsSupported = [
      {
        format: 'jwt_vc',
        id: 'GenericIDCredential',
        cryptographic_binding_methods_supported: ['did:key', 'did:web'],
        cryptographic_suites_supported: ['EdDSA'],
        types: ['VerifiableCredential', 'GenericIDCredential'],
      },
    ]

    const display = [
      {
        name: 'Credo Controller Sample',
        description: 'Sample OpenID4VC issuer',
        locale: 'en-US',
      },
    ]

    const existingIssuers = await agent.modules.openId4VcIssuer.getAllIssuers()
    if (existingIssuers && existingIssuers.length > 0) {
      const issuer = existingIssuers[0]
      console.log(`ℹ️ Found existing issuer: ${issuer.issuerId}`)
      console.log(`ℹ️ CURRENT Config: ${JSON.stringify(issuer.credentialsSupported)}`)

      await agent.modules.openId4VcIssuer.updateIssuerMetadata({
        issuerId: issuer.issuerId,
        credentialsSupported,
        display,
      })

      const updated = await agent.modules.openId4VcIssuer.getIssuerByIssuerId(issuer.issuerId)
      console.log(`✅ UPDATED Config: ${JSON.stringify(updated.credentialsSupported)}`)

      // POPULATE CACHE TO PREVENT LOOPBACK (The "Why are we facing this again?" fix)
      try {
        const { issuerMetadataCache } = require('../build/utils/issuerMetadataCache')
        // We need the Full Metadata (published at .well-known), effectively what getIssuerMetadata returns?
        // Credo doesn't expose getIssuerMetadata directly on module public API easily.
        // We construct a mock minimal metadata or fetch it once?
        // Actually, WalletController needs 'metadata' object.
        // Let's manually construct the minimal required metadata using the record.

        // This structure must match what Credo expects in `resolved.metadata`
        const metadata = {
          credential_issuer: updated.issuerId, // This is technically the ID, but often URL in specs. 
          // Wait, 'issuerUrl' IS the ID for OID4VCI? No, issuerUrl is the base URL.
          credential_endpoint: `${updated.issuerId}/credential`,
          batch_credential_endpoint: `${updated.issuerId}/batch_credential`,
          credentials_supported: updated.credentialsSupported
        }

        // Use the baseURL we configured (127.0.0.1:3000/oidc/issuer) + /issuerId?
        // No, Credo constructs the Issuer URL as: <baseUrl>/<issuerId>
        const issuerUrl = `http://127.0.0.1:3000/oidc/issuer/${updated.issuerId}`

        issuerMetadataCache.set(issuerUrl, metadata, 'did:example:unknown', 'kid-1')
        console.log(`✅ Cached Metadata for Root Issuer: ${issuerUrl}`)
      } catch (err) {
        console.warn('Failed to cache root issuer metadata:', err.message)
      }

    } else {
      const openId4VcIssuer = await agent.modules.openId4VcIssuer.createIssuer({
        display,
        credentialsSupported,
      })
      console.log(`✅ OpenID4VC Issuer initialized: ${openId4VcIssuer.issuerId}`)

      // Populate cache for new issuer too
      try {
        const { issuerMetadataCache } = require('../build/utils/issuerMetadataCache')
        // Re-fetch to get full object if needed, or just construct
        const issuerUrl = `http://127.0.0.1:3000/oidc/issuer/${openId4VcIssuer.issuerId}`
        const metadata = {
          credential_issuer: issuerUrl,
          credentials_supported: credentialsSupported,
          credential_endpoint: `${issuerUrl}/credential`
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
          issuerUrl: `http://127.0.0.1:3000/oidc/issuer/${i.issuerId}` // Debug helper
        }))
      })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  await startServer(
    agent,
    {
      port: 3000,
      cors: true,
      webhookUrl: process.env.WEBHOOK_URL,
      app,
    },
    'test-api-key-12345'
  )

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

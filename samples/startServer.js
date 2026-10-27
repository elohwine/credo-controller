require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
// Registers native Askar before the ESM @credo-ts/askar build reads it (see src/index.ts).
require('@openwallet-foundation/askar-nodejs')

const { startServer } = require('../build/index')
const { createLoopbackFetch } = require('../build/utils/loopbackFetch')
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
  // Credo's enum is LogLevel.Info; the old lowercase LogLevel.info was undefined and logged everything at trace.
  const logger = new TsLogger(LogLevel[process.env.CREDO_LOG_LEVEL || 'Info'] ?? LogLevel.Info)
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

  // One-shot org and user data wipe, requested by the RESET_ORG_USER_DATA flag file (see docs/FLY_DEPLOYMENT.md).
  const persistenceDbPath = process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
  const dataReset = require('../build/services/platform/PlatformDataResetService')
  const dataDir = require('path').dirname(require('path').resolve(persistenceDbPath))
  const resetFlag = dataReset.readResetFlag(dataDir)
  let resetBackupDir
  if (resetFlag.present && !resetFlag.confirmed) {
    console.error(`❌ ${resetFlag.path} does not contain the confirmation phrase; data reset skipped`)
    dataReset.settleResetFlag(resetFlag, new Error('confirmation phrase missing or wrong'))
  } else if (resetFlag.confirmed) {
    resetBackupDir = require('path').join(dataDir, 'backups', `pre-reset-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    const tenantsDbPath =
      process.env.TENANT_DB_PATH || require('path').join(dataDir, 'tenants.db')
    const askarFile = askarDatabase ? askarDatabase.config.path : undefined
    const copied = await dataReset.backupSqliteFiles(
      [require('path').resolve(persistenceDbPath), tenantsDbPath, askarFile].filter(Boolean),
      resetBackupDir,
    )
    console.warn(`⚠️ Org and user data reset requested; backed up ${copied.length} database(s) to ${resetBackupDir}`)
  }

  // Initialize persistence before loading dynamic definitions
  const { DatabaseManager } = require('../build/persistence/DatabaseManager')
  DatabaseManager.initialize({ path: persistenceDbPath })
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
            credentialConfiguration,
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

            const { DidsApi } = require('@credo-ts/core')
            const didsApi = agentContext.dependencyManager.resolve(DidsApi)
            // Organisation records are signed with the organisation's own DID when the offer came
            // from its issuer; platform credentials with the pinned platform DID.
            const { signingDidFor } = require('../build/services/ssi/PlatformIssuerDid')
            const { credentialDefinitionStore } = require('../build/utils/credentialDefinitionStore')
            const signingDefinition = supportedId
              ? credentialDefinitionStore.get(supportedId, metadata?.tenantId ? String(metadata.tenantId) : undefined)
              : undefined
            const issuerDid = await signingDidFor(agentContext, signingDefinition?.issuerDid)

            const issuerDidDocument = await didsApi.resolveDidDocument(issuerDid)
            const verificationMethod =
              issuerDidDocument.verificationMethod?.[0]?.id || `${issuerDid}#${issuerDid.replace('did:key:', '')}`

            let normalizedClaims = claims || {}
            if (normalizedClaims.claims && typeof normalizedClaims.claims === 'object') {
              const { claims: nested, ...rest } = normalizedClaims
              normalizedClaims = { ...rest, ...nested }
            }

            // Every card gets a status entry and an issued row so the organisation can withdraw
            // it later (role change, leaving, "send again").
            const { credentialLifecycleService } = require('../build/services/ssi/CredentialLifecycleService')
            const credentialId = metadata?.credentialId || `urn:uuid:${issuanceSession.id}`
            const issuerTenantId = metadata?.tenantId || 'default'

            const { SD_JWT_CONFIG_SUFFIX, sdJwtDisclosureFrame } = require('../build/utils/credentialDefinitionStore')
            const configFormat = String(credentialConfiguration?.format || '')
            const selective =
              configFormat === 'vc+sd-jwt' ||
              configFormat === 'dc+sd-jwt' ||
              String(supportedId || '').endsWith(SD_JWT_CONFIG_SUFFIX) ||
              String(metadata?.credentialDefinitionId || '').endsWith(SD_JWT_CONFIG_SUFFIX)
            if (selective) {
              const vct = String(supportedId || metadata?.credentialDefinitionId || '').replace(
                SD_JWT_CONFIG_SUFFIX,
                '',
              )
              // The signer checks this object's format and vct. A stored configuration that lost
              // them still issues, because the configuration id says which card this is.
              if (credentialConfiguration) {
                if (!credentialConfiguration.format) credentialConfiguration.format = 'vc+sd-jwt'
                if (!credentialConfiguration.vct) credentialConfiguration.vct = vct
              }
              const sdClaims = {}
              for (const [key, value] of Object.entries(normalizedClaims)) {
                if (value === undefined || key === 'id' || key === 'claims') continue
                sdClaims[key] = value
              }
              const bindingKeys = Array.isArray(holderBinding?.keys) ? holderBinding.keys : []
              const holders = bindingKeys.map((key) =>
                key?.method === 'did' && typeof key.didUrl === 'string'
                  ? { method: 'did', didUrl: key.didUrl }
                  : key?.jwk
                    ? { method: 'jwk', jwk: key.jwk }
                    : undefined,
              )
              if (holders.length === 0) holders.push(undefined)
              const statusEntry = credentialLifecycleService.registerIssued({
                issuanceSessionId: issuanceSession.id,
                tenantId: issuerTenantId,
                issuerDid,
                credentialId,
                holderDid: subjectDid,
                credentialDefinitionId: metadata?.credentialDefinitionId || supportedId,
                format: ClaimFormat.SdJwtDc,
                credentialData: {
                  vct,
                  type: ['VerifiableCredential', vct],
                  credentialSubject: { id: subjectDid, ...sdClaims },
                },
              })
              console.log(
                '[startServer] Issuing selective-disclosure card',
                vct,
                statusEntry ? 'with status entry' : 'without status entry',
              )
              return {
                type: 'credentials',
                format: ClaimFormat.SdJwtDc,
                credentials: holders.map((holder) => ({
                  // `jti` and `status` stay outside the disclosure frame so a checker always sees them.
                  payload: { vct, jti: credentialId, ...(statusEntry ? { status: statusEntry } : {}), ...sdClaims },
                  ...(holder ? { holder } : {}),
                  issuer: { method: 'did', didUrl: verificationMethod },
                  disclosureFrame: sdJwtDisclosureFrame(sdClaims),
                })),
              }
            }

            const credentialType = (supportedId || 'GenericIDCredential').replace(/_jwt_vc_json$/, '')
            const credentialJson = {
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              id: credentialId,
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
            const statusEntry = credentialLifecycleService.registerIssued({
              issuanceSessionId: issuanceSession.id,
              tenantId: issuerTenantId,
              issuerDid,
              credentialId,
              holderDid: subjectDid,
              credentialDefinitionId: metadata?.credentialDefinitionId || supportedId,
              format: ClaimFormat.JwtVc,
              credentialData: credentialJson,
            })
            if (statusEntry) credentialJson.credentialStatus = statusEntry

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
    dependencies:
      process.env.OID4VC_LOOPBACK_FETCH === 'false'
        ? agentDependencies
        : {
            ...agentDependencies,
            // Calls to our own public (tunnel) URL go straight to the local API on port 3000.
            fetch: createLoopbackFetch(
              agentDependencies.fetch,
              [process.env.PUBLIC_BASE_URL, process.env.OID4VC_BASE_URL].filter(Boolean),
              'http://127.0.0.1:3000',
            ),
          },
  })

  await agent.initialize()
  console.log('✅ Agent initialized')

  if (resetBackupDir) {
    const { HydraAdminClient } = require('../build/services/partner/HydraAdminClient')
    const hydra = new HydraAdminClient()
    try {
      const report = await dataReset.runPlatformDataReset({
        persistenceDb: DatabaseManager.getDatabase(),
        tenantsDbPath: process.env.TENANT_DB_PATH || require('path').join(dataDir, 'tenants.db'),
        log: (line) => console.warn(`⚠️ Data reset: ${line}`),
        hooks: {
          listCredoTenantIds: async () => (await agent.modules.tenants.getAllTenants()).map((t) => t.id),
          deleteCredoTenant: (tenantId) => agent.modules.tenants.deleteTenantById(tenantId),
          deleteHydraClient: hydra.enabled ? (clientId) => hydra.deleteClient(clientId) : undefined,
          rotateJwtSecret: async () => {
            const { generateSecretKey } = require('../build/utils/helpers')
            const [record] = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
            if (!record) return
            record.content.secretKey = await generateSecretKey()
            await agent.genericRecords.update(record)
          },
        },
      })
      const reportPath = dataReset.writeResetReport(resetBackupDir, report)
      dataReset.settleResetFlag(resetFlag)
      console.warn(`⚠️ Org and user data reset finished; report at ${reportPath}`)
    } catch (resetErr) {
      dataReset.writeResetReport(resetBackupDir, { error: resetErr.message, failedAt: new Date().toISOString() })
      dataReset.settleResetFlag(resetFlag, resetErr)
      console.error('❌ Org and user data reset failed; starting with existing data:', resetErr)
    }
  }

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

    // Selective-disclosure cards (staff card, role card) are also offered as `vc+sd-jwt`, so a
    // share can reveal only the details a step asks for. Same builder as the API uses.
    const { issuerConfigurationsForDefinition } = require('../build/utils/credentialDefinitionStore')
    demoTypes.forEach((type) => {
      for (const config of issuerConfigurationsForDefinition({
        name: type,
        credentialType: ['VerifiableCredential', type],
      })) {
        if (config.format !== 'vc+sd-jwt') continue
        const { id, ...rest } = config
        credentialConfigurationsSupported[id] = rest
      }
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
      port: Number(process.env.CREDO_LISTEN_PORT || process.env.ISSUER_API_PORT || 3000),
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

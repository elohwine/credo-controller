/**
 * Holder Agent Entry Point (Port 4000)
 * This is a FULL agent (Issuer, Holder, Verifier capabilities)
 * but the UI will use it primarily as a Holder to accept credentials
 * from the Main Agent (Port 3000).
 */

const { startServer } = require('../build/index')
const express = require('express')
const { Router } = require('express')
const { Agent, AutoAcceptCredential, AutoAcceptProof, ConnectionsModule, CredentialsModule, DidsModule, HttpOutboundTransport, KeyDidRegistrar, KeyDidResolver, LogLevel, ProofsModule, WebDidResolver, W3cCredentialsModule } = require('@credo-ts/core')
const { AskarModule, AskarMultiWalletDatabaseScheme } = require('@credo-ts/askar')
const { TenantsModule } = require('@credo-ts/tenants')
const { OpenId4VcVerifierModule, OpenId4VcHolderModule } = require('@credo-ts/openid4vc')
const { agentDependencies, HttpInboundTransport } = require('@credo-ts/node')
const { ariesAskar } = require('@hyperledger/aries-askar-nodejs')
const { TsLogger } = require('../build/utils/logger')

// === HOLDER AGENT CONFIG ===
// Set environment variables for this process
process.env.ISSUER_API_URL = process.env.ISSUER_API_URL || 'http://localhost:3000'
process.env.ISSUER_API_KEY = process.env.ISSUER_API_KEY || 'test-api-key-12345'
// Separate DB for Holder to avoid SQLite locking with Issuer
process.env.PERSISTENCE_DB_PATH = process.env.PERSISTENCE_DB_PATH || './data/holder.db'

const HOLDER_API_PORT = 6000
const HOLDER_INBOUND_PORT = 6001
const HOLDER_WALLET_ID = 'holder-wallet'
const HOLDER_BASE_URL = `http://localhost:${HOLDER_API_PORT}`

async function run() {
    const logger = new TsLogger(LogLevel.info)

    const maxTimerMs = 2147483647

    const app = express()
    const issuerRouter = Router()
    const verifierRouter = Router()

    // Routers are passed to the OpenId4VcIssuerModule and will be mounted automatically
    // by setupServer to ensure they are placed after global middlewares (CORS, etc.)


    const agent = new Agent({
        config: {
            walletConfig: {
                id: HOLDER_WALLET_ID,
                key: 'holder-wallet-key',
            },
            label: 'Holder Agent (User Wallets)',
            endpoints: [`http://127.0.0.1:${HOLDER_INBOUND_PORT}`],
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
            // OpenID4VC Holder/Verifier modules (holder-only on this server)
            openId4VcVerifier: new OpenId4VcVerifierModule({
                baseUrl: `${HOLDER_BASE_URL}/oidc/verifier`,
                router: verifierRouter,
            }),
            openId4VcHolder: new OpenId4VcHolderModule(),
        },
        dependencies: agentDependencies,
    })

    agent.registerOutboundTransport(new HttpOutboundTransport())
    agent.registerInboundTransport(new HttpInboundTransport({ port: HOLDER_INBOUND_PORT }))

    await agent.initialize()
    console.log('✅ Holder Agent initialized')

    // === Generate JWT Secret (Required for WalletAuthController) ===
    const { generateSecretKey } = require('../build/utils/helpers')
    const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    if (!genericRecord || genericRecord.length === 0) {
        const secretKeyInfo = await generateSecretKey()
        await agent.genericRecords.save({
            content: { secretKey: secretKeyInfo },
            tags: { hasSecretKey: 'true' },
        })
        console.log('✅ JWT Secret Key generated for Holder Agent')
    } else {
        console.log('ℹ️ JWT Secret Key already exists in Holder Agent')
    }

    // No local issuer on holder agent — this server only hosts a wallet (holder)

    // Register holder well-known BEFORE mounting the framework routes so
    // this handler takes precedence over generated TSOA/controller routes.
    app.get('/.well-known/openid-credential-issuer', (_req, res) => {
        const base = HOLDER_BASE_URL
        const supportedFormats = ['jwt_vc_json', 'jwt_vc']

        const credential_configurations_supported = {}
        supportedFormats.forEach((fmt) => {
            const id = `GenericIDCredential_${fmt}`
            credential_configurations_supported[id] = {
                format: fmt,
                scope: 'GenericIDCredential',
                cryptographic_binding_methods_supported: ['did'],
                cryptographic_suites_supported: ['Ed25519Signature2018'],
                credential_definition: { type: ['VerifiableCredential', 'GenericIDCredential'] },
                display: [{ name: 'Generic ID', locale: 'en-US' }],
            }
        })

        return res.json({
            issuer: base,
            credential_issuer: base,
            token_endpoint: `${base}/oidc/token`,
            credential_endpoint: `${base}/oidc/credential-offers`,
            grants: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
            credential_configurations_supported,
        })
    })

    const server = await startServer(
        agent,
        {
            port: HOLDER_API_PORT,
            cors: true,
            webhookUrl: process.env.WEBHOOK_URL,
            app,
        },
        'holder-api-key-12345'
    )
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Serve an explicit holder-level OpenID4VC issuer well-known document
    // so wallets and UIs can discover which credential formats this
    // holder/wallet supports. This is intentionally static for the
    // sample holder; in production you'd derive this from agent capabilities.
    app.get('/.well-known/openid-credential-issuer', (_req, res) => {
        const base = HOLDER_BASE_URL
        const supportedFormats = ['jwt_vc_json', 'jwt_vc']

        const credential_configurations_supported = {}
        supportedFormats.forEach((fmt) => {
            const id = `GenericIDCredential_${fmt}`
            credential_configurations_supported[id] = {
                format: fmt,
                scope: 'GenericIDCredential',
                cryptographic_binding_methods_supported: ['did'],
                cryptographic_suites_supported: ['Ed25519Signature2018'],
                credential_definition: { type: ['VerifiableCredential', 'GenericIDCredential'] },
                display: [{ name: 'Generic ID', locale: 'en-US' }],
            }
        })

        return res.json({
            issuer: base,
            credential_issuer: base,
            token_endpoint: `${base}/oidc/token`,
            credential_endpoint: `${base}/oidc/credential-offers`,
            grants: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
            credential_configurations_supported,
        })
    })

    console.log(`🚀 Holder Agent running on http://localhost:${HOLDER_API_PORT}`)
    console.log(`🔌 Holder Inbound transport on http://localhost:${HOLDER_INBOUND_PORT}`)
    console.log(`ℹ️ UI should connect to this agent for wallet operations.`)
}

run().catch((error) => {
    console.error('Error starting Holder Agent:', error)
    process.exit(1)
})

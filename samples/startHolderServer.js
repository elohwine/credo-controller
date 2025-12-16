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
const { OpenId4VcIssuerModule, OpenId4VcVerifierModule, OpenId4VcHolderModule } = require('@credo-ts/openid4vc')
const { agentDependencies, HttpInboundTransport } = require('@credo-ts/node')
const { ariesAskar } = require('@hyperledger/aries-askar-nodejs')
const { TsLogger } = require('../build/utils/logger')

// === HOLDER AGENT CONFIG ===
// Set environment variables for this process
process.env.ISSUER_API_URL = process.env.ISSUER_API_URL || 'http://localhost:3000'
process.env.ISSUER_API_KEY = process.env.ISSUER_API_KEY || 'test-api-key-12345'

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

    app.use('/oidc/issuer', issuerRouter)
    app.use('/oidc/verifier', verifierRouter)

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
            // Full OpenID4VC capabilities (usable as Holder, but has all modules)
            openId4VcIssuer: new OpenId4VcIssuerModule({
                baseUrl: `${HOLDER_BASE_URL}/oidc/issuer`,
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

    // Initialize minimal OpenID4VC issuer (optional, mainly for completeness)
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
                name: 'Holder Agent (Local)',
                description: 'User wallet agent',
                locale: 'en-US',
            },
        ]

        const existingIssuers = await agent.modules.openId4VcIssuer.getAllIssuers()
        if (existingIssuers && existingIssuers.length > 0) {
            console.log(`ℹ️ Found existing issuer on Holder Agent: ${existingIssuers[0].issuerId}`)
        } else {
            const openId4VcIssuer = await agent.modules.openId4VcIssuer.createIssuer({
                display,
                credentialsSupported,
            })
            console.log(`✅ Holder Agent OpenID4VC Issuer initialized: ${openId4VcIssuer.issuerId}`)
        }
    } catch (e) {
        console.error('❌ Failed to initialize OpenID4VC Issuer on Holder Agent:', e)
    }

    await startServer(
        agent,
        {
            port: HOLDER_API_PORT,
            cors: true,
            webhookUrl: process.env.WEBHOOK_URL,
            app,
        },
        'holder-api-key-12345'
    )

    console.log(`🚀 Holder Agent running on http://localhost:${HOLDER_API_PORT}`)
    console.log(`🔌 Holder Inbound transport on http://localhost:${HOLDER_INBOUND_PORT}`)
    console.log(`ℹ️ UI should connect to this agent for wallet operations.`)
}

run().catch((error) => {
    console.error('Error starting Holder Agent:', error)
    process.exit(1)
})

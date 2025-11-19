const { startServer } = require('../build/index')
const { Agent, AutoAcceptCredential, AutoAcceptProof, ConnectionsModule, CredentialsModule, DidsModule, HttpOutboundTransport, KeyDidRegistrar, KeyDidResolver, LogLevel, ProofsModule, WebDidResolver, W3cCredentialsModule } = require('@credo-ts/core')
const { AskarModule, AskarMultiWalletDatabaseScheme } = require('@credo-ts/askar')
const { TenantsModule } = require('@credo-ts/tenants')
const { agentDependencies, HttpInboundTransport } = require('@credo-ts/node')
const { ariesAskar } = require('@hyperledger/aries-askar-nodejs')
const { TsLogger } = require('../build/utils/logger')

async function run() {
  const logger = new TsLogger(LogLevel.info)
  
  const agent = new Agent({
    config: {
      walletConfig: {
        id: 'sample-wallet',
        key: 'sample-wallet-key',
      },
      label: 'Multi-Tenant Test Agent',
      endpoints: ['http://localhost:3001'],
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
        sessionAcquireTimeout: Infinity,
        sessionLimit: Infinity,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      connections: new ConnectionsModule({ autoAcceptConnections: true }),
      credentials: new CredentialsModule({ autoAcceptCredentials: AutoAcceptCredential.Always }),
      proofs: new ProofsModule({ autoAcceptProofs: AutoAcceptProof.Always }),
      w3cCredentials: new W3cCredentialsModule(),
    },
    dependencies: agentDependencies,
  })

  agent.registerOutboundTransport(new HttpOutboundTransport())
  agent.registerInboundTransport(new HttpInboundTransport({ port: 3001 }))

  await agent.initialize()
  console.log('✅ Agent initialized')

  // Generate secret key for JWT signing if it doesn't exist
  const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
  const record = genericRecord[0]
  if (!record) {
    const { generateSecretKey } = require('../build/utils/helpers')
    const secretKeyInfo = await generateSecretKey()
    await agent.genericRecords.save({
      content: { secretKey: secretKeyInfo },
      tags: { hasSecretKey: 'true' },
    })
    console.log('✅ Secret key generated for JWT signing')
  } else {
    console.log('✅ Secret key already exists')
  }

  await startServer(
    agent,
    {
      port: 3000,
      cors: true,
      webhookUrl: process.env.WEBHOOK_URL,
    },
    'test-api-key-12345'
  )

  console.log(`🚀 Server running on http://localhost:3000`)
  console.log(`🔌 Inbound transport on http://localhost:3001`)

  // Seed VC models after server starts
  setTimeout(() => {
    console.log('Seeding VC models...')
    const { exec } = require('child_process')
    exec('yarn seed:models --backend http://localhost:3000 --apiKey test-api-key-12345', (error, stdout, stderr) => {
      if (error) {
        console.log('Seeding failed or skipped:', error.message)
      } else {
        console.log('Seeding completed')
      }
    })
  }, 3000)
}

run().catch((error) => {
  console.error('Error starting server:', error)
  process.exit(1)
})

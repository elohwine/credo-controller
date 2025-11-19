import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  Agent,
  AutoAcceptCredential,
  AutoAcceptProof,
  ConnectionsModule,
  CredentialsModule,
  DidsModule,
  HttpOutboundTransport,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  ProofsModule,
  WebDidResolver,
  W3cCredentialsModule,
} from '@credo-ts/core'
import { agentDependencies, HttpInboundTransport } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'

import { setupServer } from '../src/server'
import { TsLogger } from '../src/utils/logger'

const run = async () => {
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

  const app = await setupServer(
    agent,
    {
      port: 3000,
      webhookUrl: process.env.WEBHOOK_URL,
    },
    'test-api-key-12345'
  )

  console.log(`🚀 Server running on http://localhost:3000`)
  console.log(`🔌 Inbound transport on http://localhost:3001`)
}

run().catch((error) => {
  console.error('Error starting server:', error)
  process.exit(1)
})

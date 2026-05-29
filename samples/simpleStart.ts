import type { ServerConfig } from '../src/utils/ServerConfig'

import { setupServer } from '../src/server'
import { setupAgent } from '../src/utils/agent'
import { generateSecretKey } from '../src/utils/helpers'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { schemaStore } from '../src/utils/schemaStore'
import { credentialDefinitionStore } from '../src/utils/credentialDefinitionStore'
import { startNgrokTunnel, getNgrokUrl } from '../src/utils/ngrokTunnel'

const run = async () => {
  const walletId = process.env.WALLET_ID || 'shared-controller-agent'
  const askarStoragePath = process.env.ASKAR_STORAGE_PATH || './data/askar-issuer'
  const serverPort = Number(process.env.PORT || 3000)
  const agentPort = Number(process.env.AGENT_PORT || 3001)

  // Start ngrok tunnel for webhook support in dev
  const enableNgrok = process.env.ENABLE_NGROK !== 'false' && process.env.NODE_ENV !== 'production'
  let ngrokUrl: string | null = null
  
  if (enableNgrok) {
    try {
      ngrokUrl = await startNgrokTunnel({ port: serverPort })
    } catch (error) {
      console.warn('⚠️  Ngrok failed to start - webhooks will only work locally')
      console.warn('   Set ENABLE_NGROK=false to suppress this warning')
    }
  }
  // CRITICAL: Initialize DatabaseManager before agent setup for persistent stores
  const dbPath = process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
  console.log('Initializing persistence layer at:', dbPath)
  DatabaseManager.initialize({ path: dbPath })
  console.log('Persistence layer initialized successfully')
  console.log('Using canonical wallet id:', walletId)
  console.log('Using Askar storage path:', askarStoragePath)

  const agent = await setupAgent({
    port: agentPort,
    endpoints: [`http://localhost:${agentPort}`],
    name: 'Credo UI Test Agent',
  })

  // Generate and store JWT secret key if not exists
  const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
  if (genericRecord.length === 0) {
    const secretKeyInfo = await generateSecretKey()
    await agent.genericRecords.save({
      content: { secretKey: secretKeyInfo },
      tags: { hasSecretKey: 'true' },
    })
    console.log('JWT secret key generated and stored')
  } else {
    console.log('JWT secret key already exists')
  }

  // Use a fixed API key for development
  const apiKey = process.env.API_KEY || 'test-api-key-12345'

  const conf: ServerConfig = {
    port: serverPort,
    cors: true,
  }

  console.log('\n===========================================')
  console.log(`Starting Credo backend on port ${serverPort}...`)
  console.log(`Agent endpoint: http://localhost:${agentPort}`)
  console.log(`API docs: http://localhost:${serverPort}/docs`)
  console.log(`API Key: ${apiKey}`)
  if (ngrokUrl) {
    console.log(`Ngrok URL: ${ngrokUrl}`)
    console.log(`Webhooks:`)
    console.log(`  - WhatsApp: ${ngrokUrl}/webhooks/whatsapp`)
    console.log(`  - EcoCash: ${ngrokUrl}/webhooks/ecocash`)
  }
  console.log('===========================================\n')

  const app = await setupServer(agent, conf, apiKey)
  app.listen(conf.port)

  // Seed credential models
  console.log('Seeding credential models...')
  await seedCredentialModels()
  console.log('Credential models seeded successfully')

  console.log('\n🚀 Server ready!')
  console.log(`📡 Agent endpoint: http://localhost:${agentPort}`)
  console.log(`📚 API docs: http://localhost:${serverPort}/docs`)
  console.log(`🔑 API Key: ${apiKey}`)
  if (ngrokUrl) {
    console.log(`🌐 Public URL: ${ngrokUrl}`)
  }
}

async function seedCredentialModels() {
  // Define schemas
  const schemas = [
    {
      name: 'PaymentReceipt',
      version: '1.0.0',
      jsonSchema: {
        $id: 'PaymentReceipt-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['transactionId', 'amount', 'currency'],
            properties: {
              transactionId: { type: 'string' },
              amount: { type: 'string' },
              currency: { type: 'string' },
              merchant: { type: 'string' },
            },
          },
        },
      },
    },
    {
      name: 'GenericIDCredential',
      version: '1.0.0',
      jsonSchema: {
        $id: 'GenericIDCredential-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['fullName', 'identifier'],
            properties: {
              fullName: { type: 'string' },
              identifier: { type: 'string' },
              issuedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  ]

  // Register schemas if not exist
  for (const s of schemas) {
    const existing = schemaStore.list().find(es => es.name === s.name && es.version === s.version)
    if (!existing) {
      const result = schemaStore.register(s)
      if ('error' in result) {
        console.warn(`Failed to register schema ${s.name}: ${result.error}`)
      } else {
        console.log(`Registered schema: ${s.name}`)
      }
    }
  }

  // Get registered schemas
  const paymentReceiptSchema = schemaStore.list().find(s => s.name === 'PaymentReceipt')
  const genericIDSchema = schemaStore.list().find(s => s.name === 'GenericIDCredential')

  if (!paymentReceiptSchema || !genericIDSchema) {
    console.warn('Required schemas not found, skipping credential definition seeding')
    return
  }

  // Define credential definitions
  const defs = [
    {
      name: 'PaymentReceiptDef',
      version: '1.0.0',
      schemaId: paymentReceiptSchema.schemaId,
      issuerDid: 'did:key:z6MkgWnBEAE5STCGvtzfcWrn1uePvhQ8LxHSeaLRbqZ38Z2j', // Will be updated when tenant is created
      credentialType: ['VerifiableCredential', 'PaymentReceipt'],
      claimsTemplate: {
        credentialSubject: {
          transactionId: 'TX123456',
          amount: '100.00',
          currency: 'USD',
          merchant: 'DemoStore',
        },
      },
      format: 'jwt_vc' as const,
    },
    {
      name: 'GenericIDDef',
      version: '1.0.0',
      schemaId: genericIDSchema.schemaId,
      issuerDid: 'did:key:z6MkgWnBEAE5STCGvtzfcWrn1uePvhQ8LxHSeaLRbqZ38Z2j',
      credentialType: ['VerifiableCredential', 'GenericIDCredential'],
      claimsTemplate: {
        credentialSubject: {
          fullName: 'Alice Example',
          identifier: 'ID-001',
          issuedAt: new Date().toISOString(),
        },
      },
      format: 'jwt_vc' as const,
    },
  ]

  // Register credential definitions if not exist
  for (const d of defs) {
    const existing = credentialDefinitionStore.list().find(ecd => ecd.name === d.name && ecd.version === d.version)
    if (!existing) {
      const result = credentialDefinitionStore.register(d)
      if ('error' in result) {
        console.warn(`Failed to register credential definition ${d.name}: ${result.error}`)
      } else {
        console.log(`Registered credential definition: ${d.name}`)
      }
    }
  }
}

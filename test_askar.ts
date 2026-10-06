import { setupAgent } from './src/utils/agent'

async function run() {
  console.log('Bootstrapping Credo agent with Askar...')
  const agent = await setupAgent({
    name: `askar-did-test-${Date.now()}`,
    endpoints: ['http://localhost:3001'],
    port: 3001,
  })

  try {
    console.log('Creating Ed25519 key directly through KMS...')
    const kmsKey = await agent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })
    console.log('Created KMS key:', kmsKey.keyId)

    console.log('Creating did:key using Credo DidsApi...')
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

    if (didResult.didState.state !== 'finished' || !didResult.didState.did) {
      const reason = 'reason' in didResult.didState ? didResult.didState.reason : 'no reason provided'
      throw new Error(`did:key creation failed: ${didResult.didState.state} :: ${reason}`)
    }

    const did = didResult.didState.did
    const createdDids = await agent.dids.getCreatedDids({ method: 'key', did })
    const resolved = await agent.dids.resolveCreatedDidDocumentWithKeys(did)

    console.log('Created DID:', did)
    console.log('Verification method:', resolved.didDocument.verificationMethod?.[0]?.id)
    console.log('Stored keys:', resolved.keys?.length ?? 0)
    console.log('Matching created DID records:', createdDids.length)
  } finally {
    await agent.shutdown()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'

interface SeedParams { tenantId: string; issuerDid: string }

// Simple internal seeding using in-memory stores directly (avoids HTTP roundtrip during provisioning)
// For production replace with durable persistence or remove automatic seeding.
export async function registerDefaultModelsForTenant({ tenantId, issuerDid }: SeedParams) {
  // Resolve tenant agent from container root agent modules
  const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)
  if (!('tenants' in (baseAgent.modules as any))) return

  await (baseAgent.modules as any).tenants.withTenantAgent({ tenantId }, async (tenantAgent: any) => {
    const { schemaStore } = await import('../utils/schemaStore')
    const { credentialDefinitionStore } = await import('../utils/credentialDefinitionStore')

    const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>) => {
      const existing = schemaStore.find(name, version)
      if (existing) return existing.schemaId
      const registered: any = schemaStore.register({ name, version, jsonSchema })
      if ('error' in registered) throw new Error(`Schema registration failed: ${registered.error}`)
      return registered.schemaId
    }

    const paymentSchemaId = ensureSchema('PaymentReceipt', '1.0.0', {
      $id: 'PaymentReceipt-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: { credentialSubject: { type: 'object', required: ['transactionId', 'amount', 'currency'], properties: { transactionId: { type: 'string' }, amount: { type: 'string' }, currency: { type: 'string' }, merchant: { type: 'string' } } } },
    })

    const genericIdSchemaId = ensureSchema('GenericIDCredential', '1.0.0', {
      $id: 'GenericIDCredential-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: { credentialSubject: { type: 'object', required: ['fullName', 'identifier'], properties: { fullName: { type: 'string' }, identifier: { type: 'string' }, issuedAt: { type: 'string', format: 'date-time' } } } },
    })

    const registerDef = (name: string, version: string, schemaId: string, credentialType: string[], claimsTemplate: any) => {
      const existing = credentialDefinitionStore.list().find((d) => d.name === name && d.version === version && d.schemaId === schemaId && d.issuerDid === issuerDid)
      if (existing) return existing.credentialDefinitionId
      const res: any = credentialDefinitionStore.register({
        name,
        version,
        schemaId,
        issuerDid,
        credentialType,
        claimsTemplate,
        format: 'jwt_vc',
      })
      if ('error' in res) throw new Error(`CredDef registration failed: ${res.error}`)
      return res.credentialDefinitionId
    }

    registerDef(
      'PaymentReceiptDef',
      '1.0.0',
      paymentSchemaId,
      ['VerifiableCredential', 'PaymentReceipt'],
      {
        credentialSubject: {
          transactionId: 'TX-SEED-0001',
          amount: '42.00',
          currency: 'USD',
          merchant: 'SeedMerchant',
        },
      },
    )

    registerDef(
      'GenericIDDef',
      '1.0.0',
      genericIdSchemaId,
      ['VerifiableCredential', 'GenericIDCredential'],
      {
        credentialSubject: {
          fullName: 'Seed User',
          identifier: 'SEED-ID-1',
          issuedAt: new Date().toISOString(),
        },
      },
    )
  })
}

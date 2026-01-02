import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'

interface SeedParams { tenantId: string; issuerDid: string }

// Simple internal seeding using in-memory stores directly (avoids HTTP roundtrip during provisioning)
// For production replace with durable persistence or remove automatic seeding.
export async function registerDefaultModelsForTenant({ tenantId, issuerDid }: SeedParams) {
  // Resolve tenant agent from container root agent modules
  const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)
  console.log(`[ModelRegistry] Starting registration for tenant ${tenantId}`)
  await (baseAgent.modules as any).tenants.withTenantAgent({ tenantId }, async (tenantAgent: any) => {
    console.log(`[ModelRegistry] Acquired tenant agent for ${tenantId}`)
    const { schemaStore } = await import('../utils/schemaStore')
    const { credentialDefinitionStore } = await import('../utils/credentialDefinitionStore')

    const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>) => {
      const existing = schemaStore.find(name, version, tenantId)
      if (existing) {
        console.log(`[ModelRegistry] Schema ${name}@${version} already exists: ${existing.schemaId}`);
        return existing.schemaId
      }
      const registered: any = schemaStore.register({ name, version, jsonSchema, tenantId })
      if ('error' in registered) throw new Error(`Schema registration failed: ${registered.error}`)
      console.log(`[ModelRegistry] Registered schema ${name}@${version}: ${registered.schemaId}`);
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

    const registerDef = (name: string, version: string, schemaId: string, credentialType: string[], claimsTemplate: any, format: string = 'jwt_vc') => {
      const existing = credentialDefinitionStore.list(tenantId).find((d) => d.name === name && d.version === version && d.schemaId === schemaId && d.issuerDid === issuerDid)
      if (existing) {
        console.log(`[ModelRegistry] CredDef ${name} already exists: ${existing.credentialDefinitionId}`);
        return existing.credentialDefinitionId
      }
      const res: any = credentialDefinitionStore.register({
        name,
        version,
        schemaId,
        issuerDid,
        credentialType,
        claimsTemplate,
        format: format as any,
        tenantId,
      })
      if ('error' in res) throw new Error(`CredDef registration failed: ${res.error}`)
      console.log(`[ModelRegistry] Registered CredDef ${name} with ID ${res.credentialDefinitionId}`);
      return res.credentialDefinitionId
    }

    // --- E-Commerce VC Models ---

    const cartSchemaId = ensureSchema('CartSnapshotVC', '1.0.0', {
      $id: 'CartSnapshotVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['cartId', 'items', 'totalAmount'],
          properties: {
            cartId: { type: 'string' },
            items: { type: 'array', items: { type: 'object' } },
            totalAmount: { type: 'number' },
            currency: { type: 'string' },
            merchantDid: { type: 'string' }
          }
        }
      }
    })

    const invoiceSchemaId = ensureSchema('InvoiceVC', '1.0.0', {
      $id: 'InvoiceVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['invoiceId', 'cartRef', 'amount', 'dueDate'],
          properties: {
            invoiceId: { type: 'string' },
            cartRef: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            dueDate: { type: 'string', format: 'date-time' }
          }
        }
      }
    })

    const receiptSchemaId = ensureSchema('ReceiptVC', '1.0.0', {
      $id: 'ReceiptVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['receiptId', 'invoiceRef', 'paymentRef', 'timestamp'],
          properties: {
            receiptId: { type: 'string' },
            invoiceRef: { type: 'string' },
            paymentRef: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    })

    const ehrSchemaId = ensureSchema('EHRSummary', '1.0.0', {
      $id: 'EHRSummary-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['patientId', 'encounters'],
          properties: {
            patientId: { type: 'string' },
            encounters: {
              type: 'array',
              items: {
                type: 'object',
                required: ['date', 'type'],
                properties: {
                  date: { type: 'string', format: 'date' },
                  type: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
      },
    })

    registerDef(
      'CartSnapshotVC',
      '1.0.0',
      cartSchemaId,
      ['VerifiableCredential', 'CartSnapshotVC'],
      {},
      'jwt_vc_json'
    )

    registerDef(
      'InvoiceVC',
      '1.0.0',
      invoiceSchemaId,
      ['VerifiableCredential', 'InvoiceVC'],
      {},
      'jwt_vc_json'
    )

    registerDef(
      'ReceiptVC',
      '1.0.0',
      receiptSchemaId,
      ['VerifiableCredential', 'ReceiptVC'],
      {},
      'jwt_vc_json'
    )

    const badgeSchemaId = ensureSchema('OpenBadge', '3.0.0', {
      $id: 'OpenBadge-3.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['id', 'badgeClass', 'awardDate'],
          properties: {
            id: { type: 'string' },
            badgeClass: { type: 'string' },
            awardDate: { type: 'string', format: 'date' },
            criteriaUrl: { type: 'string' },
          },
        },
      },
    })

    const mdocSchemaId = ensureSchema('MdocHealthSummary', '0.1.0', {
      $id: 'MdocHealthSummary-0.1.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['patientId', 'conditions'],
          properties: {
            patientId: { type: 'string' },
            conditions: { type: 'array', items: { type: 'string' } },
            lastUpdated: { type: 'string', format: 'date-time' },
          },
        },
      },
    })

    registerDef(
      'EHRSummary',
      '1.0.0',
      ehrSchemaId,
      ['VerifiableCredential', 'EHRSummary'],
      {
        credentialSubject: {
          patientId: 'PAT-123',
          encounters: [
            { date: '2025-01-01', type: 'Consultation', notes: 'Routine check' },
          ],
        },
      },
      'jwt_vc_json'
    )

    registerDef(
      'OpenBadge',
      '3.0.0',
      badgeSchemaId,
      ['VerifiableCredential', 'OpenBadgeCredential'],
      {
        credentialSubject: {
          id: 'did:example:learner123',
          badgeClass: 'Blockchain Fundamentals',
          awardDate: new Date().toISOString().slice(0, 10),
          criteriaUrl: 'https://example.org/badges/blockchain-fundamentals',
        },
      },
      'jwt_vc_json'
    )

    registerDef(
      'MdocHealthSummary',
      '0.1.0',
      mdocSchemaId,
      ['VerifiableCredential', 'MdocHealthSummary'],
      {
        credentialSubject: {
          patientId: 'PAT-123',
          conditions: ['hypertension'],
          lastUpdated: new Date().toISOString(),
        },
      },
      'jwt_vc_json'
    )

    // --- Legacy / Generic Models ---

    registerDef(
      'PaymentReceipt',
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
      'jwt_vc_json'
    )

    registerDef(
      'GenericIDCredential',
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
      'jwt_vc_json'
    )
  })
}

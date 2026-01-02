#!/usr/bin/env ts-node
/*
 * Seed common VC models (PaymentReceipt, GenericID, OpenBadge, MinimalMdocHealth, EHRSummary) for a tenant.
 * Usage:
 *   yarn tsnd --transpile-only scripts/seed-vc-models.ts --backend http://localhost:3000 --apiKey test-api-key-12345
 *
 * Steps:
 * 1. Obtain root token using API key
 * 2. Create tenant (or reuse by label) and get tenant token
 * 3. Register schemas if not present
 * 4. Register credential definitions bound to issuerDid
 */
import axios from 'axios'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

interface RegisteredSchema { schemaId: string; name: string; version: string }
interface CredentialDefinition { credentialDefinitionId: string; name: string; version: string; schemaId: string; credentialType: string[] }

const args = yargs(hideBin(process.argv))
  .option('backend', { type: 'string', default: 'http://localhost:3000' })
  .option('apiKey', { type: 'string', demandOption: true })
  .option('tenantLabel', { type: 'string', default: 'Default VC Models Tenant' })
  .parseSync()

const BACKEND = args.backend.replace(/\/$/, '')
const API_KEY = args.apiKey
const TENANT_LABEL = args.tenantLabel

async function main() {
  console.log(`Seeding VC models against backend: ${BACKEND}`)
  // 1. Root token
  const rootTokResp = await axios.post(`${BACKEND}/agent/token`, {}, { headers: { Authorization: API_KEY } })
  const rootToken = rootTokResp.data.token
  console.log('Obtained root token')

  // 2. Create tenant
  let tenantId: string
  let tenantToken: string
  let issuerDid: string
  try {
    const tenantResp = await axios.post(
      `${BACKEND}/multi-tenancy/create-tenant`,
      { baseUrl: BACKEND, displayName: TENANT_LABEL, config: { label: TENANT_LABEL } },
      { headers: { Authorization: `Bearer ${rootToken}` } },
    )
    tenantId = tenantResp.data.tenantId || tenantResp.data.id
    tenantToken = tenantResp.data.token
    issuerDid = tenantResp.data.issuerDid
    if (!tenantId || !tenantToken || !issuerDid) throw new Error('Tenant provisioning failed')
    console.log(`Tenant created: ${tenantId} issuerDid=${issuerDid}`)
  } catch (e: any) {
    if (e.response?.status === 409) {
      console.log(`Tenant "${TENANT_LABEL}" already exists, skipping seeding`)
      process.exit(0)
    }
    throw e
  }
  console.log(`Tenant token: ${tenantToken}`)

  // Helper auth header
  const auth = { Authorization: `Bearer ${tenantToken}` }

  // 3. Register schemas
  type SchemaInput = { name: string; version: string; jsonSchema: Record<string, any> }
  const schemas: SchemaInput[] = [
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
    {
      name: 'OpenBadge',
      version: '3.0.0',
      jsonSchema: {
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
      },
    },
    {
      name: 'MdocHealthSummary',
      version: '0.1.0',
      jsonSchema: {
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
      },
    },
    {
      name: 'EHRSummary',
      version: '1.0.0',
      jsonSchema: {
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
      },
    },
    {
      name: 'PayslipVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'PayslipVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['payslipId', 'employeeName', 'period', 'netAmount'],
            properties: {
              payslipId: { type: 'string' },
              employeeName: { type: 'string' },
              nssaNumber: { type: 'string' },
              period: { type: 'string' },
              grossAmount: { type: 'number' },
              netAmount: { type: 'number' },
              currency: { type: 'string' },
              deductions: { type: 'object' },
              employer: { type: 'string' },
            },
          },
        },
      },
    },
    {
      name: 'EmploymentContractVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'EmploymentContractVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['employeeId', 'name', 'role', 'startDate', 'employer'],
            properties: {
              employeeId: { type: 'string' },
              name: { type: 'string' },
              role: { type: 'string' },
              startDate: { type: 'string' },
              employer: { type: 'string' },
              termsHash: { type: 'string' }
            },
          },
        },
      },
    },
    {
      name: 'FinancialStatementCredential',
      version: '1.0.0',
      jsonSchema: {
        $id: 'FinancialStatementCredential-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: [
              'statementType',
              'periodStart',
              'periodEnd',
              'revenue',
              'expenses',
              'netIncome',
              'assets',
              'liabilities',
              'equity',
              'currency',
              'generatedAt'
            ],
            properties: {
              statementType: { type: 'string' }, // 'IncomeStatement' | 'BalanceSheet'
              periodStart: { type: 'string', format: 'date' },
              periodEnd: { type: 'string', format: 'date' },
              revenue: { type: 'number' },
              expenses: { type: 'number' },
              netIncome: { type: 'number' },
              assets: { type: 'number' },
              liabilities: { type: 'number' },
              equity: { type: 'number' },
              currency: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' }
            },
          },
        },
      },
    },
    {
      name: 'StatusList2021Credential',
      version: '1.0.0',
      jsonSchema: {
        $id: 'StatusList2021Credential-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['type', 'statusPurpose', 'encodedList'],
            properties: {
              type: { type: 'string', const: 'StatusList2021' },
              statusPurpose: { type: 'string', const: 'revocation' },
              encodedList: { type: 'string' }
            },
          },
        },
      },
    },
  ]

  const registeredSchemas: Record<string, RegisteredSchema> = {}

  // First, list existing schemas
  let existingSchemas: RegisteredSchema[] = []
  try {
    const listResp = await axios.get(`${BACKEND}/oidc/schemas`, { headers: auth })
    existingSchemas = listResp.data
  } catch (e) {
    console.log('Could not list schemas, assuming none exist')
  }

  for (const s of schemas) {
    const existing = existingSchemas.find(es => es.name === s.name && es.version === s.version)
    if (existing) {
      registeredSchemas[s.name] = existing
      console.log(`Schema already exists: ${s.name} -> ${existing.schemaId}`)
    } else {
      const resp = await axios.post(`${BACKEND}/oidc/schemas`, s, { headers: auth })
      registeredSchemas[s.name] = resp.data
      console.log(`Schema registered: ${s.name} -> ${resp.data.schemaId}`)
    }
  }

  // 4. Register credential definitions
  type CredDefInput = {
    name: string
    version: string
    schemaName: string
    credentialType: string[]
    claimsTemplate?: Record<string, any>
    format?: 'jwt_vc' | 'sd_jwt'
  }

  const defs: CredDefInput[] = [
    {
      name: 'PaymentReceiptDef',
      version: '1.0.0',
      schemaName: 'PaymentReceipt',
      credentialType: ['VerifiableCredential', 'PaymentReceipt'],
      claimsTemplate: {
        credentialSubject: {
          transactionId: 'TX123456',
          amount: '100.00',
          currency: 'USD',
          merchant: 'DemoStore',
        },
      },
    },
    {
      name: 'GenericIDDef',
      version: '1.0.0',
      schemaName: 'GenericIDCredential',
      credentialType: ['VerifiableCredential', 'GenericIDCredential'],
      claimsTemplate: {
        credentialSubject: {
          fullName: 'Alice Example',
          identifier: 'ID-001',
          issuedAt: new Date().toISOString(),
        },
      },
      // Ensure GenericID uses canonical JWT-VC format by default
      format: 'jwt_vc',
    },
    {
      name: 'OpenBadgeDef',
      version: '3.0.0',
      schemaName: 'OpenBadge',
      credentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
      claimsTemplate: {
        credentialSubject: {
          id: 'did:example:learner123',
          badgeClass: 'Blockchain Fundamentals',
          awardDate: new Date().toISOString().slice(0, 10),
          criteriaUrl: 'https://example.org/badges/blockchain-fundamentals',
        },
      },
    },
    {
      name: 'MdocHealthSummaryDef',
      version: '0.1.0',
      schemaName: 'MdocHealthSummary',
      credentialType: ['VerifiableCredential', 'MdocHealthSummary'],
      claimsTemplate: {
        credentialSubject: {
          patientId: 'PAT-123',
          conditions: ['hypertension'],
          lastUpdated: new Date().toISOString(),
        },
      },
    },
    {
      name: 'EHRSummaryDef',
      version: '1.0.0',
      schemaName: 'EHRSummary',
      credentialType: ['VerifiableCredential', 'EHRSummary'],
      claimsTemplate: {
        credentialSubject: {
          patientId: 'PAT-123',
          encounters: [
            { date: '2025-01-01', type: 'Consultation', notes: 'Routine check' },
            { date: '2025-02-15', type: 'Lab', notes: 'Blood test normal' },
          ],
        },
      },
    },
    {
      name: 'PayslipDef',
      version: '1.0.0',
      schemaName: 'PayslipVC',
      credentialType: ['VerifiableCredential', 'PayslipVC'],
      claimsTemplate: {
        credentialSubject: {
          payslipId: 'SLIP-001',
          employeeName: 'John Doe',
          period: '2026-01',
          netAmount: 1234.56,
          currency: 'USD',
          employer: 'Demo Corp',
        },
      },
    },
    {
      name: 'EmploymentContractDef',
      version: '1.0.0',
      schemaName: 'EmploymentContractVC',
      credentialType: ['VerifiableCredential', 'EmploymentContractVC'],
      claimsTemplate: {
        credentialSubject: {
          employeeId: 'EMP-001',
          name: 'Jane Doe',
          role: 'Designer',
          startDate: '2026-02-01',
          employer: 'Demo Corp',
        },
      },
    },
    {
      name: 'FinancialStatementDef',
      version: '1.0.0',
      schemaName: 'FinancialStatementCredential',
      credentialType: ['VerifiableCredential', 'FinancialStatementCredential'],
      claimsTemplate: {
        credentialSubject: {
          statementType: 'IncomeStatement',
          periodStart: '2023-01-01',
          periodEnd: '2023-12-31',
          revenue: 1000000.00,
          expenses: 800000.00,
          netIncome: 200000.00,
          assets: 1500000.00,
          liabilities: 500000.00,
          equity: 1000000.00,
          currency: 'USD',
          generatedAt: new Date().toISOString(),
        },
      },
    },
    {
      name: 'StatusList2021Def',
      version: '1.0.0',
      schemaName: 'StatusList2021Credential',
      credentialType: ['VerifiableCredential', 'StatusList2021Credential'],
      claimsTemplate: {
        credentialSubject: {
          type: 'StatusList2021',
          statusPurpose: 'revocation',
          encodedList: 'H4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA',
        },
      },
    },
  ]

  // First, list existing credential definitions
  let existingCredDefs: CredentialDefinition[] = []
  try {
    const listResp = await axios.get(`${BACKEND}/oidc/credential-definitions`, { headers: auth })
    existingCredDefs = listResp.data
  } catch (e) {
    console.log('Could not list credential definitions, assuming none exist')
  }

  for (const d of defs) {
    const existing = existingCredDefs.find(ecd => ecd.name === d.name && ecd.version === d.version)
    if (existing) {
      console.log(`CredDef already exists: ${d.name} -> ${existing.credentialDefinitionId}`)
    } else {
      const schemaId = registeredSchemas[d.schemaName].schemaId
      const payload = {
        name: d.name,
        version: d.version,
        schemaId,
        issuerDid,
        credentialType: d.credentialType,
        claimsTemplate: d.claimsTemplate,
        format: d.format ?? 'jwt_vc',
      }
      const resp = await axios.post(`${BACKEND}/oidc/credential-definitions`, payload, { headers: auth })
      console.log(`CredDef registered: ${d.name} -> ${resp.data.credentialDefinitionId}`)
    }
  }

  // Final list
  const listResp = await axios.get(`${BACKEND}/oidc/credential-definitions`, { headers: auth })
  console.log('\nSeed complete. Definitions available:')
  for (const cd of listResp.data as CredentialDefinition[]) {
    console.log(` - ${cd.name}@${cd.version} (${cd.credentialDefinitionId}) types=[${cd.credentialType.join(',')}]`)
  }
}

main().catch((e) => {
  console.error('Seeding failed:', e.message)
  process.exit(1)
})

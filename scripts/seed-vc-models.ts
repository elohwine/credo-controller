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
    // ========== PAYROLL RUN VC (Batch Summary) ==========
    {
      name: 'PayrollRunVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'PayrollRunVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['runId', 'period', 'totalGross', 'totalNet', 'employeeCount', 'processedAt'],
            properties: {
              runId: { type: 'string' },
              period: { type: 'string' },
              totalGross: { type: 'number' },
              totalNet: { type: 'number' },
              totalDeductions: { type: 'number' },
              totalNssa: { type: 'number' },
              totalPaye: { type: 'number' },
              totalAidsLevy: { type: 'number' },
              employeeCount: { type: 'number' },
              currency: { type: 'string' },
              employer: { type: 'string' },
              processedAt: { type: 'string', format: 'date-time' },
              payslipVcIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    // ========== TAX COMPLIANCE VC (NSSA/PAYE Filing Record) ==========
    {
      name: 'TaxComplianceVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'TaxComplianceVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['complianceId', 'taxType', 'period', 'amount', 'filingDate', 'status'],
            properties: {
              complianceId: { type: 'string' },
              taxType: { type: 'string', enum: ['NSSA', 'PAYE', 'AIDS_LEVY', 'ZIMRA'] },
              period: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              filingDate: { type: 'string', format: 'date' },
              referenceNumber: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'filed', 'confirmed', 'rejected'] },
              employerTin: { type: 'string' },
              nssaNumber: { type: 'string' },
              employeeCount: { type: 'number' },
              relatedPayrollRunId: { type: 'string' },
              proofOfPaymentRef: { type: 'string' },
            },
          },
        },
      },
    },
    // ========== LEAVE APPROVAL VC ==========
    {
      name: 'LeaveApprovalVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'LeaveApprovalVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['leaveRequestId', 'employeeId', 'leaveType', 'startDate', 'endDate', 'approvedBy', 'approvedAt'],
            properties: {
              leaveRequestId: { type: 'string' },
              employeeId: { type: 'string' },
              leaveType: { type: 'string', enum: ['annual', 'sick', 'unpaid', 'maternity', 'study'] },
              startDate: { type: 'string', format: 'date' },
              endDate: { type: 'string', format: 'date' },
              daysCount: { type: 'number' },
              reason: { type: 'string' },
              approvedBy: { type: 'string' },
              approvedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    // ========== EXPENSE APPROVAL VC ==========
    {
      name: 'ExpenseApprovalVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'ExpenseApprovalVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['expenseClaimId', 'employeeId', 'amount', 'currency', 'approvedBy', 'approvedAt'],
            properties: {
              expenseClaimId: { type: 'string' },
              employeeId: { type: 'string' },
              description: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              category: { type: 'string', enum: ['travel', 'meals', 'equipment', 'other'] },
              approvedBy: { type: 'string' },
              approvedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    // ========== INCOME STATEMENT VC ==========
    {
      name: 'IncomeStatementVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'IncomeStatementVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['statementId', 'periodStart', 'periodEnd', 'revenue', 'expenses', 'netIncome', 'currency', 'generatedAt'],
            properties: {
              statementId: { type: 'string' },
              organizationName: { type: 'string' },
              periodStart: { type: 'string', format: 'date' },
              periodEnd: { type: 'string', format: 'date' },
              revenue: { type: 'number' },
              costOfGoodsSold: { type: 'number' },
              grossProfit: { type: 'number' },
              operatingExpenses: { type: 'number' },
              operatingIncome: { type: 'number' },
              otherIncome: { type: 'number' },
              otherExpenses: { type: 'number' },
              expenses: { type: 'number' },
              netIncome: { type: 'number' },
              currency: { type: 'string' },
              breakdown: {
                type: 'object',
                properties: {
                  sales: { type: 'number' },
                  payroll: { type: 'number' },
                  operations: { type: 'number' },
                },
              },
              generatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    // ========== BALANCE SHEET VC ==========
    {
      name: 'BalanceSheetVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'BalanceSheetVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['statementId', 'asOfDate', 'totalAssets', 'totalLiabilities', 'totalEquity', 'currency', 'generatedAt'],
            properties: {
              statementId: { type: 'string' },
              organizationName: { type: 'string' },
              asOfDate: { type: 'string', format: 'date' },
              // Assets
              currentAssets: { type: 'number' },
              cash: { type: 'number' },
              accountsReceivable: { type: 'number' },
              inventory: { type: 'number' },
              nonCurrentAssets: { type: 'number' },
              propertyPlantEquipment: { type: 'number' },
              totalAssets: { type: 'number' },
              // Liabilities
              currentLiabilities: { type: 'number' },
              accountsPayable: { type: 'number' },
              shortTermDebt: { type: 'number' },
              nonCurrentLiabilities: { type: 'number' },
              longTermDebt: { type: 'number' },
              totalLiabilities: { type: 'number' },
              // Equity
              shareCapital: { type: 'number' },
              retainedEarnings: { type: 'number' },
              totalEquity: { type: 'number' },
              currency: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    // ========== CASH FLOW VC ==========
    {
      name: 'CashFlowVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'CashFlowVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['statementId', 'periodStart', 'periodEnd', 'netCashFlow', 'currency', 'generatedAt'],
            properties: {
              statementId: { type: 'string' },
              organizationName: { type: 'string' },
              periodStart: { type: 'string', format: 'date' },
              periodEnd: { type: 'string', format: 'date' },
              // Operating Activities
              cashFromOperations: { type: 'number' },
              netIncome: { type: 'number' },
              depreciation: { type: 'number' },
              changesInWorkingCapital: { type: 'number' },
              // Investing Activities
              cashFromInvesting: { type: 'number' },
              capitalExpenditures: { type: 'number' },
              assetSales: { type: 'number' },
              // Financing Activities
              cashFromFinancing: { type: 'number' },
              debtProceeds: { type: 'number' },
              debtRepayments: { type: 'number' },
              dividendsPaid: { type: 'number' },
              // Summary
              netCashFlow: { type: 'number' },
              beginningCash: { type: 'number' },
              endingCash: { type: 'number' },
              currency: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' },
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
    // ========== INVENTORY VC SCHEMAS (Phase 1 Extension) ==========
    {
      name: 'GoodsReceivedVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'GoodsReceivedVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['eventId', 'lotId', 'catalogItemId', 'quantity', 'eventHash', 'receivedAt'],
            properties: {
              eventId: { type: 'string' },
              lotId: { type: 'string' },
              catalogItemId: { type: 'string' },
              quantity: { type: 'number' },
              unitCost: { type: 'number' },
              currency: { type: 'string' },
              supplierId: { type: 'string' },
              supplierInvoiceRef: { type: 'string' },
              locationId: { type: 'string' },
              lotNumber: { type: 'string' },
              serialNumber: { type: 'string' },
              barcode: { type: 'string' },
              eventHash: { type: 'string' },
              prevEventHash: { type: 'string' },
              sequenceNumber: { type: 'number' },
              receivedAt: { type: 'string', format: 'date-time' }
            },
          },
        },
      },
    },
    {
      name: 'SaleFulfillmentVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'SaleFulfillmentVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['receiptId', 'fulfillments', 'eventHashes', 'fulfilledAt'],
            properties: {
              receiptId: { type: 'string' },
              transactionId: { type: 'string' },
              fulfillments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    lotId: { type: 'string' },
                    lotNumber: { type: 'string' },
                    serialNumber: { type: 'string' },
                    quantity: { type: 'number' },
                    unitCost: { type: 'number' },
                    eventHash: { type: 'string' }
                  }
                }
              },
              totalItems: { type: 'number' },
              eventHashes: { type: 'array', items: { type: 'string' } },
              fulfilledAt: { type: 'string', format: 'date-time' }
            },
          },
        },
      },
    },
    {
      name: 'StockTransferVC',
      version: '1.0.0',
      jsonSchema: {
        $id: 'StockTransferVC-1.0.0',
        type: 'object',
        required: ['credentialSubject'],
        properties: {
          credentialSubject: {
            type: 'object',
            required: ['transferId', 'fromLocationId', 'toLocationId', 'catalogItemId', 'quantity', 'eventHash'],
            properties: {
              transferId: { type: 'string' },
              lotId: { type: 'string' },
              catalogItemId: { type: 'string' },
              fromLocationId: { type: 'string' },
              toLocationId: { type: 'string' },
              quantity: { type: 'number' },
              eventHash: { type: 'string' },
              prevEventHash: { type: 'string' },
              reason: { type: 'string' },
              transferredAt: { type: 'string', format: 'date-time' }
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
      name: 'PayslipVC',
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
    // ========== PAYROLL RUN VC DEFINITION ==========
    {
      name: 'PayrollRunVC',
      version: '1.0.0',
      schemaName: 'PayrollRunVC',
      credentialType: ['VerifiableCredential', 'PayrollRunVC'],
      claimsTemplate: {
        credentialSubject: {
          runId: 'RUN-2026-01-sample',
          period: '2026-01',
          totalGross: 50000.00,
          totalNet: 42500.00,
          totalDeductions: 7500.00,
          totalNssa: 2250.00,
          totalPaye: 5000.00,
          totalAidsLevy: 250.00,
          employeeCount: 10,
          currency: 'USD',
          employer: 'Demo Corp',
          processedAt: new Date().toISOString(),
          payslipVcIds: [],
        },
      },
    },
    // ========== TAX COMPLIANCE VC DEFINITION ==========
    {
      name: 'TaxComplianceVC',
      version: '1.0.0',
      schemaName: 'TaxComplianceVC',
      credentialType: ['VerifiableCredential', 'TaxComplianceVC'],
      claimsTemplate: {
        credentialSubject: {
          complianceId: 'TAX-2026-01-NSSA',
          taxType: 'NSSA',
          period: '2026-01',
          amount: 2250.00,
          currency: 'USD',
          filingDate: new Date().toISOString().slice(0, 10),
          referenceNumber: 'NSSA-REF-001',
          status: 'pending',
          employeeCount: 10,
        },
      },
    },
    // ========== LEAVE APPROVAL VC DEFINITION ==========
    {
      name: 'LeaveApprovalVC',
      version: '1.0.0',
      schemaName: 'LeaveApprovalVC',
      credentialType: ['VerifiableCredential', 'LeaveApprovalVC'],
      claimsTemplate: {
        credentialSubject: {
          leaveRequestId: 'LR-001',
          employeeId: 'EMP-001',
          leaveType: 'annual',
          startDate: '2026-03-01',
          endDate: '2026-03-05',
          daysCount: 5,
          reason: 'Family vacation',
          approvedBy: 'MGR-001',
          approvedAt: new Date().toISOString(),
        },
      },
    },
    // ========== EXPENSE APPROVAL VC DEFINITION ==========
    {
      name: 'ExpenseApprovalVC',
      version: '1.0.0',
      schemaName: 'ExpenseApprovalVC',
      credentialType: ['VerifiableCredential', 'ExpenseApprovalVC'],
      claimsTemplate: {
        credentialSubject: {
          expenseClaimId: 'EXP-001',
          employeeId: 'EMP-001',
          description: 'Client meeting lunch',
          amount: 45.00,
          currency: 'USD',
          category: 'meals',
          approvedBy: 'MGR-001',
          approvedAt: new Date().toISOString(),
        },
      },
    },
    // ========== INCOME STATEMENT VC DEFINITION ==========
    {
      name: 'IncomeStatementVC',
      version: '1.0.0',
      schemaName: 'IncomeStatementVC',
      credentialType: ['VerifiableCredential', 'IncomeStatementVC'],
      claimsTemplate: {
        credentialSubject: {
          statementId: 'IS-2026-Q1',
          organizationName: 'Demo Corp',
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
          revenue: 500000.00,
          costOfGoodsSold: 200000.00,
          grossProfit: 300000.00,
          operatingExpenses: 100000.00,
          operatingIncome: 200000.00,
          otherIncome: 5000.00,
          otherExpenses: 2000.00,
          expenses: 302000.00,
          netIncome: 203000.00,
          currency: 'USD',
          breakdown: {
            sales: 500000.00,
            payroll: 80000.00,
            operations: 20000.00,
          },
          generatedAt: new Date().toISOString(),
        },
      },
    },
    // ========== BALANCE SHEET VC DEFINITION ==========
    {
      name: 'BalanceSheetVC',
      version: '1.0.0',
      schemaName: 'BalanceSheetVC',
      credentialType: ['VerifiableCredential', 'BalanceSheetVC'],
      claimsTemplate: {
        credentialSubject: {
          statementId: 'BS-2026-Q1',
          organizationName: 'Demo Corp',
          asOfDate: '2026-03-31',
          currentAssets: 250000.00,
          cash: 100000.00,
          accountsReceivable: 100000.00,
          inventory: 50000.00,
          nonCurrentAssets: 500000.00,
          propertyPlantEquipment: 500000.00,
          totalAssets: 750000.00,
          currentLiabilities: 100000.00,
          accountsPayable: 75000.00,
          shortTermDebt: 25000.00,
          nonCurrentLiabilities: 200000.00,
          longTermDebt: 200000.00,
          totalLiabilities: 300000.00,
          shareCapital: 200000.00,
          retainedEarnings: 250000.00,
          totalEquity: 450000.00,
          currency: 'USD',
          generatedAt: new Date().toISOString(),
        },
      },
    },
    // ========== CASH FLOW VC DEFINITION ==========
    {
      name: 'CashFlowVC',
      version: '1.0.0',
      schemaName: 'CashFlowVC',
      credentialType: ['VerifiableCredential', 'CashFlowVC'],
      claimsTemplate: {
        credentialSubject: {
          statementId: 'CF-2026-Q1',
          organizationName: 'Demo Corp',
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
          cashFromOperations: 180000.00,
          netIncome: 203000.00,
          depreciation: 15000.00,
          changesInWorkingCapital: -38000.00,
          cashFromInvesting: -50000.00,
          capitalExpenditures: -50000.00,
          assetSales: 0,
          cashFromFinancing: -20000.00,
          debtProceeds: 0,
          debtRepayments: -10000.00,
          dividendsPaid: -10000.00,
          netCashFlow: 110000.00,
          beginningCash: 90000.00,
          endingCash: 200000.00,
          currency: 'USD',
          generatedAt: new Date().toISOString(),
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
    // ========== INVENTORY CREDENTIAL DEFINITIONS (Phase 1 Extension) ==========
    {
      name: 'GoodsReceivedDef',
      version: '1.0.0',
      schemaName: 'GoodsReceivedVC',
      credentialType: ['VerifiableCredential', 'GoodsReceivedVC'],
      claimsTemplate: {
        credentialSubject: {
          eventId: 'EVT-sample',
          lotId: 'LOT-sample',
          catalogItemId: 'ITM-sample',
          quantity: 100,
          unitCost: 10.00,
          currency: 'USD',
          supplierId: 'supplier-001',
          supplierInvoiceRef: 'INV-001',
          locationId: 'LOC-001',
          eventHash: 'sha256-hash',
          sequenceNumber: 1,
          receivedAt: new Date().toISOString()
        },
      },
    },
    {
      name: 'SaleFulfillmentDef',
      version: '1.0.0',
      schemaName: 'SaleFulfillmentVC',
      credentialType: ['VerifiableCredential', 'SaleFulfillmentVC'],
      claimsTemplate: {
        credentialSubject: {
          receiptId: 'RCP-sample',
          transactionId: 'TX-sample',
          fulfillments: [
            { lotId: 'LOT-001', quantity: 5, eventHash: 'sha256-hash' }
          ],
          totalItems: 5,
          eventHashes: ['sha256-hash'],
          fulfilledAt: new Date().toISOString()
        },
      },
    },
    {
      name: 'StockTransferDef',
      version: '1.0.0',
      schemaName: 'StockTransferVC',
      credentialType: ['VerifiableCredential', 'StockTransferVC'],
      claimsTemplate: {
        credentialSubject: {
          transferId: 'TRF-sample',
          lotId: 'LOT-001',
          catalogItemId: 'ITM-001',
          fromLocationId: 'LOC-001',
          toLocationId: 'LOC-002',
          quantity: 50,
          eventHash: 'sha256-hash',
          reason: 'Stock redistribution',
          transferredAt: new Date().toISOString()
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

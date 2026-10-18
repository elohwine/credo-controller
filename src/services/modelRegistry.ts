import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'

import { DELEGATION_JSON_SCHEMA, DELEGATION_VC_TYPE } from '../config/credentials/DelegationVC'
import { EMPLOYEE_JSON_SCHEMA, EMPLOYEE_VC_TYPE } from '../config/credentials/EmployeeVC'
import { JOB_ASSIGNMENT_JSON_SCHEMA, JOB_ASSIGNMENT_VC_TYPE } from '../config/credentials/JobAssignmentVC'
import { ORG_WORKFLOW_ACTOR_JSON_SCHEMA, ORG_WORKFLOW_ACTOR_VC_TYPE } from '../config/credentials/OrgWorkflowActorVC'
import {
  PLATFORM_IDENTITY_VC_TYPE,
  PLATFORM_IDENTITY_CREDENTIAL_DEFINITION,
} from '../config/credentials/PlatformIdentityVC'

interface SeedParams {
  tenantId: string
  issuerDid: string
}

/**
 * Seed platform-level credential definitions for root agent (SSI auth, etc.)
 * Called once at server startup.
 */
export async function seedPlatformCredentialDefinitions(rootIssuerDid: string): Promise<void> {
  const { credentialDefinitionStore } = require('../utils/credentialDefinitionStore')
  const { schemaStore } = require('../utils/schemaStore')

  const ensureGlobalSchema = (name: string, version: string, jsonSchema: Record<string, any>): string => {
    const existing = schemaStore.find(name, version, 'global')
    if (existing) return existing.schemaId
    const registered: any = schemaStore.register({ name, version, jsonSchema })
    if ('error' in registered) {
      const afterConflict = schemaStore.find(name, version, 'global')
      if (afterConflict) return afterConflict.schemaId
      throw new Error(`Platform schema registration failed for ${name}: ${registered.error}`)
    }
    return registered.schemaId
  }

  const ensureGlobalDefinition = (
    name: string,
    schemaId: string,
    credentialType: string[],
    claimsTemplate: Record<string, unknown>,
  ): void => {
    if (credentialDefinitionStore.get(name)) return
    const res: any = credentialDefinitionStore.register({
      name,
      version: '1.0.0',
      schemaId,
      issuerDid: rootIssuerDid,
      credentialType,
      claimsTemplate,
      format: 'jwt_vc_json',
      // Global - no tenantId means root agent scope
    })
    if (res && 'error' in res && !String(res.error).toLowerCase().includes('already exists')) {
      throw new Error(`Platform credential definition registration failed for ${name}: ${res.error}`)
    }
    // eslint-disable-next-line no-console
    console.log(`[ModelRegistry] Seeded ${name} definition for root agent`)
  }

  // --- PlatformIdentityVC (SSI auth identity credential) ---
  const platformIdentitySchemaId = ensureGlobalSchema(PLATFORM_IDENTITY_VC_TYPE, '1.0.0', {
    $id: 'PlatformIdentityCredential-1.0.0',
    type: 'object',
    required: ['credentialSubject'],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['phone', 'registeredAt', 'platformTenantId'],
        properties: {
          phone: { type: 'string', description: 'User phone number (E.164 format)' },
          email: { type: 'string', description: 'Optional email address' },
          displayName: { type: 'string', description: 'User display name' },
          registeredAt: { type: 'string', format: 'date-time' },
          platformTenantId: { type: 'string', description: 'Linked tenant ID on platform' },
          platformName: { type: 'string', description: 'Platform issuer name' },
          verificationLevel: { type: 'string', enum: ['unverified', 'phone_verified', 'kyc_verified'] },
        },
      },
    },
  })

  ensureGlobalDefinition(
    PLATFORM_IDENTITY_VC_TYPE,
    platformIdentitySchemaId,
    PLATFORM_IDENTITY_CREDENTIAL_DEFINITION.credentialType,
    {
      credentialSubject: {
        phone: '+263771234567',
        displayName: 'Platform User',
        registeredAt: new Date().toISOString(),
        platformTenantId: 'tenant-id',
        platformName: 'IdenEx Credentis',
        verificationLevel: 'phone_verified',
      },
    },
  )

  // --- OrgWorkflowActorCredential (actor VC offered to configured workflow actors) ---
  const actorSchemaId = ensureGlobalSchema(ORG_WORKFLOW_ACTOR_VC_TYPE, '1.0.0', ORG_WORKFLOW_ACTOR_JSON_SCHEMA)

  ensureGlobalDefinition(
    ORG_WORKFLOW_ACTOR_VC_TYPE,
    actorSchemaId,
    ['VerifiableCredential', ORG_WORKFLOW_ACTOR_VC_TYPE],
    {
      credentialSubject: {
        orgTenantId: 'org-tenant-id',
        orgName: 'Organization',
        userId: 'user-id',
        memberRole: 'approver',
        role: 'approver',
        workflowType: 'internal_requisitions',
        stageActions: ['approve_requisition'],
        assignmentMode: 'configured_user',
        assignedAt: new Date().toISOString(),
        issuedAt: new Date().toISOString(),
        platformName: 'IdenEx Credentis',
        fingerprint: 'sha256',
      },
    },
  )

  const employeeSchemaId = ensureGlobalSchema(EMPLOYEE_VC_TYPE, '1.0.0', EMPLOYEE_JSON_SCHEMA)
  ensureGlobalDefinition(EMPLOYEE_VC_TYPE, employeeSchemaId, ['VerifiableCredential', EMPLOYEE_VC_TYPE], {
    credentialSubject: {
      orgTenantId: 'org-tenant-id',
      orgName: 'Organization',
      userId: 'user-id',
      memberRole: 'employee',
      role: 'employee',
      employmentStatus: 'active',
      source: 'membership',
      issuedAt: new Date().toISOString(),
      platformName: 'IdenEx Credentis',
      fingerprint: 'sha256',
    },
  })

  const delegationSchemaId = ensureGlobalSchema(DELEGATION_VC_TYPE, '1.0.0', DELEGATION_JSON_SCHEMA)
  ensureGlobalDefinition(DELEGATION_VC_TYPE, delegationSchemaId, ['VerifiableCredential', DELEGATION_VC_TYPE], {
    credentialSubject: {
      orgTenantId: 'org-tenant-id',
      orgName: 'Organization',
      delegationId: 'delegation-id',
      delegatorUserId: 'user-id',
      delegateUserId: 'user-id',
      permissions: ['request.approve'],
      validFrom: new Date().toISOString(),
      issuedAt: new Date().toISOString(),
      platformName: 'IdenEx Credentis',
      fingerprint: 'sha256',
    },
  })
}

// Simple internal seeding using in-memory stores directly (avoids HTTP roundtrip during provisioning)
// For production replace with durable persistence or remove automatic seeding.
export async function registerDefaultModelsForTenant({ tenantId, issuerDid }: SeedParams) {
  // Resolve tenant agent from container root agent modules
  const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)
  // eslint-disable-next-line no-console
  console.log(`[ModelRegistry] Starting registration for tenant ${tenantId}`)
  await (baseAgent.modules as any).tenants.withTenantAgent({ tenantId }, async (tenantAgent: any) => {
    // eslint-disable-next-line no-console
    console.log(`[ModelRegistry] Acquired tenant agent for ${tenantId}`)
    const { schemaStore } = await import('../utils/schemaStore')
    const { credentialDefinitionStore } = await import('../utils/credentialDefinitionStore')

    const isDuplicateError = (message?: string) =>
      typeof message === 'string' && message.toLowerCase().includes('already exists')

    const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>) => {
      const existing = schemaStore.find(name, version, tenantId)
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`[ModelRegistry] Schema ${name}@${version} already exists: ${existing.schemaId}`)
        return existing.schemaId
      }
      const registered: any = schemaStore.register({ name, version, jsonSchema, tenantId })
      if ('error' in registered) {
        // Handle duplicate registrations caused by retries/races during local dev provisioning.
        if (isDuplicateError(registered.error)) {
          const existingAfterConflict = schemaStore.find(name, version, tenantId)
          if (existingAfterConflict) {
            // eslint-disable-next-line no-console
            console.log(
              `[ModelRegistry] Reusing existing schema after duplicate conflict ${name}@${version}: ${existingAfterConflict.schemaId}`,
            )
            return existingAfterConflict.schemaId
          }
        }

        throw new Error(`Schema registration failed: ${registered.error}`)
      }
      // eslint-disable-next-line no-console
      console.log(`[ModelRegistry] Registered schema ${name}@${version}: ${registered.schemaId}`)
      return registered.schemaId
    }
    const paymentSchemaId = ensureSchema('PaymentReceipt', '1.0.0', {
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
            merchantName: { type: 'string' },
            merchantDid: { type: 'string' },
          },
        },
      },
    })

    const genericIdSchemaId = ensureSchema('GenericIDCredential', '1.0.0', {
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
    })

    const registerDef = (
      name: string,
      version: string,
      schemaId: string,
      credentialType: string[],
      claimsTemplate: any,
      format: string = 'jwt_vc',
    ) => {
      const existing = credentialDefinitionStore
        .list(tenantId)
        .find((d) => d.name === name && d.version === version && d.schemaId === schemaId && d.issuerDid === issuerDid)
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`[ModelRegistry] CredDef ${name} already exists: ${existing.credentialDefinitionId}`)
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
      if ('error' in res) {
        if (isDuplicateError(res.error)) {
          const existingAfterConflict = credentialDefinitionStore
            .list(tenantId)
            .find(
              (d) => d.name === name && d.version === version && d.schemaId === schemaId && d.issuerDid === issuerDid,
            )

          if (existingAfterConflict) {
            // eslint-disable-next-line no-console
            console.log(
              `[ModelRegistry] Reusing existing CredDef after duplicate conflict ${name}: ${existingAfterConflict.credentialDefinitionId}`,
            )
            return existingAfterConflict.credentialDefinitionId
          }
        }

        throw new Error(`CredDef registration failed: ${res.error}`)
      }
      // eslint-disable-next-line no-console
      console.log(`[ModelRegistry] Registered CredDef ${name} with ID ${res.credentialDefinitionId}`)
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
            merchantDid: { type: 'string' },
          },
        },
      },
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
            dueDate: { type: 'string', format: 'date-time' },
          },
        },
      },
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
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    })

    const schoolFeeReceiptSchemaId = ensureSchema('SchoolFeeReceiptVC', '1.0.0', {
      $id: 'SchoolFeeReceiptVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['receiptId', 'amount', 'currency', 'paymentRef', 'paidAt'],
          properties: {
            receiptId: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            paymentRef: { type: 'string' },
            paidAt: { type: 'string', format: 'date-time' },
            studentId: { type: 'string' },
            studentName: { type: 'string' },
            term: { type: 'string' },
            feeType: { type: 'string' },
            schoolName: { type: 'string' },
          },
        },
      },
    })

    const catalogItemSchemaId = ensureSchema('CatalogItemVC', '1.0.0', {
      $id: 'CatalogItemVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['itemId', 'title', 'price', 'currency', 'merchantId'],
          properties: {
            itemId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            price: { type: 'number' },
            currency: { type: 'string' },
            sku: { type: 'string' },
            merchantId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
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

    registerDef('CartSnapshotVC', '1.0.0', cartSchemaId, ['VerifiableCredential', 'CartSnapshotVC'], {}, 'jwt_vc_json')

    registerDef('InvoiceVC', '1.0.0', invoiceSchemaId, ['VerifiableCredential', 'InvoiceVC'], {}, 'jwt_vc_json')

    registerDef('ReceiptVC', '1.0.0', receiptSchemaId, ['VerifiableCredential', 'ReceiptVC'], {}, 'jwt_vc_json')

    registerDef(
      'SchoolFeeReceiptVC',
      '1.0.0',
      schoolFeeReceiptSchemaId,
      ['VerifiableCredential', 'SchoolFeeReceiptVC'],
      {},
      'jwt_vc_json',
    )

    registerDef(
      'CatalogItemVC',
      '1.0.0',
      catalogItemSchemaId,
      ['VerifiableCredential', 'CatalogItemVC'],
      {},
      'jwt_vc_json',
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
          encounters: [{ date: '2025-01-01', type: 'Consultation', notes: 'Routine check' }],
        },
      },
      'jwt_vc_json',
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
      'jwt_vc_json',
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
      'jwt_vc_json',
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
      'jwt_vc_json',
    )

    // PaymentReceiptCredential - alias for EcoCash webhook compatibility
    registerDef(
      'PaymentReceiptCredential',
      '1.0.0',
      paymentSchemaId,
      ['VerifiableCredential', 'PaymentReceiptCredential'],
      {
        credentialSubject: {
          receiptId: 'RCP-SEED-0001',
          transactionId: 'TX-SEED-0001',
          amount: '42.00',
          currency: 'USD',
          paymentMethod: 'EcoCash',
          status: 'paid',
          timestamp: new Date().toISOString(),
        },
      },
      'jwt_vc_json',
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
      'jwt_vc_json',
    )

    // --- HR / Employment VCs ---

    const employmentContractSchemaId = ensureSchema('EmploymentContractVC', '1.0.0', {
      $id: 'EmploymentContractVC-1.0.0',
      type: 'object',
      required: ['credentialSubject'],
      properties: {
        credentialSubject: {
          type: 'object',
          required: ['employeeId', 'name', 'employer', 'startDate'],
          properties: {
            employeeId: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            department: { type: 'string' },
            employer: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            salary: { type: 'string' },
            contractType: { type: 'string' },
          },
        },
      },
    })

    registerDef(
      'EmploymentContractVC',
      '1.0.0',
      employmentContractSchemaId,
      ['VerifiableCredential', 'EmploymentContractVC'],
      {
        credentialSubject: {
          employeeId: 'EMP-001',
          name: 'John Doe',
          role: 'Software Engineer',
          department: 'Engineering',
          employer: 'Credo Demo Corp',
          startDate: new Date().toISOString(),
          contractType: 'Full-time',
        },
      },
      'jwt_vc_json',
    )

    const employeeSchemaId = ensureSchema(EMPLOYEE_VC_TYPE, '1.0.0', EMPLOYEE_JSON_SCHEMA)
    registerDef(
      EMPLOYEE_VC_TYPE,
      '1.0.0',
      employeeSchemaId,
      ['VerifiableCredential', EMPLOYEE_VC_TYPE],
      {},
      'jwt_vc_json',
    )

    const delegationSchemaId = ensureSchema(DELEGATION_VC_TYPE, '1.0.0', DELEGATION_JSON_SCHEMA)
    registerDef(
      DELEGATION_VC_TYPE,
      '1.0.0',
      delegationSchemaId,
      ['VerifiableCredential', DELEGATION_VC_TYPE],
      {},
      'jwt_vc_json',
    )

    const actorSchemaId = ensureSchema(ORG_WORKFLOW_ACTOR_VC_TYPE, '1.0.0', ORG_WORKFLOW_ACTOR_JSON_SCHEMA)
    registerDef(
      ORG_WORKFLOW_ACTOR_VC_TYPE,
      '1.0.0',
      actorSchemaId,
      ['VerifiableCredential', ORG_WORKFLOW_ACTOR_VC_TYPE],
      {},
      'jwt_vc_json',
    )

    await ensureRequestRecordModels(tenantId, issuerDid)
  })
}

const LEAVE_APPROVAL_SCHEMA = {
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
        employeeName: { type: 'string' },
        orgName: { type: 'string' },
        leaveType: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        daysCount: { type: 'number' },
        cover: { type: 'string' },
        note: { type: 'string' },
        approvedBy: { type: 'string' },
        approvedAt: { type: 'string' },
      },
    },
  },
}

const EXPENSE_APPROVAL_SCHEMA = {
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
        employeeName: { type: 'string' },
        orgName: { type: 'string' },
        description: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        category: { type: 'string' },
        approvedBy: { type: 'string' },
        approvedAt: { type: 'string' },
      },
    },
  },
}

/** A record whose claims the workflow template decides; any claim set is accepted. */
function openRecordSchema(name: string): Record<string, any> {
  return {
    $id: `${name}-1.0.0`,
    type: 'object',
    required: ['credentialSubject'],
    properties: { credentialSubject: { type: 'object', additionalProperties: true } },
  }
}

/**
 * Records a workflow step can hand a person. Each is registered on the organisation the first
 * time it is needed, so the holder keeps a card of that type (a "Job card", not a "Generic ID").
 */
export const WORKFLOW_RECORD_SCHEMAS: Record<string, Record<string, any>> = {
  [JOB_ASSIGNMENT_VC_TYPE]: JOB_ASSIGNMENT_JSON_SCHEMA,
  [EMPLOYEE_VC_TYPE]: EMPLOYEE_JSON_SCHEMA,
  [DELEGATION_VC_TYPE]: DELEGATION_JSON_SCHEMA,
  [ORG_WORKFLOW_ACTOR_VC_TYPE]: ORG_WORKFLOW_ACTOR_JSON_SCHEMA,
  LeaveApprovalVC: LEAVE_APPROVAL_SCHEMA,
  ExpenseApprovalVC: EXPENSE_APPROVAL_SCHEMA,
  RequisitionVC: openRecordSchema('RequisitionVC'),
  RequisitionAcknowledgementVC: openRecordSchema('RequisitionAcknowledgementVC'),
  SiteInspectionVC: openRecordSchema('SiteInspectionVC'),
  ExecutionAckVC: openRecordSchema('ExecutionAckVC'),
  QuoteVC: openRecordSchema('QuoteVC'),
  PaymentReceiptVC: openRecordSchema('PaymentReceiptVC'),
  DeliveryProofVC: openRecordSchema('DeliveryProofVC'),
  PayslipVC: openRecordSchema('PayslipVC'),
}

/**
 * Leave and expense records an organisation issues when it approves a request.
 * Existing organisations were provisioned before these models existed, so approval
 * registers them on that organisation and adds them to the issuer the offer uses.
 */
export async function ensureRequestRecordModels(tenantId: string, issuerDid: string): Promise<void> {
  await ensureRecordModels(tenantId, issuerDid, ['LeaveApprovalVC', 'ExpenseApprovalVC'])
}

/**
 * Register the given record types on an organisation and advertise them on the issuer, so an
 * offer for that type is issued as that type. Unknown types are ignored (the caller falls back).
 * Returns the types that are now registered.
 */
export async function ensureRecordModels(tenantId: string, issuerDid: string, types: string[]): Promise<string[]> {
  const known = types.filter((type) => WORKFLOW_RECORD_SCHEMAS[type])
  if (known.length === 0) return []
  await registerRecordModels(
    tenantId,
    issuerDid,
    known.map((name) => ({ name, jsonSchema: WORKFLOW_RECORD_SCHEMAS[name] })),
  )
  return known
}

export interface RecordModelInput {
  name: string
  jsonSchema: Record<string, any>
  /** Schema version; the credential definition and issuer configuration stay one per name. */
  schemaVersion?: string
}

/**
 * Register record models (schema, credential definition, issuer configuration) on an
 * organisation. Returns the schema id registered for each model name.
 */
export async function registerRecordModels(
  tenantId: string,
  issuerDid: string,
  models: RecordModelInput[],
): Promise<Record<string, string>> {
  if (models.length === 0) return {}
  const { schemaStore } = await import('../utils/schemaStore')
  const { credentialDefinitionStore, issuerConfigurationsForDefinition } = await import(
    '../utils/credentialDefinitionStore'
  )

  const ensureSchema = (name: string, version: string, jsonSchema: Record<string, any>): string => {
    const existing = schemaStore.find(name, version, tenantId)
    if (existing) return existing.schemaId
    const registered: any = schemaStore.register({ name, version, jsonSchema, tenantId })
    if ('error' in registered) {
      const after = schemaStore.find(name, version, tenantId)
      if (after) return after.schemaId
      throw new Error(`Schema registration failed for ${name}: ${registered.error}`)
    }
    return registered.schemaId
  }

  const ensureDef = (name: string, schemaId: string) => {
    const existing = credentialDefinitionStore
      .list(tenantId)
      .find((def) => def.name === name && def.version === '1.0.0' && def.issuerDid === issuerDid)
    if (existing) return existing
    const registered: any = credentialDefinitionStore.register({
      name,
      version: '1.0.0',
      schemaId,
      issuerDid,
      tenantId,
      credentialType: ['VerifiableCredential', name],
      claimsTemplate: {},
      format: 'jwt_vc_json',
    })
    if (registered && 'error' in registered) {
      const after = credentialDefinitionStore
        .list(tenantId)
        .find((def) => def.name === name && def.issuerDid === issuerDid)
      if (after) return after
      throw new Error(`Credential definition registration failed for ${name}: ${registered.error}`)
    }
    return registered
  }

  const schemaIds: Record<string, string> = {}
  const defs = models
    .map((model) => {
      const schemaId = ensureSchema(model.name, model.schemaVersion || '1.0.0', model.jsonSchema)
      schemaIds[model.name] = schemaId
      return ensureDef(model.name, schemaId)
    })
    .filter(Boolean)

  const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)
  const issuerModule = (baseAgent as any).openid4vc?.issuer || (baseAgent.modules as any)?.openId4VcIssuer
  if (!issuerModule?.getAllIssuers) return schemaIds
  const issuers = await issuerModule.getAllIssuers()
  const added = Object.fromEntries(
    defs.flatMap((def: any) => issuerConfigurationsForDefinition(def).map((config) => [config.id, config])),
  )
  await Promise.all(
    (issuers || []).map((issuer: any) =>
      issuerModule.updateIssuerMetadata({
        issuerId: issuer.issuerId,
        credentialConfigurationsSupported: { ...(issuer.credentialConfigurationsSupported || {}), ...added },
        display: issuer.display || [],
      }),
    ),
  )
  return schemaIds
}

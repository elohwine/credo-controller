/**
 * One case per request type and workflow template.
 *
 * An unready organization cannot run the flow. The minimum setup the prerequisite
 * registry names makes it ready, including when the saved template is disabled.
 * The stage actor is the person the inbox and proof policy expect. Credentials stay
 * evidence: child request context has no vc, vp, or jwt keys.
 *
 * Doc drift: remodel section 12 still says context_json has no schema. It does,
 * via RequestContextValidator.
 */

import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, expect, test } from '@jest/globals'

import { ORG_WORKFLOW_ACTOR_VC_TYPE } from '../src/config/credentials/OrgWorkflowActorVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../src/config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../src/persistence/WorkflowTemplateRepository'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import {
  resolveAcceptedProofVcTypes,
  type ProofVcActionKey,
} from '../src/services/ProofVcPolicyService'
import { requestHandoffService } from '../src/services/RequestHandoffService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'
import { resolveStageRoute, routeWorkflowStageInbox } from '../src/services/WorkflowStageInboxService'
import { getTemplateById } from '../src/services/workflow/templates'
import type { SectorType, WorkflowTemplateDefinition } from '../src/types/WorkflowTemplate'

import {
  addAuthorityGrant,
  addDepartment,
  addPaymentService,
  addRole,
  addTrustAnchor,
  addMember,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

const ROLES = ['roles']
const AP = ['authorities', 'roles', 'stage_actor:record_payment']
const REQUISITION = [
  'authorities',
  'departments',
  'roles',
  'stage_actor:approve_requisition',
  'stage_actor:release_funds',
]
const FEPT = ['roles']
const HR = ['authorities', 'departments', 'roles']
const PAYSLIP = ['roles']
const COLLECT = ['payment_provider', 'roles']
const COMMERCE = ['payment_provider', 'roles']
const VERIFY = ['roles', 'trusted_issuers']

const CREDENTIAL_MATERIAL = ['vc', 'vp', 'jwt', 'credential', 'presentation']

interface FollowOn {
  /** Status that starts the next request. */
  onStatus: string
  childType: string
  /** Workflow-request catalog (quote, invoice, requisition) rather than a platform request. */
  via: 'platform' | 'workflow'
}

interface MatrixRow {
  /** Failure name: the request type or template. */
  id: string
  /** evaluateTemplate reference. */
  templateRef: string
  /** In-memory template saved with enabled: false. */
  templateId?: string
  /** Blocking prerequisite keys on a freshly seeded organization. */
  blocking: string[]
  /** Request type used for inbox routing and, when it is a platform type, creation. */
  routeType: string
  context?: Record<string, unknown>
  followOn?: FollowOn
  /** Declared output credentials and, for FEPT, the payment-collection handoff inside the template. */
  declareCredentials?: boolean
}

const ROWS: MatrixRow[] = [
  // Finance and procurement
  {
    id: 'finance.payment_request',
    templateRef: 'finance.payment_request',
    blocking: AP,
    routeType: 'finance.payment_request',
    context: { paymentReference: 'PAY-1', payeeRef: 'payee-1' },
  },
  {
    id: 'finance.expense_claim',
    templateRef: 'finance.expense_claim',
    blocking: AP,
    routeType: 'finance.expense_claim',
    context: { receiptRef: 'rcpt-1', categoryCode: 'travel' },
    followOn: { onStatus: 'approved', childType: 'finance.payment_request', via: 'platform' },
  },
  {
    id: 'finance.purchase_order',
    templateRef: 'finance.purchase_order',
    blocking: AP,
    routeType: 'finance.purchase_order',
    context: { supplierRef: 'sup-1', poRef: 'PO-1' },
    followOn: { onStatus: 'approved', childType: 'finance.payment_request', via: 'platform' },
  },
  {
    id: 'procurement.requisition',
    templateRef: 'procurement.requisition',
    blocking: REQUISITION,
    routeType: 'procurement.requisition',
    context: { categoryCode: 'goods', supplierRef: 'sup-1' },
    followOn: { onStatus: 'approved', childType: 'finance.purchase_order', via: 'platform' },
  },
  {
    id: 'procurement.supplier_onboarding',
    templateRef: 'procurement.supplier_onboarding',
    blocking: ROLES,
    routeType: 'procurement.supplier_onboarding',
    context: { supplierRef: 'sup-1', categoryCode: 'goods' },
  },
  {
    id: 'requisition',
    templateRef: 'requisition',
    blocking: REQUISITION,
    routeType: 'requisition',
    // A purchase order only follows when something is bought from a supplier (cash is paid on release).
    context: { paymentMethod: 'supplier', supplierRef: 'BuildMart' },
    followOn: { onStatus: 'approved', childType: 'finance.purchase_order', via: 'workflow' },
  },
  {
    id: 'invoice',
    templateRef: 'invoice',
    blocking: COLLECT,
    routeType: 'invoice',
    followOn: { onStatus: 'approved', childType: 'finance.payment_request', via: 'workflow' },
  },
  {
    id: 'quote',
    templateRef: 'quote',
    blocking: COMMERCE,
    routeType: 'quote',
    followOn: { onStatus: 'approved', childType: 'invoice', via: 'workflow' },
  },

  // Field
  {
    id: 'field.site_access',
    templateRef: 'field.site_access',
    blocking: FEPT,
    routeType: 'field.site_access',
    context: { siteRef: 'site-1', accessPurpose: 'inspection', validFrom: '2026-10-01' },
    followOn: { onStatus: 'approved', childType: 'field.inspection', via: 'platform' },
  },
  {
    id: 'field.inspection',
    templateRef: 'field.inspection',
    blocking: FEPT,
    routeType: 'field.inspection',
    context: { siteRef: 'site-1' },
    followOn: { onStatus: 'completed', childType: 'field.maintenance', via: 'platform' },
  },
  {
    id: 'field.maintenance',
    templateRef: 'field.maintenance',
    blocking: FEPT,
    routeType: 'field.maintenance',
    context: { assetRef: 'asset-1', workOrderRef: 'WO-1' },
  },
  {
    id: 'tpl-fept-field-execution',
    templateRef: 'tpl-fept-field-execution',
    templateId: 'tpl-fept-field-execution',
    blocking: FEPT,
    routeType: 'tpl-fept-field-execution',
    declareCredentials: true,
  },

  // HR
  {
    id: 'hr.onboarding',
    templateRef: 'hr.onboarding',
    blocking: HR,
    routeType: 'hr.onboarding',
    context: { roleRef: 'employee', departmentRef: 'ops', startDate: '2026-10-01' },
  },
  {
    id: 'hr.offboarding',
    templateRef: 'hr.offboarding',
    blocking: HR,
    routeType: 'hr.offboarding',
    context: { roleRef: 'employee', departmentRef: 'ops', endDate: '2026-12-01' },
  },
  {
    id: 'hr.delegation_request',
    templateRef: 'hr.delegation_request',
    blocking: HR,
    routeType: 'hr.delegation_request',
    context: { delegateRef: 'delegate-1', scopeRef: 'finance.approve', validFrom: '2026-10-01' },
  },
  {
    id: 'tpl-employee-onboarding',
    templateRef: 'tpl-employee-onboarding',
    templateId: 'tpl-employee-onboarding',
    blocking: HR,
    routeType: 'tpl-employee-onboarding',
    declareCredentials: true,
  },
  {
    id: 'tpl-payslip-issuance',
    templateRef: 'tpl-payslip-issuance',
    templateId: 'tpl-payslip-issuance',
    blocking: PAYSLIP,
    routeType: 'tpl-payslip-issuance',
    declareCredentials: true,
  },
  {
    id: 'tpl-payroll-reporting',
    templateRef: 'tpl-payroll-reporting',
    templateId: 'tpl-payroll-reporting',
    blocking: PAYSLIP,
    routeType: 'tpl-payroll-reporting',
    declareCredentials: true,
  },

  // Payments
  {
    id: 'tpl-education-fee',
    templateRef: 'tpl-education-fee',
    templateId: 'tpl-education-fee',
    blocking: COLLECT,
    routeType: 'tpl-education-fee',
    declareCredentials: true,
  },
  {
    id: 'tpl-cash-counter',
    templateRef: 'tpl-cash-counter',
    templateId: 'tpl-cash-counter',
    blocking: COLLECT,
    routeType: 'tpl-cash-counter',
    declareCredentials: true,
  },
  {
    id: 'tpl-payment-collection',
    templateRef: 'tpl-payment-collection',
    templateId: 'tpl-payment-collection',
    blocking: COLLECT,
    routeType: 'tpl-payment-collection',
    declareCredentials: true,
  },
  {
    id: 'tpl-ar-collections',
    templateRef: 'tpl-ar-collections',
    templateId: 'tpl-ar-collections',
    blocking: COLLECT,
    routeType: 'tpl-ar-collections',
    declareCredentials: true,
  },
  {
    id: 'tpl-ap-payables',
    templateRef: 'tpl-ap-payables',
    templateId: 'tpl-ap-payables',
    blocking: AP,
    routeType: 'tpl-ap-payables',
    declareCredentials: true,
  },

  // Commerce and issuer
  {
    id: 'tpl-quote-invoice-receipt',
    templateRef: 'tpl-quote-invoice-receipt',
    templateId: 'tpl-quote-invoice-receipt',
    blocking: COMMERCE,
    routeType: 'tpl-quote-invoice-receipt',
    declareCredentials: true,
  },
  {
    id: 'tpl-delivery-escrow',
    templateRef: 'tpl-delivery-escrow',
    templateId: 'tpl-delivery-escrow',
    blocking: COMMERCE,
    routeType: 'tpl-delivery-escrow',
    declareCredentials: true,
  },
  {
    id: 'tpl-receipt-trail',
    templateRef: 'tpl-receipt-trail',
    templateId: 'tpl-receipt-trail',
    blocking: ROLES,
    routeType: 'tpl-receipt-trail',
    declareCredentials: true,
  },
  {
    id: 'tpl-digital-twin',
    templateRef: 'tpl-digital-twin',
    templateId: 'tpl-digital-twin',
    blocking: ROLES,
    routeType: 'tpl-digital-twin',
    declareCredentials: true,
  },
  {
    id: 'tpl-policy-issuance',
    templateRef: 'tpl-policy-issuance',
    templateId: 'tpl-policy-issuance',
    blocking: VERIFY,
    routeType: 'tpl-policy-issuance',
    declareCredentials: true,
  },
  {
    id: 'tpl-credit-eligibility',
    templateRef: 'tpl-credit-eligibility',
    templateId: 'tpl-credit-eligibility',
    blocking: VERIFY,
    routeType: 'tpl-credit-eligibility',
    declareCredentials: true,
  },

  // No dedicated workflow template
  {
    id: 'platform.general',
    templateRef: 'platform.general',
    blocking: ROLES,
    routeType: 'platform.general',
    context: { purposeCode: 'general', referenceCode: 'ref-1' },
  },
  { id: 'vc_issuance', templateRef: 'vc_issuance', blocking: ROLES, routeType: 'vc_issuance' },
  { id: 'service', templateRef: 'service', blocking: ROLES, routeType: 'service' },
  { id: 'payment_link', templateRef: 'payment_link', blocking: ROLES, routeType: 'payment_link' },
]

const templates = new WorkflowTemplateRepository()
let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-ssi-matrix-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `offer-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => {
  databases.cleanup()
})

function sorted(keys: string[]): string[] {
  return [...keys].sort()
}

function saveDisabledTemplate(orgTenantId: string, templateId: string): void {
  const template = getTemplateById(templateId)
  if (!template) throw new Error(`Missing template ${templateId}`)
  const definition: WorkflowTemplateDefinition = {
    id: `${templateId}:${orgTenantId}`,
    tenantId: orgTenantId,
    workflowType: templateId,
    name: template.name,
    sector: 'custom' as SectorType,
    enabled: false,
    version: 1,
    steps: template.steps.map((step) => ({
      action: step.action,
      config: step.config,
      description: step.description,
    })),
    paymentModes: [],
    credentialPolicy: { outputVCs: [...template.outputVCs], autoIssue: true },
    reconciliationPolicy: { mode: 'automatic', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
    prerequisites: template.prerequisites,
  }
  templates.save(definition)
}

function satisfy(org: ReturnType<typeof seedOrganization>, blocking: string[], workflowType: string, actorUserId: string) {
  if (blocking.includes('roles')) addRole(org.organizationId, 'Operator')
  if (blocking.includes('authorities')) addAuthorityGrant(org.organizationId, org.ownerPersonId)
  if (blocking.includes('departments')) addDepartment(org.organizationId, 'Operations')
  if (blocking.includes('payment_provider')) addPaymentService(org.orgTenantId)
  if (blocking.includes('trusted_issuers')) addTrustAnchor(org.organizationId)
  for (const key of blocking) {
    if (!key.startsWith('stage_actor:')) continue
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType,
      stageAction: key.slice('stage_actor:'.length),
      defaultUserId: actorUserId,
    })
  }
}

function proofKeyFor(workflowType: string, stageAction: string): ProofVcActionKey {
  if (stageAction === 'release_funds') return 'requisition_release'
  if (stageAction === 'acknowledge_execution') return 'requisition_ack'
  if (stageAction === 'record_payment') return 'payment_record'
  if (stageAction === 'assign_field_worker') return 'field_assignment'
  if (stageAction === 'approve_onboarding') return 'hr_onboarding'
  if (stageAction === 'issue_payslip') return 'payslip_issue'
  if (stageAction === 'issue_receipt_vc') return 'receipt_issue'
  if (stageAction === 'approve_requisition' && /payable|receivable/.test(workflowType)) return 'ap_workflow_proof'
  return 'requisition_approval'
}

function assertNoCredentialMaterial(context: Record<string, unknown>) {
  for (const key of Object.keys(context)) {
    expect(CREDENTIAL_MATERIAL).not.toContain(key.toLowerCase())
  }
}

function childContext(parentId: string, childType: string): Record<string, unknown> | undefined {
  const row = DatabaseManager.getDatabase()
    .prepare(
      `SELECT context_json AS contextJson FROM requests WHERE parent_request_id = ? AND request_type = ?`,
    )
    .get(parentId, childType) as { contextJson?: string } | undefined
  if (!row?.contextJson) return undefined
  return JSON.parse(row.contextJson) as Record<string, unknown>
}

function poisonContext(requestId: string, base: Record<string, unknown>) {
  DatabaseManager.getDatabase()
    .prepare(`UPDATE requests SET context_json = ? WHERE id = ?`)
    .run(JSON.stringify({ ...base, vc: 'raw-vc', vp: 'raw-vp', jwt: 'raw-jwt' }), requestId)
}

function assertDeclaredCredentials(templateId: string) {
  const template = getTemplateById(templateId)
  expect(template?.outputVCs.length).toBeGreaterThan(0)
  for (const type of template!.outputVCs) {
    expect(type).toMatch(/[A-Za-z]/)
    expect(type).not.toMatch(/^[a-f0-9]{32,}$/)
  }
  const issued = template!.steps
    .filter((step) => step.action === 'credential.issue')
    .map((step) => String(step.config?.type || ''))
    .filter(Boolean)
  for (const type of issued) {
    expect(template!.outputVCs).toContain(type)
  }
  if (templateId === 'tpl-fept-field-execution') {
    const start = template!.steps.find((step) => step.action === 'workflow.start')
    expect(start?.config?.workflow).toBe('tpl-payment-collection')
    expect(template!.outputVCs).toEqual(expect.arrayContaining(['RequisitionVC', 'ReceiptVC', 'ExecutionAckVC']))
  }
}

for (const row of ROWS) {
  test(row.id, () => {
    const org = seedOrganization({ name: row.id })
    const actorUserId = `actor-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: actorUserId,
      role: 'member',
    })

    if (row.templateId) saveDisabledTemplate(org.orgTenantId, row.templateId)

    const unready = workflowReadinessService.evaluateTemplate(org.orgTenantId, row.templateRef)
    expect(unready.ready).toBe(false)
    const identity = unready.items.find((item) => item.key === 'ssi_identity')
    expect(identity?.status).toBe('ready')
    expect(sorted(unready.blocking.map((item) => item.key))).toEqual(sorted(row.blocking))

    satisfy(org, row.blocking, String(unready.workflowType || row.templateRef), actorUserId)

    const ready = workflowReadinessService.evaluateTemplate(org.orgTenantId, row.templateRef)
    expect(ready.blocking.map((item) => item.key)).toEqual([])
    expect(ready.ready).toBe(true)

    if (row.templateId) {
      const saved = DatabaseManager.getDatabase()
        .prepare(`SELECT enabled FROM workflow_templates WHERE id = ?`)
        .get(`${row.templateId}:${org.orgTenantId}`) as { enabled: number }
      expect(saved.enabled).toBe(0)
    }

    const route = resolveStageRoute(row.routeType)
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: route.workflowType,
      stageAction: route.stageAction,
      defaultUserId: actorUserId,
    })
    const actor = orgWorkflowActorService.resolveActor({
      orgTenantId: org.orgTenantId,
      workflowType: route.workflowType,
      stageAction: route.stageAction,
    })
    expect(actor.mode).toBe('configured_user')
    expect(actor.userId).toBe(actorUserId)

    const sourceId = `matrix-${row.id}-${randomUUID()}`
    const routed = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: row.routeType,
      sourceId,
      title: row.id,
      body: `${row.id} is waiting for the stage actor.`,
    })
    expect(routed.recipients.map((recipient) => recipient.walletTenantId)).toContain(`wallet-${actorUserId}`)
    const offers = DatabaseManager.getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count FROM wallet_pending_offers
         WHERE tenant_id = ? AND source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
      )
      .get(`wallet-${actorUserId}`, sourceId) as { count: number }
    expect(offers.count).toBe(1)

    const accepted = resolveAcceptedProofVcTypes(org.orgTenantId, proofKeyFor(route.workflowType, route.stageAction))
    expect(accepted).toContain(PLATFORM_IDENTITY_VC_TYPE)
    expect(accepted).toContain(ORG_WORKFLOW_ACTOR_VC_TYPE)

    if (row.declareCredentials && row.templateId) assertDeclaredCredentials(row.templateId)

    const parentId = randomUUID()
    if (row.followOn?.via === 'platform' || !row.followOn) {
      const created = platformRequestService.create({
        tenantId: org.orgTenantId,
        subjectRef: org.ownerUserId,
        requestType: row.routeType,
        title: row.id,
        targetModule: 'operations',
        context: row.context || {},
      }) as { id: string }
      expect(created.id).toBeTruthy()
      if (row.followOn) {
        poisonContext(created.id, row.context || {})
        const spawned = requestHandoffService.continueFromPlatformRequest({
          tenantId: org.orgTenantId,
          organizationId: org.organizationId,
          requestId: created.id,
          requestType: row.routeType,
          toStatus: row.followOn.onStatus,
        })
        expect(spawned.map((child) => child.requestType)).toContain(row.followOn.childType)
        const context = childContext(created.id, row.followOn.childType)
        expect(context).toBeTruthy()
        assertNoCredentialMaterial(context || {})
      } else {
        const spawned = requestHandoffService.continueFromPlatformRequest({
          tenantId: org.orgTenantId,
          organizationId: org.organizationId,
          requestId: created.id,
          requestType: row.routeType,
          toStatus: 'approved',
        })
        expect(spawned).toEqual([])
        const workflowSpawned = requestHandoffService.continueFromWorkflowRequest({
          orgTenantId: org.orgTenantId,
          requestId: created.id,
          requestType: row.routeType,
        })
        expect(workflowSpawned).toEqual([])
      }
    } else {
      const spawned = requestHandoffService.continueFromWorkflowRequest({
        orgTenantId: org.orgTenantId,
        requestId: parentId,
        requestType: row.routeType,
        title: row.id,
        payload: { ...(row.context || {}), referenceCode: 'ref-1', vc: 'raw-vc', vp: 'raw-vp', jwt: 'raw-jwt' },
      })
      expect(spawned.map((child) => child.requestType)).toContain(row.followOn.childType)
      const context = childContext(parentId, row.followOn.childType)
      expect(context).toBeTruthy()
      assertNoCredentialMaterial(context || {})
    }
  })
}

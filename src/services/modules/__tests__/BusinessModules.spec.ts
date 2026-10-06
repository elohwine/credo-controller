import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { PlatformRequestService } from '../../PlatformRequestService'
import { FieldOpsModule } from '../FieldOpsModule'
import { FinanceModule } from '../FinanceModule'
import { HrModule } from '../HrModule'
import { ProcurementModule } from '../ProcurementModule'

// ── Minimal schema: the modules only need organizations, people, memberships,
// requests, request_items, request_events, and policy_decisions. ──────────────
const MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER, name TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, parent_department_id TEXT,
  name TEXT NOT NULL, code TEXT, status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, subject_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_subject ON people(organization_id, subject_ref);
CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, person_id TEXT NOT NULL,
  department_id TEXT, membership_status TEXT NOT NULL DEFAULT 'active',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP, left_at DATETIME
);
CREATE TABLE IF NOT EXISTS org_memberships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, org_tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_person ON organization_memberships(organization_id, person_id);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS authority_grants (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, person_id TEXT NOT NULL,
  role_id TEXT, authority_type TEXT NOT NULL, scope_json TEXT NOT NULL DEFAULT '{}',
  valid_from DATETIME, valid_until DATETIME, status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
  delegator_person_id TEXT NOT NULL, delegate_person_id TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '{}', valid_from DATETIME NOT NULL, valid_until DATETIME,
  status TEXT NOT NULL DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
  requester_person_id TEXT NOT NULL, department_id TEXT,
  request_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  amount NUMERIC, currency TEXT, priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'draft', workflow_id TEXT, workflow_run_id TEXT,
  target_module TEXT, context_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME, completed_at DATETIME
);
CREATE TABLE IF NOT EXISTS request_items (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, item_type TEXT NOT NULL DEFAULT 'line_item',
  description TEXT NOT NULL, quantity NUMERIC NOT NULL DEFAULT 1, unit_price NUMERIC,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS request_approvals (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, approver_person_id TEXT,
  delegated_from_person_id TEXT, approval_type TEXT NOT NULL DEFAULT 'standard',
  decision TEXT NOT NULL DEFAULT 'pending', comment TEXT, evidence_ref TEXT,
  policy_decision_id TEXT, decided_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS policy_decisions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, principal_person_id TEXT,
  action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT,
  decision TEXT NOT NULL, reason_code TEXT, authority_ref TEXT,
  credential_refs_json TEXT NOT NULL DEFAULT '[]', policy_version TEXT,
  decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS evidence_references (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, request_id TEXT,
  evidence_type TEXT NOT NULL, storage_ref TEXT NOT NULL, digest TEXT,
  media_type TEXT, retention_class TEXT, created_by_person_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME
);
CREATE TABLE IF NOT EXISTS request_tasks (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, task_type TEXT NOT NULL,
  assignee_person_id TEXT, delegation_allowed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', due_at DATETIME, completed_at DATETIME,
  outcome_ref TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, event_type TEXT NOT NULL,
  actor_person_id TEXT, from_status TEXT, to_status TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
  description TEXT, status TEXT NOT NULL DEFAULT 'active',
  effective_from DATETIME, effective_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

function initTestDb(): Database.Database {
  const dbPath = path.join(tmpdir(), `test-modules-${randomUUID()}.db`)
  const db = new Database(dbPath)
  db.exec(MIGRATION_SQL)
  ;(DatabaseManager as any).instance = db
  return db
}

interface TestPrincipal {
  tenantId: string
  subjectRef: string
  organizationId: string
  personId: string
}

function seedPrincipal(db: Database.Database): TestPrincipal {
  const tenantId = `tenant-${randomUUID()}`
  const subjectRef = `sub:${randomUUID()}`
  const organizationId = randomUUID()
  const personId = randomUUID()
  const membershipId = randomUUID()

  db.prepare(`INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, 'Test Corp', 'active')`).run(
    organizationId,
    tenantId,
  )
  db.prepare(`INSERT INTO people (id, organization_id, subject_ref, status) VALUES (?, ?, ?, 'active')`).run(
    personId,
    organizationId,
    subjectRef,
  )
  db.prepare(
    `INSERT INTO organization_memberships (id, organization_id, person_id, membership_status) VALUES (?, ?, ?, 'active')`,
  ).run(membershipId, organizationId, personId)
  db.prepare(
    `INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status) VALUES (?, ?, ?, 'owner', 'active')`,
  ).run(randomUUID(), subjectRef, tenantId)

  return { tenantId, subjectRef, organizationId, personId }
}

// ── FinanceModule ─────────────────────────────────────────────────────────────

describe('FinanceModule', () => {
  let db: Database.Database
  let principal: TestPrincipal
  let module: FinanceModule

  beforeEach(() => {
    db = initTestDb()
    principal = seedPrincipal(db)
    module = new FinanceModule()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  it('creates a payment request with finance context', () => {
    const req = module.createPaymentRequest({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Pay Supplier ABC',
      amount: 5000,
      currency: 'USD',
      paymentReference: 'PAY-001',
      payeeRef: 'supplier:abc',
    })
    expect(req).toBeDefined()
    expect(req?.status).toBe('draft')
    expect(req?.request_type).toBe('finance.payment_request')
    expect(req?.target_module).toBe('finance')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.paymentReference).toBe('PAY-001')
    expect(ctx.payeeRef).toBe('supplier:abc')
  })

  it('creates an expense claim', () => {
    const req = module.createExpenseClaim({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Fuel reimbursement',
      amount: 120,
      currency: 'USD',
      receiptRef: 'receipt:r001',
      categoryCode: 'TRAVEL',
    })
    expect(req?.request_type).toBe('finance.expense_claim')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.receiptRef).toBe('receipt:r001')
    expect(ctx.categoryCode).toBe('TRAVEL')
  })

  it('creates a purchase order with line items', () => {
    const req = module.createPurchaseOrder({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Office supplies PO',
      amount: 800,
      currency: 'USD',
      supplierRef: 'supplier:xyz',
      poRef: 'PO-2026-001',
      lineItems: [
        { description: 'Paper reams', quantity: 10, unitPrice: 50 },
        { description: 'Pens box', quantity: 5, unitPrice: 30 },
      ],
    })
    expect(req?.request_type).toBe('finance.purchase_order')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.poRef).toBe('PO-2026-001')
    // Items stored in request_items table
    const items = db.prepare('SELECT * FROM request_items WHERE request_id = ?').all(req?.id)
    expect(items).toHaveLength(2)
  })

  it('rejects a payment request with a disallowed context key via direct service call', () => {
    const svc = new PlatformRequestService()
    expect(() =>
      svc.create({
        tenantId: principal.tenantId,
        subjectRef: principal.subjectRef,
        requestType: 'finance.payment_request',
        title: 'Bad request',
        context: { paymentReference: 'PAY-002', payeeRef: 'x', privateKey: 'leaked' },
      }),
    ).toThrow(/Invalid request context/)
  })
})

// ── ProcurementModule ─────────────────────────────────────────────────────────

describe('ProcurementModule', () => {
  let db: Database.Database
  let principal: TestPrincipal
  let module: ProcurementModule

  beforeEach(() => {
    db = initTestDb()
    principal = seedPrincipal(db)
    module = new ProcurementModule()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  it('creates a requisition with correct type and context', () => {
    const req = module.createRequisition({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'IT equipment requisition',
      amount: 2500,
      currency: 'USD',
      categoryCode: 'IT_EQUIPMENT',
      supplierRef: 'supplier:dell',
      budgetRef: 'budget:it-2026',
    })
    expect(req?.request_type).toBe('procurement.requisition')
    expect(req?.target_module).toBe('procurement')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.categoryCode).toBe('IT_EQUIPMENT')
    expect(ctx.supplierRef).toBe('supplier:dell')
    expect(ctx.budgetRef).toBe('budget:it-2026')
  })

  it('creates a supplier onboarding request', () => {
    const req = module.createSupplierOnboarding({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'New supplier onboarding: Acme Corp',
      supplierRef: 'supplier:acme',
      categoryCode: 'LOGISTICS',
      countryCode: 'ZW',
      registrationRef: 'reg:zw-12345',
    })
    expect(req?.request_type).toBe('procurement.supplier_onboarding')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.supplierRef).toBe('supplier:acme')
    expect(ctx.countryCode).toBe('ZW')
  })

  it('rejects a requisition with an unknown context key via direct service call', () => {
    const svc = new PlatformRequestService()
    expect(() =>
      svc.create({
        tenantId: principal.tenantId,
        subjectRef: principal.subjectRef,
        requestType: 'procurement.requisition',
        title: 'Bad requisition',
        context: { categoryCode: 'TOOLS', secret: 'leaked' },
      }),
    ).toThrow(/Invalid request context/)
  })
})

// ── HrModule ──────────────────────────────────────────────────────────────────

describe('HrModule', () => {
  let db: Database.Database
  let principal: TestPrincipal
  let module: HrModule

  beforeEach(() => {
    db = initTestDb()
    principal = seedPrincipal(db)
    module = new HrModule()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  it('creates an onboarding request with HR context', () => {
    const req = module.createOnboardingRequest({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Onboard: Jane Doe',
      roleRef: 'role:engineer',
      departmentRef: 'dept:engineering',
      startDate: '2026-10-01',
      managerRef: 'mgr:john.smith',
    })
    expect(req?.request_type).toBe('hr.onboarding')
    expect(req?.target_module).toBe('hr')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.roleRef).toBe('role:engineer')
    expect(ctx.startDate).toBe('2026-10-01')
    expect(ctx.managerRef).toBe('mgr:john.smith')
  })

  it('creates an offboarding request', () => {
    const req = module.createOffboardingRequest({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Offboard: John Smith',
      roleRef: 'role:manager',
      departmentRef: 'dept:sales',
      endDate: '2026-09-30',
      reasonCode: 'RESIGNATION',
    })
    expect(req?.request_type).toBe('hr.offboarding')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.reasonCode).toBe('RESIGNATION')
    expect(ctx.endDate).toBe('2026-09-30')
  })

  it('creates a delegation request', () => {
    const req = module.createDelegationRequest({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Delegation during leave',
      delegateRef: 'sub:deputy',
      scopeRef: 'scope:approvals',
      validFrom: '2026-09-10',
      validUntil: '2026-09-24',
    })
    expect(req?.request_type).toBe('hr.delegation_request')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.delegateRef).toBe('sub:deputy')
    expect(ctx.validUntil).toBe('2026-09-24')
  })

  it('blocks a PII leak via global deny list through direct service call', () => {
    const svc = new PlatformRequestService()
    expect(() =>
      svc.create({
        tenantId: principal.tenantId,
        subjectRef: principal.subjectRef,
        requestType: 'hr.onboarding',
        title: 'Test',
        context: { roleRef: 'role:intern', departmentRef: 'dept:hr', startDate: '2026-10-01', password: 'hunter2' },
      }),
    ).toThrow(/Invalid request context/)
  })
})

// ── FieldOpsModule ────────────────────────────────────────────────────────────

describe('FieldOpsModule', () => {
  let db: Database.Database
  let principal: TestPrincipal
  let module: FieldOpsModule

  beforeEach(() => {
    db = initTestDb()
    principal = seedPrincipal(db)
    module = new FieldOpsModule()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  it('creates a site access request', () => {
    const req = module.requestSiteAccess({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Site access: Harare Plant',
      siteRef: 'site:harare-plant',
      accessPurpose: 'MAINTENANCE',
      validFrom: '2026-09-10T08:00:00Z',
      validUntil: '2026-09-10T17:00:00Z',
      safetyBriefingRef: 'brief:sb-001',
    })
    expect(req?.request_type).toBe('field.site_access')
    expect(req?.target_module).toBe('field_ops')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.siteRef).toBe('site:harare-plant')
    expect(ctx.accessPurpose).toBe('MAINTENANCE')
    expect(ctx.safetyBriefingRef).toBe('brief:sb-001')
  })

  it('schedules an inspection', () => {
    const req = module.scheduleInspection({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'Quarterly fire safety inspection',
      siteRef: 'site:bulawayo-hq',
      checklistRef: 'checklist:fire-2026',
      scheduledAt: '2026-09-15T09:00:00Z',
      inspectionTypeCode: 'FIRE_SAFETY',
    })
    expect(req?.request_type).toBe('field.inspection')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.checklistRef).toBe('checklist:fire-2026')
    expect(ctx.inspectionTypeCode).toBe('FIRE_SAFETY')
  })

  it('creates a maintenance task with parts reference', () => {
    const req = module.createMaintenanceTask({
      tenantId: principal.tenantId,
      subjectRef: principal.subjectRef,
      title: 'HVAC filter replacement',
      assetRef: 'asset:hvac-001',
      workOrderRef: 'WO-2026-042',
      scheduledAt: '2026-09-12T07:00:00Z',
      partsRef: 'parts:filter-20in',
      technicianRef: 'tech:james.mwangi',
    })
    expect(req?.request_type).toBe('field.maintenance')
    const ctx = JSON.parse(req?.context_json ?? '{}')
    expect(ctx.workOrderRef).toBe('WO-2026-042')
    expect(ctx.partsRef).toBe('parts:filter-20in')
    expect(ctx.technicianRef).toBe('tech:james.mwangi')
  })

  it('rejects a site access request with a disallowed context key via direct service call', () => {
    const svc = new PlatformRequestService()
    expect(() =>
      svc.create({
        tenantId: principal.tenantId,
        subjectRef: principal.subjectRef,
        requestType: 'field.site_access',
        title: 'Bad access',
        context: { siteRef: 'site:x', accessPurpose: 'TEST', validFrom: '2026-09-10T08:00:00Z', apiKey: 'leaked' },
      }),
    ).toThrow(/Invalid request context/)
  })
})

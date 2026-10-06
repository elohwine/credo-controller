/**
 * Test fixture for the org-readiness model.
 *
 * Seeds the minimum organizational state (tenant identity, organization row,
 * owner membership, people mapping) and exposes helpers that flip individual
 * readiness prerequisites (roles, members with a role, payment provider, trust
 * anchors) so tests can assert how workflow readiness reacts to configuration.
 *
 * Uses real SQLite databases (persistence + tenants) in a temp directory so the
 * readiness resolver, execution gate and workflow engine run unmodified.
 */

import type { WorkflowTemplate } from '../../src/services/workflow/templates'
import type { WorkflowTemplateDefinition } from '../../src/types/WorkflowTemplate'

import { randomUUID } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { DatabaseManager } from '../../src/persistence/DatabaseManager'
import { initTenantStore, upsertTenant } from '../../src/persistence/TenantRepository'
import { WorkflowTemplateRepository } from '../../src/persistence/WorkflowTemplateRepository'
import { FieldExecutionProofTemplate, PaymentCollectionTemplate } from '../../src/services/workflow/templates'

const workflowTemplateRepository = new WorkflowTemplateRepository()

export interface TestDatabases {
  dir: string
  persistencePath: string
  tenantsPath: string
  cleanup: () => void
}

export function initTestDatabases(prefix = 'credo-readiness-'): TestDatabases {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  const persistencePath = path.join(dir, 'persistence.db')
  const tenantsPath = path.join(dir, 'tenants.db')

  // Migration 097 (workflow runtime compat schema) gives a fresh database every
  // table the readiness resolver, engine and reconciliation ledger touch.
  DatabaseManager.initialize({ path: persistencePath })
  initTenantStore(tenantsPath)

  return {
    dir,
    persistencePath,
    tenantsPath,
    cleanup: () => {
      DatabaseManager.close()
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best effort
      }
    },
  }
}

export interface SeededOrganization {
  orgTenantId: string
  organizationId: string
  ownerUserId: string
  ownerPersonId: string
  name: string
}

export function seedOrganization(
  params: { name?: string; orgTenantId?: string; ownerUserId?: string } = {},
): SeededOrganization {
  const db = DatabaseManager.getDatabase()
  const orgTenantId = params.orgTenantId || `org-${randomUUID()}`
  const ownerUserId = params.ownerUserId || `user-${randomUUID()}`
  const organizationId = randomUUID()
  const name = params.name || 'Test Organization'
  const now = new Date().toISOString()

  upsertTenant({
    id: orgTenantId,
    label: name,
    status: 'active',
    createdAt: now,
    issuerDid: `did:web:issuer.${orgTenantId}`,
    issuerKid: `${orgTenantId}#issuer`,
    verifierDid: `did:web:verifier.${orgTenantId}`,
    verifierKid: `${orgTenantId}#verifier`,
    askarProfile: orgTenantId,
    metadata: {},
    tenantType: 'ORG',
  })

  // Mirror the tenant into the persistence DB `tenants` table (discovery registry FK).
  db.prepare(
    `INSERT OR IGNORE INTO tenants (id, label, status, created_at, issuer_did, issuer_kid, verifier_did, verifier_kid, askar_profile, metadata, tenant_type)
     VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, '{}', 'ORG')`,
  ).run(
    orgTenantId,
    name,
    now,
    `did:web:issuer.${orgTenantId}`,
    `${orgTenantId}#issuer`,
    `did:web:verifier.${orgTenantId}`,
    `${orgTenantId}#verifier`,
    orgTenantId,
  )

  db.prepare(`INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, ?, 'active')`).run(
    organizationId,
    orgTenantId,
    name,
  )

  const ownerPersonId = addMember({ orgTenantId, organizationId, userId: ownerUserId, role: 'owner' })

  return { orgTenantId, organizationId, ownerUserId, ownerPersonId, name }
}

/**
 * Add an active org member with a personal wallet tenant (ssi_users row) so the
 * stage-actor resolver can route to them, plus a people record for authorization.
 */
export function addMember(params: {
  orgTenantId: string
  organizationId: string
  userId?: string
  role: string
}): string {
  const db = DatabaseManager.getDatabase()
  const userId = params.userId || `user-${randomUUID()}`
  const personId = randomUUID()
  const now = new Date().toISOString()

  db.prepare(`INSERT OR IGNORE INTO ssi_users (id, tenant_id, did, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
    userId,
    `wallet-${userId}`,
    `did:key:${userId}`,
    now,
    now,
  )

  db.prepare(
    `INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(randomUUID(), userId, params.orgTenantId, params.role, now, now)

  db.prepare(
    `INSERT INTO people (id, organization_id, subject_ref, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(personId, params.organizationId, userId, now, now)

  return personId
}

export function addRole(organizationId: string, name: string, permissions: string[] = []): string {
  const id = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(`INSERT INTO roles (id, organization_id, name, permissions) VALUES (?, ?, ?, ?)`)
    .run(id, organizationId, name, JSON.stringify(permissions))
  return id
}

export function addDepartment(organizationId: string, name: string): string {
  const id = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(`INSERT INTO departments (id, organization_id, name, status) VALUES (?, ?, ?, 'active')`)
    .run(id, organizationId, name)
  return id
}

export function addAuthorityGrant(
  organizationId: string,
  personId: string,
  authorityType = 'approve',
  scope: Record<string, unknown> = {},
): string {
  const id = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO authority_grants (id, organization_id, person_id, authority_type, scope_json, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
    )
    .run(id, organizationId, personId, authorityType, JSON.stringify(scope))
  return id
}

/** Registers the org in discovery and adds an active payment service (e.g. EcoCash). */
export function addPaymentService(orgTenantId: string, name = 'EcoCash'): string {
  const db = DatabaseManager.getDatabase()
  const registryId = `reg-${orgTenantId}`
  db.prepare(
    `INSERT OR IGNORE INTO organization_registry (id, tenant_id, display_name, category, is_public, verification_status, issuer_did)
     VALUES (?, ?, ?, 'other', 0, 'verified', ?)`,
  ).run(registryId, orgTenantId, name, `did:web:issuer.${orgTenantId}`)

  const serviceId = randomUUID()
  db.prepare(
    `INSERT INTO service_catalog (id, org_id, service_type, name, is_active) VALUES (?, ?, 'payment', ?, 1)`,
  ).run(serviceId, registryId, name)
  return serviceId
}

export function addTrustAnchor(organizationId: string, status: 'active' | 'pending' = 'active'): string {
  const id = randomUUID()
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, status)
       VALUES (?, ?, 'issuer', ?, ?)`,
    )
    .run(id, organizationId, `did:web:anchor.${id}`, status)
  return id
}

function toDefinition(
  template: WorkflowTemplate,
  params: { orgTenantId: string; workflowType: string; sector: WorkflowTemplateDefinition['sector'] },
  overrides: Partial<WorkflowTemplateDefinition> = {},
): WorkflowTemplateDefinition {
  return {
    id: `${params.workflowType}-${params.orgTenantId}`,
    tenantId: params.orgTenantId,
    workflowType: params.workflowType,
    name: template.name,
    sector: params.sector,
    enabled: true,
    version: 1,
    steps: template.steps.map((step) => ({ action: step.action, config: step.config, description: step.description })),
    paymentModes: [],
    credentialPolicy: { outputVCs: [...template.outputVCs], autoIssue: true },
    reconciliationPolicy: { mode: 'automatic', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
    ...overrides,
  }
}

/** Persist the FEPT template for an organization (declares intent; readiness gates execution). */
export function configureFeptTemplate(
  orgTenantId: string,
  overrides: Partial<WorkflowTemplateDefinition> = {},
): WorkflowTemplateDefinition {
  const definition = toDefinition(
    FieldExecutionProofTemplate,
    { orgTenantId, workflowType: 'field_execution_fept', sector: 'field_execution' },
    overrides,
  )
  workflowTemplateRepository.save(definition)
  return workflowTemplateRepository.findById(definition.id) || definition
}

/** Persist the payment-collection (finance) template for an organization. */
export function configurePaymentCollectionTemplate(
  orgTenantId: string,
  overrides: Partial<WorkflowTemplateDefinition> = {},
): WorkflowTemplateDefinition {
  const definition = toDefinition(
    PaymentCollectionTemplate,
    { orgTenantId, workflowType: 'collect_payments', sector: 'custom' },
    overrides,
  )
  workflowTemplateRepository.save(definition)
  return workflowTemplateRepository.findById(definition.id) || definition
}

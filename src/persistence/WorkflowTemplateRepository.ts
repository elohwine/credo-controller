/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import type { WorkflowTemplateDefinition, SectorType } from '../types/WorkflowTemplate'

import { validateRequestExperience } from '../config/requestExperience'
import { deriveInitiationForWorkflow } from '../services/workflow/initiation'
import { getTemplateById } from '../services/workflow/templates'
import { rootLogger } from '../utils/pinoLogger'

import { DatabaseManager } from './DatabaseManager'

const TEMPLATE_COLUMNS = `
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        prerequisites, request_experience as experience,
        created_at as createdAt, updated_at as updatedAt`

/**
 * Canonical FEPT steps come from the in-memory template registry so persisted
 * tenant templates and the registry never drift.
 */
function feptCanonicalSteps(): WorkflowTemplateDefinition['steps'] {
  const template = getTemplateById('tpl-fept-field-execution')
  return (template?.steps || []).map((step) => ({
    action: step.action,
    config: step.config,
    description: step.description,
  }))
}

function feptCanonicalOutputVCs(): string[] {
  return [...(getTemplateById('tpl-fept-field-execution')?.outputVCs || [])]
}

/**
 * A persisted FEPT template is "legacy" when it predates the checkpoint model:
 * - no assign / pause / configured transitions / before+after captures / optional concealed-work capture, or
 * - it issues credentials BEFORE assignment (the old "issue everything up front" shape).
 *
 * Credential issuance AFTER assignment / evidence checkpoints is the current model
 * (job card, material receipt, completion acknowledgement) and is preserved.
 */
function isLegacyFept(steps: WorkflowTemplateDefinition['steps']): boolean {
  if (!Array.isArray(steps) || steps.length === 0) return true

  const assignIndex = steps.findIndex((step) => step.action === 'field.assign')
  const issuesBeforeAssign = steps.some(
    (step, index) => step.action === 'credential.issue' && (assignIndex === -1 || index < assignIndex),
  )
  if (issuesBeforeAssign) {
    return true
  }

  const hasPause = steps.some((step) => step.action === 'field.pause')
  const hasConfiguredTransition = steps.some(
    (step) => step.action === 'field.transition' && Boolean(step.config && typeof step.config.to === 'string'),
  )
  const hasBeforeCapture = steps.some(
    (step) => step.action === 'field.capture_evidence' && String(step.config?.phase || '').toLowerCase() === 'before',
  )
  const hasAfterCapture = steps.some(
    (step) => step.action === 'field.capture_evidence' && String(step.config?.phase || '').toLowerCase() === 'after',
  )
  const hasConcealedWorkCapture = steps.some(
    (step) =>
      step.action === 'field.capture_evidence' &&
      String(step.config?.phase || '').toLowerCase() === 'concealed',
  )

  if (
    assignIndex === -1 ||
    !hasPause ||
    !hasConfiguredTransition ||
    !hasBeforeCapture ||
    !hasAfterCapture ||
    !hasConcealedWorkCapture
  ) {
    return true
  }

  // The SGK lifecycle adds site inspection, a field worker risk assessment, arrival proof and a
  // customer sign-off pause. Templates saved before that are upgraded to the canonical steps.
  const checkpointNames = new Set(
    steps.filter((step) => step.action === 'field.checkpoint').map((step) => String(step.config?.checkpoint || '')),
  )
  if (
    !['site_inspection', 'risk_assessment', 'arrival', 'completion_review'].every((name) => checkpointNames.has(name))
  ) {
    return true
  }
  const hasSignoffPause = steps.some(
    (step) => step.action === 'field.pause' && String(step.config?.reason || '') === 'await_acknowledgement',
  )
  if (!hasSignoffPause) return true

  // Payout is released by its own person after sign-off; templates without that pause are upgraded.
  const hasPayoutPause = steps.some(
    (step) => step.action === 'field.pause' && String(step.config?.reason || '') === 'await_payout_release',
  )
  if (!hasPayoutPause) return true

  // Previous canonical shape (checkpoints only, no issuance, no hand-off) is upgraded
  // so existing tenants get the verifiable chain without re-onboarding.
  const hasPostAssignIssue = steps.some((step, index) => step.action === 'credential.issue' && index > assignIndex)
  const hasHandoff = steps.some((step) => step.action === 'workflow.start')
  if (!hasPostAssignIssue && !hasHandoff) return true

  // Payment collection only starts when there is a client to charge; older hand-off steps
  // without that condition started it for internal jobs too.
  if (steps.some((step) => step.action === 'workflow.start' && !step.config?.when)) return true

  // Materials are bought during the job: receipts come between the before and after photos, and
  // the client is invoiced at sign-off, before any worker payout. Older orders are upgraded.
  const pauseIndex = (reason: string) =>
    steps.findIndex((step) => step.action === 'field.pause' && String(step.config?.reason || '') === reason)
  if (pauseIndex('await_evidence_receipt') > pauseIndex('await_evidence_after')) return true
  const collectionIndex = steps.findIndex((step) => step.action === 'workflow.start')
  if (collectionIndex > pauseIndex('await_payout_release')) return true

  // A site check writes a record into the organisation wallet. Templates saved before that
  // step are upgraded so new jobs follow the current record settings.
  return !steps.some(
    (step) => step.action === 'credential.issue' && String(step.config?.type || '') === 'SiteInspectionVC',
  )
}

const SCHOOL_FEE_WORKFLOW_TYPES = new Set([
  'education_fee_payment',
  'school_fee_payment',
  'school_fees',
  'tpl-education-fee',
])

/** School fees collect through the shared pay-link steps; templates saved with the old capture stub are upgraded. */
function normalizeSchoolFeeTemplate(record: WorkflowTemplateDefinition): WorkflowTemplateDefinition {
  if (Array.isArray(record.steps) && record.steps.some((step) => step.action === 'client.request_payment'))
    return record
  const template = getTemplateById('tpl-education-fee')
  if (!template) return record
  return {
    ...record,
    steps: template.steps.map((step) => ({ action: step.action, config: step.config, description: step.description })),
  }
}

function normalizeTemplateDefinition(record: WorkflowTemplateDefinition): WorkflowTemplateDefinition {
  if (SCHOOL_FEE_WORKFLOW_TYPES.has(String(record.workflowType || '').toLowerCase())) {
    return normalizeSchoolFeeTemplate(record)
  }
  if (record.workflowType !== 'field_execution_fept') {
    return record
  }

  if (!isLegacyFept(record.steps)) {
    return record
  }

  return {
    ...record,
    steps: feptCanonicalSteps(),
    credentialPolicy: {
      ...record.credentialPolicy,
      outputVCs: feptCanonicalOutputVCs(),
      autoIssue: true,
    },
  }
}

export class WorkflowTemplateRepository {
  private logger = rootLogger.child({ module: 'WorkflowTemplateRepository' })

  save(record: WorkflowTemplateDefinition): void {
    const normalized = normalizeTemplateDefinition(record)
    if (normalized.experience) validateRequestExperience(normalized.experience)
    const db = DatabaseManager.getDatabase()

    const stmt = db.prepare(`
      INSERT INTO workflow_templates (
        id, tenant_id, workflow_type, name, sector, enabled, version,
        steps, payment_modes, credential_policy, reconciliation_policy,
        evidence_policy, branding_policy, initiation_schema, prerequisites, request_experience, updated_at
      ) VALUES (
        @id, @tenantId, @workflowType, @name, @sector, @enabled, @version,
        @steps, @paymentModes, @credentialPolicy, @reconciliationPolicy,
        @evidencePolicy, @brandingPolicy, @initiationSchema, @prerequisites, @experience, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        workflow_type = @workflowType,
        name = @name,
        sector = @sector,
        enabled = @enabled,
        version = @version,
        steps = @steps,
        payment_modes = @paymentModes,
        credential_policy = @credentialPolicy,
        reconciliation_policy = @reconciliationPolicy,
        evidence_policy = @evidencePolicy,
        branding_policy = @brandingPolicy,
        initiation_schema = @initiationSchema,
        prerequisites = @prerequisites,
        request_experience = @experience,
        updated_at = CURRENT_TIMESTAMP
    `)

    try {
      stmt.run({
        id: normalized.id,
        tenantId: normalized.tenantId,
        workflowType: normalized.workflowType,
        name: normalized.name,
        sector: normalized.sector,
        enabled: normalized.enabled ? 1 : 0,
        version: normalized.version,
        steps: JSON.stringify(normalized.steps),
        paymentModes: JSON.stringify(normalized.paymentModes),
        credentialPolicy: JSON.stringify(normalized.credentialPolicy),
        reconciliationPolicy: JSON.stringify(normalized.reconciliationPolicy),
        evidencePolicy: JSON.stringify(normalized.evidencePolicy),
        brandingPolicy: JSON.stringify(normalized.brandingPolicy),
        initiationSchema: normalized.initiation ? JSON.stringify(normalized.initiation) : null,
        experience: normalized.experience ? JSON.stringify(normalized.experience) : null,
        prerequisites:
          Array.isArray(normalized.prerequisites) && normalized.prerequisites.length > 0
            ? JSON.stringify(normalized.prerequisites)
            : null,
      })
      this.logger.debug(`Saved workflow template: ${normalized.id}`)
    } catch (error) {
      this.logger.error({ error, templateId: normalized.id }, 'Failed to save workflow template')
      throw error
    }
  }

  findById(id: string): WorkflowTemplateDefinition | undefined {
    const db = DatabaseManager.getDatabase()

    const row = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      WHERE id = ?
    `,
      )
      .get(id) as any

    return row ? this.hydrate(row) : undefined
  }

  /** A built-in template row (no organization). Used the first time a request runs, not during setup. */
  findBuiltinByWorkflowType(workflowType: string): WorkflowTemplateDefinition | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      WHERE workflow_type = ? AND tenant_id IS NULL AND enabled = 1
      ORDER BY version DESC
      LIMIT 1
    `,
      )
      .get(workflowType) as any
    return row ? this.hydrate(row) : undefined
  }

  findDefaultBySector(sector: SectorType): WorkflowTemplateDefinition | undefined {
    const db = DatabaseManager.getDatabase()

    const row = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      WHERE sector = ? AND tenant_id IS NULL AND enabled = 1
      ORDER BY version DESC
      LIMIT 1
    `,
      )
      .get(sector) as any

    return row ? this.hydrate(row) : undefined
  }

  listBySector(sector: SectorType): WorkflowTemplateDefinition[] {
    const db = DatabaseManager.getDatabase()

    const rows = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      WHERE sector = ?
      ORDER BY created_at DESC
    `,
      )
      .all(sector) as any[]

    return rows.map((r) => this.hydrate(r))
  }

  listByTenantId(tenantId: string): WorkflowTemplateDefinition[] {
    const db = DatabaseManager.getDatabase()

    const rows = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `,
      )
      .all(tenantId) as any[]

    return rows.map((r) => this.hydrate(r))
  }

  listAll(): WorkflowTemplateDefinition[] {
    const db = DatabaseManager.getDatabase()

    const rows = db
      .prepare(
        `
      SELECT
        ${TEMPLATE_COLUMNS}
      FROM workflow_templates
      ORDER BY created_at DESC
    `,
      )
      .all() as any[]

    return rows.map((r) => this.hydrate(r))
  }

  setEnabled(id: string, enabled: boolean): void {
    const db = DatabaseManager.getDatabase()
    db.prepare(`UPDATE workflow_templates SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      enabled ? 1 : 0,
      id,
    )
  }

  private hydrate(row: any): WorkflowTemplateDefinition {
    const experience = row.experience ? JSON.parse(row.experience) : undefined
    if (experience) validateRequestExperience(experience)
    const parsedInitiation = row.initiationSchema ? JSON.parse(row.initiationSchema) : undefined
    let parsedPrerequisites: WorkflowTemplateDefinition['prerequisites']
    if (row.prerequisites) {
      try {
        const parsed = JSON.parse(row.prerequisites)
        parsedPrerequisites = Array.isArray(parsed) ? parsed : undefined
      } catch {
        parsedPrerequisites = undefined
      }
    }
    return normalizeTemplateDefinition({
      ...row,
      enabled: !!row.enabled,
      experience,
      prerequisites: parsedPrerequisites,
      steps: JSON.parse(row.steps),
      paymentModes: JSON.parse(row.paymentModes),
      credentialPolicy: JSON.parse(row.credentialPolicy),
      reconciliationPolicy: JSON.parse(row.reconciliationPolicy),
      evidencePolicy: JSON.parse(row.evidencePolicy),
      brandingPolicy: JSON.parse(row.brandingPolicy),
      initiation: parsedInitiation ?? deriveInitiationForWorkflow(row.workflowType),
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
    })
  }
}

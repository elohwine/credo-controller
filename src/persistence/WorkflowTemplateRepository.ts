import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import type { WorkflowTemplateDefinition, SectorType } from '../types/WorkflowTemplate'
import { deriveInitiationForWorkflow } from '../services/workflow/initiation'

const FEPT_CANONICAL_STEPS: WorkflowTemplateDefinition['steps'] = [
  {
    action: 'field.transition',
    config: { to: 'REQUEST_CREATED' },
    description: 'Move workflow to request created state',
  },
  {
    action: 'field.assign',
    config: { assigneeId: 'input.assigneeId' },
    description: 'Assign work to a field worker and wait for them to start the job',
  },
  {
    action: 'field.pause',
    config: { reason: 'await_worker_start' },
    description: 'Pause until the worker starts the job from the mobile inbox',
  },
  {
    action: 'field.transition',
    config: { to: 'IN_PROGRESS' },
    description: 'Move workflow to in progress state once the worker starts the job',
  },
  {
    action: 'field.pause',
    config: { reason: 'await_evidence_before' },
    description: 'Pause until the worker captures BEFORE-work evidence from the mobile app',
  },
  {
    action: 'field.capture_evidence',
    config: { phase: 'before' },
    description: 'Capture BEFORE evidence (site state prior to work)',
  },
  {
    action: 'field.pause',
    config: { reason: 'await_evidence_after' },
    description: 'Pause until the worker captures AFTER-work evidence from the mobile app',
  },
  {
    action: 'field.capture_evidence',
    config: { phase: 'after' },
    description: 'Capture AFTER evidence (post-work proof, receipts/photos)',
  },
  {
    action: 'field.acknowledge',
    config: { receiverId: 'input.receiverId' },
    description: 'Capture receiver acknowledgement',
  },
  {
    action: 'field.trigger_payment',
    config: {},
    description: 'Trigger payout/payment state and log reconciliation payment event',
  },
  {
    action: 'field.mark_receipt_issued',
    config: {},
    description: 'Mark receipt issued and log reconciliation receipt event',
  },
  {
    action: 'field.reconcile',
    config: { mode: 'automatic' },
    description: 'Finalize reconciliation for this workflow run',
  },
  {
    action: 'external.send_notification',
    config: { type: 'whatsapp', to: 'input.receiverId', template: 'field_execution_completed' },
    description: 'Notify receiver or requester about workflow completion',
  },
  {
    action: 'trust.update_score',
    config: { event: 'field_execution_completed', weight: 1 },
    description: 'Update trust score on successful FEPT completion',
  },
]

function isLegacyFept(steps: WorkflowTemplateDefinition['steps']): boolean {
  if (!Array.isArray(steps) || steps.length === 0) return true

  // Legacy FEPT templates issue unsupported VC types before assignment.
  if (steps.some((step) => step.action === 'credential.issue')) {
    return true
  }

  const hasAssign = steps.some((step) => step.action === 'field.assign')
  const hasPause = steps.some((step) => step.action === 'field.pause')
  const hasConfiguredTransition = steps.some((step) =>
    step.action === 'field.transition' && Boolean(step.config && typeof step.config.to === 'string')
  )
  const hasBeforeCapture = steps.some((step) => step.action === 'field.capture_evidence' && String(step.config?.phase || '').toLowerCase() === 'before')
  const hasAfterCapture = steps.some((step) => step.action === 'field.capture_evidence' && String(step.config?.phase || '').toLowerCase() === 'after')

  return !hasAssign || !hasPause || !hasConfiguredTransition || !hasBeforeCapture || !hasAfterCapture
}

function normalizeTemplateDefinition(record: WorkflowTemplateDefinition): WorkflowTemplateDefinition {
  if (record.workflowType !== 'field_execution_fept') {
    return record
  }

  if (!isLegacyFept(record.steps)) {
    return record
  }

  return {
    ...record,
    steps: FEPT_CANONICAL_STEPS,
    credentialPolicy: {
      ...record.credentialPolicy,
      outputVCs: [],
      autoIssue: false,
    },
  }
}

export class WorkflowTemplateRepository {
    private logger = rootLogger.child({ module: 'WorkflowTemplateRepository' })

    save(record: WorkflowTemplateDefinition): void {
    const normalized = normalizeTemplateDefinition(record)
        const db = DatabaseManager.getDatabase()

        const stmt = db.prepare(`
      INSERT INTO workflow_templates (
        id, tenant_id, workflow_type, name, sector, enabled, version,
        steps, payment_modes, credential_policy, reconciliation_policy,
        evidence_policy, branding_policy, initiation_schema, updated_at
      ) VALUES (
        @id, @tenantId, @workflowType, @name, @sector, @enabled, @version,
        @steps, @paymentModes, @credentialPolicy, @reconciliationPolicy,
        @evidencePolicy, @brandingPolicy, @initiationSchema, CURRENT_TIMESTAMP
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
            })
          this.logger.debug(`Saved workflow template: ${normalized.id}`)
        } catch (error) {
          this.logger.error({ error, templateId: normalized.id }, 'Failed to save workflow template')
            throw error
        }
    }

    findById(id: string): WorkflowTemplateDefinition | undefined {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare(`
      SELECT
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        created_at as createdAt, updated_at as updatedAt
      FROM workflow_templates
      WHERE id = ?
    `).get(id) as any

        return row ? this.hydrate(row) : undefined
    }

    findDefaultBySector(sector: SectorType): WorkflowTemplateDefinition | undefined {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare(`
      SELECT
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        created_at as createdAt, updated_at as updatedAt
      FROM workflow_templates
      WHERE sector = ? AND tenant_id IS NULL AND enabled = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(sector) as any

        return row ? this.hydrate(row) : undefined
    }

    listBySector(sector: SectorType): WorkflowTemplateDefinition[] {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
      SELECT
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        created_at as createdAt, updated_at as updatedAt
      FROM workflow_templates
      WHERE sector = ?
      ORDER BY created_at DESC
    `).all(sector) as any[]

        return rows.map((r) => this.hydrate(r))
    }

    listByTenantId(tenantId: string): WorkflowTemplateDefinition[] {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
      SELECT
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        created_at as createdAt, updated_at as updatedAt
      FROM workflow_templates
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `).all(tenantId) as any[]

        return rows.map((r) => this.hydrate(r))
    }

    listAll(): WorkflowTemplateDefinition[] {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
      SELECT
        id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
        enabled, version, steps, payment_modes as paymentModes,
        credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
        evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema,
        created_at as createdAt, updated_at as updatedAt
      FROM workflow_templates
      ORDER BY created_at DESC
    `).all() as any[]

        return rows.map((r) => this.hydrate(r))
    }

    setEnabled(id: string, enabled: boolean): void {
        const db = DatabaseManager.getDatabase()
        db.prepare(`UPDATE workflow_templates SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(enabled ? 1 : 0, id)
    }

    private hydrate(row: any): WorkflowTemplateDefinition {
      const parsedInitiation = row.initiationSchema ? JSON.parse(row.initiationSchema) : undefined
        return normalizeTemplateDefinition({
            ...row,
            enabled: !!row.enabled,
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

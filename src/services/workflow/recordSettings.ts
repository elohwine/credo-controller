import type {
  CredentialOfferMode,
  WorkflowStepDefinition,
  WorkflowTemplateDefinition,
} from '../../types/WorkflowTemplate'
import type { CredentialDefinitionStoreRecord } from '../../utils/credentialDefinitionStore'

/** Plain names for records a workflow step can issue. */
export const RECORD_LABELS: Record<string, string> = {
  JobAssignmentVC: 'Job assignment record',
  RequisitionVC: 'Requisition record',
  SiteInspectionVC: 'Site inspection',
  ReceiptVC: 'Material receipt',
  ExecutionAckVC: 'Completion',
  InvoiceVC: 'Invoice',
  PaymentReceiptVC: 'Payment receipt',
  QuoteVC: 'Quote',
  DeliveryProofVC: 'Delivery proof',
  PayslipVC: 'Payslip',
}

const MODES = new Set<CredentialOfferMode>(['required', 'optional', 'disabled'])

export interface OrgCredentialCatalogueItem {
  credentialType: string
  directIssue: boolean
  schemaId?: string
  workflows: Array<{ workflowType: string; name: string }>
  /** Set for record types the organisation defined itself (sent by people or connected systems). */
  orgDefined?: {
    label: string
    version: number
    fields: Array<{ key: string; label: string; type: string; required: boolean }>
  }
}

const SOURCE_BACKED_CREDENTIAL_TYPES = new Set([
  'ReceiptVC',
  'PaymentReceiptVC',
  'InvoiceVC',
  'QuoteVC',
  'ExecutionAckVC',
  'SiteInspectionVC',
  'JobAssignmentVC',
  'RequisitionVC',
  'LeaveApprovalVC',
  'ExpenseApprovalVC',
  'EmployeeCredential',
  'OrgWorkflowActorCredential',
  'DelegationCredential',
  'PlatformIdentityCredential',
  'RemittanceAdviceVC',
  'DeliveryProofVC',
  'PayslipVC',
  'EmploymentContractVC',
])

/** Seeded definitions describe capabilities, not which records an organisation selected. */
export function configuredCredentialCatalogue(
  orgTenantId: string,
  templates: WorkflowTemplateDefinition[],
  definitions: CredentialDefinitionStoreRecord[],
): OrgCredentialCatalogueItem[] {
  const records = new Map<string, OrgCredentialCatalogueItem>()
  for (const template of templates) {
    if (!template.enabled || template.tenantId !== orgTenantId) continue
    const policy = template.credentialPolicy
    for (const type of new Set([...issuedRecordTypes(template.steps), ...(policy.outputVCs || [])])) {
      const mode =
        policy.vcOfferModes?.[type] ??
        (type === 'JobAssignmentVC' && template.workflowType === 'field_execution_fept'
          ? policy.vcOfferModes?.RequisitionVC
          : undefined)
      if (mode === 'disabled' || (mode === 'optional' && !policy.sendOptionalOffers)) continue
      let item = records.get(type)
      if (!item) {
        const definition = definitions.find(
          (candidate) => candidate.tenantId === orgTenantId && candidate.name === type,
        )
        item = {
          credentialType: type,
          directIssue:
            Boolean(definition) &&
            !SOURCE_BACKED_CREDENTIAL_TYPES.has(type) &&
            !/(payment|receipt|invoice|quote|approval|assignment|requisition|job|leave|expense|employee|staff|delegation|identity|payout|settlement)/i.test(
              type,
            ),
          schemaId: definition?.schemaId,
          workflows: [],
        }
        records.set(type, item)
      }
      if (!item.workflows.some((source) => source.workflowType === template.workflowType)) {
        item.workflows.push({ workflowType: template.workflowType, name: template.name })
      }
    }
  }
  return [...records.values()].sort((a, b) => a.credentialType.localeCompare(b.credentialType))
}

/** Record types the workflow's own steps issue, in step order. */
export function issuedRecordTypes(steps: WorkflowStepDefinition[] | undefined): string[] {
  const seen = new Set<string>()
  const types: string[] = []
  for (const step of steps || []) {
    if (step.action !== 'credential.issue') continue
    const type = String(step.config?.type || '').trim()
    if (!type || seen.has(type)) continue
    seen.add(type)
    types.push(type)
  }
  return types
}

/**
 * Keep only modes for records this workflow issues. Unknown types and unknown
 * modes are dropped so a save cannot change steps, people, or other policies.
 */
export function sanitizeRecordSettings(
  issued: string[],
  input: { vcOfferModes?: Record<string, string | undefined>; sendOptionalOffers?: boolean },
): { vcOfferModes: Record<string, CredentialOfferMode>; sendOptionalOffers: boolean } {
  const allowed = new Set(issued)
  const vcOfferModes: Record<string, CredentialOfferMode> = {}
  for (const [type, mode] of Object.entries(input.vcOfferModes || {})) {
    if (!allowed.has(type) || !mode || !MODES.has(mode as CredentialOfferMode)) continue
    vcOfferModes[type] = mode as CredentialOfferMode
  }
  return { vcOfferModes, sendOptionalOffers: input.sendOptionalOffers === true }
}

import type { WorkflowInitiationDefinition } from '../../types/WorkflowTemplate'
import { getTemplateById } from './templates'

const WORKFLOW_TYPE_ALIASES: Record<string, string> = {
  ecommerce_delivery: 'tpl-quote-invoice-receipt',
  education_fee_payment: 'tpl-education-fee',
  cash_counter_payment: 'tpl-cash-counter',
  collect_payments: 'tpl-payment-collection',
  payment_collection: 'tpl-payment-collection',
  accounts_receivable: 'tpl-ar-collections',
  ar_collections: 'tpl-ar-collections',
  accounts_payable: 'tpl-ap-payables',
  ap_payables: 'tpl-ap-payables',
  field_execution_fept: 'tpl-fept-field-execution',
}

const REVERSE_WORKFLOW_TYPE_ALIASES: Record<string, string[]> = Object.entries(WORKFLOW_TYPE_ALIASES)
  .reduce<Record<string, string[]>>((acc, [alias, canonical]) => {
    if (!acc[canonical]) {
      acc[canonical] = []
    }
    acc[canonical].push(alias)
    return acc
  }, {})

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function normalizeWorkflowTypeValue(workflowType: string): string {
  return String(workflowType || '').trim().toLowerCase()
}

export function normalizeWorkflowTypeAlias(workflowType: string): string {
  const normalized = normalizeWorkflowTypeValue(workflowType)
  if (!normalized) {
    return normalized
  }

  return WORKFLOW_TYPE_ALIASES[normalized] ?? normalized
}

export function getWorkflowTypeCandidates(workflowType: string): string[] {
  const normalized = normalizeWorkflowTypeValue(workflowType)
  if (!normalized) {
    return []
  }

  const canonical = WORKFLOW_TYPE_ALIASES[normalized] ?? normalized
  const reverseAliases = REVERSE_WORKFLOW_TYPE_ALIASES[canonical] ?? []

  return Array.from(new Set([normalized, canonical, ...reverseAliases]))
}

export function deriveInitiationForWorkflow(
  workflowType: string
): WorkflowInitiationDefinition | undefined {
  const resolvedTemplateId = normalizeWorkflowTypeAlias(workflowType)
  const template = getTemplateById(resolvedTemplateId)

  const schema = asObject(template?.inputSchema)
  const schemaProps = asObject(schema?.properties)
  if (schema && schemaProps && Object.keys(schemaProps).length > 0) {
    return {
      mode: 'optional',
      title: template?.name ? `Start ${template.name}` : 'Start Workflow',
      description: 'Provide start values now or run immediately and supply them later through events.',
      inputSchema: schema,
    }
  }

  return {
    mode: 'none',
    description: 'No explicit start input required for this workflow template.',
  }
}

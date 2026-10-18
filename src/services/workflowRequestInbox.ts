import type { WorkflowRequest } from '../persistence/WorkflowRequestRepository'
import { ReconciliationService } from './ReconciliationService'

export function isWorkflowRequestActionable(request: WorkflowRequest): boolean {
  // Credential delivery has its own wallet card; its request row is only a trace.
  if (String(request.requestType) === 'vc_offer') return false
  if (request.requestType !== 'requisition' || request.status !== 'pending') return true
  const requisitionId = request.payload?.requisitionId
  if (!requisitionId || typeof requisitionId !== 'string') return true
  const status = new ReconciliationService().getStatus(requisitionId)
  return ['REQUISITION_CREATED', 'MANAGER_APPROVED'].includes(String(status?.status || '').toUpperCase())
}

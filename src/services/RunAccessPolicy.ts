import type { WorkflowRun } from '../persistence/WorkflowRunRepository'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { orgWorkflowActorService } from './OrgWorkflowActorService'
import { FEPT_CHECKPOINT_BY_PAUSE_REASON } from './workflow/actions/fieldCheckpoints'

/**
 * Who may see a job (workflow run).
 *
 * Least privilege, holder first:
 *  - a person named on the job (worker, checker, payee, requester) may read that job with
 *    their personal token — the job is theirs, nothing else in the organisation is;
 *  - an organisation member may read the organisation's jobs only when their role manages
 *    work (approve, assign, inspect, pay, audit). Field roles see only the jobs they are on.
 */

export interface OrgMembershipAccess {
  role: string
  permissions: string[]
}

const MANAGING_ROLES = new Set(['owner', 'admin'])
const MANAGING_PERMISSIONS = new Set([
  'request.approve',
  'field.assign',
  'field.inspect',
  'finance.release',
  'finance.pay',
  'finance.receipt',
  'audit.read',
  'report.read',
])
const FINANCE_PERMISSIONS = new Set(['finance.release', 'finance.pay', 'finance.receipt', 'audit.read', 'report.read'])

function parsed(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value)) as Record<string, any>
  } catch {
    return {}
  }
}

export function membershipFor(orgTenantId: string, userId: string): OrgMembershipAccess | undefined {
  if (!orgTenantId || !userId) return undefined
  const row = DatabaseManager.getDatabase()
    .prepare(
      `SELECT m.role, r.permissions
         FROM org_memberships m
         LEFT JOIN organizations o ON o.tenant_id = m.org_tenant_id
         LEFT JOIN roles r ON r.organization_id = o.id AND r.membership_role = m.role
        WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active'
        LIMIT 1`,
    )
    .get(orgTenantId, userId) as { role?: string; permissions?: string } | undefined
  if (!row) return undefined
  let permissions: string[] = []
  try {
    permissions = row.permissions ? JSON.parse(row.permissions) : []
  } catch {
    permissions = []
  }
  return { role: String(row.role || '').toLowerCase(), permissions: Array.isArray(permissions) ? permissions : [] }
}

/** Owners/admins, or a role the organisation gave a managing permission. */
export function managesWork(access?: OrgMembershipAccess): boolean {
  if (!access) return false
  return (
    MANAGING_ROLES.has(access.role) || access.permissions.some((permission) => MANAGING_PERMISSIONS.has(permission))
  )
}

/** Owners/admins, or a role that pays, receipts or audits. */
export function handlesFinance(access?: OrgMembershipAccess): boolean {
  if (!access) return false
  return MANAGING_ROLES.has(access.role) || access.permissions.some((permission) => FINANCE_PERMISSIONS.has(permission))
}

/** Current participants only; a historical checkpoint never grants continuing access. */
export function runActorIds(run: { input?: unknown; output?: unknown }): Set<string> {
  const input = parsed(run.input)
  const state = parsed(run.output)
  const ids = [
    state.assignment?.assigneeId || state.jobActors?.assigneeId || input.assigneeUserId || input.assigneeId,
    state.jobActors?.receiverId || input.receiverId,
    state.jobActors?.payoutUserId || input.payoutUserId,
    input.requesterId,
    input.dispatcherId,
  ]
  return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
}

/**
 * Whether the caller may read this job. A token for another organisation only reads it when
 * the person is named on the job; a token for this organisation also needs a managing role
 * unless the person is named on the job.
 */
export function canAccessRun(
  user: { id?: string; tenantId?: string } | undefined,
  run: { tenantId: string; input?: unknown; output?: unknown },
): boolean {
  const userId = String(user?.id || '')
  const tenantId = String(user?.tenantId || '')
  if (!userId || !tenantId) return false
  const membership = DatabaseManager.getDatabase()
    .prepare('SELECT status FROM org_memberships WHERE org_tenant_id = ? AND user_id = ?')
    .get(run.tenantId, userId) as { status: string } | undefined
  if (membership && membership.status !== 'active') return false
  if (runActorIds(run).has(userId)) return true
  if (tenantId !== run.tenantId) return false
  // A token for the organisation itself (no person behind it) acts as the organisation.
  if (userId === tenantId) return true
  const checkpoint = FEPT_CHECKPOINT_BY_PAUSE_REASON[String(parsed(run.output).pauseReason || '')]
  if (
    checkpoint &&
    orgWorkflowActorService.mayAct({
      orgTenantId: run.tenantId,
      workflowType: 'field_execution_fept',
      stageAction: checkpoint.stageAction,
      userId,
    }).allowed
  )
    return true
  return managesWork(membershipFor(run.tenantId, userId))
}

const WORKER_STAGES: Record<string, string> = {
  await_worker_start: 'start_job',
  await_arrival: 'confirm_arrival',
  await_risk_assessment: 'assess_risk',
  await_evidence_before: 'capture_evidence',
  await_evidence_concealed: 'capture_evidence',
  await_evidence_receipt: 'capture_evidence',
  await_evidence_after: 'capture_evidence',
}

/** The current assignment, never a previous checkpoint or stale input assignee. */
export function assignedWorker(run: Pick<WorkflowRun, 'input' | 'output'>): string | undefined {
  const state = parsed(run.output)
  const input = parsed(run.input)
  return state.assignment?.assigneeId || state.jobActors?.assigneeId || input.assigneeUserId || input.assigneeId
}

export function resumeFieldsForRun(run: Pick<WorkflowRun, 'output'>): readonly string[] | undefined {
  const reason = String(parsed(run.output).pauseReason || '').toLowerCase()
  const checkpoint = FEPT_CHECKPOINT_BY_PAUSE_REASON[reason]
  if (checkpoint) return [checkpoint.inputKey]
  if (reason === 'await_worker_start') return []
  if (reason.startsWith('await_evidence_')) {
    return [
      'phase',
      'evidenceHash',
      'photoUri',
      'gps',
      'notes',
      'deviceCapturedAt',
      'attachments',
      'performanceVc',
      'receiptVc',
      'noReceipt',
      'usePurchaseReceipts',
    ]
  }
  return undefined
}

export function assertRunResume(user: { id?: string; tenantId?: string } | undefined, run: WorkflowRun): void {
  if (!canAccessRun(user, run)) throw new StatusException('Run not found', 404)
  const userId = String(user?.id || '')
  const state = parsed(run.output)
  const reason = String(state.pauseReason || '').toLowerCase()
  if (reason === 'await_acknowledgement' || reason === 'await_payout_release') {
    throw new StatusException('Complete this step through its wallet proof.', 403)
  }
  const access = membershipFor(run.tenantId, userId)
  const admin = access && MANAGING_ROLES.has(access.role)
  const worker = assignedWorker(run)
  if (WORKER_STAGES[reason]) {
    if (userId === worker || admin) return
    throw new StatusException('Only the assigned worker or an organisation admin can complete this step.', 403)
  }
  const checkpoint = FEPT_CHECKPOINT_BY_PAUSE_REASON[reason]
  if (checkpoint) {
    const actor = orgWorkflowActorService.resolveActor({
      orgTenantId: run.tenantId,
      workflowType: 'field_execution_fept',
      stageAction: checkpoint.stageAction,
    })
    // Only site inspection uses the implicit worker; work review follows the organisation's actor.
    const namedUserId =
      checkpoint.stageAction === 'inspect_site' && (actor.mode === 'owner_fallback' || actor.mode === 'unassigned')
        ? worker
        : undefined
    if (
      orgWorkflowActorService.mayAct({
        orgTenantId: run.tenantId,
        workflowType: 'field_execution_fept',
        stageAction: checkpoint.stageAction,
        userId,
        namedUserId,
      }).allowed
    )
      return
    throw new StatusException('You are not assigned to complete this step.', 403)
  }
  // Non-field runs retain organisation administration, not broad read/audit permissions.
  if (admin) return
  throw new StatusException('This run must be continued through its authorised task.', 403)
}

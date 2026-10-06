/**
 * `workflow.start` — start another workflow from a stage of the current one.
 *
 * This is how a field job hands off to payment collection, a material request
 * opens supplier procurement, or an approval kicks off fulfilment. It is gated on
 * the TARGET template's organizational readiness: if the target organization has
 * not configured what that workflow needs, the parent records the missing setup,
 * opens a setup task on its request (when one exists) and pauses with a reason,
 * instead of failing or silently skipping.
 *
 * Config:
 *   workflow            template id, workflow type or alias to start (or `input.<path>` / `state.<path>`)
 *   targetOrgTenantId   optional; defaults to the current tenant (or `input.<path>`)
 *   inputMapping        { childInputKey: 'input.x' | 'state.y.z' | literal }
 *   forwardInput        when true, the parent input is copied into the child input first (default true)
 *   onNotReady          'pause' (default) | 'skip' | 'fail'
 *   async               start the child asynchronously (default true)
 *   key                 idempotency key inside the parent state (defaults to the workflow ref)
 *   when                platform condition (see HandoffConditions); the child is not started
 *                       when it does not apply, e.g. `has_customer_charge`
 *   waitForCompletion   when true, the parent pauses (`await_handoff:<key>`) and continues by
 *                       itself when the child run finishes; the child's summary arrives as
 *                       `input.handoffResult` (see WorkflowHandoffService)
 */

import type { WorkflowExecutionResult } from '../../WorkflowService'
import type { WorkflowActionContext } from '../ActionRegistry'

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { rootLogger } from '../../../utils/pinoLogger'
import { platformRequestService } from '../../PlatformRequestService'
import { workflowReadinessService } from '../../WorkflowReadinessService'
import { collectHandoffFacts, handoffConditionLabel, handoffConditionMet, type HandoffConditionId } from '../HandoffConditions'
import { ensureExecutableWorkflow } from '../materialize'

const logger = rootLogger.child({ module: 'WorkflowStartAction' })

type Executor = (
  workflowId: string,
  input: any,
  tenantId: string,
  options: { triggerType: 'workflow'; triggerRef?: string; async?: boolean },
) => Promise<WorkflowExecutionResult>

function resolveValue(context: WorkflowActionContext, ref: unknown): unknown {
  if (typeof ref !== 'string') return ref
  if (ref.startsWith('input.') || ref.startsWith('state.')) {
    const [root, ...rest] = ref.split('.')
    let value: any = root === 'input' ? context.input : context.state
    for (const part of rest) {
      value = value?.[part]
    }
    return value
  }
  return ref
}

export function createWorkflowStartAction(getExecutor: () => Executor) {
  return async function workflowStart(context: WorkflowActionContext, config: any = {}): Promise<void> {
    const workflowRef = String(
      resolveValue(context, config.workflow || config.workflowType || config.templateId) || '',
    ).trim()
    if (!workflowRef) {
      context.state.startedWorkflows = {
        ...(context.state.startedWorkflows || {}),
        _invalid: { status: 'skipped', reason: 'workflow.start config missing workflow reference' },
      }
      logger.warn({ runId: context.runId }, 'workflow.start: no workflow reference configured; skipping')
      return
    }

    const key = String(config.key || workflowRef)
    const targetOrgTenantId = String(resolveValue(context, config.targetOrgTenantId) || context.tenantId)
    const onNotReady: 'pause' | 'skip' | 'fail' = config.onNotReady || 'pause'

    context.state.startedWorkflows = context.state.startedWorkflows || {}

    // `when`: only start the next procedure when this job actually needs it.
    if (config.when) {
      const facts = collectHandoffFacts({ amount: context.input?.amount, context: { ...(context.input || {}), ...(context.state || {}) } })
      if (!handoffConditionMet(config.when as HandoffConditionId, facts)) {
        context.state.startedWorkflows[key] = { workflow: workflowRef, status: 'not_needed', reason: handoffConditionLabel(config.when) }
        return
      }
    }

    const previous = context.state.startedWorkflows[key]
    if (previous?.runId) {
      logger.debug(
        { runId: context.runId, key, childRunId: previous.runId },
        'workflow.start: idempotent, child already started',
      )
      return
    }

    // Readiness gate on the target organization + template.
    const report = workflowReadinessService.evaluateTemplate(targetOrgTenantId, workflowRef)
    if (!report.ready) {
      const missing = report.blocking.map((item) => ({
        key: item.key,
        title: item.title,
        reason: item.reason,
        actionPath: item.actionPath,
        requiredFor: [report.workflowType],
      }))

      context.state.startedWorkflows[key] = {
        workflow: workflowRef,
        targetOrgTenantId,
        status: 'blocked',
        missing: missing.map((item) => item.key),
      }

      const requestId = context.input?.requestId
      if (requestId) {
        try {
          platformRequestService.openSetupTask(String(requestId), targetOrgTenantId, missing)
        } catch (error) {
          logger.warn({ error, requestId }, 'workflow.start: failed to open setup task')
        }
      }

      logger.warn(
        { runId: context.runId, workflowRef, targetOrgTenantId, missing: missing.map((item) => item.key), onNotReady },
        'workflow.start: target workflow prerequisites missing',
      )

      if (onNotReady === 'fail') {
        throw new Error(
          `Cannot start workflow ${report.workflowType}: missing setup ${missing.map((item) => item.title).join(', ')}`,
        )
      }
      if (onNotReady === 'pause') {
        context.state.pauseReason = `await_setup:${report.workflowType}`
        context.state.pauseRequestedAt = new Date().toISOString()
        throw new Error('WORKFLOW_PAUSE')
      }
      return
    }

    const workflow = ensureExecutableWorkflow(targetOrgTenantId, workflowRef)
    if (!workflow) {
      context.state.startedWorkflows[key] = {
        workflow: workflowRef,
        targetOrgTenantId,
        status: 'skipped',
        reason: 'target workflow not found',
      }
      logger.warn({ runId: context.runId, workflowRef, targetOrgTenantId }, 'workflow.start: target workflow not found')
      if (onNotReady === 'fail') {
        throw new Error(`Cannot start workflow ${workflowRef}: not found for organization ${targetOrgTenantId}`)
      }
      return
    }

    const childInput: Record<string, unknown> = config.forwardInput === false ? {} : { ...(context.input || {}) }
    for (const [childKey, ref] of Object.entries(config.inputMapping || {})) {
      childInput[childKey] = resolveValue(context, ref)
    }
    childInput.parentRunId = context.runId
    childInput.parentWorkflowId = context.workflowId

    const result = await getExecutor()(workflow.id, childInput, targetOrgTenantId, {
      triggerType: 'workflow',
      triggerRef: context.runId,
      async: config.async !== false,
    })

    context.state.startedWorkflows[key] = {
      workflow: workflowRef,
      workflowId: workflow.id,
      targetOrgTenantId,
      runId: result.runId,
      status: result.status,
      startedAt: new Date().toISOString(),
    }

    logger.info(
      { runId: context.runId, childRunId: result.runId, workflowId: workflow.id, targetOrgTenantId },
      'workflow.start: child workflow started',
    )

    // waitForCompletion: the parent pauses here and continues by itself when the child ends.
    // The link row is what WorkflowHandoffService settles when the child run finishes.
    if (config.waitForCompletion === true && result.runId && result.status === 'running') {
      DatabaseManager.getDatabase()
        .prepare(
          `INSERT OR IGNORE INTO workflow_handoff_links
             (id, org_tenant_id, parent_run_id, handoff_key, child_kind, child_id, hold_parent, status)
           VALUES (?, ?, ?, ?, 'run', ?, 1, 'running')`,
        )
        .run(randomUUID(), context.tenantId, context.runId, key, result.runId)
      context.state.pauseReason = `await_handoff:${key}`
      context.state.pauseRequestedAt = new Date().toISOString()
      throw new Error('WORKFLOW_PAUSE')
    }
  }
}

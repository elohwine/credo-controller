/**
 * `stage.await_actor` — the one step every workflow uses to wait for a person.
 *
 * The step names what is being done (`approve_requisition`, `release_funds`, or a step the
 * template declared for itself). From that one name the platform works out who should act from
 * "Who does what", puts the card in that person's inbox, and keeps the run waiting until they
 * confirm it from their wallet with their staff card.
 *
 * Field jobs keep their own checkpoints; every other workflow, including one onboarded later by
 * hand or from the builder, gets the routing and the staff-card check by declaring this step.
 */

import type { WorkflowActionContext } from '../ActionRegistry'

import { isStageAction } from '../../../config/requestExperience'
import { rootLogger } from '../../../utils/pinoLogger'
import { routeWorkflowStageInbox } from '../../WorkflowStageInboxService'
import { stageApplies, stageGateReason, type StageGateState } from '../stageGate'

const logger = rootLogger.child({ module: 'StageGateActions' })

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/** Plain words for a step, used when the template does not supply its own title. */
function stageWords(stageAction: string): string {
  return stageAction.replace(/_/g, ' ')
}

export class StageGateActions {
  public static async awaitActor(context: WorkflowActionContext, config: any = {}): Promise<void> {
    const stageAction = normalize(config.stageAction || context.stageAction)
    if (!isStageAction(stageAction)) {
      throw new Error(
        'stage.await_actor needs a stageAction, written as lowercase words joined by underscores, for example approve_shipment',
      )
    }
    if (!context.runId) throw new Error('stage.await_actor only runs inside a tracked run')
    if (!context.tenantId) throw new Error('stage.await_actor only runs for an organisation')

    const workflowType = normalize(config.workflowType || context.workflowType) || 'general'
    const reference = String(
      config.reference || context.input?.reference || context.input?.poNumber || context.runId,
    )
    const requireProof = config.requireProof !== false
    const amount = typeof context.input?.amount === 'number' ? context.input.amount : undefined

    // A step for bigger amounts only (a second approval from finance) is passed over below it.
    if (!stageApplies(config.when, { amount })) return

    // A request decision step: the request itself puts its card in the right inbox and records
    // the decision, then moves the run on. Writing a second card here would ask twice.
    const requestOwnsCard = Boolean(config.requestDecision && context.input?.requestId)

    // The card is how the person finds the step. A card that cannot be written must not lose the
    // step: the run still waits, and the organisation sees it on the workflow.
    if (!requestOwnsCard) try {
      const { routed } = routeWorkflowStageInbox({
        orgTenantId: context.tenantId,
        requestType: String(config.requestType || workflowType),
        workflowType,
        stageAction,
        sourceId: `${context.runId}:stage:${stageAction}`,
        assigneeUserId: config.assigneeUserId ? String(config.assigneeUserId) : undefined,
        departmentId: config.departmentId ? String(config.departmentId) : undefined,
        title: String(config.title || `${reference}: ${stageWords(stageAction)}`),
        body: String(
          config.body ||
            (requireProof
              ? 'This step is waiting for you. Open it and confirm it with your staff card.'
              : 'This step is waiting for you. Open it to continue.'),
        ),
        amount,
        extraMetadata: {
          workflowRunId: context.runId,
          pauseReason: stageGateReason(stageAction),
          stageAction,
          requireProof,
        },
      })
      if (!routed) {
        logger.warn({ runId: context.runId, stageAction }, 'Nobody is named for this step yet; the run is waiting')
      }
    } catch (error: any) {
      logger.warn(
        { error: error?.message, runId: context.runId, stageAction },
        'stage.await_actor: inbox card was not written',
      )
    }

    const gate: StageGateState = {
      stageAction,
      workflowType,
      requireProof,
      reference,
      waitingSince: new Date().toISOString(),
      ...(requestOwnsCard && { requestId: String(context.input.requestId) }),
    }
    context.state.pauseReason = stageGateReason(stageAction)
    context.state.stageGate = gate

    throw new Error('WORKFLOW_PAUSE')
  }
}

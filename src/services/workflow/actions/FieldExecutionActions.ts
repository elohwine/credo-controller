/**
 * IdenEx Credentis - Field Execution Workflow Actions (FEPT)
 *
 * Reusable action blocks for field execution workflows:
 * - state transitions with guard checks
 * - assignment capture
 * - evidence capture
 * - acknowledgement capture
 * - payment trigger event logging
 * - reconciliation completion
 */

import type { WorkflowActionContext } from '../ActionRegistry'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { workflowRunRepository } from '../../../persistence/WorkflowRunRepository'
import { rootLogger } from '../../../utils/pinoLogger'
import { orgWorkflowActorService } from '../../OrgWorkflowActorService'
import { outboxService } from '../../OutboxService'
import { ReconciliationService } from '../../ReconciliationService'
import { routeWorkflowStageInbox } from '../../WorkflowStageInboxService'

import {
  FEPT_CHECKPOINTS,
  FEPT_CHECKPOINT_BY_PAUSE_REASON,
  flagEnabled,
  isCheckpointRequired,
  validateCheckpointPayload,
  type FeptCheckpointName,
} from './fieldCheckpoints'

const logger = rootLogger.child({ module: 'FieldExecutionActions' })

/** Extra photos taken with the sealed one. Capped so a step cannot store an unbounded set. */
function extraEvidenceAttachments(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const photoUri = typeof (item as any).photoUri === 'string' ? (item as any).photoUri : ''
    if (!photoUri) return []
    const lat = Number((item as any).gps?.lat)
    const lng = Number((item as any).gps?.lng)
    const taken = (item as any).deviceCapturedAt
    return [{
      photoUri,
      kind: 'photo',
      evidenceHash: typeof (item as any).evidenceHash === 'string' ? (item as any).evidenceHash : undefined,
      notes: typeof (item as any).notes === 'string' ? String((item as any).notes).slice(0, 500) : undefined,
      deviceCapturedAt: typeof taken === 'string' && !Number.isNaN(Date.parse(taken)) ? new Date(taken).toISOString() : undefined,
      gps: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    }]
  })
}

const DEFAULT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REQUEST_CREATED', 'CANCELLED'],
  REQUEST_CREATED: ['ASSIGNED', 'CANCELLED'],
  APPROVAL_PENDING: ['APPROVED', 'DISPUTED', 'CANCELLED'],
  APPROVED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['EVIDENCE_CAPTURED', 'DISPUTED', 'CANCELLED'],
  EVIDENCE_CAPTURED: ['ACKNOWLEDGED', 'DISPUTED', 'CANCELLED'],
  ACKNOWLEDGED: ['PAYMENT_TRIGGERED', 'RECONCILED', 'CANCELLED'],
  PAYMENT_TRIGGERED: ['RECEIPT_ISSUED', 'DISPUTED', 'CANCELLED'],
  RECEIPT_ISSUED: ['RECONCILED', 'DISPUTED', 'REVOKED'],
  RECONCILED: ['COMPLETED', 'DISPUTED', 'REVOKED'],
  COMPLETED: [],
  DISPUTED: ['RECONCILED', 'CANCELLED'],
  REVOKED: [],
  CANCELLED: [],
}

// Linear forward path used to tolerate replayed resume steps without regressing state.
const FEPT_FORWARD_STAGE_ORDER = [
  'DRAFT',
  'REQUEST_CREATED',
  'APPROVAL_PENDING',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_CAPTURED',
  'ACKNOWLEDGED',
  'PAYMENT_TRIGGERED',
  'RECEIPT_ISSUED',
  'RECONCILED',
  'COMPLETED',
]

const FEPT_FORWARD_STAGE_INDEX = FEPT_FORWARD_STAGE_ORDER.reduce<Record<string, number>>((acc, stage, index) => {
  acc[stage] = index
  return acc
}, {})

function explicitAssignee(value: unknown): string | undefined {
  const raw = String(value || '').trim()
  if (!raw || raw === 'owner' || raw === 'unassigned' || raw === 'stage-actor') return undefined
  return raw
}

/** Person configured for a stage, ignoring the owner fallback. */
function configuredStagePerson(orgTenantId: string, stageAction: string): string | undefined {
  const configured = orgWorkflowActorService.resolveActor({
    orgTenantId,
    workflowType: 'field_execution_fept',
    stageAction,
  })
  if (configured.mode === 'owner_fallback' || configured.mode === 'unassigned') return undefined
  return explicitAssignee(configured.userId || configured.walletTenantId)
}

/**
 * Who signs the job off. An explicit receiver wins. Otherwise the customer sign-off
 * person from Workflow Actors. The field worker is not used as that person.
 */
function resolveReceiverId(context: WorkflowActionContext): string | undefined {
  return explicitAssignee(context.input?.receiverId) || configuredStagePerson(context.tenantId, 'acknowledge_execution')
}

function hasReachedForwardStage(current: unknown, target: string): boolean {
  const currentStage = String(current || '').toUpperCase()
  const currentIndex = FEPT_FORWARD_STAGE_INDEX[currentStage]
  const targetIndex = FEPT_FORWARD_STAGE_INDEX[target]
  if (!Number.isInteger(currentIndex) || !Number.isInteger(targetIndex)) return false
  return currentIndex >= targetIndex
}

function hasBeforeEvidence(context: WorkflowActionContext): boolean {
  return Boolean(context.state.evidenceBefore?.evidenceHash || context.state.evidence?.before?.evidenceHash)
}

function hasAfterEvidence(context: WorkflowActionContext): boolean {
  return Boolean(context.state.evidenceAfter?.evidenceHash || context.state.evidence?.after?.evidenceHash)
}

function getProviderRef(context: WorkflowActionContext): string {
  return (
    context.input?.providerReference ||
    context.input?.reference ||
    context.input?.requestId ||
    context.runId ||
    `fept-${Date.now()}`
  )
}

function emitFeptOutboxEvent(params: {
  context: WorkflowActionContext
  topic: string
  dedupeKey: string
  payload: Record<string, unknown>
}): void {
  outboxService.enqueue({
    topic: params.topic,
    aggregateKey: params.context.tenantId,
    dedupeKey: params.dedupeKey,
    payload: {
      runId: params.context.runId,
      tenantId: params.context.tenantId,
      providerRef: getProviderRef(params.context),
      emittedAt: new Date().toISOString(),
      ...params.payload,
    },
  })
}

function resolveValue(context: WorkflowActionContext, value: any): any {
  if (typeof value !== 'string') return value
  if (!(value.startsWith('input.') || value.startsWith('state.'))) return value

  const pathParts = value.split('.')
  let resolved: any = context
  for (const p of pathParts) {
    resolved = resolved?.[p]
  }
  return resolved
}

export class FieldExecutionActions {
  private static hasApprovalProof(context: WorkflowActionContext): boolean {
    const approvalPresentation = context.input?.approvalPresentation || context.state?.approvalPresentation
    const approvalSignature = context.input?.approvalSignature || context.state?.approvalSignature
    return Boolean(approvalPresentation || approvalSignature)
  }

  public static async transition(context: WorkflowActionContext, config: any = {}) {
    const target = config?.to as string
    if (!target) throw new Error('field.transition requires config.to')

    const current = String(context.state.workflowStage || config.from || 'DRAFT')

    if (current === target) {
      logger.debug({ current, target }, 'Idempotent transition (already at target stage)')
      return
    }

    const allowedTransitions = config.allowedTransitions || DEFAULT_TRANSITIONS
    const allowed = allowedTransitions[current] || []

    if (!allowed.includes(target)) {
      const currentIndex = FEPT_FORWARD_STAGE_INDEX[current]
      const targetIndex = FEPT_FORWARD_STAGE_INDEX[target]

      // Resume retries can re-enter an already progressed run at an earlier transition step.
      // Treat backward transitions on the canonical forward path as idempotent no-ops.
      if (Number.isInteger(currentIndex) && Number.isInteger(targetIndex) && currentIndex > targetIndex) {
        logger.warn(
          { from: current, to: target },
          'Ignoring replayed backward FEPT transition (state already advanced)',
        )
        return
      }

      throw new Error(`Invalid FEPT transition: ${current} -> ${target}`)
    }

    if (current === 'APPROVAL_PENDING' && target === 'APPROVED' && !FieldExecutionActions.hasApprovalProof(context)) {
      throw new Error('Approval proof required: provide approvalPresentation or approvalSignature before approving')
    }

    context.state.workflowStage = target
    context.state.lastTransitionAt = new Date().toISOString()

    // Audit trail: who moved the job to each stage and when. Read by the "full history"
    // view on the portal and the app; capped so a long-running job cannot grow unbounded.
    const history = Array.isArray(context.state.stageHistory) ? [...context.state.stageHistory] : []
    history.push({
      stage: target,
      from: current || undefined,
      at: context.state.lastTransitionAt,
      by: context.input?.actedByUserId || undefined,
    })
    context.state.stageHistory = history.slice(-40)

    if (target === 'ASSIGNED') {
      const providerRef = getProviderRef(context)
      new ReconciliationService().recordEvent(providerRef, 'AGENT_ASSIGNED', 'workflow', {
        tenantId: context.tenantId,
        assigneeId: context.state.assignment?.assigneeId,
        assignedAt: context.state.assignment?.assignedAt,
      })
    }

    emitFeptOutboxEvent({
      context,
      topic: 'field.stage.changed',
      dedupeKey: `fept-stage:${context.runId}:${target}`,
      payload: {
        workflowStage: target,
        previousStage: current,
      },
    })

    if (target === 'IN_PROGRESS') {
      const providerRef = getProviderRef(context)
      new ReconciliationService().recordEvent(providerRef, 'JOB_STARTED', 'workflow', {
        tenantId: context.tenantId,
        startedAt: context.state.lastTransitionAt,
      })
    }

    logger.info({ from: current, to: target }, 'FEPT transition applied')
  }

  public static async assign(context: WorkflowActionContext, config: any = {}) {
    let assigneeId = explicitAssignee(context.input?.assigneeId || resolveValue(context, config.assigneeId))
    let assigneeUserId = explicitAssignee(context.input?.assigneeUserId || resolveValue(context, config.assigneeUserId))
    let assigneeWalletTenantId =
      context.input?.assigneeWalletTenantId || resolveValue(context, config.assigneeWalletTenantId)

    // "owner" and a blank selection mean "use the person the org configured".
    // Owner fallback is a setup gap, not an assignment.
    if (!assigneeId) {
      const configured = orgWorkflowActorService.resolveActor({
        orgTenantId: context.tenantId,
        workflowType: 'field_execution_fept',
        stageAction: 'assign_field_worker',
      })
      if (configured.mode !== 'owner_fallback' && configured.mode !== 'unassigned' && (configured.userId || configured.walletTenantId)) {
        assigneeId = configured.userId || configured.walletTenantId
        assigneeUserId = assigneeUserId || configured.userId
        assigneeWalletTenantId = assigneeWalletTenantId || configured.walletTenantId
        context.input = { ...(context.input || {}), assigneeId, assigneeUserId, assigneeWalletTenantId }
        logger.info(
          { runId: context.runId, assigneeId, mode: configured.mode },
          'field.assign: assignee resolved from org stage actor',
        )
      }
    }

    if (!assigneeId) {
      throw new Error(
        'field.assign requires a named worker or a configured field worker in Workflow Actors. The owner is not used as a silent assignee.',
      )
    }

    if (context.state.assignment?.assigneeId === assigneeId && context.state.assignment?.status === 'assigned') {
      logger.debug({ assigneeId }, 'Idempotent assignment')
      return
    }

    context.state.assignment = {
      assigneeId,
      dispatcherId: context.input?.dispatcherId || config.dispatcherId,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
    }

    // Sign-off is a different person from the worker. Use the one named on the job,
    // or the customer sign-off actor configured before the run.
    const receiverId = resolveReceiverId(context)
    if (receiverId && context.input?.receiverId !== receiverId) {
      context.input = { ...(context.input || {}), receiverId }
    } else if (!receiverId) {
      logger.warn(
        { runId: context.runId },
        'field.assign: no sign-off person. Set one on the job or in Workflow Actors before customer sign-off.',
      )
    }

    await FieldExecutionActions.transition(context, { to: 'ASSIGNED' })

    // Deliver a task notification into the assignee's personal wallet inbox.
    // The outbox relay resolves the assignee phone ? tenant ? wallet_pending_offers.
    outboxService.enqueue({
      topic: 'field.task.assigned',
      aggregateKey: context.tenantId,
      dedupeKey: `field-assign:${context.runId}:${assigneeId}`,
      payload: {
        orgTenantId: context.tenantId,
        runId: context.runId,
        assigneeId,
        assigneeUserId,
        assigneeWalletTenantId,
        assigneeRole: context.input?.assigneeRole || resolveValue(context, config.assigneeRole) || 'Field worker',
        dispatcherId: context.input?.dispatcherId || config.dispatcherId,
        poNumber: context.input?.poNumber || context.input?.reference || context.runId,
        clientName: context.input?.clientName || '',
        location: context.input?.location || '',
        description: context.input?.description || '',
        scheduledDate: context.input?.scheduledDate || '',
        assignedAt: context.state.assignment.assignedAt,
      },
    })

    logger.info({ runId: context.runId, assigneeId }, 'field.assign: task.assigned outbox event enqueued')

    // The worker's inbox is the job card. Routing uses the configured field actor,
    // which is the same person assignment just resolved when the dispatcher did not name someone else.
    if (context.runId && context.tenantId) {
      try {
        routeWorkflowStageInbox({
          orgTenantId: context.tenantId,
          requestType: 'field.site_access',
          workflowType: 'field_execution_fept',
          sourceId: context.runId,
          assigneeUserId: assigneeUserId || assigneeId,
          title: `Job ${context.input?.reference || context.input?.poNumber || context.runId}`,
          body: 'A field job is assigned to you. Open it and start when you arrive.',
          amount: typeof context.input?.amount === 'number' ? context.input.amount : undefined,
        })
      } catch (error: any) {
        logger.warn({ error: error?.message, runId: context.runId }, 'field.assign: worker inbox card was not written')
      }
    }
  }

  public static async pause(context: WorkflowActionContext, config: any = {}) {
    // A pause tied to a checkpoint (or to an optional sign-off) is skipped when the
    // dispatcher waived it for this job, so a waived checkpoint never leaves the run waiting.
    const checkpointName = config?.checkpoint as FeptCheckpointName | undefined
    if (checkpointName && FEPT_CHECKPOINTS[checkpointName]) {
      const def = FEPT_CHECKPOINTS[checkpointName]
      if (!isCheckpointRequired(context.input, def)) return
      if (context.state.checkpoints?.[checkpointName]?.status === 'completed') return
    }
    if (config?.requireFlag && !flagEnabled(context.input, String(config.requireFlag), config.requiredByDefault !== false)) {
      return
    }
    if (config?.reason) {
      context.state.pauseReason = config.reason
      context.state.pauseRequestedAt = new Date().toISOString()
      FieldExecutionActions.notifyStagePerson(context, String(config.reason))
    }
    throw new Error('WORKFLOW_PAUSE')
  }

  /**
   * Sign-off and payout are done by their own people. When the run stops at one of those
   * steps, put a card in that person's inbox so they know the job is waiting for them.
   */
  private static notifyStagePerson(context: WorkflowActionContext, reason: string): void {
    if (!context.runId || !context.tenantId) return
    const jobRef = context.input?.reference || context.input?.poNumber || context.runId
    try {
      if (reason === 'await_acknowledgement') {
        const receiverId = resolveReceiverId(context)
        routeWorkflowStageInbox({
          orgTenantId: context.tenantId,
          requestType: 'field.signoff',
          workflowType: 'field_execution_fept',
          sourceId: `${context.runId}:signoff`,
          assigneeUserId: receiverId,
          title: `Sign off job ${jobRef}`,
          body: 'The work is finished and reviewed. Check it and sign off from your wallet.',
          amount: typeof context.input?.amount === 'number' ? context.input.amount : undefined,
          extraMetadata: { workflowRunId: context.runId, workflowStage: 'EVIDENCE_CAPTURED', pauseReason: reason },
        })
      } else if (reason === 'await_completion_review') {
        // The reviewer is usually not the worker; tell them the finished work is waiting.
        if (!FieldExecutionActions.stageActorIsWorker(context, 'review_completion')) {
          routeWorkflowStageInbox({
            orgTenantId: context.tenantId,
            requestType: 'field.review',
            workflowType: 'field_execution_fept',
            sourceId: `${context.runId}:review`,
            title: `Review job ${jobRef}`,
            body: 'The worker finished and added photos. Check the finished work before sign-off.',
            amount: typeof context.input?.amount === 'number' ? context.input.amount : undefined,
            extraMetadata: { workflowRunId: context.runId, workflowStage: 'EVIDENCE_CAPTURED', pauseReason: reason },
          })
        }
      } else if (reason === 'await_site_inspection') {
        // Only when someone other than the worker checks the site; the worker already has the job card.
        if (!FieldExecutionActions.stageActorIsWorker(context, 'inspect_site')) {
          routeWorkflowStageInbox({
            orgTenantId: context.tenantId,
            requestType: 'field.inspection',
            workflowType: 'field_execution_fept',
            sourceId: `${context.runId}:inspection`,
            title: `Site check for job ${jobRef}`,
            body: 'Check the site before the worker starts the job.',
            amount: typeof context.input?.amount === 'number' ? context.input.amount : undefined,
            extraMetadata: { workflowRunId: context.runId, workflowStage: 'ASSIGNED', pauseReason: reason },
          })
        }
      } else if (reason === 'await_payout_release') {
        FieldExecutionActions.closeStageCards(context.runId, `${context.runId}:signoff`)
        routeWorkflowStageInbox({
          orgTenantId: context.tenantId,
          requestType: 'field.payout',
          workflowType: 'field_execution_fept',
          sourceId: `${context.runId}:payout`,
          title: `Release payment for job ${jobRef}`,
          body: 'The job is signed off. Release the payment from your wallet.',
          amount: typeof context.input?.amount === 'number' ? context.input.amount : undefined,
          extraMetadata: { workflowRunId: context.runId, workflowStage: 'ACKNOWLEDGED', pauseReason: reason },
        })
      }
    } catch (error: any) {
      logger.warn({ error: error?.message, runId: context.runId, reason }, 'Stage person inbox card was not written')
    }
  }

  /** True when the person chosen for a step is the assigned worker (or nobody is chosen). */
  private static stageActorIsWorker(context: WorkflowActionContext, stageAction: string): boolean {
    const assigneeId = String(context.state.assignment?.assigneeId || context.input?.assigneeId || '')
    try {
      const actor = orgWorkflowActorService.resolveActor({
        orgTenantId: context.tenantId,
        workflowType: 'field_execution_fept',
        stageAction,
      })
      if (actor.mode === 'owner_fallback' || actor.mode === 'unassigned') return true
      if (!actor.userId && !actor.walletTenantId) return true
      return Boolean(actor.userId) && actor.userId === assigneeId
    } catch {
      return true
    }
  }

  /** Close open stage cards for a run (optionally one specific card source). */
  public static closeStageCards(runId: string, sourceId?: string): void {
    try {
      DatabaseManager.getDatabase()
        .prepare(
          `UPDATE wallet_pending_offers SET resolved_at = ?
           WHERE source_type = 'workflow_stage_action' AND source_id = ? AND resolved_at IS NULL`,
        )
        .run(new Date().toISOString(), sourceId || runId)
    } catch (error: any) {
      logger.warn({ error: error?.message, runId }, 'Could not close stage cards')
    }
  }

  /**
   * Record a pre-work checkpoint (site inspection, risk assessment, arrival proof).
   * Runs after the matching `field.pause`; the resume API has already validated the payload.
   */
  public static async checkpoint(context: WorkflowActionContext, config: any = {}) {
    const name = config?.checkpoint as FeptCheckpointName
    const def = FEPT_CHECKPOINTS[name]
    if (!def) throw new Error(`field.checkpoint requires a known checkpoint (got ${String(config?.checkpoint)})`)

    const checkpoints = (context.state.checkpoints = { ...(context.state.checkpoints || {}) })

    if (!isCheckpointRequired(context.input, def)) {
      checkpoints[name] = { status: 'waived', waivedAt: new Date().toISOString() }
      return
    }
    if (checkpoints[name]?.status === 'completed') {
      logger.debug({ checkpoint: name }, 'Idempotent checkpoint')
      return
    }

    const check = validateCheckpointPayload(name, context.input?.[def.inputKey])
    if (!check.ok) throw new Error(check.error)

    const completedBy = context.input?.actedByUserId || context.state.assignment?.assigneeId || context.input?.assigneeId
    const completedAt = new Date().toISOString()
    checkpoints[name] = { status: 'completed', completedAt, completedBy, data: check.value }
    context.state[def.inputKey] = { ...check.value, completedAt, completedBy }
    delete context.state.pauseReason
    if (context.runId && name === 'completion_review') FieldExecutionActions.closeStageCards(context.runId, `${context.runId}:review`)
    if (context.runId && name === 'site_inspection') FieldExecutionActions.closeStageCards(context.runId, `${context.runId}:inspection`)

    new ReconciliationService().recordEvent(getProviderRef(context), def.reconciliationEvent, 'workflow', {
      tenantId: context.tenantId,
      checkpoint: name,
      completedBy,
      completedAt,
    })

    emitFeptOutboxEvent({
      context,
      topic: 'field.checkpoint.completed',
      dedupeKey: `fept-checkpoint:${context.runId}:${name}`,
      payload: { checkpoint: name, completedBy, workflowStage: context.state.workflowStage },
    })
  }

  /**
   * Validate a resume submission before the engine runs the next step. A bad or blocking
   * checkpoint submission is rejected here so the run stays paused instead of failing.
   */
  public static prepareResume(runId: string, resumeData: any, actedByUserId?: string): void {
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.status !== 'paused') return
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    const def = FEPT_CHECKPOINT_BY_PAUSE_REASON[String(state.pauseReason || '').toLowerCase()]
    if (!def) return
    if (state.checkpoints?.[def.name]?.status === 'completed') return

    const check = validateCheckpointPayload(def.name, resumeData?.[def.inputKey])
    if (check.ok) return

    if (check.blocked) {
      const blocks = Array.isArray(state.checkpointBlocks) ? state.checkpointBlocks : []
      blocks.push({
        checkpoint: def.name,
        at: new Date().toISOString(),
        by: actedByUserId,
        reason: check.error,
        attempt: check.attempt,
      })
      state.checkpointBlocks = blocks
      DatabaseManager.getDatabase()
        .prepare(`UPDATE workflow_runs SET output = ? WHERE id = ?`)
        .run(JSON.stringify(state), runId)
    }
    throw new Error(check.error)
  }

  public static async captureEvidence(context: WorkflowActionContext, config: any = {}) {
    const requireGps = Boolean(config.requireGps)
    const requirePhoto = Boolean(config.requirePhoto)
    const requireSignature = Boolean(config.requireAcknowledgementSignature)

    // Revolutionary: VC-First Evidence
    const performanceVc = context.input?.performanceVc
    const receiptVc = context.input?.receiptVc
    const isVcEvidence = !!(performanceVc || receiptVc)

    const evidence = {
      evidenceHash: context.input?.evidenceHash || performanceVc?.id || receiptVc?.id,
      gps: context.input?.gps || performanceVc?.credentialSubject?.location || receiptVc?.credentialSubject?.location,
      photoUri:
        context.input?.photoUri || performanceVc?.credentialSubject?.photo || receiptVc?.credentialSubject?.photo,
      signature: context.input?.signature,
      capturedBy: context.input?.assigneeId || context.state.assignment?.assigneeId,
      // Server-sealed time: set here, never trusted from the client.
      capturedAt: new Date().toISOString(),
      // Device time when the live photo was taken (informational; shown next to the sealed time).
      deviceCapturedAt:
        typeof context.input?.deviceCapturedAt === 'string' && !Number.isNaN(Date.parse(context.input.deviceCapturedAt))
          ? new Date(context.input.deviceCapturedAt).toISOString()
          : undefined,
      notes:
        context.input?.notes ||
        performanceVc?.credentialSubject?.description ||
        receiptVc?.credentialSubject?.description,
      vcId: performanceVc?.id || receiptVc?.id,
      vcType: performanceVc ? 'PerformanceVC' : receiptVc ? 'ReceiptVC' : undefined,
      // Extra photos taken in the same step. The first photo stays the sealed one.
      attachments: extraEvidenceAttachments(context.input?.attachments),
    }

    if (!evidence.evidenceHash) {
      // FEPT: pause the run so the field worker can submit photo evidence from the mobile app
      logger.info({ runId: context.runId }, 'Pausing workflow � awaiting field evidence upload')
      throw new Error('WORKFLOW_PAUSE')
    }
    if (requireGps && !evidence.gps) throw new Error('GPS evidence is required')
    if (requirePhoto && !evidence.photoUri) throw new Error('Photo evidence is required')
    if (requireSignature && !evidence.signature) throw new Error('Signature evidence is required')

    const phaseRaw = String(
      context.input?.phase || config.phase || (context.state.workflowStage === 'IN_PROGRESS' ? 'before' : 'after'),
    ).toLowerCase()
    const phase = phaseRaw === 'receipt' ? 'receipt' : phaseRaw === 'after' ? 'after' : 'before'

    const existingBeforeHash =
      context.state.evidenceBefore?.evidenceHash || context.state.evidence?.before?.evidenceHash
    const existingAfterHash = context.state.evidenceAfter?.evidenceHash || context.state.evidence?.after?.evidenceHash
    const existingReceiptHash =
      context.state.evidenceReceipt?.evidenceHash || context.state.evidence?.receipt?.evidenceHash

    if (phase === 'before') {
      if (existingBeforeHash && !existingAfterHash && existingBeforeHash !== evidence.evidenceHash) {
        throw new Error('Before evidence is already captured. Upload after-work evidence with phase=after.')
      }

      if (existingBeforeHash && existingBeforeHash === evidence.evidenceHash) {
        logger.debug({ evidenceHash: evidence.evidenceHash }, 'Idempotent before-evidence capture')
        return
      }

      context.state.evidenceBefore = evidence
      context.state.evidence = {
        ...(context.state.evidence || {}),
        before: evidence,
        latest: evidence,
        phase: 'before',
        evidenceHash: evidence.evidenceHash,
        photoUri: evidence.photoUri,
      }
    } else if (phase === 'after') {
      if (!existingBeforeHash) {
        throw new Error('Before evidence must be uploaded before after evidence')
      }

      if (existingAfterHash && existingAfterHash === evidence.evidenceHash) {
        logger.debug({ evidenceHash: evidence.evidenceHash }, 'Idempotent after-evidence capture')
        return
      }

      context.state.evidenceAfter = evidence
      context.state.evidence = {
        ...(context.state.evidence || {}),
        after: evidence,
        latest: evidence,
        phase: 'after',
        evidenceHash: evidence.evidenceHash,
        photoUri: evidence.photoUri,
      }

      await FieldExecutionActions.transition(context, { to: 'EVIDENCE_CAPTURED' })
    } else if (phase === 'receipt') {
      if (!existingAfterHash) {
        throw new Error('After evidence must be uploaded before receipt evidence')
      }

      if (existingReceiptHash && existingReceiptHash === evidence.evidenceHash) {
        logger.debug({ evidenceHash: evidence.evidenceHash }, 'Idempotent receipt-evidence capture')
        return
      }

      context.state.evidenceReceipt = evidence
      context.state.evidence = {
        ...(context.state.evidence || {}),
        receipt: evidence,
        latest: evidence,
        phase: 'receipt',
        evidenceHash: evidence.evidenceHash,
        photoUri: evidence.photoUri,
      }
    }

    const providerRef = getProviderRef(context)
    const eventType =
      phase === 'before' ? 'WORK_EVIDENCE_BEFORE' : phase === 'after' ? 'WORK_EVIDENCE_AFTER' : 'WORK_EVIDENCE_RECEIPT'
    new ReconciliationService().recordEvent(providerRef, eventType, 'workflow', {
      tenantId: context.tenantId,
      phase,
      evidenceHash: evidence.evidenceHash,
      photoUri: evidence.photoUri,
      vcId: evidence.vcId,
      vcType: evidence.vcType,
      isVerifiable: isVcEvidence,
    })

    emitFeptOutboxEvent({
      context,
      topic: 'field.evidence.captured',
      dedupeKey: `fept-evidence:${context.runId}:${phase}:${evidence.evidenceHash}`,
      payload: {
        phase,
        evidenceHash: evidence.evidenceHash,
        workflowStage: context.state.workflowStage,
        vcType: evidence.vcType,
      },
    })
  }

  public static async acknowledge(context: WorkflowActionContext, config: any = {}) {
    const receiverId = resolveReceiverId(context) || explicitAssignee(resolveValue(context, config.receiverId))

    if (receiverId && context.input?.receiverId !== receiverId) {
      context.input = { ...(context.input || {}), receiverId }
    }

    if (!receiverId) {
      throw new Error(
        'Choose who signs off this job, or set the customer sign-off person in Workflow Actors before this step.',
      )
    }

    if (!hasAfterEvidence(context)) {
      throw new Error('After evidence must be uploaded before acknowledgement')
    }

    const currentStage = String(context.state.workflowStage || '').toUpperCase()
    const alreadyAcknowledged =
      context.state.ack?.receiverId === receiverId && context.state.ack?.status === 'acknowledged'

    if (alreadyAcknowledged) {
      if (!hasReachedForwardStage(currentStage, 'ACKNOWLEDGED')) {
        // Recover legacy/partial runs where ack payload was written but stage transition failed.
        if (currentStage === 'IN_PROGRESS' && hasAfterEvidence(context)) {
          await FieldExecutionActions.transition(context, { to: 'EVIDENCE_CAPTURED' })
        }
        await FieldExecutionActions.transition(context, { to: 'ACKNOWLEDGED' })
      }
      logger.debug({ receiverId }, 'Idempotent acknowledgement')
      return
    }

    const ackPresentation = context.input?.acknowledgementPresentation
    const isVcAck = !!ackPresentation

    // Sign-off is proven from the sign-off person's wallet (server-verified). Only when the
    // dispatcher turned customer sign-off off for this job may the step pass without it.
    const signoffRequired = flagEnabled(context.input, 'requireCustomerSignoff', true)
    if (config.requireProof && signoffRequired && !isVcAck) {
      throw new Error('Sign-off needs a wallet proof from the sign-off person. Use the sign-off action, not a plain resume.')
    }

    context.state.ack = {
      receiverId,
      notes: context.input?.ackNotes || config.notes,
      acknowledgedAt: new Date().toISOString(),
      status: 'acknowledged',
      isVerifiable: isVcAck,
      presentationId: ackPresentation?.id,
      holderDid: ackPresentation?.holderDid,
      presentedTypes: ackPresentation?.presentedTypes,
    }
    delete context.state.pauseReason

    const providerRef = getProviderRef(context)
    new ReconciliationService().recordEvent(providerRef, 'EXECUTION_ACKNOWLEDGED', 'workflow', {
      tenantId: context.tenantId,
      amount: context.input?.amount,
      currency: context.input?.currency,
      isVerifiable: isVcAck,
      presentationId: ackPresentation?.id,
    })

    await FieldExecutionActions.transition(context, { to: 'ACKNOWLEDGED' })
  }

  public static async triggerPayment(context: WorkflowActionContext, config: any = {}) {
    const providerRef = getProviderRef(context)
    const currentStage = String(context.state.workflowStage || '').toUpperCase()

    if (!hasAfterEvidence(context)) {
      throw new Error('After evidence is required before payment can be triggered')
    }

    if (context.state.ack?.status !== 'acknowledged' && !hasReachedForwardStage(currentStage, 'ACKNOWLEDGED')) {
      throw new Error('Acknowledgement is required before payment can be triggered')
    }

    if (context.state.payment?.providerRef === providerRef && context.state.payment?.status === 'triggered') {
      if (!hasReachedForwardStage(currentStage, 'PAYMENT_TRIGGERED')) {
        if (context.state.ack?.status === 'acknowledged' && !hasReachedForwardStage(currentStage, 'ACKNOWLEDGED')) {
          if (currentStage === 'IN_PROGRESS' && hasAfterEvidence(context)) {
            await FieldExecutionActions.transition(context, { to: 'EVIDENCE_CAPTURED' })
          }
          await FieldExecutionActions.transition(context, { to: 'ACKNOWLEDGED' })
        }
        await FieldExecutionActions.transition(context, { to: 'PAYMENT_TRIGGERED' })
      }
      logger.debug({ providerRef }, 'Idempotent payment trigger')
      return
    }

    const releasePresentation = context.input?.releasePresentation
    const releaseRequired = flagEnabled(context.input, 'requirePayoutRelease', true)
    if (config.requireProof && releaseRequired && !releasePresentation) {
      throw new Error('Releasing payment needs a wallet proof from the payout person. Use the payout action, not a plain resume.')
    }

    const amount = context.input?.amount || config.amount
    const currency = context.input?.currency || config.currency || 'USD'

    context.state.payment = {
      providerRef,
      status: 'triggered',
      amount,
      currency,
      triggeredAt: new Date().toISOString(),
      releasedBy: context.input?.actedByUserId,
      notes: context.input?.payoutNotes,
      isVerifiable: Boolean(releasePresentation),
      presentationId: releasePresentation?.id,
      holderDid: releasePresentation?.holderDid,
    }
    delete context.state.pauseReason
    if (context.runId) FieldExecutionActions.closeStageCards(context.runId, `${context.runId}:payout`)

    new ReconciliationService().recordEvent(providerRef, 'PAYMENT_SUCCESS', 'workflow', {
      tenantId: context.tenantId,
      amount,
      currency,
      releasedBy: context.input?.actedByUserId,
      isVerifiable: Boolean(releasePresentation),
      presentationId: releasePresentation?.id,
    })

    await FieldExecutionActions.transition(context, { to: 'PAYMENT_TRIGGERED' })
  }

  public static async markReceiptIssued(context: WorkflowActionContext) {
    const providerRef = getProviderRef(context)
    const currentStage = String(context.state.workflowStage || '').toUpperCase()

    if (context.state.receipt?.status === 'issued' && context.state.receipt?.providerRef === providerRef) {
      if (!hasReachedForwardStage(currentStage, 'RECEIPT_ISSUED')) {
        await FieldExecutionActions.transition(context, { to: 'RECEIPT_ISSUED' })
      }
      logger.debug({ providerRef }, 'Idempotent receipt mark')
      return
    }

    context.state.receipt = {
      providerRef,
      status: 'issued',
      issuedAt: new Date().toISOString(),
    }

    new ReconciliationService().recordEvent(providerRef, 'RECEIPT_ISSUED', 'workflow', {
      tenantId: context.tenantId,
      amount: context.input?.amount,
      currency: context.input?.currency,
    })

    await FieldExecutionActions.transition(context, { to: 'RECEIPT_ISSUED' })
  }

  public static async reconcile(context: WorkflowActionContext, config: any = {}) {
    const providerRef = getProviderRef(context)
    const currentStage = String(context.state.workflowStage || '').toUpperCase()

    if (context.state.reconciliation?.status === 'reconciled') {
      if (!hasReachedForwardStage(currentStage, 'RECONCILED')) {
        await FieldExecutionActions.transition(context, { to: 'RECONCILED' })
      }
      logger.debug({ providerRef }, 'Idempotent reconciliation')
      return
    }

    const mode = config.mode || context.input?.reconciliationMode || 'automatic'

    context.state.reconciliation = {
      status: 'reconciled',
      mode,
      reconciledAt: new Date().toISOString(),
    }
    // The job is closed: the worker's "open job" card has nothing left to do.
    if (context.runId) FieldExecutionActions.closeStageCards(context.runId)

    new ReconciliationService().recordEvent(providerRef, 'SETTLEMENT_CONFIRMED', 'workflow', {
      tenantId: context.tenantId,
      amount: context.input?.amount,
      currency: context.input?.currency,
      evidenceHash: context.state.evidence?.evidenceHash,
    })

    new ReconciliationService().recordEvent(providerRef, 'JOB_CLOSED', 'workflow', {
      tenantId: context.tenantId,
      closedAt: context.state.reconciliation.reconciledAt,
    })

    await FieldExecutionActions.transition(context, { to: 'RECONCILED' })
  }

  /**
   * Move a waiting job to another available worker without advancing the checkpoint.
   * The previous worker's inbox card is closed and the new worker receives the job.
   */
  public static reassignRun(runId: string, assigneeUserId: string, actedByUserId?: string): { assigneeId: string; workflowStage?: string; pauseReason?: string } {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    // Every FEPT checkpoint (inspection, risk assessment, start, arrival, before/after/receipt,
    // sign-off) is a paused run, so "paused" covers any step of a live job. A failed or finished run
    // has no next step to hand over.
    if (run.status !== 'paused') {
      throw new Error(
        run.status === 'failed'
          ? 'This job failed and has no next step to hand over. Restart it from the request.'
          : `A job can be reassigned while it is waiting for its next step (status: ${run.status})`,
      )
    }

    const state = (run.output && typeof run.output === 'object' ? { ...run.output } : {}) as Record<string, any>
    const stage = String(state.workflowStage || '').toUpperCase()
    if (['COMPLETED', 'CANCELLED', 'REVOKED'].includes(stage)) {
      throw new Error(`A ${stage.toLowerCase()} job cannot be reassigned`)
    }

    const nextAssignee = explicitAssignee(assigneeUserId)
    if (!nextAssignee) {
      throw new Error('Choose an available organization member. The owner is not a reassignment target.')
    }

    const member = DatabaseManager.getDatabase()
      .prepare(
        `SELECT m.user_id AS userId, u.tenant_id AS walletTenantId
         FROM org_memberships m
         LEFT JOIN ssi_users u ON u.id = m.user_id
         WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active'
         LIMIT 1`,
      )
      .get(run.tenantId, nextAssignee) as { userId?: string; walletTenantId?: string } | undefined
    if (!member?.userId || !member.walletTenantId) {
      throw new Error('That person is not an active member with a wallet in this organization')
    }

    const previous = state.assignment?.assigneeId
    const now = new Date().toISOString()
    state.assignment = {
      ...(state.assignment || {}),
      assigneeId: member.userId,
      reassignedFrom: previous,
      reassignedBy: actedByUserId,
      assignedAt: now,
      status: 'assigned',
    }
    state.reassignments = [
      ...(Array.isArray(state.reassignments) ? state.reassignments : []),
      { from: previous, to: member.userId, by: actedByUserId, at: now, stage },
    ]

    const input = {
      ...(run.input || {}),
      assigneeId: member.userId,
      assigneeUserId: member.userId,
    }
    DatabaseManager.getDatabase()
      .prepare(`UPDATE workflow_runs SET input = ?, output = ? WHERE id = ?`)
      .run(JSON.stringify(input), JSON.stringify(state), runId)

    // Close every open card for the previous worker: the routed stage card and the assignment card.
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE wallet_pending_offers SET resolved_at = ?
         WHERE source_type IN ('workflow_stage_action', 'workflow_assignment')
           AND (source_id = ? OR workflow_run_id = ?)
           AND resolved_at IS NULL`,
      )
      .run(now, runId, runId)

    // Give the new worker the assignment card too (the outbox relay writes it to their wallet inbox).
    outboxService.enqueue({
      topic: 'field.task.assigned',
      aggregateKey: run.tenantId,
      dedupeKey: `field-assign:${runId}:${member.userId}:${now}`,
      payload: {
        orgTenantId: run.tenantId,
        runId,
        assigneeId: member.userId,
        assigneeUserId: member.userId,
        assigneeWalletTenantId: member.walletTenantId,
        assigneeRole: 'Field worker',
        poNumber: input.poNumber || input.reference || runId,
        clientName: input.clientName || '',
        location: input.location || '',
        description: input.description || '',
        scheduledDate: input.scheduledDate || '',
        assignedAt: now,
        reassigned: true,
      },
    })

    routeWorkflowStageInbox({
      orgTenantId: run.tenantId,
      requestType: 'field.site_access',
      workflowType: 'field_execution_fept',
      sourceId: runId,
      assigneeUserId: member.userId,
      title: `Job ${input.reference || input.poNumber || runId}`,
      body: 'This field job was reassigned to you.',
      amount: typeof input.amount === 'number' ? input.amount : undefined,
    })

    return { assigneeId: member.userId, workflowStage: state.workflowStage, pauseReason: state.pauseReason }
  }
}

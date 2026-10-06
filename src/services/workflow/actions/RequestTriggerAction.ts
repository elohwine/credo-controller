/**
 * workflow action `request.trigger`
 *
 * From inside a running workflow, start the next platform request. When config.requestType
 * is set, that type is created. Otherwise the built-in (or org-configured) handoff catalog
 * runs for the parent request's current type as if it were approved.
 */

import type { WorkflowActionContext } from '../ActionRegistry'

import { rootLogger } from '../../../utils/pinoLogger'
import { requestHandoffService } from '../../RequestHandoffService'

const logger = rootLogger.child({ module: 'RequestTriggerAction' })

export async function triggerFollowOnRequest(context: WorkflowActionContext, config: any = {}): Promise<void> {
  const parentRequestId = String(context.input?.requestId || context.state.requestId || '').trim()
  if (!parentRequestId) {
    context.state.triggeredRequest = { status: 'skipped', reason: 'request.trigger requires input.requestId' }
    return
  }

  const toType = String(config.requestType || config.toType || '').trim()
  try {
    if (toType) {
      const spawned = requestHandoffService.triggerExplicit({
        tenantId: context.tenantId,
        parentRequestId,
        toType,
        title: config.title,
        targetModule: config.targetModule,
        copyItems: config.copyItems,
      })
      context.state.triggeredRequest = spawned
        ? { status: 'created', ...spawned }
        : { status: 'skipped', reason: 'follow-on request was not created' }
      return
    }

    const spawned = requestHandoffService.continueFromPlatformRequest({
      tenantId: context.tenantId,
      requestId: parentRequestId,
      requestType: String(context.input?.requestType || config.fromType || ''),
      toStatus: String(config.onStatus || 'approved'),
    })
    context.state.triggeredRequest = { status: spawned.length > 0 ? 'created' : 'skipped', spawned }
  } catch (error: any) {
    logger.warn({ error: error?.message, parentRequestId }, 'request.trigger failed')
    context.state.triggeredRequest = { status: 'failed', reason: error?.message || 'request.trigger failed' }
  }
}

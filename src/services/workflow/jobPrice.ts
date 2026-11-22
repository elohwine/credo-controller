/**
 * A booked field job is priced by the organisation, not by the person who booked it.
 *
 * "Book a job" and other requests reach the organisation without an amount. Before the client
 * bill step, such a job waits for an owner or admin to set the price and how the client pays
 * (or to say there is no charge), instead of skipping the bill and closing as settled.
 * Jobs created in the office set their price on creation and never wait here.
 */

import type { WorkflowActionContext } from './ActionRegistry'

import { rootLogger } from '../../utils/pinoLogger'
import { orgWorkflowActorService } from '../OrgWorkflowActorService'
import { routeWorkflowStageInbox } from '../WorkflowStageInboxService'

const logger = rootLogger.child({ module: 'jobPrice' })

export const AWAIT_JOB_PRICE = 'await_job_price'
/** The `workflow.start` key of a field job's client bill. */
export const CLIENT_BILL_KEY = 'tpl-payment-collection'

function positive(value: unknown): boolean {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0
}

/** The bill can reach the client: they are onboarded (their inbox), or the job has their mobile or email. */
export function clientReachable(input: Record<string, any> | undefined): boolean {
  return ['clientWalletTenantId', 'customerMsisdn', 'payerPhone', 'clientEmail', 'payerEmail'].some((key) =>
    Boolean(String(input?.[key] || '').trim()),
  )
}

/** Booked, the client can be reached, no price yet, and nobody said "no charge". */
export function needsJobPrice(input: Record<string, any> | undefined): boolean {
  if (!input || positive(input.amount) || input.noCharge === true) return false
  if (!clientReachable(input)) return false
  return Boolean(String(input.bookedVia || '').trim()) || input.priceLater === true
}

export function priceCardSourceId(runId: string): string {
  return `${runId}:price`
}

/** Every owner and admin gets one card: set the price so the client can be billed. */
export function notifyJobNeedsPrice(context: WorkflowActionContext): void {
  if (!context.runId || !context.tenantId) return
  const input = context.input || {}
  const ref = input.reference || input.poNumber || context.runId
  const who = String(input.clientName || '').trim() || 'The client'
  const admins = orgWorkflowActorService
    .listOrgMembers(context.tenantId)
    .filter((member) => ['owner', 'admin'].includes(String(member.role || '').toLowerCase()) && member.walletTenantId)
  for (const admin of admins) {
    try {
      routeWorkflowStageInbox({
        orgTenantId: context.tenantId,
        requestType: 'field.site_access',
        workflowType: 'field_execution_fept',
        stageAction: 'set_job_price',
        sourceId: priceCardSourceId(context.runId),
        assigneeUserId: admin.userId,
        title: `Job ${ref}: set the price`,
        body: `${who} signed off the work. Set the price and how they pay, and the bill goes to them.`,
        extraMetadata: {
          workflowRunId: context.runId,
          workflowStage: context.state.workflowStage || 'ACKNOWLEDGED',
          pauseReason: AWAIT_JOB_PRICE,
          clientName: input.clientName || '',
        },
      })
    } catch (error: any) {
      logger.warn({ runId: context.runId, userId: admin.userId, error: error?.message }, 'Job price card not sent')
    }
  }
}

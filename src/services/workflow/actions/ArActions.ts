import type { WorkflowActionContext } from '../ActionRegistry'

import { receivablePlanService, type PaymentTerms } from '../../ReceivablePlanService'
import { notificationService } from '../../NotificationService'
import { paymentLinkService } from '../../PaymentLinkService'

export class ArActions {
  public static async createPlan(context: WorkflowActionContext): Promise<void> {
    const input = context.input || {}
    const terms = (
      ['one_time', 'instalment', 'recurring'].includes(String(input.collectionType)) ? input.collectionType : 'one_time'
    ) as PaymentTerms
    const amount = Number(input.totalAmount || input.amount || 0)
    if (!amount) throw new Error('Amount is required to create a payment plan')
    if (!context.runId) throw new Error('A workflow run is required to create a payment plan')
    const created = receivablePlanService.createForJob({
      tenantId: context.tenantId,
      jobRunId: context.runId,
      billingRunId: context.runId,
      title: String(input.description || 'Customer payment'),
      reference: input.reference ? String(input.reference) : undefined,
      amount,
      currency: String(input.currency || 'USD'),
      payerName: input.payerName ? String(input.payerName) : undefined,
      payerPhone: input.payerPhone ? String(input.payerPhone) : undefined,
      terms,
      instalments: Number(input.instalments || 0) || undefined,
      cadence: input.cadence ? String(input.cadence) : undefined,
      firstDueDate: input.firstDueDate ? String(input.firstDueDate) : undefined,
      transactionType: 'collection_plan',
    })
    context.state.arPlan = {
      id: created.planId,
      transactionId: created.transactionId,
      firstLinkId: created.firstLink.id,
      paymentUrl: created.firstLink.shortlinkUrl,
      amount: created.firstLink.amount,
    }
    if (input.payerPhone || input.payerEmail) {
      let inboxItemId: string | undefined
      try {
        inboxItemId = paymentLinkService.offerToPayerInbox(created.firstLink.id)
      } catch {
        inboxItemId = undefined
      }
      await notificationService.dispatchContactNotification({
        tenantId: context.tenantId,
        inboxItemId,
        dedupeKey: `ar-plan:${created.planId}`,
        contact: {
          name: String(input.payerName || 'there'),
          phone: input.payerPhone ? String(input.payerPhone) : undefined,
          email: input.payerEmail ? String(input.payerEmail) : undefined,
        },
        type: 'payment_link',
        url: created.firstLink.shortlinkUrl,
        amount: created.firstLink.amount,
        currency: String(input.currency || 'USD'),
      })
    }
  }
}

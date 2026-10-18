export type FieldStageOutcome = { status: 'done' | 'active' | 'pending' | 'skipped' | 'held'; note: string }

export function isOrganisationJobRecord(type: string, info?: { holderScope?: string }): boolean {
  return info?.holderScope === 'organization' || ['SiteInspectionVC', 'ReceiptVC', 'ExecutionAckVC'].includes(type)
}

export const CLIENT_BILLING_HELP = {
  title: 'Client billing',
  points: [
    'Money in shows client debts, payment links and jobs that still need invoicing. A job charge is not a recorded debt until billing creates its receivable.',
    'Open a row for its contact details, stages and delivery history. The related job opens separately.',
    'Edit the client contact, then create/send the invoice or resend its existing link. Sending a link does not record payment.',
    'Renew and resend refreshes the link for 14 days without creating another debt. Paid or cancelled links cannot be renewed.',
    'Provider acceptance does not confirm the client read the message. Payment remains outstanding until the collection flow records it.',
  ],
}

export function clientInvoiceOutcome(output: any): FieldStageOutcome {
  const bill = output?.clientBill
  const collection = output?.startedWorkflows?.['tpl-payment-collection']
  if (bill?.status === 'paid') return { status: 'done', note: 'Client invoice paid' }
  if (bill?.status === 'sent')
    return bill.notification?.accepted
      ? {
          status: 'done',
          note: 'Receivable recorded; client payment message accepted by a delivery provider. Payment is still outstanding.',
        }
      : {
          status: 'active',
          note: 'Billing recorded the invoice as sent, but provider acceptance was not recorded. Payment is still outstanding.',
        }
  if (bill?.status === 'delivery_failed')
    return {
      status: 'held',
      note: 'Receivable and payment link created, but the client message was not sent. Review notification setup and share the existing link; do not create another debt.',
    }
  if (bill?.status === 'not_sent')
    return {
      status: bill.reason === 'Nothing to charge' ? 'skipped' : 'held',
      note: `Invoice not sent: ${bill.reason || 'billing did not apply'}`,
    }
  if (collection?.status === 'blocked') return { status: 'held', note: 'Invoice not sent: payment setup is incomplete' }
  if (collection?.status === 'failed')
    return { status: 'held', note: `Billing failed: ${collection.error || 'open the billing workflow for details'}` }
  if (collection?.status === 'not_needed') return { status: 'skipped', note: 'No client charge on this job' }
  if (collection?.status === 'skipped')
    return { status: 'skipped', note: `Invoice not sent: ${collection.reason || 'billing workflow skipped'}` }
  if (collection?.runId)
    return { status: 'active', note: 'Billing workflow started; invoice delivery is not yet confirmed' }
  return { status: 'pending', note: 'Client invoice has not been sent' }
}

export function fieldStageOutcome(key: string, output: any): FieldStageOutcome | undefined {
  if (!output) return undefined
  if (key === 'CLIENT_INVOICE') return clientInvoiceOutcome(output)
  if (key === 'RECEIPTS' && output.evidenceReceipt?.skipped)
    return { status: 'skipped', note: 'No materials were bought; no material receipt was issued' }
  if (key === 'PAYMENT_TRIGGERED' && output.payment?.status === 'not_needed')
    return { status: 'skipped', note: 'No worker payout on this job' }
  if (key === 'PAYMENT_TRIGGERED' && output.payment?.status === 'triggered')
    return { status: 'done', note: 'Worker payout release recorded. This is not confirmation of a money transfer.' }
  if (key === 'RECEIPT_ISSUED' && output.receipt?.status === 'not_needed')
    return { status: 'skipped', note: 'No payout receipt: no worker payout on this job' }
  if (key === 'RECEIPT_ISSUED' && output.receipt?.status === 'issued')
    return {
      status: 'done',
      note: 'Payout receipt event recorded. Delivery of a signed payout credential is not confirmed by this event.',
    }
  const checkpoint: Record<string, string> = {
    ARRIVAL: 'arrival',
    SITE_INSPECTION: 'site_inspection',
    RISK_ASSESSMENT: 'risk_assessment',
    COMPLETION_REVIEW: 'completion_review',
  }
  if (checkpoint[key] && output.checkpoints?.[checkpoint[key]]?.status === 'waived')
    return { status: 'skipped', note: 'This checkpoint was explicitly waived for this job' }
  if (key === 'ACKNOWLEDGED' && output.ack?.status === 'not_needed')
    return { status: 'skipped', note: 'Sign-off was not required for this job' }
  return undefined
}

export function fieldJobBillingExceptions(runs: any[], links: Array<{ id: string; sourceRunId?: string }>) {
  return runs.flatMap((run) => {
    const output = run.output || {}
    const collection = output.startedWorkflows?.['tpl-payment-collection']
    const amount = Number(run.input?.amount || 0)
    if (!collection || collection.status === 'not_needed' || !Number.isFinite(amount) || amount <= 0) return []
    const bill = output.clientBill
    if (links.some((link) => link.id === bill?.linkId || link.sourceRunId === run.id)) return []
    return [
      {
        runId: String(run.id),
        reference: String(run.input?.reference || run.input?.poNumber || run.id),
        client: String(run.input?.clientName || run.input?.payerName || 'Client not named'),
        amount,
        currency: String(run.input?.currency || 'USD'),
        status:
          bill?.status === 'paid'
            ? 'PAID'
            : bill?.status === 'sent'
              ? 'AWAITING PAYMENT'
              : bill?.status === 'delivery_failed'
                ? 'MESSAGE NOT SENT'
                : collection.status === 'failed'
                  ? 'BILLING FAILED'
                  : collection.status === 'blocked'
                    ? 'BILLING BLOCKED'
                    : bill?.status === 'not_sent' || collection.status === 'skipped'
                      ? 'NOT INVOICED'
                      : 'BILLING IN PROGRESS',
        note: bill?.reason || clientInvoiceOutcome(output).note,
        debtRecorded: Boolean(bill?.linkId),
        at: bill?.sentAt || collection.startedAt || run.createdAt,
      },
    ]
  })
}

export function clientBillingStages(run?: any, link?: any) {
  const bill = run?.output?.clientBill
  const notification = link?.notification || bill?.notification
  const recorded = Boolean(link?.obligationId || bill?.planId || bill?.linkId)
  const paid = link?.status === 'paid' || bill?.status === 'paid'
  const outcome = clientInvoiceOutcome(run?.output)
  return [
    {
      key: 'INVOICE',
      label: 'Receivable and payment link',
      proof: 'Record',
      status: recorded ? ('done' as const) : outcome.status === 'held' ? ('held' as const) : ('pending' as const),
      at: link?.createdAt,
      note: recorded ? 'Recorded' : bill?.reason || outcome.note,
    },
    {
      key: 'NOTIFIED',
      label: 'Client payment message',
      proof: 'Record',
      status: notification?.accepted ? ('done' as const) : recorded ? ('held' as const) : ('pending' as const),
      at: notification?.at || bill?.sentAt,
      note: notification?.accepted ? 'Provider accepted' : 'Not sent / unconfirmed',
    },
    {
      key: 'PAID',
      label: 'Client payment received',
      proof: 'Record',
      status: paid ? ('done' as const) : ('pending' as const),
      at: link?.paidAt || bill?.paidAt,
      note: paid ? 'Payment recorded' : recorded ? 'Outstanding' : 'Not invoiced',
    },
  ].map((stage) => ({ ...stage, vcType: 'BillingRecord' }))
}

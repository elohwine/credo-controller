import { describe, expect, test } from '@jest/globals'

import {
  emptyInboxHint,
  finishedItemLine,
  finishedItemStatus,
  formatTxnTime,
  groupByFlowSection,
  inboxAttention,
  inboxFlowSection,
  inboxWhenLabel,
  matchesInboxAttention,
} from '../credo-ui/mobile/lib/inboxAttention'
import { purchaseReceiptLine, purchaseReceiptsFromHandoffs } from '../credo-ui/mobile/lib/jobAuditTrail'

describe('inbox attention', () => {
  test('new, opened, and done follow the card, not the kind of work', () => {
    expect(inboxAttention({ status: 'pending' })).toBe('new')
    expect(inboxAttention({ status: 'submitted', isRead: true })).toBe('opened')
    expect(inboxAttention({ status: 'approved', isRead: false })).toBe('done')
    expect(inboxAttention({ status: 'pending', archived: true })).toBe('done')
    expect(matchesInboxAttention('opened', 'opened')).toBe(true)
    expect(matchesInboxAttention('opened', 'new')).toBe(false)
    expect(matchesInboxAttention('done', 'all')).toBe(true)
  })

  test('an approved purchase that still has to be marked bought, delivered or paid is not done', () => {
    expect(inboxAttention({ status: 'approved', stillOpen: true })).toBe('new')
    expect(inboxAttention({ status: 'approved', isRead: true, stillOpen: true })).toBe('opened')
    expect(inboxAttention({ status: 'approved', stillOpen: true, archived: true })).toBe('done')
  })

  test('purchase receipts come back to the job in one short line each', () => {
    const handoffs = [
      {
        status: 'completed',
        result: { receipts: [{ step: 'Purchase order', billRef: 'BILL-12', amount: 190, currency: 'USD' }] },
      },
      { status: 'running', result: { receipts: [{ step: 'Ignored', receiptRef: 'X' }] } },
    ]
    const receipts = purchaseReceiptsFromHandoffs(handoffs)
    expect(receipts).toHaveLength(1)
    expect(purchaseReceiptLine(receipts[0])).toBe('Purchase order: Supplier bill BILL-12 · USD 190.00')
    expect(purchaseReceiptLine({ step: 'Payment', receiptRef: 'R-1' })).toBe('Payment: Receipt R-1')
    // A wallet record that stood in for the photo is named; a photo is shown, not named.
    expect(
      purchaseReceiptLine({
        step: 'Payment',
        receiptRef: 'R-2',
        record: { id: 'vc', type: 'ReceiptVC', label: 'Receipt from Paint Shop' },
      }),
    ).toBe('Payment: Receipt R-2 · Receipt from Paint Shop')
    expect(
      purchaseReceiptLine({
        step: 'Payment',
        receiptRef: 'R-3',
        photoUri: 'data:image/png;base64,x',
        record: { id: 'vc', type: 'ReceiptVC', label: 'x' },
      }),
    ).toBe('Payment: Receipt R-3')
  })

  test('All groups by the kind of work, cards on their own', () => {
    expect(inboxFlowSection(['payments', 'jobs'])).toBe('jobs')
    expect(inboxFlowSection([], 'credential_offer')).toBe('cards')
    const sections = groupByFlowSection(
      [
        { id: 'a', tabs: ['requisitions'] },
        { id: 'b', tabs: ['jobs'] },
        { id: 'c', tabs: ['jobs'] },
      ],
      (item) => inboxFlowSection(item.tabs),
    )
    expect(sections.map((section) => section.key)).toEqual(['jobs', 'requisitions'])
    expect(sections[0].items.map((item) => item.id)).toEqual(['b', 'c'])
  })

  test('a transaction shows its date and time', () => {
    const stamp = '2026-10-10T11:00:00Z'
    const parsed = new Date(stamp)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const hours = String(parsed.getHours()).padStart(2, '0')
    const minutes = String(parsed.getMinutes()).padStart(2, '0')
    const expected = `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()} ${hours}:${minutes}`
    expect(formatTxnTime(stamp)).toBe(expected)
    expect(inboxWhenLabel(stamp)).toBe(expected)
    expect(inboxWhenLabel(stamp)).not.toMatch(/^\d+[mhd]$/)
    expect(formatTxnTime('2026-10-12')).toBe('12 Oct 2026')
    expect(formatTxnTime('2026-10-11 13:02:07')).toBe(formatTxnTime('2026-10-11T13:02:07'))
    expect(formatTxnTime('')).toBe('')
  })
})

describe('finished inbox items', () => {
  test('say what the person did and where the job is now', () => {
    expect(finishedItemLine({ outcome: 'done', runStatus: 'running', stageLabel: 'Payment sent' })).toBe(
      'Your step is done. The job is now at: Payment sent.',
    )
    expect(finishedItemLine({ outcome: 'done', runStage: 'COMPLETED' })).toBe('Your step is done. The job is complete.')
    expect(finishedItemLine({ outcome: 'rejected', runStatus: 'cancelled' })).toBe(
      'You declined this. The job was cancelled.',
    )
    expect(finishedItemLine({ outcome: 'accepted' })).toBe('Added to your wallet.')
    expect(finishedItemStatus('rejected')).toBe('rejected')
    expect(finishedItemStatus('done')).toBe('completed')
    // Finished items count as done in every view.
    expect(inboxAttention({ status: finishedItemStatus('accepted') })).toBe('done')
  })

  test('an empty view points to Done when finished items are waiting there', () => {
    expect(emptyInboxHint('new', 2)).toBe('2 finished items are under Done.')
    expect(emptyInboxHint('opened', 1)).toBe('1 finished item is under Done.')
    expect(emptyInboxHint('done', 3)).toBeNull()
    expect(emptyInboxHint('new', 0)).toBeNull()
  })
})

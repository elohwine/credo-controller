import { describe, expect, it } from '@jest/globals'

import * as mobile from '../../../credo-ui/mobile/lib/inboxAttention'
import * as portal from '../../../credo-ui/portal/lib/inboxAttention'

type Row = { id: string; at: string; action?: boolean }

const now = new Date(2026, 2, 10, 15, 0, 0)
const local = (day: number, hour: number) => new Date(2026, 2, day, hour, 0, 0).toISOString()

describe.each([
  ['mobile', mobile],
  ['portal', portal],
])('%s inbox feed', (_name, lib) => {
  const build = (rows: Row[], extra: Partial<Parameters<typeof lib.buildInboxFeed<Row>>[1]> = {}) =>
    lib.buildInboxFeed(rows, {
      keyOf: (row) => row.id,
      timeOf: (row) => Date.parse(row.at),
      now,
      ...extra,
    })
  const shape = (entries: ReturnType<typeof build>) =>
    entries.map((entry) => (entry.kind === 'item' ? `${entry.pinned ? '*' : ''}${entry.item.id}` : `[${entry.label}]`))

  it('puts the newest item first whatever its kind, under date headings', () => {
    const rows: Row[] = [
      { id: 'old-job', at: local(1, 9) },
      { id: 'yesterday-card', at: local(9, 18) },
      { id: 'new-receipt', at: local(10, 14) },
      { id: 'monday-request', at: local(6, 8) },
      { id: 'morning-update', at: local(10, 7) },
    ]
    expect(shape(build(rows))).toEqual([
      '[Today]', 'new-receipt', 'morning-update',
      '[Yesterday]', 'yesterday-card',
      '[Earlier this week]', 'monday-request',
      '[Older]', 'old-job',
    ])
  })

  it('never puts an older step above a newer item', () => {
    const rows: Row[] = [
      { id: 'a', at: local(10, 9), action: true },
      { id: 'b', at: local(10, 12) },
      { id: 'c', at: local(9, 9), action: true },
      { id: 'd', at: local(8, 9), action: true },
      { id: 'e', at: local(7, 9), action: true },
    ]
    expect(shape(build(rows, { needsAction: (row) => Boolean(row.action) }))).toEqual([
      '[Today]', 'b', 'a',
      '[Yesterday]', 'c',
      '[Earlier this week]', 'd', 'e',
    ])
  })

  it('heads the newest steps that need action, and does not repeat them', () => {
    const rows: Row[] = [
      { id: 'fresh', at: local(10, 14), action: true },
      { id: 'next', at: local(10, 13), action: true },
      { id: 'note', at: local(10, 12) },
      { id: 'older', at: local(9, 9), action: true },
    ]
    const entries = build(rows, { needsAction: (row) => Boolean(row.action) })
    expect(shape(entries)).toEqual([
      '[Needs your action]', '*fresh', '*next',
      '[Today]', 'note',
      '[Yesterday]', 'older',
    ])
    expect(entries[0]).toMatchObject({ kind: 'pinned-head', shown: 2, total: 3 })
  })

  it('marks where the items from before the last visit start', () => {
    const rows: Row[] = [
      { id: 'fresh', at: local(10, 14) },
      { id: 'seen-today', at: local(10, 8) },
      { id: 'seen-yesterday', at: local(9, 8) },
    ]
    expect(shape(build(rows, { lastSeenAt: local(10, 12) }))).toEqual([
      '[Today]', 'fresh', '[Before your last visit]', 'seen-today', '[Yesterday]', 'seen-yesterday',
    ])
    // Nothing new since the last visit: no line.
    expect(shape(build(rows, { lastSeenAt: local(10, 15) }))).not.toContain('[Before your last visit]')
    // First visit: no line either.
    expect(shape(build(rows))).not.toContain('[Before your last visit]')
  })

  it('keeps items with no time at the bottom', () => {
    const rows: Row[] = [{ id: 'no-time', at: '' }, { id: 'today', at: local(10, 9) }]
    expect(shape(build(rows))).toEqual(['[Today]', 'today', '[Older]', 'no-time'])
  })
})

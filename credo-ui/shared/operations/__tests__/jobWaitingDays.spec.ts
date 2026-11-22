import { JOB_WAITING_FLAG_DAYS, jobWaitingDays } from '../operationsApi'

describe('job waiting age', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')

  it('flags unassigned and unbooked jobs only after seven whole days', () => {
    expect(jobWaitingDays({ category: 'pending', createdAt: '2026-11-15 12:00:00' }, now)).toBe(JOB_WAITING_FLAG_DAYS)
    expect(jobWaitingDays({ category: 'not_booked', createdAt: '2026-11-15T12:00:01Z' }, now)).toBe(6)
    expect(jobWaitingDays({ category: 'assigned', createdAt: '2026-11-01T12:00:00Z' }, now)).toBe(0)
  })

  it('treats zone-free database timestamps as UTC and respects explicit offsets', () => {
    expect(jobWaitingDays({ category: 'pending', createdAt: '2026-11-15T12:00:00' }, now)).toBe(7)
    expect(jobWaitingDays({ category: 'pending', createdAt: '2026-11-15T14:00:00+02:00' }, now)).toBe(7)
    expect(jobWaitingDays({ category: 'pending', createdAt: 'invalid' }, now)).toBe(0)
  })
})

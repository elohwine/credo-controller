/**
 * A visit the worker could not finish (no access, store closed, parts needed…) and its re-booking.
 * One list of reasons for the server, the website and the phone app.
 */
export const FAILED_VISIT_REASONS = [
  { code: 'no_access', label: 'No access to the site' },
  { code: 'store_closed', label: 'Store closed' },
  { code: 'nobody_on_site', label: 'Nobody there to let us in or sign off' },
  { code: 'parts_needed', label: 'Parts or materials needed' },
  { code: 'more_work', label: 'More work needed than booked' },
  { code: 'wrong_details', label: 'Wrong address or job details' },
  { code: 'weather', label: 'Weather' },
  { code: 'other', label: 'Other' },
] as const

export type FailedVisitReason = (typeof FAILED_VISIT_REASONS)[number]['code']

export interface FailedVisit {
  id: string
  reason: FailedVisitReason
  note?: string
  at: string
  /** Who reported it: the worker on site, or the office logging a phoned-in failure. */
  by?: string
  /** The worker on the job when the visit failed. Stays with them after a re-booking. */
  workerId?: string
  status: 'open' | 'rebooked'
  rebookedAt?: string
  rebookedBy?: string
  rebookedFor?: string
  rebookedTo?: string
  rebookNote?: string
}

export function isFailedVisitReason(value: unknown): value is FailedVisitReason {
  return FAILED_VISIT_REASONS.some((item) => item.code === value)
}

export function failedVisitReasonLabel(code: unknown): string {
  return FAILED_VISIT_REASONS.find((item) => item.code === code)?.label || 'Could not finish'
}

export function failedVisitsOf(state: Record<string, any> | null | undefined): FailedVisit[] {
  return Array.isArray(state?.failedVisits) ? (state!.failedVisits as FailedVisit[]) : []
}

/** Why a re-booking date cannot be used, or nothing when it can. `today` is YYYY-MM-DD. */
export function rebookDateError(value: unknown, today = new Date().toISOString().slice(0, 10)): string | undefined {
  const date = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    return 'Choose the new date for the visit.'
  }
  if (date < today) return 'The new date cannot be in the past.'
  return undefined
}

/** The visit still waiting for the office to re-book it, if any. A job has at most one. */
export function openFailedVisit(state: Record<string, any> | null | undefined): FailedVisit | undefined {
  return failedVisitsOf(state).find((visit) => visit?.status === 'open')
}

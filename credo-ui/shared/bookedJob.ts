/**
 * A job someone booked from an organisation's page, as the person who booked it sees it.
 * The organisation's field job is the source of truth; worker names never reach the customer.
 * Used by "My requests" in the app and the portal.
 */
export interface BookedJobProgress {
  runId: string
  status: string
  stage?: string
  pauseReason?: string
  assigned: boolean
  /** The work is done but the job stays open until the bill is paid and receipted. */
  waitingFor?: 'payment' | 'receipt'
  history: Array<{ stage: string; at?: string }>
  createdAt?: string
}

export interface BookedJobWords {
  label: string
  color: string
  line: string
  done: boolean
}

const STAGE_WORDS: Record<string, string> = {
  REQUEST_CREATED: 'Booked',
  APPROVAL_PENDING: 'Being checked',
  APPROVED: 'Accepted',
  RELEASE_AUTHORIZED: 'Accepted',
  ASSIGNED: 'Someone is on it',
  IN_PROGRESS: 'Work under way',
  EVIDENCE_CAPTURED: 'Work done, being checked',
  ACKNOWLEDGED: 'Work signed off',
  PAYMENT_TRIGGERED: 'Work signed off',
  RECEIPT_ISSUED: 'Work signed off',
  RECONCILED: 'Finished',
  COMPLETED: 'Finished',
  DISPUTED: 'Under review',
  CANCELLED: 'Cancelled',
  REVOKED: 'Cancelled',
}

export function bookedJobStageWords(stage: string): string {
  const key = String(stage || '').toUpperCase()
  return STAGE_WORDS[key] || key.toLowerCase().replace(/_/g, ' ')
}

export function readBookedJob(value: unknown): BookedJobProgress | undefined {
  if (!value || typeof value !== 'object') return undefined
  const job = value as Record<string, any>
  if (typeof job.runId !== 'string' || !job.runId) return undefined
  return {
    runId: job.runId,
    status: String(job.status || ''),
    stage: typeof job.stage === 'string' ? job.stage : undefined,
    pauseReason: typeof job.pauseReason === 'string' ? job.pauseReason : undefined,
    assigned: Boolean(job.assigned),
    waitingFor: job.waitingFor === 'payment' || job.waitingFor === 'receipt' ? job.waitingFor : undefined,
    history: Array.isArray(job.history)
      ? job.history
          .filter((entry: any) => entry && typeof entry.stage === 'string')
          .map((entry: any) => ({ stage: String(entry.stage), at: entry.at ? String(entry.at) : undefined }))
      : [],
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : undefined,
  }
}

export function bookedJobWords(job: BookedJobProgress, orgName?: string): BookedJobWords {
  const org = String(orgName || '').trim() || 'The organisation'
  const stage = String(job.stage || '').toUpperCase()
  const status = String(job.status || '').toLowerCase()
  if (['CANCELLED', 'REVOKED'].includes(stage) || status === 'cancelled') {
    return { label: 'Cancelled', color: 'gray', line: `${org} cancelled this job.`, done: true }
  }
  if (job.waitingFor === 'payment') {
    return {
      label: 'Bill to pay',
      color: 'orange',
      line: 'The work is finished. Your bill is in your inbox; the job closes once it is paid.',
      done: false,
    }
  }
  if (job.waitingFor === 'receipt') {
    return {
      label: 'Paid',
      color: 'teal',
      line: 'Your payment is in. Your receipt is on its way to your inbox; the job closes when it arrives.',
      done: false,
    }
  }
  if (status === 'completed' || ['COMPLETED', 'RECONCILED'].includes(stage)) {
    return { label: 'Finished', color: 'green', line: 'The job is finished. Any bill or receipt is in your inbox.', done: true }
  }
  if (status === 'failed') {
    return { label: 'Held up', color: 'orange', line: `${org} has a problem with this job and will be in touch.`, done: false }
  }
  if (job.pauseReason === 'await_assignment' || !job.assigned) {
    return { label: 'Booked', color: 'blue', line: `${org} is choosing who comes. You hear in your inbox and on WhatsApp.`, done: false }
  }
  if (stage === 'ASSIGNED') {
    return { label: 'Someone is on it', color: 'blue', line: `${org} has given the job to a team member.`, done: false }
  }
  if (stage === 'IN_PROGRESS') {
    return { label: 'Work under way', color: 'teal', line: 'The work has started.', done: false }
  }
  return { label: bookedJobStageWords(stage), color: 'teal', line: `${org} is working through the job.`, done: false }
}

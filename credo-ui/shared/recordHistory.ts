/**
 * One History, export and cancel path for every record a person can open: a job, a request,
 * a supplier bill or a payment plan. Both apps build their URLs and words from here.
 * Server: `/api/records/{kind}/{id}` (RecordController) and, for jobs, `/workflows/runs/{id}/audit`.
 */

export type RecordKind = 'job' | 'request' | 'supplier_bill' | 'collection'

export const RECORD_KIND_WORDS: Record<RecordKind, string> = {
  job: 'job',
  request: 'request',
  supplier_bill: 'supplier bill',
  collection: 'payment plan',
}

export const RECORD_ACTION_LABELS = {
  history: 'History',
  export: 'Export',
  cancel: 'Cancel',
} as const

/** What cancelling does, in the words shown on the confirm dialog. Jobs are not cancelled here. */
export const RECORD_CANCEL_CONSEQUENCE: Record<Exclude<RecordKind, 'job'>, string> = {
  request: 'It leaves every inbox and nothing more happens on it.',
  supplier_bill: 'The amount owed to the supplier is removed. A bill with a payment against it cannot be cancelled.',
  collection: 'Unpaid instalments and their pay links stop. Instalments already paid stay paid.',
}

export interface RecordHistoryRow {
  id: string
  occurredAt: string
  event: string
  status: string
  person?: string
  stage?: string
  evidence: Array<{ kind: string; label: string; reference: string }>
  confirmation?: string
}

export function isRecordKind(value: unknown): value is RecordKind {
  return value === 'job' || value === 'request' || value === 'supplier_bill' || value === 'collection'
}

export function recordHistoryPath(kind: RecordKind, id: string, format: 'json' | 'csv' = 'json'): string {
  const query = format === 'csv' ? '?format=csv' : ''
  return kind === 'job'
    ? `/workflows/runs/${encodeURIComponent(id)}/audit${query}`
    : `/api/records/${kind}/${encodeURIComponent(id)}/history${query}`
}

export function recordCancelPath(kind: Exclude<RecordKind, 'job'>, id: string): string {
  return `/api/records/${kind}/${encodeURIComponent(id)}/cancel`
}

/** Same key for a repeated tap, so the server answers the cancel once. */
export function recordCancelKey(kind: RecordKind, id: string): string {
  return `record-cancel:${kind}:${id}`
}

export function recordCancelTitle(kind: Exclude<RecordKind, 'job'>): string {
  return `Cancel this ${RECORD_KIND_WORDS[kind]}?`
}

export function recordExportName(kind: RecordKind, id: string): string {
  return `${RECORD_KIND_WORDS[kind].replace(/\s+/g, '-')}-history-${id.slice(0, 8)}`
}

/**
 * What a file exported from the office's old job system (for example MyMobileWorkers) may hold, and
 * which column names we recognise for each kind. Shared by the server importer and both apps, so the
 * words on the Import screen are the words the importer uses.
 */

export const FIELD_IMPORT_KINDS = ['stores', 'jobs', 'vans', 'rates'] as const
export type FieldImportKind = (typeof FIELD_IMPORT_KINDS)[number]

export interface FieldImportKindInfo {
  kind: FieldImportKind
  label: string
  /** One plain sentence: what lands where. */
  summary: string
  /** Columns people should look for in their file, in the order they matter. */
  columns: string[]
}

export const FIELD_IMPORT_KIND_INFO: FieldImportKindInfo[] = [
  {
    kind: 'stores',
    label: 'Stores and clients',
    summary: 'Each one is saved as an outside contact, so bills and job links can go to them.',
    columns: ['Store number', 'Name', 'Phone', 'Email', 'Address', 'Contact person'],
  },
  {
    kind: 'jobs',
    label: 'Jobs',
    summary:
      'Jobs still open wait in the Jobs list to be booked. Finished and cancelled jobs are kept as history and are never billed again.',
    columns: ['Job number', 'Description', 'Store number', 'Status', 'Date', 'Completed date', 'Worker', 'Amount'],
  },
  {
    kind: 'vans',
    label: 'Vans',
    summary: 'Each van is added to the van register with its service day and MOT date.',
    columns: ['Registration', 'Description', 'Service day', 'MOT due'],
  },
  {
    kind: 'rates',
    label: 'Rates',
    summary: 'Each rate is added to the rate list used when pricing a job.',
    columns: ['Name', 'Price', 'Unit', 'Currency'],
  },
]

export function fieldImportKindInfo(kind: string): FieldImportKindInfo | undefined {
  return FIELD_IMPORT_KIND_INFO.find((entry) => entry.kind === kind)
}

export function isFieldImportKind(value: unknown): value is FieldImportKind {
  return typeof value === 'string' && (FIELD_IMPORT_KINDS as readonly string[]).includes(value)
}

export type FieldImportRowStatus = 'new' | 'exists' | 'problem'

export interface FieldImportRowPreview {
  /** Row number in the file, counting the header as row 1. */
  row: number
  status: FieldImportRowStatus
  /** The row in a few plain words, for example "Store 1042 · Greendale Spar". */
  summary: string
  /** Where it will go: only for jobs. */
  goesTo?: 'waiting' | 'history'
  /** Why a row cannot be brought in, or a note worth reading before saving. */
  problem?: string
  note?: string
}

export interface FieldImportPreview {
  kind: FieldImportKind
  label: string
  /** Columns we understood, as "File column → what we use it for". */
  understood: Array<{ column: string; meaning: string }>
  /** Columns in the file we do not use. */
  ignored: string[]
  /** Needed columns the file does not have. */
  missing: string[]
  counts: { total: number; new: number; exists: number; problem: number; waiting?: number; history?: number }
  rows: FieldImportRowPreview[]
}

export interface FieldImportResult {
  kind: FieldImportKind
  label: string
  added: number
  alreadyThere: number
  problems: number
  waiting?: number
  history?: number
  rows: FieldImportRowPreview[]
}

/**
 * What a file exported from the office's old job system (for example MyMobileWorkers) may hold, and
 * which column names we recognise for each kind. Shared by the server importer and both apps, so the
 * words on the Import screen are the words the importer uses.
 */

export const FIELD_IMPORT_KINDS = ['stores', 'people', 'vans', 'equipment', 'rates', 'jobs', 'checks'] as const
export type FieldImportKind = (typeof FIELD_IMPORT_KINDS)[number]

/** Where local phone numbers in a file are from (`0…` without a country code). */
export const FIELD_IMPORT_COUNTRIES = [
  { value: 'ZW', label: 'Zimbabwe (+263)', dialCode: '263' },
  { value: 'GB', label: 'United Kingdom (+44)', dialCode: '44' },
  { value: 'ZA', label: 'South Africa (+27)', dialCode: '27' },
] as const
export type FieldImportCountry = (typeof FIELD_IMPORT_COUNTRIES)[number]['value']

export const FIELD_IMPORT_CURRENCIES = ['USD', 'GBP', 'ZAR', 'ZWG', 'EUR'] as const

export interface FieldImportOptions {
  /** Local phone numbers are from here. Zimbabwe when not given. */
  country?: FieldImportCountry
  /** Amounts without a currency column are in this currency. USD when not given. */
  currency?: string
}

export function isFieldImportCountry(value: unknown): value is FieldImportCountry {
  return FIELD_IMPORT_COUNTRIES.some((entry) => entry.value === value)
}

/** What the old system said about a job, kept on the job so nothing in the file is lost. */
export interface ImportedJobDetails {
  externalId?: string
  /** The status word the old system used, for example "Completed without signature". */
  oldStatus?: string
  branch?: string
  priority?: string
  /** Time of day or slot, when the old system gave one ("Any Time" is left out). */
  timeslot?: string
  jobType?: string
  task?: string
  instructions?: string
  notes?: string
  failureType?: string
  contactName?: string
  contactPhone?: string
  postcode?: string
  receivedAt?: string
  arrivedAt?: string
  completedAt?: string
  /** What the old system's invoice column held: an invoice number or an office note. */
  invoiceNote?: string
  invoiceSentOn?: string
  flags?: string
  vehicle?: string
  /** Other workers on the job in the old system. */
  helpers?: string
  checks?: Array<{ name: string; result: string }>
}

export const IMPORTED_JOB_DETAIL_LABELS: Array<[keyof Omit<ImportedJobDetails, 'checks'>, string]> = [
  ['oldStatus', 'Status in the old system'],
  ['externalId', 'Client reference'],
  ['branch', 'Branch'],
  ['priority', 'Priority'],
  ['timeslot', 'Time'],
  ['jobType', 'Job form'],
  ['task', 'Task'],
  ['instructions', 'Instructions'],
  ['notes', 'Worker notes'],
  ['failureType', 'Why it failed'],
  ['contactName', 'Contact'],
  ['contactPhone', 'Contact phone'],
  ['postcode', 'Postcode'],
  ['receivedAt', 'Received'],
  ['arrivedAt', 'Arrived'],
  ['completedAt', 'Finished'],
  ['invoiceNote', 'Invoice note'],
  ['invoiceSentOn', 'Invoice sent on'],
  ['vehicle', 'Van'],
  ['helpers', 'Also on the job'],
  ['flags', 'Flags'],
]

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
    columns: ['Store number', 'Name', 'Phone', 'Email', 'Address', 'Postcode', 'Contact person', 'External ID'],
  },
  {
    kind: 'people',
    label: 'Staff',
    summary:
      'Each person is added to the staff list in HR with their branch and the role they start on when invited (office users as managers, everyone else as field workers). Pay is left at 0 for you to set. They are linked to their account when they join with the same phone number.',
    columns: ['Full name', 'Username', 'Staff number', 'Phone', 'Email', 'Branch', 'Role', 'Archived'],
  },
  {
    kind: 'vans',
    label: 'Vans',
    summary:
      'Each van is added to the van register with its MOT, tax date, mileage and last check. Archived vans are added as retired.',
    columns: ['Registration', 'Make', 'Model', 'Branch', 'Mileage', 'MOT due', 'Tax due', 'Last check', 'Archived'],
  },
  {
    kind: 'equipment',
    label: 'Tools and devices',
    summary: 'Each item is added to the equipment list with who holds it and what it cost.',
    columns: ['Name', 'Category', 'Product code', 'Serial number', 'Price', 'Notes'],
  },
  {
    kind: 'rates',
    label: 'Rates',
    summary: 'Each rate is added to the rate list used when pricing a job.',
    columns: ['Name', 'Price', 'Unit', 'Currency', 'Product code'],
  },
  {
    kind: 'jobs',
    label: 'Jobs',
    summary:
      'Jobs still open wait in the Jobs list to be booked. Finished, failed and cancelled jobs are kept as history and are never billed again. Instructions, branch, times and notes stay on the job.',
    columns: [
      'Job number',
      'Special instructions',
      'Customer',
      'Status',
      'Timeslot',
      'Completed at',
      'Assigned to',
      'Branch',
      'Failure type',
    ],
  },
  {
    kind: 'checks',
    label: 'Job check results',
    summary: 'Each result is added to a job already imported, matched on the job number. Import the jobs first.',
    columns: ['Job number', 'Check name', 'Result'],
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

/**
 * Brings in the lists an office keeps in its old job system (MyMobileWorkers and the like): stores
 * and clients, jobs, vans and rates. The file is a CSV saved from the spreadsheet, or a JSON list.
 *
 * Rules the rest of the platform relies on:
 *  - A store or client becomes an outside contact (`org_contacts`, scope `external`) with its store
 *    number, the same record the job forms, bills and job links already use. One contact per store
 *    number; a second row with the same number is never a second contact.
 *  - A job still open becomes a waiting job (a job intake, source "import") for the office to book.
 *    A finished or cancelled job becomes history. History starts no workflow, sends no bill and pays
 *    nobody, so bringing an old file in can never charge a client twice.
 *  - Importing the same file again adds nothing: rows are matched on store number, job number,
 *    registration or rate name.
 *  - A bad row is reported with the reason and skipped; the rest still go in.
 */

import { randomUUID } from 'crypto'

import {
  FIELD_IMPORT_KIND_INFO,
  type FieldImportKind,
  type FieldImportPreview,
  type FieldImportResult,
  type FieldImportRowPreview,
} from '../config/fieldDataImport'
import { DatabaseManager } from '../persistence/DatabaseManager'
import {
  findContactByStoreNumber,
  listContacts,
  normalizeStoreNumber,
  upsertContact,
} from '../persistence/ContactRepository'
import { jobIntakeRepository } from '../persistence/JobIntakeRepository'
import { parseCsv } from '../utils/parseCsv'

import { fieldJobSheetService } from './FieldJobSheetService'
import { operationsRegisterService } from './OperationsRegisterService'
import { normalizeContactPhone } from './ssi/contactHash'

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface ColumnSpec {
  key: string
  meaning: string
  /** Header names (letters and digits only, lower case) in order of preference. */
  aliases: string[]
  required?: boolean
  /** Join every matching column (for example address lines). */
  multi?: boolean
}

const SPECS: Record<FieldImportKind, ColumnSpec[]> = {
  stores: [
    {
      key: 'storeNumber',
      meaning: 'Store number',
      aliases: ['storenumber', 'storeno', 'storeid', 'storecode', 'shopnumber', 'shopno', 'shopcode', 'sitenumber', 'siteno', 'sitecode', 'store', 'shop', 'site', 'branchcode', 'branchnumber', 'branchno', 'customernumber', 'customerno', 'customercode', 'clientnumber', 'clientno', 'clientcode', 'accountnumber', 'accountno', 'accountcode', 'code'],
    },
    {
      key: 'name',
      meaning: 'Name',
      aliases: ['storename', 'shopname', 'sitename', 'branchname', 'customername', 'clientname', 'companyname', 'organisation', 'organization', 'company', 'customer', 'client', 'name', 'branch'],
      required: true,
    },
    { key: 'phone', meaning: 'Phone', aliases: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'cellphone', 'telephone', 'tel', 'contactnumber', 'contactphone', 'whatsapp'] },
    { key: 'email', meaning: 'Email', aliases: ['email', 'emailaddress', 'contactemail', 'mail'] },
    { key: 'address', meaning: 'Address (kept in notes)', aliases: ['address', 'streetaddress', 'physicaladdress', 'address1', 'address2', 'location', 'street', 'suburb', 'town', 'city'], multi: true },
    { key: 'person', meaning: 'Contact person (kept in notes)', aliases: ['contactperson', 'contactname', 'contact', 'manager', 'storemanager', 'attention'] },
  ],
  jobs: [
    {
      key: 'reference',
      meaning: 'Job number',
      aliases: ['jobnumber', 'jobno', 'jobid', 'jobref', 'jobreference', 'workorder', 'workordernumber', 'ticket', 'ticketnumber', 'reference', 'ref', 'number', 'id'],
      required: true,
    },
    { key: 'description', meaning: 'What the job is', aliases: ['description', 'jobdescription', 'details', 'jobdetails', 'workrequired', 'fault', 'faultdescription', 'issue', 'notes', 'title', 'jobtitle', 'summary', 'subject'], required: true },
    { key: 'storeNumber', meaning: 'Store number', aliases: ['storenumber', 'storeno', 'storeid', 'storecode', 'shopnumber', 'shopno', 'sitenumber', 'siteno', 'store', 'shop', 'site', 'customernumber', 'customerno', 'clientnumber', 'clientno', 'branchcode'] },
    { key: 'clientName', meaning: 'Client or store name', aliases: ['storename', 'shopname', 'sitename', 'customername', 'clientname', 'customer', 'client', 'company', 'companyname'] },
    { key: 'phone', meaning: 'Client phone', aliases: ['clientphone', 'customerphone', 'phone', 'phonenumber', 'mobile', 'contactnumber', 'contactphone', 'telephone', 'tel'] },
    { key: 'status', meaning: 'Status', aliases: ['status', 'jobstatus', 'state', 'stage'] },
    { key: 'scheduled', meaning: 'Booked for', aliases: ['scheduleddate', 'scheduled', 'bookeddate', 'bookedfor', 'duedate', 'due', 'startdate', 'start', 'date', 'jobdate', 'createddate', 'created'] },
    { key: 'completed', meaning: 'Completed on', aliases: ['completeddate', 'completedon', 'completed', 'completiondate', 'finisheddate', 'finished', 'closeddate', 'closed', 'enddate', 'end'] },
    { key: 'worker', meaning: 'Worker (kept as a name on the history)', aliases: ['worker', 'workername', 'assignedto', 'assignee', 'technician', 'technicianname', 'engineer', 'engineername', 'attendant', 'employee', 'staff', 'staffname'] },
    { key: 'amount', meaning: 'Amount', aliases: ['amount', 'price', 'total', 'jobtotal', 'value', 'cost', 'quote', 'quoteamount', 'charge'] },
    { key: 'currency', meaning: 'Currency', aliases: ['currency', 'currencycode'] },
    { key: 'poNumber', meaning: 'PO number', aliases: ['ponumber', 'pono', 'po', 'purchaseorder', 'purchaseordernumber', 'orderno', 'ordernumber'] },
    { key: 'problemType', meaning: 'Type of problem', aliases: ['problemtype', 'jobtype', 'type', 'category', 'worktype', 'faulttype', 'trade'] },
    { key: 'location', meaning: 'Where on site', aliases: ['location', 'address', 'siteaddress', 'area', 'jobaddress'] },
    { key: 'callOut', meaning: 'Call-out', aliases: ['callout', 'calledout', 'emergency', 'urgent', 'unplanned'] },
  ],
  vans: [
    { key: 'registration', meaning: 'Registration', aliases: ['registration', 'reg', 'regno', 'regnumber', 'registrationnumber', 'numberplate', 'plate', 'licenceplate', 'licenseplate', 'vehicle', 'vehiclereg', 'vehicleregistration'], required: true },
    { key: 'description', meaning: 'Description', aliases: ['description', 'make', 'model', 'makemodel', 'vehicletype', 'name', 'colour', 'color'], multi: true },
    { key: 'serviceDay', meaning: 'Service day', aliases: ['serviceday', 'weekday', 'dayofweek', 'day'] },
    { key: 'motDue', meaning: 'MOT due', aliases: ['motdue', 'motdate', 'motexpiry', 'motexpires', 'mot', 'roadworthy', 'roadworthydue', 'fitnessdue', 'licenceexpiry', 'licenseexpiry'] },
  ],
  rates: [
    { key: 'name', meaning: 'Name', aliases: ['name', 'ratename', 'item', 'itemname', 'service', 'servicename', 'description', 'product', 'productname', 'title'], required: true },
    { key: 'price', meaning: 'Price', aliases: ['price', 'unitprice', 'rate', 'amount', 'cost', 'charge', 'sellingprice', 'fee'], required: true },
    { key: 'unit', meaning: 'Unit', aliases: ['unit', 'per', 'uom', 'unitofmeasure', 'basis'] },
    { key: 'currency', meaning: 'Currency', aliases: ['currency', 'currencycode'] },
    { key: 'problemType', meaning: 'Type of problem', aliases: ['problemtype', 'jobtype', 'type', 'category', 'worktype'] },
  ],
}

const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const cleanText = (value: unknown, max = 400): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** A date in any of the shapes a spreadsheet exports, as YYYY-MM-DD. `''` for blank, `null` if not understood. */
export function importDate(raw: unknown): string | null {
  const text = cleanText(raw, 60)
  if (!text) return ''
  const make = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return date.toISOString().slice(0, 10)
  }
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (match) return make(Number(match[1]), Number(match[2]), Number(match[3]))
  // Day first, as the office writes it: 21/11/2026 or 21-11-2026.
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s].*)?$/)
  if (match) return make(Number(match[3]), Number(match[2]), Number(match[1]))
  match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})(?:[T\s].*)?$/)
  if (match) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1
    return month ? make(Number(match[3]), month, Number(match[1])) : null
  }
  return null
}

/** `+2637…` for a number we can use, `''` for blank, `null` if too short to be a phone number. */
export function importPhone(raw: unknown): string | null {
  const text = cleanText(raw, 60)
  if (!text) return ''
  const digits = normalizeContactPhone(text)
  return digits.length >= 9 && digits.length <= 15 ? `+${digits}` : null
}

function importAmount(raw: unknown): number | null | undefined {
  const text = cleanText(raw, 40)
  if (!text) return undefined
  if (!/\d/.test(text)) return null
  const stripped = text.replace(/[^0-9.,-]/g, '')
  const normalised = /,\d{1,2}$/.test(stripped) && !stripped.includes('.') ? stripped.replace(',', '.') : stripped.replace(/,/g, '')
  const value = Number(normalised)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
}

function importFlag(raw: unknown): boolean {
  return /^(yes|y|true|1|x)$/i.test(cleanText(raw, 10))
}

function jobOutcome(status: string): 'open' | 'completed' | 'cancelled' {
  // Whole words only: "Assigned" must not read as "signed off".
  if (/\b(cancel(l)?ed|cancellation|void(ed)?|rejected|declined|abandoned|withdrawn)\b/i.test(status)) return 'cancelled'
  if (/\b(complete(d)?|done|closed|finished|signed[ -]?off|invoiced|paid|resolved|reconciled)\b/i.test(status)) return 'completed'
  return 'open'
}

type Table = { headers: string[]; records: Array<Record<string, string>> }

function readFile(content: string, format?: string): Table {
  const text = String(content ?? '')
  if (!text.trim()) throw new Error('The file is empty')
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw new Error('The file is larger than 2 MB. Split it and import in parts.')
  const asJson = format === 'json' || (format !== 'csv' && /^\s*[[{]/.test(text))
  if (asJson) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('The file is not a valid list. Save it as CSV from your spreadsheet and try again.')
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? (Object.values(parsed as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined)
        : undefined
    if (!list?.length || list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error('Expected a list of records, one per row')
    }
    const headers: string[] = []
    const records = (list as Array<Record<string, unknown>>).map((item) => {
      const record: Record<string, string> = {}
      for (const [key, value] of Object.entries(item)) {
        if (value && typeof value === 'object') continue
        if (!headers.includes(key)) headers.push(key)
        record[key] = String(value ?? '')
      }
      return record
    })
    return { headers, records }
  }
  const grid = parseCsv(text)
  if (grid.length < 2) throw new Error('The file needs a header row and at least one row of data')
  const headers = grid[0].map((header, index) => cleanText(header, 80) || `Column ${index + 1}`)
  const records = grid.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      // A repeated header keeps both values, joined, so address lines are not lost.
      record[header] = record[header] ? `${record[header]}, ${cells[index] ?? ''}` : String(cells[index] ?? '')
    })
    return record
  })
  return { headers: [...new Set(headers)], records }
}

function mapColumns(headers: string[], specs: ColumnSpec[]) {
  const claimed = new Set<string>()
  const mapped: Record<string, string[]> = {}
  for (const spec of specs) {
    const candidates = headers
      .filter((header) => !claimed.has(header) && spec.aliases.includes(squash(header)))
      .sort((a, b) => spec.aliases.indexOf(squash(a)) - spec.aliases.indexOf(squash(b)))
    const chosen = spec.multi ? candidates : candidates.slice(0, 1)
    if (chosen.length) {
      mapped[spec.key] = chosen
      chosen.forEach((header) => claimed.add(header))
    }
  }
  return { mapped, ignored: headers.filter((header) => !claimed.has(header)) }
}

interface PlannedRow {
  preview: FieldImportRowPreview
  /** Saves the row. Only set when the row is new. */
  apply?: () => void
}

export class FieldDataImportService {
  public preview(orgTenantId: string, kind: FieldImportKind, content: string, format?: string): FieldImportPreview {
    const { table, mapped, ignored, missing, planned } = this.plan(orgTenantId, 'preview', kind, content, format)
    return this.summarise(kind, table, mapped, ignored, missing, planned)
  }

  public commit(
    orgTenantId: string,
    actorId: string,
    kind: FieldImportKind,
    content: string,
    format?: string,
  ): FieldImportResult {
    const { missing, planned } = this.plan(orgTenantId, actorId, kind, content, format)
    if (missing.length) throw new Error(`The file has no ${missing.join(' or ')} column`)
    const rows: FieldImportRowPreview[] = []
    let added = 0
    let waiting = 0
    let history = 0
    for (const item of planned) {
      if (item.preview.status !== 'new' || !item.apply) {
        rows.push(item.preview)
        continue
      }
      try {
        item.apply()
        added += 1
        if (item.preview.goesTo === 'waiting') waiting += 1
        if (item.preview.goesTo === 'history') history += 1
        rows.push(item.preview)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not save this row'
        rows.push({ ...item.preview, status: /already (saved|on the register)/i.test(message) ? 'exists' : 'problem', problem: message })
      }
    }
    const info = FIELD_IMPORT_KIND_INFO.find((entry) => entry.kind === kind)!
    return {
      kind,
      label: info.label,
      added,
      alreadyThere: rows.filter((row) => row.status === 'exists').length,
      problems: rows.filter((row) => row.status === 'problem').length,
      ...(kind === 'jobs' ? { waiting, history } : {}),
      rows,
    }
  }

  private summarise(
    kind: FieldImportKind,
    table: Table,
    mapped: Record<string, string[]>,
    ignored: string[],
    missing: string[],
    planned: PlannedRow[],
  ): FieldImportPreview {
    const info = FIELD_IMPORT_KIND_INFO.find((entry) => entry.kind === kind)!
    const rows = planned.map((item) => item.preview)
    const specs = SPECS[kind]
    return {
      kind,
      label: info.label,
      understood: specs
        .filter((spec) => mapped[spec.key]?.length)
        .map((spec) => ({ column: mapped[spec.key].join(' + '), meaning: spec.meaning })),
      ignored,
      missing,
      counts: {
        total: table.records.length,
        new: rows.filter((row) => row.status === 'new').length,
        exists: rows.filter((row) => row.status === 'exists').length,
        problem: rows.filter((row) => row.status === 'problem').length,
        ...(kind === 'jobs'
          ? {
              waiting: rows.filter((row) => row.status === 'new' && row.goesTo === 'waiting').length,
              history: rows.filter((row) => row.status === 'new' && row.goesTo === 'history').length,
            }
          : {}),
      },
      rows,
    }
  }

  private plan(orgTenantId: string, actorId: string, kind: FieldImportKind, content: string, format?: string) {
    const table = readFile(content, format)
    if (table.records.length > MAX_IMPORT_ROWS) {
      throw new Error(`The file has ${table.records.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`)
    }
    const specs = SPECS[kind]
    const { mapped, ignored } = mapColumns(table.headers, specs)
    const missing = specs.filter((spec) => spec.required && !mapped[spec.key]?.length).map((spec) => spec.meaning.toLowerCase())
    if (missing.length) {
      return { table, mapped, ignored, missing, planned: [] as PlannedRow[] }
    }
    const read = (record: Record<string, string>, key: string): string =>
      (mapped[key] || []).map((header) => cleanText(record[header])).filter(Boolean).join(', ')
    const planned =
      kind === 'stores'
        ? this.planStores(orgTenantId, table, read)
        : kind === 'jobs'
          ? this.planJobs(orgTenantId, actorId, table, read)
          : kind === 'vans'
            ? this.planVans(orgTenantId, actorId, table, read)
            : this.planRates(orgTenantId, table, read)
    return { table, mapped, ignored, missing, planned }
  }

  // ─── Stores and clients ───────────────────────────────────────────────

  private planStores(orgTenantId: string, table: Table, read: (r: Record<string, string>, k: string) => string): PlannedRow[] {
    const seenNumbers = new Map<string, number>()
    const seenNames = new Set<string>()
    const known = listContacts(orgTenantId, 'external')
    return table.records.map((record, index) => {
      const row = index + 2
      const storeNumber = normalizeStoreNumber(read(record, 'storeNumber'))
      const name = read(record, 'name') || (storeNumber ? `Store ${storeNumber}` : '')
      const label = [storeNumber ? `Store ${storeNumber}` : '', name].filter(Boolean).join(' · ')
      const problem = (text: string): PlannedRow => ({ preview: { row, status: 'problem', summary: label || `Row ${row}`, problem: text } })
      if (!name) return problem('No name or store number')
      const email = read(record, 'email')
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(`"${email}" is not an email address`)
      const phone = importPhone(read(record, 'phone'))
      if (phone === null) return problem(`"${read(record, 'phone')}" is too short to be a phone number`)
      const earlier = storeNumber ? seenNumbers.get(storeNumber) : undefined
      if (earlier) return problem(`Store ${storeNumber} is already on row ${earlier} of this file`)
      if (storeNumber) seenNumbers.set(storeNumber, row)
      const nameKey = name.toLowerCase()
      const saved = storeNumber
        ? findContactByStoreNumber(orgTenantId, storeNumber)
        : known.find((contact) => contact.name.toLowerCase() === nameKey && !contact.storeNumber)
      if (saved || (!storeNumber && seenNames.has(nameKey))) {
        return { preview: { row, status: 'exists', summary: label, note: saved ? `Already saved as ${saved.name}` : 'Same name as an earlier row' } }
      }
      if (!storeNumber) seenNames.add(nameKey)
      const notes = [read(record, 'address') && `Address: ${read(record, 'address')}`, read(record, 'person') && `Contact: ${read(record, 'person')}`]
        .filter(Boolean)
        .join('\n')
      return {
        preview: {
          row,
          status: 'new',
          summary: label,
          ...(phone ? {} : { note: 'No phone number: bills and job links cannot be texted to this one' }),
        },
        apply: () => {
          upsertContact({
            orgTenantId,
            contactScope: 'external',
            name: name.slice(0, 160),
            phone: phone || undefined,
            email: email || undefined,
            notes: notes || undefined,
            storeNumber,
          })
        },
      }
    })
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────

  private planJobs(
    orgTenantId: string,
    actorId: string,
    table: Table,
    read: (r: Record<string, string>, k: string) => string,
  ): PlannedRow[] {
    const db = DatabaseManager.getDatabase()
    const byName = new Map<string, ReturnType<typeof listContacts>[number]>()
    for (const contact of listContacts(orgTenantId, 'external')) {
      if (contact.storeNumber && !byName.has(contact.name.toLowerCase())) byName.set(contact.name.toLowerCase(), contact)
    }
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const reference = read(record, 'reference').slice(0, 60)
      const description = (read(record, 'description') || read(record, 'problemType')).slice(0, 2000)
      const label = [reference, description.slice(0, 60)].filter(Boolean).join(' · ') || `Row ${row}`
      const problem = (text: string): PlannedRow => ({ preview: { row, status: 'problem', summary: label, problem: text } })
      if (!reference) return problem('No job number')
      if (!description) return problem('No description of the job')
      const earlier = seen.get(reference.toLowerCase())
      if (earlier) return problem(`Job ${reference} is already on row ${earlier} of this file`)
      seen.set(reference.toLowerCase(), row)

      const scheduled = importDate(read(record, 'scheduled'))
      if (scheduled === null) return problem(`"${read(record, 'scheduled')}" is not a date (use day/month/year)`)
      const completed = importDate(read(record, 'completed'))
      if (completed === null) return problem(`"${read(record, 'completed')}" is not a date (use day/month/year)`)
      const amount = importAmount(read(record, 'amount'))
      if (amount === null) return problem(`"${read(record, 'amount')}" is not an amount`)
      const phone = importPhone(read(record, 'phone'))
      if (phone === null) return problem(`"${read(record, 'phone')}" is too short to be a phone number`)
      const currency = (read(record, 'currency') || 'USD').toUpperCase().slice(0, 3)
      if (!/^[A-Z]{3}$/.test(currency)) return problem(`"${currency}" is not a currency code`)

      const status = read(record, 'status')
      const outcome = jobOutcome(status)
      // A job with a completion date is finished even when the status column is blank.
      const finished = outcome !== 'open' ? outcome : completed ? 'completed' : 'open'

      let storeNumber = normalizeStoreNumber(read(record, 'storeNumber'))
      const clientRaw = read(record, 'clientName')
      const contact = storeNumber ? findContactByStoreNumber(orgTenantId, storeNumber) : byName.get(clientRaw.toLowerCase())
      if (!storeNumber && contact?.storeNumber) storeNumber = contact.storeNumber
      const clientName = (clientRaw || contact?.name || '').slice(0, 160)
      const clientPhone = phone || contact?.phone || ''

      const key = `import:${reference.toLowerCase()}`
      const alreadyOpen = db.prepare('SELECT id FROM job_intakes WHERE tenant_id = ? AND idempotency_key = ?').get(orgTenantId, key)
      const alreadyHistory = db
        .prepare('SELECT id FROM job_history WHERE org_tenant_id = ? AND lower(external_reference) = ?')
        .get(orgTenantId, reference.toLowerCase())
      if (alreadyOpen || alreadyHistory) {
        return { preview: { row, status: 'exists', summary: label, note: 'Already imported' } }
      }

      const notes: string[] = []
      if (storeNumber && !contact) notes.push(`Store ${storeNumber} is not saved yet. Import the stores first to link it.`)
      if (finished === 'open' && !clientPhone) notes.push('No client phone: the bill cannot be texted once the job is done')
      const note = notes.join(' ') || undefined
      const worker = read(record, 'worker').slice(0, 160)
      const poNumber = read(record, 'poNumber').slice(0, 80)
      const problemType = read(record, 'problemType').slice(0, 120)
      const location = read(record, 'location').slice(0, 200)

      if (finished !== 'open') {
        return {
          preview: { row, status: 'new', summary: label, goesTo: 'history', note },
          apply: () => {
            db.prepare(
              `INSERT INTO job_history
                 (id, org_tenant_id, external_reference, store_number, client_name, description, location, problem_type,
                  po_number, scheduled_date, completed_date, outcome, worker_name, amount, currency, imported_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              randomUUID(),
              orgTenantId,
              reference,
              storeNumber || null,
              clientName || null,
              description,
              location || null,
              problemType || null,
              poNumber || null,
              scheduled || null,
              completed || null,
              finished,
              worker || null,
              amount ?? null,
              currency,
              actorId,
            )
          },
        }
      }
      return {
        preview: { row, status: 'new', summary: label, goesTo: 'waiting', note },
        apply: () => {
          jobIntakeRepository.create(
            orgTenantId,
            actorId,
            {
              description,
              amount: amount ?? 0,
              currency,
              reference,
              ...(storeNumber ? { storeNumber } : {}),
              ...(poNumber ? { poNumber } : {}),
              ...(problemType ? { problemType } : {}),
              ...(clientName ? { clientName } : {}),
              ...(clientPhone ? { clientPhone } : {}),
              ...(location ? { location } : {}),
              ...(scheduled ? { scheduledDate: scheduled } : {}),
              ...(importFlag(read(record, 'callOut')) ? { callOut: true } : {}),
              ...(worker ? { importedWorkerName: worker } : {}),
              sourceType: 'import' as const,
            },
            key,
          )
        },
      }
    })
  }

  // ─── Vans ─────────────────────────────────────────────────────────────

  private planVans(
    orgTenantId: string,
    actorId: string,
    table: Table,
    read: (r: Record<string, string>, k: string) => string,
  ): PlannedRow[] {
    const known = new Set(operationsRegisterService.listVans(orgTenantId).map((van) => van.registration))
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const registration = read(record, 'registration').toUpperCase().replace(/\s+/g, ' ').slice(0, 20)
      const label = registration || `Row ${row}`
      const problem = (text: string): PlannedRow => ({ preview: { row, status: 'problem', summary: label, problem: text } })
      if (!registration) return problem('No registration')
      const earlier = seen.get(registration)
      if (earlier) return problem(`${registration} is already on row ${earlier} of this file`)
      seen.set(registration, row)
      if (known.has(registration)) return { preview: { row, status: 'exists', summary: label, note: 'Already on the van register' } }
      const serviceDay = read(record, 'serviceDay').toLowerCase()
      if (serviceDay && !DAYS.includes(serviceDay)) return problem(`"${serviceDay}" is not a day of the week`)
      const motDue = importDate(read(record, 'motDue'))
      if (motDue === null) return problem(`"${read(record, 'motDue')}" is not a date (use day/month/year)`)
      const description = read(record, 'description').slice(0, 200)
      return {
        preview: { row, status: 'new', summary: [registration, description].filter(Boolean).join(' · ') },
        apply: () => {
          operationsRegisterService.saveVan(orgTenantId, actorId, {
            registration,
            description,
            serviceDay,
            ...(motDue ? { motDue } : {}),
          })
        },
      }
    })
  }

  // ─── Rates ────────────────────────────────────────────────────────────

  private planRates(orgTenantId: string, table: Table, read: (r: Record<string, string>, k: string) => string): PlannedRow[] {
    const known = new Set(fieldJobSheetService.listRateCards(orgTenantId, true).map((card) => card.name.toLowerCase()))
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const name = read(record, 'name').slice(0, 160)
      const price = importAmount(read(record, 'price'))
      const label = name ? `${name}${price ? ` · ${price}` : ''}` : `Row ${row}`
      const problem = (text: string): PlannedRow => ({ preview: { row, status: 'problem', summary: label, problem: text } })
      if (!name) return problem('No name')
      if (price === undefined) return problem('No price')
      if (price === null) return problem(`"${read(record, 'price')}" is not a price`)
      const earlier = seen.get(name.toLowerCase())
      if (earlier) return problem(`"${name}" is already on row ${earlier} of this file`)
      seen.set(name.toLowerCase(), row)
      if (known.has(name.toLowerCase())) return { preview: { row, status: 'exists', summary: label, note: 'Already in your rates' } }
      const currency = (read(record, 'currency') || 'USD').toUpperCase().slice(0, 3)
      if (!/^[A-Z]{3}$/.test(currency)) return problem(`"${currency}" is not a currency code`)
      return {
        preview: { row, status: 'new', summary: label },
        apply: () => {
          fieldJobSheetService.saveRateCard(orgTenantId, {
            name,
            unitPrice: price,
            currency,
            unit: read(record, 'unit') || 'each',
            problemType: read(record, 'problemType'),
          })
        },
      }
    })
  }
}

export const fieldDataImportService = new FieldDataImportService()

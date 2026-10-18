import crypto from 'crypto'

import { StatusException } from '../../errors'
import { type PartnerClientRecord } from '../partner/PartnerClientService'

import { connectedRecordService, type ConnectedRecord, type ConnectedRecordService } from './ConnectedRecordService'
import { orgRecordTypeService, type OrgRecordTypeService, type RecordField } from './OrgRecordTypeService'

/**
 * Records from a file an organisation's existing software already produces (a CSV export or a
 * JSON array). Each row becomes one connected-system send, so validation, recipient checks,
 * organisation signing, idempotency and status all match the API path.
 */

/** Source id stored on sends that came from an uploaded file. */
export const FILE_UPLOAD_SOURCE = 'file-upload'
export const FILE_UPLOAD_LABEL = 'File upload'

const MAX_ROWS = 500
const MAX_BYTES = 1024 * 1024

const PHONE_COLUMNS = ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'recipientphone', 'msisdn']
const REFERENCE_COLUMNS = ['reference', 'externalreference', 'ref', 'id', 'recordid', 'number']

export type RecipientScope = 'org_members' | 'any_registered'

export interface RecordFileInput {
  /** File text. CSV with a header row, or a JSON array of objects. */
  content: string
  format?: 'csv' | 'json'
  /** Who may receive these records. Defaults to active members of the organisation. */
  recipientScope?: RecipientScope
}

export interface RecordFileRow {
  /** 1-based row number as the person sees it in their spreadsheet (header is row 1). */
  row: number
  phone: string
  reference: string | null
  claims: Record<string, unknown>
  error: string | null
}

export interface RecordFilePreview {
  credentialType: string
  label: string
  /** File column -> what it fills: a field key, `phone` or `reference`. */
  columns: Record<string, string>
  /** Columns that match nothing and are ignored. */
  ignoredColumns: string[]
  /** Fields the file does not provide. Required ones make every row fail. */
  missingFields: string[]
  rows: RecordFileRow[]
  ready: number
  failed: number
}

export interface RecordFileResultRow {
  row: number
  reference: string | null
  status: 'sent' | 'already_sent' | 'failed'
  record?: ConnectedRecord
  error?: string
}

export interface RecordFileResult {
  sent: number
  alreadySent: number
  failed: number
  rows: RecordFileResultRow[]
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  // Spreadsheets in some locales export with semicolons.
  const firstLine = source.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ','
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

function toObjects(input: RecordFileInput): Array<Record<string, unknown>> {
  const content = String(input?.content || '')
  if (!content.trim()) throw new StatusException('The file is empty', 400)
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) throw new StatusException('The file is larger than 1 MB', 400)
  const format = input.format || (/^\s*\[/.test(content) ? 'json' : 'csv')
  let objects: Array<Record<string, unknown>>
  if (format === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new StatusException('The file is not valid JSON', 400)
    }
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new StatusException('A JSON file must be a list of records', 400)
    }
    objects = parsed as Array<Record<string, unknown>>
  } else {
    const [header, ...body] = parseCsv(content)
    if (!header || !body.length) throw new StatusException('The file needs a header row and at least one record', 400)
    const names = header.map((name) => name.trim())
    objects = body.map((cells) => Object.fromEntries(names.map((name, i) => [name, (cells[i] ?? '').trim()])))
  }
  if (!objects.length) throw new StatusException('The file has no records', 400)
  if (objects.length > MAX_ROWS) throw new StatusException(`Send at most ${MAX_ROWS} records per file`, 400)
  return objects
}

/** "15/06/2025", "2025/6/15" and spreadsheet dates become "2025-06-15". Day comes first, as in Zimbabwe. */
function toDate(value: string): string {
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return value
}

function convert(field: RecordField, raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') return field.type === 'date' ? toDate(String(raw)) : raw
  const value = raw.trim()
  if (value === '') return undefined
  if (field.type === 'number') {
    const number = Number(value.replace(/[\s,]/g, ''))
    return Number.isFinite(number) ? number : value
  }
  if (field.type === 'yes_no') {
    if (/^(yes|y|true|1)$/i.test(value)) return true
    if (/^(no|n|false|0)$/i.test(value)) return false
    return value
  }
  if (field.type === 'date') return toDate(value)
  return value
}

export class RecordFileImportService {
  public constructor(
    private readonly types: Pick<OrgRecordTypeService, 'list'> = orgRecordTypeService,
    private readonly records: Pick<
      ConnectedRecordService,
      'submit' | 'checkRecipient' | 'checkClaims'
    > = connectedRecordService,
  ) {}

  public preview(orgTenantId: string, credentialType: string, input: RecordFileInput): RecordFilePreview {
    const type = this.types.list(orgTenantId).find((item) => item.credentialType === credentialType)
    if (!type) throw new StatusException('This record type is not set up for the organisation', 404)
    const objects = toObjects(input)
    const client = this.client(orgTenantId, input.recipientScope)

    const columns: Record<string, string> = {}
    const ignoredColumns: string[] = []
    const names = Array.from(new Set(objects.flatMap((object) => Object.keys(object))))
    for (const name of names) {
      const key = squash(name)
      const field = type.fields.find((item) => squash(item.key) === key || squash(item.label) === key)
      if (field) columns[name] = field.key
      else if (PHONE_COLUMNS.includes(key)) columns[name] = 'phone'
      else if (REFERENCE_COLUMNS.includes(key)) columns[name] = 'reference'
      else ignoredColumns.push(name)
    }
    const mapped = new Set(Object.values(columns))
    const missingFields = type.fields.filter((field) => !mapped.has(field.key)).map((field) => field.label)
    const phoneColumn = Object.keys(columns).find((name) => columns[name] === 'phone')
    const referenceColumn = Object.keys(columns).find((name) => columns[name] === 'reference')

    const seen = new Map<string, number>()
    const rows = objects.map((object, index): RecordFileRow => {
      const row = input.format === 'json' || /^\s*\[/.test(input.content) ? index + 1 : index + 2
      const claims: Record<string, unknown> = {}
      for (const field of type.fields) {
        const column = Object.keys(columns).find((name) => columns[name] === field.key)
        const value = column ? convert(field, object[column]) : undefined
        if (value !== undefined) claims[field.key] = value
      }
      const phone = phoneColumn ? String(object[phoneColumn] ?? '').trim() : ''
      const reference = referenceColumn ? String(object[referenceColumn] ?? '').trim() || null : null
      let error: string | null = null
      if (!phoneColumn) error = 'The file has no phone number column'
      else if (!phone) error = 'Phone number is missing'
      else if (phone.replace(/\D/g, '').length < 9) error = 'Phone number is too short'
      else if (reference && seen.has(reference)) error = `Same reference as row ${seen.get(reference)}`
      if (reference && !seen.has(reference)) seen.set(reference, row)
      if (!error) error = this.problem(() => this.records.checkClaims(orgTenantId, credentialType, claims))
      if (!error) error = this.problem(() => this.records.checkRecipient(client, phone))
      return { row, phone, reference, claims, error }
    })
    const failed = rows.filter((row) => row.error).length
    return {
      credentialType,
      label: type.label,
      columns,
      ignoredColumns,
      missingFields,
      rows,
      ready: rows.length - failed,
      failed,
    }
  }

  /** Sends every row that passes the preview. Uploading the same file again sends nothing new. */
  public async send(orgTenantId: string, credentialType: string, input: RecordFileInput): Promise<RecordFileResult> {
    const preview = this.preview(orgTenantId, credentialType, input)
    const client = this.client(orgTenantId, input.recipientScope)
    const result: RecordFileResult = { sent: 0, alreadySent: 0, failed: 0, rows: [] }
    for (const row of preview.rows) {
      if (row.error) {
        result.failed++
        result.rows.push({ row: row.row, reference: row.reference, status: 'failed', error: row.error })
        continue
      }
      // The reference names the record in the organisation's own software; without one, the row itself does.
      const identity = row.reference ? `ref:${row.reference}` : `row:${JSON.stringify([row.phone, row.claims])}`
      const key = `file:${crypto.createHash('sha256').update(`${credentialType}|${identity}`).digest('hex').slice(0, 48)}`
      try {
        const sent = await this.records.submit(client, key, {
          credentialType,
          recipient: { phone: row.phone },
          claims: row.claims,
          externalReference: row.reference || undefined,
        })
        if (sent.replayed) result.alreadySent++
        else result.sent++
        result.rows.push({
          row: row.row,
          reference: row.reference,
          status: sent.replayed ? 'already_sent' : 'sent',
          record: sent.record,
        })
      } catch (error: any) {
        result.failed++
        result.rows.push({
          row: row.row,
          reference: row.reference,
          status: 'failed',
          error:
            error?.status === 409
              ? 'This reference was already sent with different details'
              : error?.message || 'Could not send',
        })
      }
    }
    return result
  }

  private client(orgTenantId: string, scope: unknown): PartnerClientRecord {
    const recipientScope: RecipientScope = scope === 'any_registered' ? 'any_registered' : 'org_members'
    return {
      clientId: FILE_UPLOAD_SOURCE,
      orgTenantId,
      name: FILE_UPLOAD_LABEL,
      redirectUris: [],
      policy: { releaseClaims: [], audience: 'org_members', operations: ['send_records'], recipientScope },
      status: 'active',
      createdAt: '',
      updatedAt: '',
      secretRotatedAt: null,
      revokedAt: null,
      subjectSalt: '',
    }
  }

  private problem(check: () => unknown): string | null {
    try {
      check()
      return null
    } catch (error: any) {
      return String(error?.message || 'Invalid')
    }
  }
}

export const recordFileImportService = new RecordFileImportService()

/**
 * Brings in the lists an office keeps in its old job system (MyMobileWorkers and the like): stores
 * and clients, staff, vans, tools and devices, rates, jobs and the check results on those jobs.
 * The file is a CSV saved from the spreadsheet, or a JSON list.
 *
 * Rules the rest of the platform relies on:
 *  - A store or client becomes an outside contact (`org_contacts`, scope `external`) with its store
 *    number, the same record the job forms, bills and job links already use. One contact per store
 *    number; a second row with the same number is never a second contact.
 *  - A job still open becomes a waiting job (a job intake, source "import") for the office to book.
 *    A finished, failed or cancelled job becomes history. What the old system said about the job
 *    (its status, branch, times, instructions, notes and checks) is kept on it. History starts no workflow, sends no bill and pays
 *    nobody, so bringing an old file in can never charge a client twice.
 *  - Importing the same file again adds nothing: rows are matched on store number, job number,
 *    registration, rate name, staff login or number, or the item's name and serial.
 *  - Cells that only say there is nothing ("N/A", "-", "Unknown") are read as blank. Phone numbers
 *    starting with 0 are read as local to the country the office picks.
 *  - A bad row is reported with the reason and skipped; the rest still go in.
 */

import { randomUUID } from 'crypto'

import {
  FIELD_IMPORT_COUNTRIES,
  FIELD_IMPORT_KIND_INFO,
  type FieldImportCountry,
  type FieldImportKind,
  type FieldImportOptions,
  type FieldImportPreview,
  type FieldImportResult,
  type FieldImportRowPreview,
  type ImportedJobDetails,
} from '../config/fieldDataImport'
import {
  findContactByStoreNumber,
  listContacts,
  normalizeStoreNumber,
  upsertContact,
} from '../persistence/ContactRepository'
import { DatabaseManager } from '../persistence/DatabaseManager'
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
  /** Also match a header that starts with one of these ("Invoice sent to Lidl?"). */
  prefixes?: string[]
}

const JOB_NUMBER_ALIASES = [
  'jobnumber',
  'jobno',
  'jobid',
  'jobref',
  'jobreference',
  'workorder',
  'workordernumber',
  'ticket',
  'ticketnumber',
  'reference',
  'ref',
  'number',
  'id',
]
const PHONE_ALIASES = [
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'cell',
  'cellphone',
  'telephone',
  'tel',
  'contactnumber',
  'contactnumbers',
  'contactphone',
  'whatsapp',
]

const SPECS: Record<FieldImportKind, ColumnSpec[]> = {
  stores: [
    {
      key: 'storeNumber',
      meaning: 'Store number',
      aliases: [
        'storenumber',
        'storeno',
        'storeid',
        'storecode',
        'shopnumber',
        'shopno',
        'shopcode',
        'sitenumber',
        'siteno',
        'sitecode',
        'store',
        'shop',
        'site',
        'branchcode',
        'branchnumber',
        'branchno',
        'customernumber',
        'customerno',
        'customercode',
        'clientnumber',
        'clientno',
        'clientcode',
        'accountnumber',
        'accountno',
        'accountcode',
        'code',
      ],
    },
    {
      key: 'name',
      meaning: 'Name',
      aliases: [
        'storename',
        'shopname',
        'sitename',
        'branchname',
        'customername',
        'clientname',
        'companyname',
        'organisation',
        'organization',
        'company',
        'customer',
        'client',
        'name',
        'branch',
      ],
      required: true,
    },
    { key: 'phone', meaning: 'Phone', aliases: PHONE_ALIASES },
    { key: 'email', meaning: 'Email', aliases: ['email', 'emailaddress', 'contactemail', 'mail'] },
    {
      key: 'address',
      meaning: 'Address (kept in notes)',
      aliases: [
        'address',
        'streetaddress',
        'physicaladdress',
        'address1',
        'address2',
        'address3',
        'address4',
        'location',
        'street',
        'suburb',
        'town',
        'city',
      ],
      multi: true,
    },
    { key: 'postcode', meaning: 'Postcode', aliases: ['postcode', 'postalcode', 'zip', 'zipcode'] },
    {
      key: 'person',
      meaning: 'Contact person (kept in notes)',
      aliases: ['contactperson', 'contactname', 'contact', 'manager', 'storemanager', 'attention'],
    },
    {
      key: 'externalId',
      meaning: 'Id in the old system',
      aliases: ['externalid', 'customerreferencenumber', 'customerreference', 'customerref', 'accountref', 'legacyid'],
    },
  ],
  people: [
    {
      key: 'fullName',
      meaning: 'Name',
      aliases: ['fullname', 'name', 'employeename', 'staffname', 'workername', 'displayname'],
    },
    { key: 'firstName', meaning: 'First name', aliases: ['firstname', 'forename', 'givenname', 'first'] },
    { key: 'lastName', meaning: 'Surname', aliases: ['lastname', 'surname', 'familyname', 'last'] },
    {
      key: 'username',
      meaning: 'Login name in the old system',
      aliases: ['username', 'login', 'loginname', 'userid', 'user'],
    },
    {
      key: 'staffNumber',
      meaning: 'Staff number',
      aliases: ['staffnumber', 'staffno', 'employeenumber', 'employeeno', 'payrollnumber', 'employeeid', 'externalid'],
    },
    { key: 'phone', meaning: 'Phone', aliases: PHONE_ALIASES },
    { key: 'email', meaning: 'Email', aliases: ['email', 'emailaddress', 'workemail', 'mail'] },
    { key: 'branch', meaning: 'Branch', aliases: ['branch', 'branchname', 'depot', 'office', 'region', 'team'] },
    { key: 'archived', meaning: 'Left the company', aliases: ['archived', 'inactive', 'left', 'deleted', 'leaver'] },
    { key: 'status', meaning: 'Status', aliases: ['accountstatus', 'status', 'employmentstatus'] },
  ],
  vans: [
    {
      key: 'registration',
      meaning: 'Registration',
      aliases: [
        'registration',
        'reg',
        'regno',
        'regnumber',
        'registrationnumber',
        'numberplate',
        'plate',
        'licenceplate',
        'licenseplate',
        'vehicle',
        'vehiclereg',
        'vehicleregistration',
      ],
      required: true,
    },
    {
      key: 'description',
      meaning: 'Description',
      aliases: ['description', 'makemodel', 'vehicletype', 'name', 'colour', 'color'],
      multi: true,
    },
    { key: 'make', meaning: 'Make', aliases: ['make', 'manufacturer'] },
    { key: 'model', meaning: 'Model', aliases: ['model'] },
    { key: 'branch', meaning: 'Branch', aliases: ['branch', 'depot', 'base', 'office'] },
    {
      key: 'mileage',
      meaning: 'Mileage',
      aliases: ['mileage', 'odometer', 'miles', 'km', 'kilometres', 'kilometers', 'currentmileage'],
    },
    { key: 'serviceDay', meaning: 'Service day', aliases: ['serviceday', 'weekday', 'dayofweek', 'day'] },
    {
      key: 'motDue',
      meaning: 'MOT due',
      aliases: [
        'motdue',
        'motdate',
        'motexpiry',
        'motexpires',
        'mot',
        'roadworthy',
        'roadworthydue',
        'fitnessdue',
        'licenceexpiry',
        'licenseexpiry',
      ],
    },
    {
      key: 'taxDue',
      meaning: 'Tax due',
      aliases: ['taxdue', 'taxexpiry', 'taxexpires', 'roadtax', 'tax', 'zinara', 'licencedisc'],
    },
    {
      key: 'lastCheck',
      meaning: 'Last check',
      aliases: ['lastcheck', 'lastchecked', 'lastdailycheck', 'lastinspection'],
    },
    {
      key: 'lastCheckResult',
      meaning: 'Last check result',
      aliases: ['passedchecks', 'lastcheckresult', 'checkresult', 'checkstatus'],
    },
    { key: 'archived', meaning: 'No longer used', aliases: ['archived', 'inactive', 'retired', 'sold', 'disposed'] },
    { key: 'status', meaning: 'Status', aliases: ['vehiclestatus', 'status', 'state'] },
  ],
  equipment: [
    {
      key: 'name',
      meaning: 'Name',
      aliases: [
        'name',
        'item',
        'itemname',
        'equipment',
        'tool',
        'device',
        'asset',
        'assetname',
        'description',
        'title',
      ],
      required: true,
    },
    { key: 'category', meaning: 'Category', aliases: ['category', 'type', 'group', 'kind'] },
    {
      key: 'productCode',
      meaning: 'Product code',
      aliases: ['productcode', 'code', 'sku', 'model', 'modelnumber', 'partnumber'],
    },
    {
      key: 'serial',
      meaning: 'Serial number',
      aliases: ['serialnumber', 'serial', 'serialno', 'imei', 'assettag', 'assetnumber', 'externalid'],
    },
    { key: 'price', meaning: 'Value', aliases: ['price', 'value', 'cost', 'purchaseprice', 'amount'] },
    { key: 'currency', meaning: 'Currency', aliases: ['currency', 'currencycode'] },
    {
      key: 'holder',
      meaning: 'Held by',
      aliases: ['assignedto', 'holder', 'heldby', 'issuedto', 'employee', 'user', 'worker'],
    },
    { key: 'notes', meaning: 'Notes', aliases: ['notes', 'note', 'comments', 'comment', 'remarks'] },
  ],
  rates: [
    {
      key: 'name',
      meaning: 'Name',
      aliases: [
        'name',
        'ratename',
        'item',
        'itemname',
        'service',
        'servicename',
        'description',
        'product',
        'productname',
        'title',
      ],
      required: true,
    },
    {
      key: 'price',
      meaning: 'Price',
      aliases: ['price', 'unitprice', 'rate', 'amount', 'cost', 'charge', 'sellingprice', 'fee'],
      required: true,
    },
    { key: 'unit', meaning: 'Unit', aliases: ['unit', 'per', 'uom', 'unitofmeasure', 'basis'] },
    { key: 'currency', meaning: 'Currency', aliases: ['currency', 'currencycode'] },
    {
      key: 'problemType',
      meaning: 'Type of problem',
      aliases: ['problemtype', 'jobtype', 'type', 'category', 'worktype'],
    },
  ],
  jobs: [
    { key: 'reference', meaning: 'Job number', aliases: JOB_NUMBER_ALIASES, required: true },
    {
      key: 'description',
      meaning: 'What the job is',
      aliases: [
        'description',
        'jobdescription',
        'details',
        'jobdetails',
        'workrequired',
        'fault',
        'faultdescription',
        'issue',
        'title',
        'jobtitle',
        'summary',
        'subject',
      ],
    },
    {
      key: 'instructions',
      meaning: 'Instructions',
      aliases: ['specialinstructions', 'instructions', 'jobinstructions'],
    },
    { key: 'task', meaning: 'Task', aliases: ['task', 'tasks', 'worktodo'] },
    {
      key: 'notes',
      meaning: 'Worker notes',
      aliases: ['notes', 'jobnotes', 'workernotes', 'engineernotes', 'comments'],
    },
    {
      key: 'storeNumber',
      meaning: 'Store number',
      aliases: [
        'storenumber',
        'storeno',
        'storeid',
        'storecode',
        'shopnumber',
        'shopno',
        'sitenumber',
        'siteno',
        'store',
        'shop',
        'site',
        'customernumber',
        'customerno',
        'clientnumber',
        'clientno',
        'branchcode',
      ],
    },
    {
      key: 'clientName',
      meaning: 'Client or store name',
      aliases: [
        'storename',
        'shopname',
        'sitename',
        'customername',
        'clientname',
        'customer',
        'client',
        'company',
        'companyname',
      ],
    },
    {
      key: 'externalId',
      meaning: 'Client reference',
      aliases: ['externalid', 'clientreference', 'customerreference', 'clientref', 'customerref'],
    },
    { key: 'phone', meaning: 'Client phone', aliases: ['clientphone', 'customerphone', ...PHONE_ALIASES] },
    {
      key: 'contactName',
      meaning: 'Contact on site',
      aliases: ['contactname', 'contact', 'sitecontact', 'contactperson'],
    },
    { key: 'status', meaning: 'Status', aliases: ['status', 'jobstatus', 'state', 'stage'] },
    {
      key: 'failureType',
      meaning: 'Why it failed',
      aliases: ['failuretype', 'failurereason', 'reasonforfailure', 'failreason'],
    },
    { key: 'priority', meaning: 'Priority', aliases: ['priority', 'urgency'] },
    {
      key: 'scheduled',
      meaning: 'Booked for',
      aliases: [
        'scheduleddate',
        'scheduled',
        'bookeddate',
        'bookedfor',
        'duedate',
        'due',
        'startdate',
        'start',
        'date',
        'jobdate',
        'timeslot',
        'createddate',
        'created',
      ],
    },
    {
      key: 'received',
      meaning: 'Received',
      aliases: ['createdat', 'receiveddate', 'received', 'receivedat', 'loggedat', 'dateraised', 'raisedon'],
    },
    { key: 'arrived', meaning: 'Arrived', aliases: ['arrivedat', 'arrived', 'arrivaltime', 'onsiteat'] },
    {
      key: 'completed',
      meaning: 'Completed on',
      aliases: [
        'completeddate',
        'completedon',
        'completedat',
        'completed',
        'completiondate',
        'finisheddate',
        'finished',
        'closeddate',
        'closed',
        'enddate',
        'end',
      ],
    },
    {
      key: 'worker',
      meaning: 'Worker',
      aliases: [
        'worker',
        'workername',
        'assignedto',
        'assignee',
        'technician',
        'technicianname',
        'engineer',
        'engineername',
        'attendant',
        'employee',
        'staff',
        'staffname',
      ],
    },
    {
      key: 'helpers',
      meaning: 'Also on the job',
      aliases: ['secondaryusers', 'helpers', 'assistants', 'team', 'otherworkers'],
    },
    {
      key: 'vehicle',
      meaning: 'Van',
      aliases: ['plannedvehicles', 'vehicle', 'van', 'vehiclereg', 'vehicleregistration'],
    },
    { key: 'branch', meaning: 'Branch', aliases: ['branch', 'depot', 'region', 'office'] },
    {
      key: 'amount',
      meaning: 'Amount',
      aliases: ['amount', 'price', 'total', 'jobtotal', 'value', 'cost', 'quote', 'quoteamount', 'charge'],
    },
    { key: 'currency', meaning: 'Currency', aliases: ['currency', 'currencycode'] },
    {
      key: 'poNumber',
      meaning: 'PO number',
      aliases: ['ponumber', 'pono', 'po', 'purchaseorder', 'purchaseordernumber', 'orderno', 'ordernumber'],
    },
    { key: 'invoiceNote', meaning: 'Invoice note', aliases: ['invoicenumber', 'invoiceno', 'invoice', 'invoiceref'] },
    {
      key: 'invoiceSent',
      meaning: 'Invoice sent on',
      aliases: ['invoicesent', 'invoicesentdate', 'invoicedate', 'dateinvoiced', 'invoiced'],
      prefixes: ['invoicesent'],
    },
    {
      key: 'problemType',
      meaning: 'Type of problem',
      aliases: ['problemtype', 'jobtype', 'type', 'category', 'worktype', 'faulttype', 'trade'],
    },
    {
      key: 'location',
      meaning: 'Where on site',
      aliases: ['location', 'address', 'siteaddress', 'area', 'jobaddress'],
    },
    { key: 'postcode', meaning: 'Postcode', aliases: ['postcode', 'postalcode', 'zip', 'zipcode'] },
    { key: 'flags', meaning: 'Flags', aliases: ['flags', 'flag', 'tags'] },
    { key: 'callOut', meaning: 'Call-out', aliases: ['callout', 'calledout', 'emergency', 'urgent', 'unplanned'] },
  ],
  checks: [
    { key: 'reference', meaning: 'Job number', aliases: JOB_NUMBER_ALIASES, required: true },
    {
      key: 'name',
      meaning: 'Check',
      aliases: ['name', 'checkname', 'check', 'checklist', 'checklistname', 'question', 'item', 'form'],
      required: true,
    },
    {
      key: 'result',
      meaning: 'Result',
      aliases: ['checklistresult', 'result', 'checkresult', 'outcome', 'passfail', 'answer'],
      required: true,
    },
  ],
}

const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const cleanText = (value: unknown, max = 400): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

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
  // Two-digit years are this century: 15/10/26 is 15 October 2026.
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?:[T\s].*)?$/)
  if (match) return make(2000 + Number(match[3]), Number(match[2]), Number(match[1]))
  match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})(?:[T\s].*)?$/)
  if (match) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1
    return month ? make(Number(match[3]), month, Number(match[1])) : null
  }
  return null
}

/** What old systems write in a cell they have nothing for. */
const PLACEHOLDER = /^(n\/?a|none|null|nil|unknown|tbc|tba|-+|\.)$/i

/** The cell's text, or `''` when it only says there is nothing ("N/A", "-", "Unknown"). */
function cellText(value: unknown, max = 400): string {
  const text = cleanText(value, max)
  return PLACEHOLDER.test(text) ? '' : text
}

const DIAL_CODES: Record<FieldImportCountry, string> = Object.fromEntries(
  FIELD_IMPORT_COUNTRIES.map((entry) => [entry.value, entry.dialCode]),
) as Record<FieldImportCountry, string>

/**
 * `+…` for a number we can use, `''` for blank, `null` if too short to be a phone number. A cell
 * holding several numbers gives the first. A number starting with 0 is local to `country`.
 */
export function importPhone(raw: unknown, country: FieldImportCountry = 'ZW'): string | null {
  const text = cellText(raw, 120)
  if (!text) return ''
  const first =
    text
      .split(/[,;/|]|\s{2,}|\bor\b|&/i)
      .map((part) => part.trim())
      .find((part) => /\d/.test(part)) || text
  if (country !== 'ZW') {
    const digits = first.replace(/\D/g, '')
    const local = /^0[1-9]\d{8,10}$/.test(digits)
    const international = digits.startsWith('00') ? digits.slice(2) : first.trim().startsWith('+') ? digits : ''
    const full = local ? `${DIAL_CODES[country]}${digits.slice(1)}` : international || digits
    return full.length >= 9 && full.length <= 15 ? `+${full}` : null
  }
  const digits = normalizeContactPhone(first)
  return digits.length >= 9 && digits.length <= 15 ? `+${digits}` : null
}

function importAmount(raw: unknown): number | null | undefined {
  const text = cleanText(raw, 40)
  if (!text) return undefined
  if (!/\d/.test(text)) return null
  const stripped = text.replace(/[^0-9.,-]/g, '')
  const normalised =
    /,\d{1,2}$/.test(stripped) && !stripped.includes('.') ? stripped.replace(',', '.') : stripped.replace(/,/g, '')
  const value = Number(normalised)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
}

function importFlag(raw: unknown): boolean {
  return /^(yes|y|true|1|x)$/i.test(cleanText(raw, 10))
}

function jobOutcome(status: string): 'open' | 'completed' | 'cancelled' | 'failed' {
  // Whole words only: "Assigned" must not read as "signed off".
  if (/\b(cancel(l)?ed|cancellation|void(ed)?|rejected|declined|abandoned|withdrawn)\b/i.test(status))
    return 'cancelled'
  if (/\b(fail(ed|ure)?|no access|access denied|aborted|unsuccessful)\b/i.test(status)) return 'failed'
  if (/\b(complete(d)?|done|closed|finished|signed[ -]?off|invoiced|paid|resolved|reconciled)\b/i.test(status))
    return 'completed'
  return 'open'
}

type Table = { headers: string[]; records: Array<Record<string, string>> }

function readFile(content: string, format?: string): Table {
  const text = String(content ?? '')
  if (!text.trim()) throw new Error('The file is empty')
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES)
    throw new Error('The file is larger than 2 MB. Split it and import in parts.')
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

function rank(spec: ColumnSpec, header: string): number {
  const index = spec.aliases.indexOf(squash(header))
  return index < 0 ? spec.aliases.length : index
}

function mapColumns(headers: string[], specs: ColumnSpec[]) {
  const claimed = new Set<string>()
  const mapped: Record<string, string[]> = {}
  for (const spec of specs) {
    const candidates = headers
      .filter(
        (header) =>
          !claimed.has(header) &&
          (spec.aliases.includes(squash(header)) ||
            (spec.prefixes || []).some((prefix) => squash(header).startsWith(prefix))),
      )
      .sort((a, b) => rank(spec, a) - rank(spec, b))
    const chosen = spec.multi ? candidates : candidates.slice(0, 1)
    if (chosen.length) {
      mapped[spec.key] = chosen
      chosen.forEach((header) => claimed.add(header))
    }
  }
  return { mapped, ignored: headers.filter((header) => !claimed.has(header)) }
}

/** `YYYY-MM-DDTHH:MM:00` when the cell has a time, `YYYY-MM-DD` when only a date, else the text as written. */
function importMoment(raw: string): string {
  const text = cellText(raw, 60)
  if (!text) return ''
  const day = importDate(text)
  if (!day) return text
  const time = text.slice(10).match(/(\d{1,2}):(\d{2})/)
  return time ? `${day}T${time[1].padStart(2, '0')}:${time[2]}:00` : day
}

/** The time part of a timeslot ("23-11-2026 08:00" gives "08:00"); nothing for "Any Time" or midnight. */
function slotTime(raw: string): string {
  const text = cellText(raw, 60)
  const rest = text.replace(/^\s*\S+/, '').trim()
  if (!rest || /^any\s*time$/i.test(rest) || /^0?0:00(:00)?$/.test(rest)) return ''
  return rest.slice(0, 40)
}

/** "GeorgeTavenenhamo_deleted" reads as "George Tavenenhamo". */
function nameFromUsername(username: string): string {
  return username
    .replace(/_deleted$/i, '')
    .replace(/[_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "1007 - Great Bridge" carries store 1007 in its name. */
function storeNumberInName(name: string): string {
  const match = cleanText(name).match(/^(\d{2,6})\s*[-–:]\s*\S/)
  return match ? normalizeStoreNumber(match[1]) : ''
}

/** A job form name ("Job Card v2") says nothing about the problem. */
const JOB_FORM = /^job\s*(card|sheet|form)\b/i

function staffNumberLike(value: string): string {
  return /\d/.test(value) && /^[A-Za-z0-9/-]{1,20}$/.test(value) ? value : ''
}

function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(
    ([, item]) => item !== undefined && item !== '' && !(Array.isArray(item) && !item.length),
  )
  return entries.length ? (Object.fromEntries(entries) as T) : undefined
}

function parseJson(text: unknown): Record<string, any> {
  try {
    const parsed = JSON.parse(String(text || ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

interface PlannedRow {
  preview: FieldImportRowPreview
  /** Saves the row. Only set when the row is new. */
  apply?: () => void
}

type Reader = (record: Record<string, string>, key: string) => string

interface ImportSettings {
  country: FieldImportCountry
  currency: string
}

function settings(options: FieldImportOptions = {}): ImportSettings {
  const country = FIELD_IMPORT_COUNTRIES.some((entry) => entry.value === options.country)
    ? (options.country as FieldImportCountry)
    : 'ZW'
  const currency = String(options.currency || 'USD')
    .trim()
    .toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`"${options.currency}" is not a currency code`)
  return { country, currency }
}

export class FieldDataImportService {
  public preview(
    orgTenantId: string,
    kind: FieldImportKind,
    content: string,
    format?: string,
    options: FieldImportOptions = {},
  ): FieldImportPreview {
    const { table, mapped, ignored, missing, planned } = this.plan(
      orgTenantId,
      'preview',
      kind,
      content,
      format,
      options,
    )
    return this.summarise(kind, table, mapped, ignored, missing, planned)
  }

  public commit(
    orgTenantId: string,
    actorId: string,
    kind: FieldImportKind,
    content: string,
    format?: string,
    options: FieldImportOptions = {},
  ): FieldImportResult {
    const { missing, planned } = this.plan(orgTenantId, actorId, kind, content, format, options)
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
        rows.push({
          ...item.preview,
          status: /already (saved|on the register)/i.test(message) ? 'exists' : 'problem',
          problem: message,
        })
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

  private plan(
    orgTenantId: string,
    actorId: string,
    kind: FieldImportKind,
    content: string,
    format: string | undefined,
    options: FieldImportOptions,
  ) {
    const setup = settings(options)
    const table = readFile(content, format)
    if (table.records.length > MAX_IMPORT_ROWS) {
      throw new Error(`The file has ${table.records.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`)
    }
    const specs = SPECS[kind]
    const { mapped, ignored } = mapColumns(table.headers, specs)
    const missing = specs
      .filter((spec) => spec.required && !mapped[spec.key]?.length)
      .map((spec) => spec.meaning.toLowerCase())
    if (missing.length) {
      return { table, mapped, ignored, missing, planned: [] as PlannedRow[] }
    }
    const read: Reader = (record, key) =>
      (mapped[key] || [])
        .map((header) => cellText(record[header]))
        .filter(Boolean)
        .join(', ')
    const planners: Record<FieldImportKind, () => PlannedRow[]> = {
      stores: () => this.planStores(orgTenantId, table, read, setup),
      people: () => this.planPeople(orgTenantId, table, read, setup),
      vans: () => this.planVans(orgTenantId, actorId, table, read),
      equipment: () => this.planEquipment(orgTenantId, table, read, setup),
      rates: () => this.planRates(orgTenantId, table, read, setup),
      jobs: () => this.planJobs(orgTenantId, actorId, table, read, setup),
      checks: () => this.planChecks(orgTenantId, table, read),
    }
    return { table, mapped, ignored, missing, planned: planners[kind]() }
  }

  // ─── Stores and clients ───────────────────────────────────────────────

  private planStores(orgTenantId: string, table: Table, read: Reader, setup: ImportSettings): PlannedRow[] {
    const seenNumbers = new Map<string, number>()
    const seenNames = new Set<string>()
    const known = listContacts(orgTenantId, 'external')
    return table.records.map((record, index) => {
      const row = index + 2
      const externalId = read(record, 'externalId').slice(0, 80)
      const rawName = read(record, 'name')
      // Stores often only carry their number at the front of the name, or as the old system's id.
      const storeNumber = normalizeStoreNumber(
        read(record, 'storeNumber') || storeNumberInName(rawName) || (/^\d{2,6}$/.test(externalId) ? externalId : ''),
      )
      const name = rawName || (storeNumber ? `Store ${storeNumber}` : '')
      const label = [storeNumber ? `Store ${storeNumber}` : '', name].filter(Boolean).join(' · ')
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label || `Row ${row}`, problem: text },
      })
      if (!name) return problem('No name or store number')
      const email = read(record, 'email')
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(`"${email}" is not an email address`)
      // A phone the old system mangled is left out, not a reason to lose the row.
      const parsedPhone = importPhone(read(record, 'phone'), setup.country)
      const phone = parsedPhone ?? ''
      const phoneNote =
        parsedPhone === null ? `"${read(record, 'phone')}" is not a phone number, so it was left out` : ''
      const earlier = storeNumber ? seenNumbers.get(storeNumber) : undefined
      if (earlier) {
        return {
          preview: {
            row,
            status: 'exists',
            summary: label,
            note: `Same store as row ${earlier}, which is the one kept`,
          },
        }
      }
      if (storeNumber) seenNumbers.set(storeNumber, row)
      const nameKey = name.toLowerCase()
      const saved = storeNumber
        ? findContactByStoreNumber(orgTenantId, storeNumber)
        : known.find((contact) => contact.name.toLowerCase() === nameKey && !contact.storeNumber)
      if (saved || (!storeNumber && seenNames.has(nameKey))) {
        return {
          preview: {
            row,
            status: 'exists',
            summary: label,
            note: saved ? `Already saved as ${saved.name}` : 'Same name as an earlier row',
          },
        }
      }
      if (!storeNumber) seenNames.add(nameKey)
      const postcode = read(record, 'postcode').toUpperCase().slice(0, 20)
      const notes = [
        read(record, 'address') && `Address: ${read(record, 'address')}`,
        read(record, 'person') && `Contact: ${read(record, 'person')}`,
      ]
        .filter(Boolean)
        .join('\n')
      return {
        preview: {
          row,
          status: 'new',
          summary: label,
          ...(phoneNote || !phone
            ? { note: phoneNote || 'No phone number: bills and job links cannot be texted to this one' }
            : {}),
        },
        apply: () => {
          const contact = upsertContact({
            orgTenantId,
            contactScope: 'external',
            name: name.slice(0, 160),
            phone: phone || undefined,
            email: email || undefined,
            notes: notes || undefined,
            storeNumber,
          })
          if (postcode || externalId) {
            DatabaseManager.getDatabase()
              .prepare('UPDATE org_contacts SET postcode = ?, external_id = ? WHERE id = ? AND org_tenant_id = ?')
              .run(postcode || null, externalId || null, contact.id, orgTenantId)
          }
        },
      }
    })
  }

  // ─── Staff ────────────────────────────────────────────────────────────

  private planPeople(orgTenantId: string, table: Table, read: Reader, setup: ImportSettings): PlannedRow[] {
    const db = DatabaseManager.getDatabase()
    const staff = db
      .prepare(
        'SELECT id, first_name, last_name, phone, email, staff_number, legacy_username FROM employees WHERE tenant_id = ?',
      )
      .all(orgTenantId) as Array<Record<string, string | null>>
    const byUsername = new Map(
      staff.filter((e) => e.legacy_username).map((e) => [String(e.legacy_username).toLowerCase(), e]),
    )
    const byNumber = new Map(staff.filter((e) => e.staff_number).map((e) => [String(e.staff_number).toLowerCase(), e]))
    const byPhone = new Map(staff.filter((e) => e.phone).map((e) => [String(e.phone).replace(/\D/g, ''), e]))
    const byEmail = new Map(staff.filter((e) => e.email).map((e) => [String(e.email).toLowerCase(), e]))
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const rawUsername = read(record, 'username').slice(0, 80)
      const deleted = /_deleted$/i.test(rawUsername)
      const username = rawUsername.replace(/_deleted$/i, '')
      const first = read(record, 'firstName')
      const last = read(record, 'lastName')
      const fullName = (
        read(record, 'fullName') ||
        [first, last].filter(Boolean).join(' ') ||
        nameFromUsername(rawUsername)
      ).slice(0, 160)
      const label = fullName || username || `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
      if (!fullName) return problem('No name')
      if (/^head\s*office$/i.test(fullName) || /^headoffice$/i.test(username)) {
        return problem('An office login, not a person')
      }
      const email = read(record, 'email').toLowerCase()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(`"${email}" is not an email address`)
      // A phone the old system mangled is left out, not a reason to lose the row.
      const parsedPhone = importPhone(read(record, 'phone'), setup.country)
      const phone = parsedPhone ?? ''
      const phoneNote =
        parsedPhone === null ? `"${read(record, 'phone')}" is not a phone number, so it was left out` : ''
      const staffNumber = staffNumberLike(read(record, 'staffNumber'))
      const key = (username || fullName).toLowerCase()
      const earlier = seen.get(key)
      if (earlier) return { preview: { row, status: 'exists', summary: label, note: `Same person as row ${earlier}` } }
      seen.set(key, row)
      const match =
        (username && byUsername.get(username.toLowerCase())) ||
        (staffNumber && byNumber.get(staffNumber.toLowerCase())) ||
        (phone && byPhone.get(phone.replace(/\D/g, ''))) ||
        (email && byEmail.get(email))
      if (match) {
        return {
          preview: {
            row,
            status: 'exists',
            summary: label,
            note: `Already on staff as ${[match.first_name, match.last_name].filter(Boolean).join(' ')}`,
          },
        }
      }
      const left =
        deleted ||
        importFlag(read(record, 'archived')) ||
        /\b(inactive|archived|deleted|disabled|left|terminated|suspended)\b/i.test(read(record, 'status'))
      const branch = read(record, 'branch').slice(0, 80)
      const [given, ...rest] = fullName.split(' ')
      return {
        preview: {
          row,
          status: 'new',
          summary: [label, branch, left ? 'left' : ''].filter(Boolean).join(' · '),
          ...(phoneNote
            ? { note: phoneNote }
            : left || phone
              ? {}
              : { note: 'No phone: they are linked to their account by phone number when they join' }),
        },
        apply: () => {
          db.prepare(
            `INSERT INTO employees
               (id, tenant_id, first_name, last_name, email, phone, base_salary, currency, status, staff_number, branch, legacy_username)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          ).run(
            `EMP-${randomUUID()}`,
            orgTenantId,
            first || given,
            last || rest.join(' '),
            email || null,
            phone || null,
            setup.currency,
            left ? 'terminated' : 'active',
            staffNumber || null,
            branch || null,
            username || null,
          )
        },
      }
    })
  }

  // ─── Vans ─────────────────────────────────────────────────────────────

  private planVans(orgTenantId: string, actorId: string, table: Table, read: Reader): PlannedRow[] {
    const known = new Set(operationsRegisterService.listVans(orgTenantId).map((van) => van.registration))
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const registration = read(record, 'registration').toUpperCase().replace(/\s+/g, ' ').slice(0, 20)
      const label = registration || `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
      if (!registration) return problem('No registration')
      const earlier = seen.get(registration)
      if (earlier) return problem(`${registration} is already on row ${earlier} of this file`)
      seen.set(registration, row)
      if (known.has(registration))
        return { preview: { row, status: 'exists', summary: label, note: 'Already on the van register' } }
      const serviceDay = read(record, 'serviceDay').toLowerCase()
      if (serviceDay && !DAYS.includes(serviceDay)) return problem(`"${serviceDay}" is not a day of the week`)
      const dates: Record<'motDue' | 'taxDue' | 'lastCheck', string> = { motDue: '', taxDue: '', lastCheck: '' }
      for (const key of Object.keys(dates) as Array<keyof typeof dates>) {
        const value = importDate(read(record, key))
        if (value === null) return problem(`"${read(record, key)}" is not a date (use day/month/year)`)
        dates[key] = value
      }
      const notes: string[] = []
      const mileageText = read(record, 'mileage').replace(/[^\d.]/g, '')
      let mileage: number | undefined = mileageText ? Math.round(Number(mileageText)) : undefined
      if (mileage !== undefined && (!Number.isFinite(mileage) || mileage > 2_000_000)) {
        notes.push(`Mileage ${read(record, 'mileage')} looks wrong and was left out`)
        mileage = undefined
      }
      const result = read(record, 'lastCheckResult')
      const lastCheckOutcome = /^(pass(ed)?|ok|yes|true|1)$/i.test(result)
        ? 'ok'
        : /^(fail(ed)?|defect|no|false|0)$/i.test(result)
          ? 'defect'
          : undefined
      const statusText = read(record, 'status')
      const status =
        importFlag(read(record, 'archived')) ||
        /\b(retired|sold|scrapped|archived|disposed|written off)\b/i.test(statusText)
          ? ('retired' as const)
          : /\b(off.?road|vor|repair|garage|broken)\b/i.test(statusText)
            ? ('off_road' as const)
            : ('active' as const)
      const description = [read(record, 'description'), read(record, 'make'), read(record, 'model')]
        .filter(Boolean)
        .join(' ')
        .slice(0, 200)
      const branch = read(record, 'branch').slice(0, 80)
      return {
        preview: {
          row,
          status: 'new',
          summary: [
            registration,
            description,
            status === 'retired' ? 'retired' : status === 'off_road' ? 'off road' : '',
          ]
            .filter(Boolean)
            .join(' · '),
          ...(notes.length ? { note: notes.join(' ') } : {}),
        },
        apply: () => {
          operationsRegisterService.saveVan(orgTenantId, actorId, {
            registration,
            description,
            serviceDay,
            status,
            ...(branch ? { branch } : {}),
            ...(mileage !== undefined ? { mileage } : {}),
            ...(dates.motDue ? { motDue: dates.motDue } : {}),
            ...(dates.taxDue ? { taxDue: dates.taxDue } : {}),
            ...(dates.lastCheck ? { lastCheckDate: dates.lastCheck } : {}),
            ...(lastCheckOutcome ? { lastCheckOutcome } : {}),
          })
        },
      }
    })
  }

  // ─── Tools and devices ────────────────────────────────────────────────

  private planEquipment(orgTenantId: string, table: Table, read: Reader, setup: ImportSettings): PlannedRow[] {
    const db = DatabaseManager.getDatabase()
    const known = new Set(
      (
        db
          .prepare('SELECT import_key AS importKey FROM org_equipment WHERE org_tenant_id = ?')
          .all(orgTenantId) as Array<{ importKey: string }>
      ).map((item) => item.importKey),
    )
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const name = read(record, 'name').slice(0, 160)
      const serial = read(record, 'serial').slice(0, 80)
      const notes = read(record, 'notes').slice(0, 1000)
      const label = [name, serial].filter(Boolean).join(' · ') || `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
      if (!name) return problem('No name')
      const value = importAmount(read(record, 'price'))
      if (value === null) return problem(`"${read(record, 'price')}" is not an amount`)
      const currency = (read(record, 'currency') || setup.currency).toUpperCase().slice(0, 3)
      if (!/^[A-Z]{3}$/.test(currency)) return problem(`"${currency}" is not a currency code`)
      const productCode = read(record, 'productCode').slice(0, 80)
      const holder = (
        read(record, 'holder') ||
        notes.match(/\b(?:assigned|issued|given)\s+to\s+(.+?)(?:\s+on\s+\d|[.,;]|$)/i)?.[1] ||
        ''
      ).slice(0, 160)
      const key = [name, serial, productCode, notes].map((part) => part.toLowerCase()).join('|')
      const earlier = seen.get(key)
      if (earlier) return { preview: { row, status: 'exists', summary: label, note: `Same as row ${earlier}` } }
      seen.set(key, row)
      if (known.has(key))
        return { preview: { row, status: 'exists', summary: label, note: 'Already in the equipment list' } }
      return {
        preview: { row, status: 'new', summary: [label, holder && `held by ${holder}`].filter(Boolean).join(' · ') },
        apply: () => {
          db.prepare(
            `INSERT INTO org_equipment
               (id, org_tenant_id, name, category, product_code, serial_number, value, currency, holder_name, notes, import_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            randomUUID(),
            orgTenantId,
            name,
            read(record, 'category').slice(0, 80) || null,
            productCode || null,
            serial || null,
            value ?? null,
            value === undefined ? null : currency,
            holder || null,
            notes || null,
            key,
          )
        },
      }
    })
  }

  // ─── Rates ────────────────────────────────────────────────────────────

  private planRates(orgTenantId: string, table: Table, read: Reader, setup: ImportSettings): PlannedRow[] {
    const known = new Set(fieldJobSheetService.listRateCards(orgTenantId, true).map((card) => card.name.toLowerCase()))
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const name = read(record, 'name').slice(0, 160)
      const price = importAmount(read(record, 'price'))
      const label = name ? `${name}${price ? ` · ${price}` : ''}` : `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
      if (!name) return problem('No name')
      if (price === undefined) return problem('No price')
      if (price === null) return problem(`"${read(record, 'price')}" is not a price`)
      const earlier = seen.get(name.toLowerCase())
      if (earlier) return problem(`"${name}" is already on row ${earlier} of this file`)
      seen.set(name.toLowerCase(), row)
      if (known.has(name.toLowerCase()))
        return { preview: { row, status: 'exists', summary: label, note: 'Already in your rates' } }
      const currency = (read(record, 'currency') || setup.currency).toUpperCase().slice(0, 3)
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

  // ─── Jobs ─────────────────────────────────────────────────────────────

  private planJobs(
    orgTenantId: string,
    actorId: string,
    table: Table,
    read: Reader,
    setup: ImportSettings,
  ): PlannedRow[] {
    const db = DatabaseManager.getDatabase()
    const byName = new Map<string, ReturnType<typeof listContacts>[number]>()
    for (const contact of listContacts(orgTenantId, 'external')) {
      if (contact.storeNumber && !byName.has(contact.name.toLowerCase()))
        byName.set(contact.name.toLowerCase(), contact)
    }
    // Old-system login names to the staff member's name, so the job says who did it.
    const staffNames = new Map<string, string>()
    try {
      const staff = db
        .prepare(
          'SELECT first_name, last_name, legacy_username FROM employees WHERE tenant_id = ? AND legacy_username IS NOT NULL',
        )
        .all(orgTenantId) as Array<{ first_name: string; last_name: string; legacy_username: string }>
      for (const person of staff) {
        staffNames.set(
          person.legacy_username.toLowerCase(),
          [person.first_name, person.last_name].filter(Boolean).join(' '),
        )
      }
    } catch {
      // A database without the staff columns still imports jobs; names are shown as written.
    }
    const personName = (login: string): string => {
      const bare = login.replace(/_deleted$/i, '').trim()
      return (
        staffNames.get(bare.toLowerCase()) ||
        (/^[A-Za-z]+[a-z][A-Z][A-Za-z_]*$/.test(login) ? nameFromUsername(login) : bare)
      )
    }
    const seen = new Map<string, number>()
    return table.records.map((record, index) => {
      const row = index + 2
      const reference = read(record, 'reference').slice(0, 60)
      const rawType = read(record, 'problemType').slice(0, 120)
      const jobForm = JOB_FORM.test(rawType) ? rawType : ''
      const problemType = jobForm ? '' : rawType
      const instructions = read(record, 'instructions').slice(0, 2000)
      const task = read(record, 'task').slice(0, 2000)
      const workerNotes = read(record, 'notes').slice(0, 2000)
      const clientRaw = read(record, 'clientName')
      const description = (
        read(record, 'description') ||
        instructions ||
        task ||
        workerNotes ||
        problemType ||
        (clientRaw ? `Job at ${clientRaw}` : '') ||
        // Some offices wrote the job in its number ("2077 Walsall chiller (URGENT)").
        (/[a-z]{3}/i.test(reference) ? reference : '')
      ).slice(0, 2000)
      const label = [reference, description.slice(0, 60)].filter(Boolean).join(' · ') || `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
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
      // A phone the old system mangled is left out, not a reason to lose the row.
      const parsedPhone = importPhone(read(record, 'phone'), setup.country)
      const phone = parsedPhone ?? ''
      const phoneNote =
        parsedPhone === null ? `"${read(record, 'phone')}" is not a phone number, so it was left out` : ''
      const currency = (read(record, 'currency') || setup.currency).toUpperCase().slice(0, 3)
      if (!/^[A-Z]{3}$/.test(currency)) return problem(`"${currency}" is not a currency code`)

      const status = read(record, 'status')
      const outcome = jobOutcome(status)
      // A job with a completion date is finished even when the status column is blank.
      const finished = outcome !== 'open' ? outcome : completed ? 'completed' : 'open'

      // The store: its own column, then the number in front of the client's name, then a saved
      // store with that name, then the client reference or the job number when they start with a saved store's number.
      const externalId = read(record, 'externalId').slice(0, 80)
      let storeNumber = normalizeStoreNumber(read(record, 'storeNumber')) || storeNumberInName(clientRaw)
      let contact = storeNumber
        ? findContactByStoreNumber(orgTenantId, storeNumber)
        : byName.get(clientRaw.toLowerCase())
      if (!storeNumber && contact?.storeNumber) storeNumber = contact.storeNumber
      if (!storeNumber) {
        for (const candidate of [externalId.match(/^\d{2,6}$/)?.[0], reference.match(/^(\d{3,6})(?!\d)/)?.[1]]) {
          const found = candidate ? findContactByStoreNumber(orgTenantId, candidate) : undefined
          if (found?.storeNumber) {
            storeNumber = found.storeNumber
            contact = found
            break
          }
        }
      }
      const clientName = (clientRaw || contact?.name || '').slice(0, 160)
      const clientPhone = phone || contact?.phone || ''

      const key = `import:${reference.toLowerCase()}`
      const alreadyOpen = db
        .prepare('SELECT id FROM job_intakes WHERE tenant_id = ? AND idempotency_key = ?')
        .get(orgTenantId, key)
      const alreadyHistory = db
        .prepare('SELECT id FROM job_history WHERE org_tenant_id = ? AND lower(external_reference) = ?')
        .get(orgTenantId, reference.toLowerCase())
      if (alreadyOpen || alreadyHistory) {
        return { preview: { row, status: 'exists', summary: label, note: 'Already imported' } }
      }

      const notes: string[] = phoneNote ? [phoneNote] : []
      if (storeNumber && !contact)
        notes.push(`Store ${storeNumber} is not saved yet. Import the stores first to link it.`)
      if (finished === 'open' && !clientPhone)
        notes.push('No client phone: the bill cannot be texted once the job is done')
      const note = notes.join(' ') || undefined
      const worker = personName(read(record, 'worker')).slice(0, 160)
      const helpers = read(record, 'helpers')
        .split(/\s*[,;]\s*/)
        .filter(Boolean)
        .map(personName)
        .join(', ')
        .slice(0, 400)
      const poNumber = read(record, 'poNumber').slice(0, 80)
      const location = read(record, 'location').slice(0, 200)
      const vehicle = read(record, 'vehicle').slice(0, 80)
      const invoiceSentRaw = read(record, 'invoiceSent')
      const details = compact<ImportedJobDetails>({
        externalId,
        oldStatus: status.slice(0, 80),
        branch: read(record, 'branch').slice(0, 80),
        priority: /^not\s*set$/i.test(read(record, 'priority')) ? '' : read(record, 'priority').slice(0, 40),
        timeslot: slotTime(read(record, 'scheduled')),
        jobType: jobForm,
        task: task !== description ? task : '',
        instructions: instructions !== description ? instructions : '',
        notes: workerNotes !== description ? workerNotes : '',
        failureType: read(record, 'failureType').slice(0, 120),
        contactName: read(record, 'contactName').slice(0, 160),
        contactPhone: read(record, 'phone').slice(0, 120),
        postcode: read(record, 'postcode').toUpperCase().slice(0, 20),
        receivedAt: importMoment(read(record, 'received')),
        arrivedAt: importMoment(read(record, 'arrived')),
        completedAt: importMoment(read(record, 'completed')),
        invoiceNote: read(record, 'invoiceNote').slice(0, 400),
        invoiceSentOn: invoiceSentRaw ? importDate(invoiceSentRaw) || invoiceSentRaw.slice(0, 40) : '',
        flags: read(record, 'flags').slice(0, 200),
        vehicle,
        helpers,
      })

      if (finished !== 'open') {
        return {
          preview: { row, status: 'new', summary: label, goesTo: 'history', note },
          apply: () => {
            db.prepare(
              `INSERT INTO job_history
                 (id, org_tenant_id, external_reference, store_number, client_name, description, location, problem_type,
                  po_number, scheduled_date, completed_date, outcome, worker_name, amount, currency, imported_by, details_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              details ? JSON.stringify(details) : null,
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
              ...(vehicle ? { vehicleReference: vehicle } : {}),
              ...(importFlag(read(record, 'callOut')) ||
              /\b(urgent|emergency|out of hours)\b/i.test(read(record, 'priority'))
                ? { callOut: true }
                : {}),
              ...(worker ? { importedWorkerName: worker } : {}),
              ...(details ? { importedDetails: details } : {}),
              sourceType: 'import' as const,
            },
            key,
          )
        },
      }
    })
  }

  // ─── Job check results ────────────────────────────────────────────────

  private planChecks(orgTenantId: string, table: Table, read: Reader): PlannedRow[] {
    const db = DatabaseManager.getDatabase()
    type Target = { table: 'history' | 'intake'; id: string; checks: Array<{ name: string; result: string }> }
    const targets = new Map<string, Target | null>()
    const find = (reference: string): Target | null => {
      const key = reference.toLowerCase()
      if (targets.has(key)) return targets.get(key)!
      const history = db
        .prepare(
          'SELECT id, details_json AS json FROM job_history WHERE org_tenant_id = ? AND lower(external_reference) = ?',
        )
        .get(orgTenantId, key) as { id: string; json?: string } | undefined
      const intake = history
        ? undefined
        : (db
            .prepare('SELECT id, payload_json AS json FROM job_intakes WHERE tenant_id = ? AND idempotency_key = ?')
            .get(orgTenantId, `import:${key}`) as { id: string; json?: string } | undefined)
      const found = history || intake
      const details = history ? parseJson(history.json) : parseJson(intake?.json).importedDetails || {}
      const target: Target | null = found
        ? {
            table: history ? 'history' : 'intake',
            id: found.id,
            checks: Array.isArray(details.checks) ? [...details.checks] : [],
          }
        : null
      targets.set(key, target)
      return target
    }
    return table.records.map((record, index) => {
      const row = index + 2
      const reference = read(record, 'reference').slice(0, 60)
      const name = read(record, 'name').slice(0, 160)
      const result = read(record, 'result').slice(0, 80)
      const label = [reference, name, result].filter(Boolean).join(' · ') || `Row ${row}`
      const problem = (text: string): PlannedRow => ({
        preview: { row, status: 'problem', summary: label, problem: text },
      })
      if (!reference) return problem('No job number')
      if (!name) return problem('No check name')
      if (!result) return problem('No result')
      const target = find(reference)
      if (!target) return problem(`Job ${reference} is not imported. Import the jobs first.`)
      const same = (check: { name: string; result: string }) =>
        check.name.toLowerCase() === name.toLowerCase() && check.result.toLowerCase() === result.toLowerCase()
      if (target.checks.some(same))
        return { preview: { row, status: 'exists', summary: label, note: 'Already on the job' } }
      // Later rows of the same file see this one, so a repeated row is not added twice.
      target.checks.push({ name, result })
      return {
        preview: { row, status: 'new', summary: label },
        apply: () => {
          if (target.table === 'history') {
            const current = db.prepare('SELECT details_json AS json FROM job_history WHERE id = ?').get(target.id) as {
              json?: string
            }
            const details = parseJson(current?.json)
            details.checks = [...(Array.isArray(details.checks) ? details.checks : []), { name, result }]
            db.prepare('UPDATE job_history SET details_json = ? WHERE id = ?').run(JSON.stringify(details), target.id)
          } else {
            const current = db.prepare('SELECT payload_json AS json FROM job_intakes WHERE id = ?').get(target.id) as {
              json?: string
            }
            const payload = parseJson(current?.json)
            const details =
              payload.importedDetails && typeof payload.importedDetails === 'object' ? payload.importedDetails : {}
            details.checks = [...(Array.isArray(details.checks) ? details.checks : []), { name, result }]
            payload.importedDetails = details
            db.prepare('UPDATE job_intakes SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
              JSON.stringify(payload),
              target.id,
            )
          }
        },
      }
    })
  }
}

export const fieldDataImportService = new FieldDataImportService()

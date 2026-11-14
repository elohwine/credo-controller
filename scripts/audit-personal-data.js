#!/usr/bin/env node
/**
 * Personal-data audit. Answers the question a data-protection regulator asks: which columns of
 * the operational database hold personal data in the clear, which hold only a hash or a
 * reference, and which hold credential material that belongs in the wallet.
 *
 *   node scripts/audit-personal-data.js            # summary: findings only
 *   node scripts/audit-personal-data.js --all      # every table, including the clean ones
 *   node scripts/audit-personal-data.js --json     # machine-readable, for a report
 *
 * It never prints a stored value. Each column is classified by shape (hash, ciphertext,
 * credential, identifier, free text) and counted, so the output can be pasted into a report
 * without leaking the data it is describing. Reads the database read-only; safe while the API runs.
 */

const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.env.PERSISTENCE_DB_PATH || path.join(__dirname, '../data/persistence.db')
const SAMPLE_LIMIT = 500

/** Column names that would carry personal data about a person if stored in the clear. */
const PERSONAL_NAME = /(^|_)(phone|msisdn|mobile|email|dob|date_of_birth|birth|id_number|national_id|passport|nin|ssn|full_name|first_name|last_name|surname|display_name|customer_name|payer_name|holder_name|address|street|city|postcode|gps|lat|latitude|lng|longitude|photo|image|selfie|signature|account_number|iban|card_number|next_of_kin|gender|marital)([_a-z]*)$/i

/** A name that says the value is already protected or is only a pointer. */
const PROTECTED_NAME = /(_hash|_digest|_hashed|_ref|_id|encrypted_|_encrypted|_token|_fingerprint)$|^(hash|digest|encrypted_phone)$/i

const CLASSES = {
  empty: 'empty',
  sha256: 'sha-256 hash',
  hashOther: 'other hash/digest',
  bcrypt: 'password hash (bcrypt/argon)',
  uuid: 'opaque id',
  did: 'DID',
  jwt: 'credential/token material',
  sdJwt: 'SD-JWT credential material',
  json: 'JSON document',
  url: 'URL',
  dataUri: 'embedded file (data: URI)',
  timestamp: 'timestamp',
  number: 'number',
  phone: 'PLAINTEXT phone number',
  email: 'PLAINTEXT email address',
  isoDate: 'PLAINTEXT date (yyyy-mm-dd)',
  personName: 'PLAINTEXT name-like text',
  text: 'free text',
}

function classify(value, columnName) {
  if (value === null || value === undefined || value === '') return CLASSES.empty
  if (typeof value === 'number') return CLASSES.number
  if (Buffer.isBuffer(value)) return 'binary'
  const text = String(value).trim()
  if (!text) return CLASSES.empty

  if (/^\$2[aby]\$|^\$argon2|^pbkdf2[:$]|^scrypt[:$]/.test(text)) return CLASSES.bcrypt
  if (/^[0-9a-f]{64}$/i.test(text)) return CLASSES.sha256
  if (/^[0-9a-f]{32}$|^[0-9a-f]{40}$|^[0-9a-f]{96}$|^[0-9a-f]{128}$/i.test(text)) return CLASSES.hashOther
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return CLASSES.uuid
  if (/^did:/i.test(text)) return CLASSES.did
  if (text.includes('~') && /^ey[A-Za-z0-9_-]{10,}\./.test(text)) return CLASSES.sdJwt
  if (/^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text)) return CLASSES.jwt
  if (/^data:[^;]+;base64,/i.test(text)) return CLASSES.dataUri
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text)
      return CLASSES.json
    } catch {
      /* not JSON after all */
    }
  }
  if (/^https?:\/\//i.test(text)) return CLASSES.url
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return CLASSES.timestamp
  if (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(text)) return CLASSES.email
  // A phone number, however it was typed: +263 77 000 9901, 0770009901, 263770009901.
  if (/^[+]?[\d][\d\s().-]{7,19}$/.test(text) && (text.match(/\d/g) || []).length >= 8) return CLASSES.phone
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return CLASSES.isoDate
  // Only columns that name a person. `departments.name` and `roles.name` are not people.
  const personColumn =
    /(^|_)(full_name|first_name|last_name|surname|display_name|customer_name|payer_name|holder_name|proposed_name|counterparty_name|employee_name|student_name|guardian_name|contact_name)$/i
  if (personColumn.test(columnName) && /^[\p{L}][\p{L}'.\- ]{1,60}$/u.test(text)) return CLASSES.personName
  if (/ip_address$/i.test(columnName) && /^[\d.:a-fA-F]+$/.test(text)) return 'PLAINTEXT network address'
  return CLASSES.text
}

const PLAINTEXT_CLASSES = new Set([
  CLASSES.phone,
  CLASSES.email,
  CLASSES.isoDate,
  CLASSES.personName,
  CLASSES.dataUri,
  'PLAINTEXT network address',
])
const CREDENTIAL_CLASSES = new Set([CLASSES.jwt, CLASSES.sdJwt])

function main() {
  const args = process.argv.slice(2)
  const showAll = args.includes('--all')
  const asJson = args.includes('--json')

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((row) => row.name)

  const report = []
  for (const table of tables) {
    const rowCount = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all()
    const findings = []
    for (const column of columns) {
      const named = PERSONAL_NAME.test(column.name) && !PROTECTED_NAME.test(column.name)
      let classes = {}
      let nonEmpty = 0
      if (rowCount > 0) {
        const rows = db
          .prepare(`SELECT "${column.name}" AS v FROM "${table}" WHERE "${column.name}" IS NOT NULL LIMIT ${SAMPLE_LIMIT}`)
          .all()
        for (const row of rows) {
          const klass = classify(row.v, column.name)
          if (klass === CLASSES.empty) continue
          nonEmpty += 1
          classes[klass] = (classes[klass] || 0) + 1
        }
      }
      const present = Object.keys(classes)
      const plaintext = present.filter((klass) => PLAINTEXT_CLASSES.has(klass))
      const credential = present.filter((klass) => CREDENTIAL_CLASSES.has(klass))
      if (!named && plaintext.length === 0 && credential.length === 0) continue
      findings.push({
        column: column.name,
        namedPersonal: named,
        values: nonEmpty,
        classes,
        verdict:
          plaintext.length > 0
            ? 'holds personal data in the clear'
            : credential.length > 0
              ? 'holds credential material'
              : nonEmpty === 0
                ? named
                  ? 'personal column, currently empty'
                  : 'empty'
                : 'protected or non-personal values',
      })
    }
    if (findings.length === 0 && !showAll) continue
    report.push({ table, rows: rowCount, findings })
  }

  if (asJson) {
    console.log(JSON.stringify({ database: DB_PATH, tables: report }, null, 2))
    return
  }

  const clear = report.filter((entry) => entry.findings.some((f) => f.verdict === 'holds personal data in the clear'))
  const creds = report.filter((entry) => entry.findings.some((f) => f.verdict === 'holds credential material'))

  console.log(`Personal-data audit of ${DB_PATH}`)
  console.log(`${tables.length} tables; ${report.length} have personal-looking columns.\n`)

  const print = (entries, heading) => {
    console.log(`== ${heading} (${entries.length} tables) ==`)
    for (const entry of entries) {
      console.log(`\n${entry.table}  (${entry.rows} rows)`)
      for (const finding of entry.findings) {
        const shapes = Object.entries(finding.classes)
          .sort((a, b) => b[1] - a[1])
          .map(([klass, n]) => `${klass} ×${n}`)
          .join(', ')
        console.log(`  ${finding.column.padEnd(28)} ${finding.verdict}${shapes ? ` — ${shapes}` : ''}`)
      }
    }
    console.log('')
  }

  if (clear.length) print(clear, 'Personal data in the clear')
  if (creds.length) print(creds, 'Credential material in the database')
  const rest = report.filter((entry) => !clear.includes(entry) && !creds.includes(entry))
  if (rest.length) print(rest, 'Personal columns that are hashed, empty or references only')
  db.close()
}

main()

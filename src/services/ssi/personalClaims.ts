/**
 * personalClaims — the one place that decides which claims are about a person.
 *
 * Two rules come out of docs/SSI_PRODUCTION_PROFILE.md (data minimisation rules 2, 4, 5 and 9):
 *
 *  1. The issued-card register keeps a *reference*, not the card. `redactForRegister` strips the
 *     claims that are about the person before the register row is written, and keeps a digest of
 *     the signed document so integrity can still be proved. The person's own copy, with every
 *     claim, stays in their wallet.
 *  2. A public check of a reference ("is this record real?") answers about the record, never
 *     about the person. `publicRecordClaims` is an allow-list: a claim is shown only if it names
 *     the work, the money or the organisation. Anything unrecognised is withheld, so a new claim
 *     on a card cannot leak by being forgotten here.
 *
 * Both are used by every credential type: identity cards, staff cards, job records, receipts and
 * payment records.
 */

import crypto from 'crypto'

/** Claims about a person. Never written to the register, never shown on a public check. */
export const PERSONAL_CLAIM_KEYS = new Set([
  'displayName',
  'fullName',
  'name',
  'firstName',
  'lastName',
  'surname',
  'username',
  'employeeName',
  'staffNumber',
  'customerName',
  'payerName',
  'holderName',
  'studentName',
  'guardianName',
  'approvedBy',
  'cover',
  'phone',
  'phoneNumber',
  'msisdn',
  'mobile',
  'email',
  'emailAddress',
  'dateOfBirth',
  'birthDate',
  'over18',
  'age',
  'idNumber',
  'nationalId',
  'passportNumber',
  'gender',
  'maritalStatus',
  'address',
  'homeAddress',
  'residentialAddress',
  'nextOfKin',
  'photoUri',
  'photo',
  'imageUri',
  'selfieUri',
  'signatureUri',
  'notes',
  'note',
  'latitude',
  'longitude',
  'gps',
  'bankAccount',
  'accountNumber',
])

/**
 * What a public check may repeat back: the work, the money, the organisation and the standing of
 * the record. Not the person. `issuer*` keys describe the business that issued it (its name and
 * registered contact details already appear on the invoice it sends), so they stay.
 */
export const PUBLIC_RECORD_CLAIM_KEYS = new Set([
  'reference',
  'receiptId',
  'receiptRef',
  'invoiceRef',
  'poNumber',
  'transactionId',
  'jobId',
  'workflowRunId',
  'workflowRequestId',
  'workflowType',
  'requestType',
  'amount',
  'totalAmount',
  'currency',
  'category',
  'description',
  'leaveType',
  'daysCount',
  'startDate',
  'endDate',
  'paymentDate',
  'approvedAt',
  'issuedAt',
  'capturedAt',
  'registeredAt',
  'orgName',
  'targetOrgName',
  'department',
  'orgAccess',
  'merchantName',
  'merchant',
  'schoolName',
  'clientName',
  'issuerName',
  'issuerRegistrationNumber',
  'issuerTaxNumber',
  'issuerVatNumber',
  'platformName',
  'evidenceHash',
  'fingerprint',
  'status',
  'requestStatus',
  'outcome',
  'employmentStatus',
  'role',
  'memberRole',
  'stageAction',
  'stageActions',
])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** SHA-256 over the signed document, so the register can still prove what it registered. */
export function credentialDigest(document: unknown): string {
  const text = typeof document === 'string' ? document : JSON.stringify(document ?? null)
  return crypto.createHash('sha256').update(text).digest('hex')
}

function withoutPersonalClaims(claims: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(claims)) {
    if (PERSONAL_CLAIM_KEYS.has(key)) continue
    kept[key] = isPlainObject(value) ? withoutPersonalClaims(value) : value
  }
  return kept
}

/**
 * The register's copy of an issued card: the same document with the person's own claims removed.
 * `credentialSubject.id` (the holder key the card is bound to) stays, because revocation and
 * "was this issued here" need it and it is a key, not a name.
 */
export function redactForRegister<T>(document: T): T {
  if (!isPlainObject(document)) return document
  const copy: Record<string, unknown> = { ...document }
  const subject = copy.credentialSubject
  if (isPlainObject(subject)) {
    const kept = withoutPersonalClaims(subject)
    if (typeof subject.id === 'string') kept.id = subject.id
    copy.credentialSubject = kept
  } else if (Array.isArray(subject)) {
    copy.credentialSubject = subject.map((entry) => (isPlainObject(entry) ? withoutPersonalClaims(entry) : entry))
  }
  // A signed proof over claims we no longer keep cannot be checked here, and keeping it would
  // leave credential material in an ordinary table (profile rule 2). The digest replaces it.
  delete copy.proof
  delete copy.jwt
  delete copy.compact
  return copy as T
}

/** Everything a public "check this record" answer may say about the record itself. */
export function publicRecordClaims(claims: unknown): Record<string, unknown> {
  if (!isPlainObject(claims)) return {}
  const flat: Record<string, unknown> = { ...claims }
  if (isPlainObject(claims.claims)) Object.assign(flat, claims.claims)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    if (!PUBLIC_RECORD_CLAIM_KEYS.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (isPlainObject(value)) continue
    out[key] = value
  }
  return out
}

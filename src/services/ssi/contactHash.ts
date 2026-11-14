/**
 * contactHash — the one way a phone number or an email address is turned into the value stored in
 * `ssi_users.phone_hash` / `ssi_users.email_hash`.
 *
 * Why this file exists at all
 * --------------------------
 * The platform does not keep anyone's phone number or email address; it keeps a hash and looks
 * people up by it. That only protects the person if the hash cannot be worked backwards. A plain
 * `sha256(phone)` can: a Zimbabwean mobile number is `2637` followed by seven digits, which is ten
 * million candidates, and a laptop hashes all of them in well under a second. So an unkeyed hash of
 * a phone number is not a pseudonym — it is the phone number in a thin disguise, and a regulator
 * would be right to treat it as the number itself.
 *
 * A *keyed* hash (HMAC-SHA256 under a secret that lives only in the deployment's secret store) has
 * no such shortcut: without the key there is nothing to enumerate against. That is what is written
 * today.
 *
 * Four copies of `sha256(phone)` used to live in `SSIAuthService`, `OrganizationService`,
 * `NotificationService`, `walletLookup.ts` and `ContactRepository.ts`. They all call this file now,
 * so the shape of a stored hash is decided in one place.
 *
 * Accounts created before this change
 * -----------------------------------
 * Their rows still hold the old unkeyed digest, and nothing can recompute the keyed hash without
 * the person's number. So every lookup asks for `contactHashCandidates(...)`: the keyed hash first,
 * then the old digests. When someone signs in — the one moment the number and the PIN are both in
 * hand — `SSIAuthService` rewrites their row to the keyed hash. The old digests stop appearing as
 * people return, and `legacyContactHashCount()` reports how many are left.
 */

import { createHash, createHmac } from 'crypto'

import { deploymentSecret } from '../../utils/deploymentSecret'
import { DatabaseManager } from '../../persistence/DatabaseManager'

/** Zimbabwe local numbers (`07…`) become international (`2637…`); other input keeps its digits. */
export function normalizeContactPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return `263${digits.slice(1)}`
  return digits
}

/** An email address matches regardless of spacing or capitals. */
export function normalizeContactEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase()
}

const pepper = (): string => deploymentSecret('CONTACT_HASH_PEPPER', 'credo-development-contact-pepper')

/** The value written to `phone_hash` / `email_hash` today: a keyed hash, not an open digest. */
export function contactHash(value: string): string {
  return createHmac('sha256', pepper()).update(String(value || '')).digest('hex')
}

/** The open digest written before the keyed hash. Only ever used to find an older row. */
function legacyDigest(value: string): string {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

/**
 * Every hash a stored row might hold for this phone number: the keyed hash first, then the digests
 * the older code wrote (the normalised number, its lowercase form, and the raw trimmed input, which
 * the earlier lookups each tried in turn).
 */
export function phoneHashCandidates(phone: string): string[] {
  const normalized = normalizeContactPhone(phone)
  const raw = String(phone || '')
    .trim()
    .toLowerCase()
  return [...new Set([contactHash(normalized), legacyDigest(normalized), legacyDigest(raw)])]
}

/** Every hash a stored row might hold for this email address. */
export function emailHashCandidates(email: string): string[] {
  const normalized = normalizeContactEmail(email)
  return [...new Set([contactHash(normalized), legacyDigest(normalized)])]
}

/** Both, for a lookup that accepts either. */
export function contactHashCandidates(phone?: string, email?: string): string[] {
  const candidates: string[] = []
  if (phone?.trim()) candidates.push(...phoneHashCandidates(phone))
  if (email?.trim()) candidates.push(...emailHashCandidates(email))
  return [...new Set(candidates)]
}

/** True when a stored hash is an old open digest, so the row should be rewritten on next sign-in. */
export function isLegacyContactHash(stored: string | null | undefined, value: string): boolean {
  if (!stored) return false
  return stored !== contactHash(value) && phoneHashCandidates(value).concat(emailHashCandidates(value)).includes(stored)
}

/**
 * How many accounts still hold an open digest. A keyed hash and a plain digest are both 64 hex
 * characters, so the count comes from `contact_hash_version`, which the rewrite sets. For the
 * data-protection report, not for any decision in a request.
 */
export function legacyContactHashCount(): { phone: number; email: number } {
  const db = DatabaseManager.getDatabase()
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN phone_hash IS NOT NULL AND contact_hash_version IS NULL THEN 1 ELSE 0 END) AS phone,
         SUM(CASE WHEN email_hash IS NOT NULL AND contact_hash_version IS NULL THEN 1 ELSE 0 END) AS email
       FROM ssi_users`,
    )
    .get() as { phone: number | null; email: number | null }
  return { phone: row?.phone ?? 0, email: row?.email ?? 0 }
}

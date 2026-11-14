/**
 * pinHash — how a wallet PIN is stored and checked.
 *
 * A PIN is four to six digits, so there are at most a million of them. One pass of SHA-256 over a
 * shared salt (what `ssi_users.pin_hash` held before this file) means every PIN on the platform can
 * be recovered from the database in about a second: hash the million candidates once, then read the
 * answers straight off. The salt being shared made it worse, not better — one table of a million
 * hashes covers every account at once.
 *
 * So each PIN now gets its own random salt and goes through scrypt, which is deliberately slow and
 * memory-hungry. The same million candidates then cost roughly a day per account rather than a
 * second for all of them, and no work carries from one account to the next.
 *
 * Stored form: `scrypt$<N>$<r>$<p>$<salt hex>$<hash hex>`.
 *
 * PINs set before this change stay readable by `verifyPin`, which recognises the old shape, so
 * nobody is locked out. `needsRehash` says when to replace one, and `SSIAuthService` does that on
 * the next successful sign-in — the one moment the PIN itself is in hand.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

import { deploymentSecret } from '../../utils/deploymentSecret'

/** Work factors. N=2^15 with r=8 is about 32 MB and tens of milliseconds per check. */
const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 32, maxmem: 64 * 1024 * 1024 } as const
const SALT_BYTES = 16

/** The PIN format every screen accepts: four to six digits. */
export const PIN_PATTERN = /^\d{4,6}$/

/** The stored form of a PIN. Never reversible to the PIN without the work scrypt demands. */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(pin, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** The old shape: one SHA-256 pass over a salt shared by every account. */
function legacyPinHash(pin: string): string {
  const salt = deploymentSecret('PIN_SALT', 'credo-pin-salt-v1')
  return createHash('sha256')
    .update(salt + pin)
    .digest('hex')
}

const equal = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Whether `pin` matches what is stored, in constant time, for both the scrypt form and the old one.
 * A comparison that stops at the first differing character tells an attacker how much of a guess
 * was right, so both branches go through `timingSafeEqual`.
 */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false

  if (stored.startsWith('scrypt$')) {
    const [, n, r, p, saltHex, hashHex] = stored.split('$')
    const parsed = { N: Number(n), r: Number(r), p: Number(p) }
    if (!parsed.N || !parsed.r || !parsed.p || !saltHex || !hashHex) return false
    const hash = scryptSync(pin, Buffer.from(saltHex, 'hex'), hashHex.length / 2, {
      ...parsed,
      maxmem: SCRYPT.maxmem,
    })
    return equal(hash.toString('hex'), hashHex)
  }

  return equal(legacyPinHash(pin), stored)
}

/** True when the stored PIN is in the old shape and should be replaced on this sign-in. */
export function needsRehash(stored: string | null | undefined): boolean {
  return Boolean(stored) && !String(stored).startsWith('scrypt$')
}

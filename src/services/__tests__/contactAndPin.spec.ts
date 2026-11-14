import { createHash } from 'crypto'

import { contactHash, emailHashCandidates, phoneHashCandidates } from '../ssi/contactHash'
import { hashPin, needsRehash, verifyPin } from '../ssi/pinHash'

describe('a phone number stored as a hash', () => {
  const number = '263771234567'

  it('is keyed, so the same number hashes differently once the pepper changes', () => {
    const first = contactHash(number)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(contactHash(number)).toBe(first)
    expect(first).not.toBe(createHash('sha256').update(number).digest('hex'))
  })

  it('still finds an account that was stored as an open digest', () => {
    const legacy = createHash('sha256').update(number).digest('hex')
    expect(phoneHashCandidates('0771234567')).toContain(legacy)
    expect(phoneHashCandidates('0771234567')[0]).toBe(contactHash(number))
  })

  it('treats an email the same way', () => {
    const legacy = createHash('sha256').update('rudo@example.com').digest('hex')
    expect(emailHashCandidates('  Rudo@Example.com ')).toContain(legacy)
    expect(emailHashCandidates('rudo@example.com')[0]).toBe(contactHash('rudo@example.com'))
  })
})

describe('a wallet PIN', () => {
  it('is stored so that the same PIN does not produce the same hash twice', () => {
    const first = hashPin('2468')
    const second = hashPin('2468')
    expect(first.startsWith('scrypt$')).toBe(true)
    expect(first).not.toBe(second)
    expect(verifyPin('2468', first)).toBe(true)
    expect(verifyPin('2468', second)).toBe(true)
    expect(verifyPin('1111', first)).toBe(false)
    expect(needsRehash(first)).toBe(false)
  })

  it('still accepts a PIN stored in the old shared-salt form, and says to replace it', () => {
    process.env.PIN_SALT = 'credo-pin-salt-v1'
    const legacy = createHash('sha256').update('credo-pin-salt-v1' + '2468').digest('hex')
    expect(verifyPin('2468', legacy)).toBe(true)
    expect(verifyPin('1111', legacy)).toBe(false)
    expect(needsRehash(legacy)).toBe(true)
    expect(verifyPin('2468', null)).toBe(false)
    expect(verifyPin('2468', 'scrypt$not-a-real-hash')).toBe(false)
  })
})

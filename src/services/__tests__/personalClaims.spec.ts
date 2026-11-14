import 'reflect-metadata'

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { credentialDigest, publicRecordClaims, redactForRegister } from '../ssi/personalClaims'

const identityCard = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'PlatformIdentityCredential'],
  issuer: 'did:key:zIssuer',
  issuanceDate: '2026-11-04T17:12:40.667Z',
  credentialSubject: {
    id: 'did:key:zHolder',
    displayName: 'Rudo Chikore',
    phone: '263774601564',
    dateOfBirth: '1995-07-22',
    over18: 'Yes',
    identityVerification: 'self_attested',
    verificationLevel: 'phone_verified',
    registeredAt: '2026-11-04T17:12:40.667Z',
    platformName: 'Credentis',
  },
  proof: { type: 'DataIntegrityProof', proofValue: 'z3signature' },
}

const jobReceipt = {
  type: ['VerifiableCredential', 'PaymentReceiptVC'],
  credentialSubject: {
    id: 'did:key:zHolder',
    receiptId: 'RCPT-1',
    amount: 240,
    currency: 'USD',
    jobId: 'FR-1791721053299',
    orgName: 'SGK Construction',
    capturedBy: 'did:key:zWorker',
    photoUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ',
    notes: 'Met the client at her house, back gate',
    latitude: -17.8252,
    longitude: 31.0335,
  },
}

describe('what the platform keeps about an issued card', () => {
  it('keeps the register entry without the claims that are about the person', () => {
    const stored = redactForRegister(identityCard)
    expect(stored.credentialSubject).toEqual({
      id: 'did:key:zHolder',
      identityVerification: 'self_attested',
      verificationLevel: 'phone_verified',
      registeredAt: '2026-11-04T17:12:40.667Z',
      platformName: 'Credentis',
    })
    // The card's own type, issuer and dates stay: that is what the register is for.
    expect(stored.type).toEqual(['VerifiableCredential', 'PlatformIdentityCredential'])
    expect(stored.issuer).toBe('did:key:zIssuer')
    // Signed credential material does not live in an ordinary table.
    expect('proof' in stored).toBe(false)
    expect(JSON.stringify(stored)).not.toMatch(/Rudo|263774601564|1995-07-22/)
  })

  it('removes evidence photos, notes and locations from a job record too', () => {
    const stored = redactForRegister(jobReceipt)
    expect(stored.credentialSubject).toEqual({
      id: 'did:key:zHolder',
      receiptId: 'RCPT-1',
      amount: 240,
      currency: 'USD',
      jobId: 'FR-1791721053299',
      orgName: 'SGK Construction',
      capturedBy: 'did:key:zWorker',
    })
    expect(JSON.stringify(stored)).not.toMatch(/base64|back gate|31.0335/)
  })

  it('still proves what was issued, through a digest of the document as signed', () => {
    const digest = credentialDigest(identityCard)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(credentialDigest(identityCard)).toBe(digest)
    expect(credentialDigest({ ...identityCard, issuanceDate: '2026-11-05T00:00:00Z' })).not.toBe(digest)
  })
})

describe('what a public record check may say', () => {
  it('answers about the record and never about the person', () => {
    // How much checking was done on this person ("verificationLevel") stays in the register but
    // is not part of a public answer: a reference must not report on someone's standing.
    expect(publicRecordClaims(identityCard.credentialSubject)).toEqual({
      registeredAt: '2026-11-04T17:12:40.667Z',
      platformName: 'Credentis',
    })
    expect(publicRecordClaims(jobReceipt.credentialSubject)).toEqual({
      receiptId: 'RCPT-1',
      amount: 240,
      currency: 'USD',
      jobId: 'FR-1791721053299',
      orgName: 'SGK Construction',
    })
  })

  it('withholds a claim it does not recognise, so a new claim cannot leak by being forgotten', () => {
    expect(publicRecordClaims({ reference: 'FR-1', someNewPersonalThing: 'mother maiden name' })).toEqual({
      reference: 'FR-1',
    })
  })

  it('reads an inbox row the same way, including claims nested under "claims"', () => {
    expect(
      publicRecordClaims({
        displayName: 'Rudo Chikore',
        orgName: 'SGK Construction',
        claims: { amount: 95, currency: 'USD', phone: '263774601564' },
      }),
    ).toEqual({ orgName: 'SGK Construction', amount: 95, currency: 'USD' })
  })

  it('says nothing when there is nothing to say', () => {
    expect(publicRecordClaims(undefined)).toEqual({})
    expect(publicRecordClaims('not an object')).toEqual({})
  })
})

describe('the register table itself', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'register-'))
    DatabaseManager.initialize({ path: join(dir, 'register.db') })
  })

  afterAll(() => {
    DatabaseManager.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('has the digest column on a database built from the migrations', () => {
    const columns = DatabaseManager.getDatabase()
      .prepare('PRAGMA table_info(issued_credentials)')
      .all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toContain('credential_digest')
  })

  it('writes the redacted document and the digest, and reads them back', () => {
    const repo = new IssuedCredentialRepository()
    const document = redactForRegister(identityCard)
    repo.save({
      id: 'session-1',
      tenantId: 'tenant-1',
      credentialId: 'urn:uuid:test-1',
      holderDid: 'did:key:zHolder',
      credentialDefinitionId: 'PlatformIdentityCredential',
      credentialData: document,
      credentialDigest: credentialDigest(identityCard),
      format: 'jwt_vc_json',
      revoked: false,
    })

    const stored = repo.findByCredentialId('urn:uuid:test-1')
    expect(stored?.credentialDigest).toBe(credentialDigest(identityCard))
    expect(JSON.stringify(stored?.credentialData)).not.toMatch(/Rudo|263774601564|1995-07-22/)

    const raw = DatabaseManager.getDatabase()
      .prepare('SELECT credential_data FROM issued_credentials WHERE credential_id = ?')
      .get('urn:uuid:test-1') as { credential_data: string }
    expect(raw.credential_data).not.toMatch(/Rudo|263774601564|1995-07-22/)
  })
})

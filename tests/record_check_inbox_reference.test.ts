/**
 * The public "check a record" answer under an inbox reference follows the card issued from that
 * offer: once the organisation withdraws the card, neither reference may say it is still valid.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { credentialLifecycleService } from '../src/services/ssi/CredentialLifecycleService'

import { initTestDatabases, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
const ORG = `org-${randomUUID()}`
const OFFER_ID = randomUUID()
const INBOX_ROW = randomUUID()
const UNMATCHED_ROW = randomUUID()

beforeAll(() => {
  databases = initTestDatabases('credo-record-check-')
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO organizations (id, tenant_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`).run(
    randomUUID(),
    ORG,
    'Nyanga Potato Growers',
    now,
    now,
  )
  db.prepare(
    `INSERT INTO issued_credentials (id, tenant_id, credential_id, credential_definition_id, credential_data, format, revoked)
     VALUES (?, ?, ?, 'PotatoBatchRecord', ?, 'jwt_vc_json', 0)`,
  ).run(
    OFFER_ID,
    ORG,
    `urn:uuid:${OFFER_ID}`,
    JSON.stringify({ type: ['VerifiableCredential', 'PotatoBatchRecord'], credentialSubject: { reference: 'NYG-2026-0142' } }),
  )
  const offer = db.prepare(
    `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, offer_uri, credential_type,
       title, body, metadata, created_at, accepted_at)
     VALUES (?, 'wallet-buyer', ?, 'manual_direct_offer', ?, ?, 'PotatoBatchRecord', 'Batch', '', ?, ?, ?)`,
  )
  const offerUri = (id: string) => `openid-credential-offer://${id}`
  offer.run(INBOX_ROW, ORG, `manual:${OFFER_ID}`, offerUri(INBOX_ROW), JSON.stringify({ offerId: OFFER_ID }), now, now)
  offer.run(UNMATCHED_ROW, ORG, 'manual:older', offerUri(UNMATCHED_ROW), JSON.stringify({ offerId: 'not-in-register' }), now, now)
})

afterAll(() => databases.cleanup())

describe('check a record by its inbox reference', () => {
  test('an accepted inbox row answers with the issued card while it is good', () => {
    const check = credentialLifecycleService.checkRecord(INBOX_ROW)
    expect(check).toMatchObject({ reference: INBOX_ROW, status: 'valid', vcType: 'PotatoBatchRecord' })
    expect(check.claims).toEqual({ reference: 'NYG-2026-0142' })
  })

  test('an accepted row whose card is not in the register keeps the inbox answer', () => {
    expect(credentialLifecycleService.checkRecord(UNMATCHED_ROW)).toMatchObject({ status: 'valid' })
  })

  test('after the card is withdrawn, both references say it is no longer valid', () => {
    DatabaseManager.getDatabase()
      .prepare(`UPDATE issued_credentials SET revoked = 1, revocation_reason = 'Batch recalled' WHERE id = ?`)
      .run(OFFER_ID)
    for (const reference of [INBOX_ROW, OFFER_ID, `urn:uuid:${OFFER_ID}`]) {
      expect(credentialLifecycleService.checkRecord(reference)).toMatchObject({
        status: 'revoked',
        reason: 'Batch recalled',
      })
    }
  })

  test('a reference nobody issued is not found', () => {
    expect(credentialLifecycleService.checkRecord('NYG-2026-9999').status).toBe('not_found')
  })
})

import { createHash } from 'crypto'

import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { paymentLinkService } from '../PaymentLinkService'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describe('PaymentLinkService payer inbox', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  const insertLink = (id: string, phone: string | null, metadata: Record<string, unknown> = { kind: 'invoice' }) =>
    db
      .prepare(
        `INSERT INTO payment_links (id, merchant_id, merchant_name, description, amount, currency, invoice_ref, status,
          expiry, payer_phone, shortlink_code, shortlink_url, sector, metadata, created_at, updated_at)
         VALUES (?, 'org-1', 'Demo Org', 'Invoice for job FR-1', 2123, 'USD', 'FR-1', 'active', '2099-01-01T00:00:00Z',
          ?, ?, ?, 'general', ?, 'now', 'now')`,
      )
      .run(id, phone, `C-${id}`, `https://host/v/C-${id}`, JSON.stringify(metadata))

  const openCards = () =>
    db
      .prepare(`SELECT * FROM wallet_pending_offers WHERE source_type = 'payment_link' AND resolved_at IS NULL`)
      .all() as any[]

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE payment_links (
        id TEXT PRIMARY KEY, merchant_id TEXT, merchant_name TEXT, description TEXT, amount REAL, currency TEXT,
        invoice_ref TEXT, status TEXT, expiry TEXT, payer_phone TEXT, shortlink_code TEXT, shortlink_url TEXT,
        sector TEXT, metadata TEXT, created_at TEXT, updated_at TEXT, paid_at TEXT, provider_ref TEXT,
        obligation_id TEXT, business_transaction_id TEXT
      );
      CREATE TABLE ssi_users (id TEXT PRIMARY KEY, tenant_id TEXT, phone_hash TEXT, email_hash TEXT);
      CREATE TABLE wallet_pending_offers (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, issuer_tenant_id TEXT, contact_id TEXT,
        source_type TEXT NOT NULL, source_id TEXT, credential_type TEXT NOT NULL, offer_uri TEXT NOT NULL,
        title TEXT, body TEXT, metadata TEXT, created_at TEXT, resolved_at TEXT, last_error TEXT
      );
    `)
    db.prepare(`INSERT INTO ssi_users VALUES ('user-1', 'wallet-1', ?, NULL)`).run(sha256('263774183277'))
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
  })

  afterEach(() => {
    restore.mockRestore()
    db.close()
  })

  it('puts a bill in the inbox of the account that owns the payer phone, once', () => {
    insertLink('L1', '0774183277')
    const id = paymentLinkService.offerToPayerInbox('L1')
    expect(id).toMatch(/^plk-/)
    expect(paymentLinkService.offerToPayerInbox('L1')).toBe(id)

    const cards = openCards()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      tenant_id: 'wallet-1',
      issuer_tenant_id: 'org-1',
      source_id: 'L1',
      credential_type: 'PaymentLink',
      offer_uri: 'https://host/v/C-L1',
      title: 'Invoice FR-1',
      body: 'USD 2123.00 · Invoice for job FR-1',
    })
    expect(JSON.parse(cards[0].metadata)).toMatchObject({
      shortlinkCode: 'C-L1',
      amount: 2123,
      merchantName: 'Demo Org',
      metadata: { type: 'Invoice' },
    })
  })

  it('labels school fees and skips phones without an account or closed links', () => {
    insertLink('FEE', '263774183277', { centre: 'school_fees' })
    expect(paymentLinkService.offerToPayerInbox('FEE')).toBeDefined()
    expect(openCards()[0].title).toBe('School fees FR-1')

    insertLink('STRANGER', '263700000000')
    expect(paymentLinkService.offerToPayerInbox('STRANGER')).toBeUndefined()
    insertLink('NOPHONE', null)
    expect(paymentLinkService.offerToPayerInbox('NOPHONE')).toBeUndefined()
    insertLink('PAID', '263774183277')
    db.prepare(`UPDATE payment_links SET status = 'paid' WHERE id = 'PAID'`).run()
    expect(paymentLinkService.offerToPayerInbox('PAID')).toBeUndefined()
  })

  it('closes the card when the bill is paid or stopped', async () => {
    insertLink('L2', '263774183277')
    insertLink('L3', '263774183277')
    paymentLinkService.offerToPayerInbox('L2')
    paymentLinkService.offerToPayerInbox('L3')
    expect(openCards()).toHaveLength(2)

    await paymentLinkService.settlePaid('L2', { paidAt: new Date().toISOString(), reference: 'R1' })
    expect(openCards().map((c) => c.source_id)).toEqual(['L3'])

    expect(paymentLinkService.cancelAttempt('L3')).toBe(true)
    expect(openCards()).toHaveLength(0)
  })
})

import { createHash } from 'crypto'

import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { notificationService } from '../NotificationService'
import { outboxService } from '../OutboxService'
import { paymentLinkService } from '../PaymentLinkService'
import { ShortlinkService } from '../ShortlinkService'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describe('PaymentLinkService payer inbox', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>
  let enqueue: ReturnType<typeof jest.spyOn>
  let dispatch: ReturnType<typeof jest.spyOn>

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
    db.prepare(`INSERT INTO ssi_users VALUES ('user-2', 'wallet-2', ?, NULL)`).run(sha256('263771111111'))
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    enqueue = jest.spyOn(outboxService, 'enqueue').mockReturnValue('outbox-1')
    dispatch = jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockResolvedValue({ accepted: true, channels: [{ channel: 'whatsapp', status: 'accepted' }] } as any)
  })

  afterEach(() => {
    restore.mockRestore()
    enqueue.mockRestore()
    dispatch.mockRestore()
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

  it('gives the card what the payer needs to understand the bill', () => {
    insertLink('SUM', '263774183277', {
      kind: 'invoice',
      payerName: 'Eloh',
      dueDate: '2099-02-01T00:00:00Z',
      instalment: 2,
      totalInstalments: 3,
      workflowRunId: 'run-1',
      notification: { at: '2026-10-24T10:00:00Z' },
    })
    paymentLinkService.offerToPayerInbox('SUM')
    const card = db.prepare(`SELECT metadata FROM wallet_pending_offers WHERE source_id = 'SUM'`).get() as any
    expect(JSON.parse(card.metadata)).toMatchObject({
      merchantName: 'Demo Org',
      description: 'Invoice for job FR-1',
      payerName: 'Eloh',
      dueDate: '2099-02-01T00:00:00Z',
      instalment: 2,
      totalInstalments: 3,
      fromJob: true,
      sentAt: '2026-10-24T10:00:00Z',
    })
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
  it('sends every resend as a new message and brings the card back to the top', async () => {
    insertLink('R1', '263774183277')
    await paymentLinkService.resend('R1', 'org-1', { payerName: 'Eloh' })
    const first = openCards()[0]
    db.prepare(`UPDATE wallet_pending_offers SET created_at = '2000-01-01T00:00:00Z'`).run()
    await paymentLinkService.resend('R1', 'org-1', {})

    const keys = dispatch.mock.calls.map((call: any) => call[0].dedupeKey)
    expect(keys).toEqual(['payment_link:R1', 'payment_link:R1:send-2'])
    expect(dispatch.mock.calls[1][0]).toMatchObject({ inboxItemId: first.id, contact: { name: 'Eloh' } })
    const cards = openCards()
    expect(cards).toHaveLength(1)
    expect(cards[0].created_at > '2000-01-01T00:00:00Z').toBe(true)
    const popups = enqueue.mock.calls.map((call: any) => call[0].dedupeKey)
    expect(popups).toEqual([
      'wpo:wallet-1:payment_link:R1:PaymentLink:payment_link:R1',
      'wpo:wallet-1:payment_link:R1:PaymentLink:payment_link:R1:send-2',
    ])
    const history = JSON.parse((db.prepare(`SELECT metadata FROM payment_links WHERE id = 'R1'`).get() as any).metadata)
    expect(history.deliveryHistory).toHaveLength(2)
  })

  it('refuses an expired bill unless renewed, and a renewal gives the card the new code', async () => {
    insertLink('EXP', '263774183277', { payerName: 'Eloh' })
    db.prepare(`UPDATE payment_links SET expiry = '2000-01-01T00:00:00Z' WHERE id = 'EXP'`).run()
    paymentLinkService.offerToPayerInbox('EXP')
    await expect(paymentLinkService.resend('EXP', 'org-1', {})).rejects.toMatchObject({ status: 409 })

    db.exec(`CREATE TABLE shortlinks (code TEXT, type TEXT, target_id TEXT)`)
    db.prepare(`INSERT INTO shortlinks VALUES ('C-EXP', 'payment', 'EXP')`).run()
    const create = jest
      .spyOn(ShortlinkService, 'createPaymentLink')
      .mockReturnValue({ code: 'NEW1', url: 'https://host/v/NEW1', expiresAt: '2099-02-01T00:00:00Z' } as any)
    try {
      const sent = await paymentLinkService.resend('EXP', 'org-1', {}, true)
      expect(sent.url).toBe('https://host/v/NEW1')
    } finally {
      create.mockRestore()
    }
    expect(db.prepare(`SELECT count(*) AS n FROM shortlinks`).get()).toEqual({ n: 0 })
    const card = openCards()[0]
    expect(card.offer_uri).toBe('https://host/v/NEW1')
    expect(JSON.parse(card.metadata)).toMatchObject({ shortlinkCode: 'NEW1' })
    expect(dispatch.mock.calls[0][0]).toMatchObject({ url: 'https://host/v/NEW1' })
  })

  it('moves the card when the bill is sent to a different client', async () => {
    insertLink('MOVE', '263774183277', { payerName: 'Eloh' })
    await paymentLinkService.resend('MOVE', 'org-1', {})
    await paymentLinkService.resend('MOVE', 'org-1', { payerName: 'Tendai', payerPhone: '263771111111' })
    const cards = openCards()
    expect(cards).toHaveLength(1)
    expect(cards[0].tenant_id).toBe('wallet-2')
  })

  it('uses the linked wallet of a contact and records the first delivery', async () => {
    insertLink('CT', null, { payerName: 'Org buyer' })
    const delivery = await paymentLinkService.deliverNewBill({
      linkId: 'CT',
      merchantId: 'org-1',
      payer: { name: 'Org buyer', email: 'buyer@example.com' },
      dedupeKey: 'payment_link:CT',
      walletTenantId: 'wallet-2',
      contactId: 'contact-9',
    })
    const card = openCards()[0]
    expect(card).toMatchObject({ tenant_id: 'wallet-2', contact_id: 'contact-9' })
    expect(dispatch.mock.calls[0][0]).toMatchObject({ inboxItemId: card.id, dedupeKey: 'payment_link:CT' })
    expect(delivery?.accepted).toBe(true)
    const meta = JSON.parse((db.prepare(`SELECT metadata FROM payment_links WHERE id = 'CT'`).get() as any).metadata)
    expect(meta.deliveryHistory).toHaveLength(1)
  })

  it('saves new client details without sending, withdrawing the old client card', () => {
    insertLink('UP', '263774183277', { payerName: 'Eloh' })
    paymentLinkService.offerToPayerInbox('UP')
    expect(() => paymentLinkService.updatePayer('UP', 'org-1', { payerPhone: 'abc' })).toThrow(/valid client mobile/)
    const saved = paymentLinkService.updatePayer('UP', 'org-1', { payerName: 'Tendai', payerPhone: '263771111111' })
    expect(saved).toMatchObject({ changed: true, needsRenewal: false, payerName: 'Tendai' })
    expect(openCards()).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(paymentLinkService.updatePayer('UP', 'org-1', {}).changed).toBe(false)
  })
})

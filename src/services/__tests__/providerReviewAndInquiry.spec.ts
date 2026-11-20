import 'reflect-metadata'
import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { organizationRegistryRepository, type OrganizationRegistry } from '../../persistence/OrganizationRegistryRepository'
import { jobDepositService } from '../JobDepositService'
import { notificationService } from '../NotificationService'
import { orgOfferingsService } from '../OrgOfferingsService'
import { workflowRequestRepository } from '../../persistence/WorkflowRequestRepository'
import { providerReviewService } from '../ProviderReviewService'
import { phoneHashCandidates } from '../ssi/contactHash'
import {
  adoptWhatsAppGuest,
  inquiryReply,
  isStatusAsk,
  latestRequestsForPhone,
  quoteNotice,
  readAmount,
  readChatCommand,
  statusReply,
  whatsAppInquiryService,
  whatsAppQuoteRequests,
} from '../WhatsAppInquiryService'
import { normalizeNotificationPhone, whatsAppSenderService } from '../WhatsAppSenderService'

function org(): OrganizationRegistry {
  return {
    id: 'org-1',
    tenantId: 'tenant-1',
    displayName: 'ABC Plumbing',
    category: 'supplier',
    isPublic: true,
    trustScore: 4,
    verificationStatus: 'verified',
    issuerDid: 'did:example:abc',
    country: 'ZW',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('provider reviews', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, status TEXT);
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT);
      CREATE TABLE payment_links (id TEXT, merchant_id TEXT, status TEXT, metadata TEXT);
      CREATE TABLE org_contacts (id TEXT, wallet_tenant_id TEXT);
      CREATE TABLE workflow_requests (id TEXT, requester_tenant_id TEXT, target_org_tenant_id TEXT, status TEXT);
      CREATE TABLE provider_reviews (
        id TEXT PRIMARY KEY,
        org_tenant_id TEXT NOT NULL,
        author_tenant_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        proof_kind TEXT NOT NULL,
        proof_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (author_tenant_id, org_tenant_id)
      );
    `)
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    jest.spyOn(organizationRegistryRepository, 'findOrganizationById').mockReturnValue(org())
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(undefined)
  })

  afterEach(() => {
    restore.mockRestore()
    jest.restoreAllMocks()
    db.close()
  })

  it('refuses a rating from someone who has not paid or been accepted', () => {
    expect(() => providerReviewService.submit('customer-1', 'org-1', 5, 'Great')).toThrow(
      /after you have paid them/,
    )
  })

  it('keeps one rating per customer, and hides who they are', () => {
    db.prepare(`INSERT INTO workflow_requests VALUES ('req-1', 'customer-1', 'tenant-1', 'approved')`).run()
    const saved = providerReviewService.submit('customer-1', 'org-1', 5, '  Fixed the leak  ')
    const updated = providerReviewService.submit('customer-1', 'org-1', 4, 'Came back to finish')
    expect(saved.updated).toBe(false)
    expect(updated).toMatchObject({ rating: 4, updated: true })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM provider_reviews`).get()).toEqual({ n: 1 })
    const summary = providerReviewService.summary('tenant-1')
    expect(summary).toMatchObject({ average: 4, count: 1 })
    expect(JSON.stringify(summary)).not.toContain('customer-1')
    expect(summary.recent[0].comment).toBe('Came back to finish')
  })

  it('refuses a rating from someone who works there', () => {
    db.prepare(`INSERT INTO ssi_users VALUES ('user-1', 'staff-1')`).run()
    db.prepare(`INSERT INTO org_memberships VALUES ('user-1', 'tenant-1', 'active')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('req-1', 'staff-1', 'tenant-1', 'fulfilled')`).run()
    expect(() => providerReviewService.submit('staff-1', 'org-1', 5, 'Fine')).toThrow(/work at this business/)
  })
})

describe('WhatsApp inquiry', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE whatsapp_inquiries (
        id TEXT PRIMARY KEY,
        sender_key TEXT NOT NULL,
        message_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        need TEXT NOT NULL,
        match_count INTEGER NOT NULL DEFAULT 0,
        reply_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (sender_key, message_id)
      );
    `)
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    // These tests read the words. A refused button message falls back to the same words.
    jest.spyOn(whatsAppSenderService, 'sendSessionInteractive').mockRejectedValue(new Error('no buttons in this test'))
  })

  afterEach(() => {
    restore.mockRestore()
    jest.restoreAllMocks()
    db.close()
  })

  it('walks welcome, describe, category, place and summary, asks only on Confirm & Send, then quotes and compares', async () => {
    db.exec(`
      CREATE TABLE whatsapp_chat_sessions (
        sender_key TEXT NOT NULL, phone TEXT NOT NULL, requester_tenant_id TEXT, search TEXT,
        matches TEXT NOT NULL DEFAULT '[]', asked TEXT NOT NULL DEFAULT '[]', media TEXT NOT NULL DEFAULT '[]',
        last_inbound_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sender_key, phone)
      );
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT, did TEXT, phone_hash TEXT, created_at TEXT, updated_at TEXT);
    `)
    const text = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'sent' })
    const tap = jest.spyOn(whatsAppSenderService, 'sendSessionInteractive').mockResolvedValue({ status: 'sent' })
    jest.spyOn(orgOfferingsService, 'match').mockReturnValue([
      {
        orgId: 'org-1', tenantId: 'tenant-1', name: 'ABC Plumbing', category: 'supplier', trustScore: 4,
        verificationStatus: 'verified', score: 1, reasons: ['Offers Plumbing'], unsure: [],
        standing: { configured: 'They say they do this.', verified: 'Verified organisation.', live: 'Taking new work.' },
        reviewAverage: null, reviewCount: 0,
      },
    ])
    jest.spyOn(whatsAppQuoteRequests, 'create').mockResolvedValue({
      asked: [{ requestId: 'req-9', tenantId: 'tenant-1', name: 'ABC Plumbing', reasons: ['Offers Plumbing'] }],
      skipped: [],
    })

    const create = whatsAppQuoteRequests.create as unknown as jest.Mock
    const say = (messageId: string, said: string, name?: string) =>
      whatsAppInquiryService.handle({ senderKey: 'platform', messageId, from: '263771234567', text: said, name })
    const last = () => tap.mock.calls[tap.mock.calls.length - 1][2] as any
    const ids = (card: any) => card.action.buttons.map((button: any) => button.reply.id)

    await say('i1', 'hi', 'Eloh Moyo')
    expect(last().type).toBe('button')
    expect(last().body.text).toMatch(/^Good (morning|afternoon|evening), Eloh! 👋 Welcome to \*Credentis\*/)
    expect(ids(last())).toEqual(['SERVICE', 'STATUS', 'PROVIDER'])

    await say('i2', 'SERVICE')
    expect(last().type).toBe('list')
    expect(last().body.text).toMatch(/^What do you need help with\? Just describe it/)
    const rows = last().action.sections[0].rows
    expect(rows.map((row: any) => row.id)).toEqual(expect.arrayContaining(['CAT:plumber', 'CAT:school fees']))
    expect(rows.every((row: any) => row.title.length <= 24)).toBe(true)

    await say('i3', 'burst kitchen pipe')
    expect(last().body.text).toMatch(/^Sounds like you need a \*Plumber\* 🔧/)
    expect(last().body.text).toContain('1 business fits: ABC Plumbing.')
    expect(ids(last())).toEqual(['DRAFT_YES', 'DRAFT_PICK'])
    expect(create).not.toHaveBeenCalled()

    const cards = tap.mock.calls.length
    await say('i4', 'DRAFT_YES')
    expect(tap.mock.calls.length).toBe(cards)
    expect(String(text.mock.calls[text.mock.calls.length - 1][2])).toMatch(/Where do you need it\?/)

    await say('i5', 'Avondale, Harare')
    expect(last().body.text).toContain("📋 *Here's your request:*")
    expect(last().body.text).toContain('🔧 Plumber\n📝 Burst kitchen pipe\n📍 Avondale, Harare')
    expect(ids(last())).toEqual(['DRAFT_SEND', 'DRAFT_CANCEL'])
    expect(create).not.toHaveBeenCalled()

    await say('i6', 'DRAFT_SEND')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][2]).toMatchObject({ need: 'Plumber', area: 'Avondale, Harare', details: 'burst kitchen pipe' })
    expect(last().body.text).toMatch(/^Done! ✅ I've sent your request to \*1\* business:\n• ABC Plumbing/)
    expect(ids(last())).toEqual(['STATUS', 'hi'])

    // A second Confirm on the same card asks no one again.
    await say('i7', 'DRAFT_SEND')
    expect(create).toHaveBeenCalledTimes(1)

    const now = new Date().toISOString()
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(org())
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue({
      id: 'req-9', status: 'approved', targetOrgTenantId: 'tenant-1',
      payload: { channel: 'whatsapp', customerMsisdn: '+263771234567', title: 'Plumbing', totalAmount: 40, currency: 'USD' },
    } as any)
    db.prepare(`UPDATE whatsapp_chat_sessions SET last_inbound_at = ?`).run(now)
    await whatsAppInquiryService.requestAnswered('req-9')
    const quote = last()
    expect(quote.header.text).toBe('💬 New quote')
    expect(quote.body.text).toContain('*ABC Plumbing* sent you a quote ✅\n\n💵 *USD 40*')
    expect(quote.action.buttons[0].reply).toEqual({ id: 'PAY 1', title: 'Pay USD 40' })
    expect(quote.action.buttons[1].reply).toEqual({ id: 'STATUS', title: 'Compare quotes' })
    expect(readChatCommand(quote.action.buttons[0].reply.id)).toEqual({ type: 'pay', n: 1 })
    expect(readChatCommand('1')).toEqual({ type: 'ask', picks: [1] })
    expect(readChatCommand('ask 1 3')).toEqual({ type: 'ask', picks: [1, 3] })

    db.exec(`CREATE TABLE workflow_requests (id TEXT, requester_tenant_id TEXT, target_org_tenant_id TEXT, request_type TEXT, status TEXT, payload TEXT, created_at TEXT)`)
    await say('i8', 'STATUS')
    const compare = last()
    expect(compare.type).toBe('list')
    expect(compare.action.button).toBe('Compare quotes')
    expect(compare.action.sections[0].rows[0]).toEqual({
      id: 'PAY 1',
      title: 'ABC Plumbing',
      description: '💵 USD 40 · tap to pay',
    })

    jest.spyOn(jobDepositService, 'open').mockReturnValue({
      requestId: 'req-9', available: true, amount: 40, currency: 'USD', status: 'awaiting_payment',
      payUrl: 'https://pay.example/abc', note: 'The payment goes to them.',
    })
    await say('i9', 'PAY 1')
    const pay = last()
    expect(pay.type).toBe('cta_url')
    expect(pay.action.parameters).toEqual({ display_text: 'Pay USD 40', url: 'https://pay.example/abc' })
  })

  it('lets a business member answer a job card with a price, and refuses a number that is not theirs', async () => {
    db.exec(`
      CREATE TABLE whatsapp_chat_sessions (
        sender_key TEXT NOT NULL, phone TEXT NOT NULL, requester_tenant_id TEXT, search TEXT,
        matches TEXT NOT NULL DEFAULT '[]', asked TEXT NOT NULL DEFAULT '[]', media TEXT NOT NULL DEFAULT '[]',
        last_inbound_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sender_key, phone)
      );
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, role TEXT, status TEXT);
    `)
    db.prepare(`INSERT INTO org_memberships VALUES ('owner-1', 'tenant-1', 'owner', 'active')`).run()
    db.prepare(`INSERT INTO org_memberships VALUES ('staff-1', 'tenant-1', 'member', 'active')`).run()
    const tap = jest.spyOn(whatsAppSenderService, 'sendSessionInteractive').mockResolvedValue({ status: 'sent' })
    const text = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'sent' })
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(org())
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue({
      id: 'req-9', requestType: 'quote', status: 'pending', targetOrgTenantId: 'tenant-1',
      payload: { channel: 'whatsapp', customerMsisdn: '+263770000001', title: 'Plumbing', clientName: 'Rumbi' },
    } as any)
    const owner = normalizeNotificationPhone('263772222222')
    const consent = jest.spyOn(notificationService, 'consentedRecipient').mockImplementation((tenant, event, match: any) =>
      tenant === 'tenant-1' && event === 'task' && match.phone === owner ? { userId: 'owner-1', phone: owner } : undefined,
    )
    const answer = jest.spyOn(whatsAppQuoteRequests, 'answer').mockResolvedValue(undefined)
    jest.spyOn(orgOfferingsService, 'match').mockReturnValue([])
    const from = (phone: string, messageId: string, said: string) =>
      whatsAppInquiryService.handle({ senderKey: 'platform', messageId, from: phone, text: said })

    await from('263773333333', 'p0', 'JOB_QUOTE:req-9')
    expect(String(text.mock.calls[0][2])).toMatch(/not linked to this number/)

    await from('263772222222', 'p1', 'JOB_QUOTE:req-9')
    const ask = tap.mock.calls[tap.mock.calls.length - 1][2] as any
    expect(ask.body.text).toMatch(/^💵 How much would you charge for \*Plumbing\*\?/)
    await from('263772222222', 'p2', 'twenty-five')
    expect(answer).not.toHaveBeenCalled()
    await from('263772222222', 'p3', '$25')
    expect(answer).toHaveBeenCalledWith('tenant-1', { userId: 'owner-1', role: 'owner' }, 'req-9', { amount: 25, currency: 'USD' })
    expect(String(text.mock.calls[text.mock.calls.length - 1][2])).toMatch(/^Quote sent! \*USD 25\* ✅/)

    // A member without an accept role gets nothing from the same card.
    consent.mockImplementation(() => ({ userId: 'staff-1', phone: owner }))
    answer.mockClear()
    await from('263772222222', 'p4', 'JOB_QUOTE:req-9')
    await from('263772222222', 'p5', '30')
    expect(answer).not.toHaveBeenCalled()
    expect(readAmount('USD 25.50')).toBe(25.5)
    expect(readAmount('25 dollars')).toBe(25)
    expect(readAmount('call me')).toBeUndefined()
  })

  it('names the businesses in the reply', () => {
    expect(inquiryReply('plumber', [{ name: 'ABC Plumbing', reasons: ['Offers Plumbing', 'Works in Borrowdale'] }])).toContain(
      'ABC Plumbing. Offers Plumbing. Works in Borrowdale.',
    )
  })

  it('answers a message once and does not treat stop as a search', async () => {
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'sent' })
    jest.spyOn(orgOfferingsService, 'match').mockReturnValue([
      {
        orgId: 'org-1',
        tenantId: 'tenant-1',
        name: 'ABC Plumbing',
        category: 'supplier',
        trustScore: 4,
        verificationStatus: 'verified',
        score: 1,
        reasons: ['Offers Plumbing'],
        unsure: [],
        standing: {
          configured: 'They say they do this.',
          verified: 'Not checked with a credential yet.',
          live: 'Taking new work.',
        },
        reviewAverage: null,
        reviewCount: 0,
      },
    ])
    await expect(whatsAppInquiryService.handle({
      senderKey: 'platform',
      messageId: 'm1',
      from: '263771234567',
      text: 'stop',
    })).resolves.toEqual({ status: 'ignored' })
    expect(send).not.toHaveBeenCalled()

    await whatsAppInquiryService.handle({
      senderKey: 'platform',
      messageId: 'm2',
      from: '263771234567',
      text: 'a plumber',
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(String(send.mock.calls[0][2])).toContain('ABC Plumbing')
    await expect(whatsAppInquiryService.handle({
      senderKey: 'platform',
      messageId: 'm2',
      from: '263771234567',
      text: 'a plumber',
    })).resolves.toEqual({ status: 'duplicate' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(db.prepare(`SELECT reply_status, match_count FROM whatsapp_inquiries WHERE message_id = 'm2'`).get()).toEqual({
      reply_status: 'sent',
      match_count: 1,
    })
  })

  it('answers "status" with the sender\'s own requests and no search', async () => {
    db.exec(`
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT, phone_hash TEXT);
      CREATE TABLE workflow_requests (id TEXT, requester_tenant_id TEXT, target_org_tenant_id TEXT, request_type TEXT, status TEXT, payload TEXT, created_at TEXT);
    `)
    const hash = phoneHashCandidates(normalizeNotificationPhone('263771234567'))[0]
    db.prepare(`INSERT INTO ssi_users VALUES ('u1', 'customer-1', ?)`).run(hash)
    db.prepare(`INSERT INTO workflow_requests VALUES ('r1', 'customer-1', 'tenant-1', 'quote', 'approved', ?, '2026-11-12T10:00:00Z')`).run(
      JSON.stringify({ title: 'Ask for a quote', totalAmount: 25, currency: 'usd' }),
    )
    db.prepare(`INSERT INTO workflow_requests VALUES ('r2', 'someone-else', 'tenant-1', 'quote', 'pending', '{}', '2026-11-12T11:00:00Z')`).run()
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(org())
    const match = jest.spyOn(orgOfferingsService, 'match')
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'held' })

    expect(isStatusAsk('Status')).toBe(true)
    expect(isStatusAsk('plumber status check')).toBe(false)
    await whatsAppInquiryService.handle({ senderKey: 'platform', messageId: 's1', from: '263771234567', text: 'status' })
    expect(match).not.toHaveBeenCalled()
    const body = String(send.mock.calls[0][2])
    expect(body).toContain('Ask for a quote with ABC Plumbing: accepted, USD 25.')
    expect(body).not.toContain('someone-else')
    expect(latestRequestsForPhone('263779999999')).toEqual([])
    expect(statusReply([])).toMatch(/No requests found/)
  })

  it('asks the matched businesses once, then pays the one they choose', async () => {
    db.exec(`
      CREATE TABLE whatsapp_chat_sessions (
        sender_key TEXT NOT NULL, phone TEXT NOT NULL, requester_tenant_id TEXT, search TEXT,
        matches TEXT NOT NULL DEFAULT '[]', asked TEXT NOT NULL DEFAULT '[]', media TEXT NOT NULL DEFAULT '[]',
        last_inbound_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sender_key, phone)
      );
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT, did TEXT, phone_hash TEXT, created_at TEXT, updated_at TEXT);
    `)
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'sent' })
    jest.spyOn(orgOfferingsService, 'match').mockReturnValue([
      {
        orgId: 'org-1', tenantId: 'tenant-1', name: 'ABC Plumbing', category: 'supplier', trustScore: 4,
        verificationStatus: 'verified', score: 1, reasons: ['Offers Plumbing'], unsure: [],
        standing: { configured: 'They say they do this.', verified: 'Not checked with a credential yet.', live: 'Taking new work.' },
        reviewAverage: null, reviewCount: 0,
      },
    ])
    const create = jest.spyOn(whatsAppQuoteRequests, 'create').mockResolvedValue({
      asked: [{ requestId: 'req-9', tenantId: 'tenant-1', name: 'ABC Plumbing', reasons: ['Offers Plumbing'] }],
      skipped: [],
    })
    const say = (messageId: string, said: string) =>
      whatsAppInquiryService.handle({ senderKey: 'platform', messageId, from: '263771234567', text: said })
    const lastWords = () => String(send.mock.calls[send.mock.calls.length - 1][2])
    // Typed words work the same as the buttons: the trade, YES, then SEND.
    await say('q1', 'a plumber in Borrowdale')
    expect(create).not.toHaveBeenCalled()
    expect(lastWords()).toContain('Sounds like you need a Plumber. 1 business fits: ABC Plumbing.')
    await say('q2', 'yes')
    expect(lastWords()).toMatch(/Reply SEND to send it to ABC Plumbing/)
    await say('q3', 'send')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][3]).toMatchObject({ channel: 'whatsapp', customerMsisdn: '+263771234567' })
    expect(lastWords()).toContain('Asked ABC Plumbing for a quote')
    const guest = db.prepare(`SELECT phone_hash FROM ssi_users`).get() as { phone_hash: string | null }
    expect(guest.phone_hash).toBeNull()

    await say('q4', 'a plumber in Borrowdale')
    await say('q5', 'yes')
    await say('q6', 'send')
    expect(create).toHaveBeenCalledTimes(1)
    expect(lastWords()).toContain('Already asked ABC Plumbing')

    const open = jest.spyOn(jobDepositService, 'open').mockReturnValue({
      requestId: 'req-9', available: true, amount: 40, currency: 'USD', status: 'awaiting_payment',
      payUrl: 'https://pay.example/abc', note: 'The payment goes to them.',
    })
    await say('q7', 'PAY 1')
    expect(open).toHaveBeenCalledWith('req-9', expect.stringMatching(/^wa-/))
    expect(lastWords()).toContain('https://pay.example/abc')
    expect(lastWords()).toContain('Credentis does not hold it')
    expect(readChatCommand('PAY 1')).toEqual({ type: 'pay', n: 1 })
    expect(quoteNotice('ABC Plumbing', 'USD 40', 'Ask for a quote', 1)).toContain('Reply PAY 1')
  })

  it('sends a price back only for a request that was asked in the chat', async () => {
    db.exec(`
      CREATE TABLE whatsapp_chat_sessions (
        sender_key TEXT NOT NULL, phone TEXT NOT NULL, requester_tenant_id TEXT, search TEXT,
        matches TEXT NOT NULL DEFAULT '[]', asked TEXT NOT NULL DEFAULT '[]', media TEXT NOT NULL DEFAULT '[]',
        last_inbound_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sender_key, phone)
      );
    `)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO whatsapp_chat_sessions VALUES ('platform', '263771234567', 'wa-guest', 'plumber', '[]', ?, '[]', ?, ?)`,
    ).run(JSON.stringify([{ n: 1, requestId: 'req-9', tenantId: 'tenant-1', name: 'ABC Plumbing', need: 'plumber' }]), now, now)
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockResolvedValue({ status: 'held' })
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(org())
    const quote = {
      id: 'req-9', status: 'approved', targetOrgTenantId: 'tenant-1',
      payload: { channel: 'whatsapp', customerMsisdn: '+263771234567', title: 'Plumbing', totalAmount: 40, currency: 'USD' },
    }
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue(quote as any)
    await whatsAppInquiryService.requestAnswered('req-9')
    expect(String(send.mock.calls[0][2])).toContain('ABC Plumbing quoted USD 40')
    send.mockClear()
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue({ ...quote, payload: { ...quote.payload, channel: 'app' } } as any)
    await whatsAppInquiryService.requestAnswered('req-9')
    expect(send).not.toHaveBeenCalled()
  })

  it('moves chat requests onto an account when that number signs up', () => {
    db.exec(`
      CREATE TABLE whatsapp_chat_sessions (
        sender_key TEXT NOT NULL, phone TEXT NOT NULL, requester_tenant_id TEXT, search TEXT,
        matches TEXT NOT NULL DEFAULT '[]', asked TEXT NOT NULL DEFAULT '[]', media TEXT NOT NULL DEFAULT '[]',
        last_inbound_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (sender_key, phone)
      );
      CREATE TABLE workflow_requests (id TEXT, requester_tenant_id TEXT);
      CREATE TABLE org_contacts (id TEXT, wallet_tenant_id TEXT);
    `)
    db.prepare(`INSERT INTO whatsapp_chat_sessions (sender_key, phone, requester_tenant_id, matches, asked, media, last_inbound_at, updated_at) VALUES ('platform', '263771234567', 'wa-guest', '[]', '[]', '[]', 'now', 'now')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('req-9', 'wa-guest')`).run()
    db.prepare(`INSERT INTO org_contacts VALUES ('c1', 'wa-guest')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('req-other', 'someone-else')`).run()
    adoptWhatsAppGuest('263771234567', 'account-1')
    expect(db.prepare(`SELECT requester_tenant_id FROM workflow_requests WHERE id = 'req-9'`).get()).toEqual({ requester_tenant_id: 'account-1' })
    expect(db.prepare(`SELECT requester_tenant_id FROM workflow_requests WHERE id = 'req-other'`).get()).toEqual({ requester_tenant_id: 'someone-else' })
    expect(db.prepare(`SELECT wallet_tenant_id FROM org_contacts`).get()).toEqual({ wallet_tenant_id: 'account-1' })
    expect(db.prepare(`SELECT requester_tenant_id FROM whatsapp_chat_sessions`).get()).toEqual({ requester_tenant_id: 'account-1' })
  })

  it('holds the reply when WhatsApp delivery is off', async () => {
    const previous = process.env.WHATSAPP_DELIVERY_ENABLED
    delete process.env.WHATSAPP_DELIVERY_ENABLED
    await expect(whatsAppSenderService.sendSessionReply('platform', '263771234567', 'hello')).resolves.toBe('held')
    if (previous === undefined) delete process.env.WHATSAPP_DELIVERY_ENABLED
    else process.env.WHATSAPP_DELIVERY_ENABLED = previous
  })
})

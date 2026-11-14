import 'reflect-metadata'
import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { organizationRegistryRepository, type OrganizationRegistry } from '../../persistence/OrganizationRegistryRepository'
import { orgOfferingsService } from '../OrgOfferingsService'
import { providerReviewService } from '../ProviderReviewService'
import { phoneHashCandidates } from '../ssi/contactHash'
import {
  inquiryReply,
  isStatusAsk,
  latestRequestsForPhone,
  statusReply,
  whatsAppInquiryService,
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
  })

  afterEach(() => {
    restore.mockRestore()
    jest.restoreAllMocks()
    db.close()
  })

  it('names the businesses in the reply', () => {
    expect(inquiryReply('plumber', [{ name: 'ABC Plumbing', reasons: ['Offers Plumbing', 'Works in Borrowdale'] }])).toContain(
      'ABC Plumbing. Offers Plumbing. Works in Borrowdale.',
    )
  })

  it('answers a message once and does not treat stop as a search', async () => {
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionReply').mockResolvedValue('sent')
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
    const send = jest.spyOn(whatsAppSenderService, 'sendSessionReply').mockResolvedValue('held')

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

  it('holds the reply when WhatsApp delivery is off', async () => {
    const previous = process.env.WHATSAPP_DELIVERY_ENABLED
    delete process.env.WHATSAPP_DELIVERY_ENABLED
    await expect(whatsAppSenderService.sendSessionReply('platform', '263771234567', 'hello')).resolves.toBe('held')
    if (previous === undefined) delete process.env.WHATSAPP_DELIVERY_ENABLED
    else process.env.WHATSAPP_DELIVERY_ENABLED = previous
  })
})

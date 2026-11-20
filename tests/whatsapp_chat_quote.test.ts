/**
 * A customer with no account is served inside the WhatsApp chat: businesses that fit, ASK sends
 * them the same quote request Discover sends, the business's price comes back in the chat, PAY sends
 * the business's payment link, PROBLEM / SETTLED use the deposit steps, a photo goes with the
 * request, and signing up with the number moves the requests to the account.
 */

import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { WorkflowRequestController } from '../src/controllers/contacts/WorkflowRequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRequestRepository } from '../src/persistence/WorkflowRequestRepository'
import { jobDepositLinks } from '../src/services/JobDepositService'
import { orgOfferingsService, type ProviderMatch } from '../src/services/OrgOfferingsService'
import { ASK_PROMPT, guestTenantId, parseChatCommand, whatsAppInquiryService } from '../src/services/WhatsAppInquiryService'
import { whatsAppSenderService } from '../src/services/WhatsAppSenderService'
import { initTestDatabases, seedOrganization, type SeededOrganization, type TestDatabases } from './utils/orgReadinessFixture'

const PHONE = '263774183277'
let databases: TestDatabases
let org: SeededOrganization
let sent: string[] = []
let counter = 0

function match(): ProviderMatch {
  return {
    orgId: `reg-${org.orgTenantId}`,
    tenantId: org.orgTenantId,
    name: 'Borrowdale Hardware',
    category: 'supplier',
    trustScore: 3,
    verificationStatus: 'verified',
    standing: { configured: 'They say they do this.', verified: 'Not checked with a credential yet.', live: 'Taking new work.' },
    quoteServiceId: quoteServiceId,
    serviceName: 'Cement',
    score: 9,
    reasons: ['Sells Cement', 'Delivers to Borrowdale'],
    unsure: [],
    reviewAverage: null,
    reviewCount: 0,
  }
}
let quoteServiceId = ''

async function say(text: string, from = PHONE): Promise<string> {
  const before = sent.length
  await whatsAppInquiryService.handle({ senderKey: 'platform', messageId: `m-${++counter}`, from, text, name: 'Tariro' })
  return sent.slice(before).join('\n')
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80))

beforeAll(() => {
  databases = initTestDatabases('credo-wa-chat-')
  org = seedOrganization({ name: 'Borrowdale Hardware', setup: 'new' })
  const db = DatabaseManager.getDatabase()
  const registryId = `reg-${org.orgTenantId}`
  db.prepare(
    `INSERT INTO organization_registry (id, tenant_id, display_name, category, is_public, issuer_did) VALUES (?, ?, ?, 'supplier', 1, ?)`,
  ).run(registryId, org.orgTenantId, org.name, `did:web:${org.orgTenantId}`)
  quoteServiceId = `svc-quote-${randomUUID().slice(0, 6)}`
  db.prepare(
    `INSERT INTO service_catalog (id, org_id, service_type, name, workflow_template_id, is_active, metadata)
     VALUES (?, ?, 'other', 'Ask for a quote', NULL, 1, ?)`,
  ).run(quoteServiceId, registryId, JSON.stringify({ offeringKey: 'ask_quote', module: null }))

  jest.spyOn(orgOfferingsService, 'match').mockImplementation(() => [match()])
  jest.spyOn(whatsAppSenderService, 'sendSessionMessage').mockImplementation(async (_key, _to, body) => {
    sent.push(String(body))
    return { status: 'sent', messageId: `wamid.${randomUUID()}`, phoneNumberId: 'pn-1' }
  })
  jest.spyOn(whatsAppSenderService, 'downloadMedia').mockResolvedValue({ data: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' })
  jest.spyOn(jobDepositLinks, 'create').mockImplementation((input) => {
    const id = `link-${randomUUID().slice(0, 8)}`
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO payment_links (id, merchant_id, amount, currency, description, status, shortlink_code, shortlink_url, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(id, input.merchantId, input.amount, input.currency, input.description, id, `https://pay.test/${id}`, JSON.stringify(input.metadata || {}))
    return { id, shortlinkUrl: `https://pay.test/${id}` } as any
  })
})

afterAll(() => {
  jest.restoreAllMocks()
  databases.cleanup()
})

describe('WhatsApp chat: ask, price, pay, dispute', () => {
  test('reads commands and leaves anything else as a search', () => {
    expect(parseChatCommand('ASK')).toEqual({ kind: 'ask', picks: [] })
    expect(parseChatCommand('ask 1 3')).toEqual({ kind: 'ask', picks: [1, 3] })
    expect(parseChatCommand('Pay 2')).toEqual({ kind: 'pay', n: 2 })
    expect(parseChatCommand('problem 1 the bags never came')).toEqual({ kind: 'problem', n: 1, reason: 'the bags never came' })
    expect(parseChatCommand('settled 1')).toEqual({ kind: 'settle', n: 1 })
    expect(parseChatCommand('hi')).toEqual({ kind: 'help' })
    expect(parseChatCommand('20 bags of cement in Borrowdale')).toEqual({ kind: 'search' })
  })

  test('a guest asks from the chat and every step answers in the chat', async () => {
    expect(await say('hi')).toContain('ASK sends your request')

    const list = await say('I need 20 bags of cement delivered to Borrowdale')
    expect(list).toContain('1. Borrowdale Hardware')
    expect(list).toContain(ASK_PROMPT)

    await whatsAppInquiryService.handleMedia({
      senderKey: 'platform',
      messageId: `m-${++counter}`,
      from: PHONE,
      media: { id: 'meta-media-1', mimeType: 'image/jpeg', caption: 'Where to drop' },
    })
    expect(sent[sent.length - 1]).toMatch(/Photo kept/)

    const asked = await say('ASK')
    expect(asked).toContain('Sent.')
    expect(asked).toContain('1. Borrowdale Hardware')

    const guest = guestTenantId(PHONE)
    const db = DatabaseManager.getDatabase()
    expect(db.prepare(`SELECT label FROM tenants WHERE id = ?`).get(guest)).toEqual({ label: 'WhatsApp guest' })
    const request = workflowRequestRepository
      .listOutbound(guest, {})
      .find((entry) => entry.targetOrgTenantId === org.orgTenantId)!
    expect(request.requestType).toBe('quote')
    expect(request.payload).toMatchObject({
      channel: 'whatsapp',
      source: 'provider_match',
      customerMsisdn: `+${PHONE}`,
      matchReasons: ['Sells Cement', 'Delivers to Borrowdale'],
    })
    const photos = (request.payload as any).whatsappMedia
    expect(photos).toHaveLength(1)
    const member = { tenantId: org.orgTenantId, isMember: () => false }
    expect(whatsAppInquiryService.photoFor(request.id, photos[0].id, member)?.data.toString()).toBe('jpeg-bytes')
    expect(whatsAppInquiryService.photoFor(request.id, photos[0].id, { tenantId: 'stranger', isMember: () => false })).toBeUndefined()

    expect(await say('ask')).toMatch(/already asked them/)

    const controller = new WorkflowRequestController()
    await controller.approveRequest(
      request.id,
      { price: { amount: 120, currency: 'usd' } },
      { tenantId: org.orgTenantId, headers: {}, user: { id: org.ownerUserId, orgRole: 'owner' } } as any,
    )
    await settle()
    expect(sent[sent.length - 1]).toBe(
      'Borrowdale Hardware can do Cement for USD 120 (request 1). Reply PAY 1 to pay them. The money goes to them.',
    )
    const stored = db
      .prepare(`SELECT tenant_id AS tenantId FROM notification_deliveries WHERE event_type = 'chat_reply' AND status = 'accepted'`)
      .all() as Array<{ tenantId: string }>
    expect(stored.length).toBe(sent.length)
    expect(stored.some((row) => row.tenantId === org.orgTenantId)).toBe(true)

    const status = await say('status')
    expect(status).toContain('1. Cement with Borrowdale Hardware: accepted, USD 120.')
    expect(status).toContain('Reply PAY 1 to pay.')

    const pay = await say('PAY 1')
    expect(pay).toMatch(/^Pay Borrowdale Hardware USD 120: https:\/\/pay\.test\/link-/)
    expect(pay).toContain('Credentis does not hold it.')

    const link = db.prepare(`SELECT payment_link_id AS id FROM job_deposits WHERE request_id = ?`).get(request.id) as { id: string }
    db.prepare(`UPDATE payment_links SET status = 'paid' WHERE id = ?`).run(link.id)
    await whatsAppInquiryService.linkPaid(link.id, 'SIM-REF-1')
    expect(sent[sent.length - 1]).toContain('Borrowdale Hardware has your payment of USD 120 for request 1. Reference SIM-REF-1.')

    expect(await say('PAY 1')).toMatch(/already has your payment/)
    expect(await say('problem 1 the bags never came')).toMatch(/cannot mark the job done until this is settled/)
    expect(db.prepare(`SELECT status FROM job_deposits WHERE request_id = ?`).get(request.id)).toEqual({ status: 'disputed' })
    expect(await say('settled 1')).toMatch(/is settled/)
    expect(db.prepare(`SELECT status FROM job_deposits WHERE request_id = ?`).get(request.id)).toEqual({ status: 'paid' })

    // Signing up with the same number moves the guest's requests to the account.
    const walletTenantId = `wallet-${randomUUID()}`
    db.prepare(`INSERT INTO ssi_users (id, tenant_id, did, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`).run(
      `user-${randomUUID()}`,
      walletTenantId,
      `did:key:${walletTenantId}`,
    )
    expect(whatsAppInquiryService.claimGuest(`+${PHONE}`, walletTenantId)).toBeGreaterThan(0)
    expect(workflowRequestRepository.findById(request.id)?.requesterTenantId).toBe(walletTenantId)
    expect(await say('status')).toContain('1. Cement with Borrowdale Hardware: paid, USD 120.')
  })

  test('a declined request is said plainly, and other requests never reach the chat', async () => {
    const from = '263771112223'
    await say('cement in Borrowdale', from)
    await say('ask 1', from)
    const request = workflowRequestRepository.listOutbound(guestTenantId(from), {})[0]
    const controller = new WorkflowRequestController()
    await controller.rejectRequest(
      request.id,
      { reason: 'Out of stock this week' },
      { tenantId: org.orgTenantId, headers: {}, user: { id: org.ownerUserId, orgRole: 'owner' } } as any,
    )
    await settle()
    expect(sent[sent.length - 1]).toBe('Borrowdale Hardware cannot take request 1, Cement. They said: Out of stock this week')

    const appRequest = workflowRequestRepository.create({
      requesterTenantId: guestTenantId(from),
      targetOrgTenantId: org.orgTenantId,
      requestType: 'quote',
      payload: { title: 'From the app', source: 'provider_match' },
      status: 'pending',
    })
    await expect(whatsAppInquiryService.requestAnswered(appRequest.id)).resolves.toBe('ignored')
  })

  test('a shared location sets the place for the search', async () => {
    const from = '263779990001'
    await whatsAppInquiryService.handleLocation({
      senderKey: 'platform',
      messageId: `m-${++counter}`,
      from,
      location: { name: 'Borrowdale', address: 'Borrowdale Rd, Harare' },
    })
    expect(sent[sent.length - 1]).toBe('Place set to Borrowdale. Now say what you need, for example: plumber.')
    const list = await say('cement', from)
    expect(list).toContain('Looking for: cement · Borrowdale')
  })
})

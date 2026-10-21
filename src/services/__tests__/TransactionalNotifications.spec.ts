// Jest supplies its ESM globals alongside the installed test runner.
// eslint-disable-next-line import/no-extraneous-dependencies
import { jest } from '@jest/globals'
import axios from 'axios'
import Database from 'better-sqlite3'
import { createHash, createHmac, randomUUID } from 'crypto'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'

import { NotificationController } from '../../controllers/whatsapp/NotificationController'
import { WhatsAppWebhookController } from '../../controllers/whatsapp/WhatsAppWebhookController'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { providerRepository } from '../../persistence/ProviderRepository'
import { NotificationService } from '../NotificationService'
import { DispatchError, OutboxService, outboxService } from '../OutboxService'
import { tenantWhatsAppSecretPrefix, whatsAppSenderService } from '../WhatsAppSenderService'

const phone = '263771234567'
const tenant = 'org-a'
const selection = {
  mode: 'platform' as const,
  enabled: true,
  templates: { task: { name: 'inbox_update', language: 'en_US' } },
}
const approved = {
  data: {
    data: [
      {
        name: 'inbox_update',
        language: 'en_US',
        status: 'APPROVED',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: '{{1}} Open {{2}}' }],
      },
    ],
  },
}

describe('durable transactional WhatsApp notifications', () => {
  let db: Database.Database
  let service: NotificationService
  const env = { ...process.env }

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/091_create_integration_outbox.sql', 'utf8'))
    db.exec(readFileSync('migrations/124_transactional_notifications.sql', 'utf8'))
    db.exec(`
      CREATE TABLE service_providers (
        id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, type TEXT, description TEXT, base_url TEXT,
        auth_type TEXT, config_schema TEXT, is_system INTEGER, status TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE provider_configs (
        id TEXT PRIMARY KEY, tenant_id TEXT, provider_id TEXT, name TEXT, config TEXT, environment TEXT,
        is_default INTEGER, status TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE ssi_users (id TEXT PRIMARY KEY, tenant_id TEXT, phone_hash TEXT);
      CREATE TABLE organizations (id TEXT PRIMARY KEY, tenant_id TEXT);
      CREATE TABLE requests (id TEXT PRIMARY KEY, organization_id TEXT);
      CREATE TABLE wallet_pending_offers (
        id TEXT PRIMARY KEY, tenant_id TEXT, issuer_tenant_id TEXT, source_type TEXT, source_id TEXT, created_at TEXT,
        credential_type TEXT, metadata TEXT, resolved_at TEXT
      );
    `)
    db.prepare('INSERT INTO organizations VALUES (?, ?)').run('organization-a', tenant)
    DatabaseManager.setDatabase(db)
    db.prepare('INSERT INTO ssi_users VALUES (?, ?, ?)').run(
      'person',
      'wallet-a',
      createHash('sha256').update(phone).digest('hex'),
    )
    jest.spyOn(outboxService, 'processPending').mockResolvedValue(0)
    service = new NotificationService()
    process.env.WABA_PHONE_NUMBER_ID = '123'
    process.env.WABA_BUSINESS_ACCOUNT_ID = '456'
    process.env.WABA_TOKEN = 'platform-secret'
    process.env.WHATSAPP_APP_SECRET = 'platform-app-secret'
    process.env.WALLET_PUBLIC_URL = 'https://wallet.example'
    process.env.WHATSAPP_DELIVERY_ENABLED = 'true'
    process.env.WHATSAPP_TEST_RECIPIENTS = phone
    delete process.env.WHATSAPP_PRODUCTION_ENABLED
  })

  afterEach(async () => {
    await Promise.resolve()
    jest.restoreAllMocks()
    DatabaseManager.close()
    process.env = { ...env }
  })

  function consent(eventType = 'task', enabled = true) {
    service.setPreference({ tenantId: tenant, userId: 'person', phone, eventType, enabled })
  }

  function intent(key = 'event-one') {
    const id = service.queueWhatsApp({ tenantId: tenant, to: phone, eventType: 'task', dedupeKey: key })
    const row = db.prepare('SELECT payload FROM integration_outbox WHERE id = ?').get(id) as { payload: string }
    return { id, payload: JSON.parse(row.payload) }
  }

  function delivery(id: string): any {
    return db.prepare('SELECT * FROM notification_deliveries WHERE id = ?').get(id)
  }

  function bind(key = 'platform', phoneId = '123', waba = '456') {
    db.prepare('INSERT OR REPLACE INTO whatsapp_sender_bindings VALUES (?, ?, ?, ?)').run(
      phoneId,
      key,
      waba,
      new Date().toISOString(),
    )
  }

  function ready() {
    whatsAppSenderService.configure(tenant, selection)
    consent()
    bind()
    jest.spyOn(axios, 'get').mockResolvedValue(approved)
  }

  it('atomically deduplicates intent and exposes no provider success before acceptance', async () => {
    const one = intent()
    expect(intent().id).toBe(one.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 1 })
    expect(delivery(one.id).status).toBe('queued')
    const result = await service.sendWhatsAppText({
      to: phone,
      body: 'secret',
      tenantId: tenant,
      eventType: 'task',
      dedupeKey: 'event-one',
    })
    expect(result.queued).toBe(true)
    expect(result.messages).toBeUndefined()
    const payload = db.prepare('SELECT payload FROM integration_outbox WHERE id = ?').get(one.id) as any
    expect(payload.payload).not.toContain('secret')
  })

  it('does not send without consent and rejects preference for another phone', async () => {
    const post = jest.spyOn(axios, 'post')
    const item = intent()
    await service.processWhatsAppIntent(item.id, item.payload)
    expect(delivery(item.id).status).toBe('skipped')
    expect(post).not.toHaveBeenCalled()
    expect(() =>
      service.setPreference({
        tenantId: tenant,
        userId: 'person',
        phone: '263779999999',
        eventType: 'task',
        enabled: true,
      }),
    ).toThrow('not owned')
  })

  it('requires explicit sender configuration and never falls back to platform secrets', async () => {
    consent()
    let item = intent()
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toMatchObject({
      disposition: 'permanent',
    })
    whatsAppSenderService.configure(tenant, { ...selection, mode: 'tenant', phoneNumberId: '789', wabaId: '777' })
    item = intent('two')
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toThrow('not configured')
    expect(delivery(item.id).status).toBe('failed')
  })

  it.each(['platform', 'tenant'] as const)(
    'sends a consented approved utility template via the selected %s sender',
    async (mode) => {
      ready()
      let expectedToken = 'platform-secret'
      let expectedPhone = '123'
      if (mode === 'tenant') {
        const prefix = tenantWhatsAppSecretPrefix(tenant)
        process.env[`${prefix}_TOKEN`] = 'tenant-secret'
        process.env[`${prefix}_APP_SECRET`] = 'tenant-app-secret'
        whatsAppSenderService.configure(tenant, { ...selection, mode, phoneNumberId: '789', wabaId: '777' })
        bind(`tenant:${tenant}`, '789', '777')
        expectedToken = 'tenant-secret'
        expectedPhone = '789'
      }
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [{ id: `wamid-${mode}` }] } })
      const item = intent()
      await service.processWhatsAppIntent(item.id, item.payload)
      expect(delivery(item.id).status).toBe('accepted')
      expect(post).toHaveBeenCalledWith(
        `https://graph.facebook.com/v26.0/${expectedPhone}/messages`,
        expect.objectContaining({
          type: 'template',
          to: phone,
          biz_opaque_callback_data: item.id,
          template: expect.objectContaining({ name: 'inbox_update' }),
        }),
        expect.objectContaining({ headers: { Authorization: `Bearer ${expectedToken}` }, timeout: 15000 }),
      )
      expect(JSON.stringify(post.mock.calls[0][1])).toContain('https://wallet.example/inbox')
      await service.processWhatsAppIntent(item.id, item.payload)
      expect(post).toHaveBeenCalledTimes(1)
    },
  )

  it('enforces provider connection validation and sender-specific utility approval', async () => {
    whatsAppSenderService.configure(tenant, selection)
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { data: [{ id: '123' }] } })
      .mockResolvedValueOnce(approved)
    const subscribe = jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: { success: true } })
    await expect(whatsAppSenderService.validate(tenant)).resolves.toEqual({
      ready: true,
      templates: ['task'],
      webhookSubscribed: true,
    })
    expect(subscribe).toHaveBeenCalledWith(
      'https://graph.facebook.com/v26.0/456/subscribed_apps',
      undefined,
      expect.objectContaining({ headers: { Authorization: 'Bearer platform-secret' } }),
    )
    expect(db.prepare('SELECT sender_key FROM whatsapp_sender_bindings').get()).toEqual({ sender_key: 'platform' })
    get.mockResolvedValue({ data: { data: [] } })
    consent()
    const item = intent()
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toThrow('not approved')
  })

  it('does not bind a sender whose webhook subscription fails, and honours WHATSAPP_GRAPH_VERSION', async () => {
    process.env.WHATSAPP_GRAPH_VERSION = 'v27.0'
    whatsAppSenderService.configure(tenant, selection)
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { data: [{ id: '123' }] } })
      .mockResolvedValueOnce(approved)
    jest.spyOn(axios, 'post').mockResolvedValueOnce({ data: { success: false } })
    await expect(whatsAppSenderService.validate(tenant)).rejects.toThrow('Webhook subscription failed')
    expect(get.mock.calls[0][0]).toBe('https://graph.facebook.com/v27.0/456/phone_numbers')
    expect(db.prepare('SELECT COUNT(*) AS n FROM whatsapp_sender_bindings').get()).toEqual({ n: 0 })
    process.env.WHATSAPP_GRAPH_VERSION = 'garbage'
    get.mockResolvedValueOnce({ data: { data: [] } })
    await expect(whatsAppSenderService.validate(tenant)).rejects.toThrow('does not belong')
    expect(get.mock.calls[2][0]).toBe('https://graph.facebook.com/v26.0/456/phone_numbers')
  })

  it('records the provider error code on a failed delivery status', () => {
    const item = intent()
    db.prepare(
      `UPDATE notification_deliveries SET status = 'accepted', sender_key = 'platform',
      phone_number_id = '123', provider_message_id = 'wamid-err' WHERE id = ?`,
    ).run(item.id)
    service.applyWhatsAppStatus('platform', '123', {
      id: 'wamid-err',
      status: 'failed',
      timestamp: '100',
      recipient_id: phone,
      errors: [{ code: 131026 }],
    })
    expect(delivery(item.id)).toMatchObject({ status: 'failed', reason: 'Provider delivery failure (code 131026)' })
  })

  it('blocks recipients not approved for test delivery without making a provider call', async () => {
    ready()
    process.env.WHATSAPP_TEST_RECIPIENTS = ''
    const post = jest.spyOn(axios, 'post')
    const item = intent()
    await service.processWhatsAppIntent(item.id, item.payload)
    expect(delivery(item.id).reason).toContain('not approved')
    expect(post).not.toHaveBeenCalled()
  })

  it('rechecks opt-out after asynchronous template lookup', async () => {
    ready()
    jest.mocked(axios.get).mockImplementationOnce(async () => {
      consent('task', false)
      return approved
    })
    const post = jest.spyOn(axios, 'post')
    const item = intent()
    await service.processWhatsAppIntent(item.id, item.payload)
    expect(delivery(item.id).status).toBe('skipped')
    expect(post).not.toHaveBeenCalled()
  })

  it('retries a known rate-limit rejection but exposes ambiguous timeout instead of sending twice', async () => {
    ready()
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValueOnce({ response: { status: 429 }, config: { token: 'must-not-persist' } })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'wamid-retry' }] } })
    const item = intent()
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toMatchObject({ disposition: 'retry' })
    expect(delivery(item.id).reason).not.toContain('must-not-persist')
    await service.processWhatsAppIntent(item.id, item.payload)
    expect(delivery(item.id).status).toBe('accepted')
    post.mockRejectedValueOnce(new Error('timeout containing credential'))
    const uncertain = intent('timeout')
    await expect(service.processWhatsAppIntent(uncertain.id, uncertain.payload)).rejects.toMatchObject({
      disposition: 'uncertain',
    })
    expect(delivery(uncertain.id).status).toBe('uncertain')
    await expect(service.processWhatsAppIntent(uncertain.id, uncertain.payload)).rejects.toMatchObject({
      disposition: 'uncertain',
    })
    expect(post).toHaveBeenCalledTimes(3)
  })

  it('does not send after sender revocation or reuse another tenant configuration', async () => {
    ready()
    providerRepository.saveConfig({
      ...providerRepository.findConfigById(`whatsapp:${tenant}`)!,
      status: 'inactive',
    })
    const post = jest.spyOn(axios, 'post')
    const item = intent()
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toThrow('disabled')
    expect(whatsAppSenderService.selection('org-b')).toBeUndefined()
    expect(post).not.toHaveBeenCalled()
  })

  it('preserves monotonic delivery evidence and ignores duplicate / older failure callbacks', () => {
    const item = intent()
    db.prepare(
      `UPDATE notification_deliveries SET status = 'accepted', sender_key = 'platform',
      phone_number_id = '123', provider_message_id = 'wamid-one' WHERE id = ?`,
    ).run(item.id)
    const status = (state: string, time: string, sender = 'platform') =>
      service.applyWhatsAppStatus(sender, '123', {
        id: 'wamid-one',
        status: state,
        timestamp: time,
        recipient_id: phone,
      })
    status('sent', '200')
    status('failed', '100')
    expect(delivery(item.id).status).toBe('sent')
    status('failed', '350')
    status('delivered', '300')
    expect(delivery(item.id).status).toBe('delivered')
    status('delivered', '300', 'tenant:org-b')
    expect(delivery(item.id).status).toBe('delivered')
    status('read', '400')
    status('delivered', '300')
    status('failed', '500')
    status('read', '400')
    expect(delivery(item.id).status).toBe('read')
  })

  it('reconciles a crashed POST from a signed opaque callback, and processes all STOP messages', async () => {
    ready()
    const item = intent()
    db.prepare(
      `UPDATE notification_deliveries SET status = 'uncertain', sender_key = 'platform',
      phone_number_id = '123' WHERE id = ?`,
    ).run(item.id)
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '456',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123' },
                statuses: [
                  {
                    id: 'wamid-late',
                    status: 'delivered',
                    timestamp: '400',
                    recipient_id: phone,
                    biz_opaque_callback_data: item.id,
                  },
                ],
                messages: [
                  { from: phone, id: 'message-one', type: 'text', text: { body: 'hello' } },
                  { from: phone, id: 'message-two', type: 'text', text: { body: 'STOP' } },
                ],
              },
            },
          ],
        },
      ],
    }
    const raw = Buffer.from(JSON.stringify(payload))
    const signature = `sha256=${createHmac('sha256', 'platform-app-secret').update(raw).digest('hex')}`
    const controller = new WhatsAppWebhookController()
    await expect(
      controller.handleWebhook(payload, {
        rawBody: raw,
        headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
      } as any),
    ).rejects.toThrow()
    expect(delivery(item.id).status).toBe('uncertain')
    await controller.handleWebhook(payload, { rawBody: raw, headers: { 'x-hub-signature-256': signature } } as any)
    expect(delivery(item.id).status).toBe('delivered')
    expect(db.prepare('SELECT enabled FROM notification_preferences').get()).toEqual({ enabled: 0 })
    await controller.handleWebhook(payload, { rawBody: raw, headers: { 'x-hub-signature-256': signature } } as any)
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_callbacks').get()).toEqual({ n: 2 })
  })

  it('requires organization admin context and never projects credentials', async () => {
    const controller = new NotificationController()
    const request = { user: { id: 'person', tenantId: tenant, orgRole: 'owner' } } as any
    await controller.selectSender(tenant, selection, request)
    await expect(controller.getSender('org-b', request)).rejects.toThrow('admin')
    const config = providerRepository.findConfigById(`whatsapp:${tenant}`)!
    providerRepository.saveConfig({ ...config, config: { ...config.config, token: 'legacy-secret' } })
    expect(JSON.stringify(await controller.getSender(tenant, request))).not.toContain('legacy-secret')
  })

  it('routes task and offer events through existing wallet recipients without changing domain state', () => {
    consent()
    db.prepare('INSERT INTO requests VALUES (?, ?)').run('request-a', 'organization-a')
    service.queueInboxNotification('event', {
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType: 'workflow_stage_action',
      sourceId: 'request-a',
    })
    service.queueInboxNotification('another-event', {
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType: 'workflow_stage_action',
      sourceId: 'request-a',
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT event_type FROM notification_deliveries').get()).toEqual({ event_type: 'task' })
    const outbox = db.prepare('SELECT payload FROM integration_outbox').get() as { payload: string }
    expect(JSON.parse(outbox.payload).requestId).toBe('request-a')
  })

  it.each([
    ['workflow_stage_action', 'WorkflowStageAction', 'task'],
    ['workflow_request_assignment', 'WorkflowRequestApproval', 'task'],
    ['requisition_stage_action', 'RequisitionStageAction', 'task'],
    ['ap_workflow_assignment', 'WorkflowActionAssignment', 'task'],
    ['employee', 'EmployeeCredential', 'vc_offer'],
    ['org_workflow_actor', 'OrgWorkflowActorCredential', 'vc_offer'],
    ['manual_direct_offer', 'AnyNewCredentialVC', 'vc_offer'],
    ['workflow_vc_offer', 'PaymentReceiptVC', 'vc_offer'],
    ['quote_offer', 'QuoteVC', 'vc_offer'],
    ['invoice_offer', 'InvoiceVC', 'vc_offer'],
    ['payment', 'ReceiptVC', 'vc_offer'],
    ['contact-offer', 'ReceiptVC', 'vc_offer'],
    ['payment_link', 'PaymentLink', 'payment_link'],
    ['proof_request', 'ProofRequest', 'proof_request'],
    ['ap_payment', 'RemittanceAdviceVC', 'remittance'],
  ])('captures %s cards durably and deduplicates the producer event', async (sourceType, credentialType, eventType) => {
    consent(eventType)
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    db.prepare(
      `INSERT INTO wallet_pending_offers
      (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('new-card', 'wallet-a', tenant, sourceType, 'source-one', credentialType, new Date().toISOString())
    const captured = db
      .prepare("SELECT payload FROM integration_outbox WHERE topic = 'wallet.inbox.whatsapp'")
      .get() as { payload: string }
    const payload = JSON.parse(captured.payload)
    expect(payload).toEqual({
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType,
      sourceId: 'source-one',
      credentialType,
      inboxItemId: 'new-card',
    })
    const worker = new OutboxService()
    await worker.processPending('wallet.inbox.whatsapp')
    service.queueInboxNotification('legacy-event', {
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType,
      sourceId: 'source-one',
      credentialType,
    })
    expect(db.prepare('SELECT event_type, status FROM notification_deliveries').all()).toEqual([
      { event_type: eventType, status: 'queued' },
    ])
    const intentRow = db
      .prepare("SELECT payload FROM integration_outbox WHERE topic = 'notification.whatsapp'")
      .get() as { payload: string }
    expect(JSON.parse(intentRow.payload).inboxItemId).toBe('new-card')
    expect(db.prepare('SELECT resolved_at FROM wallet_pending_offers').get()).toEqual({ resolved_at: null })
  })

  it('captures no rolled-back cards, historical cards or duplicate inserts', () => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO wallet_pending_offers
      (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    insert.run('historical', 'wallet-a', tenant, 'employee', 'old', 'EmployeeCredential')
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    expect(() =>
      db.transaction(() => {
        insert.run('rolled-back', 'wallet-a', tenant, 'employee', 'new', 'EmployeeCredential')
        throw new Error('rollback')
      })(),
    ).toThrow('rollback')
    expect(db.prepare('SELECT COUNT(*) AS n FROM integration_outbox').get()).toEqual({ n: 0 })
    insert.run('new', 'wallet-a', tenant, 'employee', 'new', 'EmployeeCredential')
    insert.run('new', 'wallet-a', tenant, 'employee', 'new', 'EmployeeCredential')
    expect(db.prepare('SELECT COUNT(*) AS n FROM integration_outbox').get()).toEqual({ n: 1 })
  })

  it('notifies for renewed cards of the same type and source without merging different credential types', () => {
    consent('vc_offer')
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    for (const [id, credentialType] of [
      ['staff-v1', 'EmployeeCredential'],
      ['staff-v2', 'EmployeeCredential'],
      ['contract', 'EmploymentContractVC'],
    ]) {
      db.prepare(
        `INSERT INTO wallet_pending_offers
        (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, 'wallet-a', tenant, 'employee', 'membership', credentialType)
    }
    const captured = db.prepare('SELECT id, payload FROM integration_outbox').all() as Array<{
      id: string
      payload: string
    }>
    for (const row of captured) service.queueInboxNotification(row.id, JSON.parse(row.payload))
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 3 })
    const intents = db
      .prepare("SELECT payload FROM integration_outbox WHERE topic = 'notification.whatsapp'")
      .all() as Array<{ payload: string }>
    expect(intents.map((row) => JSON.parse(row.payload).inboxItemId).sort()).toEqual([
      'contract',
      'staff-v1',
      'staff-v2',
    ])
  })

  it('does not forward captured inbox cards without the matching recipient opt-in', async () => {
    consent('task')
    consent('vc_offer', false)
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    db.prepare(
      `INSERT INTO wallet_pending_offers
      (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('staff', 'wallet-a', tenant, 'employee', 'membership', 'EmployeeCredential')
    await new OutboxService().processPending('wallet.inbox.whatsapp')
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 0 })
  })

  describe('person-level opt-in for organisations they have not opted into yet', () => {
    const orgB = 'org-b'
    const allEvents = Object.fromEntries(
      ['task', 'vc_offer', 'payment_link', 'proof_request', 'remittance'].map((event) => [
        event,
        { name: 'inbox_update', language: 'en_US' },
      ]),
    )
    function personal(eventType: string, enabled = true) {
      service.setPreference({ tenantId: 'wallet-a', userId: 'person', phone, eventType, enabled })
    }
    function card(id: string, sourceType: string, credentialType: string, issuer = orgB) {
      db.prepare(
        `INSERT INTO wallet_pending_offers
        (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, 'wallet-a', issuer, sourceType, `${id}-source`, credentialType, new Date().toISOString())
    }
    async function drain() {
      const worker = new OutboxService()
      await worker.processPending('wallet.inbox.whatsapp')
      await worker.processPending('notification.whatsapp')
    }
    beforeEach(() => {
      db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
      whatsAppSenderService.configure(orgB, { mode: 'platform', enabled: true, templates: allEvents })
      bind()
      jest.spyOn(axios, 'get').mockResolvedValue(approved)
    })

    it.each([
      ['team/employee invite', 'org_employee', 'EmployeeCredential', 'vc_offer'],
      ['workflow actor card', 'org_workflow_actor', 'OrgWorkflowActorCredential', 'vc_offer'],
      ['delivered credential', 'workflow_vc_offer', 'PaymentReceiptVC', 'vc_offer'],
      ['workflow stage actor step', 'workflow_stage_action', 'WorkflowStageAction', 'task'],
      ['requisition approval step', 'requisition_stage_action', 'RequisitionStageAction', 'task'],
    ])('sends a %s to WhatsApp end to end', async (_label, sourceType, credentialType, eventType) => {
      personal(eventType)
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [{ id: 'wamid-new-org' }] } })
      card('card-b', sourceType, credentialType)
      await drain()
      expect(post).toHaveBeenCalledTimes(1)
      expect(post.mock.calls[0][0]).toContain('/123/messages')
      expect(JSON.stringify(post.mock.calls[0][1])).toContain('https://wallet.example/inbox?item=card-b')
      expect(db.prepare('SELECT tenant_id, event_type, status FROM notification_deliveries').all()).toEqual([
        { tenant_id: orgB, event_type: eventType, status: 'accepted' },
      ])
    })

    it('sends a contact wallet-link invite to a person who opted in, without its claim token', async () => {
      personal('vc_offer')
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [{ id: 'wamid-contact' }] } })
      jest.spyOn(service, 'sendSms').mockResolvedValue({ success: false, skipped: true })
      await service.dispatchContactNotification({
        tenantId: orgB,
        dedupeKey: 'contact-invite:c1:exp',
        contact: { name: 'Tari', phone: '0771234567' },
        type: 'vc_offer',
        url: 'https://portal.example/wallet/link-contact?token=secret-claim',
      })
      await new OutboxService().processPending('notification.whatsapp')
      expect(post).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(post.mock.calls[0][1])).not.toContain('secret-claim')
      expect(db.prepare('SELECT status FROM notification_deliveries').get()).toEqual({ status: 'accepted' })
    })

    it('lets the organisation switch override the person-level switch', async () => {
      personal('vc_offer')
      service.setPreference({ tenantId: orgB, userId: 'person', phone, eventType: 'vc_offer', enabled: false })
      const post = jest.spyOn(axios, 'post')
      card('card-b', 'org_employee', 'EmployeeCredential')
      await drain()
      expect(post).not.toHaveBeenCalled()
      expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 0 })
    })

    it('does not use the person-level switch for an organisation with its own WhatsApp number, or when off', async () => {
      personal('vc_offer', false)
      personal('task')
      whatsAppSenderService.configure('org-own', {
        mode: 'tenant',
        enabled: true,
        phoneNumberId: '999',
        wabaId: '888',
        templates: allEvents,
      } as any)
      const post = jest.spyOn(axios, 'post')
      card('invite-off', 'org_employee', 'EmployeeCredential')
      card('own-number', 'workflow_stage_action', 'WorkflowStageAction', 'org-own')
      await drain()
      expect(post).not.toHaveBeenCalled()
      expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 0 })
    })

    it('withdraws the person-level switch when they reply STOP to the platform number', () => {
      personal('vc_offer')
      service.applyWhatsAppOptOut('platform', phone, 'wamid-stop')
      expect(service.consentedRecipient(orgB, 'vc_offer', { userId: 'person' })).toBeUndefined()
    })
  })

  it('replays a crashed inbox fan-out without duplicating WhatsApp or adding an Android event', async () => {
    consent('vc_offer')
    db.exec(readFileSync('migrations/130_wallet_inbox_whatsapp.sql', 'utf8'))
    db.prepare(
      `INSERT INTO wallet_pending_offers
      (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('staff', 'wallet-a', tenant, 'employee', 'membership', 'EmployeeCredential')
    const worker = new OutboxService()
    await worker.processPending('wallet.inbox.whatsapp')
    db.prepare(
      "UPDATE integration_outbox SET status = 'processing', lease_until = 1 WHERE topic = 'wallet.inbox.whatsapp'",
    ).run()
    await worker.processPending('wallet.inbox.whatsapp')
    expect(db.prepare('SELECT COUNT(*) AS n FROM notification_deliveries').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT topic, status FROM integration_outbox ORDER BY topic').all()).toEqual([
      { topic: 'notification.whatsapp', status: 'pending' },
      { topic: 'wallet.inbox.whatsapp', status: 'processed' },
    ])
  })

  it('links a non-request task to its exact inbox item, not a guessed workflow route', async () => {
    ready()
    db.prepare(
      'INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('field-inbox-card', 'wallet-a', tenant, 'workflow_stage_action', 'run-one:review', '2026-10-17')
    service.queueInboxNotification('field-event', {
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType: 'workflow_stage_action',
      sourceId: 'run-one:review',
    })
    const outbox = db.prepare('SELECT id, payload FROM integration_outbox').get() as { id: string; payload: string }
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { messages: [{ id: 'wamid-field' }] } })
    await service.processWhatsAppIntent(outbox.id, JSON.parse(outbox.payload))
    expect(JSON.stringify(post.mock.calls[0][1])).toContain('https://wallet.example/inbox?item=field-inbox-card')
    expect(JSON.stringify(post.mock.calls[0][1])).not.toContain('run-one')
  })

  it('does not link a recipient to another holder or organisation inbox item', async () => {
    ready()
    db.prepare(
      'INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('foreign-inbox-card', 'wallet-b', 'org-b', 'workflow_stage_action', 'run-two', '2026-10-17')
    const queued = intent()
    const post = jest.spyOn(axios, 'post')
    await expect(
      service.processWhatsAppIntent(queued.id, { ...queued.payload, inboxItemId: 'foreign-inbox-card' }),
    ).rejects.toThrow('not available for this recipient')
    expect(post).not.toHaveBeenCalled()
    expect(delivery(queued.id).status).toBe('failed')
  })

  it('reports remittance channel results instead of discarding rejected or skipped sends', async () => {
    jest.spyOn(service, 'sendWhatsAppText').mockResolvedValue({ queued: true })
    jest.spyOn(service, 'sendSms').mockResolvedValue({ success: false, skipped: true })
    jest.spyOn(service, 'sendEmail').mockRejectedValue(new Error('SMTP unavailable'))
    const result = await service.dispatchRemittanceNotification({
      tenantId: tenant,
      dedupeKey: 'payment-one',
      contact: { name: 'Supplier', phone, email: 'supplier@example.test' },
      buyerName: 'Buyer',
      amountPaid: 10,
      currency: 'USD',
      remainingBalance: 20,
      invoiceRef: 'INVOICE',
      acknowledgeUrl: 'https://wallet.example/inbox',
    })
    expect(result).toEqual({
      accepted: false,
      channels: [
        { channel: 'whatsapp', status: 'queued' },
        { channel: 'sms', status: 'skipped' },
        { channel: 'email', status: 'failed' },
      ],
    })
  })

  it('deduplicates direct contact delivery and the same authoritative inbox offer event', () => {
    consent('vc_offer')
    const direct = service.queueWhatsApp({
      tenantId: tenant,
      to: phone,
      eventType: 'vc_offer',
      dedupeKey: 'contact-offer:offer-one',
    })
    service.queueInboxNotification('outbox-event', {
      tenantId: 'wallet-a',
      issuerTenantId: tenant,
      sourceType: 'contact-offer',
      sourceId: 'offer-one',
      credentialType: 'ReceiptVC',
    })
    expect(db.prepare('SELECT id FROM notification_deliveries').all()).toEqual([{ id: direct }])
  })

  it('allows test delivery only to the administrator own recorded opted-in phone', async () => {
    const controller = new NotificationController()
    const request = { user: { id: 'person', tenantId: tenant, orgRole: 'owner' } } as any
    await expect(controller.testSender(tenant, { eventType: 'task', requestId: 'one' }, request)).rejects.toThrow(
      'opt-in',
    )
    consent()
    const first = await controller.testSender(tenant, { eventType: 'task', requestId: 'one' }, request)
    const second = await controller.testSender(tenant, { eventType: 'task', requestId: 'one' }, request)
    expect(first.notificationId).toBe(second.notificationId)
    expect(first.queued).toBe(true)
  })
  it('never treats an unvalidated sender or a marketing template as ready', async () => {
    whatsAppSenderService.configure(tenant, selection)
    consent()
    let item = intent('unvalidated')
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toThrow('not been validated')
    bind()
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: [{ ...approved.data.data[0], category: 'MARKETING' }] },
    })
    item = intent('marketing')
    await expect(service.processWhatsAppIntent(item.id, item.payload)).rejects.toThrow('not approved')
  })

  it('enforces tenant-specific webhook secrets and WABA/phone mappings', () => {
    const prefix = tenantWhatsAppSecretPrefix(tenant)
    process.env[`${prefix}_APP_SECRET`] = 'tenant-secret'
    bind(`tenant:${tenant}`, '789', '777')
    const raw = Buffer.from('{"entry":[]}')
    const sign = (secret: string) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
    expect(() => whatsAppSenderService.verifyCallback('789', '777', raw, sign('platform-app-secret'))).toThrow()
    expect(() => whatsAppSenderService.verifyCallback('789', '456', raw, sign('tenant-secret'))).toThrow()
    expect(whatsAppSenderService.verifyCallback('789', '777', raw, sign('tenant-secret'))).toBe(`tenant:${tenant}`)
  })

  function outboxRow(id: string, topic = 'test', status = 'pending', attempts = 0) {
    db.prepare(
      `INSERT INTO integration_outbox (id, topic, payload, status, attempts, created_at, lease_until)
      VALUES (?, ?, '{}', ?, ?, ?, 1)`,
    ).run(id, topic, status, attempts, new Date().toISOString())
  }

  it('fails unknown topics explicitly and retries failures after restart with bounded attempts', async () => {
    const one = new OutboxService()
    outboxRow('unknown', 'unknown')
    outboxRow('retry')
    one.register('test', async () => {
      throw new Error('transient private provider details')
    })
    await one.processPending()
    expect(db.prepare('SELECT status FROM integration_outbox WHERE id = ?').get('unknown')).toEqual({
      status: 'failed',
    })
    expect(db.prepare('SELECT status, error_message FROM integration_outbox WHERE id = ?').get('retry')).toEqual({
      status: 'retry',
      error_message: 'Handler failed',
    })
    db.prepare('UPDATE integration_outbox SET available_at = 0 WHERE id = ?').run('retry')
    const restarted = new OutboxService()
    restarted.register('test', async () => {})
    await restarted.processPending()
    expect(db.prepare('SELECT status FROM integration_outbox WHERE id = ?').get('retry')).toEqual({
      status: 'processed',
    })
    outboxRow('exhausted', 'test', 'retry', 4)
    one.register('test', async () => {
      throw new DispatchError('Rate limited')
    })
    await one.processPending()
    expect(db.prepare('SELECT status, attempts FROM integration_outbox WHERE id = ?').get('exhausted')).toEqual({
      status: 'failed',
      attempts: 5,
    })
  })

  it('allows only one concurrent claim and never replays a crashed legacy external side effect', async () => {
    const one = new OutboxService()
    const two = new OutboxService()
    outboxRow('concurrent')
    let release!: () => void
    const handler = jest.fn(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    one.register('test', handler)
    two.register('test', handler)
    const first = one.processPending()
    await two.processPending()
    expect(handler).toHaveBeenCalledTimes(1)
    release()
    await first
    outboxRow('crash', 'workflow.vc.issue', 'processing', 1)
    await two.processPending()
    expect(db.prepare('SELECT status FROM integration_outbox WHERE id = ?').get('crash')).toEqual({
      status: 'uncertain',
    })
  })

  it('recovers a deferred inbox intent without removing or duplicating the actor card', () => {
    db.prepare(
      `INSERT INTO wallet_pending_offers
      (tenant_id, issuer_tenant_id, source_type, source_id, credential_type, metadata, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      'wallet-a',
      tenant,
      'workflow_stage_action',
      'request-a',
      'WorkflowStageAction',
      JSON.stringify({
        notificationOutboxDedupeKey: 'wpo:wallet-a:workflow_stage_action:request-a',
      }),
    )
    const recovery = new OutboxService()
    jest.spyOn(recovery, 'processPending').mockResolvedValue(0)
    expect(recovery.recoverInboxIntents()).toBe(1)
    expect(recovery.recoverInboxIntents()).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM wallet_pending_offers').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT topic FROM integration_outbox').get()).toEqual({ topic: 'wallet.vc.offered' })
  })

  it('recovers an expired notification lease without another external effect', async () => {
    ready()
    const post = jest.spyOn(axios, 'post')
    const item = intent()
    db.prepare(`UPDATE notification_deliveries SET status = 'sending' WHERE id = ?`).run(item.id)
    db.prepare(`UPDATE integration_outbox SET status = 'processing', lease_until = 1 WHERE id = ?`).run(item.id)
    const recovered = new OutboxService()
    recovered.register('notification.whatsapp', (id, payload) => service.processWhatsAppIntent(id, payload))
    await recovered.processPending()
    expect(delivery(item.id).status).toBe('uncertain')
    expect(db.prepare('SELECT status FROM integration_outbox WHERE id = ?').get(item.id)).toEqual({
      status: 'uncertain',
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('recovers persisted retry rows after closing and reopening the SQLite database', async () => {
    const directory = `.test-data/notification-restart-${randomUUID()}`
    mkdirSync(directory, { recursive: true })
    const path = `${directory}/persistence.db`
    outboxRow('persisted', 'test', 'retry', 1)
    writeFileSync(path, db.serialize())
    db.close()
    db = new Database(path)
    DatabaseManager.setDatabase(db)
    const recovered = new OutboxService()
    const handler = jest.fn(async () => {})
    recovered.register('test', handler)
    try {
      await recovered.processPending()
      db.close()
      db = new Database(path)
      DatabaseManager.setDatabase(db)
      await new OutboxService().processPending()
      expect(db.prepare('SELECT status, attempts FROM integration_outbox WHERE id = ?').get('persisted')).toEqual({
        status: 'processed',
        attempts: 2,
      })
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      db.close()
      db = new Database(':memory:')
      DatabaseManager.setDatabase(db)
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps signed delivery evidence when a POST response is lost after its callback', async () => {
    ready()
    const item = intent()
    jest.spyOn(axios, 'post').mockImplementationOnce(async () => {
      service.applyWhatsAppStatus('platform', '123', {
        id: 'wamid-race',
        status: 'read',
        timestamp: '600',
        recipient_id: phone,
        biz_opaque_callback_data: item.id,
      })
      throw new Error('Response lost')
    })
    await service.processWhatsAppIntent(item.id, item.payload)
    expect(delivery(item.id).status).toBe('read')
    expect(delivery(item.id).provider_message_id).toBe('wamid-race')
  })
})

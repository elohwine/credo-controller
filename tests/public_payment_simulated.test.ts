import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import type { Request } from 'express'
import axios from 'axios'
import { PublicPaymentController } from '../src/controllers/public/PublicPaymentController'
import { WalletCredentialsController } from '../src/controllers/wallet/WalletCredentialsController'
import { EcoCashWebhookController } from '../src/controllers/webhooks/EcoCashWebhookController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowService } from '../src/services/WorkflowService'
import { triggerService } from '../src/services/TriggerService'
import { orgSetupProvisioningService } from '../src/services/OrgSetupProvisioningService'
import { paymentLinkService } from '../src/services/PaymentLinkService'
import { ExternalActions } from '../src/services/workflow/actions/ExternalActions'
import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
const previousIssuerUrl = process.env.ISSUER_API_URL
beforeAll(() => {
  databases = initTestDatabases('credo-public-simulated-')
  process.env.ISSUER_API_URL = 'http://localhost:3000'
})
afterEach(() => jest.restoreAllMocks())
afterAll(() => {
  databases.cleanup()
  if (previousIssuerUrl === undefined) delete process.env.ISSUER_API_URL
  else process.env.ISSUER_API_URL = previousIssuerUrl
})

describe('public checkout reuses configured simulated pay', () => {
  test('payment receipt offers use the migrated schema, remain holder scoped and disappear after acceptance', async () => {
    const org = seedOrganization()
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO ack_payments (id,tenant_id,amount,currency,state,invoice_id,metadata)
      VALUES (?, ?, 150, 'USD', 'paid', 'LOCAL-RECEIPT', ?)`,
    ).run('test-payment-receipt', org.orgTenantId, JSON.stringify({ merchantTenantId: 'merchant-test' }))
    db.prepare(
      `INSERT INTO ack_payment_receipts
      (id,payment_id,credential_type,credential_offer_url) VALUES (?, ?, 'ReceiptVC', ?)`,
    ).run('test-receipt', 'test-payment-receipt', 'openid-credential-offer://test-receipt')
    const controller = new WalletCredentialsController()
    const req = { user: { tenantId: org.orgTenantId } } as Request
    const result = await controller.getPendingReceipts(req)
    expect(result.pendingReceipts).toEqual([
      expect.objectContaining({
        receiptRowId: 'test-receipt',
        sourceType: 'payment',
        merchant: 'merchant-test',
        invoiceRef: 'LOCAL-RECEIPT',
      }),
    ])
    expect(
      (await controller.getPendingReceipts({ user: { tenantId: 'other-holder' } } as Request)).pendingReceipts,
    ).toEqual([])
    expect((await controller.syncReceipts(req)).pendingCount).toBe(1)
    db.prepare('UPDATE ack_payment_receipts SET resolved_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      'test-receipt',
    )
    expect((await controller.getPendingReceipts(req)).pendingReceipts).toEqual([])
    expect((await controller.syncReceipts(req)).pendingCount).toBe(0)
  })
  test('offers the existing practice method and runs the existing instant-payment/webhook path once', async () => {
    const org = seedOrganization()
    orgSetupProvisioningService.selectPaymentMethod(org.orgTenantId, 'simulated')
    const link = paymentLinkService.create({
      merchantId: org.orgTenantId,
      description: 'LOCAL TEST invoice',
      amount: 150,
      currency: 'USD',
    })
    const controller = new PublicPaymentController()
    const details = await controller.getPaymentDetails(link.shortlinkCode)
    expect(details).toMatchObject({ found: true, payment: { availableMethods: ['simulated'] } })
    const initiate = jest.spyOn(ExternalActions, 'initiateEcoCashPayment')
    jest.spyOn(workflowService, 'executeWorkflow').mockResolvedValue({ status: 'completed' })
    jest.spyOn(triggerService, 'emitEvent').mockResolvedValue(undefined)
    const webhook = jest.spyOn(axios, 'post').mockImplementation(async (url, payload) => {
      if (url === 'http://localhost:3000/webhooks/ecocash') {
        return {
          data: await new EcoCashWebhookController().handleEcoCashWebhook(
            payload,
            process.env.ECOCASH_WEBHOOK_SECRET || 'test-webhook-secret',
          ),
        }
      }
      if (url === 'http://localhost:3000/custom-oidc/issuer/credential-offers') {
        return { data: { credential_offer_url: 'openid-credential-offer://LOCAL-TEST-RECEIPT' } }
      }
      throw new Error(`Unexpected external call: ${url}`)
    })
    const req = { user: { tenantId: 'local-test-payer' }, headers: {} } as Request
    const body = { paymentMethod: 'simulated', customerMsisdn: '263770000099', saveToWallet: false }
    const result = await controller.initiatePublicPayment(link.shortlinkCode, body, req)
    expect(result).toMatchObject({ status: 'success', providerRef: expect.stringMatching(/^SIM-/) })
    expect(initiate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        apiKey: undefined,
        simulatedMode: true,
      }),
    )
    expect(webhook).toHaveBeenCalledWith(
      'http://localhost:3000/webhooks/ecocash',
      expect.objectContaining({
        status: 'SUCCESS',
        amount: 150,
        transactionId: result.providerRef,
      }),
      expect.anything(),
    )
    expect(webhook).toHaveBeenCalledWith(
      'http://localhost:3000/custom-oidc/issuer/credential-offers',
      expect.objectContaining({
        credentials: [
          expect.objectContaining({
            claims: expect.objectContaining({
              merchant: org.orgTenantId,
              merchantName: org.name,
              merchantDid: expect.stringMatching(/^did:/),
            }),
          }),
        ],
      }),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-tenant-id': org.orgTenantId }) }),
    )
    const db = DatabaseManager.getDatabase()
    expect(
      db.prepare(`SELECT balance_due,status FROM financial_obligations WHERE tenant_id=?`).get(org.orgTenantId),
    ).toEqual({ balance_due: 0, status: 'settled' })
    expect(db.prepare('SELECT state FROM ack_payments WHERE tenant_id=?').get('local-test-payer')).toEqual({
      state: 'paid',
    })
    expect(await controller.initiatePublicPayment(link.shortlinkCode, body, req)).toMatchObject({
      providerRef: result.providerRef,
    })
    expect(initiate).toHaveBeenCalledTimes(1)
    expect(webhook).toHaveBeenCalledTimes(2)
    expect(db.prepare('SELECT count(*) AS n FROM payment_links WHERE merchant_id=?').get(org.orgTenantId)).toEqual({
      n: 1,
    })
    expect(
      db
        .prepare(
          `SELECT count(*) AS n FROM ack_payment_receipts r
      JOIN ack_payments p ON p.id=r.payment_id WHERE p.tenant_id=?`,
        )
        .get('local-test-payer'),
    ).toEqual({ n: 1 })
  })

  test('rejects callbacks without an initiated payment and never accepts the production test secret', async () => {
    jest.spyOn(axios, 'post')
    const webhook = new EcoCashWebhookController()
    const noPayment = await webhook.handleEcoCashWebhook(
      {
        sourceReference: 'unknown-reference',
        status: 'SUCCESS',
        transactionId: 'PROVIDER-UNKNOWN',
        amount: 25,
        currency: 'USD',
      },
      'test-webhook-secret',
    )
    expect(noPayment).toEqual({ error: 'No initiated payment matches this source reference' })
    expect(axios.post).not.toHaveBeenCalled()

    const originalEnvironment = process.env.NODE_ENV
    const originalSecret = process.env.ECOCASH_WEBHOOK_SECRET
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.ECOCASH_WEBHOOK_SECRET
      const missingSecret = await new EcoCashWebhookController().handleEcoCashWebhook(
        {
          sourceReference: 'unknown-reference',
          status: 'SUCCESS',
        },
        'test-webhook-secret',
      )
      expect(missingSecret).toEqual({ error: 'Webhook authentication is unavailable' })
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalEnvironment
      if (originalSecret === undefined) delete process.env.ECOCASH_WEBHOOK_SECRET
      else process.env.ECOCASH_WEBHOOK_SECRET = originalSecret
    }
  })

  test('rejects simulation for an organisation without that method, even when another organisation enables it', async () => {
    const practice = seedOrganization()
    orgSetupProvisioningService.selectPaymentMethod(practice.orgTenantId, 'simulated')
    const org = seedOrganization()
    const link = paymentLinkService.create({
      merchantId: org.orgTenantId,
      description: 'Invoice',
      amount: 20,
      currency: 'USD',
    })
    const initiate = jest.spyOn(ExternalActions, 'initiateEcoCashPayment')
    const controller = new PublicPaymentController()
    expect(await controller.getPaymentDetails(link.shortlinkCode)).toMatchObject({
      payment: { availableMethods: ['ecocash'] },
    })
    await expect(
      controller.initiatePublicPayment(
        link.shortlinkCode,
        {
          paymentMethod: 'simulated',
          customerMsisdn: '263770000099',
          saveToWallet: false,
        },
        { user: { tenantId: org.orgTenantId }, headers: {} } as Request,
      ),
    ).rejects.toThrow('Unknown payment method')
    expect(initiate).not.toHaveBeenCalled()
  })
})

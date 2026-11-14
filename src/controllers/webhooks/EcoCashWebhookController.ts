import axios from 'axios'
import { createHash, timingSafeEqual } from 'crypto'
import type { Request as ExRequest } from 'express'
import { Controller, Post, Route, Tags, Body, Request, Security, Header } from 'tsoa'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { paymentLinkService } from '../../services/PaymentLinkService'
import { notificationService } from '../../services/NotificationService'
import { ReconciliationService } from '../../services/ReconciliationService'
import { ShortlinkService } from '../../services/ShortlinkService'
import { triggerService } from '../../services/TriggerService'
import { billDocumentClaims, documentClaims } from '../../services/documentFacts'
import { workflowService } from '../../services/WorkflowService'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'EcoCashWebhookController' })

interface EcoCashWebhookPayload {
  paymentRequestId?: string
  status: string
  transactionId?: string
  amount?: number
  currency?: string
  sourceReference?: string
  customerMsisdn?: string
  timestamp?: string
  metadata?: any
}

function normalizeMsisdn(msisdn?: string): string | undefined {
  if (!msisdn) return undefined
  let clean = msisdn.replace(/\D/g, '')
  if (clean.startsWith('0') && clean.length === 10) {
    clean = `263${clean.slice(1)}`
  }
  return clean
}

function paymentMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try {
    return JSON.parse(String(raw)) || {}
  } catch {
    return {}
  }
}

function hashMsisdn(msisdn?: string): string | undefined {
  const normalized = normalizeMsisdn(msisdn)
  if (!normalized) return undefined
  return createHash('sha256').update(normalized.trim().toLowerCase()).digest('hex')
}

function secretMatches(expected: string, provided?: string): boolean {
  if (!provided) return false
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

@Route('webhooks')
@Tags('Webhooks')
export class EcoCashWebhookController extends Controller {
  /**
   * EcoCash webhook endpoint for payment status updates
   * This endpoint is called by EcoCash when payment status changes
   *
   * Flow on SUCCESS:
   * 1. Validate idempotency via sourceReference
   * 2. Update ack_payments record state to 'paid'
   * 3. Issue ReceiptVC (PaymentReceiptCredential)
   * 4. Send receipt to WhatsApp via WhatsAppPayloadController
   * 5. Update cart status to 'paid'
   */
  @Post('ecocash')
  public async handleEcoCashWebhook(
    @Body() payload: EcoCashWebhookPayload,
    @Header('X-API-KEY') apiKey?: string,
    @Request() request?: ExRequest,
  ): Promise<any> {
    const db = DatabaseManager.getDatabase()

    try {
      logger.info({ sourceReference: payload.sourceReference, status: payload.status }, 'Received EcoCash webhook')

      const expectedApiKey =
        process.env.ECOCASH_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'test-webhook-secret')
      if (!expectedApiKey) {
        logger.error('EcoCash webhook secret is not configured')
        this.setStatus(503)
        return { error: 'Webhook authentication is unavailable' }
      }
      if (!secretMatches(expectedApiKey, apiKey)) {
        logger.warn({ sourceReference: payload.sourceReference }, 'Invalid webhook API key')
        this.setStatus(401)
        return { error: 'Unauthorized' }
      }

      if (!payload.sourceReference?.trim()) {
        this.setStatus(400)
        return { error: 'Payment source reference is required' }
      }

      // Idempotency check: Look up payment by sourceReference
      const existingPayment = db
        .prepare(
          `
                SELECT * FROM ack_payments WHERE idempotency_key = ? OR payment_request_token = ?
            `,
        )
        .get(payload.sourceReference, payload.sourceReference) as any

      const hasReceipt =
        existingPayment?.state === 'paid' &&
        Boolean(db.prepare('SELECT 1 FROM ack_payment_receipts WHERE payment_id = ? LIMIT 1').get(existingPayment.id))
      if (hasReceipt) {
        logger.info({ sourceReference: payload.sourceReference }, 'Payment already processed (idempotency check)')
        return {
          status: 'acknowledged',
          receiptGenerated: false,
          reason: 'Payment already processed',
        }
      }

      if (!existingPayment) {
        this.setStatus(404)
        return { error: 'No initiated payment matches this source reference' }
      }

      if (
        payload.amount !== undefined &&
        (!Number.isFinite(payload.amount) ||
          Math.round(Number(existingPayment.amount) * 100) !== Math.round(payload.amount * 100))
      ) {
        this.setStatus(409)
        return { error: 'Webhook amount does not match the initiated payment' }
      }
      if (
        payload.currency &&
        String(existingPayment.currency || '')
          .trim()
          .toUpperCase() !== payload.currency.trim().toUpperCase()
      ) {
        this.setStatus(409)
        return { error: 'Webhook currency does not match the initiated payment' }
      }

      // Check if payment was successful
      if (payload.status === 'SUCCESS' || payload.status === 'COMPLETED') {
        if (!payload.transactionId?.trim()) {
          this.setStatus(400)
          return { error: 'Provider transaction ID is required for a successful payment' }
        }
        logger.info({ sourceReference: payload.sourceReference }, 'Payment successful, processing receipt')

        const apiKey = process.env.ISSUER_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'test-api-key-12345')
        if (!apiKey) {
          this.setStatus(503)
          return { error: 'Credential issuer authentication is unavailable' }
        }
        const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
        const baseUrl = process.env.NGROK_URL || 'http://localhost:3000'
        const metadata = paymentMetadata(existingPayment?.metadata)
        const merchantTenantId =
          typeof metadata.merchantTenantId === 'string' ? metadata.merchantTenantId : existingPayment.tenant_id
        if (typeof merchantTenantId !== 'string' || !merchantTenantId.trim()) {
          this.setStatus(409)
          return { error: 'Initiated payment has no merchant identity' }
        }
        const merchant = getTenantById(merchantTenantId)
        if (!merchant?.issuerDid) {
          this.setStatus(409)
          return { error: 'Merchant issuer identity is unavailable for the receipt' }
        }
        const merchantName = String(metadata.merchantName || merchant?.label || merchantTenantId)
        const tenantId = merchantTenantId

        // Get cart if we have a payment record
        let cartId: string | undefined
        let cart: any
        if (existingPayment?.cart_id) {
          cartId = existingPayment.cart_id
          cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId)
        }

        // Issue PaymentReceipt (ReceiptVC) - uses modelRegistry registered type
        try {
          // Audit Trail: Link to InvoiceVC
          const invoiceId = existingPayment?.invoice_id
          const invoiceHash = existingPayment?.invoice_hash
          const previousRecordHash = invoiceHash // Chain link

          const payerPhone = payload.customerMsisdn || existingPayment?.payer_phone
          const subjectHash = hashMsisdn(payerPhone)
          const paidAt = new Date().toISOString()
          const baseReceipt = {
            receiptId: `RCPT-${String(payload.transactionId)
              .replace(/[^A-Za-z0-9]/g, '')
              .slice(0, 16)
              .toUpperCase()}`,
            transactionId: payload.transactionId,
            paymentRef: payload.transactionId,
            amount: String(payload.amount || existingPayment?.amount || '0'),
            currency: payload.currency || existingPayment?.currency || 'USD',
            payerPhone,
            subjectHash,
            merchant: merchantTenantId,
            merchantName,
            merchantDid: merchant?.issuerDid || undefined,
            cartId: cartId,
            invoiceId: invoiceId,
            invoiceRef: invoiceId,
            invoiceHash: invoiceHash,
            previousRecordHash: previousRecordHash,
            paymentMethod: 'EcoCash',
            paidAt,
            timestamp: paidAt,
          }
          const billLink =
            typeof metadata.paymentLinkId === 'string'
              ? (db
                  .prepare('SELECT merchant_id, sector, metadata, created_at FROM payment_links WHERE id = ?')
                  .get(metadata.paymentLinkId) as
                  | { merchant_id: string; sector?: string; metadata?: string; created_at?: string }
                  | undefined)
              : undefined
          const receiptClaims = billLink
            ? billDocumentClaims('ReceiptVC', billLink, baseReceipt)
            : documentClaims('ReceiptVC', baseReceipt, merchantTenantId)

          const receiptResponse = await axios.post(
            `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
            {
              credentials: [
                {
                  // Use ReceiptVC which is configured in issuer metadata
                  credentialDefinitionId: 'ReceiptVC',
                  format: 'jwt_vc_json',
                  type: ['VerifiableCredential', 'ReceiptVC'],
                  claims: receiptClaims,
                },
              ],
            },
            {
              headers: {
                'x-api-key': apiKey,
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json',
              },
            },
          )

          // Extract offer URL from various possible field names
          const receiptOfferUrl =
            receiptResponse.data?.credential_offer_url ||
            receiptResponse.data?.credential_offer_uri ||
            receiptResponse.data?.offerUrl ||
            receiptResponse.data?.credentialOffer
          if (typeof receiptOfferUrl !== 'string' || !receiptOfferUrl.trim()) {
            throw new Error('Credential issuer returned no receipt offer URL')
          }
          logger.info({ transactionId: payload.transactionId }, 'ReceiptVC issued')

          // Generate verification shortlink (QR)
          const { url: verificationUrl, code: verificationCode } = ShortlinkService.createReceiptLink(
            payload.transactionId || 'unknown',
            {
              amount: String(payload.amount || existingPayment?.amount || '0'),
              currency: payload.currency || existingPayment?.currency || 'USD',
              merchant: merchantTenantId,
            },
          )
          logger.info({ transactionId: payload.transactionId }, 'Generated receipt verification link')

          // Paid state and receipt are written together so a failed write can be retried safely.
          const issuedAt = new Date().toISOString()
          db.transaction(() => {
            db.prepare(
              `
                            UPDATE ack_payments
                            SET state = 'paid', provider_ref = ?, updated_at = ?
                            WHERE id = ?
                        `,
            ).run(payload.transactionId, issuedAt, existingPayment.id)
            db.prepare(
              `
                            INSERT INTO ack_payment_receipts (id, payment_id, credential_offer_url, credential_type, issued_at)
                            VALUES (?, ?, ?, ?, ?)
                        `,
            ).run(`rcp-${Date.now()}`, existingPayment.id, receiptOfferUrl, 'PaymentReceipt', issuedAt)
          })()

          const paymentLinkId = paymentMetadata(existingPayment.metadata).paymentLinkId
          if (typeof paymentLinkId === 'string') {
            try {
              await paymentLinkService.settlePaid(paymentLinkId, {
                reference: payload.transactionId,
                payerPhone: existingPayment.payer_phone,
              })
            } catch (settleErr: any) {
              logger.warn({ paymentLinkId, error: settleErr?.message }, 'Paid link did not continue its job')
            }
          }

          // Update cart status to 'paid' if associated
          if (cartId) {
            try {
              db.prepare(
                `
                                 UPDATE carts 
                                 SET status = 'paid', updated_at = ?
                                 WHERE id = ?
                             `,
              ).run(new Date().toISOString(), cartId)
              logger.info({ cartId }, 'Cart status updated to paid')
            } catch (e) {
              logger.warn({ error: e instanceof Error ? e.message : String(e) }, 'Failed to update cart status')
            }
          }

          if (payload.transactionId) {
            const linkMeta = billLink ? paymentMetadata(billLink.metadata) : {}
            // A job's bill is on the job's own trail (ClientPaymentActions); only standalone payments land here.
            if (!linkMeta.workflowRunId) {
              const originalLinkId = typeof metadata.paymentLinkId === 'string' ? metadata.paymentLinkId : undefined
              let linkId = originalLinkId
              if (!linkId && cartId && merchantTenantId) {
                let basket: any[] = []
                try {
                  basket = JSON.parse(cart?.items || '[]')
                } catch {
                  basket = []
                }
                const description = Array.isArray(basket)
                  ? basket
                      .map((item) => {
                        const title = item && typeof item.title === 'string' ? item.title : 'Item'
                        const qty = Number(item?.quantity || item?.qty || 1)
                        return `${qty} x ${title}`
                      })
                      .filter(Boolean)
                      .join(', ')
                  : ''
                linkId = await paymentLinkService
                  .recordPaidCart({
                    merchantId: merchantTenantId,
                    cartId,
                    amount: Number(payload.amount || existingPayment?.amount || cart?.total || 0),
                    currency: payload.currency || existingPayment?.currency || cart?.currency || 'USD',
                    payerPhone,
                    providerRef: String(payload.transactionId),
                    description: description || 'Shop purchase',
                  })
                  .catch((err: any) => {
                    logger.warn({ error: err?.message, cartId }, 'Paid basket not added to Money in')
                    return undefined
                  })
              }
              const settled = linkId
                ? Boolean(
                    db
                      .prepare(
                        `SELECT 1 FROM settlement_allocations WHERE settlement_type = 'payment_link' AND settlement_id = ? AND status = 'applied' LIMIT 1`,
                      )
                      .get(linkId),
                  )
                : false
              new ReconciliationService().recordPaidCheckout(String(payload.transactionId), {
                tenantId: merchantTenantId,
                amount: Number(payload.amount || existingPayment?.amount || 0),
                currency: payload.currency || existingPayment?.currency || 'USD',
                linkId,
                cartId,
                receiptId: baseReceipt.receiptId,
                settled,
                kind: linkMeta.arModule ? 'payment_request' : linkId ? 'pay_link' : 'cart',
                ...(linkMeta.arModule ? { deliveryRequired: false } : {}),
              })
              // A basket already sends its own receipt below. This alert is only for a pay link
              // that existed before the basket was written, and only if the payer opted in.
              if (originalLinkId && payerPhone) {
                const linkRow = db.prepare('SELECT description FROM payment_links WHERE id = ?').get(linkId) as
                  | { description?: string }
                  | undefined
                const paid = Number(payload.amount || existingPayment?.amount || 0).toFixed(2)
                const currency = payload.currency || existingPayment?.currency || 'USD'
                const forWhat = linkRow?.description ? ` for ${linkRow.description}` : ''
                notificationService
                  .sendWhatsAppText({
                    to: payerPhone,
                    body: `Receipt: ${merchantName} received your payment of ${currency} ${paid}${forWhat}. Reference ${payload.transactionId}.`,
                    actionUrl: verificationUrl,
                    tenantId: merchantTenantId,
                    eventType: 'payment_link',
                    dedupeKey: `receipt:${payload.transactionId}`,
                  })
                  .catch((err: any) => logger.warn({ error: err?.message, linkId }, 'Receipt WhatsApp not queued'))
              }
            }
          }

          // Send receipt to WhatsApp if we have a cart with buyer phone
          if (cartId && receiptOfferUrl) {
            try {
              await axios.post(
                `${baseUrl}/api/wa/cart/${cartId}/send-receipt`,
                {
                  receiptOfferUrl,
                  transactionId: payload.transactionId,
                  verificationUrl,
                  verificationCode,
                },
                { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
              )
              logger.info({ cartId }, 'Receipt sent to WhatsApp')
            } catch (waErr: any) {
              logger.warn({ error: waErr.message }, 'Failed to send receipt to WhatsApp')
            }
          }

          // Also execute the workflow for any additional actions
          try {
            await workflowService.executeWorkflow(
              'finance-receipt-v1',
              {
                transactionId: payload.transactionId,
                amount: payload.amount,
                currency: payload.currency || 'USD',
                sourceReference: payload.sourceReference,
                paymentRequestId: payload.paymentRequestId,
                cartId: cartId,
                receiptOfferUrl,
                metadata: payload.metadata,
              },
              'default',
            )
          } catch (workflowErr: any) {
            logger.warn({ error: workflowErr.message }, 'Workflow execution failed (non-critical)')
          }

          // Emit payment.completed event to trigger any listening workflows
          try {
            await triggerService.emitEvent(
              'payment.completed',
              {
                transactionId: payload.transactionId,
                amount: payload.amount,
                currency: payload.currency || 'USD',
                sourceReference: payload.sourceReference,
                paymentMethod: 'EcoCash',
                cartId: cartId,
                merchantId: merchantTenantId,
                receiptOfferUrl,
                timestamp: new Date().toISOString(),
              },
              'ecocash-webhook',
            )
          } catch (eventErr: any) {
            logger.warn({ error: eventErr.message }, 'Event emission failed (non-critical)')
          }

          return {
            status: 'acknowledged',
            receiptGenerated: true,
            receiptOfferUrl,
            transactionId: payload.transactionId,
          }
        } catch (receiptError: any) {
          logger.error(
            { sourceReference: payload.sourceReference, error: receiptError.message },
            'Failed to issue ReceiptVC',
          )
          this.setStatus(503)
          return {
            status: 'retry',
            receiptGenerated: false,
            error: 'Receipt issuance failed; retry the webhook',
          }
        }
      } else if (payload.status === 'FAILED' || payload.status === 'CANCELLED') {
        // Update payment record to failed state
        if (existingPayment) {
          db.prepare(
            `
                        UPDATE ack_payments 
                        SET state = 'failed', updated_at = ?
                        WHERE id = ?
                    `,
          ).run(new Date().toISOString(), existingPayment.id)
        }

        logger.info({ status: payload.status }, 'Payment failed/cancelled')
        return {
          status: 'acknowledged',
          receiptGenerated: false,
          reason: `Payment status is ${payload.status}`,
        }
      } else {
        logger.info({ status: payload.status }, 'Payment pending, no action taken')
        return {
          status: 'acknowledged',
          receiptGenerated: false,
          reason: `Payment status is ${payload.status}`,
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Webhook processing error')
      this.setStatus(500)
      return { error: error.message }
    }
  }
}

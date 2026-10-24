/**
 * PublicPaymentController — Public checkout pages
 *
 * GET  /{code}     — Unauthenticated: resolves a payment link for the checkout UI
 * POST /{code}/decline — Unauthenticated: the client turns down a quote link
 * POST /{code}/pay — AUTHENTICATED: initiates payment. Requires JWT so that every
 *                    transaction is linked to a registered user's wallet tenant.
 *                    This ensures VCs are immediately visible in the payer's wallet
 *                    and all payments are auditable per SSI trust principles.
 *
 * @module controllers/public/PublicPaymentController
 */

import { Controller, Get, Post, Route, Tags, Path, Body, Security, Request } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { SCOPES } from '../../enums'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { paymentLinkService } from '../../services/PaymentLinkService'
import { ShortlinkService } from '../../services/ShortlinkService'
import { ExternalActions } from '../../services/workflow/actions/ExternalActions'
import { orgSetupProvisioningService } from '../../services/OrgSetupProvisioningService'
import { WorkflowTemplateRepository } from '../../persistence/WorkflowTemplateRepository'
import { rootLogger } from '../../utils/pinoLogger'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { resolveConfiguredBaseUrl } from '../../utils/baseUrl'
import { getEcoCashWebhookSecret, getIssuerApiKey } from '../../utils/serviceApiKey'
import axios from 'axios'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const logger = rootLogger.child({ module: 'PublicPaymentController' })
const templateRepo = new WorkflowTemplateRepository()

interface MerchantBranding {
  logo?: string
  primaryColor?: string
  receiptFooter?: string
  supportContact?: string
}

interface PublicPaymentMethod {
  providerId: string
  providerName: string
  type: 'ussd' | 'redirect' | 'other'
  logo?: string
}

interface PublicPaymentDetails {
  linkId: string
  description: string
  amount: number
  currency: string
  merchantName?: string
  status: string
  invoiceRef?: string
  sector?: string
  availableMethods: string[]
  availableMethodDetails?: PublicPaymentMethod[]
  providerRef?: string
  paidAt?: string
  branding?: MerchantBranding
  kind?: 'quote' | 'invoice'
}

interface RefreshedPaymentLinkResponse {
  refreshed: true
  linkId: string
  invoiceRef?: string
  code: string
  url: string
  expiresAt: string
}

interface InitiatePublicPaymentBody {
  paymentMethod: string // 'ecocash' | 'clicknpay' | 'simulated'
  customerMsisdn: string // Required for all methods — links payment to wallet and enables VC issuance
  saveToWallet?: boolean // Default true — whether to issue InvoiceVC + ReceiptVC to the payer's wallet
}

interface CreateStorefrontCheckoutLinkBody {
  orgId?: string
  merchantId?: string
  productId?: string
  serviceId?: string
  quantity?: number
}

interface StorefrontCheckoutLinkResponse {
  linkId: string
  code: string
  url: string
  expiresAt: string
  amount: number
  currency: string
  description: string
}

type PaymentSector = 'education' | 'ecommerce' | 'general'

interface PaymentLinkRow {
  id: string
  merchant_id: string
  merchant_name?: string | null
  description: string
  amount: number
  currency: string
  invoice_ref?: string | null
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  sector?: string | null
  shortlink_code?: string | null
  shortlink_url?: string | null
  expiry?: string | null
  paid_at?: string | null
  provider_ref?: string | null
  payer_phone?: string | null
  metadata?: string | null
}

/** 'quote' links can be declined; 'invoice' links bill work already done. Merchant links have no kind. */
function linkKind(row: PaymentLinkRow): 'quote' | 'invoice' | undefined {
  try {
    const kind = JSON.parse(row.metadata || '{}')?.kind
    return kind === 'quote' || kind === 'invoice' ? kind : undefined
  } catch {
    return undefined
  }
}

interface BrandingPolicy {
  logo?: string
  primaryColor?: string
  receiptFooter?: string
  supportContact?: string
}

interface WorkflowTemplateRow {
  brandingPolicy?: BrandingPolicy | null
}

interface AuthenticatedPublicRequest extends ExRequest {
  user?: {
    tenantId?: string
    walletId?: string
  }
}

function getLegacyPaymentAttemptKey(linkId: string, paymentMethod: string): string {
  return `paylink-${linkId}-${paymentMethod}`
}

function getPaymentAttemptKey(row: { id: string; shortlink_code?: string | null }, paymentMethod: string): string {
  const attemptToken = row.shortlink_code || row.id
  return `paylink:${row.id}:${attemptToken}:${paymentMethod}`
}

const PAYMENT_METHODS: PublicPaymentMethod[] = [{ providerId: 'ecocash', providerName: 'EcoCash', type: 'ussd' }]

function normalizeSector(raw: unknown): PaymentSector {
  const candidate = String(raw || '').toLowerCase()
  if (candidate === 'education' || candidate === 'ecommerce' || candidate === 'general') {
    return candidate
  }
  return 'general'
}

@Route('api/public/pay')
@Tags('Public Checkout')
export class PublicPaymentController extends Controller {
  private paymentMethods(merchantId: string): PublicPaymentMethod[] {
    const active = orgSetupProvisioningService.listPaymentSetup(merchantId).filter((item) => item.status === 'active')
    const selected = active.find((item) => item.isDefault) || active[0]
    if (selected?.simulated) {
      return [{ providerId: 'simulated', providerName: 'Simulated pay — no real money moves', type: 'other' }]
    }
    return PAYMENT_METHODS
  }

  private readOfferField(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object') return undefined
    const obj = value as Record<string, unknown>
    const field = obj[key]
    return typeof field === 'string' ? field : undefined
  }

  private extractOfferUri(payload: Record<string, unknown>): string | null {
    const direct = (payload?.offerUrl ||
      payload?.credentialOffer ||
      payload?.credential_offer_uri ||
      payload?.credential_offer_url) as string | undefined
    if (direct && typeof direct === 'string' && direct.trim().length > 0) {
      return direct.trim()
    }

    const credentialOffer = payload?.credentialOffer
    const nested =
      this.readOfferField(credentialOffer, 'credential_offer_uri') ||
      this.readOfferField(credentialOffer, 'credential_offer_url') ||
      this.readOfferField(credentialOffer, 'offerUrl')
    if (typeof nested === 'string' && nested.trim().length > 0) {
      return nested.trim()
    }

    return null
  }

  private async queueStorefrontCredentialOffers(params: {
    db: ReturnType<typeof DatabaseManager.getDatabase>
    row: PaymentLinkRow
    payerTenantId: string
    payerPhone: string
  }): Promise<void> {
    const { db, row, payerTenantId, payerPhone } = params

    const issuerApiUrl = resolveConfiguredBaseUrl(
      [
        process.env.ISSUER_API_URL,
        process.env.PUBLIC_BASE_URL,
        process.env.BACKEND_BASE_URL,
        process.env.APP_EXTERNAL_URL,
        process.env.NGROK_URL,
      ],
      'Issuer API base URL',
    )
    const apiKey = getIssuerApiKey()

    const merchantName = row.merchant_name || 'Organization'
    const invoiceRef = row.invoice_ref || `INV-${String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const quoteRef = `QTE-${String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const quoteClaims = {
      quoteId: quoteRef,
      cartId: row.id,
      merchantName,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      buyerPhone: payerPhone,
      validUntil: row.expiry || new Date(Date.now() + 7 * 86400000).toISOString(),
      timestamp: new Date().toISOString(),
    }

    const invoiceClaims = {
      invoiceId: invoiceRef,
      cartRef: row.id,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      paymentUrl: row.shortlink_url,
      dueDate: row.expiry || new Date(Date.now() + 7 * 86400000).toISOString(),
      timestamp: new Date().toISOString(),
    }

    const [quoteResponse, invoiceResponse] = await Promise.all([
      linkKind(row) === 'invoice'
        ? Promise.resolve({ data: {} })
        : axios.post(
            `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
            {
              credentials: [
                {
                  credentialDefinitionId: 'QuoteVC',
                  format: 'jwt_vc_json',
                  type: ['VerifiableCredential', 'QuoteVC'],
                  claims: quoteClaims,
                },
              ],
            },
            {
              headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
              },
            },
          ),
      axios.post(
        `${issuerApiUrl}/custom-oidc/issuer/credential-offers`,
        {
          credentials: [
            {
              credentialDefinitionId: 'InvoiceVC',
              format: 'jwt_vc_json',
              type: ['VerifiableCredential', 'InvoiceVC'],
              claims: invoiceClaims,
            },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      ),
    ])

    const quoteOfferUri = this.extractOfferUri(quoteResponse.data || {})
    const invoiceOfferUri = this.extractOfferUri(invoiceResponse.data || {})
    const now = new Date().toISOString()

    if (quoteOfferUri) {
      db.prepare(
        `
                INSERT INTO wallet_pending_offers (
                  id, tenant_id, issuer_tenant_id, contact_id, source_type, source_id,
                  credential_type, offer_uri, title, body, metadata, created_at
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                  SELECT 1 FROM wallet_pending_offers
                  WHERE tenant_id = ?
                    AND source_type = 'quote_offer'
                    AND source_id = ?
                    AND credential_type = 'QuoteVC'
                    AND resolved_at IS NULL
                )
            `,
      ).run(
        uuidv4(),
        payerTenantId,
        row.merchant_id,
        null,
        'quote_offer',
        row.id,
        'QuoteVC',
        quoteOfferUri,
        'Quote Available',
        `A quote is available for ${row.description}`,
        JSON.stringify({
          paymentLinkId: row.id,
          quoteId: quoteRef,
          amount: row.amount,
          currency: row.currency,
          merchantName,
        }),
        now,
        payerTenantId,
        row.id,
      )
    }

    if (invoiceOfferUri) {
      db.prepare(
        `
                INSERT INTO wallet_pending_offers (
                  id, tenant_id, issuer_tenant_id, contact_id, source_type, source_id,
                  credential_type, offer_uri, title, body, metadata, created_at
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                  SELECT 1 FROM wallet_pending_offers
                  WHERE tenant_id = ?
                    AND source_type = 'invoice_offer'
                    AND source_id = ?
                    AND credential_type = 'InvoiceVC'
                    AND resolved_at IS NULL
                )
            `,
      ).run(
        uuidv4(),
        payerTenantId,
        row.merchant_id,
        null,
        'invoice_offer',
        invoiceRef,
        'InvoiceVC',
        invoiceOfferUri,
        'Invoice Available',
        `An invoice is ready for ${row.description}`,
        JSON.stringify({
          paymentLinkId: row.id,
          invoiceRef,
          amount: row.amount,
          currency: row.currency,
          merchantName,
          paymentUrl: row.shortlink_url,
        }),
        now,
        payerTenantId,
        invoiceRef,
      )
    }
  }

  private parsePositiveQuantity(raw: unknown): number {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) return 1
    return Math.max(1, Math.floor(parsed))
  }

  private resolveOrgRecord(params: {
    db: ReturnType<typeof DatabaseManager.getDatabase>
    orgId?: string
  }): { id: string; tenant_id: string; display_name?: string; is_public?: number } | undefined {
    const orgId = String(params.orgId || '').trim()
    if (!orgId) return undefined

    const byOrgId = params.db
      .prepare(`SELECT id, tenant_id, display_name, is_public FROM organization_registry WHERE id = ? LIMIT 1`)
      .get(orgId) as { id: string; tenant_id: string; display_name?: string; is_public?: number } | undefined
    if (byOrgId) return byOrgId

    return params.db
      .prepare(`SELECT id, tenant_id, display_name, is_public FROM organization_registry WHERE tenant_id = ? LIMIT 1`)
      .get(orgId) as { id: string; tenant_id: string; display_name?: string; is_public?: number } | undefined
  }

  private resolvePaymentLinkRow(code: string): PaymentLinkRow | null {
    const db = DatabaseManager.getDatabase()

    const resolved = ShortlinkService.resolve(code)
    let paymentLinkId: string | null = null

    if (resolved && resolved.type === 'payment') {
      paymentLinkId = resolved.targetId
    } else {
      const directRow = db
        .prepare(`SELECT id FROM payment_links WHERE id = ? OR shortlink_code = ?`)
        .get(code, code) as { id: string } | undefined
      if (directRow) {
        paymentLinkId = directRow.id
      }
    }

    if (!paymentLinkId) {
      return null
    }

    return (
      (db.prepare(`SELECT * FROM payment_links WHERE id = ?`).get(paymentLinkId) as PaymentLinkRow | undefined) || null
    )
  }

  /**
   * Create a public checkout link from a published storefront item/service.
   * This is buyer-facing and does not require org context.
   */
  @Post('storefront/checkout-link')
  public async createStorefrontCheckoutLink(
    @Body() body: CreateStorefrontCheckoutLinkBody,
  ): Promise<StorefrontCheckoutLinkResponse> {
    const db = DatabaseManager.getDatabase()

    const quantity = this.parsePositiveQuantity(body.quantity)
    const hasProduct = !!String(body.productId || '').trim()
    const hasService = !!String(body.serviceId || '').trim()
    if (!hasProduct && !hasService) {
      this.setStatus(400)
      throw new Error('productId or serviceId is required')
    }

    const org = this.resolveOrgRecord({ db, orgId: body.orgId })
    let merchantId = String(body.merchantId || '').trim()
    if (!merchantId && org?.tenant_id) {
      merchantId = org.tenant_id
    }

    if (!merchantId) {
      this.setStatus(400)
      throw new Error('merchantId or orgId is required')
    }

    let orgId = org?.id
    let merchantName = org?.display_name || undefined
    if (!orgId) {
      const byTenant = db
        .prepare(`SELECT id, display_name FROM organization_registry WHERE tenant_id = ? LIMIT 1`)
        .get(merchantId) as { id: string; display_name?: string } | undefined
      orgId = byTenant?.id
      merchantName = merchantName || byTenant?.display_name || undefined
    }

    let amount = 0
    let currency = 'USD'
    let description = ''
    let invoiceRef = ''

    if (hasProduct) {
      const productId = String(body.productId || '').trim()
      const item = db
        .prepare(
          `SELECT id, merchant_id, title, price, currency FROM catalog_items WHERE id = ? AND merchant_id = ? LIMIT 1`,
        )
        .get(productId, merchantId) as
        | { id: string; merchant_id: string; title: string; price: number; currency?: string }
        | undefined

      if (!item) {
        this.setStatus(404)
        throw new Error('Catalog item not found for this storefront')
      }

      amount = Number(item.price || 0) * quantity
      currency = String(item.currency || 'USD').toUpperCase()
      description = quantity > 1 ? `${item.title} x${quantity}` : item.title
      invoiceRef = `CAT-${item.id}`
    } else {
      const serviceId = String(body.serviceId || '').trim()
      if (!orgId) {
        this.setStatus(400)
        throw new Error('orgId is required for service checkout')
      }

      const service = db
        .prepare(
          `SELECT id, name, fee_amount, fee_currency, is_active FROM service_catalog WHERE id = ? AND org_id = ? LIMIT 1`,
        )
        .get(serviceId, orgId) as
        | { id: string; name: string; fee_amount?: number; fee_currency?: string; is_active?: number }
        | undefined

      if (!service || service.is_active === 0) {
        this.setStatus(404)
        throw new Error('Service not found or inactive for this storefront')
      }

      const unitFee = Number(service.fee_amount || 0)
      if (unitFee <= 0) {
        this.setStatus(409)
        throw new Error('This service does not require paid checkout')
      }

      amount = unitFee * quantity
      currency = String(service.fee_currency || 'USD').toUpperCase()
      description = quantity > 1 ? `${service.name} x${quantity}` : service.name
      invoiceRef = `SVC-${service.id}`
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      this.setStatus(400)
      throw new Error('Invalid checkout amount')
    }

    const wfTemplate = db
      .prepare(
        `SELECT sector FROM workflow_templates WHERE tenant_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(merchantId) as { sector?: string } | undefined
    const sector = normalizeSector(wfTemplate?.sector)

    const id = uuidv4()
    const ttlHours = 72
    const link = ShortlinkService.createPaymentLink(
      id,
      {
        amount,
        currency,
        description,
        merchantName,
        sector,
      },
      ttlHours,
    )

    const now = new Date().toISOString()
    const expiry = new Date(Date.now() + ttlHours * 3600_000).toISOString()

    db.prepare(
      `INSERT INTO payment_links (
                id, merchant_id, merchant_name, description, amount, currency, invoice_ref,
                status, expiry, sector, shortlink_code, shortlink_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      merchantId,
      merchantName || null,
      description,
      amount,
      currency,
      invoiceRef,
      expiry,
      sector,
      link.code,
      link.url,
      now,
      now,
    )

    logger.info(
      { linkId: id, merchantId, orgId, invoiceRef, amount, currency },
      'Created public storefront checkout link',
    )

    return {
      linkId: id,
      code: link.code,
      url: link.url,
      expiresAt: link.expiresAt,
      amount,
      currency,
      description,
    }
  }

  /**
   * Resolve a payment link shortcode and return checkout details.
   * This is the public endpoint — no authentication required.
   * Called by the public /pay/[code] checkout page on load.
   */
  @Get('{code}')
  public async getPaymentDetails(
    @Path() code: string,
  ): Promise<{ found: true; payment: PublicPaymentDetails } | { found: false; error: string }> {
    const db = DatabaseManager.getDatabase()

    const row = this.resolvePaymentLinkRow(code)
    if (!row) {
      this.setStatus(404)
      return { found: false, error: 'Payment link not found or has expired' }
    }

    // Self-heal stale link state: if payment_links stayed active but ACK records
    // already show a paid transaction for this link, mark it paid and stop checkout.
    const paidAck = db
      .prepare(
        `SELECT provider_ref, payer_phone, updated_at
             FROM ack_payments
             WHERE state = 'paid'
               AND idempotency_key LIKE ?
             ORDER BY updated_at DESC
             LIMIT 1`,
      )
      .get(`paylink-${row.id}-%`) as { provider_ref?: string; payer_phone?: string; updated_at?: string } | undefined

    if (paidAck && row.status === 'active') {
      const now = new Date().toISOString()
      await paymentLinkService.settlePaid(row.id, {
        paidAt: paidAck.updated_at || now,
        reference: paidAck.provider_ref,
        payerPhone: paidAck.payer_phone,
      })

      row.status = 'paid'
      row.provider_ref = row.provider_ref || paidAck.provider_ref || null
      row.paid_at = row.paid_at || paidAck.updated_at || now
    }

    // Paid links: show deterministic paid/consumed state with reference.
    if (row.status === 'paid') {
      return {
        found: true,
        payment: {
          linkId: row.id,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          merchantName: row.merchant_name || undefined,
          status: 'paid',
          invoiceRef: row.invoice_ref || undefined,
          sector: row.sector || 'general',
          availableMethods: [],
          providerRef: row.provider_ref || undefined,
          paidAt: row.paid_at || undefined,
          kind: linkKind(row),
        },
      }
    }

    if (row.status === 'cancelled') {
      this.setStatus(410)
      return {
        found: false,
        error: linkKind(row) === 'quote' ? 'This quote was declined' : 'Payment link is cancelled',
      }
    }

    // Also check expiry (belt and braces — shortlink may still resolve but link expired)
    if (row.expiry && new Date(row.expiry) < new Date()) {
      // Mark as expired
      db.prepare(`UPDATE payment_links SET status = 'expired' WHERE id = ?`).run(row.id)
      this.setStatus(410)
      return { found: false, error: 'Payment link has expired' }
    }

    const methods = this.paymentMethods(row.merchant_id)

    // Look up merchant branding from their workflow template
    let branding: MerchantBranding | undefined
    if (row.merchant_id) {
      const templates = templateRepo.listByTenantId(row.merchant_id) as WorkflowTemplateRow[]
      if (templates.length > 0 && templates[0].brandingPolicy) {
        const bp = templates[0].brandingPolicy
        branding = {
          logo: bp.logo || undefined,
          primaryColor: bp.primaryColor || undefined,
          receiptFooter: bp.receiptFooter || undefined,
          supportContact: bp.supportContact || undefined,
        }
      }
    }

    logger.info({ linkId: row.id, code }, 'Public checkout page resolved')

    return {
      found: true,
      payment: {
        linkId: row.id,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        merchantName: row.merchant_name || undefined,
        status: row.status,
        invoiceRef: row.invoice_ref || undefined,
        sector: row.sector || 'general',
        availableMethods: methods.map((m) => m.providerId),
        availableMethodDetails: methods,
        providerRef: row.provider_ref || undefined,
        paidAt: row.paid_at || undefined,
        branding,
        kind: linkKind(row),
      },
    }
  }

  /**
   * The client turns down a quote. Public like the details page: whoever holds the link
   * received the quote. Only quote links can be declined, and not once paid.
   */
  @Post('{code}/decline')
  public async declineQuote(@Path() code: string): Promise<{ declined: boolean; message: string }> {
    const row = this.resolvePaymentLinkRow(code)
    if (!row) {
      this.setStatus(404)
      throw new Error('Payment link not found or expired')
    }
    if (linkKind(row) !== 'quote') {
      this.setStatus(400)
      throw new Error('Only a quote can be declined')
    }
    if (row.status === 'cancelled') return { declined: true, message: 'Quote declined' }
    if (row.status !== 'active') {
      this.setStatus(409)
      throw new Error(`This quote is ${row.status}`)
    }
    await paymentLinkService.decline(row.id, 'The client declined the quote')
    return { declined: true, message: 'Quote declined' }
  }

  @Post('{code}/refresh')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async refreshExpiredPaymentLink(
    @Path() code: string,
    @Request() request: ExRequest,
  ): Promise<RefreshedPaymentLinkResponse> {
    const authRequest = request as AuthenticatedPublicRequest
    const payerTenantId = authRequest.user?.tenantId || authRequest.user?.walletId
    if (!payerTenantId) {
      this.setStatus(401)
      throw new Error('Authentication required to refresh a payment link')
    }
    const db = DatabaseManager.getDatabase()
    const row = this.resolvePaymentLinkRow(code)

    if (!row) {
      this.setStatus(404)
      throw new Error('Payment link not found')
    }

    const idempotencyAction = `public-pay-refresh:${row.id}:${row.shortlink_code || row.id}`
    const idempotencyCheck = IdempotencyGuard.guard(db, request, payerTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    if (row.status === 'paid') {
      this.setStatus(409)
      throw new Error('Payment link is already paid and cannot be refreshed')
    }

    if (row.status === 'cancelled') {
      this.setStatus(409)
      throw new Error('Payment link is cancelled and cannot be refreshed')
    }

    const pendingAttempt = db
      .prepare(
        `SELECT id FROM ack_payments
             WHERE state = 'pending'
               AND (idempotency_key LIKE ? OR idempotency_key LIKE ?)
             ORDER BY created_at DESC
             LIMIT 1`,
      )
      .get(`paylink:${row.id}:%`, `paylink-${row.id}-%`) as { id: string } | undefined

    if (pendingAttempt?.id) {
      this.setStatus(409)
      throw new Error(
        'A payment attempt is already pending for this invoice. Complete or cancel that attempt before refreshing the link.',
      )
    }

    const refreshed = ShortlinkService.createPaymentLink(
      row.id,
      {
        amount: row.amount,
        currency: row.currency,
        description: row.description,
        merchantName: row.merchant_name || undefined,
        sector: row.sector || 'general',
      },
      72,
    )

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(
        `UPDATE payment_links
                 SET status = 'active',
                     expiry = ?,
                     shortlink_code = ?,
                     shortlink_url = ?,
                     updated_at = ?
                 WHERE id = ?`,
      ).run(refreshed.expiresAt, refreshed.code, refreshed.url, now, row.id)

      db.prepare(
        `UPDATE wallet_pending_offers
                 SET offer_uri = ?,
                     metadata = CASE WHEN json_valid(metadata)
                       THEN json_set(metadata, '$.shortlinkCode', ?, '$.shortlinkUrl', ?, '$.expiresAt', ?)
                       ELSE metadata END,
                     last_attempt_at = ?,
                     last_error = NULL
                 WHERE source_type = 'payment_link'
                   AND source_id = ?
                   AND tenant_id = ?
                   AND resolved_at IS NULL`,
      ).run(refreshed.url, refreshed.code, refreshed.url, refreshed.expiresAt, now, row.id, payerTenantId)
    })()

    logger.info(
      { linkId: row.id, invoiceRef: row.invoice_ref, payerTenantId },
      'Expired payment link refreshed for a new checkout attempt',
    )

    const response: RefreshedPaymentLinkResponse = {
      refreshed: true,
      linkId: row.id,
      invoiceRef: row.invoice_ref || undefined,
      code: refreshed.code,
      url: refreshed.url,
      expiresAt: refreshed.expiresAt,
    }

    if (idempotencyCheck.key) {
      IdempotencyGuard.record(db, idempotencyCheck.key, payerTenantId, idempotencyAction, response)
    }

    return response
  }

  /**
   * Initiate payment from the public checkout page.
   * Requires JWT auth — every payment must be linked to a registered user's wallet.
   * Delegates to the appropriate payment adapter.
   * On webhook callback, ReceiptVC is issued automatically and visible in payer's wallet.
   */
  @Post('{code}/pay')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async initiatePublicPayment(
    @Path() code: string,
    @Body() body: InitiatePublicPaymentBody,
    @Request() request: ExRequest,
  ): Promise<{
    status: string
    instructions?: string
    checkoutUrl?: string
    providerRef?: string
    message: string
  }> {
    // Extract payer's tenant from JWT — ensures payment is linked to their wallet
    const authRequest = request as AuthenticatedPublicRequest
    const payerTenantId = authRequest.user?.tenantId || authRequest.user?.walletId
    if (!payerTenantId) {
      this.setStatus(401)
      throw new Error('Authentication required to make a payment. Please log in or register first.')
    }
    // MSISDN required for all payment methods — enables VC issuance and wallet linkage
    if (!body.customerMsisdn) {
      this.setStatus(400)
      throw new Error('Mobile number (MSISDN) is required. It links your invoice and receipt to your wallet account.')
    }

    logger.info({ payerTenantId, code, msisdn: body.customerMsisdn }, 'Authenticated payment initiation')
    const db = DatabaseManager.getDatabase()

    const row = this.resolvePaymentLinkRow(code)
    if (!row) {
      this.setStatus(404)
      throw new Error('Payment link not found or expired')
    }

    const methods = this.paymentMethods(row.merchant_id)
    const method = methods.find((m) => m.providerId === body.paymentMethod)
    if (!method) {
      this.setStatus(400)
      throw new Error(`Unknown payment method. Available: ${methods.map((m) => m.providerId).join(', ')}`)
    }

    if (body.saveToWallet !== false) {
      try {
        await this.queueStorefrontCredentialOffers({
          db,
          row,
          payerTenantId,
          payerPhone: body.customerMsisdn,
        })
      } catch (error: any) {
        logger.warn(
          { error: error.message, linkId: row.id },
          'Failed to queue storefront quote/invoice offers (continuing payment flow)',
        )
      }
    }

    const idempotencyKey = getPaymentAttemptKey(row, body.paymentMethod)
    const legacyIdempotencyKey = getLegacyPaymentAttemptKey(row.id, body.paymentMethod)
    const idempotencyAction = `public-pay:${row.id}:${row.shortlink_code || row.id}:${body.paymentMethod}`

    // FEPT §8: accept idempotency keys and return stable first response on duplicate retries.
    const idempotencyCheck = IdempotencyGuard.guard(db, request, payerTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    // Idempotent replay handling: return stable outcome for repeated submissions.
    const existingPayment = db
      .prepare(
        `SELECT provider_ref, state FROM ack_payments WHERE idempotency_key IN (?, ?) ORDER BY created_at DESC LIMIT 1`,
      )
      .get(idempotencyKey, legacyIdempotencyKey) as { provider_ref?: string | null; state?: string | null } | undefined

    if (existingPayment?.provider_ref) {
      const now = new Date().toISOString()
      const replayResponse =
        existingPayment.state === 'paid'
          ? {
              status: 'success',
              providerRef: existingPayment.provider_ref,
              message: 'Payment already completed for this link and method',
            }
          : {
              status: 'pending',
              providerRef: existingPayment.provider_ref,
              message: 'Payment is already in progress for this link and method',
            }

      if (existingPayment.state === 'paid') {
        db.prepare(
          `
                    UPDATE payment_links
                    SET status = 'paid',
                        paid_at = COALESCE(paid_at, ?),
                        provider_ref = COALESCE(provider_ref, ?),
                        payer_phone = COALESCE(payer_phone, ?),
                        updated_at = ?
                    WHERE id = ?
                `,
        ).run(now, existingPayment.provider_ref, body.customerMsisdn, now, row.id)
      }

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, payerTenantId, idempotencyAction, replayResponse)
      }

      return replayResponse
    }

    if (row.status !== 'active') {
      this.setStatus(409)
      throw new Error(`Payment link is ${row.status} and cannot accept new payments`)
    }

    const invoiceId = row.invoice_ref || `INV-${String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const invoiceHash = createHash('sha256')
      .update(`${invoiceId}:${row.amount}:${row.currency}:${row.id}`)
      .digest('hex')
    db.prepare(
      `
            INSERT OR IGNORE INTO ack_payments (
                id, tenant_id, payer_phone, amount, currency, state, idempotency_key,
                invoice_id, invoice_hash, metadata, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
        `,
    ).run(
      uuidv4(),
      payerTenantId,
      body.customerMsisdn,
      row.amount,
      row.currency,
      idempotencyKey,
      invoiceId,
      invoiceHash,
      JSON.stringify({ paymentLinkId: row.id, merchantTenantId: row.merchant_id }),
      new Date().toISOString(),
      new Date().toISOString(),
    )

    const paymentContext: any = {
      input: {
        customerMsisdn: body.customerMsisdn,
        amount: Number(row.amount),
        currency: row.currency,
        reason: row.description,
        sourceReference: idempotencyKey,
      },
      state: {},
    }
    await ExternalActions.initiateEcoCashPayment(paymentContext, {
      apiKey: method.providerId === 'simulated' ? undefined : process.env.ECOCASH_API_KEY,
      simulatedMode: method.providerId === 'simulated',
      sandboxMode: process.env.ECOCASH_SANDBOX !== 'false',
    })
    const paid = paymentContext.state.payment?.status === 'completed'
    const reportedRef = String(paymentContext.state.payment?.reference || '')
    // A practice payment echoes our retry key back; show the payer a short reference instead.
    const providerRef =
      reportedRef && reportedRef !== idempotencyKey
        ? reportedRef
        : `SIM-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 8).toUpperCase()}`
    const result = {
      status: paid ? 'success' : 'pending',
      providerRef,
      instructions: paid ? undefined : 'Approve the payment on your phone (EcoCash prompt).',
    }
    db.prepare(`UPDATE ack_payments SET provider_ref = ?, updated_at = ? WHERE idempotency_key = ?`).run(
      result.providerRef,
      new Date().toISOString(),
      idempotencyKey,
    )

    if (result.providerRef) {
      const now = new Date().toISOString()
      const persistPaymentResult = db.transaction(() => {
        if (result.status === 'success') {
          // Payment completed immediately (simulated / instant adapters)
          db.prepare(
            `
                        UPDATE payment_links
                        SET status = 'paid', paid_at = ?, provider_ref = ?, payer_phone = ?, updated_at = ?
                        WHERE id = ?
                    `,
          ).run(now, result.providerRef, body.customerMsisdn, now, row.id)
        } else {
          // Payment pending (EcoCash USSD push etc.) — keep active, store ref for webhook reconciliation
          db.prepare(
            `
                        UPDATE payment_links
                        SET provider_ref = ?, payer_phone = ?, updated_at = ?
                        WHERE id = ?
                    `,
          ).run(result.providerRef, body.customerMsisdn, now, row.id)
        }
      })

      persistPaymentResult()

      // For instant payment adapters (simulated etc.), trigger the webhook
      // so ReceiptVC is created. Real adapters (EcoCash) have external callbacks.
      if (result.status === 'success') {
        const webhookUrl = resolveConfiguredBaseUrl(
          [
            process.env.ISSUER_API_URL,
            process.env.PUBLIC_BASE_URL,
            process.env.BACKEND_BASE_URL,
            process.env.APP_EXTERNAL_URL,
            process.env.NGROK_URL,
          ],
          'Internal webhook base URL',
        )
        const webhookSecret = getEcoCashWebhookSecret()
        try {
          await axios.post(
            `${webhookUrl}/webhooks/ecocash`,
            {
              status: 'SUCCESS',
              transactionId: result.providerRef,
              sourceReference: idempotencyKey,
              amount: row.amount,
              currency: row.currency,
              customerMsisdn: body.customerMsisdn,
            },
            {
              headers: { 'X-API-KEY': webhookSecret },
              timeout: 15000,
            },
          )
          logger.info(
            { providerRef: result.providerRef },
            'Internal webhook triggered for instant payment — ReceiptVC created',
          )
        } catch (e: any) {
          logger.warn(
            { error: e.message, providerRef: result.providerRef },
            'Failed to trigger internal webhook for instant payment',
          )
        }
      }
    }

    logger.info(
      {
        linkId: row.id,
        method: body.paymentMethod,
        providerRef: result.providerRef,
        status: result.status,
      },
      'Public payment initiated',
    )

    const response = {
      status: result.status,
      instructions: result.instructions,
      providerRef: result.providerRef,
      message: result.instructions ?? `Paid with ${method.providerName}`,
    }

    if (idempotencyCheck.key) {
      IdempotencyGuard.record(db, idempotencyCheck.key, payerTenantId, idempotencyAction, response)
    }

    return response
  }
}

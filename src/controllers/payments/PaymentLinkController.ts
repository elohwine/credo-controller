/**
 * PaymentLinkController — Authenticated merchant API for secure payment links
 *
 * Provides the Quote → Invoice → Payment Link lifecycle for the portal.
 * Payment links are short URLs that resolve to a public checkout page.
 * Upon payment completion, the existing webhook → ReceiptVC flow fires automatically.
 *
 * @module controllers/payments/PaymentLinkController
 */

import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Delete, Patch, Route, Tags, Body, Path, Query, Security, Request } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { orgSetupProfileService } from '../../services/OrgSetupProfileService'
import { paymentLinkService, type PaymentLinkDelivery } from '../../services/PaymentLinkService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'PaymentLinkController' })

export interface PaymentLink {
  id: string
  merchantId: string
  merchantName?: string
  description: string
  amount: number
  currency: string
  invoiceRef?: string
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  sector?: 'education' | 'ecommerce' | 'general'
  expiry?: string
  shortlinkCode?: string
  shortlinkUrl?: string
  paidAt?: string
  providerRef?: string
  payerPhone?: string
  payerName?: string
  sourceRunId?: string
  notification?: PaymentLinkDelivery
  deliveryHistory?: PaymentLinkDelivery[]
  transactionId?: string
  obligationId?: string
  obligationStatus?: string
  balanceDue?: number
  settledAmount?: number
  createdAt: string
}

interface CreatePaymentLinkBody {
  description: string
  amount: number
  currency?: string
  invoiceRef?: string
  merchantName?: string
  expiryHours?: number // default 336 (2 weeks)
  /** Sector determines workflow behavior: 'education' (no delivery), 'ecommerce' (delivery+PIN), 'general' */
  sector?: 'education' | 'ecommerce' | 'general'
}

@Route('api/payment-links')
@Tags('Payment Links')
export class PaymentLinkController extends Controller {
  private getTenantId(request: ExRequest): string {
    const tenantId = (request as any).user?.tenantId as string | undefined
    if (!tenantId) {
      throw new StatusException('Unauthorized: tenant context required', 401)
    }

    return tenantId
  }

  private assertOrgRole(request: ExRequest): void {
    const user = (request as any).user
    if (!user || !user.tenantId) {
      throw new StatusException('Unauthorized', 401)
    }

    const tenant = getTenantById(user.tenantId)
    if (tenant?.tenantType !== 'ORG') {
      throw new StatusException('Organization context required: switch to an organization to manage payment links', 403)
    }

    const orgRole = user.orgRole
    const allowedRoles = new Set(['owner', 'admin', 'issuer', 'manager', 'approver'])
    if (!allowedRoles.has(orgRole)) {
      throw new StatusException(
        'Insufficient permissions: must be owner/admin/issuer/manager/approver to perform this action',
        403,
      )
    }
  }

  /**
   * Create a new secure payment link.
   * Generates a shortlink URL the merchant can share (WhatsApp, email, etc.)
   */
  @Post('')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createPaymentLink(
    @Body() body: CreatePaymentLinkBody,
    @Request() request: ExRequest,
  ): Promise<{ link: PaymentLink; shortUrl: string }> {
    this.assertOrgRole(request)
    orgSetupProfileService.assertModule(this.getTenantId(request), 'collections')
    const db = DatabaseManager.getDatabase()
    const merchantId = this.getTenantId(request)
    if (!IdempotencyGuard.extractKey(request)) {
      throw new StatusException('Missing x-idempotency-key header', 400)
    }

    // FEPT §8: Idempotency guard
    const idempotencyCheck = IdempotencyGuard.guard(db, request, merchantId, 'create-payment-link')
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    const ttlHours = body.expiryHours ?? 336

    const wfTemplate = db
      .prepare(
        `SELECT sector FROM workflow_templates WHERE tenant_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(merchantId) as { sector: string } | undefined

    // Generic payment links are available for all workflow sectors.

    // Auto-inherit sector from merchant's workflow template if not explicitly provided
    let sector = body.sector ?? 'general'
    if (sector === 'general') {
      if (wfTemplate?.sector) {
        sector = wfTemplate.sector as any
      }
    }

    // FEPT §9: Atomic creation
    const response = db.transaction(() => {
      const created = paymentLinkService.create(
        {
          merchantId,
          merchantName: body.merchantName,
          description: body.description,
          amount: body.amount,
          currency: body.currency,
          invoiceRef: body.invoiceRef,
          sector,
          ttlHours,
          metadata: { arModule: true, collectionType: 'one_time' },
        },
        db,
      )
      const result = { link: { ...created, sector } as PaymentLink, shortUrl: created.shortlinkUrl }
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, merchantId, 'create-payment-link', result)
      }
      return result
    })()

    logger.info(
      { id: response.link.id, merchantId, code: response.link.shortlinkCode, amount: body.amount },
      'Payment link created',
    )

    return response
  }

  /**
   * List all payment links for the authenticated merchant.
   */
  @Get('')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listPaymentLinks(
    @Request() request: ExRequest,
    @Query() status?: string,
    @Query() limit = 50,
  ): Promise<{ links: PaymentLink[] }> {
    const db = DatabaseManager.getDatabase()
    const merchantId = this.getTenantId(request)

    let query = `SELECT p.*,
                            o.status AS obligation_status,
                            o.balance_due AS obligation_balance_due,
                            COALESCE(SUM(CASE WHEN a.status = 'applied' THEN a.amount ELSE 0 END), 0) AS settled_amount
                       FROM payment_links p
                       LEFT JOIN financial_obligations o ON o.id = p.obligation_id
                       LEFT JOIN settlement_allocations a ON a.obligation_id = o.id
                      WHERE p.merchant_id = ?`
    const params: any[] = [merchantId]

    if (status) {
      query += ' AND p.status = ?'
      params.push(status)
    }

    query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?'
    params.push(limit)

    const rows = db.prepare(query).all(...params) as any[]

    return {
      links: rows.map(this.rowToLink),
    }
  }

  /**
   * Get a specific payment link by ID.
   */
  @Get('{linkId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getPaymentLink(
    @Path() linkId: string,
    @Request() request: ExRequest,
  ): Promise<{ link: PaymentLink } | { error: string }> {
    const db = DatabaseManager.getDatabase()
    const merchantId = this.getTenantId(request)

    const row = db
      .prepare(
        `SELECT p.*, o.status AS obligation_status, o.balance_due AS obligation_balance_due,
                    COALESCE(SUM(CASE WHEN a.status = 'applied' THEN a.amount ELSE 0 END), 0) AS settled_amount
               FROM payment_links p
               LEFT JOIN financial_obligations o ON o.id = p.obligation_id
               LEFT JOIN settlement_allocations a ON a.obligation_id = o.id
              WHERE p.id = ? AND p.merchant_id = ?
              GROUP BY p.id`,
      )
      .get(linkId, merchantId) as any

    if (!row) {
      this.setStatus(404)
      return { error: 'Payment link not found' }
    }

    return { link: this.rowToLink(row) }
  }

  /**
   * Cancel an active payment link.
   */
  @Delete('{linkId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async cancelPaymentLink(@Path() linkId: string, @Request() request: ExRequest): Promise<{ success: boolean }> {
    this.assertOrgRole(request)
    const db = DatabaseManager.getDatabase()
    const merchantId = this.getTenantId(request)
    if (!IdempotencyGuard.extractKey(request)) {
      throw new StatusException('Missing x-idempotency-key header', 400)
    }

    // FEPT §8: Idempotency guard
    const idempotencyCheck = IdempotencyGuard.guard(db, request, merchantId, `cancel:${linkId}`)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    let success = false

    db.transaction(() => {
      const owned = db.prepare(`SELECT id FROM payment_links WHERE id = ? AND merchant_id = ?`).get(linkId, merchantId)
      success = Boolean(owned) && paymentLinkService.cancelAttempt(linkId, false)

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, merchantId, `cancel:${linkId}`, { success })
      }
    })()

    if (!success) {
      this.setStatus(404)
      return { success: false }
    }

    logger.info({ linkId, merchantId }, 'Payment link cancelled')
    return { success: true }
  }

  private rowToLink(row: any): PaymentLink {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {}
    return {
      id: row.id,
      merchantId: row.merchant_id,
      merchantName: row.merchant_name,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      invoiceRef: row.invoice_ref,
      status: row.status,
      sector: row.sector || 'general',
      expiry: row.expiry,
      shortlinkCode: row.shortlink_code,
      shortlinkUrl: row.shortlink_url,
      paidAt: row.paid_at,
      providerRef: row.provider_ref,
      payerPhone: row.payer_phone,
      payerName: metadata.payerName,
      sourceRunId: metadata.parentRunId || metadata.workflowRunId,
      notification: metadata.notification,
      deliveryHistory: metadata.deliveryHistory,
      transactionId: row.business_transaction_id,
      obligationId: row.obligation_id,
      obligationStatus: row.obligation_status,
      balanceDue: row.obligation_balance_due,
      settledAmount: row.settled_amount,
      createdAt: row.created_at,
    }
  }

  /** Save the client's name and mobile on a bill without sending it; the screen then offers to send. */
  @Patch('{linkId}/payer')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async updatePaymentLinkPayer(
    @Path() linkId: string,
    @Body() body: { payerName?: string; payerPhone?: string },
    @Request() request: ExRequest,
  ): Promise<{ linkId: string; payerName: string; payerPhone: string; changed: boolean; needsRenewal: boolean }> {
    const merchantId = this.assertFinanceAdmin(request)
    return paymentLinkService.updatePayer(linkId, merchantId, body || {})
  }

  @Post('{linkId}/send')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async sendPaymentLink(
    @Path() linkId: string,
    @Body() body: { payerName?: string; payerPhone?: string; renew?: boolean },
    @Request() request: ExRequest,
  ): Promise<{ linkId: string; url: string; notification: PaymentLinkDelivery }> {
    const merchantId = this.assertFinanceAdmin(request)
    if (!IdempotencyGuard.extractKey(request)) throw new StatusException('Missing x-idempotency-key header', 400)
    const db = DatabaseManager.getDatabase()
    const action = `send-payment-link:${linkId}`
    const replay = IdempotencyGuard.guard(db, request, merchantId, action)
    if (replay.duplicate) return replay.response
    const result = await paymentLinkService.resend(
      linkId,
      merchantId,
      body,
      body.renew === true,
      (request as any).user?.id,
    )
    if (replay.key) IdempotencyGuard.record(db, replay.key, merchantId, action, result)
    return result
  }

  private assertFinanceAdmin(request: ExRequest): string {
    this.assertOrgRole(request)
    const merchantId = this.getTenantId(request)
    orgSetupProfileService.assertModule(merchantId, 'collections')
    const member = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`)
      .get(merchantId, String((request as any).user?.id || '')) as { role?: string } | undefined
    if (!['owner', 'admin', 'issuer', 'manager', 'approver'].includes(String(member?.role))) {
      throw new StatusException('An active finance administrator membership is required', 403)
    }
    return merchantId
  }
}

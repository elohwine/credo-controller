/**
 * Contacts Controller — per-tenant contact directory with OID4VC offer delivery.
 *
 * SSI design:
 *   - A contact stores minimal identity: name + phone/email + optional DID.
 *   - The tenant never holds credentials on behalf of contacts — it only issues offers.
 *   - Contacts accept offers into their own SSI wallet (self-sovereign).
 *   - Contacts can consent to a reusable wallet link via a one-time claim token.
 *   - Once linked, any workflow can deliver offers into the holder's wallet queue.
 */

import 'reflect-metadata'
import type { Request as ExRequest } from 'express'
import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Route,
  Tags,
  Body,
  Request,
  Security,
  Path,
  SuccessResponse,
  Query,
} from 'tsoa'
import { v4 as uuidv4 } from 'uuid'
import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import {
  listContacts,
  getContactById,
  getContactByLinkToken,
  upsertContact,
  deleteContact,
  createContactLinkToken,
  claimContactLink,
  type OrgContact,
} from '../../persistence/ContactRepository'
import { credentialIssuanceService } from '../../services/CredentialIssuanceService'
import { notificationService } from '../../services/NotificationService'
import { outboxService } from '../../services/OutboxService'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { ShortlinkService } from '../../services/ShortlinkService'
import { getTenantById } from '../../persistence/TenantRepository'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

// ─── Request / Response shapes ────────────────────────────────────────────

interface CreateContactBody {
  /** Display name (required) */
  name: string
  /** E.164 phone, e.g. +263777123456 */
  phone?: string
  email?: string
  /** Holder's SSI DID — if already known */
  did?: string
  /** Known wallet/org tenant for this contact (e.g. discovered org tenant) */
  walletTenantId?: string
  notes?: string
  /** 'internal' for staff/teammates, 'external' for customers/vendors/students */
  contactScope?: 'internal' | 'external'
  /** If true, create a wallet signup/link invite immediately after contact creation */
  inviteToWallet?: boolean
  /** Optional invite expiry in hours (default 168, max 720) */
  inviteExpiryHours?: number
}

interface CreateContactResponse {
  contact: OrgContact
  invite?: ContactLinkInviteResponse
  id?: string
  name?: string
  phone?: string
  email?: string
  did?: string
  notes?: string
  orgTenantId?: string
  contactScope?: 'internal' | 'external'
}

interface UpdateContactBody {
  name?: string
  phone?: string
  email?: string
  /** Holder's SSI DID — update once the holder has shared it */
  did?: string
  notes?: string
  contactScope?: 'internal' | 'external'
}

interface ContactOfferBody {
  /**
   * Credential type to issue, e.g. "GenericID", "PaymentReceipt", "Invoice".
   * Must match a registered definition in credentialDefinitionStore.
   */
  credentialType: string
  /** Claims for credentialSubject */
  claims: Record<string, unknown>
}

interface ContactOfferResponse {
  offerId: string
  /** openid-credential-offer:// deeplink — share via WhatsApp, QR, email */
  offerDeeplink: string
  /** HTTP URL to the offer JSON (for wallets that prefer it) */
  offerUri: string
  expiresAt: string
}

interface CreateContactLinkInviteBody {
  /** Optional expiration in hours, default 168 (7 days) */
  expiryHours?: number
}

interface ContactLinkInviteResponse {
  contactId: string
  claimToken: string
  claimUrl: string
  expiresAt: string
}

interface ClaimContactLinkBody {
  token: string
}

interface ClaimContactLinkResponse {
  linked: boolean
  contact: OrgContact
}

interface ContactLinkPreviewResponse {
  valid: boolean
  contactId: string
  contactName: string
  contactScope: 'internal' | 'external'
  inviterTenantId: string
  inviterTenantLabel?: string
  linked: boolean
  linkedWalletTenantId?: string
}

interface RequestProofBody {
  /** Credential types to request, e.g. ['PaymentReceiptVC', 'SchoolFeeReceiptVC'] */
  credentialTypes?: string[]
  /** Human-readable purpose displayed in the holder's wallet UI */
  purpose?: string
  /**
   * External reference for reconciliation timeline (e.g. invoice ref).
   * School fee receipts should pass the invoice ref here so PRESENTATION_VERIFIED
   * appears on the same reconciliation timeline as the original payment.
   */
  providerRef?: string
}

interface RequestProofResponse {
  requestId: string
  /** HTTP presentation request URL — use as QR code content */
  requestUrl: string
  /** App deep-link the contact opens in their mobile wallet */
  deepLink: string
  expiresAt: string
  /** WhatsApp deep-link if contact.phone is set */
  whatsappUrl?: string
}

interface CreateContactPaymentLinkBody {
  description: string
  amount: number
  currency?: string
  invoiceRef?: string
  /** expiryHours default 336 (2 weeks) */
  expiryHours?: number
  /** sector affects downstream VC workflow: 'education' (no delivery), 'ecommerce' (delivery+PIN), 'general' */
  sector?: 'education' | 'ecommerce' | 'general'
}

interface ContactPaymentLinkResponse {
  paymentLinkId: string
  /** Short URL to share with the contact (opens public checkout page) */
  shortUrl: string
  shortlinkCode: string
  /** WhatsApp deep-link if contact.phone is set */
  whatsappUrl?: string
  amount: number
  currency: string
  expiresAt: string
}

// ─── Controller ──────────────────────────────────────────────────────────

@Route('/api/contacts')
@Tags('Contacts')
export class ContactController extends Controller {
  /**
   * Create a new contact in the tenant's directory.
   */
  @Post('/')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createContact(
    @Request() request: ExRequest,
    @Body() body: CreateContactBody,
  ): Promise<CreateContactResponse> {
    const tenantId = this.resolveTenantId(request)
    if (!body.name?.trim()) {
      this.setStatus(400)
      throw new StatusException('name is required', 400)
    }
    const contact = upsertContact({
      orgTenantId: tenantId,
      contactScope: body.contactScope ?? 'external',
      name: body.name.trim(),
      phone: body.phone,
      email: body.email,
      did: body.did,
      notes: body.notes,
      walletTenantId: body.walletTenantId,
      linkedAt: body.walletTenantId ? new Date().toISOString() : undefined,
    })

    let invite: ContactLinkInviteResponse | undefined
    if (body.inviteToWallet && !contact.walletTenantId) {
      const expiryHours = Math.min(Math.max(body.inviteExpiryHours ?? 168, 1), 24 * 30)
      const expiresAt = new Date(Date.now() + expiryHours * 3600_000).toISOString()
      const claimToken = createContactLinkToken(contact.id, tenantId, expiresAt)
      const portalUrl = process.env.PORTAL_EXTERNAL_URL || 'http://localhost:5000'
      const claimUrl = `${portalUrl}/wallet/link-contact?token=${encodeURIComponent(claimToken)}`

      notificationService
        .dispatchContactNotification({
          tenantId,
          dedupeKey: `contact-invite:${contact.id}:${expiresAt}`,
          contact: { name: contact.name, phone: contact.phone, email: contact.email },
          type: 'vc_offer',
          url: claimUrl,
          issuerName: 'Credentis Wallet Link',
        })
        .catch(() => {
          /* logged inside service */
        })

      invite = {
        contactId: contact.id,
        claimToken,
        claimUrl,
        expiresAt,
      }
    }

    this.setStatus(201)
    return {
      ...contact,
      contact,
      invite,
    }
  }

  /**
   * List all contacts for the active tenant.
   */
  @Get('/')
  @Security('jwt', ['tenant'])
  public async listContacts(
    @Request() request: ExRequest,
    @Query() contactScope?: 'internal' | 'external',
  ): Promise<OrgContact[]> {
    const tenantId = this.resolveTenantId(request)
    const tenant = getTenantById(tenantId)

    if (tenant?.tenantType === 'ORG') {
      this.ensureOwnerContactForOrg(tenantId)
    }

    const effectiveScope = contactScope ?? (tenant?.tenantType === 'ORG' ? 'external' : undefined)
    const contacts = listContacts(tenantId, effectiveScope)

    if (tenant?.tenantType === 'USER' && (!effectiveScope || effectiveScope === 'internal')) {
      const membershipContacts = this.listMembershipOrgContacts(tenantId)
      const existingOrgIds = new Set(contacts.map((c) => c.walletTenantId).filter(Boolean))
      const merged = membershipContacts.filter((c) => !existingOrgIds.has(c.walletTenantId))
      return [...contacts, ...merged]
    }

    return contacts
  }

  /**
   * Get a single contact by ID.
   */
  @Get('/{contactId}')
  @Security('jwt', ['tenant'])
  public async getContact(@Request() request: ExRequest, @Path() contactId: string): Promise<OrgContact> {
    const tenantId = this.resolveTenantId(request)
    const contact = getContactById(contactId, tenantId)
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }
    return contact
  }

  /**
   * Update a contact (partial update).
   */
  @Patch('/{contactId}')
  @Security('jwt', ['tenant'])
  public async updateContact(
    @Request() request: ExRequest,
    @Path() contactId: string,
    @Body() body: UpdateContactBody,
  ): Promise<OrgContact> {
    const tenantId = this.resolveTenantId(request)
    const existing = getContactById(contactId, tenantId)
    if (!existing) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }
    return upsertContact({
      id: contactId,
      orgTenantId: tenantId,
      contactScope: body.contactScope ?? existing.contactScope,
      name: body.name?.trim() ?? existing.name,
      phone: body.phone ?? existing.phone,
      email: body.email ?? existing.email,
      did: body.did ?? existing.did,
      notes: body.notes ?? existing.notes,
      walletTenantId: existing.walletTenantId,
      linkedAt: existing.linkedAt,
    })
  }

  /**
   * Remove a contact from the directory.
   */
  @Delete('/{contactId}')
  @Security('jwt', ['tenant'])
  public async deleteContact(@Request() request: ExRequest, @Path() contactId: string): Promise<{ deleted: boolean }> {
    const tenantId = this.resolveTenantId(request)
    const deleted = deleteContact(contactId, tenantId)
    if (!deleted) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }
    return { deleted: true }
  }

  /**
   * Create a one-time wallet linking invitation for a contact.
   *
   * This is reusable across all tenant types and workflows. A linked contact can
   * receive future credential offers directly in their wallet queue.
   */
  @Post('/{contactId}/link-invite')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createContactLinkInvite(
    @Request() request: ExRequest,
    @Path() contactId: string,
    @Body() body?: CreateContactLinkInviteBody,
  ): Promise<ContactLinkInviteResponse> {
    const tenantId = this.resolveTenantId(request)
    const contact = getContactById(contactId, tenantId)
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }

    const expiryHours = Math.min(Math.max(body?.expiryHours ?? 168, 1), 24 * 30)
    const expiresAt = new Date(Date.now() + expiryHours * 3600_000).toISOString()
    const claimToken = createContactLinkToken(contactId, tenantId, expiresAt)
    const portalUrl = process.env.PORTAL_EXTERNAL_URL || 'http://localhost:5000'
    const claimUrl = `${portalUrl}/wallet/link-contact?token=${encodeURIComponent(claimToken)}`

    notificationService
      .dispatchContactNotification({
        tenantId,
        dedupeKey: `contact-invite:${contactId}:${expiresAt}`,
        contact: { name: contact.name, phone: contact.phone, email: contact.email },
        type: 'vc_offer',
        url: claimUrl,
        issuerName: 'Credentis Wallet Link',
      })
      .catch(() => {
        /* logged inside service */
      })

    this.setStatus(201)
    return { contactId, claimToken, claimUrl, expiresAt }
  }

  /**
   * Preview a contact link invite token before holder claim.
   *
   * This enables embedded wallet UIs to show "who invited me" context while
   * preserving one-time token semantics for the actual claim operation.
   */
  @Get('/link-preview')
  public async previewLinkInvite(@Query() token?: string): Promise<ContactLinkPreviewResponse> {
    if (!token?.trim()) {
      this.setStatus(400)
      throw new StatusException('token is required', 400)
    }

    const contact = getContactByLinkToken(token.trim())
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Link token is invalid or expired', 404)
    }

    const inviterTenant = getTenantById(contact.orgTenantId)

    return {
      valid: true,
      contactId: contact.id,
      contactName: contact.name,
      contactScope: contact.contactScope,
      inviterTenantId: contact.orgTenantId,
      inviterTenantLabel: inviterTenant?.label,
      linked: !!contact.walletTenantId,
      linkedWalletTenantId: contact.walletTenantId,
    }
  }

  /**
   * Claim a one-time contact link from the holder wallet.
   */
  @Post('/claim-link')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async claimLink(
    @Request() request: ExRequest,
    @Body() body: ClaimContactLinkBody,
  ): Promise<ClaimContactLinkResponse> {
    const user = (request as any).user || {}
    const walletTenantId = user?.tenantId || user?.walletId
    const orgRole = user?.orgRole
    const did = (request as any).user?.did

    if (!walletTenantId) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (orgRole) {
      this.setStatus(403)
      throw new StatusException('Claim must be performed from personal holder wallet context', 403)
    }

    const walletTenant = getTenantById(walletTenantId)
    if (walletTenant?.tenantType === 'ORG') {
      this.setStatus(403)
      throw new StatusException('Organization tenants cannot claim contact invites; use a holder wallet account', 403)
    }

    if (!body.token?.trim()) {
      this.setStatus(400)
      throw new StatusException('token is required', 400)
    }

    const existing = getContactByLinkToken(body.token.trim())
    if (!existing) {
      this.setStatus(404)
      throw new StatusException('Link token is invalid or expired', 404)
    }

    const contact = claimContactLink({
      token: body.token.trim(),
      walletTenantId,
      did: did && did !== 'unknown' ? did : undefined,
    })

    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Link token is invalid or expired', 404)
    }

    return { linked: true, contact }
  }

  /**
   * Create an OID4VC credential offer for a contact.
   *
   * The returned `offerDeeplink` is an `openid-credential-offer://` URI.
   * Share it with the contact via WhatsApp, QR code, email, or any channel.
   * The contact's SSI wallet scans/clicks it and stores the credential —
   * no PII ever passes through the server after this point.
   *
   * If the contact already linked a wallet, the offer is also queued for direct
   * in-wallet delivery using the generic wallet_pending_offers table.
   */
  @Post('/{contactId}/offer')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createContactOffer(
    @Request() request: ExRequest,
    @Path() contactId: string,
    @Body() body: ContactOfferBody,
  ): Promise<ContactOfferResponse> {
    const tenantId = this.resolveTenantId(request)

    const contact = getContactById(contactId, tenantId)
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }
    if (!body.credentialType) {
      this.setStatus(400)
      throw new StatusException('credentialType is required', 400)
    }

    const result = await credentialIssuanceService.createOffer({
      credentialType: body.credentialType,
      claims: {
        ...body.claims,
        // Embed contact DID as subjectId when known (SSI holder binding)
        ...(contact.did ? { id: contact.did } : {}),
      },
      subjectDid: contact.did,
      tenantId: tenantId,
    })

    // Fire-and-forget — notify the contact via all configured channels
    notificationService
      .dispatchContactNotification({
        tenantId,
        dedupeKey: `contact-offer:${result.offerId}`,
        contact: { name: contact.name, phone: contact.phone, email: contact.email },
        type: 'vc_offer',
        url: result.credential_offer_deeplink || result.credential_offer_uri,
      })
      .catch(() => {
        /* logged inside service */
      })

    if (contact.walletTenantId) {
      const db = DatabaseManager.getDatabase()
      const queueResult = db
        .prepare(
          `
        INSERT INTO wallet_pending_offers (
          id, tenant_id, issuer_tenant_id, contact_id, source_type, source_id,
          credential_type, offer_uri, title, body, metadata, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND offer_uri = ?
            AND resolved_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND source_type = 'contact-offer'
            AND source_id = ?
            AND credential_type = ?
            AND accepted_at IS NOT NULL
        )
      `,
        )
        .run(
          uuidv4(),
          contact.walletTenantId,
          tenantId,
          contact.id,
          'contact-offer',
          result.offerId,
          body.credentialType,
          result.credential_offer_uri,
          `New ${body.credentialType} offer`,
          `${contact.name}, a new credential is ready for your wallet.`,
          JSON.stringify({ contactId: contact.id, offerDeeplink: result.credential_offer_deeplink }),
          new Date().toISOString(),
          contact.walletTenantId,
          result.credential_offer_uri,
          contact.walletTenantId,
          result.offerId,
          body.credentialType,
        )

      if ((queueResult.changes || 0) > 0) {
        outboxService.enqueue({
          topic: 'wallet.vc.offered',
          aggregateKey: contact.walletTenantId,
          dedupeKey: `wpo:${contact.walletTenantId}:contact-offer:${result.offerId}:${body.credentialType}`,
          payload: {
            tenantId: contact.walletTenantId,
            issuerTenantId: tenantId,
            sourceType: 'contact-offer',
            sourceId: result.offerId,
            credentialType: body.credentialType,
            offerUri: result.credential_offer_uri.slice(0, 300),
            queuedAt: new Date().toISOString(),
          },
        })
      }

      notificationService
        .sendWalletPush({
          offerUri: result.credential_offer_uri,
          actionUrl: result.credential_offer_deeplink,
          title: `New ${body.credentialType}`,
          body: 'Open your wallet to review and accept this credential offer.',
          type: 'issuance',
        })
        .catch(() => {
          /* logged inside service */
        })
    }

    this.setStatus(201)
    return {
      offerId: result.offerId,
      offerDeeplink: result.credential_offer_deeplink,
      offerUri: result.credential_offer_uri,
      expiresAt: result.expiresAt,
    }
  }

  /**
   * Create a payment link pre-filled with this contact's details.
   *
   * Upon payment the existing webhook → WorkflowService → ReceiptVC pipeline fires
   * automatically — the contact can then register/login and see the VC in their wallet
   * (same flow as the public checkout).
   *
   * The returned `shortUrl` should be shared with the contact (WhatsApp, QR, email).
   */
  @Post('/{contactId}/payment-link')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createContactPaymentLink(
    @Request() request: ExRequest,
    @Path() contactId: string,
    @Body() body: CreateContactPaymentLinkBody,
  ): Promise<ContactPaymentLinkResponse> {
    const tenantId = this.resolveTenantId(request)
    if (!IdempotencyGuard.extractKey(request)) {
      this.setStatus(400)
      throw new StatusException('Missing x-idempotency-key header', 400)
    }

    const tenant = getTenantById(tenantId)
    const merchantName = tenant?.label || 'Organization'

    const contact = getContactById(contactId, tenantId)
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }

    const db = DatabaseManager.getDatabase()
    const idempotencyAction = `contacts:create-payment-link:${contactId}:${body.invoiceRef || 'none'}`
    const idempotencyCheck = IdempotencyGuard.guard(db, request, tenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    const id = uuidv4()
    const ttlHours = body.expiryHours ?? 336

    // Auto-inherit sector from org's workflow template if not explicitly provided
    let sector = body.sector ?? 'general'
    if (sector === 'general') {
      try {
        const wfTemplate = db
          .prepare(
            `SELECT sector FROM workflow_templates WHERE tenant_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1`,
          )
          .get(tenantId) as { sector: string } | undefined
        if (wfTemplate?.sector) {
          sector = wfTemplate.sector as any
        }
      } catch {
        /* fallback to general */
      }
    }

    const { code, url, expiresAt } = ShortlinkService.createPaymentLink(
      id,
      {
        amount: body.amount,
        currency: body.currency ?? 'USD',
        description: body.description,
        merchantName,
        sector,
      },
      ttlHours,
    )

    const now = new Date().toISOString()
    const expiryDate = new Date(Date.now() + ttlHours * 3600_000).toISOString()

    db.prepare(
      `
      INSERT INTO payment_links
          (id, merchant_id, merchant_name, description, amount, currency, invoice_ref,
           sector, status, expiry, shortlink_code, shortlink_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      tenantId,
      merchantName,
      body.description,
      body.amount,
      body.currency ?? 'USD',
      body.invoiceRef ?? null,
      sector,
      expiryDate,
      code,
      url,
      now,
      now,
    )

    // If contact is already wallet-linked, push the payment link into their inbox queue.
    // This lets org recipients discover link-based payment tasks in-wallet, not only via SMS/WA/email.
    if (contact.walletTenantId) {
      const queueResult = db
        .prepare(
          `
        INSERT INTO wallet_pending_offers (
          id, tenant_id, issuer_tenant_id, contact_id, source_type, source_id,
          credential_type, offer_uri, title, body, metadata, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND offer_uri = ?
            AND resolved_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND source_type = 'payment_link'
            AND source_id = ?
            AND credential_type = 'PaymentLink'
            AND accepted_at IS NOT NULL
        )
      `,
        )
        .run(
          `plk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          contact.walletTenantId,
          tenantId,
          contact.id,
          'payment_link',
          id,
          'PaymentLink',
          url,
          'Payment Link Received',
          `${contact.name}, ${body.description}`,
          JSON.stringify({
            paymentLinkId: id,
            shortlinkCode: code,
            shortlinkUrl: url,
            amount: body.amount,
            currency: body.currency ?? 'USD',
            invoiceRef: body.invoiceRef ?? null,
            merchantTenantId: tenantId,
            merchantName,
          }),
          now,
          contact.walletTenantId,
          url,
          contact.walletTenantId,
          id,
        )

      if ((queueResult.changes || 0) > 0) {
        outboxService.enqueue({
          topic: 'wallet.vc.offered',
          aggregateKey: contact.walletTenantId,
          dedupeKey: `wpo:${contact.walletTenantId}:payment_link:${id}:PaymentLink`,
          payload: {
            tenantId: contact.walletTenantId,
            issuerTenantId: tenantId,
            sourceType: 'payment_link',
            sourceId: id,
            credentialType: 'PaymentLink',
            offerUri: url.slice(0, 300),
            queuedAt: new Date().toISOString(),
          },
        })
      }
    }

    // Fire-and-forget — notify the contact via all configured channels
    notificationService
      .dispatchContactNotification({
        tenantId,
        dedupeKey: `payment_link:${id}`,
        contact: { name: contact.name, phone: contact.phone, email: contact.email },
        type: 'payment_link',
        url,
        amount: body.amount,
        currency: body.currency ?? 'USD',
      })
      .catch(() => {
        /* logged inside service */
      })

    this.setStatus(201)
    const response: ContactPaymentLinkResponse = {
      paymentLinkId: id,
      shortUrl: url,
      shortlinkCode: code,
      amount: body.amount,
      currency: body.currency ?? 'USD',
      expiresAt: expiryDate,
    }

    if (contact.phone) {
      const msg = encodeURIComponent(`Hi ${contact.name}, here is your payment link: ${url}`)
      response.whatsappUrl = `https://wa.me/${contact.phone.replace('+', '')}?text=${msg}`
    }

    if (idempotencyCheck.key) {
      IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, idempotencyAction, response)
    }

    return response
  }

  /**
   * Request a verifiable proof from a contact via OID4VP.
   *
   * Creates a presentation request, stores the context for reconciliation
   * (no PII — only providerRef + tenantId), then dispatches the deep-link
   * to the contact via WhatsApp/SMS.
   *
   * School fee receipts (PaymentReceiptVC / SchoolFeeReceiptVC) are permanent
   * non-revocable proofs — set credentialTypes accordingly and the contact's
   * wallet will match them regardless of revocation status.
   */
  @Post('/{contactId}/request-proof')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async requestProof(
    @Request() request: ExRequest,
    @Path() contactId: string,
    @Body() body: RequestProofBody,
  ): Promise<RequestProofResponse> {
    const tenantId = this.resolveTenantId(request)
    const contact = getContactById(contactId, tenantId)
    if (!contact) {
      this.setStatus(404)
      throw new StatusException('Contact not found', 404)
    }

    const agent = (request as any).agent
    if (!agent) {
      this.setStatus(503)
      throw new StatusException('Agent not available — ensure tenant session is active', 503)
    }

    const types =
      Array.isArray(body.credentialTypes) && body.credentialTypes.length > 0
        ? body.credentialTypes.filter(Boolean)
        : ['VerifiableCredential']

    const purpose = body.purpose?.trim() || `Present a ${types.join(', ')} credential for verification`

    // Ad-hoc contact checks carry no transaction to bind, so the whole card is asked for over PEX.
    const presentationDefinition = {
      id: `pd-contact-${uuidv4()}`,
      input_descriptors: types.map((type, index) => ({
        id: `descriptor-${index}`,
        name: `${type} presentation`,
        purpose,
        constraints: {
          fields: [{ path: ['$.type', '$.vc.type'], filter: { type: 'array', contains: { const: type } } }],
        },
      })),
    }

    // Resolve verifier DID — reuse existing or mint a new one
    const verifiers = await (agent.modules as any).openId4VcVerifier.getAllVerifiers()
    const verifierRecord = verifiers[0]
    let verifierDid: string =
      verifierRecord?.verifierDid || verifierRecord?.did || (await agent.dids.getCreatedDids({ method: 'key' }))[0]?.did
    if (!verifierDid) {
      const created = await agent.dids.create({ method: 'key', options: { keyType: 'Ed25519' } })
      verifierDid = created.didState.did as string
    }
    const verifierDidUrl =
      verifierDid.startsWith('did:key:') && !verifierDid.includes('#')
        ? `${verifierDid}#${verifierDid.replace('did:key:', '')}`
        : verifierDid

    const result = await (agent.modules as any).openId4VcVerifier.createAuthorizationRequest({
      verifierId: verifierRecord?.verifierId,
      requestSigner: { method: 'did', did: verifierDid, didUrl: verifierDidUrl },
      presentationExchange: { definition: presentationDefinition },
    })

    const requestUrl: string = result.authorizationRequest
    const requestId: string = result.verificationSession?.id || uuidv4()

    // Store context for reconciliation timeline — no PII stored
    await agent.genericRecords.save({
      id: `vp-request:${requestId}`,
      content: {
        providerRef: body.providerRef,
        tenantId,
        contactId: contact.id,
        createdAt: new Date().toISOString(),
      },
      tags: { type: 'vp_request_context', requestId },
    })

    const mobileUrl = process.env.MOBILE_APP_URL || process.env.APP_EXTERNAL_URL || 'http://localhost:3001'
    const deepLink = `${mobileUrl}/present?request_uri=${encodeURIComponent(requestUrl)}`
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
    const tenantLabel = getTenantById(tenantId)?.label || 'Organization'

    if (contact.walletTenantId) {
      const db = DatabaseManager.getDatabase()
      const queueResult = db
        .prepare(
          `
        INSERT INTO wallet_pending_offers (
          id, tenant_id, issuer_tenant_id, contact_id, source_type, source_id,
          credential_type, offer_uri, title, body, metadata, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND offer_uri = ?
            AND resolved_at IS NULL
        )
      `,
        )
        .run(
          uuidv4(),
          contact.walletTenantId,
          tenantId,
          contact.id,
          'proof_request',
          requestId,
          'ProofRequest',
          deepLink,
          'Proof Request Received',
          `${tenantLabel} requested credential proof.`,
          JSON.stringify({ requestId, requestUrl, proofTypes: types, providerRef: body.providerRef || null }),
          new Date().toISOString(),
          contact.walletTenantId,
          deepLink,
        )

      if ((queueResult.changes || 0) > 0) {
        outboxService.enqueue({
          topic: 'wallet.vc.offered',
          aggregateKey: contact.walletTenantId,
          dedupeKey: `wpo:${contact.walletTenantId}:proof_request:${requestId}:ProofRequest`,
          payload: {
            tenantId: contact.walletTenantId,
            issuerTenantId: tenantId,
            sourceType: 'proof_request',
            sourceId: requestId,
            credentialType: 'ProofRequest',
            offerUri: deepLink.slice(0, 300),
            queuedAt: new Date().toISOString(),
          },
        })
      }
    }

    notificationService
      .dispatchContactNotification({
        tenantId,
        dedupeKey: `proof_request:${requestId}`,
        contact: { name: contact.name, phone: contact.phone, email: contact.email },
        type: 'proof_request',
        url: deepLink,
        issuerName: tenantLabel,
      })
      .catch(() => {
        /* non-critical */
      })

    this.setStatus(201)
    const response: RequestProofResponse = { requestId, requestUrl, deepLink, expiresAt }
    if (contact.phone) {
      const msg = encodeURIComponent(
        `Hi ${contact.name}, ${tenantLabel} requests proof of your ${types.join(', ')} credential. Open your wallet:\n${deepLink}`,
      )
      response.whatsappUrl = `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${msg}`
    }
    return response
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private resolveTenantId(request: ExRequest): string {
    const user = (request as any).user as Record<string, unknown> | undefined
    if (!user || !user.tenantId) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    const tenantId = user.tenantId as string
    const tenant = getTenantById(tenantId)
    const orgRole = user.orgRole as string | undefined

    if (tenant?.tenantType === 'ORG') {
      if (!orgRole) {
        this.setStatus(403)
        throw new StatusException('Organization-scoped token required', 403)
      }

      if (orgRole !== 'owner' && orgRole !== 'admin') {
        this.setStatus(403)
        throw new StatusException('Insufficient permissions: must be an org owner or admin to manage contacts', 403)
      }
    }

    return tenantId
  }

  private listMembershipOrgContacts(userTenantId: string): OrgContact[] {
    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT id FROM ssi_users WHERE tenant_id = ? LIMIT 1').get(userTenantId) as
      | { id: string }
      | undefined

    if (!user?.id) return []

    const rows = db
      .prepare(
        `
      SELECT
        m.org_tenant_id,
        m.role,
        m.created_at,
        t.label,
        t.issuer_did
      FROM org_memberships m
      JOIN tenants t ON t.id = m.org_tenant_id
      WHERE m.user_id = ? AND m.status = 'active'
      ORDER BY m.created_at ASC
    `,
      )
      .all(user.id) as Array<{
      org_tenant_id: string
      role: string
      created_at: string
      label: string
      issuer_did: string | null
    }>

    return rows.map(
      (row) =>
        ({
          id: `org-membership:${row.org_tenant_id}`,
          orgTenantId: userTenantId,
          contactScope: 'internal',
          name: row.label,
          did: row.issuer_did || undefined,
          notes: `Org membership (${row.role}) · ${
            ['owner', 'admin'].includes(String(row.role).toLowerCase())
              ? 'can open the organisation and its dashboard'
              : 'jobs and approvals come to your personal inbox'
          }`,
          appStatus: 'in_app',
          walletTenantId: row.org_tenant_id,
          linkedAt: row.created_at,
          createdAt: row.created_at,
          updatedAt: row.created_at,
          sourceType: 'membership-org',
        }) as OrgContact,
    )
  }

  private ensureOwnerContactForOrg(orgTenantId: string): void {
    const db = DatabaseManager.getDatabase()
    const owner = db
      .prepare(
        `
      SELECT
        m.user_id,
        su.tenant_id as wallet_tenant_id,
        su.did as holder_did,
        t.label as holder_name
      FROM org_memberships m
      JOIN ssi_users su ON su.id = m.user_id
      JOIN tenants t ON t.id = su.tenant_id
      WHERE m.org_tenant_id = ?
        AND m.role = 'owner'
        AND m.status = 'active'
      ORDER BY datetime(m.updated_at) DESC
      LIMIT 1
    `,
      )
      .get(orgTenantId) as
      | {
          user_id?: string
          wallet_tenant_id?: string
          holder_did?: string
          holder_name?: string
        }
      | undefined

    if (!owner?.user_id) return

    const displayName = owner.holder_name?.trim() || 'Organization Owner'
    upsertContact({
      id: `${orgTenantId}:owner:${owner.user_id}`,
      orgTenantId,
      contactScope: 'internal',
      name: displayName,
      did: owner.holder_did || undefined,
      walletTenantId: owner.wallet_tenant_id || undefined,
      linkedAt: new Date().toISOString(),
      notes: 'Auto-linked from organization member account',
    })
  }
}

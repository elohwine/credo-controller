import type { Request as ExRequest } from 'express'

import { Controller, Get, Put, Post, Route, Tags, Body, Request, Path, Security } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { notificationService } from '../../services/NotificationService'
import { DispatchError } from '../../services/OutboxService'
import {
  whatsAppSenderService,
  WHATSAPP_EVENTS,
  type WhatsAppSenderSelection,
} from '../../services/WhatsAppSenderService'

@Route('api/organizations/{tenantId}/notifications')
@Tags('Transactional notifications')
export class NotificationController extends Controller {
  private admin(request: ExRequest, tenantId: string): void {
    const user = (request as any).user
    if (!user?.id || user.tenantId !== tenantId || !['owner', 'admin'].includes(user.orgRole)) {
      throw new StatusException('Organization owner or admin required', 403)
    }
  }

  @Get('whatsapp')
  @Security('jwt')
  public async getSender(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<WhatsAppSenderSelection | null> {
    this.admin(request, tenantId)
    return whatsAppSenderService.selection(tenantId) || null
  }

  @Get('whatsapp/readiness')
  @Security('jwt')
  public async senderReadiness(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<{
    platformConfigured: boolean
    deliveryEnabled: boolean
    productionEnabled: boolean
    walletLinkConfigured: boolean
    validated: boolean
    selection: WhatsAppSenderSelection | null
    events: string[]
  }> {
    this.admin(request, tenantId)
    const env = process.env
    const selection = whatsAppSenderService.selection(tenantId) || null
    let validated = false
    try {
      const sender = whatsAppSenderService.resolve(tenantId)
      const binding = DatabaseManager.getDatabase()
        .prepare('SELECT sender_key, waba_id FROM whatsapp_sender_bindings WHERE phone_number_id = ?')
        .get(sender.phoneNumberId) as { sender_key: string; waba_id: string } | undefined
      validated = binding?.sender_key === sender.key && binding?.waba_id === sender.wabaId
    } catch {
      validated = false
    }
    let walletLinkConfigured = false
    try {
      walletLinkConfigured = new URL(env.WALLET_PUBLIC_URL || '').protocol === 'https:'
    } catch {
      walletLinkConfigured = false
    }
    // Booleans only: never project the secret values themselves.
    return {
      platformConfigured: Boolean(
        env.WABA_TOKEN && env.WHATSAPP_APP_SECRET && env.WABA_PHONE_NUMBER_ID && env.WABA_BUSINESS_ACCOUNT_ID,
      ),
      deliveryEnabled: env.WHATSAPP_DELIVERY_ENABLED === 'true',
      productionEnabled: env.WHATSAPP_PRODUCTION_ENABLED === 'true',
      walletLinkConfigured,
      validated,
      selection,
      events: [...WHATSAPP_EVENTS],
    }
  }

  @Put('whatsapp')
  @Security('jwt')
  public async selectSender(
    @Path() tenantId: string,
    @Body() body: WhatsAppSenderSelection,
    @Request() request: ExRequest,
  ): Promise<WhatsAppSenderSelection> {
    this.admin(request, tenantId)
    try {
      return whatsAppSenderService.configure(tenantId, body)
    } catch {
      throw new StatusException('Invalid WhatsApp sender or transactional template selection', 400)
    }
  }

  @Post('whatsapp/validate')
  @Security('jwt')
  public async validateSender(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<{ ready: boolean; templates: string[]; webhookSubscribed: boolean }> {
    this.admin(request, tenantId)
    try {
      return await whatsAppSenderService.validate(tenantId)
    } catch (error: any) {
      // Never propagate Axios errors, which contain the provider Authorization header.
      const http = Number(error?.response?.status)
      const metaCode = Number(error?.response?.data?.error?.code)
      const detail =
        error instanceof DispatchError
          ? error.message
          : http === 401 || metaCode === 190
            ? 'Meta rejected the access token (expired or wrong)'
            : http === 403 || metaCode === 200 || metaCode === 10
              ? 'The access token lacks whatsapp_business_management / whatsapp_business_messaging permission'
              : http
                ? `Meta returned HTTP ${http}${Number.isFinite(metaCode) ? ` (code ${metaCode})` : ''}`
                : 'Could not reach Meta'
      throw new StatusException(`Sender could not be validated: ${detail}`, 400)
    }
  }

  @Post('whatsapp/test')
  @Security('jwt')
  public async testSender(
    @Path() tenantId: string,
    @Body() body: { eventType: string; requestId: string },
    @Request() request: ExRequest,
  ): Promise<{ queued: boolean; notificationId: string }> {
    this.admin(request, tenantId)
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)) throw new StatusException('Test request ID required', 400)
    const consent = DatabaseManager.getDatabase()
      .prepare(
        `SELECT phone FROM notification_preferences
      WHERE tenant_id = ? AND user_id = ? AND event_type = ? AND enabled = 1`,
      )
      .get(tenantId, (request as any).user.id, body.eventType) as { phone: string } | undefined
    if (!consent) throw new StatusException('Record your own event opt-in before testing', 400)
    const notificationId = notificationService.queueWhatsApp({
      tenantId,
      to: consent.phone,
      eventType: body.eventType,
      dedupeKey: `self-test:${(request as any).user.id}:${body.requestId}`,
    })
    return { queued: true, notificationId }
  }

  @Put('preferences')
  @Security('jwt')
  public async preference(
    @Path() tenantId: string,
    @Body() body: { phone: string; eventType: string; enabled: boolean },
    @Request() request: ExRequest,
  ): Promise<{ saved: boolean }> {
    const userId = (request as any).user?.id
    if (!userId) throw new StatusException('Authenticated person required', 401)
    try {
      notificationService.setPreference({ ...body, tenantId, userId })
    } catch {
      throw new StatusException('Event or verified account phone is invalid', 400)
    }
    return { saved: true }
  }

  @Get('deliveries')
  @Security('jwt')
  public async deliveries(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<
    Array<{
      id: string
      eventType: string
      status: string
      reason: string | null
      providerMessageId: string | null
      /** `name/language` of the WhatsApp template used, set once the send starts. */
      templateName: string | null
      updatedAt: string
    }>
  > {
    this.admin(request, tenantId)
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, event_type AS eventType, status, reason,
      provider_message_id AS providerMessageId, template_name AS templateName, updated_at AS updatedAt FROM notification_deliveries
      WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(tenantId) as any
  }

  @Get('dispatch')
  @Security('jwt')
  public async dispatchState(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<
    Array<{
      id: string
      topic: string
      status: string
      attempts: number
      error: string | null
    }>
  > {
    this.admin(request, tenantId)
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, topic, status, attempts, error_message AS error
      FROM integration_outbox WHERE aggregate_key = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(tenantId) as any
  }

  @Get('preferences')
  @Security('jwt')
  public async preferences(
    @Path() tenantId: string,
    @Request() request: ExRequest,
  ): Promise<
    Array<{
      eventType: string
      enabled: number
      consentAt: string
      updatedAt: string
    }>
  > {
    const userId = (request as any).user?.id
    if (!userId) throw new StatusException('Authenticated person required', 401)
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT event_type AS eventType, enabled,
      consent_at AS consentAt, updated_at AS updatedAt FROM notification_preferences
      WHERE tenant_id = ? AND user_id = ?`,
      )
      .all(tenantId, userId) as any
  }
}

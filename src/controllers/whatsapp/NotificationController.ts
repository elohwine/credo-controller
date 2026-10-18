import type { Request as ExRequest } from 'express'

import { Controller, Get, Put, Post, Route, Tags, Body, Request, Path, Security } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { notificationService } from '../../services/NotificationService'
import { whatsAppSenderService, type WhatsAppSenderSelection } from '../../services/WhatsAppSenderService'

@Route('organizations/{tenantId}/notifications')
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
  ): Promise<{ ready: boolean; templates: string[] }> {
    this.admin(request, tenantId)
    try {
      return await whatsAppSenderService.validate(tenantId)
    } catch {
      // Never propagate Axios errors, which contain the provider Authorization header.
      throw new StatusException('Sender connection or utility templates could not be validated', 400)
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
      updatedAt: string
    }>
  > {
    this.admin(request, tenantId)
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, event_type AS eventType, status, reason,
      provider_message_id AS providerMessageId, updated_at AS updatedAt FROM notification_deliveries
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

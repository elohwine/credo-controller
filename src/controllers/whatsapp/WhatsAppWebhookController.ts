import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request, Query } from 'tsoa'

import { StatusException } from '../../errors'
import { notificationService } from '../../services/NotificationService'
import { whatsAppSenderService } from '../../services/WhatsAppSenderService'
import { STOP_BUTTON_TEXT } from '../../services/whatsAppTemplates'

export interface WhatsAppWebhookPayload {
  [key: string]: any
  object: string
  entry: Array<{
    [key: string]: any
    id: string
    changes: Array<{
      [key: string]: any
      field: string
      value: {
        [key: string]: any
        metadata?: { [key: string]: any; phone_number_id: string; display_phone_number?: string }
        messages?: Array<{
          [key: string]: any
          from: string
          id: string
          type: string
          text?: { [key: string]: any; body: string }
          /** Quick-reply button tapped on a template message */
          button?: { [key: string]: any; payload?: string; text?: string }
        }>
        statuses?: Array<{
          [key: string]: any
          id: string
          status: string
          timestamp: string
          recipient_id?: string
          biz_opaque_callback_data?: string
          errors?: Array<{ [key: string]: any; code?: number }>
        }>
      }
    }>
  }>
}

@Route('wa')
@Tags('WhatsApp')
export class WhatsAppWebhookController extends Controller {
  @Get('webhook')
  public async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Request() request: ExRequest,
  ): Promise<void> {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
    if (!verifyToken || mode !== 'subscribe' || token !== verifyToken) throw new StatusException('Forbidden', 403)
    request.res!.status(200).type('text/plain').send(challenge)
  }

  @Post('webhook')
  public async handleWebhook(
    @Body() payload: WhatsAppWebhookPayload,
    @Request() request: ExRequest,
  ): Promise<{ status: string }> {
    const raw = (request as any).rawBody as Buffer | undefined
    const signature = request.headers['x-hub-signature-256']
    if (!raw || typeof signature !== 'string') throw new StatusException('Signed raw callback required', 403)
    const changes: Array<{
      senderKey: string
      value: WhatsAppWebhookPayload['entry'][number]['changes'][number]['value']
    }> = []
    try {
      // Verify every sender before applying any part of a multi-entry callback.
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const phoneId = change.value.metadata?.phone_number_id
          if (!phoneId) throw new Error('Missing sender')
          changes.push({
            senderKey: whatsAppSenderService.verifyCallback(phoneId, entry.id, raw, signature),
            value: change.value,
          })
        }
      }
    } catch {
      throw new StatusException('Invalid callback signature or sender', 403)
    }
    if (payload.object !== 'whatsapp_business_account') return { status: 'ignored' }
    for (const { senderKey, value } of changes) {
      for (const status of value.statuses || []) {
        notificationService.applyWhatsAppStatus(senderKey, value.metadata!.phone_number_id, status)
      }
      for (const message of value.messages || []) {
        const typedStop =
          message.type === 'text' && /^(stop|unsubscribe|cancel)$/i.test(message.text?.body.trim() || '')
        const tappedStop =
          message.type === 'button' &&
          (message.button?.payload === 'STOP_ALERTS' || message.button?.text === STOP_BUTTON_TEXT)
        if (typedStop || tappedStop) {
          notificationService.applyWhatsAppOptOut(senderKey, message.from, message.id)
        }
      }
    }
    return { status: 'processed' }
  }
}

import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request, Query } from 'tsoa'

import { StatusException } from '../../errors'
import { marketingService } from '../../services/MarketingService'
import { notificationService } from '../../services/NotificationService'
import { whatsAppInquiryService } from '../../services/WhatsAppInquiryService'
import { whatsAppSenderService } from '../../services/WhatsAppSenderService'
import { rootLogger } from '../../utils/pinoLogger'
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
          location?: { [key: string]: any; name?: string; address?: string }
          image?: { [key: string]: any; id: string; mime_type?: string; caption?: string }
          document?: { [key: string]: any; id: string; mime_type?: string; caption?: string }
          /** Quick-reply button tapped on a template message */
          button?: { [key: string]: any; payload?: string; text?: string }
          /** A button or list row tapped on a chat reply; the id is the command it stands for */
          interactive?: {
            [key: string]: any
            type?: string
            button_reply?: { [key: string]: any; id?: string; title?: string }
            list_reply?: { [key: string]: any; id?: string; title?: string }
          }
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

const logger = rootLogger.child({ module: 'WhatsAppWebhook' })

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
          // Offers are a different list. This runs only after alert opt-out has succeeded,
          // and a missing offers table must not undo that opt-out.
          try {
            marketingService.optOutPhone(message.from)
          } catch {
            logger.warn({ messageId: message.id }, 'Offer opt-out was not saved')
          }
        } else if (message.id) {
          // A reply to this message only. Alert consent is not created here.
          const base = { senderKey, messageId: message.id, from: message.from }
          const media = message.type === 'image' ? message.image : message.type === 'document' ? message.document : undefined
          try {
            // Only the job card's answer buttons come back as template taps; other template buttons are links.
            const tappedJob =
              message.type === 'button' && /^JOB_[A-Z]+:/.test(message.button?.payload || '')
                ? message.button?.payload
                : undefined
            const tapped =
              message.type === 'interactive'
                ? message.interactive?.button_reply?.id || message.interactive?.list_reply?.id
                : tappedJob
            const said = message.type === 'text' ? message.text?.body : tapped
            if (said) {
              const name = (value.contacts || []).find((contact: any) => contact?.wa_id === message.from)?.profile?.name
              await whatsAppInquiryService.handle({ ...base, text: said, name })
            } else if (message.type === 'location' && message.location) {
              await whatsAppInquiryService.handleLocation({ ...base, location: message.location })
            } else if (media?.id) {
              await whatsAppInquiryService.handleMedia({
                ...base,
                media: { id: media.id, mimeType: media.mime_type, caption: media.caption },
              })
            }
          } catch {
            logger.warn({ messageId: message.id }, 'WhatsApp inquiry was not answered')
          }
        }
      }
    }
    return { status: 'processed' }
  }
}

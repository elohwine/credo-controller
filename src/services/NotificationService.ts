/**
 * IdenEx Credentis - Notification Service
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Delivery channels for workflow notifications:
 * - Email (SMTP)
 * - WhatsApp Business Cloud API
 * - Wallet push (HTTP webhook)
 * 
 * @module services/NotificationService
 * @copyright 2024-2026 IdenEx Credentis
 */

import nodemailer from 'nodemailer'
import axios from 'axios'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'NotificationService' })

export interface EmailPayload {
  to: string
  subject: string
  text?: string
  html?: string
  from?: string
  replyTo?: string
}

export interface WhatsAppTextPayload {
  to: string
  body: string
  previewUrl?: boolean
}

export interface WhatsAppCtaPayload {
  to: string
  headerText: string
  bodyText: string
  buttonText: string
  url: string
}

export interface WalletPushPayload {
  offerUri?: string
  title?: string
  body?: string
  actionUrl?: string
  type?: 'issuance' | 'verification' | 'generic'
}

export class NotificationService {
  async sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }> {
    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 587)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = payload.from || process.env.SMTP_FROM || 'no-reply@credentis.africa'

    if (!host || !user || !pass) {
      logger.warn('SMTP not configured, skipping email send')
      return { success: false }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    const result = await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo,
    })

    logger.info({ to: payload.to, messageId: result.messageId }, 'Email sent')
    return { success: true, messageId: result.messageId }
  }

  async sendWhatsAppText(payload: WhatsAppTextPayload): Promise<any> {
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID || ''
    const accessToken = process.env.WABA_TOKEN || ''
    const apiVersion = process.env.WABA_API_VERSION || 'v21.0'

    if (!phoneNumberId || !accessToken) {
      logger.warn('WhatsApp Business API not configured, skipping message send')
      return { skipped: true, reason: 'not_configured' }
    }

    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'text',
        text: {
          preview_url: payload.previewUrl ?? false,
          body: payload.body,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    logger.info({ to: payload.to, messageId: response.data?.messages?.[0]?.id }, 'WhatsApp text sent')
    return response.data
  }

  async sendWhatsAppCta(payload: WhatsAppCtaPayload): Promise<any> {
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID || ''
    const accessToken = process.env.WABA_TOKEN || ''
    const apiVersion = process.env.WABA_API_VERSION || 'v21.0'

    if (!phoneNumberId || !accessToken) {
      logger.warn('WhatsApp Business API not configured, skipping CTA send')
      return { skipped: true, reason: 'not_configured' }
    }

    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: { type: 'text', text: payload.headerText },
          body: { text: payload.bodyText },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: payload.buttonText,
              url: payload.url,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    logger.info({ to: payload.to, messageId: response.data?.messages?.[0]?.id }, 'WhatsApp CTA sent')
    return response.data
  }

  async sendWalletPush(payload: WalletPushPayload): Promise<any> {
    const pushUrl = process.env.WALLET_PUSH_URL || process.env.OFFER_PUSH_URL
    const pushApiKey = process.env.WALLET_PUSH_API_KEY || process.env.OFFER_PUSH_API_KEY

    if (!pushUrl) {
      logger.warn('Wallet push not configured, skipping push')
      return { skipped: true, reason: 'not_configured' }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (pushApiKey) headers['x-api-key'] = pushApiKey

    const response = await axios.post(
      pushUrl,
      {
        type: payload.type || 'issuance',
        title: payload.title || 'New Credential Offer',
        body: payload.body || 'Tap to open your credential offer.',
        offerUri: payload.offerUri,
        actionUrl: payload.actionUrl,
      },
      { headers }
    )

    logger.info({ pushUrl }, 'Wallet push sent')
    return response.data
  }
}

export const notificationService = new NotificationService()

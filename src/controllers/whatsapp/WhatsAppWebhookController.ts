import { Controller, Post, Get, Route, Tags, Body, Request, Query } from 'tsoa'
import { Request as ExRequest } from 'express'
import { rootLogger } from '../../utils/pinoLogger'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import axios from 'axios'

const logger = rootLogger.child({ module: 'WhatsAppWebhookController' })

export interface WhatsAppWebhookPayload {
    object: string
    entry: {
        id: string
        changes: {
            value: {
                messaging_product: string
                metadata: {
                    display_phone_number: string
                    phone_number_id: string
                }
                contacts?: {
                    profile: {
                        name: string
                    }
                    wa_id: string
                }[]
                messages?: {
                    from: string
                    id: string
                    timestamp: string
                    type: string
                    text?: {
                        body: string
                    }
                    interactive?: {
                        type: string
                        button_reply?: {
                            id: string
                            title: string
                        }
                    }
                }[]
            }
            field: string
        }[]
    }[]
}

@Route('wa')
@Tags('WhatsApp')
export class WhatsAppWebhookController extends Controller {

    /**
     * WhatsApp Webhook Verification
     * Handles the GET challenge from Meta to verify the webhook URL.
     */
    @Get('webhook')
    public async verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string
    ): Promise<any> {
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'credo-wa-verifier'

        if (mode === 'subscribe' && token === verifyToken) {
            logger.info('WhatsApp webhook verified successfully')
            // Return challenge as plain text
            // TSOA might try to JSONify this, so we manipulate response directly if needed
            // but returning string usually works.
            return challenge // Note: TSOA wraps string in quotes in JSON, often need raw response
        } else {
            logger.warn({ mode, token }, 'WhatsApp webhook verification failed')
            this.setStatus(403)
            return 'Forbidden'
        }
    }

    /**
     * WhatsApp Webhook Event Handler
     * Receives incoming messages and statuses.
     */
    @Post('webhook')
    public async handleWebhook(
        @Body() payload: WhatsAppWebhookPayload,
        @Request() request: ExRequest
    ): Promise<any> {
        try {
            logger.info({ payload: JSON.stringify(payload) }, 'Received WhatsApp webhook')

            if (payload.object !== 'whatsapp_business_account') {
                return { status: 'ignored' }
            }

            for (const entry of payload.entry) {
                for (const change of entry.changes) {
                    const value = change.value
                    if (value.messages && value.messages.length > 0) {
                        const message = value.messages[0]
                        const from = message.from
                        const name = value.contacts?.[0]?.profile?.name || 'User'

                        // Handle simple text message "hi" or "menu" to start
                        if (message.type === 'text') {
                            const body = message.text?.body.toLowerCase().trim()
                            if (body === 'hi' || body === 'hello' || body === 'menu') {
                                await this.sendWelcomeMessage(from)
                            } else if (body?.startsWith('cart')) {
                                // If they type 'cart', show cart or create one
                                // In real flow, they click a wa.me link which we can't fully simulate in text
                                await this.replyText(from, `Your cart is empty. Click a catalog link to start shopping!`)
                            }
                        }

                        // Handle interactive button replies
                        if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply?.id
                            if (buttonId === 'view_catalog') {
                                await this.replyText(from, 'Visit our catalog at: http://localhost:5000/catalog')
                            }
                        }
                    }
                }
            }

            return { status: 'processed' }
        } catch (error: any) {
            logger.error({ error: error.message }, 'WhatsApp webhook error')
            return { status: 'error', message: error.message }
        }
    }

    // Mock sending message back to WhatsApp
    private async sendWelcomeMessage(to: string) {
        // In production, call actual WhatsApp API
        // POST https://graph.facebook.com/v17.0/PHONE_NUMBER_ID/messages

        logger.info({ to }, 'Sending Welcome Message')

        // Mock response for now (would be an axios call)
        /*
        await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.WABA_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: { name: "hello_world", language: { code: "en_US" } }
            },
            { headers: { Authorization: `Bearer ${process.env.WABA_TOKEN}` } }
        )
        */

        // Just log action for MVP
    }

    private async replyText(to: string, body: string) {
        logger.info({ to, body }, 'Sending WhatsApp Reply')
    }
}

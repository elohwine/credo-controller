/**
 * IdenEx Credentis - External Integration Actions
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Workflow actions for integrating with external services:
 * - REST API calls to arbitrary endpoints
 * - Provider-based calls (EcoCash, InnBucks, SMS, etc.)
 * - Payment initiation via mobile money
 * - Multi-channel notifications (WhatsApp, email, SMS)
 * 
 * @module services/workflow/actions/ExternalActions
 * @copyright 2024-2026 IdenEx Credentis
 */

import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'
import { v4 as uuid } from 'uuid'
import { notificationService } from '../../NotificationService'

const logger = rootLogger.child({ module: 'ExternalActions' })

export class ExternalActions {
    /**
     * Fetches data from an external API
     * 
     * Config:
     * - url: string (API endpoint)
     * - method: 'GET' | 'POST' (default: GET)
     * - headers: Record<string, string>
     * - body: any (for POST requests)
     * - stateKey: string (where to store the response, default: 'externalData')
     */
    static async fetchExternal(context: WorkflowActionContext, config: any = {}) {
        const { url, method = 'GET', headers = {}, body, stateKey = 'externalData' } = config

        logger.info({ url, method }, 'Fetching from external API')

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: body ? JSON.stringify(body) : undefined,
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            context.state[stateKey] = data
            logger.info({ stateKey }, 'External API call successful')
        } catch (error: any) {
            logger.error({ error: error.message, url }, 'External API call failed')
            throw new Error(`External API call failed: ${error.message}`)
        }
    }

    /**
     * Call a configured service provider
     * 
     * Config:
     * - providerId: string (ID of the provider, e.g., 'ecocash-zw')
     * - configId?: string (specific config ID, or uses default)
     * - endpoint: string (path appended to provider baseUrl)
     * - method: 'GET' | 'POST' | 'PUT' | 'DELETE' (default: POST)
     * - bodyMapping: Record<string, string> (map context values to request body)
     * - stateKey: string (where to store response, default: 'providerResponse')
     */
    static async callProvider(context: WorkflowActionContext, config: any = {}) {
        const { providerId, endpoint = '', method = 'POST', bodyMapping = {}, stateKey = 'providerResponse' } = config

        if (!providerId) {
            throw new Error('callProvider requires providerId in config')
        }

        if (!context.getProviderConfig) {
            throw new Error('Provider config helper not available in context')
        }

        // Get provider config
        const providerConfig = await context.getProviderConfig(providerId)
        const { config: secrets } = providerConfig

        // Import provider repository to get base URL
        const { providerRepository } = await import('../../../persistence/ProviderRepository')
        const provider = providerRepository.findProviderById(providerId)

        if (!provider) {
            throw new Error(`Provider not found: ${providerId}`)
        }

        // Build request body from mapping
        const requestBody: any = {}
        for (const [key, path] of Object.entries(bodyMapping)) {
            const pathParts = (path as string).split('.')
            let value: any = context
            for (const p of pathParts) {
                value = value?.[p]
            }
            requestBody[key] = value
        }

        // Build headers based on auth type
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }

        if (provider.authType === 'api_key' && secrets.apiKey) {
            headers['X-API-KEY'] = secrets.apiKey
        } else if (provider.authType === 'basic' && secrets.user && secrets.password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${secrets.user}:${secrets.password}`).toString('base64')
        } else if (provider.authType === 'oauth2' && secrets.accessToken) {
            headers['Authorization'] = `Bearer ${secrets.accessToken}`
        }

        const url = `${provider.baseUrl}${endpoint}`
        logger.info({ providerId, url, method }, 'Calling provider')

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: method !== 'GET' ? JSON.stringify(requestBody) : undefined
            })

            const responseData = await response.json().catch(() => ({}))

            if (!response.ok) {
                throw new Error(`Provider API error ${response.status}: ${JSON.stringify(responseData)}`)
            }

            context.state[stateKey] = {
                success: true,
                data: responseData,
                providerId,
                environment: providerConfig.environment
            }

            logger.info({ providerId, stateKey }, 'Provider call successful')
        } catch (error: any) {
            logger.error({ error: error.message, providerId }, 'Provider call failed')
            throw new Error(`Provider ${providerId} call failed: ${error.message}`)
        }
    }

    /**
   * Calls EcoCash C2B payment API
   * 
   * Config:
   * - apiKey: string (EcoCash API key)
   * - sandboxMode: boolean (default: true)
   * - callbackUrl: string (webhook URL for payment status updates)
   */
    static async initiateEcoCashPayment(context: WorkflowActionContext, config: any = {}) {
        const { apiKey, sandboxMode = true, callbackUrl } = config
        const { customerMsisdn, amount, currency = 'USD', reason, sourceReference } = context.input

        if (!apiKey) {
            throw new Error('EcoCash API key is required')
        }

        // Use provided callback URL or construct from environment
        const webhookUrl = callbackUrl ||
            process.env.NGROK_URL ? `${process.env.NGROK_URL}/webhooks/ecocash` :
            process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/webhooks/ecocash` :
                'http://localhost:3000/webhooks/ecocash'

        const endpoint = sandboxMode
            ? 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/instant/c2b/sandbox'
            : 'https://developers.ecocash.co.zw/api/ecocash_pay/api/v2/payment/instant/c2b'

        logger.info({ endpoint, amount, currency, webhookUrl }, 'Initiating EcoCash payment')

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customerMsisdn,
                    amount: Number(amount.toFixed(2)), // Ensure 2 decimal places
                    reason: reason || `Payment for ${sourceReference}`,
                    currency,
                    sourceReference: sourceReference || uuid()
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`EcoCash API error ${response.status}: ${errorText}`)
            }

            const responseData = await response.json()

            context.state.ecocashPayment = {
                status: 'pending',
                sourceReference: sourceReference || `PAY-${Date.now()}`,
                webhookUrl,
                ecocashResponse: responseData
            }

            logger.info({ sourceReference, webhookUrl }, 'EcoCash payment initiated')
        } catch (error: any) {
            // const errorData = error.response?.data || error.message // axios specific
            logger.error({ error: error.message }, 'EcoCash payment initiation failed')
            throw new Error(`EcoCash payment failed: ${error.message}`)
        }
    }

    /**
     * Send notification (email/SMS) via configured provider
     * 
     * Config:
     * - type: 'email' | 'sms'
     * - providerId?: string (uses default notification provider if not specified)
     * - to: string or mapping path
     * - subject?: string (for email)
     * - template?: string (template name)
     * - data?: Record<string, string> (mapping for template variables)
     */
    static async sendNotification(context: WorkflowActionContext, config: any = {}) {
        const {
            type = 'email',
            providerId,
            endpoint,
            method,
            to,
            subject,
            message,
            template,
            ctaUrl,
            ctaText,
            ctaHeader,
            ctaBody,
            offerUri,
            data = {}
        } = config

        logger.info({ type, to, template }, 'Sending notification')

        // Resolve 'to' if it's a path
        let recipient = to
        if (to && to.startsWith('input.') || to.startsWith('state.')) {
            const path = to.split('.')
            let value: any = context
            for (const p of path) {
                value = value?.[p]
            }
            recipient = value
        }

        // Resolve template data
        const templateData: Record<string, any> = {}
        for (const [key, path] of Object.entries(data)) {
            const pathParts = (path as string).split('.')
            let value: any = context
            for (const p of pathParts) {
                value = value?.[p]
            }
            templateData[key] = value
        }

        const resolvedTemplate = template
            ? ExternalActions.applyTemplate(template, templateData)
            : undefined

        const resolvedMessage = resolvedTemplate || message

        let providerResponse: any

        if (type === 'whatsapp') {
            if (!recipient) throw new Error('WhatsApp notification requires recipient')

            if (resolvedMessage) {
                await notificationService.sendWhatsAppText({
                    to: recipient,
                    body: resolvedMessage,
                    previewUrl: true,
                })
            }

            if (ctaUrl) {
                providerResponse = await notificationService.sendWhatsAppCta({
                    to: recipient,
                    headerText: ctaHeader || 'Credentis',
                    bodyText: ctaBody || resolvedMessage || 'Tap below to continue',
                    buttonText: ctaText || 'Open',
                    url: ctaUrl,
                })
            }
        } else if (type === 'email') {
            if (!recipient || !subject) throw new Error('Email notification requires recipient and subject')
            providerResponse = await notificationService.sendEmail({
                to: recipient,
                subject,
                text: resolvedMessage,
                html: resolvedTemplate ? ExternalActions.wrapEmailHtml(resolvedTemplate) : undefined,
            })
        } else if (type === 'wallet_push') {
            providerResponse = await notificationService.sendWalletPush({
                offerUri: offerUri || (resolvedMessage || undefined),
                title: subject || 'New Credential Offer',
                body: resolvedMessage || 'Tap to open your credential offer.',
                actionUrl: ctaUrl,
                type: 'issuance',
            })
        } else if (type === 'sms') {
            if (!providerId) {
                logger.warn('SMS notification requires providerId; skipping')
            } else {
                await ExternalActions.callProvider(context, {
                    providerId,
                    endpoint: endpoint || '/messages',
                    method: method || 'POST',
                    bodyMapping: {
                        to: to || 'input.phone',
                        message: message || 'state.message'
                    },
                    stateKey: 'smsNotification'
                })
            }
        } else {
            logger.warn({ type }, 'Unknown notification type, skipping')
        }

        context.state.notification = {
            type,
            recipient,
            subject,
            template,
            message: resolvedMessage,
            data: templateData,
            status: 'sent',
            providerResponse,
            timestamp: new Date().toISOString()
        }

        logger.info({ type, recipient }, 'Notification processed')
    }

    private static applyTemplate(template: string, data: Record<string, any>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = data[key]
            return value !== undefined && value !== null ? String(value) : ''
        })
    }

    private static wrapEmailHtml(content: string): string {
        return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.4; color: #1f2937;">
    <div style="max-width: 640px; margin: 0 auto; padding: 16px;">
      <h2 style="color: #0f766e;">IdenEx Credentis</h2>
      <div>${content}</div>
      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
        Verifiable Trust Infrastructure for Africa's Digital Economy
      </p>
    </div>
  </body>
</html>`
    }
}

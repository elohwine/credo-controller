import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

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
}

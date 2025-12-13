import { Controller, Post, Route, Tags, Body, Request, Security, Header } from 'tsoa'
import { Request as ExRequest } from 'express'
import { workflowService } from '../../services/WorkflowService'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'EcoCashWebhookController' })

interface EcoCashWebhookPayload {
    paymentRequestId?: string
    status: string
    transactionId?: string
    amount?: number
    currency?: string
    sourceReference?: string
    metadata?: any
}

@Route('webhooks')
@Tags('Webhooks')
export class EcoCashWebhookController extends Controller {
    /**
     * EcoCash webhook endpoint for payment status updates
     * This endpoint is called by EcoCash when payment status changes
     */
    @Post('ecocash')
    public async handleEcoCashWebhook(
        @Body() payload: EcoCashWebhookPayload,
        @Header('X-API-KEY') apiKey?: string,
        @Request() request?: ExRequest
    ): Promise<any> {
        try {
            logger.info({ payload }, 'Received EcoCash webhook')

            // Validate API key (simple validation - in production use HMAC)
            const expectedApiKey = process.env.ECOCASH_WEBHOOK_SECRET || 'test-webhook-secret'
            if (apiKey !== expectedApiKey) {
                logger.warn({ providedKey: apiKey }, 'Invalid webhook API key')
                this.setStatus(401)
                return { error: 'Unauthorized' }
            }

            // Check if payment was successful
            if (payload.status === 'SUCCESS' || payload.status === 'COMPLETED') {
                logger.info({ sourceReference: payload.sourceReference }, 'Payment successful, triggering Receipt workflow')

                // Execute the Receipt workflow
                try {
                    const result = await workflowService.executeWorkflow(
                        'finance-receipt-v1',
                        {
                            transactionId: payload.transactionId,
                            amount: payload.amount,
                            currency: payload.currency || 'USD',
                            sourceReference: payload.sourceReference,
                            paymentRequestId: payload.paymentRequestId,
                            metadata: payload.metadata
                        },
                        'default'
                    )

                    logger.info({ result }, 'Receipt workflow executed successfully')

                    return {
                        status: 'acknowledged',
                        receiptGenerated: true,
                        offer: result.offer
                    }
                } catch (workflowError: any) {
                    logger.error({ error: workflowError.message }, 'Failed to execute Receipt workflow')
                    // Still acknowledge the webhook to prevent retries
                    return {
                        status: 'acknowledged',
                        receiptGenerated: false,
                        error: workflowError.message
                    }
                }
            } else {
                logger.info({ status: payload.status }, 'Payment not successful, no action taken')
                return {
                    status: 'acknowledged',
                    receiptGenerated: false,
                    reason: `Payment status is ${payload.status}`
                }
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Webhook processing error')
            this.setStatus(500)
            return { error: error.message }
        }
    }
}

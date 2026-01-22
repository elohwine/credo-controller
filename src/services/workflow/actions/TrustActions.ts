/**
 * IdenEx Credentis - Trust Scoring Actions
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Workflow actions for managing merchant/agent trust scores.
 * Trust scores are built from verifiable transaction history and
 * used for credit eligibility, partnership decisions, and reputation.
 * 
 * Supported events:
 * - payment_completed (+1) - Successful payment received
 * - delivery_confirmed (+2) - Goods/service delivered
 * - dispute_filed (-3) - Customer raised dispute
 * - dispute_resolved (+1) - Dispute resolved favorably
 * - refund_issued (-1) - Refund processed
 * - positive_review (+1) - Good customer feedback
 * 
 * @module services/workflow/actions/TrustActions
 * @copyright 2024-2026 IdenEx Credentis
 */

import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'TrustActions' })

export class TrustActions {
    /**
     * Update merchant/agent trust score based on workflow events
     * 
     * Config:
     * - event: string (e.g., 'payment_completed', 'delivery_confirmed', 'dispute_filed')
     * - weight: number (positive for good events, negative for bad)
     * - subjectDidPath: string (path to DID in context)
     */
    static async updateScore(context: WorkflowActionContext, config: any = {}) {
        const { event, weight = 1, subjectDidPath = 'input.merchantDid' } = config

        // Extract subject DID from context
        const pathParts = subjectDidPath.split('.')
        let subjectDid: any = context
        for (const p of pathParts) {
            subjectDid = subjectDid?.[p]
        }

        if (!subjectDid) {
            logger.warn({ event }, 'No subject DID found for trust update')
            return
        }

        logger.info({ subjectDid, event, weight }, 'Updating trust score')

        // Import trust repository
        const { trustRepository } = await import('../../../persistence/TrustRepository')

        // Record the event
        await trustRepository.recordEvent({
            subjectDid,
            event,
            weight,
            workflowId: context.workflowId,
            runId: context.runId,
            tenantId: context.tenantId,
            metadata: {
                transactionId: context.input?.transactionId,
                amount: context.input?.amount
            }
        })

        // Get updated score
        const score = await trustRepository.calculateScore(subjectDid)

        context.state.trustScore = {
            subjectDid,
            score: score.score,
            level: score.level,
            eventCount: score.eventCount
        }

        logger.info({ subjectDid, score: score.score, level: score.level }, 'Trust score updated')
    }

    /**
     * Calculate credit score from verified receipt VCs
     * 
     * Config:
     * - minReceipts: number
     * - lookbackDays: number
     * - maxEligibleAmount: number
     */
    static async calculateCreditScore(context: WorkflowActionContext, config: any = {}) {
        const { minReceipts = 3, lookbackDays = 90, maxEligibleAmount = 10000 } = config
        const { applicantDid, requestedAmount } = context.input

        logger.info({ applicantDid, requestedAmount }, 'Calculating credit score')

        // Get verified receipts from state (set by credential.verify_presentation)
        const verifiedReceipts = context.state.verifiedReceipts || []

        if (verifiedReceipts.length < minReceipts) {
            context.state.creditScore = {
                eligible: false,
                score: 0,
                reason: `Insufficient payment history (${verifiedReceipts.length}/${minReceipts} receipts)`
            }
            return
        }

        // Calculate score based on receipt volume and frequency
        const totalVolume = verifiedReceipts.reduce((sum: number, r: any) => sum + (r.amount || 0), 0)
        const avgTransaction = totalVolume / verifiedReceipts.length

        // Simple scoring algorithm (can be enhanced)
        let score = 0

        // Volume score (0-40 points)
        score += Math.min(40, (totalVolume / 1000) * 10)

        // Frequency score (0-30 points)
        score += Math.min(30, verifiedReceipts.length * 3)

        // Consistency score (0-30 points based on variance)
        const avgDeviation = verifiedReceipts.reduce((sum: number, r: any) => {
            return sum + Math.abs((r.amount || 0) - avgTransaction)
        }, 0) / verifiedReceipts.length
        const consistencyScore = Math.max(0, 30 - (avgDeviation / avgTransaction) * 30)
        score += consistencyScore

        // Normalize to 0-100
        score = Math.min(100, Math.round(score))

        // Calculate eligible amount based on score
        const eligibilityMultiplier = score / 100
        const eligibleAmount = Math.min(maxEligibleAmount, avgTransaction * 3 * eligibilityMultiplier)

        // Check if requested amount is within eligible range
        const eligible = requestedAmount <= eligibleAmount

        // Set validity period
        const validUntil = new Date()
        validUntil.setDate(validUntil.getDate() + 30)

        context.state.creditScore = {
            eligible,
            score,
            eligibleAmount: Math.round(eligibleAmount * 100) / 100,
            requestedAmount,
            verifiedReceiptCount: verifiedReceipts.length,
            totalVolume,
            avgTransaction: Math.round(avgTransaction * 100) / 100,
            validUntil: validUntil.toISOString()
        }

        logger.info({
            applicantDid,
            score,
            eligible,
            eligibleAmount
        }, 'Credit score calculated')
    }

    /**
     * Get trust score for a subject
     */
    static async getScore(context: WorkflowActionContext, config: any = {}) {
        const { subjectDidPath = 'input.subjectDid' } = config

        const pathParts = subjectDidPath.split('.')
        let subjectDid: any = context
        for (const p of pathParts) {
            subjectDid = subjectDid?.[p]
        }

        if (!subjectDid) {
            throw new Error('No subject DID provided for trust score lookup')
        }

        const { trustRepository } = await import('../../../persistence/TrustRepository')
        const score = await trustRepository.calculateScore(subjectDid)

        context.state.trustScore = score
    }
}

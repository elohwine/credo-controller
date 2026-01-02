/**
 * Trust Engine Service
 * 
 * Computes merchant trust scores based on weighted drivers:
 * - KYC Attestation (RegulatorVC presence)
 * - Payment History (volume, on-time fulfillment)
 * - Dispute Rate
 * - Delivery Success
 * - Reviews
 * - Tenure
 */

import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'TrustEngine' })

export interface TrustDriver {
    name: string
    weight: number  // 0-1, sum of all weights should be ~1
    value: number   // Normalized 0-100
    sourceVcId?: string
    evidence?: string
}

export interface TrustScore {
    merchantId: string
    score: number   // 0-100
    drivers: TrustDriver[]
    lastComputed: string
}

export interface TrustEvent {
    id: string
    merchantId: string
    eventType: 'payment' | 'dispute' | 'refund' | 'kyc_attestation' | 'review' | 'delivery'
    eventData?: any
    impact: number
    createdAt: string
}

// Default driver weights
const DEFAULT_WEIGHTS = {
    kyc_attestation: 0.30,
    payment_history: 0.25,
    dispute_rate: 0.20,
    delivery_success: 0.10,
    reviews: 0.10,
    tenure: 0.05
}

export class TrustEngine {

    /**
     * Record a trust-relevant event for a merchant
     */
    recordEvent(merchantId: string, eventType: TrustEvent['eventType'], data?: any, impact?: number): TrustEvent {
        const db = DatabaseManager.getDatabase()
        const event: TrustEvent = {
            id: `EVT-${randomUUID()}`,
            merchantId,
            eventType,
            eventData: data,
            impact: impact ?? this.calculateDefaultImpact(eventType),
            createdAt: new Date().toISOString()
        }

        db.prepare(`
            INSERT INTO trust_events (id, merchant_id, event_type, event_data, impact, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(event.id, event.merchantId, event.eventType, JSON.stringify(event.eventData), event.impact, event.createdAt)

        logger.info({ merchantId, eventType, impact: event.impact }, 'Trust event recorded')
        return event
    }

    /**
     * Compute trust score for a merchant
     */
    computeScore(merchantId: string): TrustScore {
        const db = DatabaseManager.getDatabase()

        // Get all events for this merchant
        const events = db.prepare(`
            SELECT * FROM trust_events WHERE merchant_id = ? ORDER BY created_at DESC
        `).all(merchantId) as any[]

        // Compute individual driver scores
        const drivers: TrustDriver[] = []

        // 1. KYC Attestation (check for recent KYC events)
        const kycEvents = events.filter(e => e.event_type === 'kyc_attestation')
        const kycScore = kycEvents.length > 0 ? 100 : 0
        drivers.push({
            name: 'KYC Attestation',
            weight: DEFAULT_WEIGHTS.kyc_attestation,
            value: kycScore,
            evidence: kycEvents.length > 0 ? `${kycEvents.length} attestation(s)` : 'No attestation'
        })

        // 2. Payment History
        const paymentEvents = events.filter(e => e.event_type === 'payment')
        const paymentScore = Math.min(100, paymentEvents.length * 5) // 20 payments = 100
        drivers.push({
            name: 'Payment History',
            weight: DEFAULT_WEIGHTS.payment_history,
            value: paymentScore,
            evidence: `${paymentEvents.length} successful payments`
        })

        // 3. Dispute Rate (negative driver)
        const disputeEvents = events.filter(e => e.event_type === 'dispute')
        const refundEvents = events.filter(e => e.event_type === 'refund')
        const totalTransactions = paymentEvents.length || 1
        const disputeRate = (disputeEvents.length + refundEvents.length) / totalTransactions
        const disputeScore = Math.max(0, 100 - (disputeRate * 500)) // 20% disputes = 0 score
        drivers.push({
            name: 'Dispute Rate',
            weight: DEFAULT_WEIGHTS.dispute_rate,
            value: disputeScore,
            evidence: `${disputeEvents.length} disputes, ${refundEvents.length} refunds`
        })

        // 4. Delivery Success
        const deliveryEvents = events.filter(e => e.event_type === 'delivery')
        const deliveryScore = Math.min(100, deliveryEvents.length * 10)
        drivers.push({
            name: 'Delivery Success',
            weight: DEFAULT_WEIGHTS.delivery_success,
            value: deliveryScore,
            evidence: `${deliveryEvents.length} verified deliveries`
        })

        // 5. Reviews
        const reviewEvents = events.filter(e => e.event_type === 'review')
        const avgReview = reviewEvents.length > 0
            ? reviewEvents.reduce((sum, e) => sum + (JSON.parse(e.event_data || '{}').rating || 3), 0) / reviewEvents.length
            : 3
        const reviewScore = (avgReview / 5) * 100
        drivers.push({
            name: 'Customer Reviews',
            weight: DEFAULT_WEIGHTS.reviews,
            value: reviewScore,
            evidence: reviewEvents.length > 0 ? `${reviewEvents.length} reviews, avg ${avgReview.toFixed(1)}/5` : 'No reviews'
        })

        // 6. Tenure
        const oldestEvent = events[events.length - 1]
        const tenureDays = oldestEvent
            ? Math.floor((Date.now() - new Date(oldestEvent.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : 0
        const tenureScore = Math.min(100, tenureDays * 0.5) // 200 days = 100
        drivers.push({
            name: 'Platform Tenure',
            weight: DEFAULT_WEIGHTS.tenure,
            value: tenureScore,
            evidence: `${tenureDays} days on platform`
        })

        // Calculate weighted score
        const totalScore = drivers.reduce((sum, d) => sum + (d.weight * d.value), 0)
        const timestamp = new Date().toISOString()

        // Save to database
        db.prepare(`
            INSERT OR REPLACE INTO trust_scores (merchant_id, score, drivers, last_computed)
            VALUES (?, ?, ?, ?)
        `).run(merchantId, totalScore, JSON.stringify(drivers), timestamp)

        logger.info({ merchantId, score: totalScore }, 'Trust score computed')

        return {
            merchantId,
            score: Math.round(totalScore * 10) / 10,
            drivers,
            lastComputed: timestamp
        }
    }

    /**
     * Get cached trust score (or compute if stale)
     */
    getScore(merchantId: string, maxAgeMinutes: number = 60): TrustScore | null {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare('SELECT * FROM trust_scores WHERE merchant_id = ?').get(merchantId) as any

        if (!row) {
            return this.computeScore(merchantId)
        }

        // Check if stale
        const age = Date.now() - new Date(row.last_computed).getTime()
        if (age > maxAgeMinutes * 60 * 1000) {
            return this.computeScore(merchantId)
        }

        return {
            merchantId: row.merchant_id,
            score: row.score,
            drivers: JSON.parse(row.drivers || '[]'),
            lastComputed: row.last_computed
        }
    }

    private calculateDefaultImpact(eventType: TrustEvent['eventType']): number {
        switch (eventType) {
            case 'payment': return 5
            case 'dispute': return -15
            case 'refund': return -10
            case 'kyc_attestation': return 30
            case 'review': return 3
            case 'delivery': return 5
            default: return 0
        }
    }
}

// Singleton
export const trustEngine = new TrustEngine()

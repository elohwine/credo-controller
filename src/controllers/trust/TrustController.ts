import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { trustEngine, TrustScore, TrustEvent } from '../../services/TrustEngine'

export interface RecordEventRequest {
    eventType: 'payment' | 'dispute' | 'refund' | 'kyc_attestation' | 'review' | 'delivery'
    eventData?: any
    impact?: number
}

@Route('api/trust')
@Tags('Trust Engine')
export class TrustController extends Controller {

    /**
     * Get trust score for a merchant.
     * Returns cached score if fresh, otherwise recomputes.
     */
    @Get('{merchantId}')
    public async getTrustScore(
        @Path() merchantId: string,
        @Query() maxAgeMinutes?: number
    ): Promise<TrustScore> {
        const score = trustEngine.getScore(merchantId, maxAgeMinutes || 60)

        if (!score) {
            this.setStatus(404)
            throw new Error(`No trust data for merchant ${merchantId}`)
        }

        return score
    }

    /**
     * Force recompute trust score for a merchant.
     */
    @Post('{merchantId}/compute')
    public async computeTrustScore(
        @Path() merchantId: string
    ): Promise<TrustScore> {
        return trustEngine.computeScore(merchantId)
    }

    /**
     * Record a trust-relevant event for a merchant.
     * This affects the merchant's trust score on next computation.
     */
    @Post('{merchantId}/events')
    public async recordEvent(
        @Path() merchantId: string,
        @Body() body: RecordEventRequest
    ): Promise<TrustEvent> {
        const event = trustEngine.recordEvent(
            merchantId,
            body.eventType,
            body.eventData,
            body.impact
        )

        this.setStatus(201)
        return event
    }

    /**
     * Get trust card data (summary for UI display)
     */
    @Get('{merchantId}/card')
    public async getTrustCard(
        @Path() merchantId: string
    ): Promise<{
        merchantId: string
        score: number
        badge: 'gold' | 'silver' | 'bronze' | 'new'
        topDrivers: { name: string, value: number, icon: string }[]
        lastUpdated: string
    }> {
        const trustScore = trustEngine.getScore(merchantId, 60)

        if (!trustScore) {
            return {
                merchantId,
                score: 0,
                badge: 'new',
                topDrivers: [],
                lastUpdated: new Date().toISOString()
            }
        }

        // Determine badge
        let badge: 'gold' | 'silver' | 'bronze' | 'new' = 'new'
        if (trustScore.score >= 80) badge = 'gold'
        else if (trustScore.score >= 60) badge = 'silver'
        else if (trustScore.score >= 40) badge = 'bronze'

        // Get top 3 drivers
        const sortedDrivers = [...trustScore.drivers].sort((a, b) => b.value - a.value)
        const topDrivers = sortedDrivers.slice(0, 3).map(d => ({
            name: d.name,
            value: Math.round(d.value),
            icon: this.getDriverIcon(d.name)
        }))

        return {
            merchantId,
            score: Math.round(trustScore.score),
            badge,
            topDrivers,
            lastUpdated: trustScore.lastComputed
        }
    }

    private getDriverIcon(driverName: string): string {
        const icons: Record<string, string> = {
            'KYC Attestation': '✓',
            'Payment History': '💳',
            'Dispute Rate': '⚖️',
            'Delivery Success': '📦',
            'Customer Reviews': '⭐',
            'Platform Tenure': '🕐'
        }
        return icons[driverName] || '📊'
    }
}

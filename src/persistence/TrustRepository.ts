/**
 * IdenEx Credentis - Trust Repository
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Persistence layer for trust/reputation scoring system.
 * Stores trust events (payments, deliveries, disputes) and calculates
 * aggregate scores used for credit eligibility and partnership decisions.
 * 
 * Score Levels:
 * - new (0-20): New merchant, limited history
 * - bronze (21-40): Established, some track record  
 * - silver (41-60): Good standing, reliable
 * - gold (61-80): Excellent reputation
 * - platinum (81-100): Top-tier, premium trust
 * 
 * @module persistence/TrustRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

const logger = rootLogger.child({ module: 'TrustRepository' })

export interface TrustEvent {
    id?: string
    subjectDid: string
    event: string
    weight: number
    workflowId?: string
    runId?: string
    tenantId: string
    metadata?: Record<string, any>
    createdAt?: Date
}

export interface TrustScore {
    subjectDid: string
    score: number
    level: 'new' | 'bronze' | 'silver' | 'gold' | 'platinum'
    eventCount: number
    positiveEvents: number
    negativeEvents: number
    lastEventAt?: Date
}

// Event weight defaults
export const TRUST_EVENT_WEIGHTS: Record<string, number> = {
    // Positive events
    'payment_completed': 5,
    'delivery_confirmed': 5,
    'receipt_issued': 3,
    'verification_passed': 10,
    'credential_accepted': 2,
    'dispute_resolved_seller': 5,
    'repeat_customer': 3,

    // Negative events
    'payment_failed': -3,
    'dispute_filed': -5,
    'dispute_resolved_buyer': -10,
    'refund_requested': -2,
    'delivery_late': -2,
    'credential_revoked': -15,
    'fraud_reported': -50
}

export class TrustRepository {
    /**
     * Record a trust event for a subject
     */
    async recordEvent(event: TrustEvent): Promise<TrustEvent> {
        const db = DatabaseManager.getDatabase()
        const id = event.id || uuid()

        // Use default weight if known event type
        const weight = event.weight ?? TRUST_EVENT_WEIGHTS[event.event] ?? 0

        const stmt = db.prepare(`
            INSERT INTO trust_events (
                id, subject_did, event, weight, workflow_id, run_id, tenant_id, metadata
            ) VALUES (
                @id, @subjectDid, @event, @weight, @workflowId, @runId, @tenantId, @metadata
            )
        `)

        stmt.run({
            id,
            subjectDid: event.subjectDid,
            event: event.event,
            weight,
            workflowId: event.workflowId || null,
            runId: event.runId || null,
            tenantId: event.tenantId,
            metadata: event.metadata ? JSON.stringify(event.metadata) : null
        })

        logger.debug({ id, subjectDid: event.subjectDid, event: event.event, weight }, 'Trust event recorded')

        return { ...event, id, weight }
    }

    /**
     * Calculate trust score for a subject
     */
    async calculateScore(subjectDid: string): Promise<TrustScore> {
        const db = DatabaseManager.getDatabase()

        // Get aggregated stats
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as eventCount,
                SUM(CASE WHEN weight > 0 THEN 1 ELSE 0 END) as positiveEvents,
                SUM(CASE WHEN weight < 0 THEN 1 ELSE 0 END) as negativeEvents,
                SUM(weight) as totalWeight,
                MAX(created_at) as lastEventAt
            FROM trust_events
            WHERE subject_did = ?
        `).get(subjectDid) as any

        if (!stats || stats.eventCount === 0) {
            return {
                subjectDid,
                score: 0,
                level: 'new',
                eventCount: 0,
                positiveEvents: 0,
                negativeEvents: 0
            }
        }

        // Calculate score (0-100 scale with decay)
        // Base: sum of weights, capped and normalized
        const rawScore = stats.totalWeight || 0
        
        // Normalize: 100 points = ~50 positive events or equivalent weight
        // Score can go negative but we floor at 0
        let score = Math.max(0, Math.min(100, 50 + rawScore))

        // Apply recency bonus (more recent activity = slight boost)
        const daysSinceLastEvent = stats.lastEventAt
            ? (Date.now() - new Date(stats.lastEventAt).getTime()) / (1000 * 60 * 60 * 24)
            : 365

        if (daysSinceLastEvent < 7) {
            score = Math.min(100, score * 1.05)  // 5% recent activity bonus
        } else if (daysSinceLastEvent > 90) {
            score = score * 0.95  // 5% inactivity penalty
        }

        score = Math.round(score)

        // Determine level
        let level: TrustScore['level'] = 'new'
        if (score >= 90) level = 'platinum'
        else if (score >= 75) level = 'gold'
        else if (score >= 60) level = 'silver'
        else if (score >= 40) level = 'bronze'

        return {
            subjectDid,
            score,
            level,
            eventCount: stats.eventCount,
            positiveEvents: stats.positiveEvents || 0,
            negativeEvents: stats.negativeEvents || 0,
            lastEventAt: stats.lastEventAt ? new Date(stats.lastEventAt) : undefined
        }
    }

    /**
     * Get trust events for a subject
     */
    async getEvents(subjectDid: string, limit = 50): Promise<TrustEvent[]> {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
            SELECT id, subject_did as subjectDid, event, weight, workflow_id as workflowId,
                   run_id as runId, tenant_id as tenantId, metadata, created_at as createdAt
            FROM trust_events
            WHERE subject_did = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(subjectDid, limit) as any[]

        return rows.map(row => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }))
    }

    /**
     * Get leaderboard of top-scored subjects
     */
    async getLeaderboard(tenantId: string, limit = 20): Promise<TrustScore[]> {
        const db = DatabaseManager.getDatabase()

        // Get distinct subjects with their scores
        const subjects = db.prepare(`
            SELECT DISTINCT subject_did
            FROM trust_events
            WHERE tenant_id = ?
        `).all(tenantId) as any[]

        // Calculate score for each
        const scores: TrustScore[] = []
        for (const { subject_did } of subjects) {
            const score = await this.calculateScore(subject_did)
            scores.push(score)
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score)

        return scores.slice(0, limit)
    }

    /**
     * Update or create a trust score snapshot (for caching)
     */
    async updateScoreSnapshot(subjectDid: string, tenantId: string): Promise<TrustScore> {
        const db = DatabaseManager.getDatabase()
        const score = await this.calculateScore(subjectDid)

        const stmt = db.prepare(`
            INSERT INTO trust_scores (
                subject_did, tenant_id, score, level, event_count, positive_events, negative_events, updated_at
            ) VALUES (
                @subjectDid, @tenantId, @score, @level, @eventCount, @positiveEvents, @negativeEvents, CURRENT_TIMESTAMP
            )
            ON CONFLICT(subject_did) DO UPDATE SET
                score = @score,
                level = @level,
                event_count = @eventCount,
                positive_events = @positiveEvents,
                negative_events = @negativeEvents,
                updated_at = CURRENT_TIMESTAMP
        `)

        stmt.run({
            subjectDid,
            tenantId,
            score: score.score,
            level: score.level,
            eventCount: score.eventCount,
            positiveEvents: score.positiveEvents,
            negativeEvents: score.negativeEvents
        })

        return score
    }
}

export const trustRepository = new TrustRepository()

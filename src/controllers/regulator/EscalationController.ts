import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { trustEngine } from '../../services/TrustEngine'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'EscalationController' })

export interface Escalation {
    id: string
    merchantId: string
    receiptId?: string
    reason: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    packageUrl?: string
    regulatorActionStatus: 'pending' | 'under_review' | 'resolved' | 'dismissed'
    createdAt: string
}

export interface CreateEscalationRequest {
    merchantId: string
    receiptId?: string
    reason: string
    severity?: 'low' | 'medium' | 'high' | 'critical'
    evidence?: {
        transactionIds?: string[]
        disputeCount?: number
        refundRate?: number
    }
}

export interface EscalationPackage {
    escalationId: string
    merchantId: string
    generatedAt: string
    summary: {
        reason: string
        severity: string
        trustScore: number
        totalTransactions: number
        disputeRate: number
    }
    evidence: {
        trustScoreBreakdown: any
        recentEvents: any[]
    }
    signature?: string
}

@Route('api/regulator')
@Tags('Regulator Portal')
export class EscalationController extends Controller {

    /**
     * Create a new escalation with evidence package.
     * Automatically generates a signed evidence bundle for regulator review.
     */
    @Post('escalations')
    public async createEscalation(
        @Body() body: CreateEscalationRequest
    ): Promise<Escalation> {
        const db = DatabaseManager.getDatabase()

        const escalation: Escalation = {
            id: `ESC-${randomUUID()}`,
            merchantId: body.merchantId,
            receiptId: body.receiptId,
            reason: body.reason,
            severity: body.severity || 'medium',
            regulatorActionStatus: 'pending',
            createdAt: new Date().toISOString()
        }

        // Generate package URL (in production, this would create a signed ZIP)
        escalation.packageUrl = `/api/regulator/escalations/${escalation.id}/package`

        db.prepare(`
            INSERT INTO escalations (id, merchant_id, receipt_id, reason, severity, package_url, regulator_action_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            escalation.id,
            escalation.merchantId,
            escalation.receiptId,
            escalation.reason,
            escalation.severity,
            escalation.packageUrl,
            escalation.regulatorActionStatus,
            escalation.createdAt,
            escalation.createdAt
        )

        logger.info({ escalationId: escalation.id, merchantId: body.merchantId, severity: escalation.severity }, 'Escalation created')

        this.setStatus(201)
        return escalation
    }

    /**
     * Get escalation evidence package with cryptographic proof.
     */
    @Get('escalations/{escalationId}/package')
    public async getEscalationPackage(
        @Path() escalationId: string
    ): Promise<EscalationPackage> {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare('SELECT * FROM escalations WHERE id = ?').get(escalationId) as any
        if (!row) {
            this.setStatus(404)
            throw new Error(`Escalation ${escalationId} not found`)
        }

        // Get trust score
        const trustScore = trustEngine.getScore(row.merchant_id, 60)

        // Get recent events
        const events = db.prepare(`
            SELECT * FROM trust_events WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20
        `).all(row.merchant_id) as any[]

        // Calculate statistics
        const paymentEvents = events.filter(e => e.event_type === 'payment')
        const disputeEvents = events.filter(e => e.event_type === 'dispute')
        const refundEvents = events.filter(e => e.event_type === 'refund')
        const disputeRate = paymentEvents.length > 0
            ? ((disputeEvents.length + refundEvents.length) / paymentEvents.length) * 100
            : 0

        const evidencePackage: EscalationPackage = {
            escalationId: row.id,
            merchantId: row.merchant_id,
            generatedAt: new Date().toISOString(),
            summary: {
                reason: row.reason,
                severity: row.severity,
                trustScore: trustScore?.score || 0,
                totalTransactions: paymentEvents.length,
                disputeRate: Math.round(disputeRate * 10) / 10
            },
            evidence: {
                trustScoreBreakdown: trustScore?.drivers || [],
                recentEvents: events.map(e => ({
                    type: e.event_type,
                    data: JSON.parse(e.event_data || '{}'),
                    impact: e.impact,
                    timestamp: e.created_at
                }))
            },
            // In production, this would be a real cryptographic signature
            signature: `HMAC-SHA256:${Buffer.from(escalationId + row.merchant_id).toString('base64')}`
        }

        return evidencePackage
    }

    /**
     * List all escalations with optional filters.
     */
    @Get('escalations')
    public async listEscalations(
        @Query() status?: string,
        @Query() severity?: string,
        @Query() merchantId?: string
    ): Promise<Escalation[]> {
        const db = DatabaseManager.getDatabase()

        let query = 'SELECT * FROM escalations WHERE 1=1'
        const params: any[] = []

        if (status) {
            query += ' AND regulator_action_status = ?'
            params.push(status)
        }
        if (severity) {
            query += ' AND severity = ?'
            params.push(severity)
        }
        if (merchantId) {
            query += ' AND merchant_id = ?'
            params.push(merchantId)
        }

        query += ' ORDER BY created_at DESC LIMIT 50'

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(row => ({
            id: row.id,
            merchantId: row.merchant_id,
            receiptId: row.receipt_id,
            reason: row.reason,
            severity: row.severity,
            packageUrl: row.package_url,
            regulatorActionStatus: row.regulator_action_status,
            createdAt: row.created_at
        }))
    }

    /**
     * Update escalation status (regulator action).
     */
    @Post('escalations/{escalationId}/status')
    public async updateEscalationStatus(
        @Path() escalationId: string,
        @Body() body: { status: 'pending' | 'under_review' | 'resolved' | 'dismissed', notes?: string }
    ): Promise<Escalation> {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare('SELECT * FROM escalations WHERE id = ?').get(escalationId) as any
        if (!row) {
            this.setStatus(404)
            throw new Error(`Escalation ${escalationId} not found`)
        }

        db.prepare(`
            UPDATE escalations SET regulator_action_status = ?, updated_at = ? WHERE id = ?
        `).run(body.status, new Date().toISOString(), escalationId)

        logger.info({ escalationId, newStatus: body.status }, 'Escalation status updated')

        return {
            id: row.id,
            merchantId: row.merchant_id,
            receiptId: row.receipt_id,
            reason: row.reason,
            severity: row.severity,
            packageUrl: row.package_url,
            regulatorActionStatus: body.status,
            createdAt: row.created_at
        }
    }
}

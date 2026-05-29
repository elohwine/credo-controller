/**
 * ReconciliationService — Lean MVP Auto-Reconciliation Engine
 * 
 * Deterministic, event-driven reconciliation for the Quote → Invoice → Receipt → Revoke lifecycle.
 * 
 * Architecture:
 * - Append-only event log (reconciliation_events) — immutable audit trail
 * - Materialized status table (reconciliation_status) — recomputed on every event
 * - No cron jobs or batch processing — status is recalculated per event (event-sourcing pattern)
 * 
 * References:
 * - Stripe Payout Reconciliation: match on providerReference deterministically
 * - W3C StatusList2021: bit flip as lifecycle proof for VC consumption
 * - Event-driven fintech architectures: append-only event store as source of truth
 * 
 * @module services/ReconciliationService
 */

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { randomUUID } from 'crypto'

const logger = rootLogger.child({ module: 'ReconciliationService' })

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReconciliationEventType =
    | 'QUOTE_ISSUED'
    | 'INVOICE_ISSUED'
    | 'PAYMENT_SUCCESS'
    | 'RECEIPT_ISSUED'
    | 'DELIVERY_VERIFIED'
    | 'ESCROW_RELEASED'
    | 'PAYOUT_FAILED'
    | 'SETTLEMENT_CONFIRMED'
    | 'REFUNDED'
    | 'DISPUTED'
    | 'REQUISITION_CREATED'
    | 'REQUISITION_APPROVED'
    | 'REQUISITION_MANAGER_APPROVED'
    | 'REQUISITION_FINANCE_APPROVED'
    | 'REQUISITION_RELEASED'
    | 'EXECUTION_ACKNOWLEDGED'

export type ReconciliationStatus =
    | 'QUOTE_ISSUED'
    | 'INVOICE_ISSUED'
    | 'INITIATED'
    | 'PAID'
    | 'RECEIPT_ISSUED'
    | 'DELIVERED'
    | 'RECONCILED'
    | 'PAYOUT_FAILED'
    | 'AMOUNT_MISMATCH'
    | 'SETTLEMENT_MISSING'
    | 'DISPUTED'
    | 'REFUNDED'
    | 'REQUISITION_CREATED'
    | 'MANAGER_APPROVED'
    | 'APPROVED'
    | 'RELEASED'
    | 'ACKNOWLEDGED'

export interface ReconciliationEvent {
    id: string
    providerRef: string
    eventType: ReconciliationEventType
    source: string
    amount?: number
    currency?: string
    metadata?: Record<string, any>
    occurredAt: string
    createdAt: string
}

export interface ReconciliationStatusRecord {
    providerRef: string
    tenantId?: string
    status: ReconciliationStatus
    paymentAmount?: number
    settlementAmount?: number
    mismatchReason?: string
    eventCount: number
    firstEventAt?: string
    lastEventAt?: string
    updatedAt: string
}

export interface ReconciliationSummary {
    total: number
    reconciled: number
    paid: number
    receiptIssued: number
    delivered: number
    payoutFailed: number
    disputed: number
    refunded: number
    requisitionCreated: number
    requisitionApproved: number
    requisitionReleased: number
    requisitionAcknowledged: number
    other: number
}

export interface AuditTimelineItem {
    id: string
    providerRef: string
    kind: 'reconciliation' | 'workflow'
    eventType: string
    title: string
    source: string
    status?: string
    amount?: number
    currency?: string
    occurredAt: string
    details?: Record<string, unknown>
    evidenceImages?: string[]
}

export interface AuditTimelineResult {
    providerRef: string
    viewerContext: 'issuer' | 'holder'
    items: AuditTimelineItem[]
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ReconciliationService {
    private extractImageUrls(value: unknown): string[] {
        const results = new Set<string>()

        const visit = (input: unknown) => {
            if (!input) return
            if (Array.isArray(input)) {
                input.forEach(visit)
                return
            }
            if (typeof input === 'object') {
                Object.values(input as Record<string, unknown>).forEach(visit)
                return
            }
            if (typeof input !== 'string') return

            const candidate = input.trim()
            if (!candidate) return

            const lowered = candidate.toLowerCase()
            const isImageRef =
                lowered.startsWith('data:image/') ||
                lowered.startsWith('blob:') ||
                /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(candidate) ||
                lowered.includes('/images/') ||
                lowered.includes('photo')

            const looksLikeUrl = lowered.startsWith('http://') || lowered.startsWith('https://') || lowered.startsWith('data:image/') || lowered.startsWith('blob:')

            if (isImageRef && looksLikeUrl) {
                results.add(candidate)
            }
        }

        visit(value)
        return Array.from(results).slice(0, 6)
    }

    /**
     * Record a reconciliation event and recompute status.
     * This is the primary entry point — called from webhook handlers,
     * delivery controllers, and payout services.
     * 
     * Fire-and-forget safe: wrapped in try/catch so a logging failure
     * never breaks the payment flow.
     */
    recordEvent(
        providerRef: string,
        eventType: ReconciliationEventType,
        source: string,
        metadata?: Record<string, any> & { amount?: number; currency?: string; tenantId?: string }
    ): void {
        try {
            const db = DatabaseManager.getDatabase()
            const eventId = `recon-${randomUUID()}`
            const now = new Date().toISOString()
            const amount = metadata?.amount ?? null
            const currency = metadata?.currency ?? null
            const tenantId = metadata?.tenantId

            // 1. Append immutable event
            db.prepare(`
                INSERT INTO reconciliation_events 
                (id, provider_ref, event_type, source, amount, currency, metadata, occurred_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                eventId,
                providerRef,
                eventType,
                source,
                amount,
                currency,
                metadata ? JSON.stringify(metadata) : null,
                now,
                now
            )

            logger.info({ providerRef, eventType, source, eventId }, 'Reconciliation event recorded')

            // 2. Recompute status
            this.recomputeStatus(providerRef, tenantId)

        } catch (err: any) {
            // CRITICAL: never let reconciliation logging break the payment flow
            logger.error({ error: err.message, providerRef, eventType, source }, 'Failed to record reconciliation event (non-fatal)')
        }
    }

    /**
     * Deterministic state machine: read all events for a providerRef,
     * apply matching rules, update reconciliation_status.
     * 
     * Status priority (highest wins):
     *   REFUNDED > DISPUTED > PAYOUT_FAILED > RECONCILED > DELIVERED > RECEIPT_ISSUED > PAID > INITIATED
     * 
     * Sector routing:
     *   - ecommerce: requires DELIVERY_VERIFIED + ESCROW_RELEASED before RECONCILED
     *   - education, cash, custom: PAYMENT_SUCCESS + RECEIPT_ISSUED = RECONCILED immediately
     *     (no physical delivery step — payment confirmation is the terminal event)
     */
    private recomputeStatus(providerRef: string, tenantId?: string): void {
        const db = DatabaseManager.getDatabase()
        const now = new Date().toISOString()

        // Fetch all events for this providerRef
        const events = db.prepare(`
            SELECT event_type, amount, currency, occurred_at
            FROM reconciliation_events 
            WHERE provider_ref = ? 
            ORDER BY occurred_at ASC
        `).all(providerRef) as Array<{ event_type: string; amount: number | null; currency: string | null; occurred_at: string }>

        if (events.length === 0) return

        // Resolve the tenant's sector from workflow_templates.
        // Ecommerce requires delivery confirmation before RECONCILED.
        // Education, cash, and custom sectors are terminal at PAYMENT_SUCCESS + RECEIPT_ISSUED.
        let tenantSector: string | null = null
        if (tenantId) {
            try {
                const wt = db.prepare(`
                    SELECT sector FROM workflow_templates
                    WHERE tenant_id = ? AND enabled = 1
                    ORDER BY updated_at DESC LIMIT 1
                `).get(tenantId) as { sector: string } | undefined
                tenantSector = wt?.sector ?? null
            } catch (_) { /* non-fatal — fall back to delivery-required behaviour */ }
        }
        // If no sector is found default to requiring delivery (safest, ecommerce-compatible)
        const requiresDelivery = !tenantSector || tenantSector === 'ecommerce'

        // Build event presence flags
        const has = (type: string) => events.some(e => e.event_type === type)
        const hasQuote = has('QUOTE_ISSUED')
        const hasInvoice = has('INVOICE_ISSUED')
        const hasPayment = has('PAYMENT_SUCCESS')
        const hasReceipt = has('RECEIPT_ISSUED')
        const hasDelivery = has('DELIVERY_VERIFIED')
        const hasEscrow = has('ESCROW_RELEASED')
        const hasPayoutFail = has('PAYOUT_FAILED')
        const hasRefund = has('REFUNDED')
        const hasDispute = has('DISPUTED')
        const hasSettlement = has('SETTLEMENT_CONFIRMED')
        const hasReqCreated = has('REQUISITION_CREATED')
        const hasReqApproved = has('REQUISITION_APPROVED')
        const hasReqManagerApproved = has('REQUISITION_MANAGER_APPROVED')
        const hasReqFinanceApproved = has('REQUISITION_FINANCE_APPROVED')
        const hasReqReleased = has('REQUISITION_RELEASED')
        const hasExecutionAck = has('EXECUTION_ACKNOWLEDGED')

        // Determine status using priority rules
        // REFUNDED > DISPUTED > RECONCILED > ACKNOWLEDGED > DELIVERED > RELEASED > APPROVED > MANAGER_APPROVED > PAYOUT_FAILED > RECEIPT_ISSUED > PAID > INVOICE_ISSUED > QUOTE_ISSUED > REQUISITION_CREATED > INITIATED
        let status: ReconciliationStatus = 'INITIATED'
        let mismatchReason: string | null = null

        if (hasRefund) {
            status = 'REFUNDED'
        } else if (hasDispute) {
            status = 'DISPUTED'
        } else if (hasPayoutFail && !hasEscrow) {
            // Payout failed and not subsequently released
            status = 'PAYOUT_FAILED'
            mismatchReason = 'Escrow payout failed after receipt revocation'
        } else if (hasExecutionAck && (hasEscrow || hasSettlement || hasPayment)) {
            // Internal Recon flow complete
            status = 'RECONCILED'
        } else if (hasPayment && hasReceipt && hasDelivery && (hasEscrow || hasSettlement)) {
            status = 'RECONCILED'
        } else if (!requiresDelivery && hasPayment && hasReceipt) {
            // Education / cash / custom: payment + receipt is the terminal event — no delivery step
            status = 'RECONCILED'
        } else if (hasExecutionAck) {
            status = 'ACKNOWLEDGED'
        } else if (hasPayment && hasReceipt && hasDelivery) {
            status = 'DELIVERED'
        } else if (hasReqReleased) {
            status = 'RELEASED'
        } else if (hasReqFinanceApproved || hasReqApproved) {
            status = 'APPROVED'
        } else if (hasReqManagerApproved) {
            status = 'MANAGER_APPROVED'
        } else if (hasPayment && hasReceipt) {
            status = 'RECEIPT_ISSUED'
        } else if (hasPayment) {
            status = 'PAID'
        } else if (hasReqCreated) {
            status = 'REQUISITION_CREATED'
        } else if (hasInvoice) {
            status = 'INVOICE_ISSUED'
        } else if (hasQuote) {
            status = 'QUOTE_ISSUED'
        }

        // Extract payment amount from first PAYMENT_SUCCESS event
        const paymentEvent = events.find(e => e.event_type === 'PAYMENT_SUCCESS')
        const paymentAmount = paymentEvent?.amount ?? null

        // Upsert reconciliation_status
        db.prepare(`
            INSERT INTO reconciliation_status 
            (provider_ref, tenant_id, status, payment_amount, mismatch_reason, event_count, first_event_at, last_event_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider_ref) DO UPDATE SET
                status = excluded.status,
                tenant_id = COALESCE(excluded.tenant_id, reconciliation_status.tenant_id),
                payment_amount = COALESCE(excluded.payment_amount, reconciliation_status.payment_amount),
                mismatch_reason = excluded.mismatch_reason,
                event_count = excluded.event_count,
                last_event_at = excluded.last_event_at,
                updated_at = excluded.updated_at
        `).run(
            providerRef,
            tenantId ?? null,
            status,
            paymentAmount,
            mismatchReason,
            events.length,
            events[0].occurred_at,
            events[events.length - 1].occurred_at,
            now
        )

        logger.info({ providerRef, status, eventCount: events.length }, 'Reconciliation status recomputed')
    }

    /**
     * Get reconciliation status for a single transaction
     */
    getStatus(providerRef: string): ReconciliationStatusRecord | null {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT provider_ref, tenant_id, status, payment_amount, settlement_amount,
                   mismatch_reason, event_count, first_event_at, last_event_at, updated_at
            FROM reconciliation_status 
            WHERE provider_ref = ?
        `).get(providerRef) as any

        if (!row) return null

        return {
            providerRef: row.provider_ref,
            tenantId: row.tenant_id,
            status: row.status,
            paymentAmount: row.payment_amount,
            settlementAmount: row.settlement_amount,
            mismatchReason: row.mismatch_reason,
            eventCount: row.event_count,
            firstEventAt: row.first_event_at,
            lastEventAt: row.last_event_at,
            updatedAt: row.updated_at
        }
    }

    /**
     * Get all events for a single transaction (timeline view)
     */
    getEvents(providerRef: string): ReconciliationEvent[] {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare(`
            SELECT id, provider_ref, event_type, source, amount, currency, metadata, occurred_at, created_at
            FROM reconciliation_events 
            WHERE provider_ref = ? 
            ORDER BY occurred_at ASC
        `).all(providerRef) as any[]

        return rows.map(r => ({
            id: r.id,
            providerRef: r.provider_ref,
            eventType: r.event_type,
            source: r.source,
            amount: r.amount,
            currency: r.currency,
            metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
            occurredAt: r.occurred_at,
            createdAt: r.created_at
        }))
    }

    getAuditTimeline(
        providerRef: string,
        options?: { viewerTenantId?: string; includeWorkflow?: boolean; includeSensitiveDetails?: boolean }
    ): AuditTimelineResult {
        const db = DatabaseManager.getDatabase()
        const includeWorkflow = options?.includeWorkflow !== false
        const includeSensitiveDetails = options?.includeSensitiveDetails === true
        const viewerContext: 'issuer' | 'holder' = includeSensitiveDetails ? 'issuer' : 'holder'

        const reconRows = db.prepare(`
            SELECT id, provider_ref, event_type, source, amount, currency, metadata, occurred_at
            FROM reconciliation_events
            WHERE provider_ref = ?
            ORDER BY occurred_at ASC
        `).all(providerRef) as Array<{
            id: string
            provider_ref: string
            event_type: string
            source: string
            amount: number | null
            currency: string | null
            metadata: string | null
            occurred_at: string
        }>

        const timeline: AuditTimelineItem[] = []

        for (const row of reconRows) {
            const metadata = row.metadata ? JSON.parse(row.metadata) : undefined
            const metadataTenantId = (metadata as Record<string, unknown> | undefined)?.tenantId
            const isVisibleToHolder = !options?.viewerTenantId || !metadataTenantId || metadataTenantId === options.viewerTenantId

            if (!includeSensitiveDetails && !isVisibleToHolder) {
                continue
            }

            timeline.push({
                id: row.id,
                providerRef: row.provider_ref,
                kind: 'reconciliation',
                eventType: row.event_type,
                title: row.event_type.replace(/_/g, ' '),
                source: row.source,
                amount: row.amount ?? undefined,
                currency: row.currency ?? undefined,
                occurredAt: row.occurred_at,
                details: includeSensitiveDetails ? metadata : undefined,
                evidenceImages: this.extractImageUrls(metadata),
            })
        }

        if (includeWorkflow) {
            const workflowRows = db.prepare(`
                SELECT
                    ws.id as step_id,
                    ws.action_name,
                    ws.status,
                    ws.input_state,
                    ws.output_state,
                    ws.error,
                    ws.created_at,
                    ws.started_at,
                    ws.completed_at,
                    wr.id as run_id,
                    wr.tenant_id as tenant_id
                FROM workflow_steps ws
                JOIN workflow_runs wr ON wr.id = ws.run_id
                WHERE (
                    wr.trigger_ref = ?
                    OR wr.input LIKE ?
                    OR wr.output LIKE ?
                )
                ORDER BY COALESCE(ws.completed_at, ws.started_at, ws.created_at) ASC
            `).all(providerRef, `%${providerRef}%`, `%${providerRef}%`) as Array<{
                step_id: string
                action_name: string
                status: string
                input_state: string | null
                output_state: string | null
                error: string | null
                created_at: string
                started_at: string | null
                completed_at: string | null
                run_id: string
                tenant_id: string
            }>

            for (const row of workflowRows) {
                if (!includeSensitiveDetails && options?.viewerTenantId && row.tenant_id !== options.viewerTenantId) {
                    continue
                }

                const inputState = row.input_state ? JSON.parse(row.input_state) : undefined
                const outputState = row.output_state ? JSON.parse(row.output_state) : undefined

                timeline.push({
                    id: row.step_id,
                    providerRef,
                    kind: 'workflow',
                    eventType: row.action_name,
                    title: row.action_name.replace(/\./g, ' ').replace(/_/g, ' '),
                    source: `workflow:${row.run_id}`,
                    status: row.status,
                    occurredAt: row.completed_at || row.started_at || row.created_at,
                    details: includeSensitiveDetails
                        ? {
                            runId: row.run_id,
                            stepStatus: row.status,
                            error: row.error || undefined,
                            inputState,
                            outputState,
                        }
                        : undefined,
                    evidenceImages: this.extractImageUrls({ inputState, outputState }),
                })
            }
        }

        timeline.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

        return {
            providerRef,
            viewerContext,
            items: timeline,
        }
    }

    /**
     * Aggregate summary for merchant dashboard
     */
    getSummary(tenantId?: string): ReconciliationSummary {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT status, COUNT(*) as count 
            FROM reconciliation_status 
        `
        const params: any[] = []
        if (tenantId) {
            query += ' WHERE tenant_id = ?'
            params.push(tenantId)
        }
        query += ' GROUP BY status'

        const rows = db.prepare(query).all(...params) as Array<{ status: string; count: number }>

        const counts: Record<string, number> = {}
        rows.forEach(r => { counts[r.status] = r.count })

        const total = rows.reduce((sum, r) => sum + r.count, 0)

        return {
            total,
            reconciled: counts['RECONCILED'] || 0,
            paid: counts['PAID'] || 0,
            receiptIssued: counts['RECEIPT_ISSUED'] || 0,
            delivered: counts['DELIVERED'] || 0,
            payoutFailed: counts['PAYOUT_FAILED'] || 0,
            disputed: counts['DISPUTED'] || 0,
            refunded: counts['REFUNDED'] || 0,
            requisitionCreated: counts['REQUISITION_CREATED'] || 0,
            requisitionApproved: counts['APPROVED'] || 0,
            requisitionReleased: counts['RELEASED'] || 0,
            requisitionAcknowledged: counts['ACKNOWLEDGED'] || 0,
            other: (counts['INITIATED'] || 0) + (counts['AMOUNT_MISMATCH'] || 0) + (counts['SETTLEMENT_MISSING'] || 0) + (counts['MANAGER_APPROVED'] || 0)
        }
    }

    /**
     * Get all non-reconciled transactions (exception center)
     */
    getExceptions(tenantId?: string, limit = 50): ReconciliationStatusRecord[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT provider_ref, tenant_id, status, payment_amount, settlement_amount,
                   mismatch_reason, event_count, first_event_at, last_event_at, updated_at
            FROM reconciliation_status 
            WHERE status NOT IN ('RECONCILED', 'REFUNDED')
        `
        const params: any[] = []
        if (tenantId) {
            query += ' AND tenant_id = ?'
            params.push(tenantId)
        }
        query += ' ORDER BY updated_at DESC LIMIT ?'
        params.push(limit)

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(r => ({
            providerRef: r.provider_ref,
            tenantId: r.tenant_id,
            status: r.status,
            paymentAmount: r.payment_amount,
            settlementAmount: r.settlement_amount,
            mismatchReason: r.mismatch_reason,
            eventCount: r.event_count,
            firstEventAt: r.first_event_at,
            lastEventAt: r.last_event_at,
            updatedAt: r.updated_at
        }))
    }
    /**
     * Get all reconciled (completed) transactions
     */
    getReconciled(tenantId?: string, limit = 50): ReconciliationStatusRecord[] {
        const db = DatabaseManager.getDatabase()

        let query = `
            SELECT provider_ref, tenant_id, status, payment_amount, settlement_amount,
                   mismatch_reason, event_count, first_event_at, last_event_at, updated_at
            FROM reconciliation_status 
            WHERE status = 'RECONCILED'
        `
        const params: any[] = []
        if (tenantId) {
            query += ' AND tenant_id = ?'
            params.push(tenantId)
        }
        query += ' ORDER BY updated_at DESC LIMIT ?'
        params.push(limit)

        const rows = db.prepare(query).all(...params) as any[]

        return rows.map(r => ({
            providerRef: r.provider_ref,
            tenantId: r.tenant_id,
            status: r.status,
            paymentAmount: r.payment_amount,
            settlementAmount: r.settlement_amount,
            mismatchReason: r.mismatch_reason,
            eventCount: r.event_count,
            firstEventAt: r.first_event_at,
            lastEventAt: r.last_event_at,
            updatedAt: r.updated_at
        }))
    }
    /**
     * Backfill: re-evaluate any RECEIPT_ISSUED records whose tenant is non-ecommerce.
     * Called once at startup so existing stuck transactions are immediately promoted
     * to RECONCILED without waiting for a new event.
     * 
     * Safe to call multiple times — idempotent (just rewrites status to same value).
     */
    backfillSectorReconciliation(): void {
        try {
            const db = DatabaseManager.getDatabase()

            // Find tenants whose sector is NOT ecommerce and have enabled templates
            const nonEcommerceTenants = db.prepare(`
                SELECT DISTINCT tenant_id, sector FROM workflow_templates
                WHERE enabled = 1 AND sector != 'ecommerce' AND sector IS NOT NULL
            `).all() as Array<{ tenant_id: string; sector: string }>

            if (nonEcommerceTenants.length === 0) return

            for (const { tenant_id, sector } of nonEcommerceTenants) {
                // Find all RECEIPT_ISSUED transactions for this tenant
                const stuck = db.prepare(`
                    SELECT provider_ref FROM reconciliation_status
                    WHERE tenant_id = ? AND status = 'RECEIPT_ISSUED'
                `).all(tenant_id) as Array<{ provider_ref: string }>

                for (const { provider_ref } of stuck) {
                    this.recomputeStatus(provider_ref, tenant_id)
                    logger.info({ provider_ref, tenant_id, sector }, 'Backfilled sector reconciliation: RECEIPT_ISSUED → RECONCILED')
                }
            }
        } catch (err: any) {
            logger.error({ error: err.message }, 'Backfill sector reconciliation failed (non-fatal)')
        }
    }
}

export const reconciliationService = new ReconciliationService()

/**
 * IdenEx Credentis - Consent Repository
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Persistence layer for privacy-compliant consent records.
 * Tracks subject consent for data processing, retention periods,
 * and revocation history for audit and compliance.
 * 
 * Compliance Features:
 * - Purpose-specific consent tracking
 * - Time-bound retention with automatic expiry
 * - Revocation audit trail
 * - Per-workflow consent binding
 * 
 * @module persistence/ConsentRepository
 * @copyright 2024-2026 IdenEx Credentis
 */

import { DatabaseManager } from './DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

const logger = rootLogger.child({ module: 'ConsentRepository' })

export interface ConsentRecord {
    id: string
    subjectDid: string
    tenantId: string
    purposes: string[]
    retentionPeriod: string
    retentionEndDate: string
    workflowId?: string
    runId?: string
    status: 'active' | 'revoked' | 'expired'
    revokedAt?: string
    revokedReason?: string
    createdAt?: Date
}

export class ConsentRepository {
    /**
     * Record a new consent
     */
    async recordConsent(consent: Omit<ConsentRecord, 'status' | 'createdAt'>): Promise<ConsentRecord> {
        const db = DatabaseManager.getDatabase()
        const id = consent.id || uuid()

        const stmt = db.prepare(`
            INSERT INTO consent_records (
                id, subject_did, tenant_id, purposes, retention_period, retention_end_date,
                workflow_id, run_id, status
            ) VALUES (
                @id, @subjectDid, @tenantId, @purposes, @retentionPeriod, @retentionEndDate,
                @workflowId, @runId, 'active'
            )
        `)

        stmt.run({
            id,
            subjectDid: consent.subjectDid,
            tenantId: consent.tenantId,
            purposes: JSON.stringify(consent.purposes),
            retentionPeriod: consent.retentionPeriod,
            retentionEndDate: consent.retentionEndDate,
            workflowId: consent.workflowId || null,
            runId: consent.runId || null
        })

        logger.info({ id, subjectDid: consent.subjectDid }, 'Consent recorded')

        return { ...consent, id, status: 'active' }
    }

    /**
     * Find active consent for a subject and purpose
     */
    async findActiveConsent(subjectDid: string, purpose: string, tenantId: string): Promise<ConsentRecord | undefined> {
        const db = DatabaseManager.getDatabase()

        const row = db.prepare(`
            SELECT id, subject_did as subjectDid, tenant_id as tenantId, purposes,
                   retention_period as retentionPeriod, retention_end_date as retentionEndDate,
                   workflow_id as workflowId, run_id as runId, status, created_at as createdAt
            FROM consent_records
            WHERE subject_did = ? AND tenant_id = ? AND status = 'active'
              AND datetime(retention_end_date) > datetime('now')
            ORDER BY created_at DESC
            LIMIT 1
        `).get(subjectDid, tenantId) as any

        if (!row) return undefined

        const purposes = JSON.parse(row.purposes)

        // Check if the specific purpose is covered
        if (!purposes.includes(purpose) && !purposes.includes('*')) {
            return undefined
        }

        return {
            ...row,
            purposes,
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }
    }

    /**
     * Get all consents for a subject
     */
    async getConsentsForSubject(subjectDid: string, tenantId: string): Promise<ConsentRecord[]> {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
            SELECT id, subject_did as subjectDid, tenant_id as tenantId, purposes,
                   retention_period as retentionPeriod, retention_end_date as retentionEndDate,
                   workflow_id as workflowId, run_id as runId, status,
                   revoked_at as revokedAt, revoked_reason as revokedReason,
                   created_at as createdAt
            FROM consent_records
            WHERE subject_did = ? AND tenant_id = ?
            ORDER BY created_at DESC
        `).all(subjectDid, tenantId) as any[]

        return rows.map(row => ({
            ...row,
            purposes: JSON.parse(row.purposes),
            createdAt: row.createdAt ? new Date(row.createdAt) : undefined
        }))
    }

    /**
     * Revoke a consent
     */
    async revokeConsent(consentId: string, reason?: string): Promise<void> {
        const db = DatabaseManager.getDatabase()

        db.prepare(`
            UPDATE consent_records
            SET status = 'revoked', revoked_at = datetime('now'), revoked_reason = ?
            WHERE id = ?
        `).run(reason || null, consentId)

        logger.info({ consentId, reason }, 'Consent revoked')
    }

    /**
     * Expire consents that have passed retention date
     */
    async expireConsents(): Promise<number> {
        const db = DatabaseManager.getDatabase()

        const result = db.prepare(`
            UPDATE consent_records
            SET status = 'expired'
            WHERE status = 'active' AND datetime(retention_end_date) <= datetime('now')
        `).run()

        if (result.changes > 0) {
            logger.info({ count: result.changes }, 'Expired consents')
        }

        return result.changes
    }
}

export const consentRepository = new ConsentRepository()

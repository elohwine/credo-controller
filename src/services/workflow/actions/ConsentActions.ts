/**
 * IdenEx Credentis - Consent Management Actions
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Workflow actions for privacy-compliant consent capture, verification,
 * and revocation. Ensures GDPR/POPIA-style compliance for data processing
 * in VC issuance and verification workflows.
 * 
 * Features:
 * - Explicit consent capture with purpose specification
 * - Time-bound retention periods (e.g., '7y' for tax records)
 * - Consent verification before data processing
 * - Subject-initiated revocation with audit trail
 * 
 * @module services/workflow/actions/ConsentActions
 * @copyright 2024-2026 IdenEx Credentis
 */

import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'
import { v4 as uuid } from 'uuid'

const logger = rootLogger.child({ module: 'ConsentActions' })

export class ConsentActions {
    /**
     * Capture and record consent from a subject
     * 
     * Config:
     * - purposes: string[] (what data will be used for)
     * - retentionPeriod: string (e.g., '7y', '30d')
     * - requiredConsents: string[] (specific consents needed)
     */
    static async capture(context: WorkflowActionContext, config: any = {}) {
        const { purposes = [], retentionPeriod = '1y', requiredConsents = [] } = config
        const { subjectDid, subjectName, consentGiven } = context.input

        logger.info({ subjectDid, purposes }, 'Capturing consent')

        // In a real implementation, this would:
        // 1. Present consent UI/form to subject
        // 2. Capture explicit acceptance
        // 3. Store signed consent record

        // For workflow, we assume consent is passed in input or collected externally
        if (consentGiven === false) {
            throw new Error('Consent not given by subject')
        }

        const consentId = uuid()
        const timestamp = new Date().toISOString()

        // Calculate retention end date
        const retentionMatch = retentionPeriod.match(/^(\d+)([dmy])$/)
        let retentionEndDate = new Date()
        if (retentionMatch) {
            const amount = parseInt(retentionMatch[1])
            const unit = retentionMatch[2]
            if (unit === 'd') retentionEndDate.setDate(retentionEndDate.getDate() + amount)
            else if (unit === 'm') retentionEndDate.setMonth(retentionEndDate.getMonth() + amount)
            else if (unit === 'y') retentionEndDate.setFullYear(retentionEndDate.getFullYear() + amount)
        }

        // Store consent record
        const { consentRepository } = await import('../../../persistence/ConsentRepository')
        await consentRepository.recordConsent({
            id: consentId,
            subjectDid,
            tenantId: context.tenantId,
            purposes,
            retentionPeriod,
            retentionEndDate: retentionEndDate.toISOString(),
            workflowId: context.workflowId,
            runId: context.runId
        })

        context.state.consent = {
            id: consentId,
            subjectDid,
            purposes,
            retentionPeriod,
            retentionEndDate: retentionEndDate.toISOString(),
            timestamp,
            status: 'granted'
        }

        logger.info({ consentId, subjectDid, purposes }, 'Consent captured')
    }

    /**
     * Verify that consent exists for a given purpose
     */
    static async verify(context: WorkflowActionContext, config: any = {}) {
        const { purpose, subjectDidPath = 'input.subjectDid' } = config

        // Extract subject DID
        const pathParts = subjectDidPath.split('.')
        let subjectDid: any = context
        for (const p of pathParts) {
            subjectDid = subjectDid?.[p]
        }

        if (!subjectDid) {
            throw new Error('No subject DID for consent verification')
        }

        logger.info({ subjectDid, purpose }, 'Verifying consent')

        const { consentRepository } = await import('../../../persistence/ConsentRepository')
        const consent = await consentRepository.findActiveConsent(subjectDid, purpose, context.tenantId)

        if (!consent) {
            throw new Error(`No active consent found for purpose: ${purpose}`)
        }

        context.state.consentVerified = {
            consentId: consent.id,
            purpose,
            validUntil: consent.retentionEndDate
        }

        logger.info({ consentId: consent.id, purpose }, 'Consent verified')
    }

    /**
     * Revoke consent
     */
    static async revoke(context: WorkflowActionContext, config: any = {}) {
        const { consentIdPath = 'input.consentId', reason } = config

        const pathParts = consentIdPath.split('.')
        let consentId: any = context
        for (const p of pathParts) {
            consentId = consentId?.[p]
        }

        if (!consentId) {
            throw new Error('No consent ID provided for revocation')
        }

        logger.info({ consentId, reason }, 'Revoking consent')

        const { consentRepository } = await import('../../../persistence/ConsentRepository')
        await consentRepository.revokeConsent(consentId, reason)

        context.state.consentRevoked = {
            consentId,
            reason,
            revokedAt: new Date().toISOString()
        }

        logger.info({ consentId }, 'Consent revoked')
    }
}


/**
 * Common types for Trust and Security modules (Revocation, Verification, Audit)
 */

export interface VerificationChecks {
    signature: boolean
    revocation: boolean
    claims: boolean
}

export interface VerificationResult {
    verified: boolean
    checks: VerificationChecks
    error?: string
}

export interface VerificationPolicy {
    checkRevocation: boolean
    /**
     * Map of claim keys to expected values. 
     * Using Record with string values for better TSOA compatibility.
     */
    requiredClaims?: Record<string, string>
}

export interface VerifyRequestPayload {
    /**
     * The Verifiable Credential object.
     * Using 'object' instead of 'any' for TSOA stability.
     */
    vc: object
    statusListEncoded?: string
    policy?: VerificationPolicy
    tenantId?: string
}

export interface AuditLog {
    id: string
    tenantId: string
    actorDid?: string
    actionType: string
    resourceId?: string
    details?: object
    ipAddress?: string
    userAgent?: string
    createdAt: string
}

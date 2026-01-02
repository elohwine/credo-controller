import { injectable } from 'tsyringe'
import { auditService } from './AuditService'
import { revocationService } from './RevocationService'
import { rootLogger } from '../utils/pinoLogger'
import { VerificationPolicy, VerificationResult } from '../types/trust'

const logger = rootLogger.child({ module: 'VerifierPortalService' })

@injectable()
export class VerifierPortalService {

    /**
     * Verify a generic VC (mocking signature check).
     * @param vc The Verifiable Credential (JSON)
     * @param statusListEncoded Optional: The encoded StatusList2021 bitstring if revocation check is needed
     * @param policy Policies to enforce
     * @param tenantId For audit logging
     */
    public async verifyCredential(
        vc: any,
        statusListEncoded: string | undefined,
        policy: VerificationPolicy,
        tenantId: string
    ): Promise<VerificationResult> {
        const result: VerificationResult = {
            verified: false,
            checks: { signature: true, revocation: true, claims: true } // optimistically true start
        }

        try {
            // 1. Signature Check (Mocked to be always true for this demo if VC has proof)
            // In prod: await agent.verify(vc)
            if (!vc.proof && !vc.jwt) {
                result.checks.signature = false
                throw new Error('No proof or JWT found in credential')
            }
            // Assume signature pass for demo

            // 2. Revocation Check
            if (policy.checkRevocation) {
                const statusEntry = vc.credentialSubject?.credentialStatus || vc.credentialStatus
                if (!statusEntry) {
                    // Fail if revocation check required but no status present?
                    // Or warn? Let's fail for strictness.
                    result.checks.revocation = false
                    throw new Error('Revocation check required but no credentialStatus field found')
                }

                if (statusEntry.type !== 'StatusList2021Entry') {
                    result.checks.revocation = false
                    throw new Error(`Unsupported status type: ${statusEntry.type}`)
                }

                if (!statusListEncoded) {
                    result.checks.revocation = false
                    throw new Error('Revocation check required but status list data not provided')
                }

                const index = parseInt(statusEntry.statusListIndex)
                const isRevoked = revocationService.getRevocationStatus(statusListEncoded, index)

                if (isRevoked) {
                    result.checks.revocation = false
                    throw new Error(`Credential revoked at index ${index}`)
                }
            }

            // 3. Claim Checks
            if (policy.requiredClaims) {
                const subject = vc.credentialSubject as any
                for (const [key, expectedValue] of Object.entries(policy.requiredClaims)) {
                    if (subject[key] !== expectedValue) {
                        result.checks.claims = false
                        throw new Error(`Claim mismatch: expected ${key}=${expectedValue}, got ${subject[key]}`)
                    }
                }
            }

            // If we got here, verified = true
            result.verified = true

        } catch (error: any) {
            result.verified = false
            result.error = error.message
        } finally {
            // Audit Log
            await auditService.logAction({
                tenantId,
                actionType: 'verification_attempt',
                resourceId: vc.id, // ID of the VC being verified
                details: {
                    result,
                    policy,
                    vcType: vc.type
                }
            })
        }

        return result
    }

    /**
     * Get verification history for the dashboard
     */
    public async getHistory(tenantId: string, limit = 50): Promise<any[]> {
        return auditService.getLogs(tenantId, undefined, limit)
            .then(logs => logs.filter(l => l.actionType === 'verification_attempt'))
    }
}

export const verifierPortalService = new VerifierPortalService()

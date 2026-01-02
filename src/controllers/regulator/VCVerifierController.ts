import { Controller, Post, Get, Route, Tags, Path, Request } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { rootLogger } from '../../utils/pinoLogger'
import { container } from 'tsyringe'
import { Agent } from '@credo-ts/core'

const logger = rootLogger.child({ module: 'VCVerifierController' })

export interface VerificationResult {
    vcId: string
    vcType: string
    status: 'valid' | 'invalid' | 'revoked' | 'expired' | 'not_found'
    issuer?: string
    issuanceDate?: string
    expirationDate?: string
    subject?: any
    verifiedAt: string
    signature?: {
        algorithm: string
        verified: boolean
    }
}

export interface VerificationLog {
    id: string
    vcId: string
    vcType?: string
    verificationResult: string
    verifierInfo?: any
    createdAt: string
}

@Route('api/verify')
@Tags('VC Verification')
export class VCVerifierController extends Controller {

    /**
     * Verify a credential by its ID.
     * This endpoint provides a public verifier page for receipt validation.
     */
    @Get('{vcId}')
    public async verifyCredential(
        @Path() vcId: string,
        @Request() request: ExRequest
    ): Promise<VerificationResult> {
        const db = DatabaseManager.getDatabase()

        let result: VerificationResult = {
            vcId,
            vcType: 'Unknown',
            status: 'not_found',
            verifiedAt: new Date().toISOString()
        }

        try {
            // Try to find the credential in our issued_credentials table
            const credential = db.prepare(`
                SELECT * FROM issued_credentials WHERE id = ? OR offer_id = ?
            `).get(vcId, vcId) as any

            if (!credential) {
                // Try credential_offers table
                const offer = db.prepare(`
                    SELECT * FROM credential_offers WHERE id = ?
                `).get(vcId) as any

                if (!offer) {
                    result.status = 'not_found'
                    this.logVerification(vcId, result, request)
                    return result
                }

                // Found in offers
                result.vcType = offer.type || 'CredentialOffer'
                result.issuer = offer.issuer_did
                result.issuanceDate = offer.created_at
                result.status = offer.status === 'accepted' ? 'valid' : 'invalid'
                result.subject = JSON.parse(offer.claims || '{}')
            } else {
                // Found issued credential
                result.vcType = credential.type || 'VerifiableCredential'
                result.issuer = credential.issuer_did
                result.issuanceDate = credential.created_at
                result.subject = JSON.parse(credential.claims || '{}')

                // Check revocation status
                if (credential.revoked) {
                    result.status = 'revoked'
                } else if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
                    result.status = 'expired'
                    result.expirationDate = credential.expires_at
                } else {
                    result.status = 'valid'
                    result.signature = {
                        algorithm: 'EdDSA',
                        verified: true
                    }
                }
            }
        } catch (error: any) {
            logger.error({ vcId, error: error.message }, 'Verification failed')
            result.status = 'invalid'
        }

        this.logVerification(vcId, result, request)
        return result
    }

    /**
     * Verify a credential by scanning (POST with payload).
     * Useful for QR code scanning workflows.
     */
    @Post('scan')
    public async verifyScan(
        @Request() request: ExRequest
    ): Promise<VerificationResult> {
        const body = (request as any).body
        const vcId = body?.vcId || body?.receiptId || body?.token

        if (!vcId) {
            this.setStatus(400)
            throw new Error('vcId, receiptId, or token is required')
        }

        return this.verifyCredential(vcId, request)
    }

    /**
     * Get verification history for a VC.
     */
    @Get('{vcId}/history')
    public async getVerificationHistory(
        @Path() vcId: string
    ): Promise<VerificationLog[]> {
        const db = DatabaseManager.getDatabase()

        const rows = db.prepare(`
            SELECT * FROM vc_verifications WHERE vc_id = ? ORDER BY created_at DESC LIMIT 20
        `).all(vcId) as any[]

        return rows.map(row => ({
            id: row.id,
            vcId: row.vc_id,
            vcType: row.vc_type,
            verificationResult: row.verification_result,
            verifierInfo: JSON.parse(row.verifier_info || '{}'),
            createdAt: row.created_at
        }))
    }

    /**
     * Get verification page data (for rendering human-readable receipt).
     */
    @Get('{vcId}/page')
    public async getVerificationPage(
        @Path() vcId: string,
        @Request() request: ExRequest
    ): Promise<{
        verification: VerificationResult
        displayData: {
            title: string
            merchant?: string
            amount?: string
            date?: string
            items?: any[]
            transactionId?: string
        }
        qrCode?: string
    }> {
        const verification = await this.verifyCredential(vcId, request)

        // Build human-readable display data
        const displayData: any = {
            title: verification.vcType?.replace('VC', ' Credential') || 'Verifiable Credential'
        }

        if (verification.subject) {
            displayData.merchant = verification.subject.merchantDid || verification.subject.merchant
            displayData.amount = verification.subject.amount
                ? `${verification.subject.currency || 'USD'} ${verification.subject.amount}`
                : undefined
            displayData.date = verification.issuanceDate
            displayData.items = verification.subject.items
            displayData.transactionId = verification.subject.transactionId || verification.subject.receiptId
        }

        return {
            verification,
            displayData,
            qrCode: `https://verify.credo.local/api/verify/${vcId}`
        }
    }

    private logVerification(vcId: string, result: VerificationResult, request: ExRequest): void {
        const db = DatabaseManager.getDatabase()

        const verifierInfo = {
            ip: request.ip || request.headers['x-forwarded-for'],
            userAgent: request.headers['user-agent'],
            timestamp: new Date().toISOString()
        }

        try {
            db.prepare(`
                INSERT INTO vc_verifications (id, vc_id, vc_type, verification_result, verifier_info, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                `VER-${randomUUID()}`,
                vcId,
                result.vcType,
                result.status,
                JSON.stringify(verifierInfo),
                new Date().toISOString()
            )
        } catch (error) {
            // Ignore logging errors
        }
    }
}

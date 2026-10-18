import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Get, Route, Tags, Path, Request } from 'tsoa'
import { container } from 'tsyringe'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { credentialLifecycleService } from '../../services/ssi/CredentialLifecycleService'
export interface VerificationResult {
  vcId: string
  vcType: string
  status: 'valid' | 'invalid' | 'revoked' | 'expired' | 'not_found'
  /** Why the organisation ended it, when status is revoked. */
  reason?: string
  /** The organisation that issued it, in words. */
  issuerName?: string
  issuer?: string
  issuanceDate?: string
  expirationDate?: string
  /** What the record says. */
  subject?: any
  verifiedAt: string
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
  public async verifyCredential(@Path() vcId: string, @Request() request: ExRequest): Promise<VerificationResult> {
    // The register holds the truth: `issued_credentials` first, then an accepted inbox row.
    // Reading the old column names (`type`, `claims`, `issuer_did`) threw on every check, so a
    // record that was issued here came back as "not found".
    const check = credentialLifecycleService.checkRecord(vcId)
    const result: VerificationResult = {
      vcId,
      vcType: check.vcType,
      status: check.status,
      reason: check.reason,
      issuerName: check.issuerName,
      issuanceDate: check.issuedAt,
      expirationDate: check.expiresAt,
      subject: check.claims,
      verifiedAt: check.checkedAt,
    }
    this.logVerification(vcId, result, request)
    return result
  }

  /**
   * Verify a credential by scanning (POST with payload).
   * Useful for QR code scanning workflows.
   */
  @Post('scan')
  public async verifyScan(@Request() request: ExRequest): Promise<VerificationResult> {
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
  public async getVerificationHistory(@Path() vcId: string): Promise<VerificationLog[]> {
    const db = DatabaseManager.getDatabase()

    const rows = db
      .prepare(
        `
            SELECT * FROM vc_verifications WHERE vc_id = ? ORDER BY created_at DESC LIMIT 20
        `,
      )
      .all(vcId) as any[]

    return rows.map((row) => ({
      id: row.id,
      vcId: row.vc_id,
      vcType: row.vc_type,
      verificationResult: row.verification_result,
      verifierInfo: JSON.parse(row.verifier_info || '{}'),
      createdAt: row.created_at,
    }))
  }

  /**
   * Get verification page data (for rendering human-readable receipt).
   */
  @Get('{vcId}/page')
  public async getVerificationPage(
    @Path() vcId: string,
    @Request() request: ExRequest,
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
      title: verification.vcType?.replace('VC', ' Credential') || 'Verifiable Credential',
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
      qrCode: `https://verify.credo.local/api/verify/${vcId}`,
    }
  }

  private logVerification(vcId: string, result: VerificationResult, request: ExRequest): void {
    const db = DatabaseManager.getDatabase()

    const verifierInfo = {
      ip: request.ip || request.headers['x-forwarded-for'],
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString(),
    }

    try {
      db.prepare(
        `
                INSERT INTO vc_verifications (id, vc_id, vc_type, verification_result, verifier_info, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `,
      ).run(
        `VER-${randomUUID()}`,
        vcId,
        result.vcType,
        result.status,
        JSON.stringify(verifierInfo),
        new Date().toISOString(),
      )
    } catch (error) {
      // Ignore logging errors
    }
  }
}

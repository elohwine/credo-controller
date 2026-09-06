import { Body, Post, Request, Route, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { credoPresentationVerificationService } from '../../services/ssi/CredoPresentationVerificationService'

@Route('api/platform/ssi')
@Tags('Platform SSI')
export class SsiVerificationController {
  @Post('verify')
  public async verify(
    @Request() request: ExRequest,
    @Body() body: {
      requestId: string
      state: string
      verifiablePresentation: string
      presentationSubmission?: unknown
    }
  ) {
    if (!body?.requestId || !body.state || !body.verifiablePresentation) {
      throw new Error('requestId, state and verifiablePresentation are required')
    }

    const tenantId = this.resolveTenantForPresentationRequest(body.requestId)

    return credoPresentationVerificationService.verify({
      tenantId,
      requestId: body.requestId,
      state: body.state,
      verifiablePresentation: body.verifiablePresentation,
      presentationSubmission: body.presentationSubmission,
      request,
    })
  }

  private resolveTenantForPresentationRequest(requestId: string): string {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT o.tenant_id AS tenantId
      FROM presentation_requests pr
      JOIN organizations o ON o.id = pr.organization_id
      WHERE pr.id = ?
        AND o.status = 'active'
      LIMIT 1
    `).get(requestId) as { tenantId?: string } | undefined

    if (!row?.tenantId) throw new Error('Presentation request not found')
    return row.tenantId
  }
}

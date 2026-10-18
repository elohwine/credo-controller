import type { Request as ExRequest } from 'express'

import { Controller, Get, Route, Tags, Query, Request, Security } from 'tsoa'

import { auditService } from '../../services/AuditService'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { StatusException } from '../../errors'
import { AuditLog } from '../../types/trust'

@Route('api/audit')
@Tags('Audit')
export class AuditController extends Controller {
  /**
   * Retrieve audit logs for the tenant (optionally filtered by resourceId).
   */
  @Get('logs')
  @Security('jwt', ['tenant'])
  public async getLogs(
    @Request() request: ExRequest,
    @Query() limit = 100,
    @Query() resourceId?: string,
  ): Promise<AuditLog[]> {
    const user = (request as any).user || {}
    const tenantId = String(user.tenantId || '')
    if (!tenantId || !user.id) throw new StatusException('Organization sign-in is required.', 401)
    const membership = DatabaseManager.getDatabase()
      .prepare(
        `SELECT m.role, r.permissions
           FROM org_memberships m
           LEFT JOIN organizations o ON o.tenant_id = m.org_tenant_id
           LEFT JOIN roles r ON r.organization_id = o.id AND r.membership_role = m.role
          WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active' LIMIT 1`,
      )
      .get(tenantId, String(user.id)) as { role?: string; permissions?: string } | undefined
    let permissions: string[] = []
    try {
      permissions = membership?.permissions ? JSON.parse(membership.permissions) : []
    } catch {
      permissions = []
    }
    if (
      !['owner', 'admin'].includes(String(membership?.role || '').toLowerCase()) &&
      !permissions.includes('audit.read')
    ) {
      throw new StatusException('You do not have permission to review audit trails.', 403)
    }
    return auditService.getLogs(tenantId, resourceId, limit)
  }

  /**
   * Verify a Credential Audit Chain (Receipt -> Invoice -> Quote)
   * Returns a structured verification report suitable for UI timeline visualization.
   */
  @Get('chain/:credentialId')
  public async verifyChain(@Request() request: ExRequest, credentialId: string): Promise<any> {
    // In a real scenario, we'd fetch the VC JWT from the DB using credentialId
    // For now, we assume the credentialId IS the JWT or we lookup the VC content.
    // NOTE: This assumes 'credentialId' maps to a stored genericRecord or issued credential containing the JWT.

    // Quick Fix: Retrieve the actual JWT.
    // If credentialId is a UUID, look it up in issued_credentials or similar.
    // For this prototype, let's assume the UI sends the ID and we verify the *last issued receipt* or look it up.

    // Better Layout: The frontend usually has the JWT if it's verifying it.
    // But here we are verifying a stored record.

    // Lookup logic:
    const db = (await import('../../persistence/DatabaseManager')).DatabaseManager.getDatabase()
    // Try to find the JWT in issued_credentials (this is where we stored the ReceiptVC)
    const record = db.prepare('SELECT credential_jwt FROM issued_credentials WHERE id = ?').get(credentialId) as any

    if (!record || !record.credential_jwt) {
      // Fallback: If not found by ID, maybe it's passed as query param? No, too large.
      // Return 404 conceptually
      return { verified: false, formatting_error: 'Credential not found', chain: {} }
    }

    return auditService.verifyChain(record.credential_jwt)
  }
}

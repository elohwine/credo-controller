import type { Request as ExRequest } from 'express'

import { randomUUID } from 'crypto'
import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'
import { container } from 'tsyringe'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { auditService } from '../../services/AuditService'
import { credentialIssuanceService } from '../../services/CredentialIssuanceService'
import { orgSetupProfileService } from '../../services/OrgSetupProfileService'
import { OrganizationService } from '../../services/OrganizationService'
import { outboxService } from '../../services/OutboxService'
import { offerLifecycleStatus, sendDirectRecord } from '../../services/connected/directRecordOffer'
import { orgRecordTypeService } from '../../services/connected/OrgRecordTypeService'
import { statusListAllocatorService } from '../../services/ssi/StatusListAllocatorService'
import { workflowVcOfferDispatcher } from '../../services/workflow/WorkflowVcOfferDispatcher'
import { configuredCredentialCatalogue, type OrgCredentialCatalogueItem } from '../../services/workflow/recordSettings'
import { credentialDefinitionStore } from '../../utils/credentialDefinitionStore'
import { schemaStore } from '../../utils/schemaStore'

type LifecycleOffer = {
  rowId: string
  walletTenantId: string
  issuerTenantId: string | null
  sourceType: string
  sourceId: string | null
  credentialType: string
  title: string | null
  body: string | null
  createdAt: string
  resolvedAt: string | null
  acceptedAt: string | null
  acceptedCredentialId: string | null
  attemptCount: number
  lastAttemptAt: string | null
  lastError: string | null
  lifecycleStatus: 'pending' | 'accepted' | 'withdrawn' | 'resolved' | 'expired'
  expiresAt: string | null
}

type LifecycleIssued = {
  issuanceSessionId: string
  credentialId: string
  holderDid: string | null
  credentialDefinitionId: string
  format: string
  issuedAt: string | null
  revoked: boolean
  revocationReason: string | null
  revokedAt: string | null
  allocationStatus: 'valid' | 'revoked' | 'suspended' | null
  statusListId: string | null
  statusListIndex: number | null
}

interface DirectIssueRequest {
  walletTenantId: string
  credentialType: string
  claims: Record<string, unknown>
  title?: string
  body?: string
}

interface ReplaceOfferRequest {
  reason?: string
}

interface ReofferRequest {
  reason?: string
}

interface UpdateCredentialStatusRequest {
  action: 'revoke'
  reason?: string
}

@Route('api/organizations/credential-operations')
@Tags('Organization Credential Operations')
export class CredentialOperationsController extends Controller {
  private readonly issuedCredentials = new IssuedCredentialRepository()

  private parseMetadata(raw: string | null): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private requireOrgTenant(request: ExRequest): string {
    const tenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!tenantId) throw new StatusException('Organization context required', 401)
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(tenantId) as { 1?: number } | undefined
    if (!row) throw new StatusException('Organization context required', 403)
    return tenantId
  }

  private requireManagerRole(request: ExRequest, orgTenantId: string): void {
    const userId = String((request as any)?.user?.id || '').trim()
    if (!userId) throw new StatusException('Authenticated organization member required', 401)
    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(userId, orgTenantId) as { role?: string } | undefined
    const role = String(membership?.role || '').toLowerCase()
    if (!['owner', 'admin'].includes(role)) {
      throw new StatusException('Only owners or admins can perform this operation', 403)
    }
  }

  private actorId(request: ExRequest): string {
    return String((request as any)?.user?.id || '')
  }

  private lifecycleStatusForOffer(row: Parameters<typeof offerLifecycleStatus>[0]): LifecycleOffer['lifecycleStatus'] {
    return offerLifecycleStatus(row)
  }

  private safeOfferError(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null
    const lower = raw.toLowerCase()
    if (lower.startsWith('withdrawn:')) return 'Withdrawn by the source workflow.'
    if (lower.startsWith('replaced:')) return 'Replaced with a new offer.'
    return 'Offer delivery failed; review the offer and reoffer it if it is still valid.'
  }

  private catalogue(orgTenantId: string, userId: string): OrgCredentialCatalogueItem[] {
    const configuration = container
      .resolve(OrganizationService)
      .getOrganizationWorkflowConfiguration(userId, orgTenantId)
    const profile = configuration.access
    if (profile.mode === 'unconfigured') return []
    const templates = configuration.templates.filter((template) => {
      const module = orgSetupProfileService.moduleForOperation(template.workflowType)
      return !module || profile.modules.some((item) => item.id === module && item.available)
    })
    const workflowItems = configuredCredentialCatalogue(
      orgTenantId,
      templates,
      credentialDefinitionStore.list(orgTenantId),
    )
    const ownItems: OrgCredentialCatalogueItem[] = orgRecordTypeService.list(orgTenantId).map((type) => ({
      credentialType: type.credentialType,
      directIssue: true,
      schemaId: orgRecordTypeService.active(orgTenantId, type.credentialType)?.schemaId,
      workflows: [],
      orgDefined: { label: type.label, version: type.version, fields: type.fields },
    }))
    return [
      ...workflowItems.filter((item) => !ownItems.some((own) => own.credentialType === item.credentialType)),
      ...ownItems,
    ]
  }

  private allowedDirectTypes(orgTenantId: string, userId: string): string[] {
    return this.catalogue(orgTenantId, userId)
      .filter((item) => item.directIssue)
      .map((item) => item.credentialType)
  }

  private validateDirectClaims(orgTenantId: string, credentialType: string, claims: Record<string, unknown>): void {
    if (Object.prototype.hasOwnProperty.call(claims, 'id')) {
      throw new StatusException('Claims cannot override the holder binding', 400)
    }
    if (orgRecordTypeService.active(orgTenantId, credentialType)) {
      orgRecordTypeService.validateClaims(orgTenantId, credentialType, claims)
      return
    }
    const definition = credentialDefinitionStore
      .list(orgTenantId)
      .find((candidate) => String(candidate.name || '').trim() === credentialType)
    if (!definition) throw new StatusException('Credential definition not found for this organization', 404)

    const result = schemaStore.validate(definition.schemaId, { credentialSubject: claims })
    if (!result.valid) {
      const errors = (result.errors || [])
        .slice(0, 5)
        .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
        .join('; ')
      throw new StatusException(`Claims do not match the credential schema: ${errors || 'invalid claims'}`, 400)
    }
  }

  @Get('/direct-types')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listDirectTypes(@Request() request: ExRequest): Promise<{ credentialTypes: string[] }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    return { credentialTypes: this.allowedDirectTypes(orgTenantId, this.actorId(request)) }
  }

  @Get('/catalogue')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getCatalogue(@Request() request: ExRequest): Promise<{ items: OrgCredentialCatalogueItem[] }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    return { items: this.catalogue(orgTenantId, this.actorId(request)) }
  }

  @Get('/offers/{offerRowId}/link')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getOfferLink(
    @Request() request: ExRequest,
    @Path() offerRowId: string,
  ): Promise<{ rowId: string; credentialType: string; offerUri: string; expiresAt: string | null }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT w.id, w.credential_type, w.offer_uri, w.accepted_at, w.resolved_at, w.last_error,
              COALESCE(json_extract(w.metadata, '$.offerExpiresAt'), co.expires_at,
                       datetime(w.created_at, '+30 days')) AS offer_expires_at
         FROM wallet_pending_offers w
         LEFT JOIN credential_offers co ON co.id = json_extract(w.metadata, '$.offerId')
        WHERE w.id = ? AND w.issuer_tenant_id = ? LIMIT 1`,
      )
      .get(offerRowId, orgTenantId) as
      | {
          id: string
          credential_type: string
          offer_uri: string | null
          accepted_at: string | null
          resolved_at: string | null
          last_error: string | null
          offer_expires_at: string | null
        }
      | undefined
    if (!row) throw new StatusException('Offer not found', 404)
    if (this.lifecycleStatusForOffer(row) !== 'pending') {
      throw new StatusException(
        'Only current pending offers have a shareable link. Replace an expired offer from its source flow.',
        409,
      )
    }
    if (!row.offer_uri)
      throw new StatusException('The offer link is unavailable. Reoffer it from its source flow.', 409)
    this.setHeader('Cache-Control', 'no-store')
    return {
      rowId: row.id,
      credentialType: row.credential_type,
      offerUri: row.offer_uri,
      expiresAt: row.offer_expires_at,
    }
  }

  @Get('/lifecycle')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getLifecycle(
    @Request() request: ExRequest,
    @Query() limit = 120,
  ): Promise<{ offers: LifecycleOffer[]; issued: LifecycleIssued[] }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    const bounded = Math.max(10, Math.min(300, Number(limit) || 120))
    const db = DatabaseManager.getDatabase()

    const offerRows = db
      .prepare(
        `SELECT w.id, w.tenant_id, w.issuer_tenant_id, w.source_type, w.source_id, w.credential_type,
                w.title, w.body, w.created_at, w.resolved_at, w.accepted_at, w.accepted_credential_id,
                attempt_count, last_attempt_at, last_error,
                COALESCE(json_extract(w.metadata, '$.offerExpiresAt'), co.expires_at,
                         datetime(w.created_at, '+30 days')) AS offer_expires_at
           FROM wallet_pending_offers w
           LEFT JOIN credential_offers co ON co.id = json_extract(w.metadata, '$.offerId')
          WHERE w.issuer_tenant_id = ?
          ORDER BY datetime(w.created_at) DESC
          LIMIT ?`,
      )
      .all(orgTenantId, bounded) as Array<Record<string, any>>

    const offers: LifecycleOffer[] = offerRows.map((row) => ({
      rowId: String(row.id),
      walletTenantId: String(row.tenant_id),
      issuerTenantId: row.issuer_tenant_id ? String(row.issuer_tenant_id) : null,
      sourceType: String(row.source_type),
      sourceId: row.source_id ? String(row.source_id) : null,
      credentialType: String(row.credential_type),
      title: row.title ? String(row.title) : null,
      body: row.body ? String(row.body) : null,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
      acceptedCredentialId: row.accepted_credential_id ? String(row.accepted_credential_id) : null,
      attemptCount: Number(row.attempt_count || 0),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
      lastError: this.safeOfferError(row.last_error),
      lifecycleStatus: this.lifecycleStatusForOffer(row),
      expiresAt: row.offer_expires_at ? String(row.offer_expires_at) : null,
    }))

    const issuedRows = db
      .prepare(
        `SELECT ic.id, ic.credential_id, ic.holder_did, ic.credential_definition_id, ic.format,
                ic.issued_at, ic.revoked, ic.revocation_reason, ic.revoked_at,
                csa.current_status, csa.status_index, csa.status_list_id
           FROM issued_credentials ic
           LEFT JOIN credential_status_allocations csa
             ON csa.issued_credential_ref = ic.credential_id
          WHERE ic.tenant_id = ?
          ORDER BY datetime(ic.issued_at) DESC
          LIMIT ?`,
      )
      .all(orgTenantId, bounded) as Array<Record<string, any>>

    const issued: LifecycleIssued[] = issuedRows.map((row) => ({
      issuanceSessionId: String(row.id),
      credentialId: String(row.credential_id),
      holderDid: row.holder_did ? String(row.holder_did) : null,
      credentialDefinitionId: String(row.credential_definition_id),
      format: String(row.format),
      issuedAt: row.issued_at ? String(row.issued_at) : null,
      revoked: Boolean(row.revoked),
      revocationReason: row.revocation_reason ? String(row.revocation_reason) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      allocationStatus: row.current_status ? (String(row.current_status) as LifecycleIssued['allocationStatus']) : null,
      statusListId: row.status_list_id ? String(row.status_list_id) : null,
      statusListIndex: row.status_index == null ? null : Number(row.status_index),
    }))

    return { offers, issued }
  }

  @Post('/direct-offers')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createDirectOffer(
    @Request() request: ExRequest,
    @Body() body: DirectIssueRequest,
  ): Promise<{ rowId: string; offerId: string }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)

    const credentialType = String(body.credentialType || '').trim()
    if (!credentialType) throw new StatusException('credentialType is required', 400)
    if (!body.claims || typeof body.claims !== 'object' || Array.isArray(body.claims)) {
      throw new StatusException('claims object is required', 400)
    }
    if (!this.allowedDirectTypes(orgTenantId, this.actorId(request)).includes(credentialType)) {
      throw new StatusException(
        'This type is not enabled for direct issuance by the organization setup and workflows. Use its configured source flow.',
        409,
      )
    }
    this.validateDirectClaims(orgTenantId, credentialType, body.claims)
    const targetWalletTenantId = String(body.walletTenantId || '').trim()
    if (!targetWalletTenantId) throw new StatusException('walletTenantId is required', 400)

    const target = DatabaseManager.getDatabase()
      .prepare(
        `SELECT u.id
           FROM ssi_users u
           JOIN org_memberships m ON m.user_id = u.id
          WHERE u.tenant_id = ? AND m.org_tenant_id = ? AND m.status = 'active'
          LIMIT 1`,
      )
      .get(targetWalletTenantId, orgTenantId)
    if (!target) throw new StatusException('Recipient must be an active member with a registered wallet', 404)

    const { rowId, offerId } = await sendDirectRecord({
      orgTenantId,
      walletTenantId: targetWalletTenantId,
      credentialType,
      claims: body.claims,
      title: body.title || `${credentialType.replace(/(VC|Record)$/, '')} record`,
      body: body.body || 'This record was sent directly by your organization. Keep it in your inbox.',
      sourceType: 'manual_direct_offer',
    })

    await auditService.logAction({
      tenantId: orgTenantId,
      actionType: 'credential_ops_direct_issue',
      resourceId: rowId,
      details: {
        actorId: this.actorId(request),
        credentialType,
        walletTenantId: targetWalletTenantId,
        offerId,
      },
    })

    return { rowId, offerId }
  }

  @Post('/offers/{offerRowId}/reoffer')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async reoffer(
    @Request() request: ExRequest,
    @Path() offerRowId: string,
    @Body() body: ReofferRequest,
  ): Promise<{ rowId: string; status: string }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    const reason = String(body?.reason || '').trim()
    if (reason.length < 3) throw new StatusException('A reason of at least 3 characters is required', 400)

    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT w.id, w.tenant_id, w.source_type, w.issuer_tenant_id, w.accepted_at, w.resolved_at, w.last_error,
                COALESCE(json_extract(w.metadata, '$.offerExpiresAt'), co.expires_at,
                         datetime(w.created_at, '+30 days')) AS offer_expires_at
           FROM wallet_pending_offers w
           LEFT JOIN credential_offers co ON co.id = json_extract(w.metadata, '$.offerId')
          WHERE w.id = ? LIMIT 1`,
      )
      .get(offerRowId) as
      | {
          id: string
          tenant_id: string
          source_type: string
          issuer_tenant_id?: string
          accepted_at?: string
          resolved_at?: string
          last_error?: string
          offer_expires_at?: string
        }
      | undefined
    if (!row || row.issuer_tenant_id !== orgTenantId) throw new StatusException('Offer not found', 404)
    if (row.accepted_at) throw new StatusException('Accepted offers cannot be reoffered', 409)
    if (
      String(row.last_error || '')
        .toLowerCase()
        .startsWith('withdrawn:')
    ) {
      throw new StatusException('Withdrawn offers cannot be reactivated by reoffer', 409)
    }
    if (row.offer_expires_at) {
      const expiresAt = new Date(row.offer_expires_at).getTime()
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new StatusException('This offer has expired; use replacement to create a new offer', 409)
      }
    }
    if (row.resolved_at) throw new StatusException('Resolved offers cannot be reoffered', 409)

    const now = new Date().toISOString()
    const updated = db
      .prepare(
        `UPDATE wallet_pending_offers
            SET resolved_at = NULL, last_error = NULL, last_attempt_at = ?, attempt_count = COALESCE(attempt_count, 0) + 1
          WHERE id = ? AND resolved_at IS NULL AND accepted_at IS NULL`,
      )
      .run(now, offerRowId)
    if (updated.changes !== 1) throw new StatusException('Offer is no longer eligible for reoffer', 409)

    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: row.tenant_id,
      dedupeKey: `wpo:${row.tenant_id}:reoffer:${offerRowId}:${updated.changes}:${now}`,
      payload: { tenantId: row.tenant_id, sourceType: row.source_type },
    })

    await auditService.logAction({
      tenantId: orgTenantId,
      actionType: 'credential_ops_reoffer',
      resourceId: offerRowId,
      details: { actorId: this.actorId(request), reason },
    })

    return { rowId: offerRowId, status: 'reoffered' }
  }

  @Post('/offers/{offerRowId}/replace')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async replaceOffer(
    @Request() request: ExRequest,
    @Path() offerRowId: string,
    @Body() body?: ReplaceOfferRequest,
  ): Promise<{ replacedRowId: string; newRowId: string }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    const reason = String(body?.reason || '').trim()
    if (reason.length < 3) throw new StatusException('A reason of at least 3 characters is required', 400)

    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`SELECT * FROM wallet_pending_offers WHERE id = ? LIMIT 1`).get(offerRowId) as
      | Record<string, any>
      | undefined
    if (!row || String(row.issuer_tenant_id || '') !== orgTenantId) throw new StatusException('Offer not found', 404)
    if (row.accepted_at) {
      throw new StatusException(
        'Accepted credentials must be replaced through their authoritative source workflow',
        409,
      )
    }
    if (
      row.resolved_at ||
      String(row.last_error || '')
        .toLowerCase()
        .startsWith('withdrawn:')
    ) {
      throw new StatusException('Resolved or withdrawn offers cannot be replaced', 409)
    }

    if (
      String(row.source_type || '') === 'workflow_vc_offer' &&
      String(row.credential_type || '') === 'JobAssignmentVC'
    ) {
      const result = await workflowVcOfferDispatcher.reissueJobAssignmentOffer(
        String(row.tenant_id),
        String(row.offer_uri),
      )
      if (result.outcome === 'not_current') throw new StatusException(result.reason, 409)
      if (result.outcome !== 'reissued') throw new StatusException('Offer cannot be replaced from this state', 409)
      const newRow = db
        .prepare(
          `SELECT id FROM wallet_pending_offers
            WHERE tenant_id = ? AND source_type = 'workflow_vc_offer'
              AND json_extract(metadata, '$.offerId') = ?
            ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(String(row.tenant_id), result.offerId) as { id?: string } | undefined
      if (!newRow?.id) throw new Error('The replacement offer was not queued in the holder inbox')
      await auditService.logAction({
        tenantId: orgTenantId,
        actionType: 'credential_ops_replace_offer',
        resourceId: offerRowId,
        details: { actorId: this.actorId(request), mode: 'workflow_assignment', reason, offerId: result.offerId },
      })
      return { replacedRowId: offerRowId, newRowId: newRow.id }
    }

    const metadata = this.parseMetadata(String(row.metadata || ''))
    const claims = metadata.claims
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
      throw new StatusException(
        'This offer cannot be replaced automatically because source claims are unavailable',
        409,
      )
    }
    const credentialType = String(row.credential_type || '').trim()
    if (!this.allowedDirectTypes(orgTenantId, this.actorId(request)).includes(credentialType)) {
      throw new StatusException('This offer type must be replaced from its source workflow', 409)
    }
    this.validateDirectClaims(orgTenantId, credentialType, claims as Record<string, unknown>)

    const offer = await credentialIssuanceService.createOffer({
      credentialType,
      claims: claims as Record<string, unknown>,
      tenantId: orgTenantId,
      requireExactCredentialType: true,
    })

    const now = new Date().toISOString()
    const newRowId = randomUUID()
    db.prepare(
      `INSERT INTO wallet_pending_offers (
         id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
         title, body, metadata, created_at, attempt_count, last_attempt_at
       ) VALUES (
         @id, @tenantId, @issuerTenantId, @sourceType, @sourceId, @credentialType, @offerUri,
         @title, @body, @metadata, @createdAt, 0, @createdAt
       )`,
    ).run({
      id: newRowId,
      tenantId: String(row.tenant_id),
      issuerTenantId: orgTenantId,
      sourceType: 'manual_direct_offer',
      sourceId: String(row.source_id || `replace:${row.id}`),
      credentialType,
      offerUri: offer.credential_offer_deeplink,
      title: row.title ? String(row.title) : `${credentialType.replace(/VC$/, '')} record`,
      body: row.body ? String(row.body) : 'A replacement record was sent by your organization.',
      metadata: JSON.stringify({
        ...metadata,
        claims,
        offerId: offer.offerId,
        offerExpiresAt: offer.expiresAt,
        replaces: { rowId: row.id, reason },
      }),
      createdAt: now,
    })
    db.prepare(
      `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = ? WHERE id = ?`,
    ).run(now, `replaced: ${reason}`, offerRowId)
    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: String(row.tenant_id),
      dedupeKey: `wpo:${row.tenant_id}:manual_direct_offer:${newRowId}`,
      payload: { tenantId: String(row.tenant_id), sourceType: 'manual_direct_offer' },
    })

    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: String(row.tenant_id),
      dedupeKey: `wpo:${row.tenant_id}:manual_direct_offer:${newRowId}`,
      payload: { tenantId: String(row.tenant_id), sourceType: 'manual_direct_offer' },
    })

    await auditService.logAction({
      tenantId: orgTenantId,
      actionType: 'credential_ops_replace_offer',
      resourceId: offerRowId,
      details: { actorId: this.actorId(request), mode: 'direct', reason, newRowId },
    })

    return { replacedRowId: offerRowId, newRowId }
  }

  @Post('/credentials/{credentialId}/status')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async updateCredentialStatus(
    @Request() request: ExRequest,
    @Path() credentialId: string,
    @Body() body: UpdateCredentialStatusRequest,
  ): Promise<{ credentialId: string; action: string; applied: boolean }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireManagerRole(request, orgTenantId)
    const action = String(body?.action || '').trim() as UpdateCredentialStatusRequest['action']
    const reason = String(body?.reason || '').trim()
    if (reason.length < 3) throw new StatusException('A reason of at least 3 characters is required', 400)
    if (action !== 'revoke') throw new StatusException('Only revocation is currently supported', 400)

    const record =
      this.issuedCredentials.findByCredentialId(credentialId) || this.issuedCredentials.findById(credentialId)
    if (!record || record.tenantId !== orgTenantId) throw new StatusException('Credential not found', 404)

    const applied = statusListAllocatorService.transitionStatusByCredentialRef(record.credentialId, 'revoke')
    if (applied) this.issuedCredentials.revoke(record.credentialId, reason)

    if (!applied) throw new StatusException('No status allocation exists for this credential', 409)

    await auditService.logAction({
      tenantId: orgTenantId,
      actionType: `credential_ops_${action}`,
      resourceId: record.credentialId,
      details: { actorId: this.actorId(request), reason },
    })

    return { credentialId: record.credentialId, action, applied }
  }
}

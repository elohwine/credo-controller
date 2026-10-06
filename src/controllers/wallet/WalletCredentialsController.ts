/* eslint-disable no-console */
/**
 * Wallet credential inbox.
 *
 * Surfaces everything queued for a holder wallet in `wallet_pending_offers` (credential offers,
 * workflow-stage task cards, approval assignments, actor credentials …), lets the holder accept
 * OIDC4VCI offers into their tenant wallet, and keeps the queue tidy (stale / expired rows are
 * resolved instead of lingering as broken cards).
 */
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { Request as ExRequest } from 'express'

import { Agent, W3cCredentialRecord, W3cCredentialService } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Get, Delete, Route, Tags, Body, Path, Request, Security, ValidateError } from 'tsoa'
import { container } from 'tsyringe'

import { EMPLOYEE_OFFER_SOURCE_TYPE } from '../../config/credentials/EmployeeVC'
import { ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE } from '../../config/credentials/OrgWorkflowActorVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../config/credentials/PlatformIdentityVC'
import { PLATFORM_IDENTITY_OFFER_SOURCE_TYPE } from '../../services/OrgMembershipCredentialService'
import { AuthContext, SCOPES } from '../../enums'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { outboxService } from '../../services/OutboxService'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'WalletCredentialsController' })

type WalletAuthContext = AuthContext | 'unknown'

interface PendingOffer {
  id: string
  sourceId?: string
  issuerName: string
  credentialType: string
  offerUri: string
  createdAt?: string
  sourceType?: string
  workflowRunId?: string
  status?: 'pending' | 'retrying' | 'accepted' | 'resolved'
  attemptCount?: number
  lastAttemptAt?: string
  lastError?: string
  title?: string
  body?: string
  claims?: Record<string, any>
}

interface PendingReceipt {
  receiptRowId: string
  paymentId?: string
  sourceId?: string
  credentialType: string
  offerUri: string
  sourceType?: string
  status?: 'pending' | 'retrying' | 'accepted' | 'resolved'
  amount?: number
  currency?: string
  merchant?: string
  merchantName?: string
  paymentLinkId?: string
  invoiceRef?: string
  quoteId?: string
  paymentUrl?: string
  metadata?: Record<string, any>
  issuedAt: string
}

interface PendingOfferRow {
  id: string
  source_id: string | null
  credential_type: string
  offer_uri: string
  title: string | null
  body: string | null
  metadata: string | null
  created_at: string | null
  source_type: string | null
  workflow_run_id: string | null
  attempt_count: number | null
  last_attempt_at: string | null
  last_error: string | null
  accepted_at: string | null
  resolved_at: string | null
}

/** Task-style rows that are rendered from their own tables, not as raw credential offers. */
const TASK_SOURCE_TYPES = [
  'workflow_assignment',
  'workflow_request_assignment',
  'ap_workflow_assignment',
  'requisition_stage_action',
  'workflow_stage_action',
]

function parseJson(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeOffer(raw?: string): { wrapper: string | null; inner: string | null } {
  if (!raw) return { wrapper: null, inner: null }

  let wrapper = raw
  for (let i = 0; i < 3; i++) {
    if (wrapper.startsWith('openid-credential-offer://') || wrapper.startsWith('openid-initiate-issuance://')) break
    try {
      const decoded = decodeURIComponent(wrapper)
      if (decoded === wrapper) break
      wrapper = decoded
    } catch {
      break
    }
  }

  let inner: string | null = null
  try {
    if (wrapper.startsWith('openid-credential-offer://') || wrapper.startsWith('openid-initiate-issuance://')) {
      const q = wrapper.split('?')[1] || ''
      const params = new URLSearchParams(q)
      inner = params.get('credential_offer_uri') || params.get('credential_offer_url') || params.get('request') || null
    } else if (wrapper.startsWith('http://') || wrapper.startsWith('https://')) {
      // Web-wallet wrappers (…/api/siop/initiateIssuance?credential_offer_uri=…) carry the real URI as a param.
      try {
        const url = new URL(wrapper)
        inner = url.searchParams.get('credential_offer_uri') || url.searchParams.get('credential_offer_url') || wrapper
      } catch {
        inner = wrapper
      }
    }
  } catch {
    inner = null
  }

  if (inner) {
    let candidate = inner
    for (let i = 0; i < 3; i++) {
      if (candidate.startsWith('http://') || candidate.startsWith('https://')) break
      try {
        const decoded = decodeURIComponent(candidate)
        if (decoded === candidate) break
        candidate = decoded
      } catch {
        break
      }
    }
    inner = candidate.startsWith('http://') || candidate.startsWith('https://') ? candidate : inner
  }

  return { wrapper, inner }
}

@Route('api/wallet/credentials')
@Tags('Wallet-Credentials')
export class WalletCredentialsController extends Controller {
  private resolveWalletContext(request: ExRequest): {
    walletTenantId?: string
    userId?: string
    authContext: WalletAuthContext
    orgRole?: string
    activeOrgTenantId?: string
  } {
    const reqUser = ((request as any).user || {}) as Record<string, any>
    const rawAuthContext = (request as any).authContext
    const authContext: WalletAuthContext =
      rawAuthContext === AuthContext.Org || rawAuthContext === AuthContext.Personal
        ? rawAuthContext
        : reqUser.orgRole
          ? AuthContext.Org
          : AuthContext.Personal
    const userId = (reqUser.id as string | undefined) || ((request as any).userId as string | undefined)
    const tokenTenantId = ((request as any).tenantId as string | undefined) || (reqUser.tenantId as string | undefined)
    const orgRole = reqUser.orgRole as string | undefined

    if (authContext !== AuthContext.Org) {
      return {
        walletTenantId: tokenTenantId || (reqUser.walletId as string | undefined),
        userId,
        authContext,
      }
    }

    // Org-context token: the inbox belongs to the person's own wallet, derived from their profile.
    if (!userId) {
      return { walletTenantId: undefined, userId: undefined, authContext, orgRole, activeOrgTenantId: tokenTenantId }
    }

    const db = DatabaseManager.getDatabase()
    const userRow = db.prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE id = ? LIMIT 1').get(userId) as
      | { walletTenantId?: string }
      | undefined

    return {
      walletTenantId: userRow?.walletTenantId,
      userId,
      authContext,
      orgRole,
      activeOrgTenantId: tokenTenantId,
    }
  }

  private holderModule(baseAgent: Agent<RestMultiTenantAgentModules>): any {
    return (baseAgent as any).openid4vc?.holder || (baseAgent.modules as any).openId4VcHolder
  }

  /**
   * If `rawOffer` belongs to an unresolved role-card row (`org_workflow_actor`), ask the actor
   * credential service to issue a fresh offer for the same member/workflow. Returns the new
   * offer URI, or null when the row is not a role card or re-issuing failed.
   */
  private async reissueExpiredRoleCard(
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    tenantId: string,
    rawOffer: string,
    request: ExRequest,
  ): Promise<string | null> {
    try {
      const row = db
        .prepare(
          `SELECT id, metadata FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ? AND accepted_at IS NULL
             AND (offer_uri = ? OR offer_uri LIKE ?)
           ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(tenantId, ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE, rawOffer, `%${rawOffer.slice(-60)}%`) as
        | { id: string; metadata?: string | null }
        | undefined
      if (!row) return null
      let meta: any = {}
      try {
        meta = row.metadata ? JSON.parse(row.metadata) : {}
      } catch {
        meta = {}
      }
      const orgTenantId = String(meta.orgTenantId || '')
      const workflowType = String(meta.workflowType || '')
      const stageAction = Array.isArray(meta.stageActions) ? String(meta.stageActions[0] || '') : ''
      if (!orgTenantId || !workflowType || !stageAction) return null

      const { orgWorkflowActorCredentialService } = await import('../../services/OrgWorkflowActorCredentialService')
      const result = await orgWorkflowActorCredentialService.ensureActorCredential({
        orgTenantId,
        workflowType,
        stageAction,
        force: true,
        reason: 'offer_expired_auto_resend',
      })
      if (result.outcome !== 'offered' || !result.offerRowId) {
        request.logger?.warn({ result }, 'Could not re-issue expired role card')
        return null
      }
      const fresh = db
        .prepare(`SELECT offer_uri FROM wallet_pending_offers WHERE id = ? LIMIT 1`)
        .get(result.offerRowId) as { offer_uri?: string } | undefined
      if (!fresh?.offer_uri) return null
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = 'expired: re-sent' WHERE id = ?`,
      ).run(new Date().toISOString(), row.id)
      return fresh.offer_uri
    } catch (error: any) {
      request.logger?.warn({ err: error?.message }, 'Re-issuing expired role card failed')
      return null
    }
  }

  /**
   * Employee offers expire when the issuer session is gone (restart, or the old 10-minute code).
   * Send a fresh EmployeeCredential for the same person and return its offer URI.
   */
  private async reissueExpiredEmployeeOffer(
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    tenantId: string,
    rawOffer: string,
    request: ExRequest,
  ): Promise<string | null> {
    try {
      const row = db
        .prepare(
          `SELECT id, metadata FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ? AND accepted_at IS NULL
             AND (offer_uri = ? OR offer_uri LIKE ?)
           ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(tenantId, EMPLOYEE_OFFER_SOURCE_TYPE, rawOffer, `%${rawOffer.slice(-60)}%`) as
        | { id: string; metadata?: string | null }
        | undefined
      if (!row) return null
      let meta: any = {}
      try {
        meta = row.metadata ? JSON.parse(row.metadata) : {}
      } catch {
        meta = {}
      }
      const orgTenantId = String(meta.orgTenantId || '')
      const userId = String(meta.userId || '')
      if (!orgTenantId || !userId) return null

      const now = new Date().toISOString()
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = 'expired: re-sent' WHERE id = ?`,
      ).run(now, row.id)

      const { orgMembershipCredentialService } = await import('../../services/OrgMembershipCredentialService')
      const result = await orgMembershipCredentialService.ensureEmployeeCredential({
        orgTenantId,
        userId,
        walletTenantId: tenantId,
        role: String(meta.role || meta.memberRole || 'employee'),
        department: meta.department ? String(meta.department) : undefined,
        source: meta.source === 'onboarding' || meta.source === 'internal_contact' ? meta.source : 'membership',
      })
      if (result.outcome !== 'offered' && result.outcome !== 'already_offered') {
        request.logger?.warn({ result }, 'Could not re-issue expired employee credential')
        return null
      }
      const fresh = db
        .prepare(
          `SELECT offer_uri FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND resolved_at IS NULL
           ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(tenantId, EMPLOYEE_OFFER_SOURCE_TYPE, `${orgTenantId}:${userId}`) as { offer_uri?: string } | undefined
      return fresh?.offer_uri || null
    } catch (error: any) {
      request.logger?.warn({ err: error?.message }, 'Re-issuing expired employee credential failed')
      return null
    }
  }

  /**
   * Platform identity cards stay in the inbox until accepted. If the issuer session is gone
   * or the offer cannot be claimed, send a fresh one and return its offer URI.
   */
  private async reissueExpiredPlatformIdentity(
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    tenantId: string,
    rawOffer: string,
    request: ExRequest,
  ): Promise<string | null> {
    try {
      const row = db
        .prepare(
          `SELECT id, metadata FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ? AND accepted_at IS NULL
             AND (offer_uri = ? OR offer_uri LIKE ?)
           ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(tenantId, PLATFORM_IDENTITY_OFFER_SOURCE_TYPE, rawOffer, `%${rawOffer.slice(-60)}%`) as
        | { id: string; metadata?: string | null }
        | undefined
      if (!row) return null
      let meta: any = {}
      try {
        meta = row.metadata ? JSON.parse(row.metadata) : {}
      } catch {
        meta = {}
      }
      const now = new Date().toISOString()
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), last_error = 'expired: re-sent' WHERE id = ?`,
      ).run(now, row.id)

      const { SSIAuthService } = await import('../../services/SSIAuthService')
      const ssiAuthService = container.resolve(SSIAuthService)
      const displayName = meta.displayName ? String(meta.displayName) : undefined
      const freshUri = await ssiAuthService.reissuePlatformIdentityOffer(tenantId, displayName)
      if (!freshUri) {
        request.logger?.warn({ tenantId }, 'Could not re-issue platform identity')
        return null
      }
      const fresh = db
        .prepare(
          `SELECT offer_uri FROM wallet_pending_offers
           WHERE tenant_id = ? AND source_type = ? AND resolved_at IS NULL
           ORDER BY datetime(created_at) DESC LIMIT 1`,
        )
        .get(tenantId, PLATFORM_IDENTITY_OFFER_SOURCE_TYPE) as { offer_uri?: string } | undefined
      return fresh?.offer_uri || freshUri
    } catch (error: any) {
      request.logger?.warn({ err: error?.message }, 'Re-issuing platform identity failed')
      return null
    }
  }

  /**
   * Redeem a resolved pre-authorized offer with the Credo 0.7 holder API and return the received
   * credentials (`{ record }` entries). Falls back to the legacy single-call API when present.
   */
  private async requestCredentialsFromOffer(holder: any, resolvedOffer: any, holderDidUrl: string): Promise<any[]> {
    const credentialBindingResolver = async () => ({ method: 'did', didUrls: [holderDidUrl], didUrl: holderDidUrl })

    if (typeof holder.requestToken === 'function' && typeof holder.requestCredentials === 'function') {
      const tokenResponse = await holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
      const result = await holder.requestCredentials({
        resolvedCredentialOffer: resolvedOffer,
        accessToken: tokenResponse.accessToken,
        cNonce: tokenResponse.cNonce,
        dpop: tokenResponse.dpop,
        verifyCredentialStatus: false,
        credentialBindingResolver,
      })
      return Array.isArray(result?.credentials) ? result.credentials : Array.isArray(result) ? result : []
    }

    if (typeof holder.acceptCredentialOfferUsingPreAuthorizedCode === 'function') {
      const legacy = await holder.acceptCredentialOfferUsingPreAuthorizedCode(resolvedOffer, {
        userPin: undefined,
        verifyCredentialStatus: false,
        credentialBindingResolver,
      })
      return Array.isArray(legacy) ? legacy : []
    }

    throw new Error('OpenID4VC holder module does not expose a credential request API')
  }

  private markOfferResolved(rowId: string, reason: string): void {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `
      UPDATE wallet_pending_offers
      SET resolved_at = COALESCE(resolved_at, @now),
          last_attempt_at = @now,
          last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN @reason ELSE last_error END
      WHERE id = @id
    `,
    ).run({ id: rowId, now, reason })
  }

  /**
   * Everything waiting in the holder's wallet inbox: credential offers (identity, receipts,
   * actor credentials …) and workflow task cards.
   */
  @Get('/pending-offers')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async getPendingOffers(@Request() request: ExRequest): Promise<{ offers: PendingOffer[] }> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
    const context = this.resolveWalletContext(request)
    const tenantId = context.walletTenantId

    if (!tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const offers: PendingOffer[] = []
    const db = DatabaseManager.getDatabase()
    const nowIso = new Date().toISOString()

    try {
      const queuedRows = db
        .prepare(
          `
          SELECT id, source_id, credential_type, offer_uri, title, body, metadata, created_at, source_type,
                 workflow_run_id, attempt_count, last_attempt_at, last_error, accepted_at, resolved_at
          FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND COALESCE(source_type, '') NOT IN (${TASK_SOURCE_TYPES.map(() => '?').join(', ')})
            AND resolved_at IS NULL
          ORDER BY created_at DESC
          LIMIT 200
        `,
        )
        .all(tenantId, ...TASK_SOURCE_TYPES) as PendingOfferRow[]

      // Wallet contents decide whether identity offers are still needed.
      let walletTypes: string[][] = []
      try {
        const tenantAgent = await baseAgent.modules.tenants.getTenantAgent({ tenantId })
        try {
          const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)
          const records = await w3cService.getAllCredentialRecords(tenantAgent.context)
          walletTypes = records.map((record: any) => {
            const direct = record?.credential?.type || []
            const vc = record?.credential?.vc?.type || []
            return [...direct, ...vc].filter(Boolean).map(String)
          })
        } finally {
          await tenantAgent.endSession()
        }
      } catch (walletErr: any) {
        request.logger?.warn({ err: walletErr?.message, tenantId }, 'Could not read wallet contents for inbox dedupe')
      }
      const walletHas = (type: string) => walletTypes.some((types) => types.includes(type))
      const hasPlatformIdentityInWallet = walletHas(PLATFORM_IDENTITY_VC_TYPE) || walletHas('PlatformIdentityVC')

      for (const row of queuedRows) {
        const credentialType = row.credential_type || 'VerifiableCredential'
        const claims = parseJson(row.metadata)

        // GenericID is retired from holder onboarding.
        if (credentialType.includes('GenericID')) {
          this.markOfferResolved(row.id, 'retired: GenericID onboarding')
          continue
        }

        const isPlatformIdentity = credentialType.includes('PlatformIdentity')
        if (isPlatformIdentity && hasPlatformIdentityInWallet) {
          this.markOfferResolved(row.id, 'resolved: identity credential already in wallet')
          continue
        }

        // Actor credentials: if the wallet already holds one with the same scope fingerprint the
        // offer is done; otherwise keep it pending even when the issuer-side offer expired (the
        // organization can re-offer from Setup → Workflow Actors).
        if (row.source_type === ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE && claims.fingerprint) {
          const accepted = db
            .prepare(
              `
              SELECT id FROM wallet_pending_offers
              WHERE tenant_id = ? AND source_type = ? AND accepted_at IS NOT NULL
                AND json_extract(metadata, '$.fingerprint') = ?
              LIMIT 1
            `,
            )
            .get(tenantId, ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE, claims.fingerprint) as { id?: string } | undefined
          if (accepted?.id) {
            this.markOfferResolved(row.id, 'resolved: actor credential already accepted')
            continue
          }
        }

        // Keep the card until the person accepts it. Probing the offer here used to
        // hide a still-valid platform identity card when issuer metadata failed to load.
        let status: PendingOffer['status'] = row.last_error ? 'retrying' : 'pending'

        offers.push({
          id: row.id,
          sourceId: row.source_id || undefined,
          issuerName: claims.orgName ? String(claims.orgName) : 'Credentis Platform',
          credentialType,
          offerUri: row.offer_uri,
          createdAt: row.created_at || undefined,
          sourceType: row.source_type || undefined,
          workflowRunId: row.workflow_run_id || undefined,
          status,
          attemptCount: row.attempt_count || 0,
          lastAttemptAt: row.last_attempt_at || undefined,
          lastError: row.last_error || undefined,
          title: row.title || undefined,
          body: row.body || undefined,
          claims,
        })
      }

      // ── Field / workflow assignments: only while the run is still ASSIGNED ────────────────
      try {
        const assignmentRows = db
          .prepare(
            `
            SELECT id, source_type, source_id, credential_type, title, body, metadata, created_at, workflow_run_id
            FROM wallet_pending_offers
            WHERE tenant_id = ? AND source_type = 'workflow_assignment' AND resolved_at IS NULL
            ORDER BY created_at DESC
            LIMIT 100
          `,
          )
          .all(tenantId) as Array<Pick<PendingOfferRow, 'id' | 'source_type' | 'source_id' | 'credential_type' | 'title' | 'body' | 'metadata' | 'created_at' | 'workflow_run_id'>>

        const seenRunIds = new Set<string>()
        for (const aRow of assignmentRows) {
          const meta = parseJson(aRow.metadata)
          const workflowRunId = String(aRow.workflow_run_id || aRow.source_id || meta.workflowRunId || '')
          let runStage = String(meta.workflowStage || 'ASSIGNED').toUpperCase()

          const run = workflowRunId
            ? (db.prepare('SELECT status, output FROM workflow_runs WHERE id = ? LIMIT 1').get(workflowRunId) as
                | { status: string | null; output: string | null }
                | undefined)
            : undefined
          const output = parseJson(run?.output)
          if (typeof output.workflowStage === 'string' && output.workflowStage.trim()) {
            runStage = output.workflowStage.toUpperCase()
          }

          const runStatus = String(run?.status || '').toLowerCase()
          const actionable = runStage === 'ASSIGNED' && (!run || ['pending', 'running', 'paused'].includes(runStatus))
          if (!actionable) {
            this.markOfferResolved(aRow.id, 'auto-resolved: workflow no longer ASSIGNED')
            continue
          }
          if (workflowRunId) {
            if (seenRunIds.has(workflowRunId)) {
              this.markOfferResolved(aRow.id, 'auto-resolved: superseded duplicate assignment')
              continue
            }
            seenRunIds.add(workflowRunId)
          }

          offers.push({
            id: aRow.id,
            issuerName: meta.orgName || (meta.orgTenantId ? `Org: ${String(meta.orgTenantId).slice(0, 8)}` : 'Field Dispatcher'),
            credentialType: aRow.credential_type || 'FieldTask',
            offerUri: '',
            createdAt: aRow.created_at || undefined,
            sourceType: 'workflow_assignment',
            workflowRunId: workflowRunId || undefined,
            status: 'pending',
            attemptCount: 0,
            title: aRow.title || meta.plainLanguageTitle || `Assigned Task: ${meta.poNumber || aRow.source_id}`,
            body: aRow.body || `Current stage: ${runStage} | ${meta.location || 'Field site'}`,
            claims: { ...meta, workflowRunId: workflowRunId || meta.workflowRunId, workflowStage: runStage },
          })
        }
      } catch (assignmentErr: any) {
        request.logger?.warn({ err: assignmentErr?.message }, 'workflow_assignment cards unavailable')
      }

      // ── Approval assignments: only while the workflow request is pending ───────────────────
      try {
        const requestRows = db
          .prepare(
            `
            SELECT wpo.id, wpo.source_id, wpo.offer_uri, wpo.title, wpo.body, wpo.metadata, wpo.created_at,
                   wr.status AS request_status, wr.request_type, wr.payload, wr.target_org_tenant_id, wr.assignee_role
            FROM wallet_pending_offers wpo
            LEFT JOIN workflow_requests wr ON wr.id = wpo.source_id
            WHERE wpo.tenant_id = ? AND wpo.source_type = 'workflow_request_assignment' AND wpo.resolved_at IS NULL
            ORDER BY wpo.created_at DESC
            LIMIT 100
          `,
          )
          .all(tenantId) as Array<{
          id: string
          source_id: string | null
          offer_uri: string | null
          title: string | null
          body: string | null
          metadata: string | null
          created_at: string | null
          request_status: string | null
          request_type: string | null
          payload: string | null
          target_org_tenant_id: string | null
          assignee_role: string | null
        }>

        for (const row of requestRows) {
          const requestId = String(row.source_id || '').trim()
          const requestStatus = String(row.request_status || '').toLowerCase()
          if (!requestId || requestStatus !== 'pending') {
            this.markOfferResolved(row.id, 'auto-resolved: workflow request not pending')
            continue
          }
          const metadataClaims = parseJson(row.metadata)
          const payloadClaims = parseJson(row.payload)
          offers.push({
            id: row.id,
            sourceId: requestId,
            issuerName: 'Organization Approval',
            credentialType: 'WorkflowRequestApproval',
            offerUri: row.offer_uri || `workflow-request://${encodeURIComponent(requestId)}`,
            createdAt: row.created_at || undefined,
            sourceType: 'workflow_request_assignment',
            status: 'pending',
            attemptCount: 0,
            title: row.title || `Approval Request: ${row.request_type || 'workflow'}`,
            body: row.body || 'You have an approval request assigned to you.',
            claims: {
              ...payloadClaims,
              ...metadataClaims,
              requestId,
              requestType: row.request_type || metadataClaims.requestType,
              targetOrgTenantId: row.target_org_tenant_id || metadataClaims.targetOrgTenantId,
              assigneeRole: row.assignee_role || metadataClaims.assigneeRole,
              requestStatus,
            },
          })
        }
      } catch (requestErr: any) {
        request.logger?.warn({ err: requestErr?.message }, 'workflow_request_assignment cards unavailable')
      }

      // ── AP / AR workflow actions: only while the transaction still needs this actor ───────
      try {
        const apRows = db
          .prepare(
            `
            SELECT wpo.id, wpo.source_id, wpo.offer_uri, wpo.title, wpo.body, wpo.metadata, wpo.created_at,
                   tx.status AS tx_status, tx.required_action, tx.required_proof_type, tx.required_actor_tenant_id,
                   tx.collector_tenant_id, tx.payer_tenant_id
            FROM wallet_pending_offers wpo
            LEFT JOIN ar_ap_workflow_transactions tx ON tx.id = wpo.source_id
            WHERE wpo.tenant_id = ? AND wpo.source_type = 'ap_workflow_assignment' AND wpo.resolved_at IS NULL
            ORDER BY wpo.created_at DESC
            LIMIT 100
          `,
          )
          .all(tenantId) as Array<Record<string, any>>

        for (const row of apRows) {
          const transactionId = String(row.source_id || '').trim()
          if (!transactionId) continue
          const status = String(row.tx_status || '').toLowerCase()
          const requiredAction = String(row.required_action || '').trim()
          const requiredActorTenant = String(row.required_actor_tenant_id || '').trim()
          if (!requiredAction || ['completed', 'cancelled'].includes(status) || (requiredActorTenant && requiredActorTenant !== tenantId)) {
            db.prepare(
              `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?), accepted_at = COALESCE(accepted_at, ?), last_attempt_at = ? WHERE id = ?`,
            ).run(nowIso, nowIso, nowIso, row.id)
            continue
          }
          const metadataClaims = parseJson(row.metadata)
          offers.push({
            id: row.id,
            sourceId: transactionId,
            issuerName: 'AP Workflow Coordinator',
            credentialType: 'WorkflowActionAssignment',
            offerUri: row.offer_uri || `ap-workflow://${encodeURIComponent(transactionId)}`,
            createdAt: row.created_at || undefined,
            sourceType: 'ap_workflow_assignment',
            status: 'pending',
            attemptCount: 0,
            title: row.title || 'AP Workflow Action Required',
            body: row.body || `Action '${requiredAction}' is waiting for you.`,
            claims: {
              ...metadataClaims,
              requestType: 'ap_workflow',
              workflowType: 'ap_trust_workflow',
              transactionId,
              requiredAction,
              requiredProofType: row.required_proof_type || metadataClaims.requiredProofType,
              targetOrgTenantId: metadataClaims.targetOrgTenantId || row.collector_tenant_id || row.payer_tenant_id,
            },
          })
        }
      } catch (apErr: any) {
        request.logger?.debug({ err: apErr?.message }, 'ap_workflow_assignment cards unavailable')
      }

      // Stage tasks (requisitions, fees, AP/AR, FEPT, department, platform requests) including
      // cards copied to delegates. They are not credential offers.
      try {
        const stageRows = db
          .prepare(
            `
            SELECT id, source_type, source_id, credential_type, offer_uri, title, body, metadata, created_at
            FROM wallet_pending_offers
            WHERE tenant_id = ?
              AND source_type IN ('requisition_stage_action', 'workflow_stage_action')
              AND resolved_at IS NULL
            ORDER BY created_at DESC
            LIMIT 100
          `,
          )
          .all(tenantId) as Array<Record<string, any>>

        for (const row of stageRows) {
          const claims = parseJson(row.metadata)
          offers.push({
            id: row.id,
            sourceId: row.source_id || undefined,
            issuerName: claims.orgName || (claims.targetOrgTenantId ? `Org: ${String(claims.targetOrgTenantId).slice(0, 8)}` : 'Organization'),
            credentialType: row.credential_type || 'WorkflowStageAction',
            offerUri: row.offer_uri || '',
            createdAt: row.created_at || undefined,
            sourceType: row.source_type || undefined,
            status: 'pending',
            attemptCount: 0,
            title: row.title || 'Workflow stage action',
            body: row.body || undefined,
            claims,
          })
        }
      } catch (stageErr: any) {
        request.logger?.warn({ err: stageErr?.message }, 'workflow stage cards unavailable')
      }

      return { offers }
    } catch (error: any) {
      request.logger?.error({ err: error.message }, 'Failed to get pending offers')
      throw error
    }
  }

  /**
   * Dismiss a pending inbox card for the authenticated wallet.
   */
  @Delete('/offers/{offerId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async dismissOffer(
    @Path() offerId: string,
    @Request() request: ExRequest,
  ): Promise<{ success: boolean; dismissed: boolean }> {
    const context = this.resolveWalletContext(request)
    const tenantId = context.walletTenantId
    if (!tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const db = DatabaseManager.getDatabase()
    const nowIso = new Date().toISOString()
    const result = db
      .prepare(
        `
        UPDATE wallet_pending_offers
        SET resolved_at = COALESCE(resolved_at, ?),
            last_attempt_at = ?,
            last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN 'dismissed_by_user' ELSE last_error END
        WHERE id = ? AND tenant_id = ? AND resolved_at IS NULL
      `,
      )
      .run(nowIso, nowIso, offerId, tenantId)

    return { success: true, dismissed: (result.changes || 0) > 0 }
  }

  /**
   * Credential offers not yet accepted: payment receipts (ack_payment_receipts) plus queued
   * workflow/contact offers (wallet_pending_offers). The holder accepts each explicitly.
   */
  @Get('/pending-receipts')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async getPendingReceipts(@Request() request: ExRequest): Promise<{ pendingReceipts: PendingReceipt[] }> {
    const context = this.resolveWalletContext(request)
    const tenantId = context.walletTenantId
    if (!tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const db = DatabaseManager.getDatabase()
    const pendingReceipts: PendingReceipt[] = []

    try {
      const receiptRows = db
        .prepare(
          `
          SELECT apr.id AS receipt_row_id, apr.payment_id, apr.credential_type, apr.credential_offer_url,
                 apr.issued_at, ap.amount, ap.currency, ap.merchant_tenant_id AS merchant, ap.invoice_id, ap.metadata AS payment_metadata
          FROM ack_payment_receipts apr
          JOIN ack_payments ap ON apr.payment_id = ap.id
          WHERE ap.tenant_id = ? AND apr.credential_offer_url IS NOT NULL AND apr.resolved_at IS NULL
          ORDER BY apr.issued_at DESC
        `,
        )
        .all(tenantId) as Array<Record<string, any>>

      for (const r of receiptRows) {
        const metadata = parseJson(r.payment_metadata)
        pendingReceipts.push({
          receiptRowId: r.receipt_row_id,
          paymentId: r.payment_id ?? undefined,
          credentialType: r.credential_type || 'ReceiptVC',
          offerUri: r.credential_offer_url,
          sourceType: 'payment',
          status: 'pending',
          amount: r.amount ?? undefined,
          currency: r.currency ?? undefined,
          merchant: r.merchant ?? undefined,
          invoiceRef: String(r.invoice_id || metadata.invoiceRef || '').trim() || undefined,
          metadata,
          issuedAt: r.issued_at,
        })
      }
    } catch (receiptErr: any) {
      request.logger?.debug({ err: receiptErr?.message }, 'ack_payment_receipts unavailable')
    }

    const queuedRows = db
      .prepare(
        `
        SELECT id, credential_type, offer_uri, created_at, source_id, source_type, metadata
        FROM wallet_pending_offers
        WHERE tenant_id = ? AND resolved_at IS NULL
          AND COALESCE(source_type, '') NOT IN ('payment_link', ${TASK_SOURCE_TYPES.map(() => '?').join(', ')})
        ORDER BY created_at DESC
      `,
      )
      .all(tenantId, ...TASK_SOURCE_TYPES) as Array<Record<string, any>>

    for (const r of queuedRows) {
      if (!r.offer_uri) continue
      const metadata = parseJson(r.metadata)
      pendingReceipts.push({
        receiptRowId: r.id,
        sourceId: r.source_id ?? undefined,
        credentialType: r.credential_type || 'VerifiableCredential',
        offerUri: r.offer_uri,
        sourceType: r.source_type || undefined,
        status: 'pending',
        paymentLinkId: String(metadata.paymentLinkId || '').trim() || undefined,
        invoiceRef: String(metadata.invoiceRef || metadata.invoiceId || '').trim() || undefined,
        quoteId: String(metadata.quoteId || '').trim() || undefined,
        paymentUrl: String(metadata.paymentUrl || '').trim() || undefined,
        merchantName: String(metadata.merchantName || metadata.orgName || '').trim() || undefined,
        metadata,
        issuedAt: r.created_at || new Date().toISOString(),
      })
    }

    pendingReceipts.sort((left, right) => String(right.issuedAt).localeCompare(String(left.issuedAt)))
    return { pendingReceipts }
  }

  /**
   * Refresh the inbox counters (kept for the wallet UI's "sync" affordance).
   */
  @Post('/sync-receipts')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async syncReceipts(@Request() request: ExRequest): Promise<{
    synced: boolean
    pendingCount: number
    context: { authContext: WalletAuthContext; walletTenantId?: string; activeOrgTenantId?: string; orgRole?: string }
  }> {
    const context = this.resolveWalletContext(request)
    const tenantId = context.walletTenantId
    if (!tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const db = DatabaseManager.getDatabase()
    let paymentCount = 0
    try {
      paymentCount = (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM ack_payment_receipts apr JOIN ack_payments ap ON apr.payment_id = ap.id
             WHERE ap.tenant_id = ? AND apr.credential_offer_url IS NOT NULL AND apr.resolved_at IS NULL`,
          )
          .get(tenantId) as { count: number }
      ).count
    } catch {
      paymentCount = 0
    }
    const queuedCount = (
      db.prepare(`SELECT COUNT(*) as count FROM wallet_pending_offers WHERE tenant_id = ? AND resolved_at IS NULL`).get(tenantId) as {
        count: number
      }
    ).count

    return {
      synced: true,
      pendingCount: paymentCount + queuedCount,
      context: {
        authContext: context.authContext,
        walletTenantId: tenantId,
        activeOrgTenantId: context.activeOrgTenantId,
        orgRole: context.orgRole,
      },
    }
  }

  /**
   * Accept an OIDC4VCI offer into the holder's tenant wallet.
   *
   * Note: the OpenId4VcHolder module lives on the BASE agent; the resulting credential is stored in
   * the tenant wallet. On success the matching `wallet_pending_offers` row is marked accepted and a
   * `vc_issuance_log` recovery entry + `wallet.vc.accepted` outbox event are written.
   */
  @Post('/accept-offer')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async acceptOffer(
    @Request() request: ExRequest,
    @Body() body: { offerUri?: string; offerUrl?: string },
  ): Promise<{ success: boolean; credentialId?: string }> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
    const context = this.resolveWalletContext(request)
    const tenantId = context.walletTenantId

    if (!tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const rawOffer = body.offerUri || body.offerUrl
    if (!rawOffer) {
      this.setStatus(422)
      throw new ValidateError({ 'body.offerUri': { message: "'offerUri' is required" } }, 'Validation Failed')
    }

    const db = DatabaseManager.getDatabase()

    // Payment links are not credentials: acknowledging them just clears the card.
    if (/^https?:\/\//i.test(rawOffer) && (/\/pay\//i.test(rawOffer) || /\/v\/[A-Za-z0-9_-]+/.test(rawOffer))) {
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?) WHERE tenant_id = ? AND offer_uri = ? AND COALESCE(source_type, '') = 'payment_link'`,
      ).run(new Date().toISOString(), tenantId, rawOffer)
      return { success: true, credentialId: `payment-link:${Buffer.from(rawOffer).toString('base64').slice(0, 24)}` }
    }

    try {
      console.log('[acceptOffer] === START (Using Base Agent for OID4VC) ===')
      let offerToProcess = rawOffer

      // DOCKER NETWORK FIX: the holder cannot reach localhost:3000 inside a container.
      const issuerApiUrl = process.env.ISSUER_API_URL || ''
      if (issuerApiUrl && issuerApiUrl.includes('172.')) {
        offerToProcess = offerToProcess.replace(/http:\/\/localhost:3000/g, issuerApiUrl)
        const encodedLocalhost = encodeURIComponent('http://localhost:3000')
        const encodedIssuer = encodeURIComponent(issuerApiUrl)
        offerToProcess = offerToProcess.split(encodedLocalhost).join(encodedIssuer)
      }

      const holder = this.holderModule(baseAgent)
      if (!holder?.resolveCredentialOffer) {
        throw new Error('OpenID4VC holder module is unavailable on the base agent')
      }

      const { wrapper, inner } = normalizeOffer(offerToProcess)
      const candidates = [
        wrapper,
        inner ? `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(inner)}` : null,
        inner,
      ].filter((value, index, all): value is string => !!value && all.indexOf(value) === index)

      let resolvedOffer: any
      let lastError: any
      for (const candidate of candidates) {
        try {
          resolvedOffer = await holder.resolveCredentialOffer(candidate)
          break
        } catch (err: any) {
          lastError = err
        }
      }
      if (!resolvedOffer) {
        throw lastError || new Error('Missing offer URI')
      }
      console.log('[acceptOffer] Offer resolved:', {
        issuer: resolvedOffer.metadata?.credentialIssuer?.credential_issuer,
        offeredCredentials: resolvedOffer.offeredCredentials?.length,
      })

      // Holder binding DID lives on the base agent (holder module scope).
      let baseAgentDids = await baseAgent.dids.getCreatedDids({ method: 'key' })
      let holderDid: string
      if (baseAgentDids.length === 0) {
        const createdDid = await baseAgent.dids.create({
          method: 'key',
          options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
        })
        holderDid = createdDid.didState.did as string
      } else {
        holderDid = baseAgentDids[0].did
      }
      let holderDidUrl = holderDid
      if (holderDid.startsWith('did:key:') && !holderDid.includes('#')) {
        holderDidUrl = `${holderDid}#${holderDid.replace('did:key:', '')}`
      }

      // Credo 0.7 holder flow: pre-authorized code -> access token -> credential request(s).
      // (The 0.5-era `acceptCredentialOfferUsingPreAuthorizedCode` no longer exists.)
      const credentials: any[] = await this.requestCredentialsFromOffer(holder, resolvedOffer, holderDidUrl)
      console.log('[acceptOffer] Credentials received:', credentials.length)

      // Store in the TENANT's wallet.
      const tenantAgent = await baseAgent.modules.tenants.getTenantAgent({ tenantId })
      let savedCredentialId = ''
      const acceptedTypes = new Set<string>()
      let issuerDid = ''
      try {
        const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)
        for (const received of credentials) {
          const record: any = received?.record ?? received
          const credential: any = record?.firstCredential ?? record?.credential ?? record
          // Only array `type` fields are credential types (`record.type` is the record class name).
          const asTypeList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
          const types: string[] = [
            ...asTypeList((credential as any)?.type),
            ...asTypeList((credential as any)?.vc?.type),
            ...asTypeList((record as any)?.vc?.type),
          ].filter(Boolean)
          types.forEach((type) => acceptedTypes.add(String(type)))
          const issuer = (credential as any)?.issuer ?? (record as any)?.issuer
          issuerDid = issuerDid || (typeof issuer === 'string' ? issuer : issuer?.id || '')
          try {
            const recordToStore =
              record instanceof W3cCredentialRecord
                ? record
                : typeof (credential as any)?.encoded === 'string' || (credential as any)?.type
                  ? W3cCredentialRecord.fromCredential(credential)
                  : record
            const storedRecord = await w3cService.storeCredential(tenantAgent.context, { record: recordToStore })
            savedCredentialId = storedRecord.id
            console.log('[acceptOffer] Stored credential in tenant wallet:', storedRecord.id)
          } catch (storeError: any) {
            console.warn('[acceptOffer] Could not store credential:', storeError?.message)
          }
        }
      } finally {
        await tenantAgent.endSession()
      }

      const now = new Date().toISOString()
      const leafTypes = [...acceptedTypes].filter((type) => type !== 'VerifiableCredential')

      // Mark the queued offer accepted (matches the stored URI or the issuer offer URI it wraps).
      try {
        const innerTail = inner ? `%${inner.slice(-60)}%` : null
        db.prepare(
          `
          UPDATE wallet_pending_offers
          SET resolved_at = @now, accepted_at = @now, accepted_credential_id = @credentialId,
              last_error = NULL, last_attempt_at = @now, attempt_count = COALESCE(attempt_count, 0) + 1
          WHERE tenant_id = @tenantId
            AND accepted_at IS NULL
            AND (offer_uri = @rawOffer OR offer_uri LIKE @rawTail OR (@innerTail IS NOT NULL AND offer_uri LIKE @innerTail))
        `,
        ).run({
          now,
          credentialId: savedCredentialId || null,
          tenantId,
          rawOffer,
          rawTail: `%${rawOffer.slice(-60)}%`,
          innerTail,
        })
        db.prepare(
          `UPDATE ack_payment_receipts SET resolved_at = COALESCE(resolved_at, ?) WHERE credential_offer_url = ? OR credential_offer_url LIKE ?`,
        ).run(now, rawOffer, `%${rawOffer.slice(-60)}%`)
      } catch (markErr: any) {
        console.warn('[acceptOffer] Could not mark offer as accepted:', markErr?.message)
      }

      // Recovery index (no VC data, audit only).
      try {
        db.prepare(`INSERT OR IGNORE INTO vc_issuance_log (id, tenant_id, vc_type, issuer_did, issued_at) VALUES (?, ?, ?, ?, ?)`).run(
          savedCredentialId || `${tenantId}:${now}:${randomUUID().slice(0, 8)}`,
          tenantId,
          leafTypes.join(',') || 'VerifiableCredential',
          issuerDid,
          now,
        )
      } catch (logErr: any) {
        console.warn('[acceptOffer] Could not write vc_issuance_log:', logErr?.message)
      }

      try {
        outboxService.enqueue({
          topic: 'wallet.vc.accepted',
          aggregateKey: tenantId,
          payload: {
            tenantId,
            credentialId: savedCredentialId || null,
            credentialTypes: leafTypes,
            offerUri: rawOffer.slice(0, 300),
            acceptedAt: now,
          },
        })
      } catch (outboxErr: any) {
        console.warn('[acceptOffer] Could not enqueue wallet.vc.accepted:', outboxErr?.message)
      }

      console.log('[acceptOffer] === SUCCESS ===')
      return { success: true, credentialId: savedCredentialId || 'credential-received' }
    } catch (error: any) {
      console.error('[acceptOffer] === FAILED ===', error?.message || error)
      request.logger?.error({ err: error?.message || error, stack: error?.stack }, 'Failed to accept offer')
      logger.warn({ tenantId, err: error?.message }, 'accept-offer failed')

      const msg = (error && (error.message || JSON.stringify(error))) || String(error)
      const isExpiredOrInvalid =
        msg.includes('Credential offer not found') ||
        msg.includes('Invalid Credential Offer Request') ||
        /pre-authorized code has expired/i.test(msg) ||
        (msg.includes('invalid_grant') && msg.includes('expired'))

      const offerVanished = msg.includes("did not contain either 'credential_offer'")
      const offerUnusable =
        isExpiredOrInvalid ||
        offerVanished ||
        msg.includes('proof_types_supported') ||
        msg.includes('Invalid state for credential offer')

      // Role cards, employee cards, and platform identity can be re-issued by the platform:
      // send a fresh offer and accept that one straight away (one retry only).
      if (offerUnusable && !(request as any).__roleCardReissued) {
        const reissued =
          (await this.reissueExpiredRoleCard(db, tenantId, rawOffer, request)) ||
          (await this.reissueExpiredEmployeeOffer(db, tenantId, rawOffer, request)) ||
          (await this.reissueExpiredPlatformIdentity(db, tenantId, rawOffer, request))
        if (reissued) {
          console.log('[acceptOffer] Re-issued expired offer, retrying with the new one')
          ;(request as any).__roleCardReissued = true
          return this.acceptOffer(request, { offerUri: reissued })
        }
      }

      if (isExpiredOrInvalid) {
        try {
          const now = new Date().toISOString()
          db.prepare(
            `
            UPDATE wallet_pending_offers
            SET last_attempt_at = ?, last_error = 'offer_expired_or_invalid', attempt_count = COALESCE(attempt_count, 0) + 1
            WHERE resolved_at IS NULL AND tenant_id = ? AND (offer_uri = ? OR offer_uri LIKE ?)
          `,
          ).run(now, tenantId, rawOffer, `%${rawOffer.slice(-80)}%`)
        } catch (cleanupErr: any) {
          request.logger?.warn({ err: cleanupErr.message }, 'Failed to flag stale offer row')
        }
        this.setStatus(409)
        throw new Error('Credential offer expired. Ask the issuer to re-offer it (organizations can re-offer actor credentials from Setup → Workflow Actors).')
      }

      if (msg.includes('Invalid state for credential offer') || (msg.includes('invalid_request') && msg.includes('Invalid state'))) {
        this.setStatus(409)
        throw new Error('Credential offer is no longer valid or has an invalid state. Request a fresh credential offer from the issuer and try again.')
      }

      // The holder library reports an expired / removed offer (the issuer answered 404 for the
      // credential_offer_uri) as a missing-param error. Say what actually happened.
      if (offerVanished) {
        this.setStatus(410)
        throw new Error('This offer has expired or was withdrawn. Ask the organization to send it again.')
      }

      this.setStatus(400)
      throw new Error(`Failed to accept offer: ${msg}`)
    }
  }
}

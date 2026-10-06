/**
 * IdenEx Credentis - Workflow VC Offer Dispatcher
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Resolves **who** should receive a VC offer for a given workflow stage,
 * creates the OIDC4VC pre-authorized offer via CredentialIssuanceService,
 * then writes a workflow_requests inbox row for the resolved actor so the
 * offer deep-link appears in their inbox.
 *
 * Design invariant (from TODO plan §10):
 *   SSI provides evidence and trust; the platform owns workflow state.
 *   Credential possession NEVER implies authorization — all authorization
 *   decisions are made by the platform, not the wallet.
 *
 * @module services/workflow/WorkflowVcOfferDispatcher
 * @copyright 2024-2026 IdenEx Credentis
 */

import crypto from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { rootLogger } from '../../utils/pinoLogger'

import { OrgWorkflowActorService } from '../OrgWorkflowActorService'

const logger = rootLogger.child({ module: 'WorkflowVcOfferDispatcher' })

export interface DispatchVcOfferParams {
    /** The org tenant that owns the workflow (issuer tenant). */
    orgTenantId: string
    /** The workflow type string (e.g. 'internal_requisitions', 'school_fees'). */
    workflowType: string
    /** The action name of the current step (e.g. 'credential.issue'). */
    stageAction: string
    /** The VC type to issue (e.g. 'RequisitionAcknowledgementVC'). */
    credentialType: string
    /** Claims to embed in the credential subject. */
    claims: Record<string, any>
    /** Optional reference (runId / requestId) for traceability stored in the inbox payload. */
    contextRef?: string
    /** Optional holder DID to bind the offer to. */
    subjectDid?: string
}

export interface DispatchVcOfferResult {
    offerId: string
    offerUri: string
    assignedUserId: string | undefined
    assignedWalletTenantId: string | undefined
    assignedRole: string
    actorMode: string
    inboxItemId: string
    /** wallet_pending_offers row id when the recipient has a wallet. */
    walletOfferId?: string
}

/** wallet_pending_offers.source_type for records issued by a workflow stage. */
export const WORKFLOW_VC_OFFER_SOURCE_TYPE = 'workflow_vc_offer'

/** Plain-language inbox card per record type (no protocol wording for holders). */
function describeWorkflowRecord(
    credentialType: string,
    claims: Record<string, any>,
    orgName: string,
): { title: string; body: string } {
    const ref = String(claims.poNumber || claims.reference || claims.requisitionId || claims.jobId || '').trim()
    const refSuffix = ref ? ` · ${ref}` : ''
    switch (credentialType) {
        case 'RequisitionVC':
            return {
                title: `Job card${refSuffix}`,
                body: `${orgName} assigned you this job. Keep the job card so you can show what you were sent to do.`,
            }
        case 'ReceiptVC':
            return {
                title: `Material receipt record${refSuffix}`,
                body: `Receipts for this job were recorded by ${orgName}. Keep this record for payout and bookkeeping.`,
            }
        case 'ExecutionAckVC':
            return {
                title: `Completion record${refSuffix}`,
                body: `The finished work on this job was signed off. Keep this record as proof of completion.`,
            }
        case 'InvoiceVC':
            return {
                title: `Invoice${refSuffix}`,
                body: `${orgName} issued an invoice for this job.`,
            }
        case 'PaymentReceiptVC':
            return {
                title: `Payment receipt${refSuffix}`,
                body: `Payment for this job was recorded by ${orgName}.`,
            }
        default:
            return {
                title: `${credentialType.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}${refSuffix}`,
                body: `${orgName} issued you a record for this workflow.`,
            }
    }
}

export class WorkflowVcOfferDispatcher {
    private actorService = new OrgWorkflowActorService()

    /**
     * Put the record in the recipient's wallet inbox so it can be accepted from the app.
     * Non-fatal: the offer already exists; a missing inbox row only means the holder cannot see it.
     */
    private queueWalletOffer(params: {
        orgTenantId: string
        walletTenantId: string
        credentialType: string
        offerUri: string
        offerId: string
        contextRef?: string
        stageAction: string
        claims: Record<string, any>
    }): string | undefined {
        const db = DatabaseManager.getDatabase()
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        try {
            const orgRow = db
                .prepare('SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1')
                .get(params.orgTenantId) as { name?: string } | undefined
            const orgName = orgRow?.name || 'The organization'
            const { title, body } = describeWorkflowRecord(params.credentialType, params.claims, orgName)
            db.prepare(
                `INSERT INTO wallet_pending_offers (
                    id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
                    title, body, metadata, workflow_run_id, created_at, attempt_count, last_attempt_at
                 ) VALUES (
                    @id, @tenantId, @issuerTenantId, @sourceType, @sourceId, @credentialType, @offerUri,
                    @title, @body, @metadata, @workflowRunId, @createdAt, 0, @createdAt
                 )`,
            ).run({
                id,
                tenantId: params.walletTenantId,
                issuerTenantId: params.orgTenantId,
                sourceType: WORKFLOW_VC_OFFER_SOURCE_TYPE,
                sourceId: params.contextRef ?? params.offerId,
                credentialType: params.credentialType,
                offerUri: params.offerUri,
                title,
                body,
                metadata: JSON.stringify({
                    orgName,
                    offerId: params.offerId,
                    stageAction: params.stageAction,
                    workflowRunId: params.contextRef ?? null,
                    poNumber: params.claims.poNumber ?? params.claims.reference ?? null,
                }),
                workflowRunId: params.contextRef ?? null,
                createdAt: now,
            })
            return id
        } catch (error: any) {
            logger.warn(
                { error: error.message, credentialType: params.credentialType, walletTenantId: params.walletTenantId },
                '[Dispatcher] Offer created but could not be queued in the wallet inbox',
            )
            return undefined
        }
    }

    /**
     * Resolve actor → create VC offer → write inbox item.
     *
     * If no actor is configured and no role-fallback member is found, the method
     * logs a warning and returns a result with undefined assignee fields. The
     * caller (CredentialActions) stores the result in context.state.offer so the
     * workflow still completes — the offer URI remains available for manual
     * dispatch or admin surfacing.
     */
    async dispatch(params: DispatchVcOfferParams): Promise<DispatchVcOfferResult> {
        const { orgTenantId, workflowType, stageAction, credentialType, claims, contextRef, subjectDid } = params

        // ── 1. Resolve actor ──────────────────────────────────────────────────────
        const resolvedActor = this.actorService.resolveActor({ orgTenantId, workflowType, stageAction })

        logger.info(
            { orgTenantId, workflowType, stageAction, actor: resolvedActor },
            '[Dispatcher] Resolved workflow actor',
        )

        // The actor will be asked to act on this stage: make sure they were offered the
        // OrgWorkflowActorCredential that the stage's OIDC4VP presentation accepts.
        if (resolvedActor?.walletTenantId) {
            const { orgWorkflowActorCredentialService } = await import('../OrgWorkflowActorCredentialService')
            orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
                orgTenantId,
                workflowType,
                stageAction,
                actor: resolvedActor,
                reason: contextRef ? `workflow:${contextRef}` : 'workflow_stage',
            })
        }

        // ── 2. Create OIDC4VC pre-authorized offer ────────────────────────────────
        const { credentialIssuanceService } = await import('../CredentialIssuanceService')

        const offerResult = await credentialIssuanceService.createOffer({
            credentialType,
            claims,
            tenantId: orgTenantId,
            subjectDid,
        })

        logger.info(
            { offerId: offerResult.offerId, credentialType, orgTenantId },
            '[Dispatcher] Created VC offer',
        )

        // ── 3. Write workflow_requests inbox row ──────────────────────────────────
        const inboxItemId = crypto.randomUUID()
        const now = new Date().toISOString()

        const db = DatabaseManager.getDatabase()

        try {
            db.prepare(
                `INSERT INTO workflow_requests (
          id,
          requester_tenant_id,
          target_org_tenant_id,
          request_type,
          workflow_type,
          payload,
          status,
          assignee_user_id,
          assignee_wallet_tenant_id,
          assignee_role,
          assignment_mode,
          assignment_note,
          assigned_at,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @requesterTenantId,
          @targetOrgTenantId,
          @requestType,
          @workflowType,
          @payload,
          @status,
          @assigneeUserId,
          @assigneeWalletTenantId,
          @assigneeRole,
          @assignmentMode,
          @assignmentNote,
          @assignedAt,
          @createdAt,
          @updatedAt
        )`,
            ).run({
                id: inboxItemId,
                requesterTenantId: orgTenantId,
                targetOrgTenantId: orgTenantId,
                requestType: 'vc_offer',
                workflowType,
                payload: JSON.stringify({
                    offerUri: offerResult.credential_offer_deeplink,
                    credentialType,
                    contextRef: contextRef ?? null,
                    stageAction,
                    offerId: offerResult.offerId,
                }),
                status: 'pending',
                assigneeUserId: resolvedActor?.userId ?? null,
                assigneeWalletTenantId: resolvedActor?.walletTenantId ?? null,
                assigneeRole: resolvedActor?.role ?? null,
                assignmentMode: resolvedActor?.mode ?? 'unresolved',
                assignmentNote: `Auto-assigned by WorkflowVcOfferDispatcher for stage '${stageAction}'`,
                assignedAt: now,
                createdAt: now,
                updatedAt: now,
            })

            logger.info(
                {
                    inboxItemId,
                    assigneeUserId: resolvedActor?.userId,
                    assigneeRole: resolvedActor?.role,
                    credentialType,
                },
                '[Dispatcher] Wrote inbox item for VC offer',
            )
        } catch (error: any) {
            // Non-fatal: the offer was created — log and continue so workflow doesn't stall.
            logger.warn(
                { error: error.message, inboxItemId, credentialType },
                '[Dispatcher] Failed to write inbox item; offer still created',
            )
        }

        // ── 4. Wallet inbox card for the recipient (what the app shows and accepts) ──
        const walletOfferId = resolvedActor?.walletTenantId
            ? this.queueWalletOffer({
                  orgTenantId,
                  walletTenantId: resolvedActor.walletTenantId,
                  credentialType,
                  offerUri: offerResult.credential_offer_deeplink,
                  offerId: offerResult.offerId,
                  contextRef,
                  stageAction,
                  claims,
              })
            : undefined
        if (!walletOfferId) {
            logger.warn(
                { credentialType, stageAction, actorMode: resolvedActor?.mode },
                '[Dispatcher] No wallet for the resolved recipient; the record is not visible in any inbox',
            )
        }

        return {
            offerId: offerResult.offerId,
            offerUri: offerResult.credential_offer_deeplink,
            assignedUserId: resolvedActor?.userId,
            assignedWalletTenantId: resolvedActor?.walletTenantId,
            assignedRole: resolvedActor?.role ?? 'unknown',
            actorMode: resolvedActor?.mode ?? 'unresolved',
            inboxItemId,
            walletOfferId,
        }
    }
}

export const workflowVcOfferDispatcher = new WorkflowVcOfferDispatcher()

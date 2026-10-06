/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * IdenEx Credentis - Credential Issuance Actions
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Workflow actions for issuing Verifiable Credentials:
 * - PaymentReceiptVC, InvoiceVC, QuoteVC
 * - PayslipVC, EmploymentContractVC
 * - DeliveryProofVC, DigitalTwinVC
 * - CreditEligibilityVC, PolicyVC
 *
 * Uses OID4VCI (OpenID for Verifiable Credential Issuance) standard.
 *
 * @module services/workflow/actions/CredentialActions
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { WorkflowActionContext } from '../ActionRegistry'

import { rootLogger } from '../../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'CredentialActions' })

export class CredentialActions {
  private static resolveMappingValue(source: Record<string, any>, value: any): any {
    if (typeof value === 'string') {
      const path = value.split('.')
      let current: any = source
      for (const segment of path) {
        current = current?.[segment]
      }
      return current
    }

    if (Array.isArray(value)) {
      return value.map((entry) => CredentialActions.resolveMappingValue(source, entry))
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          CredentialActions.resolveMappingValue(source, nestedValue),
        ]),
      )
    }

    return value
  }

  /**
   * Issues a Credential Offer based on the workflow state.
   *
   * When the workflow context contains `stageAction` and `workflowType`
   * (set by WorkflowService before each step), this delegates to
   * WorkflowVcOfferDispatcher which:
   *   1. Resolves the correct recipient actor via OrgWorkflowActorService.
   *   2. Creates the OIDC4VC pre-authorized offer.
   *   3. Writes a workflow_requests inbox row for the resolved actor.
   *
   * Falls back to a direct offer (no actor resolution, no inbox write) when
   * context fields are unavailable — preserving backward compatibility when
   * this action is called outside the standard execution loop.
   *
   * Config:
   * - type: string (credential type, overrides workflow template default)
   * - mapping: Record<string, string> (JSONPath-like mapping from state to claims)
   * - copyInput: boolean (copy entire input into claims)
   */
  static async issueCredential(context: WorkflowActionContext, config: any = {}) {
    logger.info({ stageAction: context.stageAction, workflowType: context.workflowType }, 'Preparing credential offer')

    // ── 1. Map claims from context state ──────────────────────────────────────
    const claims: Record<string, any> = {}
    const mapping = config.mapping || {}

    // Simple mapping: "claimName": "state.finance.grandTotal"
    for (const [claimKey, statePath] of Object.entries(mapping)) {
      claims[claimKey] = CredentialActions.resolveMappingValue(context as Record<string, any>, statePath)
    }

    // Add any unmapped input if configured (e.g. "copyInput": true)
    if (config.copyInput) {
      Object.assign(claims, context.input)
    }

    const credentialType: string = config.type || 'GenericIDCredential'
    const tenantId: string = context.tenantId || 'default'

    // ── 2. Dispatch via actor-aware dispatcher when possible ──────────────────
    // `recipientStage` lets a template route the offer to the organization's
    // configured actor for a business stage (e.g. `acknowledge_execution`) instead
    // of the literal action name; `subjectDid` may map a holder DID from state/input.
    const recipientStage: string | undefined = config.recipientStage || config.stageAction
    const subjectDid = config.subjectDid
      ? CredentialActions.resolveMappingValue(context as Record<string, any>, config.subjectDid)
      : undefined

    if ((recipientStage || context.stageAction) && context.workflowType) {
      const { workflowVcOfferDispatcher } = await import('../WorkflowVcOfferDispatcher')

      const dispatchResult = await workflowVcOfferDispatcher.dispatch({
        orgTenantId: tenantId,
        workflowType: context.workflowType,
        stageAction: recipientStage || (context.stageAction as string),
        credentialType,
        claims,
        contextRef: context.runId,
        subjectDid: typeof subjectDid === 'string' && subjectDid ? subjectDid : undefined,
      })

      context.state.offer = dispatchResult
      context.state.issuedCredentials = {
        ...(context.state.issuedCredentials || {}),
        [credentialType]: {
          offerId: dispatchResult.offerId,
          issuedAt: new Date().toISOString(),
          // Who the record went to, for the job's full history.
          recipientStage: recipientStage || (context.stageAction as string) || undefined,
          recipientUserId: dispatchResult.assignedUserId || undefined,
          recipientRole: dispatchResult.assignedRole || undefined,
        },
      }

      logger.info(
        {
          offerId: dispatchResult.offerId,
          assignedUserId: dispatchResult.assignedUserId,
          assignedRole: dispatchResult.assignedRole,
          actorMode: dispatchResult.actorMode,
        },
        'Credential offer dispatched to actor inbox',
      )
      return
    }

    // ── 3. Fallback: direct offer (no actor resolution) ───────────────────────
    logger.warn(
      { tenantId, credentialType },
      'stageAction/workflowType missing from context — falling back to direct offer (no inbox write)',
    )

    const { credentialIssuanceService } = await import('../../../services/CredentialIssuanceService')

    const result = await credentialIssuanceService.createOffer({
      credentialType,
      claims,
      tenantId,
    })

    // Update State with Offer Details
    context.state.offer = result

    logger.info({ offerId: result.offerId }, 'Credential offer created via IssuanceService (direct fallback)')
  }
}

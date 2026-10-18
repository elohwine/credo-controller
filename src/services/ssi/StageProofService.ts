/**
 * IdenEx Credentis - Stage Proof Service
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * One place for the OpenID4VP "prove who you are before you act" step that guards
 * workflow stages (customer sign-off, payout release, requisition approvals).
 *
 *   1. createStageProofRequest  → verifier builds a presentation request for the stage
 *   2. presentFromEmbeddedWallet → the holder wallet that runs on this server answers it
 *   3. verifyStageProof          → verifier reads the verified response and checks scope
 *
 * Requests are DCQL first (OpenID4VP 1.0): the query names the one step, so a
 * selective-disclosure staff/role card (SD-JWT) reveals that step and the rest stays on the
 * phone. The request also carries the job and the amount, and the wallet signs them.
 * Presentation Exchange is kept only when `PROOF_REQUEST_QUERY=pex`, or when a DCQL request
 * cannot be built, for wallets that only speak that.
 *
 * The platform owns workflow state: a verified presentation is evidence that the
 * person holds the credential the organization issued for the stage. Authorization is
 * still decided by the caller (membership, stage actor, run ownership).
 *
 * @module services/ssi/StageProofService
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { Request as ExRequest } from 'express'

import { Agent, ClaimFormat, DcqlService, DifPresentationExchangeService } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { container } from 'tsyringe'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import {
  buildStageProofDcqlQuery,
  DCQL_STAFF_CARD_QUERY_ID,
  perItemListsOf,
  purposeLineFromResolvedRequest,
  shareBindingFromResolvedRequest,
  sharePurposeFromBinding,
  splitSdJwtShare,
  transactionDataSigners,
  wantedListItems,
} from './stageProofQuery'
import {
  cardCoversStep,
  evaluateOrgEvidenceProof,
  extractPresentedCredentials,
  hasVerifiedPresentation,
  presentedCredentialTypes,
  presentedHolderDid,
  type ActorCredentialProofEvaluation,
} from '../ActorCredentialProofService'
import {
  buildVcTypeArrayFilter,
  resolveAcceptedProofVcTypes,
  stageActionForProofAction,
  type ProofVcActionKey,
} from '../ProofVcPolicyService'

import { credentialLifecycleService } from './CredentialLifecycleService'
import { claimNamesOf, holderActivityService } from './HolderActivityService'
import { withTenantHolder } from './TenantHolder'

type AnyAgent = Agent<RestMultiTenantAgentModules>

export interface StageProofRequest {
  requestId: string
  presentationRequestUrl: string
  verifierDid: string
  acceptedVcTypes: string[]
  /** Query language the request was built with. DCQL is the default; PEX is the fallback. */
  queryLanguage: 'dcql' | 'pex'
  /** Plain line for the share screen, e.g. "Release worker payout · Job FR-1 · 95". */
  purposeLine?: string
}

export {
  buildStageProofDcqlQuery,
  DCQL_STAFF_CARD_QUERY_ID,
  purposeLineFromResolvedRequest,
  sharePurposeFromBinding,
  transactionDataSigners,
} from './stageProofQuery'
/** DCQL credential query id for cards issued before selective disclosure (whole card is shared). */
export const DCQL_LEGACY_CARD_QUERY_ID = 'staff_card_legacy'

/**
 * One record the wallet can answer a DCQL request with.
 * `disclosed` is what the request asked for and the wallet would send; `withheld` stays on the phone.
 */
export interface DcqlWalletCandidate {
  queryId: string
  claimFormat: string
  record: any
  disclosed: Record<string, unknown>
  withheld: Record<string, unknown>
  /** What Credo frames for an SD-JWT share (one-by-one list items keyed by position). */
  presentPayload?: Record<string, unknown>
  /** Credential type names, without `VerifiableCredential`. */
  types: string[]
  orgTenantId: string
}

/** Registered JWT / SD-JWT claims that are never shown as "details" of a card. */
const SD_JWT_ENVELOPE_CLAIMS = new Set([
  'iss',
  'iat',
  'exp',
  'nbf',
  'cnf',
  'vct',
  'status',
  '_sd',
  '_sd_alg',
  'sub',
  'jti',
])

/** Flat SD-JWT claims → the details shown on a card (no issuer/time/key envelope claims). */
function cardDetailsFromSdJwtClaims(claims: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(claims || {})) {
    if (SD_JWT_ENVELOPE_CLAIMS.has(key) || value === undefined) continue
    out[key] = value
  }
  return out
}

function subjectDetailsOf(credential: any): Record<string, unknown> {
  const subjectRaw = Array.isArray(credential?.credentialSubject)
    ? credential.credentialSubject[0]
    : credential?.credentialSubject
  const subject = subjectRaw && typeof subjectRaw === 'object' ? { ...subjectRaw } : {}
  if (subject.claims && typeof subject.claims === 'object') Object.assign(subject, subject.claims)
  delete subject.claims
  return subject
}

export interface StageProofVerification {
  requestId: string
  holderDid: string
  presentedTypes: string[]
  actorProof: ActorCredentialProofEvaluation
  verifiedAt: string
}

export interface EmbeddedPresentationResult {
  vpToken?: string
  idToken?: string
  presentationSubmission?: unknown
  state?: string
}

export function shouldUseUnsignedLocalOid4vpRequest(): boolean {
  const configuredBaseUrl = String(
    process.env.OID4VC_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  ).trim()
  try {
    const parsed = new URL(configuredBaseUrl)
    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
    const allowUnsigned = process.env.OID4VC_ALLOW_UNSIGNED_LOCAL_REQUESTS !== 'false'
    return allowUnsigned && isLoopback && parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function getAuthDidUrl(did: string, didDocument?: any): string {
  const authEntries = didDocument?.authentication
  if (Array.isArray(authEntries) && authEntries.length > 0) {
    const first = authEntries[0]
    if (typeof first === 'string') return first
    if (typeof first === 'object' && typeof first.id === 'string') return first.id
  }
  const firstVm = didDocument?.verificationMethod?.[0]
  if (firstVm?.id && typeof firstVm.id === 'string') return firstVm.id
  return `${did}#key-1`
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** The proof-request (verifier) module on either the new `openid4vc.verifier` or the older `modules.openId4VcVerifier` shape. */
export function verifierModuleOf(agent: AnyAgent): any {
  const verifierModule = (agent as any)?.openid4vc?.verifier || (agent.modules as any)?.openId4VcVerifier
  if (!verifierModule) {
    throw new StatusException('Proof requests are unavailable for this organization right now', 500)
  }
  return verifierModule
}

export class StageProofService {
  // ── DID / verifier bootstrap ─────────────────────────────────────────────────

  async getOrCreateDidForAgent(agent: AnyAgent): Promise<{ did: string; didUrl: string }> {
    const createdDids = await agent.dids.getCreatedDids({ method: 'key' })
    if (createdDids.length > 0) {
      const did = createdDids[0].did
      const resolved = await agent.dids.resolve(did)
      return { did, didUrl: getAuthDidUrl(did, resolved.didDocument) }
    }
    const result = await agent.dids.create({
      method: 'key',
      options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
    })
    const did = result.didState.did
    if (result.didState.state !== 'finished' || !did) {
      throw new StatusException('Unable to create verifier DID', 500)
    }
    return { did, didUrl: getAuthDidUrl(did, result.didState.didDocument) }
  }

  async getOrCreateVerifierForAgent(
    agent: AnyAgent,
    signerDidUrl?: string,
  ): Promise<{ verifierId: string; signerDidUrl: string }> {
    const verifierModule = verifierModuleOf(agent)
    const existingVerifiers = await verifierModule.getAllVerifiers?.()
    const verifierId = existingVerifiers?.[0]?.verifierId
    if (verifierId) {
      return { verifierId, signerDidUrl: signerDidUrl || (await this.getOrCreateDidForAgent(agent)).didUrl }
    }
    const createdVerifier = await verifierModule.createVerifier?.({})
    const finalVerifierId = createdVerifier?.verifierId
    if (!finalVerifierId) {
      throw new StatusException('Unable to initialize a verifier for this organization', 500)
    }
    return {
      verifierId: finalVerifierId,
      signerDidUrl: signerDidUrl || (await this.getOrCreateDidForAgent(agent)).didUrl,
    }
  }

  /** The org tenant whose proof policy applies to a request, if the token is an org token. */
  resolvePolicyOrgTenantId(request: ExRequest): string | undefined {
    const tenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!tenantId) return undefined
    return getTenantById(tenantId)?.tenantType === 'ORG' ? tenantId : undefined
  }

  // ── 1. Verifier side: build the request ─────────────────────────────────────

  async createStageProofRequest(params: {
    verifierAgent: AnyAgent
    orgTenantId: string | undefined
    actionKey: ProofVcActionKey
    reference: string
    idPrefix: string
    descriptorName: string
    purpose: string
  }): Promise<StageProofRequest> {
    const signerIdentity = await this.getOrCreateDidForAgent(params.verifierAgent)
    const verifierRegistration = await this.getOrCreateVerifierForAgent(params.verifierAgent, signerIdentity.didUrl)
    const acceptedVcTypes = resolveAcceptedProofVcTypes(params.orgTenantId, params.actionKey)
    const verifierModule = verifierModuleOf(params.verifierAgent)
    const baseOptions = {
      verifierId: verifierRegistration.verifierId,
      version: 'v1.draft24',
      requestSigner: shouldUseUnsignedLocalOid4vpRequest()
        ? { method: 'none' }
        : { method: 'did', didUrl: verifierRegistration.signerDidUrl },
    }

    // DCQL names the one step, and the wallet signs the job it belongs to.
    // Presentation Exchange stays for wallets that only speak PEX (PROOF_REQUEST_QUERY=pex)
    // and for when a DCQL request cannot be built.
    const stageAction = stageActionForProofAction(params.actionKey)
    const facts = this.shareFacts(params.reference, stageAction)
    const purposeLine = sharePurposeFromBinding({ step: stageAction, job: facts.job, amount: facts.amount })
    const dcqlQuery = buildStageProofDcqlQuery({
      acceptedVcTypes,
      orgTenantId: params.orgTenantId,
      stageAction,
      namedUserId: this.namedPersonOnRun(params.reference, stageAction),
    })
    let queryLanguage: 'dcql' | 'pex' = process.env.PROOF_REQUEST_QUERY === 'pex' || !dcqlQuery ? 'pex' : 'dcql'
    let result: any
    if (queryLanguage === 'dcql' && dcqlQuery) {
      try {
        result = await verifierModule.createAuthorizationRequest({
          ...baseOptions,
          dcql: { query: dcqlQuery },
          transactionData: [
            {
              type: 'workflow_stage',
              credential_ids: [DCQL_STAFF_CARD_QUERY_ID],
              step: stageAction,
              ...(facts.job ? { job: facts.job } : {}),
              ...(facts.amount ? { amount: facts.amount } : {}),
            },
          ],
        })
      } catch (error: any) {
        console.warn('[StageProofService] DCQL request failed, falling back to PEX:', error?.message)
        queryLanguage = 'pex'
      }
    }
    if (queryLanguage === 'pex') {
      const presentationDefinition = {
        id: `${params.idPrefix}-${params.reference}-${Date.now()}`,
        input_descriptors: [
          {
            id: 'platform-identity',
            name: params.descriptorName,
            purpose: params.purpose,
            constraints: {
              fields: [{ path: ['$.type', '$.vc.type'], filter: buildVcTypeArrayFilter(acceptedVcTypes) }],
            },
          },
        ],
      }
      result = await verifierModule.createAuthorizationRequest({
        ...baseOptions,
        presentationExchange: { definition: presentationDefinition },
      })
    }
    const requestUrl = result.authorizationRequest
    if (typeof requestUrl !== 'string' || !requestUrl) {
      throw new Error('Verifier did not return a wallet authorization request')
    }
    const requestId = result.verificationSession?.id || randomUUID()
    const presentationRequestUrl = requestUrl.includes('?')
      ? `${requestUrl}&verification_session_id=${encodeURIComponent(requestId)}`
      : `${requestUrl}?verification_session_id=${encodeURIComponent(requestId)}`
    return {
      requestId,
      presentationRequestUrl,
      verifierDid: signerIdentity.did,
      acceptedVcTypes,
      queryLanguage,
      purposeLine,
    }
  }

  /**
   * The wallet signed the step and the job. A share for a different step or a different job
   * is refused. A request that did not ask for a signature (the older query) has nothing to check.
   */
  private assertShareBinding(verificationResult: any, stageAction: string, workflowRunId?: string): void {
    const entries = Array.isArray(verificationResult?.transactionData) ? verificationResult.transactionData : []
    const facts = workflowRunId ? this.shareFacts(workflowRunId, stageAction) : {}
    for (const entry of entries) {
      const decoded = entry?.decoded && typeof entry.decoded === 'object' ? entry.decoded : {}
      if (decoded.type && decoded.type !== 'workflow_stage') continue
      const step = String(decoded.step || '')
        .trim()
        .toLowerCase()
      if (step && step !== stageAction) {
        throw new StatusException('This share was for a different step.', 403)
      }
      const job = String(decoded.job || '').trim()
      if (!job) continue
      const expected = [facts.job, workflowRunId].map((value) => String(value || '').trim()).filter(Boolean)
      if (expected.length > 0 && !expected.includes(job)) {
        throw new StatusException('This share was for a different job.', 403)
      }
    }
  }

  /** Job reference and amount stored on the run this share belongs to. The payout names what the worker is paid. */
  private shareFacts(reference: string, stageAction = ''): { job?: string; amount?: string } {
    const run = workflowRunRepository.findRunById(String(reference || '').trim())
    const input = (run?.input && typeof run.input === 'object' ? run.input : {}) as Record<string, unknown>
    const job = String(input.reference || '').trim()
    const raw = stageAction === 'trigger_payout' ? (input.payoutAmount ?? input.amount) : input.amount
    const amount = raw == null || raw === '' ? '' : String(raw)
    return { job: job || undefined, amount: amount || undefined }
  }

  // ── 2. Holder side: answer from the wallet that runs on this server ─────────

  /** The verifier's session id a share answers (`verification_session_id` on the request URL, else the request state). */
  requestIdOf(presentationRequestUrl: string | undefined, resolved: any): string | undefined {
    try {
      const fromUrl = new URL(String(presentationRequestUrl || '')).searchParams.get('verification_session_id')
      if (fromUrl) return fromUrl
    } catch {
      // not a URL
    }
    const state = resolved?.authorizationRequestPayload?.state
    return typeof state === 'string' && state ? state : undefined
  }

  /**
   * Write the person's own record of a share: which organisation, which step and job, which card
   * types were asked for, which claim names left the phone and which stayed. Names only, never
   * values. Called from both the embedded share and the phone's review-and-send path, so every
   * workflow that shares through this service lands in the person's activity log.
   */
  recordShareFromWallet(params: {
    walletTenantId: string
    presentationRequestUrl?: string
    resolved: any
    orgTenantId?: string
    stageAction?: string
    workflowRunId?: string
    /** Job or request reference the person recognises; read from the signed binding when absent. */
    reference?: string
    /** DCQL candidates the wallet had, and the ones it sent (by query id). */
    candidates?: DcqlWalletCandidate[]
    dcqlCredentials?: Record<string, any[]>
    /** Presentation Exchange: whole cards, by descriptor id. */
    pexCredentials?: Record<string, any[]>
  }): void {
    try {
      const requestId = this.requestIdOf(params.presentationRequestUrl, params.resolved)
      const dcqlQuery = this.dcqlQueryOf(params.resolved)
      const definition = this.presentationDefinitionOf(params.resolved)
      const requestedTypes: string[] = []
      const requestedClaims: string[] = []
      for (const credential of dcqlQuery?.credentials || []) {
        for (const vct of credential?.meta?.vct_values || []) requestedTypes.push(String(vct))
        for (const list of credential?.meta?.type_values || [])
          for (const type of list || []) requestedTypes.push(String(type))
        for (const claim of credential?.claims || []) {
          const head = Array.isArray(claim?.path) ? claim.path[0] : undefined
          if (typeof head === 'string') requestedClaims.push(head)
        }
      }
      for (const descriptor of definition?.input_descriptors || []) {
        for (const field of descriptor?.constraints?.fields || []) {
          const filter = field?.filter
          for (const type of filter?.contains?.enum || filter?.enum || []) requestedTypes.push(String(type))
        }
      }
      const sharedClaims: string[] = []
      const withheldClaims: string[] = []
      const sentTypes: string[] = []
      for (const list of Object.values(params.dcqlCredentials || {})) {
        for (const sent of list || []) {
          const recordId = String(sent?.credentialRecord?.id || '')
          const candidate = (params.candidates || []).find((item) => String(item.record?.id || '') === recordId)
          if (candidate) {
            sharedClaims.push(...claimNamesOf(candidate.disclosed))
            withheldClaims.push(...claimNamesOf(candidate.withheld))
            sentTypes.push(...candidate.types)
          } else {
            sharedClaims.push(...claimNamesOf(sent?.disclosedPayload))
          }
        }
      }
      for (const list of Object.values(params.pexCredentials || {})) {
        for (const sent of list || []) {
          const record = sent?.credentialRecord
          const credential = record?.firstCredential ?? record?.credential ?? sent?.disclosedPayload
          sharedClaims.push(...claimNamesOf(credential?.credentialSubject ?? credential))
          const types = Array.isArray(credential?.type) ? credential.type : []
          sentTypes.push(...types.map(String).filter((type: string) => type !== 'VerifiableCredential'))
        }
      }
      const binding = shareBindingFromResolvedRequest(params.resolved)
      const purposeLine = purposeLineFromResolvedRequest(params.resolved)
      const orgTenantId =
        String(params.orgTenantId || '').trim() ||
        String(
          (dcqlQuery?.credentials || [])
            .flatMap((credential: any) => credential?.claims || [])
            .find((claim: any) => Array.isArray(claim?.path) && claim.path[0] === 'orgTenantId')?.values?.[0] || '',
        ).trim()
      holderActivityService.record({
        walletTenantId: params.walletTenantId,
        kind: 'shared',
        outcome: 'shared',
        orgTenantId: orgTenantId || undefined,
        purposeLabel: purposeLine || undefined,
        stageAction: params.stageAction || binding.step,
        workflowRunId: params.workflowRunId,
        reference: params.reference || binding.job,
        requestId,
        requestedTypes: sentTypes.length ? sentTypes : requestedTypes,
        requestedClaims,
        sharedClaims,
        withheldClaims: withheldClaims.filter((name) => !sharedClaims.includes(name)),
        signedLine: purposeLine || undefined,
        sourceId: requestId,
      })
    } catch (error: any) {
      console.warn('[StageProofService] Could not record the share in the personal activity log:', error?.message)
    }
  }

  assertWalletOwnershipForActingUser(request: ExRequest, walletId: string): void {
    const tokenTenantId = (request as any).user?.tenantId as string | undefined
    if (tokenTenantId === walletId) return
    const actorUserId = (request as any).user?.id as string | undefined
    if (!actorUserId) throw new StatusException('Wallet access denied', 403)
    const owner = DatabaseManager.getDatabase()
      .prepare('SELECT tenant_id FROM ssi_users WHERE id = ? LIMIT 1')
      .get(actorUserId) as { tenant_id?: string } | undefined
    if (owner?.tenant_id !== walletId) throw new StatusException('Wallet access denied', 403)
  }

  private async resolveHolderAuthorizationRequest(holderAgent: AnyAgent, presentationRequestUrl: string): Promise<any> {
    const holderModule = (holderAgent as any).openid4vc?.holder
    // Credo 0.7 name first, 0.5 name as fallback.
    if (typeof holderModule?.resolveOpenId4VpAuthorizationRequest === 'function') {
      return holderModule.resolveOpenId4VpAuthorizationRequest(presentationRequestUrl)
    }
    if (typeof holderModule?.resolveSiopAuthorizationRequest === 'function') {
      return holderModule.resolveSiopAuthorizationRequest(presentationRequestUrl)
    }
    const resolved: any = { authorizationRequest: presentationRequestUrl }
    try {
      const raw = new URL(presentationRequestUrl).searchParams.get('presentation_definition')
      if (raw) {
        const definition = JSON.parse(raw)
        resolved.presentationExchange = { definition }
        resolved.authorizationRequestPayload = { presentation_definition: definition }
      }
    } catch {
      // keep the raw request URL
    }
    return resolved
  }

  private presentationDefinitionOf(resolved: any): any | undefined {
    return (
      resolved?.presentationExchange?.definition ||
      resolved?.authorizationRequest?.presentationExchange?.definition ||
      resolved?.authorizationRequest?.presentation_definition ||
      resolved?.authorizationRequestObjectPayload?.presentation_definition ||
      resolved?.authorizationRequestPayload?.presentation_definition
    )
  }

  /**
   * Find credentials matching the definition. Credentials accepted through the inbox are stored in
   * the user's TENANT wallet, so query that context first and fall back to the base agent context.
   */
  private async credentialsForRequestInWallet(
    holderAgent: AnyAgent,
    walletId: string | undefined,
    presentationDefinition: any,
  ): Promise<any> {
    const difPexService = holderAgent.dependencyManager.resolve(DifPresentationExchangeService)
    const tenants = (holderAgent as any).modules?.tenants
    if (walletId && tenants?.getTenantAgent) {
      let tenantAgent: any
      try {
        tenantAgent = await tenants.getTenantAgent({ tenantId: walletId })
        const inTenant = await difPexService.getCredentialsForRequest(tenantAgent.context, presentationDefinition)
        if ((inTenant as any)?.areRequirementsSatisfied) return inTenant
      } catch {
        // fall through to base context
      } finally {
        await tenantAgent?.endSession?.()
      }
    }
    return difPexService.getCredentialsForRequest(holderAgent.context, presentationDefinition)
  }

  /** The DCQL query carried by a resolved authorization request, if the verifier used DCQL. */
  dcqlQueryOf(resolved: any): any | undefined {
    const fromPayload = resolved?.authorizationRequestPayload?.dcql_query
    if (fromPayload && typeof fromPayload === 'object') return fromPayload
    if (typeof fromPayload === 'string') {
      try {
        return JSON.parse(fromPayload)
      } catch {
        // fall through to the query result
      }
    }
    const queryResult = resolved?.dcql?.queryResult
    if (queryResult && Array.isArray(queryResult.credentials)) {
      return {
        credentials: queryResult.credentials,
        ...(Array.isArray(queryResult.credential_sets)
          ? {
              credential_sets: queryResult.credential_sets.map((set: any) => {
                const { matching_options: _ignored, ...rest } = set || {}
                return rest
              }),
            }
          : {}),
      }
    }
    return undefined
  }

  /**
   * Records in the wallet that answer a DCQL query, with the claims the request would reveal
   * (`disclosed`) and the ones that stay on the phone (`withheld`). Credentials accepted through
   * the inbox live in the person's TENANT wallet, so that context is read first.
   */
  async dcqlCandidatesInWallet(
    holderAgent: AnyAgent,
    walletId: string | undefined,
    dcqlQuery: any,
  ): Promise<DcqlWalletCandidate[]> {
    const dcqlService = holderAgent.dependencyManager.resolve(DcqlService)
    const tenants = (holderAgent as any).modules?.tenants
    if (walletId && tenants?.getTenantAgent) {
      let tenantAgent: any
      try {
        tenantAgent = await tenants.getTenantAgent({ tenantId: walletId })
        const inTenant = await dcqlService.getCredentialsForRequest(tenantAgent.context, dcqlQuery)
        const candidates = this.dcqlCandidatesFromQueryResult(inTenant, dcqlQuery)
        if (candidates.length > 0) return candidates
      } catch (error: any) {
        console.warn('[StageProofService] DCQL match in tenant wallet failed:', error?.message)
      } finally {
        await tenantAgent?.endSession?.()
      }
    }
    return this.dcqlCandidatesFromQueryResult(
      await dcqlService.getCredentialsForRequest(holderAgent.context, dcqlQuery),
      dcqlQuery,
    )
  }

  dcqlCandidatesFromQueryResult(queryResult: any, dcqlQuery?: any): DcqlWalletCandidate[] {
    const out: DcqlWalletCandidate[] = []
    const seen = new Set<string>()
    for (const [queryId, match] of Object.entries((queryResult?.credential_matches || {}) as Record<string, any>)) {
      if (!match?.success) continue
      for (const valid of match.valid_credentials || []) {
        const record = valid?.record
        if (!record?.id) continue
        const key = `${queryId}:${record.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const output = valid?.claims?.valid_claim_sets?.[0]?.output
        if (record.type === 'SdJwtVcRecord') {
          const all = cardDetailsFromSdJwtClaims(record.firstCredential?.prettyClaims)
          const { disclosed, withheld, presentPayload } = splitSdJwtShare(
            all,
            cardDetailsFromSdJwtClaims(output),
            perItemListsOf(record.firstCredential?.payload),
            wantedListItems(dcqlQuery, queryId),
          )
          const vct = String(record.firstCredential?.payload?.vct || record.getTags?.()?.vct || '')
          out.push({
            queryId,
            claimFormat: 'dc+sd-jwt',
            record,
            disclosed,
            withheld,
            presentPayload,
            types: vct ? [vct] : [],
            orgTenantId: String(all.orgTenantId || ''),
          })
          continue
        }
        const credential = record.firstCredential ?? record.credential ?? record
        const all = subjectDetailsOf(credential)
        const types = (Array.isArray(credential?.type) ? credential.type : [])
          .map(String)
          .filter((t: string) => t !== 'VerifiableCredential')
        out.push({
          queryId,
          claimFormat: String(credential?.claimFormat || 'jwt_vc'),
          record,
          disclosed: all,
          withheld: {},
          types,
          orgTenantId: String(all.orgTenantId || all.targetOrgTenantId || ''),
        })
      }
    }
    return out
  }

  /**
   * Drop cards that cannot complete this step: withdrawn, expired, no longer employed,
   * or a step list that does not include this step. An older card with no step list stays.
   */
  presentableCandidates(
    candidates: DcqlWalletCandidate[],
    stageAction = '',
    namedUserId?: string,
  ): { kept: DcqlWalletCandidate[]; dropped: { stage: number; expired: number; revoked: number; inactive: number } } {
    const dropped = { stage: 0, expired: 0, revoked: 0, inactive: 0 }
    const kept = candidates.filter((candidate) => {
      const reason = this.candidateBlockReason(candidate, stageAction, namedUserId)
      if (!reason) return true
      dropped[reason] += 1
      return false
    })
    return { kept, dropped }
  }

  /**
   * The person one job names for a step, when it names one: the sign-off person chosen when
   * the job was created, or the worker it was assigned to. Their staff card does not have to
   * list that step; being named on the job is what gives it to them.
   */
  namedPersonOnRun(runId: unknown, stageAction: string): string | undefined {
    const id = String(runId || '').trim()
    const stage = String(stageAction || '')
      .trim()
      .toLowerCase()
    if (!id || !stage) return undefined
    const run = workflowRunRepository.findRunById(id)
    const input = (run?.input && typeof run.input === 'object' ? run.input : {}) as Record<string, unknown>
    const pick = (value: unknown) => {
      const raw = String(value || '').trim()
      return raw && raw !== 'owner' && raw !== 'unassigned' && raw !== 'stage-actor' ? raw : undefined
    }
    if (stage === 'acknowledge_execution') return pick(input.receiverId)
    if (['assign_field_worker', 'start_job', 'confirm_arrival', 'capture_evidence', 'assess_risk'].includes(stage)) {
      return pick(input.assigneeUserId) || pick(input.assigneeId)
    }
    return undefined
  }

  private candidateBlockReason(
    candidate: DcqlWalletCandidate,
    stageAction: string,
    namedUserId?: string,
  ): 'stage' | 'expired' | 'revoked' | 'inactive' | null {
    const details = { ...candidate.withheld, ...candidate.disclosed }
    const payload = candidate.record?.firstCredential?.payload || candidate.record?.credential || {}
    const now = Date.now()
    const exp = Number(payload?.exp)
    if (Number.isFinite(exp) && exp > 0 && exp * 1000 <= now) return 'expired'
    for (const key of ['validUntil', 'expirationDate', 'expiry']) {
      const raw = details[key]
      if (typeof raw !== 'string' || !raw.trim()) continue
      const when = Date.parse(raw)
      if (Number.isFinite(when) && when <= now) return 'expired'
    }
    const employment = String(details.employmentStatus || '')
      .trim()
      .toLowerCase()
    if (employment && employment !== 'active') return 'inactive'
    if (this.candidateRevoked(candidate, details, payload)) return 'revoked'
    if (stageAction && !cardCoversStep(details, stageAction, namedUserId)) return 'stage'
    return null
  }

  private candidateRevoked(candidate: DcqlWalletCandidate, details: Record<string, unknown>, payload: any): boolean {
    const ids = [payload?.jti, payload?.id, candidate.record?.id, details.jti]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
    if (ids.some((id) => credentialLifecycleService.isRevoked(id))) return true
    const status = payload?.status && typeof payload.status === 'object' ? payload.status : details.status
    if (!status || typeof status !== 'object') return false
    const listUrl = String((status as any).statusListCredential || '')
    const index = Number((status as any).statusListIndex)
    const listId = listUrl.split('/').filter(Boolean).pop()?.split('#')[0] || ''
    if (!listId || !Number.isInteger(index) || index < 0) return false
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(
          `SELECT current_status FROM credential_status_allocations WHERE status_list_id = ? AND status_index = ? LIMIT 1`,
        )
        .get(listId, index) as { current_status?: string } | undefined
      return Boolean(row?.current_status && row.current_status !== 'valid')
    } catch {
      return false
    }
  }

  /**
   * Pick the record that answers the DCQL request: a ticked record first, then this organisation's
   * records, then records with no organisation (a personal identity card). Selective-disclosure
   * cards win over whole cards; newer wins over older. Withdrawn, expired, and wrong-step cards
   * are not picked.
   */
  selectDcqlCredentials(
    candidates: DcqlWalletCandidate[],
    options: { preferIds?: Set<string>; orgTenantId?: string; stageAction?: string; namedUserId?: string } = {},
  ): Record<string, any[]> {
    const presentable = this.presentableCandidates(candidates, options.stageAction || '', options.namedUserId).kept
    const wanted = String(options.orgTenantId || '').trim()
    const ticked = options.preferIds?.size
      ? presentable.filter((c) => options.preferIds!.has(String(c.record?.id || '')))
      : []
    const own = wanted ? presentable.filter((c) => c.orgTenantId === wanted) : []
    const personal = wanted ? presentable.filter((c) => !c.orgTenantId) : []
    const pool = ticked.length ? ticked : own.length ? own : personal.length ? personal : presentable
    const createdAt = (c: DcqlWalletCandidate): number => {
      const value = c.record?.createdAt
      const time = value instanceof Date ? value.getTime() : Date.parse(String(value || ''))
      return Number.isFinite(time) ? time : 0
    }
    const sorted = [...pool].sort(
      (a, b) =>
        Number(b.claimFormat.includes('sd-jwt')) - Number(a.claimFormat.includes('sd-jwt')) ||
        createdAt(b) - createdAt(a),
    )
    const pick = sorted[0]
    if (!pick) return {}
    return { [pick.queryId]: [this.dcqlCredentialFor(pick)] }
  }

  private dcqlCredentialFor(candidate: DcqlWalletCandidate): any {
    if (candidate.record?.type === 'SdJwtVcRecord') {
      // `disclosed` carries only the claims the request named; Credo turns it into the
      // presentation frame, so everything else stays undisclosed.
      return {
        claimFormat: ClaimFormat.SdJwtDc,
        credentialRecord: candidate.record,
        disclosedPayload: candidate.presentPayload ?? candidate.disclosed,
      }
    }
    const credential = candidate.record?.firstCredential ?? candidate.record?.credential
    return {
      claimFormat: credential?.claimFormat || ClaimFormat.JwtVc,
      credentialRecord: candidate.record,
      disclosedPayload: credential?.jsonCredential ?? credential,
    }
  }

  private async buildPresentationExchangeCredentials(
    holderAgent: AnyAgent,
    walletId: string | undefined,
    presentationDefinition: any,
  ): Promise<Record<string, any[]>> {
    const inputDescriptors = Array.isArray(presentationDefinition?.input_descriptors)
      ? presentationDefinition.input_descriptors
      : []
    if (inputDescriptors.length === 0) return {}

    const credentialsForRequest = await this.credentialsForRequestInWallet(
      holderAgent,
      walletId,
      presentationDefinition,
    )
    const requirements = Array.isArray((credentialsForRequest as any)?.requirements)
      ? (credentialsForRequest as any).requirements
      : []

    // The presentation is signed by the credential's subject key, which must live in this
    // wallet. Prefer candidates bound to one of our DIDs, newest first, so a stale or
    // mis-bound duplicate never blocks the person who holds a good credential.
    const ownDids = new Set<string>()
    try {
      for (const record of await holderAgent.dids.getCreatedDids()) ownDids.add(record.did)
    } catch {
      // ranking falls back to recency only
    }
    const subjectDidOf = (candidate: any): string => {
      const record = candidate?.credentialRecord || candidate?.record || candidate
      const credential = record?.firstCredential ?? record?.credential ?? record
      const subject = credential?.credentialSubject ?? credential?.credentialSubjectIds?.[0]
      const id = Array.isArray(subject) ? subject[0]?.id : typeof subject === 'string' ? subject : subject?.id
      return typeof id === 'string' ? id.split('#')[0] : ''
    }
    const createdAtOf = (candidate: any): number => {
      const record = candidate?.credentialRecord || candidate?.record || candidate
      const value = record?.createdAt
      const time = value instanceof Date ? value.getTime() : Date.parse(String(value || ''))
      return Number.isFinite(time) ? time : 0
    }
    const rank = (candidate: any): number => {
      const subject = subjectDidOf(candidate)
      if (subject && ownDids.has(subject)) return 0
      if (subject.startsWith('did:example:')) return 2
      return 1
    }
    // Credo 0.7 expects the submission entry (`{ claimFormat, credentialRecord, ... }`), older
    // versions the bare record. Entries carrying `credentialRecord` are passed through unchanged.
    const normalizeCandidate = (candidate: any): any | undefined =>
      candidate?.credentialRecord ? candidate : candidate?.record || candidate || undefined
    const candidatesOf = (entry: any): any[] =>
      (Array.isArray(entry?.verifiableCredentials) ? entry.verifiableCredentials : []).filter(Boolean)
    const pickBest = (candidates: any[]): any | undefined => {
      const sorted = [...candidates].sort((a, b) => rank(a) - rank(b) || createdAtOf(b) - createdAtOf(a))
      return sorted.length > 0 ? normalizeCandidate(sorted[0]) : undefined
    }

    const out: Record<string, any[]> = {}
    for (const descriptor of inputDescriptors) {
      const descriptorId = String(descriptor?.id || '').trim()
      if (!descriptorId) continue
      const matching: any[] = []
      const fallback: any[] = []
      for (const requirement of requirements) {
        for (const entry of Array.isArray(requirement?.submissionEntry) ? requirement.submissionEntry : []) {
          const entryId = String(entry?.inputDescriptorId || entry?.inputDescriptor?.id || '').trim()
          const bucket = !entryId || entryId === descriptorId ? matching : fallback
          bucket.push(...candidatesOf(entry))
        }
      }
      const selected = pickBest(matching) ?? pickBest(fallback)
      if (!selected) {
        throw new StatusException(
          'Your wallet does not hold a credential this organization accepts for this step. Ask the organization to send your role credential, then accept it in your inbox.',
          400,
        )
      }
      out[descriptorId] = [selected]
    }
    return out
  }

  async presentFromEmbeddedWallet(params: {
    request: ExRequest
    walletId: string
    presentationRequestUrl: string
    /** Organisation the step belongs to; its records are preferred when several match. */
    orgTenantId?: string
    /** Step this share must cover. Cards for other steps are not offered. */
    stageAction?: string
    /** Person the job names for the step; their card need not list it. */
    namedUserId?: string
    /** Job this share is for, so the person's activity log names it. */
    workflowRunId?: string
    /** Request reference (purchase request id) when the step is not on a job run. */
    reference?: string
    /** Same-device sign-in has no session yet. The wallet id is the one already on the phone. */
    allowUnsignedWallet?: boolean
  }): Promise<EmbeddedPresentationResult> {
    if (!params.allowUnsignedWallet) this.assertWalletOwnershipForActingUser(params.request, params.walletId)
    // The share is signed by the person's own wallet key, so it runs on their tenant agent.
    return withTenantHolder(params.walletId, (holderAgent) => this.presentFromHolder(holderAgent, params))
  }

  private async presentFromHolder(
    holderAgent: AnyAgent,
    params: Parameters<StageProofService['presentFromEmbeddedWallet']>[0],
  ): Promise<EmbeddedPresentationResult> {
    const resolved = await this.resolveHolderAuthorizationRequest(holderAgent, params.presentationRequestUrl)
    const holderModule = (holderAgent as any).openid4vc.holder
    const presentationDefinition = this.presentationDefinitionOf(resolved)
    const dcqlQuery = presentationDefinition ? undefined : this.dcqlQueryOf(resolved)
    const hasInputDescriptors =
      Array.isArray(presentationDefinition?.input_descriptors) && presentationDefinition.input_descriptors.length > 0

    let response: any
    // What this wallet sent, for the person's own activity log (names only).
    let sentCandidates: DcqlWalletCandidate[] | undefined
    let sentDcql: Record<string, any[]> | undefined
    let sentPex: Record<string, any[]> | undefined
    if (typeof holderModule.acceptOpenId4VpAuthorizationRequest === 'function') {
      // Credo 0.7: the holder submits the response straight to the verifier (direct_post).
      if (!hasInputDescriptors && !dcqlQuery) {
        throw new StatusException('This step did not ask for any record from your wallet.', 400)
      }
      if (dcqlQuery) {
        const candidates = await this.dcqlCandidatesInWallet(holderAgent, undefined, dcqlQuery)
        sentCandidates = candidates
        if (candidates.length === 0) {
          throw new StatusException(
            'Your wallet does not hold a credential this organization accepts for this step. Ask the organization to send your role credential, then accept it in your inbox.',
            400,
          )
        }
        const credentials = this.selectDcqlCredentials(candidates, {
          orgTenantId: params.orgTenantId,
          stageAction: params.stageAction,
          namedUserId: params.namedUserId,
        })
        sentDcql = credentials
        response = await holderModule.acceptOpenId4VpAuthorizationRequest({
          authorizationRequestPayload: resolved.authorizationRequestPayload,
          dcql: { credentials },
          transactionData: transactionDataSigners(resolved, credentials),
        })
      } else {
        sentPex = await this.buildPresentationExchangeCredentials(holderAgent, undefined, presentationDefinition)
        response = await holderModule.acceptOpenId4VpAuthorizationRequest({
          authorizationRequestPayload: resolved.authorizationRequestPayload,
          presentationExchange: { credentials: sentPex },
        })
      }
      if (response?.ok === false) {
        const detail = response?.serverResponse?.body
        const message =
          (typeof detail === 'object' && detail && (detail.error_description || detail.message || detail.error)) ||
          (typeof detail === 'string' ? detail : '') ||
          `status ${response?.serverResponse?.status ?? 'unknown'}`
        throw new StatusException(`Your wallet proof was not accepted: ${message}`, 400)
      }
    } else {
      // Credo 0.5 fallback.
      const holderIdentity = await this.getOrCreateDidForAgent(holderAgent)
      const acceptOptions: any = { authorizationRequest: resolved.authorizationRequest }
      if (hasInputDescriptors) {
        acceptOptions.presentationExchange = {
          credentials: await this.buildPresentationExchangeCredentials(holderAgent, undefined, presentationDefinition),
          definition: presentationDefinition,
        }
      } else {
        acceptOptions.openIdTokenIssuer = { method: 'did', didUrl: holderIdentity.didUrl }
      }
      response = await holderModule.acceptSiopAuthorizationRequest(acceptOptions)
      sentPex = acceptOptions.presentationExchange?.credentials
    }

    this.recordShareFromWallet({
      walletTenantId: params.walletId,
      presentationRequestUrl: params.presentationRequestUrl,
      resolved,
      orgTenantId: params.orgTenantId,
      stageAction: params.stageAction,
      workflowRunId: params.workflowRunId,
      reference: params.reference,
      candidates: sentCandidates,
      dcqlCredentials: sentDcql,
      pexCredentials: sentPex,
    })

    const submitted = (response as any)?.authorizationResponsePayload ?? (response as any)?.submittedResponse
    if (!submitted || typeof submitted !== 'object') return {}
    const vpToken = submitted.vp_token
    return {
      vpToken: typeof vpToken === 'string' ? vpToken : vpToken ? JSON.stringify(vpToken) : undefined,
      idToken: typeof submitted.id_token === 'string' ? submitted.id_token : undefined,
      presentationSubmission: submitted.presentation_submission,
      state: typeof submitted.state === 'string' ? submitted.state : undefined,
    }
  }

  // ── 3. Verifier side: read and scope-check the response ────────────────────

  /** Shared with the requisition flows: PEX, DCQL and id_token responses all count. */
  hasVerifiedPresentationOrIdToken(verificationResult: any): boolean {
    return hasVerifiedPresentation(verificationResult)
  }

  extractHolderDid(verificationResult: any): string {
    const idTokenSubject = verificationResult?.idToken?.payload?.sub
    if (typeof idTokenSubject === 'string' && idTokenSubject) return idTokenSubject
    const firstPresentation = Array.isArray(verificationResult?.presentationExchange?.presentations)
      ? verificationResult.presentationExchange.presentations[0]
      : undefined
    const presentationHolder = firstPresentation?.holder ?? firstPresentation?.holderId
    if (typeof presentationHolder === 'string' && presentationHolder) return presentationHolder
    const holderDid = verificationResult?.presentation?.holder
    if (typeof holderDid === 'string' && holderDid) return holderDid
    const vcs = verificationResult?.presentation?.verifiableCredential
    const first = Array.isArray(vcs) ? vcs[0] : vcs
    if (typeof first === 'object' && first?.credentialSubject?.id) return String(first.credentialSubject.id)
    if (typeof first === 'string') {
      const sub = decodeJwtPayload(first)?.sub
      if (typeof sub === 'string' && sub) return sub
    }
    // DCQL / SD-JWT: the subject id or the key the card is bound to.
    return presentedHolderDid(verificationResult) || 'did:unknown:holder'
  }

  presentedTypes(verificationResult: any): string[] {
    return presentedCredentialTypes(verificationResult)
  }

  async verifyStageProof(params: {
    verifierAgent: AnyAgent
    requestId: string
    orgTenantId: string
    actionKey: ProofVcActionKey
    /** Response captured from the embedded wallet, used when the session has not been finalized yet. */
    submitted?: EmbeddedPresentationResult
    /** Job this step belongs to; the person it names for the step may share a card that does not list it. */
    workflowRunId?: string
  }): Promise<StageProofVerification> {
    const verifierModule = verifierModuleOf(params.verifierAgent)
    let verificationResult: any
    try {
      verificationResult = await verifierModule.getVerifiedAuthorizationResponse(params.requestId)
    } catch (error: any) {
      if (!params.submitted?.vpToken && !params.submitted?.idToken) {
        throw new StatusException(
          `We could not confirm your proof yet. Try again in a moment. (${error?.message || 'no response'})`,
          400,
        )
      }
      verificationResult = await verifierModule.verifyAuthorizationResponse({
        verificationSessionId: params.requestId,
        authorizationResponse: {
          vp_token: params.submitted.vpToken,
          id_token: params.submitted.idToken,
          presentation_submission: params.submitted.presentationSubmission,
          state: params.submitted.state || params.requestId,
        },
      })
    }

    if (!this.hasVerifiedPresentationOrIdToken(verificationResult)) {
      throw new StatusException('No proof was shared from the wallet for this step.', 400)
    }

    const stageAction = stageActionForProofAction(params.actionKey)
    // The person's own log gets the outcome too, pass or fail (DASH_02: failed shares are logged).
    const outcomeOf = (outcome: 'verified' | 'refused', reason?: string) =>
      holderActivityService.recordShareOutcome({
        requestId: params.requestId,
        orgTenantId: params.orgTenantId,
        stageAction,
        workflowRunId: params.workflowRunId,
        holderDid: this.extractHolderDid(verificationResult),
        presentedTypes: this.presentedTypes(verificationResult),
        outcome,
        reason,
      })
    const refuse = (message: string, status: number): never => {
      outcomeOf('refused', message)
      throw new StatusException(message, status)
    }

    // A card the organisation withdrew (role changed, person left, card sent again) is refused
    // even though its signature still checks out.
    const withdrawn = extractPresentedCredentials(verificationResult).find((credential) =>
      credentialLifecycleService.isRevoked(credential.id),
    )
    if (withdrawn) {
      refuse('The card you shared is no longer valid. Accept the newer card in your inbox, then try again.', 403)
    }

    try {
      this.assertShareBinding(verificationResult, stageAction, params.workflowRunId)
    } catch (error: any) {
      refuse(error?.message || 'This share was for a different step.', error?.status || 403)
    }
    const actorProof = evaluateOrgEvidenceProof(verificationResult, {
      orgTenantId: params.orgTenantId,
      stageAction,
      namedUserId: this.namedPersonOnRun(params.workflowRunId, stageAction),
    })
    if (actorProof.present && !actorProof.valid) {
      refuse(
        `The credential you shared is not for this organization or this step (${actorProof.reason || 'scope mismatch'}).`,
        403,
      )
    }

    outcomeOf('verified')
    return {
      requestId: params.requestId,
      holderDid: this.extractHolderDid(verificationResult),
      presentedTypes: this.presentedTypes(verificationResult),
      actorProof,
      verifiedAt: new Date().toISOString(),
    }
  }
}

export const stageProofService = new StageProofService()

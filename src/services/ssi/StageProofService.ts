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
 * The platform owns workflow state: a verified presentation is evidence that the
 * person holds the credential the organization issued for the stage. Authorization is
 * still decided by the caller (membership, stage actor, run ownership).
 *
 * @module services/ssi/StageProofService
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { Request as ExRequest } from 'express'

import { Agent, DifPresentationExchangeService } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { container } from 'tsyringe'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { evaluateOrgEvidenceProof, type ActorCredentialProofEvaluation } from '../ActorCredentialProofService'
import {
  buildVcTypeArrayFilter,
  resolveAcceptedProofVcTypes,
  stageActionForProofAction,
  type ProofVcActionKey,
} from '../ProofVcPolicyService'

type AnyAgent = Agent<RestMultiTenantAgentModules>

export interface StageProofRequest {
  requestId: string
  presentationRequestUrl: string
  verifierDid: string
  acceptedVcTypes: string[]
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

function shouldUseUnsignedLocalOid4vpRequest(): boolean {
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

function verifierModuleOf(agent: AnyAgent): any {
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
    return { verifierId: finalVerifierId, signerDidUrl: signerDidUrl || (await this.getOrCreateDidForAgent(agent)).didUrl }
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
    const verifierModule = verifierModuleOf(params.verifierAgent)
    const result = await verifierModule.createAuthorizationRequest({
      verifierId: verifierRegistration.verifierId,
      version: 'v1.draft24',
      requestSigner: shouldUseUnsignedLocalOid4vpRequest()
        ? { method: 'none' }
        : { method: 'did', didUrl: verifierRegistration.signerDidUrl },
      presentationExchange: { definition: presentationDefinition },
    })
    const rawRequestUrl = result.authorizationRequest as string
    const authorizationRequestUri = result.verificationSession?.authorizationRequestUri
    const requestUrl = authorizationRequestUri
      ? `openid4vp://authorize?request_uri=${encodeURIComponent(authorizationRequestUri)}`
      : rawRequestUrl
    const requestId = result.verificationSession?.id || randomUUID()
    const presentationRequestUrl = requestUrl.includes('?')
      ? `${requestUrl}&verification_session_id=${encodeURIComponent(requestId)}`
      : `${requestUrl}?verification_session_id=${encodeURIComponent(requestId)}`
    return { requestId, presentationRequestUrl, verifierDid: signerIdentity.did, acceptedVcTypes }
  }

  // ── 2. Holder side: answer from the wallet that runs on this server ─────────

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

  getHolderAgent(): AnyAgent {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => AnyAgent)
    if (!(baseAgent as any).openid4vc?.holder) {
      throw new StatusException('The wallet is not available on this server right now', 500)
    }
    // The OID4VC holder module is mounted on the BASE agent; wallet ownership is checked separately.
    return baseAgent
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

  private async buildPresentationExchangeCredentials(
    holderAgent: AnyAgent,
    walletId: string | undefined,
    presentationDefinition: any,
  ): Promise<Record<string, any[]>> {
    const inputDescriptors = Array.isArray(presentationDefinition?.input_descriptors)
      ? presentationDefinition.input_descriptors
      : []
    if (inputDescriptors.length === 0) return {}

    const credentialsForRequest = await this.credentialsForRequestInWallet(holderAgent, walletId, presentationDefinition)
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
  }): Promise<EmbeddedPresentationResult> {
    this.assertWalletOwnershipForActingUser(params.request, params.walletId)
    const holderAgent = this.getHolderAgent()
    const resolved = await this.resolveHolderAuthorizationRequest(holderAgent, params.presentationRequestUrl)
    const holderModule = (holderAgent as any).openid4vc.holder
    const presentationDefinition = this.presentationDefinitionOf(resolved)
    const hasInputDescriptors =
      Array.isArray(presentationDefinition?.input_descriptors) && presentationDefinition.input_descriptors.length > 0

    let response: any
    if (typeof holderModule.acceptOpenId4VpAuthorizationRequest === 'function') {
      // Credo 0.7: the holder submits the response straight to the verifier (direct_post).
      if (!hasInputDescriptors) {
        throw new StatusException('This step did not ask for any record from your wallet.', 400)
      }
      response = await holderModule.acceptOpenId4VpAuthorizationRequest({
        authorizationRequestPayload: resolved.authorizationRequestPayload,
        presentationExchange: {
          credentials: await this.buildPresentationExchangeCredentials(holderAgent, params.walletId, presentationDefinition),
        },
      })
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
          credentials: await this.buildPresentationExchangeCredentials(holderAgent, params.walletId, presentationDefinition),
          definition: presentationDefinition,
        }
      } else {
        acceptOptions.openIdTokenIssuer = { method: 'did', didUrl: holderIdentity.didUrl }
      }
      response = await holderModule.acceptSiopAuthorizationRequest(acceptOptions)
    }

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

  private hasVerifiedPresentationOrIdToken(verificationResult: any): boolean {
    const hasPresentation = Boolean(
      verificationResult?.presentation || verificationResult?.presentationExchange?.presentations?.length,
    )
    return hasPresentation || Boolean(verificationResult?.idToken?.payload?.sub)
  }

  private extractHolderDid(verificationResult: any): string {
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
    return 'did:unknown:holder'
  }

  private presentedTypes(verificationResult: any): string[] {
    const types = new Set<string>()
    const collect = (value: unknown) => {
      const list = Array.isArray(value) ? value : value ? [value] : []
      for (const item of list) {
        if (typeof item === 'string') {
          const payload = decodeJwtPayload(item) as any
          for (const t of payload?.vc?.type || []) types.add(String(t))
        } else if (item && typeof item === 'object') {
          const direct = (item as any)?.type || (item as any)?.vc?.type || (item as any)?.credential?.type || []
          for (const t of Array.isArray(direct) ? direct : [direct]) if (t) types.add(String(t))
        }
      }
    }
    collect(verificationResult?.presentation?.verifiableCredential)
    for (const presentation of verificationResult?.presentationExchange?.presentations || []) {
      collect(presentation?.verifiableCredential)
      collect(presentation?.vc?.verifiableCredential)
    }
    return Array.from(types).filter((t) => t !== 'VerifiableCredential')
  }

  async verifyStageProof(params: {
    verifierAgent: AnyAgent
    requestId: string
    orgTenantId: string
    actionKey: ProofVcActionKey
    /** Response captured from the embedded wallet, used when the session has not been finalized yet. */
    submitted?: EmbeddedPresentationResult
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
    const actorProof = evaluateOrgEvidenceProof(verificationResult, { orgTenantId: params.orgTenantId, stageAction })
    if (actorProof.present && !actorProof.valid) {
      throw new StatusException(
        `The credential you shared is not for this organization or this step (${actorProof.reason || 'scope mismatch'}).`,
        403,
      )
    }

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

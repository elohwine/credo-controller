/**
 * IdenEx Credentis - Actor credential proof evaluation
 *
 * Inspects a verified OIDC4VP result and, when the holder presented an
 * `OrgWorkflowActorCredential`, checks that the credential is scoped to the organization and
 * the workflow stage being acted on. The platform stays the authority: a scoped actor credential
 * is accepted as the stage proof, a mis-scoped one is rejected, and a presentation without an
 * actor credential falls back to the existing identity/role proof rules.
 *
 * @module services/ActorCredentialProofService
 */

import { DELEGATION_VC_TYPE } from '../config/credentials/DelegationVC'
import { EMPLOYEE_VC_TYPE } from '../config/credentials/EmployeeVC'
import { ORG_WORKFLOW_ACTOR_VC_TYPE } from '../config/credentials/OrgWorkflowActorVC'

import { delegationCoversStage } from './WorkflowStageInboxService'

export interface PresentedCredential {
  types: string[]
  subject: Record<string, any>
  issuer?: string
  /** Card id: W3C `id` / JWT `jti`. The lifecycle service keys withdrawals on it. */
  id?: string
  /** Status-list entry: W3C `credentialStatus` or the SD-JWT `status` claim. */
  status?: Record<string, unknown>
}

export interface ActorCredentialProofEvaluation {
  /** An OrgWorkflowActorCredential was part of the presentation. */
  present: boolean
  /** The actor credential matches the organization and stage. */
  valid: boolean
  reason?: string
  orgTenantId?: string
  userId?: string
  role?: string
  stageActions?: string[]
  workflowType?: string
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/** Registered JWT / SD-JWT claims that are not details about the person or their role. */
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

/**
 * Decode a compact SD-JWT (`<issuer-jwt>~<disclosure>~...~[kb-jwt]`) into the claims the holder
 * actually disclosed: the issuer payload with every `_sd` digest replaced by its disclosure.
 * Only disclosures present in the string are applied, so withheld details stay withheld.
 */
export function decodeSdJwtClaims(compact: string): Record<string, any> | null {
  const parts = compact.split('~')
  const payload = decodeJwtPayload(parts[0])
  if (!payload) return null
  const disclosed: Record<string, any> = {}
  for (const part of parts.slice(1)) {
    if (!part || part.split('.').length === 3) continue // trailing key-binding JWT
    try {
      const decoded = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
      if (Array.isArray(decoded) && decoded.length === 3 && typeof decoded[1] === 'string') {
        disclosed[decoded[1]] = decoded[2]
      }
    } catch {
      // skip a malformed disclosure
    }
  }
  const claims: Record<string, any> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (key === '_sd' || key === '_sd_alg') continue
    claims[key] = value
  }
  return { ...claims, ...disclosed }
}

/** Flat SD-JWT claims → the `{ types, subject }` shape the stage checks read. */
function fromSdJwtClaims(claims: Record<string, any>): PresentedCredential {
  const vct = typeof claims.vct === 'string' ? claims.vct : ''
  const subject: Record<string, any> = {}
  for (const [key, value] of Object.entries(claims)) {
    if (SD_JWT_ENVELOPE_CLAIMS.has(key)) continue
    subject[key] = value
  }
  const kid = claims.cnf?.kid
  if (!subject.id && typeof kid === 'string') subject.id = kid.split('#')[0]
  else if (!subject.id && typeof claims.sub === 'string') subject.id = claims.sub
  const w3cTypes = Array.isArray(claims.type) ? claims.type.map(String) : []
  return {
    types: [...new Set([...(vct ? ['VerifiableCredential', vct] : []), ...w3cTypes])],
    subject,
    issuer: typeof claims.iss === 'string' ? claims.iss : undefined,
    id: typeof claims.jti === 'string' ? claims.jti : undefined,
    status: claims.status && typeof claims.status === 'object' ? claims.status : undefined,
  }
}

function toPresentedCredential(raw: unknown): PresentedCredential | undefined {
  if (!raw) return undefined

  if (typeof raw === 'string') {
    if (raw.includes('~')) {
      const claims = decodeSdJwtClaims(raw)
      return claims ? fromSdJwtClaims(claims) : undefined
    }
    const payload = decodeJwtPayload(raw)
    const vc = payload?.vc && typeof payload.vc === 'object' ? payload.vc : payload
    if (!vc || typeof vc !== 'object') return undefined
    const subject = { ...(vc.credentialSubject || {}) }
    if (!subject.id && typeof payload?.sub === 'string') subject.id = payload.sub
    return {
      types: Array.isArray(vc.type) ? vc.type.map(String) : vc.type ? [String(vc.type)] : [],
      subject,
      issuer: typeof vc.issuer === 'string' ? vc.issuer : vc.issuer?.id || payload?.iss,
      id: typeof vc.id === 'string' ? vc.id : typeof payload?.jti === 'string' ? payload.jti : undefined,
      status: vc.credentialStatus && typeof vc.credentialStatus === 'object' ? vc.credentialStatus : undefined,
    }
  }

  if (typeof raw === 'object') {
    const anyRaw = raw as Record<string, any>
    // Credo SdJwtVc (verified presentation): `prettyClaims` holds only the disclosed claims.
    if (anyRaw.prettyClaims && typeof anyRaw.prettyClaims === 'object') {
      return fromSdJwtClaims(anyRaw.prettyClaims)
    }
    if (typeof anyRaw.compact === 'string' && anyRaw.compact.includes('~')) {
      const claims = decodeSdJwtClaims(anyRaw.compact)
      return claims ? fromSdJwtClaims(claims) : undefined
    }
    // Credo W3cJwtVerifiableCredential exposes .credential; W3cJsonLdVerifiableCredential is the VC itself.
    const vc = anyRaw.credential && typeof anyRaw.credential === 'object' ? anyRaw.credential : anyRaw
    const types = Array.isArray(vc.type) ? vc.type.map(String) : vc.type ? [String(vc.type)] : []
    const subjectRaw = Array.isArray(vc.credentialSubject) ? vc.credentialSubject[0] : vc.credentialSubject
    const subject = subjectRaw && typeof subjectRaw === 'object' ? { ...subjectRaw } : {}
    if (!subject.id && Array.isArray(vc.credentialSubjectIds) && vc.credentialSubjectIds[0]) {
      subject.id = vc.credentialSubjectIds[0]
    }
    // Credo class instances keep claims under `claims` for some formats.
    if (Object.keys(subject).length === 0 && subjectRaw?.claims && typeof subjectRaw.claims === 'object') {
      Object.assign(subject, subjectRaw.claims)
    }
    const status = vc.credentialStatus && typeof vc.credentialStatus === 'object' ? vc.credentialStatus : undefined
    return {
      types,
      subject,
      issuer: typeof vc.issuer === 'string' ? vc.issuer : vc.issuer?.id || vc.issuerId,
      id: typeof vc.id === 'string' ? vc.id : typeof anyRaw.jti === 'string' ? anyRaw.jti : undefined,
      status: status ? (typeof status.toJSON === 'function' ? status.toJSON() : { ...status }) : undefined,
    }
  }

  return undefined
}

/**
 * Every credential contained in a verified authorization response, regardless of which
 * Credo/OpenID4VP result shape produced it.
 */
export function extractPresentedCredentials(verificationResult: any): PresentedCredential[] {
  const out: PresentedCredential[] = []
  const pushAll = (value: unknown) => {
    const list = Array.isArray(value) ? value : value ? [value] : []
    for (const item of list) {
      const credential = toPresentedCredential(item)
      if (credential) out.push(credential)
    }
  }

  pushAll(verificationResult?.presentation?.verifiableCredential)

  const presentations = verificationResult?.presentationExchange?.presentations
  if (Array.isArray(presentations)) {
    for (const presentation of presentations) {
      pushAll(presentation?.verifiableCredential)
      pushAll(presentation?.presentation?.verifiableCredential)
    }
  }

  // DCQL (Credo 0.7): `presentations` maps each credential query id to the presentations the
  // holder returned. A W3C presentation wraps credentials; an SD-JWT presentation is the
  // credential itself (with only the disclosed claims).
  const dcql = verificationResult?.dcql?.presentations ?? verificationResult?.dcql?.presentation
  if (dcql && typeof dcql === 'object') {
    for (const entry of Object.values(dcql)) {
      const list = Array.isArray(entry) ? entry : [entry]
      for (const presentation of list) {
        const wrapped =
          (presentation as any)?.verifiableCredential ?? (presentation as any)?.presentation?.verifiableCredential
        if (wrapped) pushAll(wrapped)
        else pushAll(presentation)
      }
    }
  }

  return out
}

/** Credential type names (without `VerifiableCredential`) found in a verified response. */
export function presentedCredentialTypes(verificationResult: any): string[] {
  const types = new Set<string>()
  for (const credential of extractPresentedCredentials(verificationResult)) {
    for (const type of credential.types) if (type !== 'VerifiableCredential') types.add(type)
  }
  return Array.from(types)
}

/** The holder DID of the first presented credential (`credentialSubject.id`, or `cnf.kid` for SD-JWT). */
export function presentedHolderDid(verificationResult: any): string | undefined {
  for (const credential of extractPresentedCredentials(verificationResult)) {
    const id = credential.subject?.id
    if (typeof id === 'string' && id) return id.split('#')[0]
  }
  return undefined
}

/** True when the response carries at least one verified presentation (PEX or DCQL) or an id_token subject. */
export function hasVerifiedPresentation(verificationResult: any): boolean {
  const dcqlPresentations = verificationResult?.dcql?.presentations
  const hasDcql =
    dcqlPresentations && typeof dcqlPresentations === 'object' && Object.keys(dcqlPresentations).length > 0
  return Boolean(
    verificationResult?.presentation ||
      verificationResult?.presentationExchange?.presentations?.length ||
      hasDcql ||
      verificationResult?.idToken?.payload?.sub,
  )
}

export function isActorCredential(credential: PresentedCredential): boolean {
  return credential.types.includes(ORG_WORKFLOW_ACTOR_VC_TYPE)
}

/** Steps named on a staff or role card. A missing list means an older card that still proves the person works here. */
export function listedStageActions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  return []
}

/**
 * A card that lists steps only covers those steps. A card with no list still covers the step.
 */
export function listedStepsCover(stageActions: unknown, stageAction: string): boolean {
  const stage = String(stageAction || '')
    .trim()
    .toLowerCase()
  if (!stage) return true
  const steps = listedStageActions(stageActions)
  if (steps.length === 0) return true
  return steps.includes(stage)
}

/**
 * Who a step is checked against. `namedUserId` is the person this one job names for the step
 * (for example the person chosen to sign off when the job was created). Their staff card lists
 * the steps they usually confirm for the organisation; being named on the job is what gives
 * them this step, so their card only has to prove they work here.
 */
export interface ActorProofScope {
  orgTenantId?: string
  stageAction: string
  /** The person, or everyone, the organisation lets do this step on this job. */
  namedUserId?: string | string[]
}

/** The card covers the step when it lists it, or when its holder may do this step on this job. */
export function cardCoversStep(subject: Record<string, any>, stage: string, namedUserId?: string | string[]): boolean {
  if (listedStepsCover(subject?.stageActions, stage)) return true
  const holder = String(subject?.userId || '').trim()
  if (!holder) return false
  const allowed = (Array.isArray(namedUserId) ? namedUserId : [namedUserId]).map((id) => String(id || '').trim())
  return allowed.includes(holder)
}

/**
 * Evaluate whether the presentation carries an actor credential for this org + stage.
 */
export function evaluateActorCredentialProof(
  verificationResult: any,
  scope: ActorProofScope,
): ActorCredentialProofEvaluation {
  const actorCredentials = extractPresentedCredentials(verificationResult).filter(isActorCredential)
  if (actorCredentials.length === 0) {
    return { present: false, valid: false }
  }

  const stage = String(scope.stageAction || '')
    .trim()
    .toLowerCase()

  let lastReason = 'actor credential does not match this organization or stage'
  for (const credential of actorCredentials) {
    const subject = credential.subject || {}
    const credentialOrg = String(subject.orgTenantId || '').trim()
    const stageActions = listedStageActions(subject.stageActions)

    if (scope.orgTenantId && credentialOrg && credentialOrg !== scope.orgTenantId) {
      lastReason = 'actor credential was issued for a different organization'
      continue
    }
    if (!cardCoversStep(subject, stage, scope.namedUserId)) {
      lastReason = `actor credential does not cover the ${stage.replace(/_/g, ' ')} stage`
      continue
    }

    return {
      present: true,
      valid: true,
      orgTenantId: credentialOrg || scope.orgTenantId,
      userId: typeof subject.userId === 'string' ? subject.userId : undefined,
      role:
        typeof subject.role === 'string'
          ? subject.role
          : typeof subject.memberRole === 'string'
            ? subject.memberRole
            : undefined,
      stageActions,
      workflowType: typeof subject.workflowType === 'string' ? subject.workflowType : undefined,
    }
  }

  return { present: true, valid: false, reason: lastReason }
}

function credentialOfType(verificationResult: any, type: string): PresentedCredential[] {
  return extractPresentedCredentials(verificationResult).filter((credential) => credential.types.includes(type))
}

/**
 * Accept an employee or delegation credential presented in place of (or in addition to) an
 * actor credential, when it is scoped to this organization and — for delegations — this stage.
 * An actor credential that is present but invalid still fails; it is not papered over.
 */
export function evaluateOrgEvidenceProof(
  verificationResult: any,
  scope: ActorProofScope,
): ActorCredentialProofEvaluation {
  const actor = evaluateActorCredentialProof(verificationResult, scope)
  if (actor.present) return actor

  const stage = String(scope.stageAction || '')
    .trim()
    .toLowerCase()

  const employees = credentialOfType(verificationResult, EMPLOYEE_VC_TYPE)
  if (employees.length > 0) {
    let reason = 'employee credential was issued for a different organization'
    for (const credential of employees) {
      const subject = credential.subject || {}
      const credentialOrg = String(subject.orgTenantId || '').trim()
      const status = String(subject.employmentStatus || 'active').toLowerCase()
      const stageActions = listedStageActions(subject.stageActions)
      if (scope.orgTenantId && credentialOrg && credentialOrg !== scope.orgTenantId) continue
      if (status && status !== 'active') continue
      // A staff card that lists steps only covers those steps, unless this job names its
      // holder for the step. Cards issued before steps were added have no list and still
      // prove the person works here.
      if (!cardCoversStep(subject, stage, scope.namedUserId)) {
        reason = `staff card does not cover the ${stage.replace(/_/g, ' ')} step`
        continue
      }
      return {
        present: true,
        valid: true,
        orgTenantId: credentialOrg || scope.orgTenantId,
        userId: typeof subject.userId === 'string' ? subject.userId : undefined,
        role: typeof subject.role === 'string' ? subject.role : undefined,
        stageActions,
      }
    }
    return { present: true, valid: false, reason }
  }

  const delegations = credentialOfType(verificationResult, DELEGATION_VC_TYPE)
  if (delegations.length > 0) {
    for (const credential of delegations) {
      const subject = credential.subject || {}
      const credentialOrg = String(subject.orgTenantId || '').trim()
      if (scope.orgTenantId && credentialOrg && credentialOrg !== scope.orgTenantId) continue
      const until = typeof subject.validUntil === 'string' ? Date.parse(subject.validUntil) : NaN
      if (!Number.isNaN(until) && until < Date.now()) continue
      const permissions = Array.isArray(subject.permissions) ? subject.permissions.map(String) : []
      if (permissions.length > 0 && stage && !delegationCoversStage(permissions, stage, stage)) continue
      return {
        present: true,
        valid: true,
        orgTenantId: credentialOrg || scope.orgTenantId,
        userId: typeof subject.delegateUserId === 'string' ? subject.delegateUserId : undefined,
        role: 'delegate',
      }
    }
    return { present: true, valid: false, reason: 'delegation credential does not cover this organization or stage' }
  }

  return { present: false, valid: false }
}

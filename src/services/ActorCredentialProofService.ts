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

function toPresentedCredential(raw: unknown): PresentedCredential | undefined {
  if (!raw) return undefined

  if (typeof raw === 'string') {
    const payload = decodeJwtPayload(raw)
    const vc = payload?.vc && typeof payload.vc === 'object' ? payload.vc : payload
    if (!vc || typeof vc !== 'object') return undefined
    const subject = { ...(vc.credentialSubject || {}) }
    if (!subject.id && typeof payload?.sub === 'string') subject.id = payload.sub
    return {
      types: Array.isArray(vc.type) ? vc.type.map(String) : vc.type ? [String(vc.type)] : [],
      subject,
      issuer: typeof vc.issuer === 'string' ? vc.issuer : vc.issuer?.id || payload?.iss,
    }
  }

  if (typeof raw === 'object') {
    const anyRaw = raw as Record<string, any>
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
    return {
      types,
      subject,
      issuer: typeof vc.issuer === 'string' ? vc.issuer : vc.issuer?.id || vc.issuerId,
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

  const dcql = verificationResult?.dcql?.presentation
  if (dcql && typeof dcql === 'object') {
    for (const entry of Object.values(dcql)) {
      pushAll((entry as any)?.verifiableCredential)
      pushAll((entry as any)?.presentation?.verifiableCredential)
    }
  }

  return out
}

export function isActorCredential(credential: PresentedCredential): boolean {
  return credential.types.includes(ORG_WORKFLOW_ACTOR_VC_TYPE)
}

/**
 * Evaluate whether the presentation carries an actor credential for this org + stage.
 */
export function evaluateActorCredentialProof(
  verificationResult: any,
  scope: { orgTenantId?: string; stageAction: string },
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
    const stageActions = Array.isArray(subject.stageActions)
      ? subject.stageActions.map((item: unknown) => String(item).trim().toLowerCase())
      : typeof subject.stageActions === 'string'
        ? subject.stageActions.split(',').map((item: string) => item.trim().toLowerCase())
        : []

    if (scope.orgTenantId && credentialOrg && credentialOrg !== scope.orgTenantId) {
      lastReason = 'actor credential was issued for a different organization'
      continue
    }
    if (stage && stageActions.length > 0 && !stageActions.includes(stage)) {
      lastReason = `actor credential does not cover the ${stage.replace(/_/g, ' ')} stage`
      continue
    }

    return {
      present: true,
      valid: true,
      orgTenantId: credentialOrg || scope.orgTenantId,
      userId: typeof subject.userId === 'string' ? subject.userId : undefined,
      role: typeof subject.role === 'string' ? subject.role : typeof subject.memberRole === 'string' ? subject.memberRole : undefined,
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
  scope: { orgTenantId?: string; stageAction: string },
): ActorCredentialProofEvaluation {
  const actor = evaluateActorCredentialProof(verificationResult, scope)
  if (actor.present) return actor

  const stage = String(scope.stageAction || '')
    .trim()
    .toLowerCase()

  const employees = credentialOfType(verificationResult, EMPLOYEE_VC_TYPE)
  if (employees.length > 0) {
    for (const credential of employees) {
      const subject = credential.subject || {}
      const credentialOrg = String(subject.orgTenantId || '').trim()
      const status = String(subject.employmentStatus || 'active').toLowerCase()
      if (scope.orgTenantId && credentialOrg && credentialOrg !== scope.orgTenantId) continue
      if (status && status !== 'active') continue
      return {
        present: true,
        valid: true,
        orgTenantId: credentialOrg || scope.orgTenantId,
        userId: typeof subject.userId === 'string' ? subject.userId : undefined,
        role: typeof subject.role === 'string' ? subject.role : undefined,
      }
    }
    return { present: true, valid: false, reason: 'employee credential was issued for a different organization' }
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

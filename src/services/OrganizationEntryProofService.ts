import type { Agent, DcqlQuery } from '@credo-ts/core'
import type { OrganizationService } from './OrganizationService'
import type { WalletLoginStart } from './WalletLoginService'
import type { OpenId4VpVerifiedAuthorizationResponse } from '@credo-ts/openid4vc'

import { ClaimFormat, W3cJwtVerifiableCredential, W3cJwtVerifiablePresentation } from '@credo-ts/core'
import crypto from 'crypto'

import { EMPLOYEE_VC_TYPE } from '../config/credentials/EmployeeVC'
import { StatusException } from '../errors'
import { ORG_CONTEXT_ADMINS_ONLY, ORG_CONTEXT_ADMINS_ONLY_MESSAGE, roleMayOpenOrgContext } from './OrgContextPolicy'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../persistence/IssuedCredentialRepository'
import { getTenantById } from '../persistence/TenantRepository'
import { extractPresentedCredentials } from './ActorCredentialProofService'
import { shouldAllowWholeCardType } from './ssi/proofModeMatrix'
import { credentialLifecycleService } from './ssi/CredentialLifecycleService'
import { statusListAllocatorService } from './ssi/StatusListAllocatorService'
import { shouldUseUnsignedLocalOid4vpRequest, stageProofService, verifierModuleOf } from './ssi/StageProofService'

interface EntryRow {
  user_id: string
  org_tenant_id: string
  session_hash: string
  poll_token_hash: string
  expires_at: string
  consumed_at: string | null
}

export type OrganizationEntryPoll =
  | { status: 'pending'; expiresAt: string }
  | {
      status: 'verified'
      token: string
      orgTenantId: string
      orgRole: string
      orgName: string
      sector?: string
      workflowTypes: string[]
    }

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const ENTRY_CLAIM_SETS = [
  ['org', 'person', 'role', 'status', 'access'],
  ['org', 'person', 'role', 'status'],
]

export function organizationEntryQuery(orgTenantId: string, userId: string): DcqlQuery {
  const allowLegacyWholeCard = shouldAllowWholeCardType('organization_entry', EMPLOYEE_VC_TYPE)
  const credentials: DcqlQuery['credentials'] = [
    {
      id: 'staff_card',
      format: 'vc+sd-jwt',
      meta: { vct_values: [EMPLOYEE_VC_TYPE] },
      require_cryptographic_holder_binding: true,
      claims: [
        { id: 'org', path: ['orgTenantId'], values: [orgTenantId] },
        { id: 'person', path: ['userId'], values: [userId] },
        { id: 'role', path: ['role'] },
        { id: 'status', path: ['employmentStatus'], values: ['active'] },
        { id: 'access', path: ['orgAccess'], values: ['manage'] },
      ],
      // Prefer the card that says it opens the organisation; older cards without the claim
      // still answer and are judged on the live role.
      claim_sets: ENTRY_CLAIM_SETS,
    },
  ]
  if (allowLegacyWholeCard) {
    credentials.push({
      id: 'legacy_staff_card',
      format: 'jwt_vc_json',
      meta: { type_values: [['VerifiableCredential', EMPLOYEE_VC_TYPE]] },
      require_cryptographic_holder_binding: true,
      claims: [
        { id: 'org', path: ['credentialSubject', 'orgTenantId'], values: [orgTenantId] },
        { id: 'person', path: ['credentialSubject', 'userId'], values: [userId] },
        { id: 'role', path: ['credentialSubject', 'role'] },
        { id: 'status', path: ['credentialSubject', 'employmentStatus'], values: ['active'] },
        { id: 'access', path: ['credentialSubject', 'orgAccess'], values: ['manage'] },
      ],
      claim_sets: ENTRY_CLAIM_SETS,
    })
  }
  return {
    credentials,
    credential_sets: [
      {
        options: allowLegacyWholeCard ? [['staff_card'], ['legacy_staff_card']] : [['staff_card']],
        required: true,
      },
    ],
  }
}

export function assertOrganizationEntryHolderBinding(verified: OpenId4VpVerifiedAuthorizationResponse): void {
  const presentations = Object.values(verified.dcql?.presentations || {}).flat()
  if (presentations.length !== 1) throw new StatusException('Share one holder-bound staff credential', 403)
  const presentation = presentations[0]
  if (presentation.claimFormat === ClaimFormat.SdJwtDc && presentation.kbJwt) return
  if (presentation instanceof W3cJwtVerifiablePresentation) {
    const kid = presentation.jwt.header.kid
    const holderDid = typeof kid === 'string' && kid.startsWith('did:') ? kid.split('#')[0] : undefined
    const credentials = presentation.presentation.verifiableCredential
    const staff = (Array.isArray(credentials) ? credentials : [credentials]).find(
      (credential) => credential instanceof W3cJwtVerifiableCredential && credential.type.includes(EMPLOYEE_VC_TYPE),
    )
    if (holderDid && staff instanceof W3cJwtVerifiableCredential && staff.credentialSubjectIds.includes(holderDid))
      return
  }
  throw new StatusException('The staff card is not bound to the presenting wallet', 403)
}

export class OrganizationEntryProofService {
  public constructor(
    private readonly agent: Agent,
    private readonly organizations: OrganizationService,
  ) {}

  public async start(userId: string, orgTenantId: string, personalToken: string): Promise<WalletLoginStart> {
    const role = this.organizations.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new StatusException('You are not an active member of this organisation', 403)
    }
    if (!roleMayOpenOrgContext(role)) {
      throw new StatusException(ORG_CONTEXT_ADMINS_ONLY_MESSAGE, 403, ORG_CONTEXT_ADMINS_ONLY)
    }
    const signer = await stageProofService.getOrCreateDidForAgent(this.agent)
    const verifier = await stageProofService.getOrCreateVerifierForAgent(this.agent, signer.didUrl)
    const request = await verifierModuleOf(this.agent).createAuthorizationRequest({
      verifierId: verifier.verifierId,
      version: 'v1.draft24',
      expirationInSeconds: 300,
      requestSigner: shouldUseUnsignedLocalOid4vpRequest()
        ? { method: 'none' }
        : { method: 'did', didUrl: verifier.signerDidUrl },
      dcql: { query: organizationEntryQuery(orgTenantId, userId) },
    })
    if (!request.verificationSession?.id || !request.authorizationRequest) {
      throw new StatusException('Verifier did not return an organisation proof request', 500)
    }
    const loginId: string = request.verificationSession.id
    const pollToken = crypto.randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO organization_entry_proofs
       (request_id, user_id, org_tenant_id, session_hash, poll_token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(loginId, userId, orgTenantId, hash(personalToken), hash(pollToken), expiresAt)
    return { loginId, authorizationRequest: request.authorizationRequest, pollToken, expiresAt }
  }

  public async poll(
    userId: string,
    orgTenantId: string,
    personalToken: string,
    requestId: string,
    pollToken: string,
  ): Promise<OrganizationEntryPoll> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM organization_entry_proofs WHERE request_id = ?').get(requestId) as
      | EntryRow
      | undefined
    if (
      !row ||
      row.user_id !== userId ||
      row.org_tenant_id !== orgTenantId ||
      row.session_hash !== hash(personalToken) ||
      !pollToken ||
      !crypto.timingSafeEqual(Buffer.from(row.poll_token_hash, 'hex'), Buffer.from(hash(pollToken), 'hex'))
    ) {
      throw new StatusException('Unknown organisation proof', 404)
    }
    const now = new Date().toISOString()
    if (row.consumed_at || row.expires_at <= now)
      throw new StatusException('This organisation proof has expired or was used', 410)
    const verifier = verifierModuleOf(this.agent)
    const session = await verifier.getVerificationSessionById(requestId)
    if (session?.state !== 'ResponseVerified' && session?.state !== 'Error') {
      return { status: 'pending', expiresAt: row.expires_at }
    }
    const claimed = db
      .prepare(
        'UPDATE organization_entry_proofs SET consumed_at = ? WHERE request_id = ? AND consumed_at IS NULL AND expires_at > ?',
      )
      .run(now, requestId, now).changes
    if (claimed !== 1) throw new StatusException('This organisation proof was already used', 410)
    if (session.state === 'Error') throw new StatusException('The staff-card presentation was rejected', 403)

    // Only SDK-verified responses to this account/org-bound request reach claim evaluation.
    const verified: OpenId4VpVerifiedAuthorizationResponse = await verifier.getVerifiedAuthorizationResponse(requestId)
    assertOrganizationEntryHolderBinding(verified)
    const cards = extractPresentedCredentials(verified).filter((card) => card.types.includes(EMPLOYEE_VC_TYPE))
    if (cards.length !== 1) throw new StatusException('Share exactly one staff card for this organisation', 403)
    const card = cards[0]
    const issuerDid = getTenantById(orgTenantId)?.issuerDid
    const role = this.organizations.getUserOrgRole(userId, orgTenantId)
    if (!issuerDid || card.issuer !== issuerDid) {
      throw new StatusException(
        "This staff card was not signed by the organisation's current issuer. Ask the organisation to send an updated card.",
        403,
      )
    }
    if (
      card.subject.orgTenantId !== orgTenantId ||
      card.subject.userId !== userId ||
      card.subject.employmentStatus !== 'active' ||
      !role ||
      card.subject.role !== role
    ) {
      throw new StatusException(
        'The staff card does not match your current organisation membership. Accept an updated card and try again.',
        403,
      )
    }
    // A card that says it is for tasks only does not open the organisation, whatever the role says.
    if (
      !roleMayOpenOrgContext(role) ||
      (card.subject.orgAccess !== undefined && card.subject.orgAccess !== 'manage')
    ) {
      throw new StatusException(
        roleMayOpenOrgContext(role)
          ? 'This staff card is for tasks only. Accept your updated staff card from the inbox, then try again.'
          : ORG_CONTEXT_ADMINS_ONLY_MESSAGE,
        403,
        ORG_CONTEXT_ADMINS_ONLY,
      )
    }
    const issued = card.id ? new IssuedCredentialRepository().findByCredentialId(card.id) : undefined
    const status = card.id ? statusListAllocatorService.getStatusByCredentialRef(card.id) : undefined
    if (
      !issued ||
      issued.tenantId !== orgTenantId ||
      issued.revoked ||
      credentialLifecycleService.isRevoked(card.id) ||
      (status && status !== 'valid')
    ) {
      throw new StatusException('This staff card is unrecognised or no longer active', 403)
    }
    const token = await this.organizations.generateOrgToken(userId, orgTenantId)
    const memberships = await this.organizations.listUserOrganizations(userId)
    const organization = memberships.find((org) => org.orgTenantId === orgTenantId)
    if (!organization || organization.role !== card.subject.role) {
      throw new StatusException(
        'Organisation membership changed during proof verification. Try again with an updated card.',
        403,
      )
    }
    const configuration = this.organizations.getOrganizationWorkflowConfiguration(userId, orgTenantId)
    return {
      status: 'verified',
      token,
      orgTenantId,
      orgRole: organization.role,
      orgName: organization.name,
      sector: configuration.sector,
      workflowTypes: configuration.workflowTypes,
    }
  }
}

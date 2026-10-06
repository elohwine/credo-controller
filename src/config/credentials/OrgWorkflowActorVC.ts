/**
 * OrgWorkflowActorCredential - "actor VC" for people acting on behalf of an organization.
 *
 * When an organization configures who acts at a workflow stage (directly, by role, or through
 * its fallback policy), the platform offers the resolved person an actor credential scoped to
 * that organization and to the stage actions they cover. When the person later performs the
 * stage action (approve / release funds / acknowledge / assign / payout …) the OIDC4VP request
 * for that action accepts this credential as proof that they are the organization's actor.
 *
 * Design invariant (remodel handoff §10): SSI provides evidence and trust; the platform owns
 * workflow state. Possession of this credential never implies authorization on its own — the
 * platform still resolves the actor and checks the credential's org/stage scope at action time.
 *
 * Claims (credentialSubject):
 * - orgTenantId / orgName / orgIssuerDid: the organization the holder acts for
 * - userId / memberRole / role: the member and their organization role (role is what the
 *   requisition proof-role check reads)
 * - workflowType / stageActions: the workflow and the stage actions covered
 * - assignmentMode: how the actor was resolved (configured_user | configured_role | policy_fallback …)
 * - assignedAt / issuedAt / fingerprint: change tracking so a new offer is made when the
 *   assignment changes
 */

export const ORG_WORKFLOW_ACTOR_VC_TYPE = 'OrgWorkflowActorCredential'

/** wallet_pending_offers.source_type for actor credential offers. */
export const ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE = 'org_workflow_actor'

export interface OrgWorkflowActorClaims {
  orgTenantId: string
  orgName: string
  orgIssuerDid?: string
  userId: string
  memberRole: string
  /** Normalised copy of memberRole read by proof-role checks (e.g. manager / finance / admin). */
  role: string
  workflowType: string
  stageActions: string[]
  assignmentMode: string
  assignedAt: string
  issuedAt: string
  platformName: string
  /** Stable hash of the scope (org + user + workflow + stage actions + role). */
  fingerprint: string
}

export const ORG_WORKFLOW_ACTOR_CREDENTIAL_DEFINITION = {
  credentialDefinitionId: ORG_WORKFLOW_ACTOR_VC_TYPE,
  credentialType: ['VerifiableCredential', ORG_WORKFLOW_ACTOR_VC_TYPE],
  format: 'jwt_vc_json',
  claims: {
    orgTenantId: { type: 'string', required: true },
    orgName: { type: 'string', required: true },
    orgIssuerDid: { type: 'string', required: false },
    userId: { type: 'string', required: true },
    memberRole: { type: 'string', required: true },
    role: { type: 'string', required: true },
    workflowType: { type: 'string', required: true },
    stageActions: { type: 'array', required: true },
    assignmentMode: { type: 'string', required: true },
    assignedAt: { type: 'string', required: true },
    issuedAt: { type: 'string', required: true },
    platformName: { type: 'string', required: true },
    fingerprint: { type: 'string', required: true },
  },
}

export const ORG_WORKFLOW_ACTOR_SCHEMA_ID = `${ORG_WORKFLOW_ACTOR_VC_TYPE}-schema-1.0.0`

export const ORG_WORKFLOW_ACTOR_JSON_SCHEMA = {
  $id: `${ORG_WORKFLOW_ACTOR_VC_TYPE}-1.0.0`,
  type: 'object',
  required: ['credentialSubject'],
  properties: {
    credentialSubject: {
      type: 'object',
      required: ['orgTenantId', 'userId', 'workflowType', 'stageActions', 'role'],
      properties: {
        orgTenantId: { type: 'string' },
        orgName: { type: 'string' },
        orgIssuerDid: { type: 'string' },
        userId: { type: 'string' },
        memberRole: { type: 'string' },
        role: { type: 'string' },
        workflowType: { type: 'string' },
        stageActions: { type: 'array', items: { type: 'string' } },
        assignmentMode: { type: 'string' },
        assignedAt: { type: 'string', format: 'date-time' },
        issuedAt: { type: 'string', format: 'date-time' },
        platformName: { type: 'string' },
        fingerprint: { type: 'string' },
      },
    },
  },
}

/**
 * EmployeeCredential — evidence that the holder is an employee of an organization.
 *
 * Offered when someone is added as an organization member, linked as an internal contact,
 * or hired through the employee onboarding flow. Presentation is evidence only: the platform
 * still owns workflow state and checks the credential's organization at action time.
 *
 * Lifecycle: every card carries an id (`jti` on the SD-JWT form, `id` on the W3C form) and a
 * status entry (W3C Bitstring Status List, purpose `revocation`); `CredentialLifecycleService`
 * records each issued card. A role change sends a new card; the earlier accepted card stops when
 * the new one is accepted, or straight away when the new role has fewer steps (or the
 * organisation chose `staffCardChange = 'stop_now'`). Leaving the organisation withdraws all of
 * them. Stage proofs refuse a withdrawn card.
 */

export const EMPLOYEE_VC_TYPE = 'EmployeeCredential'
export const EMPLOYEE_OFFER_SOURCE_TYPE = 'org_employee'
export const EMPLOYMENT_CONTRACT_VC_TYPE = 'EmploymentContractVC'
export const EMPLOYMENT_CONTRACT_OFFER_SOURCE_TYPE = 'employment_contract'

export type EmployeeOrgAccess = 'manage' | 'tasks'

export const EMPLOYEE_ORG_ACCESS_ROLES: ReadonlySet<string> = new Set(['owner', 'admin'])

export function employeeOrgAccessForRole(role: string | null | undefined): EmployeeOrgAccess {
  return EMPLOYEE_ORG_ACCESS_ROLES.has(String(role || '').trim().toLowerCase()) ? 'manage' : 'tasks'
}

/**
 * Request permissions an owner or admin card states. Their authority comes from the live role;
 * the claim lets a verifier see it. Other members get approval access per step from Who does what
 * (a DelegationCredential), so their card carries none.
 */
export const MANAGER_CARD_PERMISSIONS = [
  'request.review',
  'request.approve',
  'request.reject',
  'request.fulfil',
  'request.complete',
]

export function employeePermissionsForRole(role: string | null | undefined): string[] | undefined {
  return employeeOrgAccessForRole(role) === 'manage' ? [...MANAGER_CARD_PERMISSIONS] : undefined
}

export interface EmployeeCredentialClaims {
  orgTenantId: string
  orgName: string
  userId: string
  memberRole: string
  role: string
  department?: string
  employmentStatus: 'active'
  /** membership | internal_contact | onboarding */
  source: string
  /**
   * Steps this person confirms for the organization (approve, release, sign off, …).
   * One staff card carries every step. Empty on cards issued before steps were added;
   * those still prove employment, and a fresh card is sent when the steps change.
   * Issued as a selective-disclosure card (SD-JWT, vct EmployeeCredential). A share reveals
   * only the details the step asks for (organisation, role, status, steps). Cards already
   * in a wallet as a whole signed record still work and are shared in full.
   */
  stageActions?: string[]
  /**
   * What the card lets the holder open. `manage`: owners and admins, who may open the
   * organisation account and its dashboard. `tasks`: everyone else, who work from their personal
   * inbox and open one item at a time. The platform still checks the live role on every request;
   * the claim is what a verifier (and the organisation-entry proof) sees. Absent on older cards.
   */
  orgAccess?: EmployeeOrgAccess
  /** Owners and admins: the request permissions their role carries. Absent for other members. */
  permissions?: string[]
  issuedAt: string
  platformName: string
  fingerprint: string
}

export const EMPLOYEE_JSON_SCHEMA = {
  $id: `${EMPLOYEE_VC_TYPE}-1.0.0`,
  type: 'object',
  required: ['credentialSubject'],
  properties: {
    credentialSubject: {
      type: 'object',
      required: ['orgTenantId', 'userId', 'role', 'employmentStatus'],
      properties: {
        orgTenantId: { type: 'string' },
        orgName: { type: 'string' },
        userId: { type: 'string' },
        memberRole: { type: 'string' },
        role: { type: 'string' },
        department: { type: 'string' },
        employmentStatus: { type: 'string' },
        source: { type: 'string' },
        stageActions: { type: 'array', items: { type: 'string' } },
        orgAccess: { type: 'string', enum: ['manage', 'tasks'] },
        permissions: { type: 'array', items: { type: 'string' } },
        issuedAt: { type: 'string', format: 'date-time' },
        platformName: { type: 'string' },
        fingerprint: { type: 'string' },
      },
    },
  },
}

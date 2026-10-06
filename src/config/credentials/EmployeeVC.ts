/**
 * EmployeeCredential — evidence that the holder is an employee of an organization.
 *
 * Offered when someone is added as an organization member, linked as an internal contact,
 * or hired through the employee onboarding flow. Presentation is evidence only: the platform
 * still owns workflow state and checks the credential's organization at action time.
 */

export const EMPLOYEE_VC_TYPE = 'EmployeeCredential'
export const EMPLOYEE_OFFER_SOURCE_TYPE = 'org_employee'
export const EMPLOYMENT_CONTRACT_VC_TYPE = 'EmploymentContractVC'
export const EMPLOYMENT_CONTRACT_OFFER_SOURCE_TYPE = 'employment_contract'

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
        issuedAt: { type: 'string', format: 'date-time' },
        platformName: { type: 'string' },
        fingerprint: { type: 'string' },
      },
    },
  },
}

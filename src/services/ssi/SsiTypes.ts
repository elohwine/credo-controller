/**
 * Protocol-independent SSI domain types.
 *
 * Business workflows must depend on these abstractions rather than on JWT,
 * SD-JWT, JSON-LD, AnonCreds, mdoc, or a particular wallet implementation.
 */

export type CredentialStatus = 'valid' | 'suspended' | 'revoked' | 'expired' | 'unknown'

export type TrustDecision = 'trusted' | 'untrusted' | 'unknown'

export interface CredentialReference {
  referenceId: string
  tenantId: string
  subjectRef?: string
  credentialType: string
  issuerRef?: string
  format?: 'jwt_vc' | 'sd_jwt_vc' | 'ldp_vc' | 'mso_mdoc' | 'anoncreds' | string
  status: CredentialStatus
  issuedAt?: string
  expiresAt?: string
  lastVerifiedAt?: string
  digest?: string
  externalRef?: string
}

export interface VerificationResult {
  verified: boolean
  credentialReferences: string[]
  issuerTrust: TrustDecision
  holderBindingVerified: boolean
  statusChecked: boolean
  schemaChecked: boolean
  audienceChecked?: boolean
  nonceChecked?: boolean
  reasonCode?: string
  verifiedAt: string
}

export interface PresentationRequest {
  requestId: string
  tenantId: string
  purpose: string
  verifierRef: string
  requestedClaims: string[]
  expiresAt: string
}

export interface AuthorityScope {
  permissions: string[]
  resourceTypes?: string[]
  departmentIds?: string[]
  projectRefs?: string[]
  costCentreRefs?: string[]
  currency?: string
  maxAmount?: number
  constraints?: Record<string, unknown>
}

export interface AuthorityDecisionInput {
  tenantId: string
  personId: string
  action: string
  resourceType: string
  resourceId?: string
  amount?: number
  currency?: string
  departmentId?: string
  projectRef?: string
  costCentreRef?: string
  requiredPermission?: string
  separationOfDutiesPersonIds?: string[]
}

export interface AuthorityDecision {
  decisionId: string
  decision: 'allow' | 'deny'
  reasonCode: string
  authorityRef?: string
  credentialReferences: string[]
  policyVersion: string
  evaluatedAt: string
}

/**
 * DelegationCredential — evidence that the holder may act within a delegator's scope.
 *
 * Offered to the delegate when an organization creates a delegation. Inbox routing for a
 * workflow stage also notifies delegates whose scope covers that stage. The platform still
 * checks the delegation row (and this credential's org, expiry, and permissions) at action time.
 */

export const DELEGATION_VC_TYPE = 'DelegationCredential'
export const DELEGATION_OFFER_SOURCE_TYPE = 'org_delegation'

export interface DelegationCredentialClaims {
  orgTenantId: string
  orgName: string
  delegationId: string
  delegatorUserId: string
  delegateUserId: string
  permissions: string[]
  maxAmount?: number
  currency?: string
  validFrom: string
  validUntil?: string
  issuedAt: string
  platformName: string
  fingerprint: string
}

export const DELEGATION_JSON_SCHEMA = {
  $id: `${DELEGATION_VC_TYPE}-1.0.0`,
  type: 'object',
  required: ['credentialSubject'],
  properties: {
    credentialSubject: {
      type: 'object',
      required: ['orgTenantId', 'delegationId', 'delegateUserId', 'permissions'],
      properties: {
        orgTenantId: { type: 'string' },
        orgName: { type: 'string' },
        delegationId: { type: 'string' },
        delegatorUserId: { type: 'string' },
        delegateUserId: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
        maxAmount: { type: 'number' },
        currency: { type: 'string' },
        validFrom: { type: 'string', format: 'date-time' },
        validUntil: { type: 'string', format: 'date-time' },
        issuedAt: { type: 'string', format: 'date-time' },
        platformName: { type: 'string' },
        fingerprint: { type: 'string' },
      },
    },
  },
}

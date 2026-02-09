/**
 * PlatformIdentityVC - Self-Sovereign Identity for Platform Users
 * 
 * This VC is issued to users during registration and contains their identity claims.
 * The platform NEVER stores PII (phone, email, name) in its database.
 * 
 * SSI Principles:
 * - User controls their identity data (stored in their wallet)
 * - Platform only stores: tenantId, DID, credential hash
 * - Login = Present VC → Platform verifies signature → Extracts claims
 * - No data breach risk (no PII to steal)
 * 
 * Claims:
 * - phone: E.164 format (e.g., +263774183277)
 * - email: Optional email address
 * - displayName: User's chosen display name
 * - registeredAt: ISO timestamp of registration
 * - platformTenantId: The tenant/wallet ID on this platform
 * 
 * Verification:
 * - Issuer = Platform DID (trusted)
 * - Subject = User's DID (holder binding)
 * - Signature = Ed25519 or ES256K
 */

export const PLATFORM_IDENTITY_VC_TYPE = 'PlatformIdentityCredential'

export const PLATFORM_IDENTITY_VC_CONTEXT = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    {
      PlatformIdentityCredential: 'https://credentis.io/credentials/v1#PlatformIdentityCredential',
      phone: 'https://schema.org/telephone',
      email: 'https://schema.org/email',
      displayName: 'https://schema.org/name',
      registeredAt: 'https://schema.org/dateCreated',
      platformTenantId: 'https://credentis.io/credentials/v1#platformTenantId',
      platformName: 'https://schema.org/name',
      verificationLevel: 'https://credentis.io/credentials/v1#verificationLevel'
    }
  ]
}

export interface PlatformIdentityClaims {
  phone?: string           // E.164 format
  email?: string           // Optional email
  displayName: string      // User's display name (username)
  registeredAt: string     // ISO timestamp
  platformTenantId: string // Wallet/tenant ID on platform
  platformName: string     // "Credentis" or platform name
  verificationLevel: 'unverified' | 'phone_verified' | 'email_verified' | 'kyc_verified'
}

export const PLATFORM_IDENTITY_CREDENTIAL_DEFINITION = {
  credentialDefinitionId: 'PlatformIdentityVC',
  credentialType: ['VerifiableCredential', PLATFORM_IDENTITY_VC_TYPE],
  format: 'jwt_vc_json',
  claims: {
    phone: { type: 'string', required: false },
    email: { type: 'string', required: false },
    displayName: { type: 'string', required: true },
    registeredAt: { type: 'string', required: true },
    platformTenantId: { type: 'string', required: true },
    platformName: { type: 'string', required: true },
    verificationLevel: { type: 'string', required: true }
  }
}

/**
 * Minimal user record stored in database (NO PII)
 * All identity claims are in the user's wallet VC
 */
export interface SSIUserRecord {
  id: string              // Internal ID
  tenantId: string        // Credo tenant/wallet ID
  did: string             // User's DID (public identifier)
  credentialHash: string  // Hash of issued PlatformIdentityVC for verification
  createdAt: string       // When account was created
  lastLoginAt?: string    // Last successful VC presentation
}

/**
 * Login request - user presents their PlatformIdentityVC
 */
export interface VCLoginRequest {
  presentationJwt: string  // Signed VP containing PlatformIdentityVC
}

/**
 * Login response - includes session token and extracted claims
 */
export interface VCLoginResponse {
  token: string           // JWT session token
  tenantId: string        // User's tenant/wallet ID
  displayName: string     // Extracted from VC
  // Note: phone/email NOT returned unless needed - user controls disclosure
}

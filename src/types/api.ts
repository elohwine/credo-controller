/**
 * API types for DID, OIDC4VC Issuance/Verification, and Schema registry.
 *
 * Purpose:
 *  - Centralize request/response contracts for controllers so OpenAPI can $ref these shapes.
 *  - Keep payloads Walt.id-compatible (credential_offer_url, preAuthorizedCode, verifiableCredential, etc.).
 *
 * References:
 *  - OpenID4VCI: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 *  - OIDC4VP: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 *  - Walt.id Community: https://docs.walt.id/community-stack/home
 */

// ---------- DID ----------

/**
 * Response for DID creation or preparation endpoints.
 *
 * @example
 * {
 *   did: "did:key:z6Mkh...",
 *   didDocument: { "@context": ["https://www.w3.org/ns/did/v1"], id: "did:key:..." },
 *   keyRef: "ed25519-...",
 *   createdAt: "2025-09-11T08:20:00.000Z"
 * }
 */
export interface DidCreateResponse {
  did: string
  didDocument: any
  keyRef: string
  createdAt: string
}

/** Request body for did:jwk creation */
export interface CreateDidJwkRequest {
  keyType: 'P-256' | 'Ed25519'
}
/** Request body for did:web preparation */
export interface PrepareDidWebRequest {
  domain: string
  keyMethod?: 'jwk' | 'key'
  keyType?: 'Ed25519' | 'P-256'
}

// ---------- Schema ----------

export interface RegisterSchemaRequestBody {
  name: string
  version: string
  jsonSchema: Record<string, any>
}

// ---------- Issuer (OIDC4VC) ----------

/** Credential template item for offers */
export interface OfferCredentialTemplate {
  type: string[]
  schemaId?: string
  claimsTemplate?: any
  format?: 'jwt_vc' | 'sd_jwt'
  credentialDefinitionId?: string
  issuerDid?: string
}

/** Create credential offer request */
export interface CreateCredentialOfferRequest {
  credentials: OfferCredentialTemplate[]
  issuerDid?: string
  expiresIn?: number
}

/** Create offer response */
export interface CreateCredentialOfferResponse {
  offerId: string
  credential_offer_url: string
  preAuthorizedCode: string
  expiresAt: string
}

/** Token exchange request (pre-authorized code) */
export interface TokenRequestBody {
  grant_type: string
  pre_authorized_code: string
  subject_did: string
  format?: 'jwt_vc' | 'sd_jwt'
}

/** Token response with issued credential */
export interface TokenResponseBody {
  verifiableCredential: string
  credentialId: string
}

/** Issued credential record */
export interface IssuedCredentialRecord {
  id: string
  jwt: string
  subject: string
  issuer: string
  createdAt: string
  revoked: boolean
  revokedAt?: string
  schemaId?: string
}

// ---------- Verifier (OIDC4VP) ----------

/** Presentation request creation */
export interface CreatePresentationRequestBody {
  presentationDefinition?: any
}

/** Presentation request response */
export interface CreatePresentationRequestResponse {
  requestId: string
  presentation_request_url: string
}

/** Verify presentation request */
export interface VerifyPresentationRequestBody {
  requestId: string
  verifiablePresentation: string
}

/** Verify presentation response */
export interface VerifyPresentationResponse {
  verified: boolean
  reason?: string
  schemaValidation?: any
  presentation?: any
  error?: string
}

/**
 * API types for DID, OIDC4VC Issuance/Verification, Schema registry, and
 * standards-based OpenID4VP presentation requests.
 */

// ---------- DID ----------
export interface DidCreateResponse {
  did: string
  didDocument: any
  keyRef: string
  createdAt: string
}

export interface CreateDidJwkRequest {
  keyType: 'P-256' | 'Ed25519'
}

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
export interface OfferCredentialTemplate {
  type: string[]
  schemaId?: string
  claimsTemplate?: any
  format?: 'jwt_vc' | 'sd_jwt' | 'jwt_vc_json' | 'jwt_vc_json-ld'
  credentialDefinitionId?: string
  issuerDid?: string
  claims?: Record<string, any>
}

export interface CreateCredentialOfferRequest {
  credentials: OfferCredentialTemplate[]
  issuerDid?: string
  expiresIn?: number
}

export interface CreateCredentialOfferResponse {
  offerId: string
  credential_offer_url: string
  credential_offer_uri: string
  preAuthorizedCode: string
  expiresAt: string
}

export interface TokenRequestBody {
  grant_type: string
  pre_authorized_code: string
  subject_did: string
  format?: 'jwt_vc' | 'sd_jwt' | 'jwt_vc_json' | 'jwt_vc_json-ld'
}

export interface TokenResponseBody {
  verifiableCredential: string
  credentialId: string
}

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

// ---------- Verifier (OpenID4VP) ----------
export type PresentationQueryLanguage = 'dcql' | 'pex_v2'

export interface CreatePresentationRequestBody {
  /** Registered platform verifier. Preferred for production flows. */
  verifierRef?: string
  /** Query language defaults to DCQL for OpenID4VP 1.0. */
  queryLanguage?: PresentationQueryLanguage
  /** Digital Credentials Query Language object. */
  dcqlQuery?: Record<string, any>
  /** DIF Presentation Exchange v2 object for compatibility flows. */
  presentationDefinition?: Record<string, any>
  /** Legacy direct signer reference; used only when verifierRef is omitted. */
  verifierDid?: string
}

export interface CreatePresentationRequestResponse {
  requestId: string
  presentation_request_url: string
  queryLanguage?: PresentationQueryLanguage
  protocol?: 'openid4vp'
}

export interface VerifyPresentationRequestBody {
  requestId: string
  state: string
  verifiablePresentation: string
  presentationSubmission?: any
}

export interface VerifyPresentationResponse {
  verified: boolean
  reason?: string
  schemaValidation?: any
  /** Deprecated compatibility field. New platform verifier responses never populate it. */
  presentation?: undefined
  error?: string
  checks?: {
    signature?: boolean
    nonce?: boolean
    audience?: boolean
    revocation?: boolean
    schema?: boolean
  }
}

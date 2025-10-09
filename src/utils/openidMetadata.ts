interface DisplayMapping {
  name?: string
  locale?: string
  description?: string
}

export interface IssuerMetadataInput {
  issuerDid: string
  credentialEndpoint: string
  tokenEndpoint: string
  baseUrl: string
  display?: DisplayMapping
}

export function buildIssuerMetadata(input: IssuerMetadataInput) {
  return {
    credential_issuer: input.baseUrl,
    issuer: input.issuerDid,
    credential_endpoint: input.credentialEndpoint,
    token_endpoint: input.tokenEndpoint,
    credentials_supported: [
      {
        format: 'jwt_vc',
        types: ['VerifiableCredential'],
        cryptographic_binding_methods_supported: ['did'],
        cryptographic_suites_supported: ['Ed25519Signature2018'],
      },
    ],
    display: input.display ? [input.display] : [],
  }
}

export interface VerifierMetadataInput {
  verifierDid: string
  baseUrl: string
  presentationEndpoint: string
  display?: DisplayMapping
}

export function buildVerifierMetadata(input: VerifierMetadataInput) {
  return {
    issuer: input.verifierDid,
    presentation_endpoint: input.presentationEndpoint,
    display: input.display ? [input.display] : [],
  }
}

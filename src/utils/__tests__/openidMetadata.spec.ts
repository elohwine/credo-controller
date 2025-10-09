import { buildIssuerMetadata, buildVerifierMetadata } from '../openidMetadata'

describe('openidMetadata helpers', () => {
  it('buildIssuerMetadata returns defaults and display array', () => {
    const metadata = buildIssuerMetadata({
      issuerDid: 'did:key:issuer',
      credentialEndpoint: 'https://api.example.com/credentials',
      tokenEndpoint: 'https://api.example.com/token',
      baseUrl: 'https://issuer.example.com',
      display: {
        name: 'Example Issuer',
        description: 'Issue example credentials',
        locale: 'en-US',
      },
    })

    expect(metadata).toEqual({
      credential_issuer: 'https://issuer.example.com',
      issuer: 'did:key:issuer',
      credential_endpoint: 'https://api.example.com/credentials',
      token_endpoint: 'https://api.example.com/token',
      credentials_supported: [
        {
          format: 'jwt_vc',
          types: ['VerifiableCredential'],
          cryptographic_binding_methods_supported: ['did'],
          cryptographic_suites_supported: ['Ed25519Signature2018'],
        },
      ],
      display: [
        {
          name: 'Example Issuer',
          description: 'Issue example credentials',
          locale: 'en-US',
        },
      ],
    })
  })

  it('buildVerifierMetadata omits display when not provided', () => {
    const metadata = buildVerifierMetadata({
      verifierDid: 'did:key:verifier',
      baseUrl: 'https://verifier.example.com',
      presentationEndpoint: 'https://verifier.example.com/presentations',
    })

    expect(metadata).toEqual({
      issuer: 'did:key:verifier',
      presentation_endpoint: 'https://verifier.example.com/presentations',
      display: [],
    })
  })
})

import { ApiClient } from '../utils/apiClient'
import { createTestServerContext } from '../utils/testServer'

jest.setTimeout(180000)

describe('Tenant issuance e2e', () => {
  it('provisions tenant, issues credential, and verifies presentation', async () => {
    const context = await createTestServerContext()
    const client = new ApiClient(context.app)

    try {
      const baseToken = await client.getAgentToken(context.apiKey)
      const tenant = await client.createTenant(baseToken, {
        config: { label: 'E2E Tenant' },
        baseUrl: 'http://localhost:3000',
      })
      const tenantToken = tenant.token

      const schema = await client.registerSchema(tenantToken, {
        name: `E2E Schema ${Date.now()}`,
        version: '1.0.0',
        jsonSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            credentialSubject: {
              type: 'object',
              properties: {
                givenName: { type: 'string' },
                familyName: { type: 'string' },
              },
              required: ['givenName', 'familyName'],
            },
          },
          required: ['credentialSubject'],
        },
      })

      const credentialDefinition = await client.registerCredentialDefinition(tenantToken, {
        name: `E2E Credential ${Date.now()}`,
        version: '1.0.0',
        schemaId: schema.schemaId,
        credentialType: ['VerifiableCredential', 'E2ECredential'],
        issuerDid: tenant.issuerDid,
        claimsTemplate: {
          credentialSubject: {
            givenName: 'Alice',
            familyName: 'Doe',
          },
        },
      })

      const holderDid = await client.createKeyDid(tenantToken)

      const offer = await client.createCredentialOffer(tenantToken, {
  credentials: [
    {
      // W3C JWT VC issuance
      type: ['VerifiableCredential', 'E2ECredential'],
      schemaId: schema.schemaId,          // tie back to schema registry
      format: 'jwt_vc',                   // or 'sd_jwt' if you want selective disclosure
      claimsTemplate: {
        credentialSubject: {
          givenName: 'Alice',
          familyName: 'Doe',
        },
      },
      issuerDid: tenant.issuerDid,
    },
  ],
  issuerDid: tenant.issuerDid,            // optional if controller infers it
})

      const tokenResponse = await client.redeemCredential({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        pre_authorized_code: offer.preAuthorizedCode,
        subject_did: holderDid.did,
      })

      expect(tokenResponse.credentialId).toBeDefined()
      expect(tokenResponse.verifiableCredential).toEqual(expect.any(String))

      const issued = await client.listIssuedCredentials(tenantToken)
      const issuedIds = issued.map((item: any) => item.id)
      expect(issuedIds).toContain(tokenResponse.credentialId)

      const presentationRequest = await client.createPresentationRequest(tenantToken)
      const verification = await client.verifyPresentation(tenantToken, {
        requestId: presentationRequest.requestId,
        verifiablePresentation: tokenResponse.verifiableCredential,
      })

      expect(verification.verified).toBe(true)
      expect(verification.presentation?.jti).toBe(tokenResponse.credentialId)
      expect(verification.presentation?.sub).toBe(holderDid.did)
    } finally {
      await context.cleanup()
    }
  })
})

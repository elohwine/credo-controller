import type { Express } from 'express'
import type { CreateTenantResponse, CreateTenantOptions } from '../../src/controllers/types'
import type {
  RegisterSchemaRequestBody,
  CreateCredentialOfferRequest,
  CreateCredentialOfferResponse,
  TokenRequestBody,
  TokenResponseBody,
  CreatePresentationRequestResponse,
  VerifyPresentationResponse,
} from '../../src/types/api'

import supertest from 'supertest'
import type { SuperTest, Test } from 'supertest'

interface RegisterCredentialDefinitionBody {
  name: string
  version: string
  schemaId: string
  credentialType: string[]
  issuerDid: string
  claimsTemplate?: Record<string, unknown>
  format?: 'jwt_vc' | 'sd_jwt'
}

export class ApiClient {
  private readonly request: supertest.SuperTest<supertest.Test>

  public constructor(app: Express) {
    this.request = supertest(app) as unknown as SuperTest<Test>
  }

  public async getAgentToken(apiKey: string): Promise<string> {
    const response = await this.request.post('/agent/token').set('Authorization', apiKey)
    if (response.status !== 200 || !response.body?.token) {
      const errorBody = response.body ? JSON.stringify(response.body) : response.text
      throw new Error(`Failed to fetch agent token: ${response.status} ${errorBody ?? ''}`.trim())
    }
    return response.body.token as string
  }

  public async createTenant(baseToken: string, options?: Partial<CreateTenantOptions>): Promise<CreateTenantResponse> {
    const body: CreateTenantOptions = {
      config: {
        label: options?.config?.label ?? 'Test Tenant',
        connectionImageUrl: options?.config?.connectionImageUrl,
      },
      baseUrl: options?.baseUrl ?? 'http://localhost:3000',
      displayName: options?.displayName ?? options?.config?.label ?? 'Test Tenant',
    }

    const response = await this.request
      .post('/multi-tenancy/create-tenant')
      .set('Authorization', `Bearer ${baseToken}`)
      .send(body)

    if (response.status !== 200) {
      throw new Error(`Failed to create tenant: ${response.status} ${response.text}`)
    }

    return response.body as CreateTenantResponse
  }

  public async createTenantToken(baseToken: string, tenantId: string): Promise<string> {
    const response = await this.request
      .post(`/multi-tenancy/get-token/${tenantId}`)
      .set('Authorization', `Bearer ${baseToken}`)

    if (response.status !== 200 || !response.body?.token) {
      throw new Error(`Failed to retrieve tenant token: ${response.status}`)
    }

    return response.body.token as string
  }

  public async createKeyDid(tenantToken: string) {
    const response = await this.request
      .post('/dids/automation/key')
      .set('Authorization', `Bearer ${tenantToken}`)

    if (response.status !== 200 || !response.body?.did) {
      throw new Error(`Failed to create did:key: ${response.status}`)
    }

    return response.body as { did: string; kid: string; publicKeyBase58?: string }
  }

  public async registerSchema(
    tenantToken: string,
    schema?: Partial<RegisterSchemaRequestBody>,
  ): Promise<{ schemaId: string }> {
    const body: RegisterSchemaRequestBody = {
      name: schema?.name ?? 'Test Schema',
      version: schema?.version ?? '1.0.0',
      jsonSchema:
        schema?.jsonSchema ??
        ({
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
        } as const),
    }

    const response = await this.request
      .post('/oidc/schemas')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(body)

    if (response.status !== 201 || !response.body?.schemaId) {
      throw new Error(`Failed to register schema: ${response.status}`)
    }

    return response.body as { schemaId: string }
  }

  public async registerCredentialDefinition(
    tenantToken: string,
    body: RegisterCredentialDefinitionBody,
  ) {
    const response = await this.request
      .post('/oidc/credential-definitions/')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(body)

    if (response.status !== 200 || !response.body?.credentialDefinitionId) {
      throw new Error(`Failed to register credential definition: ${response.status}`)
    }

    return response.body as RegisterCredentialDefinitionBody & { credentialDefinitionId: string; createdAt: string }
  }

  public async createCredentialOffer(
    tenantToken: string,
    body: CreateCredentialOfferRequest,
  ): Promise<CreateCredentialOfferResponse> {
    const response = await this.request
      .post('/oidc/issuer/credential-offers')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(body)

    if (response.status !== 201) {
      throw new Error(`Failed to create credential offer: ${response.status}`)
    }

    return response.body as CreateCredentialOfferResponse
  }

  public async redeemCredential(body: TokenRequestBody): Promise<TokenResponseBody> {
    const response = await this.request.post('/oidc/token').send(body)

    if (response.status !== 200 || !response.body?.verifiableCredential) {
      throw new Error(`Failed to redeem credential: ${response.status}`)
    }

    return response.body as TokenResponseBody
  }

  public async createPresentationRequest(
    tenantToken: string,
  ): Promise<CreatePresentationRequestResponse> {
    const response = await this.request
      .post('/oidc/verifier/presentation-requests')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({})

    if (response.status !== 201 || !response.body?.requestId) {
      throw new Error(`Failed to create presentation request: ${response.status}`)
    }

    return response.body as CreatePresentationRequestResponse
  }

  public async verifyPresentation(
    tenantToken: string,
    body: { requestId: string; verifiablePresentation: string },
  ): Promise<VerifyPresentationResponse> {
    const response = await this.request
      .post('/oidc/verifier/verify')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(body)

    if (response.status !== 200) {
      throw new Error(`Presentation verification failed: ${response.status}`)
    }

    return response.body as VerifyPresentationResponse
  }

  public async listIssuedCredentials(tenantToken: string) {
    const response = await this.request
      .get('/oidc/issuer/credentials')
      .set('Authorization', `Bearer ${tenantToken}`)

    if (response.status !== 200) {
      throw new Error(`Failed to list issued credentials: ${response.status}`)
    }

    return response.body as Record<string, unknown>[]
  }
}

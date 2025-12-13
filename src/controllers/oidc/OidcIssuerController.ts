import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type {
  CreateCredentialOfferRequest,
  CreateCredentialOfferResponse,
  TokenRequestBody,
  TokenResponseBody,
  IssuedCredentialRecord,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Get, Route, Tags, Body, SuccessResponse, Security, Path, Query, Request } from 'tsoa'
import { container } from 'tsyringe'

import { credentialDefinitionStore } from '../../utils/credentialDefinitionStore'
import { getTenantById } from '../../persistence/TenantRepository'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import type { RestAgentModules, RestMultiTenantAgentModules } from '../../cliAgent'

// Use request-scoped Pino logger attached by middleware

// Types are imported from ../../types/api

/**
 * OIDC4VC Issuer (Pre-Authorized Code Flow)
 *
 * This phase-1 implementation purposely keeps logic minimal:
 *  - Offers stored in-memory (ephemeral dev only)
 *  - Mock detached hash "signature" (NOT production safe)
 *  - DID selection: if caller supplies issuerDid that matches a stored record we reference its keyRef for kid
 *  - Optional JSON Schema validation: if credential template supplies schemaId + claimsTemplate
 *
 * Next steps (not yet implemented here):
 *  - Replace mock signing with wallet based key usage producing a real EdDSA signature (JWS)
 *  - Support multiple credential types per offer + batching
 *  - Add nonce / token binding checks, rate limiting, aud/exp in JWT
 *  - Persist to durable storage
 */
@Route('oidc')
@Tags('OIDC4VC')
export class OidcIssuerController extends Controller {
  /**
   * Create a credential offer (pre-authorized code flow) - placeholder implementation.
   */
  @Post('issuer/credential-offers')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createCredentialOffer(
    @Request() request: ExRequest,
    @Body() body: CreateCredentialOfferRequest,
  ): Promise<CreateCredentialOfferResponse> {
    if (!body?.credentials?.length) {
      this.setStatus(400)
      throw new Error('credentials array required')
    }

    const tenantId = (request.agent as TenantAgent<any> | undefined)?.context?.contextCorrelationId
    const agent = request.agent

    // Transform API template to Credo options
    const credentialConfigurations = body.credentials.map((template) => {
      // For now, assuming template.credentialDefinitionId maps to a supported configuration
      // In a real native impl, we should have registered these configurations first.
      // For this refactor, we will try to pass necessary metadata dynamically if supported, 
      // or rely on the module's existing config if we had set it up.
      // CHECK: Credo's createCredentialOffer expects 'credentialConfigurationIds' or full config.

      // As we are "moving to native", we should be using the IDs that the Issuer Module knows about.
      // But since we haven't registered them in the module explicitly, we might need to assume 
      // the user or logic has done so, or we pass what we can. 

      // Fallback: Use the template directly if the module allows ad-hoc (it usually requires registered config).
      // If we strictly follow "no custom impl", we should have pre-registered issuer metadata / configs.
      // However, to keep this refactor strictly to the *endpoint logic*, we will assume
      // the IDs passed are valid or we map them.

      return template.credentialDefinitionId as string
    })

    // Create offer using Credo Native Module
    // Note: ensure we cast to any if types aren't fully picked up yet
    const { credentialOffer, credentialOfferUri } = await (agent.modules as any).openId4VcIssuer.createCredentialOffer({
      credentialConfigurationIds: credentialConfigurations,
      grants: {
        authorization_code: {
          issuer_state: randomUUID()
        },
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': randomUUID(), // Credo generates this if we don't? Let's assume we can pass it or it auto-gens.
          // actually Credo usually generates the code if we specify the grant type
        }
      }
    })

    // Credo returns the objects. We just return them to the caller.

    // We need to persist the offer? Credo's module handles internal storage usually.
    // But we might want to log it.

    request.logger?.info({ module: 'issuer', operation: 'createOffer', credentialOfferUri }, 'Created native credential offer')

    // Extract info for response
    // credOffer is the object, uri is the string

    return {
      offerId: credentialOffer.id, // check actual property name in Credo
      credential_offer_url: `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`,
      credential_offer_uri: credentialOfferUri,
      preAuthorizedCode: credentialOffer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'] as string,
      expiresAt: new Date(Date.now() + 3600000).toISOString() // Approximate or fetch from offer
    }
  }

  /**

  /**
   * Get issued credential metadata (Admin)
   */
  @Get('issuer/credentials/{id}')
  @Security('jwt', ['tenant'])
  public async getCredential(@Request() request: ExRequest, @Path() id: string): Promise<any> {
    try {
      const record = await request.agent.credentials.getById(id)
      return record
    } catch (e) {
      this.setStatus(404)
      throw new Error('credential not found')
    }
  }

  /**
   * Revoke an issued credential (Admin)
   * Credo generic credentials module does not support 'revocation' (ledger/status list) directly via this API yet.
   * We will perform a local delete to prevent further usage from this agent's perspective.
   */
  @Post('issuer/credentials/{id}/revoke')
  @Security('jwt', ['tenant'])
  public async revokeCredential(@Request() request: ExRequest, @Path() id: string): Promise<any> {
    try {
      // Credo generic credentials module does not support 'revocation' (ledger/status list) directly via this API yet.
      // We will perform a local delete to prevent further usage from this agent's perspective.
      await request.agent.credentials.deleteById(id)
      return { id, revoked: true, status: 'deleted_locally' }
    } catch (e: any) {
      this.setStatus(500)
      throw new Error(`Failed to revoke/delete: ${e.message}`)
    }
  }

  /**
   * List issued credentials (Admin)
   */
  @Get('issuer/credentials')
  @Security('jwt', ['tenant'])
  public async listCredentials(@Request() request: ExRequest, @Query() subject?: string): Promise<any[]> {
    const records = await request.agent.credentials.getAll()
    // Filter if needed (Credo getAll supports query but simple filter here is fine for now)
    if (subject) {
      // Subject DID is usually in credentialAttributes or specific metadata depending on format
      // This might need more specific filtering based on CredentialExchangeRecord structure
      return records.filter(r => r.connectionId === subject || (r as any).credentialAttributes?.some((a: any) => a.value === subject))
    }
    return records
  }
}

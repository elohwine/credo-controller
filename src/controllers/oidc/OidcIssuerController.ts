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
@Route('custom-oidc')
@Tags('OIDC4VC')
export class OidcIssuerController extends Controller {
  /**
   * Create a credential offer (pre-authorized code flow) - placeholder implementation.
   */
  @Post('issuer/credential-offers')
  @SuccessResponse('201', 'Created')
  @Security('apiKey')
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
    const credentialConfigurations = [] as string[]
    // Map incoming templates to registered issuer credential configuration IDs.
    for (const template of body.credentials) {
      // Attempt to resolve credential definition from store
      const { credentialDefinitionStore } = require('../../utils/credentialDefinitionStore')
      const def = credentialDefinitionStore.get(template.credentialDefinitionId as string)

      // Common formats advertised by issuer (should match CLI_COMMON_FORMATS)
      const COMMON_FORMATS = ['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']

      if (def) {
        // If caller specified a desired format, prefer mapping to that format
        const requestedFormats = [] as string[]
        if (template.format) {
          const fmt = (template.format as string).toLowerCase()
          if (fmt === 'sd_jwt' || fmt === 'vc+sd-jwt') requestedFormats.push('vc+sd-jwt')
          else if (fmt.startsWith('jwt_vc_json')) requestedFormats.push('jwt_vc_json')
          else if (fmt === 'jwt_vc' || fmt === 'jwt_json') requestedFormats.push('jwt_vc')
          else requestedFormats.push(fmt)
        } else {
          // No requested format: advertise all common formats so holder can pick
          requestedFormats.push(...COMMON_FORMATS)
        }

        for (const f of requestedFormats) {
          const cfgId = `${def.credentialDefinitionId}_${f}`
          credentialConfigurations.push(cfgId)
        }
      } else {
        // Fallback to raw id if we couldn't resolve definition
        credentialConfigurations.push(template.credentialDefinitionId as string)
      }
    }

    // Get the correct issuer (assuming single issuer for now)
    const issuers = await (agent.modules as any).openId4VcIssuer.getAllIssuers()
    if (!issuers || issuers.length === 0) {
      throw new Error('No OpenID4VC Issuer configured')
    }
    const issuerId = issuers[0].issuerId

    // Log inputs
    request.logger?.info({
      issuerId,
      credentialConfigurations,
      credentialsOriginal: body.credentials
    }, 'Calling createCredentialOffer')

    // Create offer using Credo Native Module
    // Note: ensure we cast to any if types aren't fully picked up yet
    const result = await (agent.modules as any).openId4VcIssuer.createCredentialOffer({
      issuerId,
      offeredCredentials: credentialConfigurations,
      preAuthorizedCodeFlowConfig: {
        userPinRequired: false
      },
      grants: {
        authorization_code: {
          issuer_state: randomUUID()
        },
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': randomUUID(),
          user_pin_required: false
        }
      }
    })

    // In this version of Credo, credentialOffer is the URI string, and issuanceSession contains details
    const { credentialOffer: offerUri, issuanceSession } = result as any
    const payload = issuanceSession.credentialOfferPayload

    request.logger?.info({ module: 'issuer', operation: 'createOffer', credentialOfferUri: offerUri }, 'Created native credential offer')

    return {
      offerId: issuanceSession.id,
      credential_offer_url: offerUri,
      credential_offer_uri: offerUri,
      preAuthorizedCode: payload.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'] as string,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
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
      return records.filter((r: any) => r.connectionId === subject || (r as any).credentialAttributes?.some((a: any) => a.value === subject))
    }
    return records
  }
}

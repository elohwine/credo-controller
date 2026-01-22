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
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import type { RestAgentModules, RestMultiTenantAgentModules } from '../../cliAgent'

// Use request-scoped Pino logger attached by middleware

// Types are imported from ../../types/api

const issuedCredentialRepository = new IssuedCredentialRepository()

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
  @Security('jwt', ['tenant'])
  public async createCredentialOffer(
    @Request() request: ExRequest,
    @Body() body: CreateCredentialOfferRequest,
  ): Promise<CreateCredentialOfferResponse> {
    if (!body?.credentials?.length) {
      this.setStatus(400)
      throw new Error('credentials array required')
    }

    const tenantId = (request as any)?.user?.tenantId as string | undefined
    const agent = request.agent

    // Transform API template to Credo options
    const credentialConfigurations = [] as string[]
    // Map incoming templates to registered issuer credential configuration IDs.
    for (const template of body.credentials) {
      // Attempt to resolve credential definition from store
      const { credentialDefinitionStore } = require('../../utils/credentialDefinitionStore')
      const def = credentialDefinitionStore.get(template.credentialDefinitionId as string)

      // Common formats advertised by issuer (should match CLI_COMMON_FORMATS)
      // Prefer jwt_vc_json first because holders commonly expect the JSON variant
      const COMMON_FORMATS = ['jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc', 'jwt_vc']

      // Always use the caller's credentialDefinitionId for building config IDs
      // This ensures we match what the issuer advertises (e.g., GenericIDCredential_jwt_vc_json)
      // The def lookup is just for validation - the template ID controls the config ID name
      const templateId = template.credentialDefinitionId as string

      // If caller specified a desired format, prefer mapping to that format
      const requestedFormats = [] as string[]
      if (template.format) {
        const fmt = (template.format as string).toLowerCase()
        if (fmt === 'sd_jwt' || fmt === 'vc+sd-jwt') requestedFormats.push('vc+sd-jwt')
        else if (fmt.startsWith('jwt_vc_json')) requestedFormats.push('jwt_vc_json')
        else if (fmt === 'jwt_vc' || fmt === 'jwt_json') requestedFormats.push('jwt_vc')
        else requestedFormats.push(fmt)
      } else {
        // No requested format: use jwt_vc_json as the default (most compatible)
        requestedFormats.push('jwt_vc_json')
      }

      for (const f of requestedFormats) {
        const cfgId = `${templateId}_${f}`
        credentialConfigurations.push(cfgId)
      }
    }

    // Pick the issuer that actually supports the offered credential configuration IDs.
    // We can have multiple issuer records (e.g., old ones with cleared metadata).
    let issuers = await (agent.modules as any).openId4VcIssuer.getAllIssuers()
    if (!issuers || issuers.length === 0) {
      throw new Error('No OpenID4VC Issuer configured')
    }

    const offeredSet = new Set(credentialConfigurations)

    let issuerWithMatchingSupported = issuers.find((i: any) => {
      const supported = (i?.credentialsSupported || []) as Array<{ id?: string }>
      return supported.some((s) => !!s?.id && offeredSet.has(s.id))
    })

    // If we can't find a matching issuer, try refreshing metadata from DB for this tenant.
    // This prevents common runtime failures when credential definition names and VC types differ
    // (e.g., FinancialStatementDef vs FinancialStatementCredential) or when models were seeded
    // after the issuer record was created.
    if (!issuerWithMatchingSupported && tenantId) {
      try {
        const definitions = credentialDefinitionStore.list(tenantId)

        const formats = ['jwt_vc', 'jwt_vc_json']
        const refreshedSupported = definitions.flatMap((def: any) => {
          const leafType = Array.isArray(def.credentialType) && def.credentialType.length
            ? def.credentialType[def.credentialType.length - 1]
            : def.name
          const idBases = Array.from(new Set([def.name, leafType].filter(Boolean)))

          return formats.flatMap((format) =>
            idBases.map((base) => ({
              id: `${base}_${format}`,
              format,
              types: def.credentialType || ['VerifiableCredential', base],
              cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
              cryptographic_suites_supported: ['EdDSA', 'ES256'],
              display: [{ name: base }],
            }))
          )
        })

        for (const i of issuers as any[]) {
          await (agent.modules as any).openId4VcIssuer.updateIssuerMetadata({
            issuerId: i.issuerId,
            credentialsSupported: refreshedSupported,
            display: i.display || [],
          })
        }

        issuers = await (agent.modules as any).openId4VcIssuer.getAllIssuers()
        issuerWithMatchingSupported = issuers.find((i: any) => {
          const supported = (i?.credentialsSupported || []) as Array<{ id?: string }>
          return supported.some((s) => !!s?.id && offeredSet.has(s.id))
        })
      } catch (e: any) {
        request.logger?.warn({ err: e.message, tenantId }, 'Failed to refresh issuer metadata')
      }
    }

    const issuerWithAnySupported = issuers.find((i: any) => (i?.credentialsSupported || []).length > 0)

    const issuerId =
      issuerWithMatchingSupported?.issuerId ||
      issuerWithAnySupported?.issuerId ||
      issuers[0].issuerId

    // Log inputs
    request.logger?.info({
      issuerId,
      credentialConfigurations,
      credentialsOriginal: body.credentials
    }, 'Calling createCredentialOffer')

    // Extract claims from the first credential template (if provided)
    const firstCred = body.credentials[0] as any
    const claims = firstCred?.claims || firstCred?.claimsTemplate?.credentialSubject || {}

    request.logger?.info({ module: 'issuer', operation: 'createOffer', claimsCount: Object.keys(claims).length, claimsKeys: Object.keys(claims) }, 'Extracted claims from body')
    console.log('[OidcIssuerController] Extracted claims:', JSON.stringify(claims))

    // Create offer using Credo Native Module
    // Note: ensure we cast to any if types aren't fully picked up yet
    const result = await (agent.modules as any).openId4VcIssuer.createCredentialOffer({
      issuerId,
      offeredCredentials: credentialConfigurations,
      preAuthorizedCodeFlowConfig: {
        userPinRequired: false
      },
      // Pass claims to issuance session so credentialRequestToCredentialMapper can access them
      issuanceMetadata: {
        claims: claims,
        tenantId: tenantId,
        credentialDefinitionId: body.credentials[0]?.credentialDefinitionId || credentialConfigurations[0]
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

    // === PUSH NOTIFICATION (WEBHOOK) ===
    // If OFFER_PUSH_URL is configured, push the offer URI to the holder immediately
    if (process.env.OFFER_PUSH_URL) {
      const pushUrl = process.env.OFFER_PUSH_URL
      const pushApiKey = process.env.OFFER_PUSH_API_KEY
      request.logger?.info({ pushUrl, offerId: issuanceSession.id }, 'Attempting to push offer to holder')

      // Fire and forget (don't block response)
      import('node-fetch').then(({ default: fetch }) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (pushApiKey) {
          headers['x-api-key'] = pushApiKey
        }

        fetch(pushUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ credential_offer_uri: offerUri })
        })
          .then(res => {
            if (res.ok) request.logger?.info({ status: res.status }, 'Push notification successful')
            else request.logger?.warn({ status: res.status, statusText: res.statusText }, 'Push notification failed')
          })
          .catch(err => {
            request.logger?.error({ error: err.message }, 'Push notification error')
          })
      })
    }


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
  public async revokeCredential(
    @Request() request: ExRequest,
    @Path() id: string,
    @Body() body?: { reason?: string }
  ): Promise<any> {
    try {
      // Credo generic credentials module does not support 'revocation' (ledger/status list) directly via this API yet.
      // We will perform a local delete to prevent further usage from this agent's perspective.
      const reason = body?.reason
      issuedCredentialRepository.revoke(id, reason)
      await request.agent.credentials.deleteById(id)
      return { id, revoked: true, status: 'deleted_locally', reason }
    } catch (e: any) {
      this.setStatus(500)
      throw new Error(`Failed to revoke/delete: ${e.message}`)
    }
  }

  /**
   * Get credential revocation status (Admin)
   */
  @Get('issuer/credentials/{id}/status')
  @Security('jwt', ['tenant'])
  public async getCredentialStatus(@Path() id: string): Promise<any> {
    const record = issuedCredentialRepository.findByCredentialId(id) || issuedCredentialRepository.findById(id)
    if (!record) {
      this.setStatus(404)
      throw new Error('credential not found')
    }

    return {
      id,
      revoked: record.revoked,
      revokedAt: record.revokedAt ? record.revokedAt.toISOString() : undefined,
      reason: record.revocationReason,
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

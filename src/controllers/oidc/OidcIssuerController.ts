import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type {
  CreateCredentialOfferRequest,
  CreateCredentialOfferResponse,
  TokenRequestBody,
  TokenResponseBody,
  IssuedCredentialRecord,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Agent, Key, KeyType, TypedArrayEncoder } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Get, Route, Tags, Body, SuccessResponse, Security, Path, Query, Request } from 'tsoa'
import { container } from 'tsyringe'

import { didStore } from '../../utils/didStore'
import { schemaStore } from '../../utils/schemaStore'
import { credentialOfferStore, issuedVcStore } from '../../utils/store'
import { credentialDefinitionStore } from '../../utils/credentialDefinitionStore'
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
    const expandedCredentials = body.credentials.map((template) => {
      if (!template.credentialDefinitionId) return template
      const def = credentialDefinitionStore.get(template.credentialDefinitionId)
      if (!def) {
        throw new Error(`credentialDefinitionId ${template.credentialDefinitionId} not found`)
      }
      return {
        type: template.type?.length ? template.type : def.credentialType,
        schemaId: template.schemaId ?? def.schemaId,
        claimsTemplate: template.claimsTemplate ?? def.claimsTemplate,
        format: template.format ?? def.format ?? 'jwt_vc',
        issuerDid: def.issuerDid,
      }
    })

    const offerId = randomUUID()
    const preAuthorizedCode = randomUUID()
    const expiresAt = new Date(Date.now() + (body.expiresIn || 10 * 60 * 1000)).toISOString()
    const issuerDidFromTemplate = expandedCredentials.find((c: any) => c.issuerDid)?.issuerDid
    const tenantId = (request.agent as TenantAgent<any> | undefined)?.context?.contextCorrelationId
    credentialOfferStore[preAuthorizedCode] = {
      offerId,
      preAuthorizedCode,
      credentials: expandedCredentials,
      issuerDid: body.issuerDid ?? issuerDidFromTemplate,
      expiresAt,
      tenantId,
    }
    const credential_offer_url = `http://localhost:3000/oidc/authorize?pre-authorized_code=${preAuthorizedCode}`
    request.logger?.info({ module: 'issuer', operation: 'createOffer', offerId }, 'Created credential offer')
    return { offerId, credential_offer_url, preAuthorizedCode, expiresAt }
  }

  /**
   * Token exchange for pre-authorized code -> issues VC (JWT or SD-JWT) - placeholder.
   */
  @Post('token')
  public async token(@Request() request: ExRequest, @Body() body: TokenRequestBody): Promise<TokenResponseBody> {
    if (body.grant_type !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      this.setStatus(400)
      throw new Error('unsupported grant_type')
    }
    const offer = credentialOfferStore[body.pre_authorized_code]
    if (!offer) {
      this.setStatus(400)
      throw new Error('invalid or expired pre_authorized_code')
    }
    if (new Date(offer.expiresAt).getTime() < Date.now()) {
      delete credentialOfferStore[body.pre_authorized_code]
      this.setStatus(400)
      throw new Error('code expired')
    }
    // Pick first credential template for now
    const credTmpl = offer.credentials[0]
    // Resolve issuer DID (if provided) for key reference
    const baseAgent = container.resolve(
      Agent as unknown as new (...args: any[]) => Agent<RestAgentModules | RestMultiTenantAgentModules>,
    )

    const issueWithAgent = async (agentForSigning: Agent | TenantAgent<RestAgentModules>): Promise<TokenResponseBody> => {
      let issuerDid = offer.issuerDid || 'did:example:issuer'
      let kid = 'mock-key'
      let signingKeyBase58: string | undefined
      let signingKeyType: KeyType | undefined
      
      request.logger?.info({ issuerDid, tenantId: offer.tenantId }, 'Starting credential issuance with DID')
      
      if (issuerDid && issuerDid !== 'did:example:issuer') {
        const rec = didStore.list().find((r) => r.did === issuerDid)
        if (rec) {
          kid = rec.keyRef
          issuerDid = rec.did
          signingKeyBase58 = rec.publicKeyBase58
          signingKeyType = rec.keyType === 'P-256' ? KeyType.P256 : KeyType.Ed25519
          request.logger?.info({ kid, issuerDid, hasPublicKey: !!signingKeyBase58 }, 'Found DID in didStore')
        } else {
          request.logger?.warn({ issuerDid, availableDids: didStore.list().map(d => d.did) }, 'DID not found in didStore')
        }
      }
      if (credTmpl?.schemaId && credTmpl?.claimsTemplate) {
        const { valid, errors } = schemaStore.validate(credTmpl.schemaId, credTmpl.claimsTemplate)
        if (!valid) {
          this.setStatus(400)
          throw new Error('claimsTemplate fails schema validation: ' + errors?.map((e) => e.message).join('; '))
        }
      }
      const vcId = randomUUID()
      const alg = signingKeyType === KeyType.P256 ? 'ES256' : 'EdDSA'
      const header = { alg, typ: 'JWT', kid }
      const now = Math.floor(Date.now() / 1000)
      const payload = {
        jti: vcId,
        iss: issuerDid,
        sub: body.subject_did,
        nbf: now,
        iat: now,
        vc: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', ...(credTmpl?.type || [])],
          credentialSubject: credTmpl?.claimsTemplate || { id: body.subject_did },
        },
      }
      let jwt: string
      try {
        // Use DID resolution to get the verification method - this works across sessions
        request.logger?.info({ issuerDid }, 'Resolving DID for signing')
        const resolvedDid = await agentForSigning.dids.resolve(issuerDid)
        request.logger?.info({ issuerDid, state: resolvedDid.didResolutionMetadata?.error || 'success' }, 'DID resolution result')
        
        if (!resolvedDid.didDocument?.verificationMethod?.length) {
          throw new Error(`No verification method found in resolved DID ${issuerDid}`)
        }
        
        const verificationMethod = resolvedDid.didDocument.verificationMethod[0]
        const publicKeyBase58 = verificationMethod.publicKeyBase58
        if (!publicKeyBase58) {
          throw new Error(`No publicKeyBase58 found in verification method for ${issuerDid}`)
        }
        
        request.logger?.debug({ publicKeyBase58: publicKeyBase58.slice(0, 20) + '...', kid: verificationMethod.id }, 'Found verification method')
        
        // Construct Key from the public key to identify which key to use for signing
        const keyType = signingKeyType || KeyType.Ed25519
        const key = Key.fromPublicKeyBase58(publicKeyBase58, keyType)
        
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
        const signingInput = `${encodedHeader}.${encodedPayload}`
        
        request.logger?.debug('Calling wallet.sign() with resolved key')
        const sig = await agentForSigning.context.wallet.sign({
          data: TypedArrayEncoder.fromString(signingInput),
          key,
        })
        const signatureB64Url = Buffer.from(sig).toString('base64url')
        jwt = `${signingInput}.${signatureB64Url}`
        request.logger?.info({ vcId }, 'Successfully signed credential')
      } catch (e) {
        request.logger?.error({ error: (e as Error).message, issuerDid, tenantId: offer.tenantId }, 'Failed to sign VC JWS')
        this.setStatus(500)
        throw new Error('failed to sign VC JWS: ' + (e as Error).message)
      }
      const record: IssuedCredentialRecord = {
        id: vcId,
        jwt,
        subject: body.subject_did,
        issuer: payload.iss,
        createdAt: new Date().toISOString(),
        revoked: false,
        schemaId: credTmpl?.schemaId,
      }
      issuedVcStore[vcId] = record
      request.logger?.info(
        { module: 'issuer', operation: 'issue', credentialId: vcId, issuerDid, subject: body.subject_did },
        'Issued credential',
      )
      return { verifiableCredential: jwt, credentialId: vcId }
    }

    let responsePayload: TokenResponseBody
    if (offer.tenantId && 'tenants' in (baseAgent.modules as any)) {
      const tenantAgent: TenantAgent<RestAgentModules> | undefined = await (baseAgent.modules as any).tenants.getTenantAgent({
        tenantId: offer.tenantId,
      })
      if (!tenantAgent) {
        this.setStatus(500)
        throw new Error(`tenant agent not found for tenantId ${offer.tenantId}`)
      }
      try {
        responsePayload = await issueWithAgent(tenantAgent)
      } finally {
        await tenantAgent.endSession()
      }
    } else {
      responsePayload = await issueWithAgent(baseAgent)
    }

    delete credentialOfferStore[body.pre_authorized_code]
    return responsePayload
  }

  /** Get issued credential metadata */
  @Get('issuer/credentials/{id}')
  @Security('jwt', ['tenant'])
  public async getCredential(@Path() id: string): Promise<any> {
    const rec = issuedVcStore[id]
    if (!rec) {
      this.setStatus(404)
      throw new Error('credential not found')
    }
    return rec
  }

  /** Revoke an issued credential (simple flag) */
  @Post('issuer/credentials/{id}/revoke')
  @Security('jwt', ['tenant'])
  public async revokeCredential(@Request() request: ExRequest, @Path() id: string): Promise<any> {
    const rec = issuedVcStore[id]
    if (!rec) {
      this.setStatus(404)
      throw new Error('credential not found')
    }
    if (rec.revoked) return { id, revoked: true }
    rec.revoked = true
    rec.revokedAt = new Date().toISOString()
    request.logger?.warn({ module: 'issuer', operation: 'revoke', credentialId: id }, 'Revoked credential')
    return { id, revoked: true }
  }

  /** List issued credentials with optional filtering */
  @Get('issuer/credentials')
  @Security('jwt', ['tenant'])
  public async listCredentials(@Query() subject?: string, @Query() issuer?: string): Promise<any[]> {
    return Object.values(issuedVcStore).filter((rec) => {
      if (subject && rec.subject !== subject) return false
      if (issuer && rec.issuer !== issuer) return false
      return true
    })
  }
}

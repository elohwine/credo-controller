// src/controllers/wallet/WalletController.ts
import { Controller, Post, Get, Route, Tags, Body, Request, Path, Query, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { injectable } from 'tsyringe'
import { getTenantById } from '../../persistence/TenantRepository'
import { getWalletCredentialsByWalletId, getWalletCredentialById, saveWalletCredential } from '../../persistence/WalletCredentialRepository'
import { Agent, W3cCredentialService, DifPresentationExchangeService, ClaimFormat } from '@credo-ts/core'
import { container } from 'tsyringe'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'
import { UnauthorizedError } from '../../errors/errors'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import * as jwt from 'jsonwebtoken'
import { SCOPES } from '../../enums'
import { issuerMetadataCache } from '../../utils/issuerMetadataCache'
import { OpenId4VcIssuerService } from '@credo-ts/openid4vc'

/**
 * Full WalletController with scoped fetch interception for local issuer well-known metadata.
 * Only minimal modifications applied to fix ECONNRESET / invalid fetch issues.
 */

interface WalletListingItem {
  id: string
  name: string
  createdOn: string
  addedOn: string
  permission: string
}
interface WalletListingsResponse {
  account: string
  wallets: WalletListingItem[]
}

/**
 * Scoped helper: temporarily override global fetch to return tenant-local issuer metadata
 * for the issuer's .well-known/openid-credential-issuer URL. Always restores original fetch.
 *
 * This wrapper:
 *  - intercepts only the well-known URL for the specific issuerOrigin
 *  - delegates other fetch calls to the original fetch or node-fetch
 *  - restores original fetch in finally
 */
async function withScopedIssuerFetch<T>(
  issuerOrigin: string,
  issuerMetadata: any,
  fn: () => Promise<T>
): Promise<T> {
  const globalAny = globalThis as any
  const originalFetch = globalAny.fetch

  // If there's no original fetch we will import node-fetch for delegation
  const nodeFetch = typeof originalFetch === 'function' ? originalFetch : (await import('node-fetch')).default

  // Install scoped wrapper
  globalAny.fetch = async (input: any, init?: any) => {
    let url: string
    if (typeof input === 'string') {
      url = input
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = input.url
    } else {
      url = String(input)
    }

    const wellKnown = `${issuerOrigin.replace(/\/+$/, '')}/.well-known/openid-credential-issuer`
    if (url.startsWith(wellKnown)) {
      // Return a minimal Response-like object
      return {
        ok: true,
        status: 200,
        json: async () => issuerMetadata,
        text: async () => JSON.stringify(issuerMetadata),
      } as any
    }
    // Delegate other requests to nodeFetch/originalFetch
    return nodeFetch(input, init)
  }

  try {
    return await fn()
  } finally {
    // Always restore previous fetch (or delete if none)
    try {
      if (originalFetch) {
        globalAny.fetch = originalFetch
      } else {
        delete globalAny.fetch
      }
    } catch (e) {
      // Best-effort restore; do not throw from finally
      console.warn('[withScopedIssuerFetch] failed to restore global fetch:', (e as any)?.message)
    }
  }
}

/**
 * Utility: extract and normalize an absolute offer URL from wrapper or raw values.
 */
function extractAndNormalizeInnerOfferUrl(wrapperOrUrl: string | undefined, maxDecode = 5): string | null {
  if (!wrapperOrUrl) return null
  let candidate = wrapperOrUrl

  if (candidate.startsWith('openid-credential-offer://')) {
    const q = candidate.split('?')[1] || ''
    const params = new URLSearchParams(q)
    const keys = ['credential_offer_uri', 'credential_offer_url', 'credential_offer', 'request']
    for (const k of keys) {
      if (params.has(k)) {
        candidate = params.get(k) || ''
        break
      }
    }
  }

  let s = candidate.trim()
  for (let i = 0; i < maxDecode; i++) {
    if (s.startsWith('http://') || s.startsWith('https://')) break
    try {
      const decoded = decodeURIComponent(s)
      if (decoded === s) break
      s = decoded
    } catch (e) {
      break
    }
  }

  if (!s.startsWith('http://') && !s.startsWith('https://')) return null

  try {
    const u = new URL(s)
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1'
    return u.toString()
  } catch (e) {
    return null
  }
}

@Route('api/wallet')
@Tags('WalletAPI')
@Security('jwt', [SCOPES.TENANT_AGENT])
@injectable()
export class WalletController extends Controller {
  private getAgent(request: ExRequest): Agent<RestMultiTenantAgentModules> {
    return request.agent as unknown as Agent<RestMultiTenantAgentModules>
  }

  private normalizeResponse(raw: any): any {
    if (typeof raw === 'object' && raw !== null) return raw
    if (typeof raw === 'string') {
      const s = raw.trim()
      try { return JSON.parse(s) } catch (e) {
        if (s.startsWith('http://') || s.startsWith('https://')) return { url: s }
        return { raw: s }
      }
    }
    return { raw: String(raw) }
  }

  private async getJwtSecret(): Promise<string> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
    const genericRecords = await baseAgent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    const secretKey = genericRecords[0]?.content.secretKey as string
    if (!secretKey) {
      throw new Error('JWT secret key not found')
    }
    return secretKey
  }

  @Get('accounts/wallets')
  public async getWallets(@Request() request: ExRequest): Promise<WalletListingsResponse> {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }
    const token = authHeader.substring(7)
    const secret = await this.getJwtSecret()
    try {
      const decoded = jwt.verify(token, secret) as any
      const user = getWalletUserByWalletId(decoded.walletId)
      if (!user) {
        throw new UnauthorizedError('User not found')
      }
      const wallet: WalletListingItem = {
        id: user.walletId,
        name: `${user.username}'s Wallet`,
        createdOn: user.createdAt,
        addedOn: user.createdAt,
        permission: 'owner'
      }
      return {
        account: user.username,
        wallets: [wallet]
      }
    } catch (error) {
      throw new UnauthorizedError('Invalid token')
    }
  }

  @Get('wallet/{walletId}/credentials')
  public async listCredentials(
    @Request() request: ExRequest,
    @Path() walletId: string
  ): Promise<any[]> {
    const agent = this.getAgent(request)
    try {
      const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
      const credentialRecords = await w3cCredentialService.getAllCredentialRecords(agent.context)
      return credentialRecords.map((record: any) => ({
        wallet: walletId,
        id: record.id,
        document: record.credential,
        disclosures: null,
        addedOn: record.createdAt || new Date().toISOString(),
        manifest: null,
        parsedDocument: null,
        format: 'jwt_vc'
      }))
    } catch (error: any) {
      this.setStatus(500)
      throw new Error(`Failed to fetch credentials from wallet: ${error.message}`)
    }
  }

  @Get('wallet/{walletId}/dids')
  public async getDids(
    @Request() request: ExRequest,
    @Path() walletId: string
  ): Promise<Array<{ did: string; default: boolean }>> {
    const agent = request.agent as unknown as Agent<RestMultiTenantAgentModules>
    try {
      const created = await agent.dids.getCreatedDids()
      return (created || []).map((r: any, idx: number) => ({ did: r.did, default: idx === 0 }))
    } catch (e) {
      this.setStatus(500)
      throw new Error('Failed to fetch DIDs')
    }
  }

  @Get('wallet/{walletId}/credentials/{credentialId}')
  public async getCredential(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Path() credentialId: string
  ): Promise<any> {
    const agent = this.getAgent(request)
    try {
      const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
      const record = await w3cCredentialService.getCredentialRecordById(agent.context, credentialId)
      if (!record) {
        this.setStatus(404)
        throw new Error('Credential not found')
      }
      return {
        wallet: walletId,
        id: record.id,
        document: record.credential,
        disclosures: null,
        addedOn: record.createdAt || new Date().toISOString(),
        manifest: null,
        parsedDocument: null,
        format: 'jwt_vc'
      }
    } catch (error: any) {
      if (error.message.includes('not found')) {
        this.setStatus(404)
        throw new Error('Credential not found')
      }
      this.setStatus(500)
      throw new Error(`Failed to fetch credential: ${error.message}`)
    }
  }

  @Post('wallet/{walletId}/exchange/resolveCredentialOffer')
  public async resolveCredentialOffer(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Body() body: any
  ): Promise<any> {
    console.log('[resolveCredentialOffer] === START (Credo OID4VC) ===')
    try {
      console.log('[resolveCredentialOffer] Input:', { walletId, bodyType: typeof body, body: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500) })
    } catch (e) {
      console.log('[resolveCredentialOffer] Input logging failed', (e as any)?.message)
    }

    // Optional diagnostic of global fetch
    try {
      console.log('[DEBUG_FETCH] typeof globalThis.fetch =', typeof (globalThis as any).fetch)
    } catch (e) {
      /* ignore */
    }

    // 1. Extract the offer URI
    let offerUri = ''
    if (typeof body === 'string') {
      offerUri = body
    } else if (body && typeof body === 'object') {
      offerUri = body.credential_offer_uri || body.credential_offer_url || body.request || ''
      if (!offerUri) {
        const keys = Object.keys(body)
        if (keys.length === 1) {
          const k = keys[0]
          if (k.startsWith('openid-credential-offer://') || typeof body[k] === 'string') {
            offerUri = k.startsWith('openid-credential-offer://') ? k : body[k]
          }
        }
      }
    }

    console.log('[resolveCredentialOffer] Parsed offerUri:', (offerUri || '').slice(0, 200))

    const toResolve = extractAndNormalizeInnerOfferUrl(offerUri) || ((offerUri && (offerUri.startsWith('http://') || offerUri.startsWith('https://'))) ? offerUri.replace(/localhost/g, '127.0.0.1') : null)

    if (!toResolve) {
      this.setStatus(400)
      throw new Error('No credential offer URL could be derived (ensure request contains credential_offer_uri)')
    }
    if (!offerUri) {
      this.setStatus(400)
      throw new Error('No credential offer URI provided')
    }

    // Use agent and attempt to pre-resolve issuer metadata from genericRecords
    const agent = this.getAgent(request)
    console.log('[resolveCredentialOffer] Using Credo agent to resolve offer')
    console.log('[resolveCredentialOffer] about to call holder.resolveCredentialOffer with toResolve:', toResolve)
    console.log('[resolveCredentialOffer] original wrapper offerUri:', offerUri)

    const issuerOrigin = (() => { try { return new URL(toResolve).origin } catch { return null } })()
    let issuerMetadata: any = undefined
    let valueBasedDeepLink: string | undefined = undefined

    if (issuerOrigin && (issuerOrigin.includes('127.0.0.1') || issuerOrigin.includes('localhost'))) {
      // Use in-memory cache instead of genericRecords (avoids query issues and HTTP loopback)
      const cached = issuerMetadataCache.get(issuerOrigin) || issuerMetadataCache.getLocalIssuer()
      if (cached?.metadata) {
        issuerMetadata = cached.metadata
        console.log('[resolveCredentialOffer] Using cached issuer metadata for', issuerOrigin)
      } else {
        console.warn('[resolveCredentialOffer] No cached issuer metadata for local origin', issuerOrigin)
      }

      // BYPASS LOOPBACK FOR OFFER FETCH:
      // Try to find the offer payload LOCALLY in the Issuer's DB to avoid HTTP fetch failure.
      const offerIdMatch = toResolve.match(/\/offers\/([a-fA-F0-9-]+)/)
      if (offerIdMatch) {
        const offerId = offerIdMatch[1]
        console.log('[resolveCredentialOffer] Detected local offer ID:', offerId)
        try {
          // Access the Base Agent (where Issuer Module lives)
          const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

          // Resolve the Issuer Service
          const issuerService = baseAgent.dependencyManager.resolve(OpenId4VcIssuerService)

          // Fetch session
          const session = await issuerService.getIssuanceSessionById(baseAgent.context, offerId)
          if (session && session.credentialOfferPayload) {
            console.log('[resolveCredentialOffer] FOUND local offer payload! Constructing Value-Based Deep Link.')
            valueBasedDeepLink = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(session.credentialOfferPayload))}`
          }
        } catch (localLookupError: any) {
          console.warn('[resolveCredentialOffer] Local offer lookup failed:', localLookupError.message)
        }
      }
    }

    try {
      let resolved: any
      // If we have local issuer metadata and issuerOrigin, use a scoped fetch override
      if (issuerOrigin && issuerMetadata) {
        resolved = await withScopedIssuerFetch(issuerOrigin, issuerMetadata, async () => {
          // Use Value-Based Link if available (Zero-Fetch), otherwise fallback to HTTP URI
          const input = valueBasedDeepLink || toResolve
          console.log('[resolveCredentialOffer] resolving:', input.slice(0, 100) + '...')
          return await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(input)
        })
      } else {
        // Default path: let holder fetch metadata as usual
        try {
          resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(toResolve)
        } catch (e: any) {
          console.warn('[resolveCredentialOffer] Failed resolving inner URL, error:', e?.message?.slice?.(0, 200))
          // Retry fallback to original wrapper form
          try {
            console.log('[resolveCredentialOffer] Retrying resolve with original wrapper offerUri:', offerUri)
            resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(offerUri)
          } catch (e2: any) {
            console.error('[resolveCredentialOffer] Retry also failed:', (e2 as any)?.message)
            throw e2
          }
        }
      }

      console.log('[resolveCredentialOffer] Credo resolved offer:', {
        issuer: resolved.metadata?.credentialIssuer?.credential_issuer,
        offeredCredentials: resolved.offeredCredentials?.length
      })

      const response = {
        credential_issuer: resolved.metadata?.credentialIssuer?.credential_issuer,
        credential_configuration_ids: resolved.offeredCredentialConfigurations ? Object.keys(resolved.offeredCredentialConfigurations) : [],
        credentials: resolved.offeredCredentials,
        grants: resolved.credentialOfferPayload?.grants,
        _credoResolved: resolved
      }

      console.log('[resolveCredentialOffer] === SUCCESS (Credo) ===')
      return response
    } catch (error: any) {
      console.error('[resolveCredentialOffer] === FAILED ===')
      console.error('[resolveCredentialOffer] Credo error:', (error && error.message) || error)
      this.setStatus(500)
      throw new Error(`Failed to resolve offer: ${(error && error.message) || error}`)
    }
  }

  @Get('wallet/{walletId}/exchange/resolveIssuerOpenIDMetadata')
  public async resolveIssuerOpenIDMetadata(
    @Path() walletId: string,
    @Query() issuer: string
  ): Promise<any> {
    const metadataUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-credential-issuer`
    try {
      // Use explicit node-fetch to avoid surprises with global fetch
      const { default: nodeFetch } = await import('node-fetch')
      const response = await nodeFetch(metadataUrl)
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
      }
      return await response.json()
    } catch (error: any) {
      this.setStatus(400)
      throw new Error(`Failed to fetch issuer metadata: ${error.message}`)
    }
  }

  @Post('wallet/{walletId}/exchange/useOfferRequest')
  public async useOfferRequest(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Query() did: string,
    @Body() body: any
  ): Promise<any> {
    console.log('[useOfferRequest] === START (Credo OID4VC) ===')
    try { console.log('[useOfferRequest] Input:', { walletId, did, bodyType: typeof body }) } catch (e) { }

    let offerUri = ''
    if (typeof body === 'string') {
      offerUri = body
    } else if (body && typeof body === 'object') {
      offerUri = body.credential_offer_uri || body.credential_offer_url || body.request || ''
      if (!offerUri) {
        const keys = Object.keys(body)
        if (keys.length === 1) {
          const k = keys[0]
          offerUri = k.startsWith('openid-credential-offer://') ? k : (body[k] || '')
        }
      }
    }

    console.log('[useOfferRequest] Parsed offerUri:', (offerUri || '').slice(0, 200))

    const toResolve2 = extractAndNormalizeInnerOfferUrl(offerUri) || ((offerUri && (offerUri.startsWith('http://') || offerUri.startsWith('https://'))) ? offerUri.replace(/localhost/g, '127.0.0.1') : null)

    if (!toResolve2) {
      this.setStatus(400)
      throw new Error('No credential offer URL could be derived (ensure request contains credential_offer_uri)')
    }
    if (!offerUri) {
      this.setStatus(400)
      throw new Error('No credential offer URI provided')
    }

    const agent = this.getAgent(request)
    console.log('[useOfferRequest] Resolving offer with Credo...')
    console.log('[useOfferRequest] about to call holder.resolveCredentialOffer with toResolve2:', toResolve2)
    console.log('[useOfferRequest] original wrapper offerUri:', offerUri)

    const issuerOrigin2 = (() => { try { return new URL(toResolve2).origin } catch { return null } })()
    let issuerMetadata2: any = undefined
    if (issuerOrigin2 && (issuerOrigin2.includes('127.0.0.1') || issuerOrigin2.includes('localhost'))) {
      try {
        const issuerRecords = await agent.genericRecords.findAllByQuery({ tenantId: walletId, type: 'issuer' })
        if (issuerRecords && issuerRecords.length > 0) {
          const issuerRec = (issuerRecords[0] as any).content || {}
          issuerMetadata2 = issuerRec.metadata || issuerRec?.metadata?.issuer || issuerRec
          if (issuerMetadata2) {
            console.log('[useOfferRequest] Local issuer metadata available for', issuerOrigin2)
          }
        }
      } catch (e) {
        console.warn('[useOfferRequest] Could not load local issuer metadata:', (e as any)?.message)
      }
    }

    try {
      let resolved: any
      if (issuerOrigin2 && issuerMetadata2) {
        resolved = await withScopedIssuerFetch(issuerOrigin2, issuerMetadata2, async () => {
          return await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(toResolve2)
        })
      } else {
        try {
          resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(toResolve2)
        } catch (e: any) {
          console.warn('[useOfferRequest] Failed resolving inner URL, error:', e?.message?.slice?.(0, 200))
          try {
            console.log('[useOfferRequest] Retrying resolve with original wrapper offerUri:', offerUri)
            resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(offerUri)
          } catch (e2: any) {
            console.error('[useOfferRequest] Retry also failed:', e2?.message)
            throw e2
          }
        }
      }

      console.log('[useOfferRequest] Offer resolved, accepting...')
      const acceptResult = await (agent.modules as any).openId4VcHolder.acceptCredentialOffer({
        credentialOffer: resolved.credentialOffer,
        credentialBindingResolver: async ({ credentialFormat, supportedDidMethods, keyType }: any) => {
          console.log('[useOfferRequest] Credential binding resolver called:', { credentialFormat, supportedDidMethods, keyType })
          return { method: 'did', didUrl: did }
        }
      })

      console.log('[useOfferRequest] Credo accept result:', {
        credentialCount: acceptResult.credentials?.length,
        format: acceptResult.credentials?.[0]?.format
      })

      const { randomUUID } = await import('crypto')
      let savedCredentialId = ''
      let verifiableCredential = ''

      for (const credentialRecord of acceptResult.credentials || []) {
        const credentialId = randomUUID()
        savedCredentialId = credentialId
        let credentialData: any = {}
        let vcType = 'VerifiableCredential'
        let issuerDid = ''

        if (credentialRecord.format === 'jwt_vc_json' || credentialRecord.format === 'jwt_vc') {
          const jwtToken = credentialRecord.credential
          verifiableCredential = jwtToken
          try {
            const parts = jwtToken.split('.')
            if (parts.length === 3) {
              credentialData = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
              const types = credentialData?.vc?.type || []
              vcType = types.find((t: string) => t !== 'VerifiableCredential') || types[0] || 'VerifiableCredential'
              issuerDid = credentialData?.iss || ''
            }
          } catch (e) {
            console.warn('[useOfferRequest] Could not decode JWT:', e)
          }

          await saveWalletCredential({
            id: credentialId,
            walletId,
            credentialId,
            type: vcType,
            format: 'jwt_vc',
            credentialData: JSON.stringify({ jwt: jwtToken, ...credentialData }),
            issuerDid: issuerDid || resolved.metadata?.credentialIssuer?.credential_issuer || '',
          })
        } else if (credentialRecord.format === 'vc+sd-jwt') {
          verifiableCredential = credentialRecord.credential
          await saveWalletCredential({
            id: credentialId,
            walletId,
            credentialId,
            type: 'SD-JWT',
            format: 'sd_jwt_vc',
            credentialData: JSON.stringify({ sdJwt: credentialRecord.credential }),
            issuerDid: resolved.metadata?.credentialIssuer?.credential_issuer || '',
          })
        } else {
          verifiableCredential = JSON.stringify(credentialRecord.credential)
          await saveWalletCredential({
            id: credentialId,
            walletId,
            credentialId,
            type: credentialRecord.credential?.type?.[1] || 'VerifiableCredential',
            format: credentialRecord.format || 'ldp_vc',
            credentialData: JSON.stringify(credentialRecord.credential),
            issuerDid: credentialRecord.credential?.issuer?.id || credentialRecord.credential?.issuer || '',
          })
        }

        console.log('[useOfferRequest] Saved credential:', credentialId)
      }

      console.log('[useOfferRequest] === SUCCESS (Credo) ===')
      return {
        id: savedCredentialId,
        verifiableCredential,
        credentialCount: acceptResult.credentials?.length || 0
      }
    } catch (error: any) {
      console.error('[useOfferRequest] === FAILED ===')
      console.error('[useOfferRequest] Credo error:', (error && error.message) || error)
      this.setStatus(500)
      throw new Error(`Issuance failed: ${(error && error.message) || error}`)
    }
  }

  @Post('wallet/{walletId}/exchange/resolvePresentationRequest')
  public async resolvePresentationRequest(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Body() body: any
  ): Promise<string> {
    console.log('[resolvePresentationRequest] Input body:', typeof body === 'string' ? body : JSON.stringify(body))
    let requestUri = ''
    if (typeof body === 'string') {
      requestUri = body
    } else if (body && typeof body === 'object') {
      requestUri = body.request || body.presentationRequest || ''
      if (!requestUri) {
        const keys = Object.keys(body)
        if (keys.length === 1 && keys[0].includes('://')) {
          requestUri = keys[0]
        }
      }
    }

    if (!requestUri) {
      if (typeof body === 'object' && Object.keys(body).length > 0) {
        const attempt = Object.keys(body)[0]
        if (attempt.startsWith('openid4vp:') || attempt.startsWith('eudi-openid4vp:') || attempt.includes('://')) {
          requestUri = attempt
        }
      }
    }

    if (!requestUri) {
      this.setStatus(400)
      throw new Error('No presentation request URI provided')
    }

    try {
      const agent = this.getAgent(request)
      return requestUri
    } catch (e: any) {
      this.setStatus(400)
      throw new Error(`Invalid presentation request: ${e.message}`)
    }
  }

  @Post('wallet/{walletId}/exchange/matchCredentialsForPresentationDefinition')
  public async matchCredentialsForPresentationDefinition(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Body() body: any
  ): Promise<any[]> {
    const agent = this.getAgent(request)
    const presentationDefinition = typeof body === 'string' ? JSON.parse(body) : body
    try {
      const difPexService = agent.dependencyManager.resolve(DifPresentationExchangeService)
      const credentialsForRequest = await difPexService.getCredentialsForRequest(agent.context, presentationDefinition)

      const matchedCredentials: any[] = []
      for (const requirement of credentialsForRequest.requirements) {
        for (const submissionEntry of requirement.submissionEntry) {
          for (const verifiableCredential of submissionEntry.verifiableCredentials) {
            const credRecord = verifiableCredential.credentialRecord
            const vcAny = verifiableCredential as any

            if ('claimFormat' in verifiableCredential && verifiableCredential.claimFormat === ClaimFormat.SdJwtVc) {
              const sdJwtRecord = credRecord as any
              matchedCredentials.push({
                id: sdJwtRecord.id,
                document: sdJwtRecord.compactSdJwtVc || sdJwtRecord.credential,
                parsedDocument: JSON.stringify(vcAny.disclosedPayload || {}),
                disclosures: vcAny.disclosedPayload || null
              })
            } else if ('credential' in credRecord) {
              matchedCredentials.push({
                id: credRecord.id,
                document: (credRecord as any).credential,
                parsedDocument: null,
                disclosures: null
              })
            } else {
              matchedCredentials.push({
                id: credRecord.id,
                document: JSON.stringify(credRecord),
                parsedDocument: null,
                disclosures: null
              })
            }
          }
        }
      }

      return matchedCredentials
    } catch (error: any) {
      request.logger?.error({ error: error.message, walletId }, 'PEX credential matching failed')
      return []
    }
  }

  @Post('wallet/{walletId}/exchange/usePresentationRequest')
  public async usePresentationRequest(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Body() body: any
  ): Promise<any> {
    console.log('[usePresentationRequest] Body:', JSON.stringify(body))
    const { presentationRequest, selectedCredentials } = body
    if (!presentationRequest || !selectedCredentials || !Array.isArray(selectedCredentials) || selectedCredentials.length === 0) {
      this.setStatus(400)
      throw new Error('Missing presentationRequest or selectedCredentials')
    }
    const agent = this.getAgent(request)
    try {
      console.log('[usePresentationRequest] Resolving request for submission...')
      const resolved = await (agent.modules as any).openId4VcHolder.resolveOpenId4VpAuthorizationRequest(presentationRequest)

      console.log('[usePresentationRequest] Accepting request...')
      const inputDescriptors = resolved.authorizationRequest.presentationDefinition?.inputDescriptors || []
      const submissionInput: Record<string, string> = {}
      if (inputDescriptors.length > 0) {
        const credId = selectedCredentials[0]
        inputDescriptors.forEach((d: any) => { submissionInput[d.id] = credId })
      }

      console.log('[usePresentationRequest] Submission Input:', submissionInput)
      const response = await (agent.modules as any).openId4VcHolder.acceptOpenId4VpAuthorizationRequest({
        authorizationRequest: resolved.authorizationRequest,
        submissionInput
      })

      console.log('[usePresentationRequest] Success. Redirect URI:', response.redirectUri)
      return { redirectUri: response.redirectUri }
    } catch (error: any) {
      console.error('[usePresentationRequest] Error:', error.message)
      this.setStatus(500)
      throw new Error(`Presentation failed: ${error.message}`)
    }
  }
}

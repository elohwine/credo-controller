// src/controllers/wallet/WalletController.ts
import { Controller, Post, Get, Route, Tags, Body, Request, Path, Query, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { injectable } from 'tsyringe'
import { getTenantById } from '../../persistence/TenantRepository'
import { getWalletCredentialsByWalletId, getWalletCredentialById, saveWalletCredential } from '../../persistence/WalletCredentialRepository'
import { Agent, W3cCredentialService, DifPresentationExchangeService, ClaimFormat, JsonTransformer, KeyType } from '@credo-ts/core'
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

  if (candidate.startsWith('openid-credential-offer://') || candidate.startsWith('openid-initiate-issuance://')) {
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
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') u.hostname = 'api'
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
  private ensureWalletAccess(request: ExRequest, walletId: string): void {
    const tokenTenantId = (request as any).user?.tenantId as string | undefined
    if (tokenTenantId && tokenTenantId !== walletId) {
      this.setStatus(403)
      throw new UnauthorizedError('Wallet access denied')
    }
  }
  private getAgent(request: ExRequest): Agent<RestMultiTenantAgentModules> {
    return request.agent as unknown as Agent<RestMultiTenantAgentModules>
  }

  /**
   * Get the base agent (not tenant agent) for OID4VC holder operations.
   * The openId4VcHolder module is registered on the base agent, not on tenant agents.
   * Tenant agents don't have direct access to these modules.
   */
  private getBaseAgentForHolder(): Agent<RestMultiTenantAgentModules> {
    return container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
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
    let token: string | undefined

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } else {
      // Try to read from cookie named `auth.token` (HttpOnly cookie set by UI)
      const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined
      if (cookieHeader) {
        const parts = cookieHeader.split(';')
        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          const eqIndex = trimmed.indexOf('=')
          if (eqIndex === -1) continue
          const key = trimmed.slice(0, eqIndex).trim()
          if (key !== 'auth.token') continue
          const rawValue = trimmed.slice(eqIndex + 1)
          try {
            token = decodeURIComponent(rawValue)
          } catch {
            token = rawValue
          }
          break
        }
      }
    }
    if (!token) {
      throw new UnauthorizedError('No token provided')
    }
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

  @Get('{walletId}/credentials')
  @Security('apiKey')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listCredentials(
    @Request() request: ExRequest,
    @Path() walletId: string
  ): Promise<any[]> {
    this.ensureWalletAccess(request, walletId)
    // Read from TENANT's Credo wallet (Askar) - credentials are stored per-tenant
    const agent = this.getAgent(request)
    try {
      const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
      const credentialRecords = await w3cCredentialService.getAllCredentialRecords(agent.context)
      console.log('[listCredentials] Found credentials in tenant wallet:', credentialRecords.length, 'for wallet:', walletId)

      return credentialRecords.map((record: any) => {
        // Extract credential type from the credential
        let credentialType = 'VerifiableCredential'
        let issuerDid = ''

        // Get the credential object - Credo stores it in record.credential
        const cred = record.credential

        if (cred) {
          const types = cred.type || []
          credentialType = types.find((t: string) => t !== 'VerifiableCredential') || types[0] || 'VerifiableCredential'
          issuerDid = typeof cred.issuer === 'string'
            ? cred.issuer
            : cred.issuer?.id || ''
        }

        // Build a normalized credential structure for the UI
        // Credo W3cCredential has: context, type, credentialSubject, issuer, issuanceDate, etc.
        // The credentialSubject may have claims nested under a 'claims' property
        const credentialSubject = cred?.credentialSubject || {}
        const flatClaims = credentialSubject.claims && typeof credentialSubject.claims === 'object'
          ? { ...credentialSubject, ...credentialSubject.claims }
          : credentialSubject

        // Create a normalized parsedDocument for UI consumption
        const normalizedCred = {
          '@context': cred?.context || cred?.['@context'] || ['https://www.w3.org/2018/credentials/v1'],
          type: cred?.type || ['VerifiableCredential'],
          credentialSubject: flatClaims,
          issuer: cred?.issuer,
          issuanceDate: cred?.issuanceDate,
          expirationDate: cred?.expirationDate,
        }

        console.log('[listCredentials] Credential:', record.id, 'type:', credentialType, 'subject:', JSON.stringify(flatClaims).slice(0, 200))

        return {
          wallet: walletId,
          id: record.id,
          document: cred,
          disclosures: null,
          addedOn: record.createdAt || new Date().toISOString(),
          manifest: null,
          parsedDocument: normalizedCred,
          format: cred?.claimFormat || 'jwt_vc',
          type: credentialType,
          issuerDid
        }
      })
    } catch (error: any) {
      console.error('[listCredentials] Error:', error.message)
      this.setStatus(500)
      throw new Error(`Failed to fetch credentials from wallet: ${error.message}`)
    }
  }

  /**
   * Paginated credential listing with filters for embedded wallet.
   */
  @Get('{walletId}/credentials/list')
  public async listCredentialsPaged(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Query() limit = 20,
    @Query() cursor?: string,
    @Query() type?: string
  ): Promise<{ items: any[]; nextCursor?: string }> {
    this.ensureWalletAccess(request, walletId)
    const agent = this.getAgent(request)
    const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
    const credentialRecords = await w3cCredentialService.getAllCredentialRecords(agent.context)

    const filtered = type
      ? credentialRecords.filter((record: any) => (record.credential?.type || []).includes(type))
      : credentialRecords

    const offset = cursor ? Math.max(parseInt(cursor, 10) || 0, 0) : 0
    const safeLimit = Math.min(Math.max(limit || 20, 1), 100)
    const page = filtered.slice(offset, offset + safeLimit)
    const nextCursor = offset + safeLimit < filtered.length ? String(offset + safeLimit) : undefined

    const items = page.map((record: any) => {
      const cred = record.credential
      const credentialSubject = (cred as any)?.credentialSubject || {}
      const subjectClaims = (credentialSubject as any)?.claims
      const flatClaims = subjectClaims && typeof subjectClaims === 'object'
        ? { ...credentialSubject, ...subjectClaims }
        : credentialSubject
      const types = cred?.type || []
      const credentialType = types.find((t: string) => t !== 'VerifiableCredential') || types[0] || 'VerifiableCredential'

      return {
        vc_id: record.id,
        vc_type: credentialType,
        issued_at: cred?.issuanceDate || record.createdAt || new Date().toISOString(),
        amount: flatClaims.amount,
        currency: flatClaims.currency,
        status: flatClaims.status || 'ACTIVE',
        thumb: flatClaims.transactionId || flatClaims.invoiceId || flatClaims.receiptId || credentialType,
        parsedDocument: {
          '@context': (cred as any)?.context || (cred as any)?.['@context'] || ['https://www.w3.org/2018/credentials/v1'],
          type: cred?.type || ['VerifiableCredential'],
          credentialSubject: flatClaims,
          issuer: cred?.issuer,
          issuanceDate: cred?.issuanceDate,
          expirationDate: cred?.expirationDate,
        }
      }
    })

    return { items, nextCursor }
  }

  /**
   * Return full credential details by ID for the wallet UI.
   */
  @Get('{walletId}/credentials/detail/{credentialId}')
  public async getCredentialDetail(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Path() credentialId: string
  ): Promise<any> {
    this.ensureWalletAccess(request, walletId)
    const agent = this.getAgent(request)
    const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
    const credentialRecords = await w3cCredentialService.getAllCredentialRecords(agent.context)
    const record = credentialRecords.find((r: any) => r.id === credentialId)

    if (!record) {
      this.setStatus(404)
      throw new Error('Credential not found')
    }

    const cred = record.credential
    const credentialSubject = (cred as any)?.credentialSubject || {}
    const subjectClaims = (credentialSubject as any)?.claims
    const flatClaims = subjectClaims && typeof subjectClaims === 'object'
      ? { ...credentialSubject, ...subjectClaims }
      : credentialSubject

    return {
      vc_id: record.id,
      vc_type: (cred?.type || []).find((t: string) => t !== 'VerifiableCredential') || 'VerifiableCredential',
      issued_at: cred?.issuanceDate || record.createdAt || new Date().toISOString(),
      payload: {
        '@context': (cred as any)?.context || (cred as any)?.['@context'] || ['https://www.w3.org/2018/credentials/v1'],
        type: cred?.type || ['VerifiableCredential'],
        credentialSubject: flatClaims,
        issuer: cred?.issuer,
        issuanceDate: cred?.issuanceDate,
        expirationDate: cred?.expirationDate,
        proof: (cred as any)?.proof,
      }
    }
  }

  /**
   * Check if holder already has a specific credential type
   */
  @Get('{walletId}/credentials/exists/{credentialType}')
  public async hasCredentialOfType(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Path() credentialType: string
  ): Promise<{ exists: boolean; count: number; credentials: any[] }> {
    // Check in TENANT's Credo wallet
    const agent = this.getAgent(request)
    try {
      const w3cCredentialService = agent.dependencyManager.resolve(W3cCredentialService)
      const allRecords = await w3cCredentialService.getAllCredentialRecords(agent.context)

      const matchingCredentials = allRecords.filter((record: any) => {
        const types = record.credential?.type || []
        return types.includes(credentialType)
      })

      console.log(`[hasCredentialOfType] Checking for '${credentialType}' in tenant wallet: found ${matchingCredentials.length}`)

      return {
        exists: matchingCredentials.length > 0,
        count: matchingCredentials.length,
        credentials: matchingCredentials.map((r: any) => ({
          id: r.id,
          types: r.credential?.type,
          issuer: r.credential?.issuer,
          issuanceDate: r.credential?.issuanceDate
        }))
      }
    } catch (error: any) {
      console.error('[hasCredentialOfType] Error:', error.message)
      return { exists: false, count: 0, credentials: [] }
    }
  }

  @Get('{walletId}/dids')
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

  @Get('{walletId}/credentials/{credentialId}')
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

  @Post('{walletId}/exchange/resolveCredentialOffer')
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
    console.log('[resolveCredentialOffer] Extracting inner URL from:', offerUri)

    let toResolve = null
    try {
      toResolve = extractAndNormalizeInnerOfferUrl(offerUri)
      console.log('[resolveCredentialOffer] extracted result:', toResolve)
    } catch (e) {
      console.log('[resolveCredentialOffer] extraction failed:', e)
    }

    // Fallback for direct HTTP
    if (!toResolve && offerUri && (offerUri.startsWith('http://') || offerUri.startsWith('https://'))) {
      toResolve = offerUri
      console.log('[resolveCredentialOffer] fallback http used:', toResolve)
    }

    if (!toResolve) {
      console.error('[resolveCredentialOffer] No credential offer URL could be derived. offerUri was:', offerUri)
      this.setStatus(400)
      throw new Error('No credential offer URL could be derived (ensure request contains credential_offer_uri)')
    }
    if (!offerUri) {
      this.setStatus(400)
      throw new Error('No credential offer URI provided')
    }

    // Construct proper openid-credential-offer:// format for Credo
    // Credo expects: openid-credential-offer://?credential_offer_uri=<url>
    const credoOfferUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(toResolve)}`
    console.log('[resolveCredentialOffer] Constructed Credo format:', credoOfferUri.slice(0, 150))

    // Use BASE agent (not tenant agent) for OID4VC holder operations
    // The openId4VcHolder module is registered on the base agent only
    const agent = this.getBaseAgentForHolder()
    console.log('[resolveCredentialOffer] Using BASE Credo agent to resolve offer')
    console.log('[resolveCredentialOffer] about to call holder.resolveCredentialOffer with toResolve:', toResolve)
    console.log('[resolveCredentialOffer] original wrapper offerUri:', offerUri)

    const issuerOrigin = (() => { try { return new URL(toResolve).origin } catch { return null } })()
    let issuerMetadata: any = undefined
    let valueBasedDeepLink: string | undefined = undefined

    try {
      let resolved: any
      // If we have local issuer metadata and issuerOrigin, use a scoped fetch override
      if (issuerOrigin && issuerMetadata) {
        resolved = await withScopedIssuerFetch(issuerOrigin, issuerMetadata, async () => {
          // Use Value-Based Link if available (Zero-Fetch), otherwise fallback to HTTP URI
          const input = valueBasedDeepLink || credoOfferUri
          console.log('[resolveCredentialOffer] resolving (scoped):', input.slice(0, 100) + '...')
          return await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(input)
        })
      } else {
        // Default path: let holder fetch metadata as usual
        // STRATEGY: Try the FULL WRAPPER first (usually works best with Credo), 
        // then fallback to the inner HTTP URL.
        try {
          console.log('[resolveCredentialOffer] Attempt 1 (Full Wrapper):', credoOfferUri.slice(0, 100) + '...')
          resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(credoOfferUri)
        } catch (e: any) {
          console.warn('[resolveCredentialOffer] Full Wrapper failed, trying direct HTTP URL...')
          try {
            resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(toResolve)
          } catch (e2: any) {
            console.error('[resolveCredentialOffer] Both attempts failed:', (e2 as any)?.message)
            throw e2
          }
        }
      }

      console.log('[resolveCredentialOffer] Credo resolved offer:', {
        issuer: resolved.metadata?.credentialIssuer?.credential_issuer,
        offeredCredentials: resolved.offeredCredentials?.length
      })

      // Extract credential_issuer with multiple fallbacks
      let credentialIssuerUrl = resolved.metadata?.credentialIssuer?.credential_issuer
        || resolved.credentialOfferPayload?.credential_issuer
        || issuerOrigin // Fallback to the origin we extracted from the offer URL

      console.log('[resolveCredentialOffer] credential_issuer:', credentialIssuerUrl)

      const response = {
        credential_issuer: credentialIssuerUrl,
        credential_configuration_ids: resolved.offeredCredentialConfigurations ? Object.keys(resolved.offeredCredentialConfigurations) : [],
        credentials: resolved.offeredCredentials,
        grants: resolved.credentialOfferPayload?.grants,
        _credoResolved: JsonTransformer.toJSON(resolved)
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

  @Get('{walletId}/exchange/resolveIssuerOpenIDMetadata')
  public async resolveIssuerOpenIDMetadata(
    @Path() walletId: string,
    @Query() issuer: string
  ): Promise<any> {
    // Validate that issuer is present and is an absolute URL
    if (!issuer || typeof issuer !== 'string') {
      this.setStatus(400)
      throw new Error('Missing required "issuer" query parameter')
    }

    // Normalize localhost and 127.0.0.1 to api (internal container hostname)
    let normalizedIssuer = issuer.replace(/localhost/g, 'api').replace(/127.0.0.1/g, 'api').replace(/\/+$/, '')

    // Ensure it's an absolute URL
    if (!normalizedIssuer.startsWith('http://') && !normalizedIssuer.startsWith('https://')) {
      this.setStatus(400)
      throw new Error(`Issuer must be an absolute URL (got: "${issuer}")`)
    }

    const metadataUrl = `${normalizedIssuer}/.well-known/openid-credential-issuer`
    console.log('[resolveIssuerOpenIDMetadata] Fetching metadata from:', metadataUrl)

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

  @Post('{walletId}/exchange/useOfferRequest')
  @Security('apiKey')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async useOfferRequest(
    @Request() request: ExRequest,
    @Path() walletId: string,
    @Query() did?: string,  // Optional - we use base agent's DID for OID4VC operations
    @Body() body?: any
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

    const toResolve2 = extractAndNormalizeInnerOfferUrl(offerUri) || ((offerUri && (offerUri.startsWith('http://') || offerUri.startsWith('https://'))) ? offerUri : null)

    if (!toResolve2) {
      this.setStatus(400)
      throw new Error('No credential offer URL could be derived (ensure request contains credential_offer_uri)')
    }
    if (!offerUri) {
      this.setStatus(400)
      throw new Error('No credential offer URI provided')
    }

    // Use BASE agent (not tenant agent) for OID4VC holder operations
    // The openId4VcHolder module is registered on the base agent only
    const agent = this.getBaseAgentForHolder()
    console.log('[useOfferRequest] Resolving offer with BASE Credo agent...')
    console.log('[useOfferRequest] about to call holder.resolveCredentialOffer with toResolve2:', toResolve2)
    console.log('[useOfferRequest] original wrapper offerUri:', offerUri)

    try {
      let resolved: any

      // OPTIMIZATION: If the client already resolved the offer (e.g. to show a review screen),
      // they can pass the raw resolved object back to avoid a second network fetch to the Issuer.
      // Most Issuer OID4VCI implementations only allow the offer sequence to be fetched once.
      if (body?._credoResolved) {
        console.log('[useOfferRequest] Using pre-resolved offer content from request body')
        resolved = body._credoResolved
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

      const resolvedIssuer = (resolved as any)?.credentialIssuerMetadata
      const resolvedAuthServer = (resolved as any)?.authorizationServerMetadata
      if (resolvedIssuer || resolvedAuthServer) {
        console.log('[useOfferRequest] Resolved issuer metadata endpoints:', {
          credential_issuer: resolvedIssuer?.credential_issuer,
          token_endpoint: resolvedIssuer?.token_endpoint,
          credential_endpoint: resolvedIssuer?.credential_endpoint,
        })
        console.log('[useOfferRequest] Resolved auth server endpoints:', {
          issuer: resolvedAuthServer?.issuer,
          token_endpoint: resolvedAuthServer?.token_endpoint,
        })
      }

      console.log('[useOfferRequest] Offer resolved, accepting using pre-authorized code flow...')

      // Important: The openId4VcHolder module is on the BASE agent, so we must use
      // a DID that exists in the BASE agent's wallet (not the tenant wallet).
      // Get or create a DID in the base agent for holder operations.
      let baseAgentDids = await agent.dids.getCreatedDids({ method: 'key' })
      let holderDid: string

      if (baseAgentDids.length === 0) {
        console.log('[useOfferRequest] No DID in base agent, creating one...')
        try {
          const createdDid = await agent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
          holderDid = createdDid.didState.did as string
          console.log('[useOfferRequest] Created DID in base agent:', holderDid)
        } catch (didError: any) {
          console.error('[useOfferRequest] DID creation error:', didError.message)
          console.error('[useOfferRequest] DID creation stack:', didError.stack)
          throw didError
        }
      } else {
        holderDid = baseAgentDids[0].did
        console.log('[useOfferRequest] Using existing DID from base agent:', holderDid)
      }

      // For did:key, we need to add the fragment (key reference) to the DID.
      // The fragment is the same as the method-specific identifier for did:key
      let holderDidUrl = holderDid
      if (holderDid.startsWith('did:key:') && !holderDid.includes('#')) {
        // Extract the key identifier and use it as fragment
        const keyId = holderDid.replace('did:key:', '')
        holderDidUrl = `${holderDid}#${keyId}`
      }
      console.log('[useOfferRequest] Using holder DID URL for binding:', holderDidUrl)

      // Use the correct API method: acceptCredentialOfferUsingPreAuthorizedCode
      const acceptResult = await (agent.modules as any).openId4VcHolder.acceptCredentialOfferUsingPreAuthorizedCode(
        resolved,
        {
          credentialBindingResolver: async (options: any) => {
            console.log('[useOfferRequest] Credential binding resolver called with options:', JSON.stringify(options, null, 2))
            const { credentialFormat, supportedDidMethods, keyType, supportsAllDidMethods, supportsJwk, supportedVerificationMethods } = options || {}
            console.log('[useOfferRequest] Binding params:', { credentialFormat, supportedDidMethods, keyType, supportsAllDidMethods, supportsJwk })
            return { method: 'did', didUrl: holderDidUrl }
          }
        }
      )

      // acceptCredentialOfferUsingPreAuthorizedCode returns an array of credential records directly
      const credentials = Array.isArray(acceptResult) ? acceptResult : (acceptResult?.credentials || [])

      console.log('[useOfferRequest] Credo accept result:', {
        credentialCount: credentials.length,
        firstCredentialType: typeof credentials[0],
        firstCredentialFormat: credentials[0]?.claimFormat || credentials[0]?.type || 'unknown'
      })

      const { randomUUID } = await import('crypto')
      let savedCredentialId = ''
      let verifiableCredential = ''

      // Get the TENANT agent to store credentials in the user's wallet
      const tenantAgent = this.getAgent(request)
      const tenantW3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)

      for (const credentialRecord of credentials) {
        const credentialId = randomUUID()
        savedCredentialId = credentialId
        let credentialData: any = {}
        let vcType = 'VerifiableCredential'
        let issuerDid = ''

        // The credential may be a W3cJwtVerifiableCredential instance or a plain object
        // Check for claimFormat (Credo) or format property
        const format = credentialRecord.claimFormat || credentialRecord.format || ''

        // Get the serialized JWT - may be in .serializedJwt or .credential property, or the record itself could be a string
        let jwtToken: string = ''
        if (typeof credentialRecord === 'string') {
          jwtToken = credentialRecord
        } else if (credentialRecord.serializedJwt) {
          jwtToken = credentialRecord.serializedJwt
        } else if (typeof credentialRecord.credential === 'string') {
          jwtToken = credentialRecord.credential
        } else if (credentialRecord.jwt) {
          jwtToken = credentialRecord.jwt
        }

        console.log('[useOfferRequest] Processing credential:', {
          format,
          hasJwt: !!jwtToken,
          jwtLength: jwtToken?.length,
          credentialType: typeof credentialRecord,
          credentialKeys: typeof credentialRecord === 'object' ? Object.keys(credentialRecord || {}) : []
        })

        if (format === 'jwt_vc' || format === 'jwt_vc_json' || jwtToken) {
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

          // Store in TENANT'S Credo wallet (Askar) so it appears in their credential list
          try {
            // The credentialRecord should be a W3cJwtVerifiableCredential if from OID4VC
            if (credentialRecord && typeof credentialRecord === 'object' && credentialRecord.credential) {
              const storedRecord = await tenantW3cService.storeCredential(tenantAgent.context, {
                credential: credentialRecord,
              })
              savedCredentialId = storedRecord.id
              console.log('[useOfferRequest] Stored credential in tenant wallet:', storedRecord.id)
            } else {
              console.log('[useOfferRequest] Credential is not a W3cCredential instance, skipping tenant wallet storage')
            }
          } catch (storeError: any) {
            console.warn('[useOfferRequest] Could not store in tenant wallet:', storeError?.message)
          }
        } else if (format === 'vc+sd-jwt') {
          verifiableCredential = credentialRecord.compact || credentialRecord.credential || ''

          // Store SD-JWT in tenant wallet
          try {
            if (credentialRecord && typeof credentialRecord === 'object') {
              const storedRecord = await tenantW3cService.storeCredential(tenantAgent.context, {
                credential: credentialRecord,
              })
              savedCredentialId = storedRecord.id
              console.log('[useOfferRequest] Stored SD-JWT credential in tenant wallet:', storedRecord.id)
            }
          } catch (storeError: any) {
            console.warn('[useOfferRequest] Could not store SD-JWT in tenant wallet:', storeError?.message)
          }
        } else {
          // Fallback: try to store whatever we have
          verifiableCredential = typeof credentialRecord === 'string' ? credentialRecord : JSON.stringify(credentialRecord)

          try {
            if (credentialRecord && typeof credentialRecord === 'object') {
              const storedRecord = await tenantW3cService.storeCredential(tenantAgent.context, {
                credential: credentialRecord,
              })
              savedCredentialId = storedRecord.id
              console.log('[useOfferRequest] Stored credential (fallback) in tenant wallet:', storedRecord.id)
            }
          } catch (storeError: any) {
            console.warn('[useOfferRequest] Could not store in tenant wallet (fallback):', storeError?.message)
          }
        }

        console.log('[useOfferRequest] Processed credential:', savedCredentialId)
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

  @Post('{walletId}/exchange/resolvePresentationRequest')
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

  @Post('{walletId}/exchange/matchCredentialsForPresentationDefinition')
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

  @Post('{walletId}/exchange/usePresentationRequest')
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
    // Use BASE agent (not tenant agent) for OID4VC holder operations
    const agent = this.getBaseAgentForHolder()
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

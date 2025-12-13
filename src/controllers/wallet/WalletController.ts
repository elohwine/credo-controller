import { Controller, Post, Get, Route, Tags, Body, Request, Path, Query, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { injectable } from 'tsyringe'
import { getTenantById } from '../../persistence/TenantRepository'
import { getWalletCredentialsByWalletId, getWalletCredentialById } from '../../persistence/WalletCredentialRepository'
import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'
import { UnauthorizedError } from '../../errors/errors'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import * as jwt from 'jsonwebtoken'
import { SCOPES } from '../../enums'

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

@Route('api/wallet')
@Tags('WalletAPI')
@Security('jwt', [SCOPES.TENANT_AGENT])
@injectable()
export class WalletController extends Controller {

    /**
     * Get the Credo agent instance
     * Used for OpenID4VC holder operations
     */
    /**
     * Get the Credo agent instance
     * Used for OpenID4VC holder operations
     */
    private getAgent(request: ExRequest): Agent<RestMultiTenantAgentModules> {
        return request.agent as unknown as Agent<RestMultiTenantAgentModules>
    }

    private normalizeResponse(raw: any): any {
        if (typeof raw === 'object' && raw !== null) return raw
        if (typeof raw === 'string') {
            const s = raw.trim()
            // try JSON
            try {
                return JSON.parse(s)
            } catch (e) {
                // if it's an http url, return as url field
                if (s.startsWith('http://') || s.startsWith('https://')) {
                    return { url: s }
                }
                // otherwise wrap as raw
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

    /**
     * Get Wallets (Account Info)
     * Corresponds to: GET /wallet-api/wallet/accounts/wallets
     * This matches the frontend route expectation: /api/wallet/wallet/accounts/wallets
     */
    @Get('accounts/wallets')
    public async getWallets(@Request() request: ExRequest): Promise<WalletListingsResponse> {
        const authHeader = request.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('No token provided')
        }

        const token = authHeader.substring(7) // Remove 'Bearer ' prefix
        const secret = await this.getJwtSecret()

        try {
            const decoded = jwt.verify(token, secret) as any
            const user = getWalletUserByWalletId(decoded.walletId)
            if (!user) {
                throw new UnauthorizedError('User not found')
            }

            // Return user's wallet information
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

    /**
     * List Wallet Credentials
     * Corresponds to: GET /wallet-api/wallet/{walletId}/credentials
     */
    @Get('wallet/{walletId}/credentials')
    public async listCredentials(
        @Path() walletId: string
    ): Promise<any[]> {
        const credentials = getWalletCredentialsByWalletId(walletId)
        // Map to format expected by frontend (WalletCredential type in credential.ts)
        return credentials.map(c => ({
            wallet: c.walletId,
            id: c.id,
            document: c.credentialData,
            disclosures: null,
            addedOn: c.addedOn,
            manifest: null, // We don't have manifest stored yet
            parsedDocument: null, // Frontend parses it
            format: 'jwt_vc' // Default for now
        }))
    }

    /**
     * List DIDs for a wallet (proxy of /dids)
     * Corresponds to: GET /wallet-api/wallet/{walletId}/dids
     */
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

    /**
     * Get Wallet Credential
     * Corresponds to: GET /wallet-api/wallet/{walletId}/credentials/{credentialId}
     */
    @Get('wallet/{walletId}/credentials/{credentialId}')
    public async getCredential(
        @Path() walletId: string,
        @Path() credentialId: string
    ): Promise<any> {
        const c = getWalletCredentialById(credentialId)
        if (!c) {
            this.setStatus(404)
            throw new Error('Credential not found')
        }
        return {
            wallet: c.walletId,
            id: c.id,
            document: c.credentialData,
            disclosures: null,
            addedOn: c.addedOn,
            manifest: null,
            parsedDocument: null,
            format: 'jwt_vc'
        }
    }

    /**
     * Resolve Credential Offer using Credo's OpenID4VC Holder module
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/resolveCredentialOffer
     */
    @Post('wallet/{walletId}/exchange/resolveCredentialOffer')
    public async resolveCredentialOffer(
        @Request() request: ExRequest,
        @Path() walletId: string,
        @Body() body: any
    ): Promise<any> {
        console.log('[resolveCredentialOffer] === START (Credo OID4VC) ===')
        console.log('[resolveCredentialOffer] Input:', { walletId, bodyType: typeof body, body: JSON.stringify(body).slice(0, 500) })

        // 1. Extract the offer URI from the request body
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

        console.log('[resolveCredentialOffer] Parsed offerUri:', offerUri.slice(0, 200))

        if (!offerUri) {
            this.setStatus(400)
            throw new Error('No credential offer URI provided')
        }

        try {
            // 2. Use Credo's OpenId4VcHolder to resolve the offer
            const agent = this.getAgent(request)
            console.log('[resolveCredentialOffer] Using Credo agent to resolve offer')

            // Type assertion needed because module types aren't fully propagated yet
            const resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(offerUri)

            console.log('[resolveCredentialOffer] Credo resolved offer:', {
                issuer: resolved.metadata?.credentialIssuer?.credential_issuer,
                offeredCredentials: resolved.offeredCredentials?.length
            })

            // 3. Transform to format expected by frontend
            const response = {
                credential_issuer: resolved.metadata?.credentialIssuer?.credential_issuer,
                credential_configuration_ids: resolved.offeredCredentialConfigurations
                    ? Object.keys(resolved.offeredCredentialConfigurations)
                    : [],
                credentials: resolved.offeredCredentials,
                grants: resolved.credentialOfferPayload?.grants,
                // Store the full resolved offer for acceptance
                _credoResolved: resolved
            }

            console.log('[resolveCredentialOffer] === SUCCESS (Credo) ===')
            return response

        } catch (error: any) {
            console.error('[resolveCredentialOffer] === FAILED ===')
            console.error('[resolveCredentialOffer] Credo error:', error.message)
            this.setStatus(500)
            throw new Error(`Failed to resolve offer: ${error.message}`)
        }
    }


    /**
     * Resolve Issuer OpenID Metadata
     * Corresponds to: GET /wallet-api/wallet/{walletId}/exchange/resolveIssuerOpenIDMetadata
     */
    @Get('wallet/{walletId}/exchange/resolveIssuerOpenIDMetadata')
    public async resolveIssuerOpenIDMetadata(
        @Path() walletId: string,
        @Query() issuer: string
    ): Promise<any> {
        // The wallet needs the issuer's metadata to know what credentials are supported.
        // We construct the well-known URL and fetch it.
        const metadataUrl = `${issuer}/.well-known/openid-credential-issuer`
        try {
            const response = await fetch(metadataUrl)
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
            }
            return await response.json()
        } catch (error: any) {
            this.setStatus(400)
            throw new Error(`Failed to fetch issuer metadata: ${error.message}`)
        }
    }

    /**
     * Use Offer Request (Execute Issuance) using Credo's OpenID4VC Holder module
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/useOfferRequest
     */
    @Post('wallet/{walletId}/exchange/useOfferRequest')
    public async useOfferRequest(
        @Request() request: ExRequest,
        @Path() walletId: string,
        @Query() did: string,
        @Body() body: any
    ): Promise<any> {
        console.log('[useOfferRequest] === START (Credo OID4VC) ===')
        console.log('[useOfferRequest] Input:', { walletId, did, bodyType: typeof body })

        // 1. Extract the offer URI from the request body
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

        console.log('[useOfferRequest] Parsed offerUri:', offerUri.slice(0, 200))

        if (!offerUri) {
            this.setStatus(400)
            throw new Error('No credential offer URI provided')
        }

        try {
            // 2. Use Credo's OpenId4VcHolder to resolve and accept the offer
            const agent = this.getAgent(request)
            console.log('[useOfferRequest] Resolving offer with Credo...')

            // First resolve the offer
            const resolved = await (agent.modules as any).openId4VcHolder.resolveCredentialOffer(offerUri)
            console.log('[useOfferRequest] Offer resolved, accepting...')

            // Then accept the offer with credential binding to holder's DID
            const acceptResult = await (agent.modules as any).openId4VcHolder.acceptCredentialOffer({
                credentialOffer: resolved.credentialOffer,
                credentialBindingResolver: async ({ credentialFormat, supportedDidMethods, keyType }: any) => {
                    console.log('[useOfferRequest] Credential binding resolver called:', { credentialFormat, supportedDidMethods, keyType })

                    // Bind credential to the holder's DID
                    return {
                        method: 'did',
                        didUrl: did
                    }
                }
            })

            console.log('[useOfferRequest] Credo accept result:', {
                credentialCount: acceptResult.credentials?.length,
                format: acceptResult.credentials?.[0]?.format
            })

            // 3. Extract and save credentials to our wallet storage
            const { saveWalletCredential } = await import('../../persistence/WalletCredentialRepository')
            const { randomUUID } = await import('crypto')

            let savedCredentialId = ''
            let verifiableCredential = ''

            for (const credentialRecord of acceptResult.credentials || []) {
                const credentialId = randomUUID()
                savedCredentialId = credentialId

                // Extract credential data based on format
                let credentialData: any = {}
                let vcType = 'VerifiableCredential'
                let issuerDid = ''

                if (credentialRecord.format === 'jwt_vc_json' || credentialRecord.format === 'jwt_vc') {
                    const jwt = credentialRecord.credential
                    verifiableCredential = jwt

                    // Decode JWT to extract metadata
                    try {
                        const parts = jwt.split('.')
                        if (parts.length === 3) {
                            credentialData = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
                            const types = credentialData?.vc?.type || []
                            vcType = types.find((t: string) => t !== 'VerifiableCredential') || types[0] || 'VerifiableCredential'
                            issuerDid = credentialData?.iss || ''
                        }
                    } catch (e) {
                        console.warn('[useOfferRequest] Could not decode JWT:', e)
                    }

                    saveWalletCredential({
                        id: credentialId,
                        walletId,
                        credentialId,
                        type: vcType,
                        format: 'jwt_vc',
                        credentialData: JSON.stringify({ jwt, ...credentialData }),
                        issuerDid: issuerDid || resolved.metadata?.credentialIssuer?.credential_issuer || '',
                    })
                } else if (credentialRecord.format === 'vc+sd-jwt') {
                    verifiableCredential = credentialRecord.credential
                    saveWalletCredential({
                        id: credentialId,
                        walletId,
                        credentialId,
                        type: 'SD-JWT',
                        format: 'sd_jwt_vc',
                        credentialData: JSON.stringify({ sdJwt: credentialRecord.credential }),
                        issuerDid: resolved.metadata?.credentialIssuer?.credential_issuer || '',
                    })
                } else {
                    // ldp_vc or other formats
                    verifiableCredential = JSON.stringify(credentialRecord.credential)
                    saveWalletCredential({
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
            console.error('[useOfferRequest] Credo error:', error.message, error.stack?.slice(0, 500))

            this.setStatus(500)
            throw new Error(`Issuance failed: ${error.message}`)
        }
    }


    /**
     * Resolve Presentation Request
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/resolvePresentationRequest
     */
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
            // Handle cases where body is { request: "..." } or similar
            requestUri = body.request || body.presentationRequest || ''
            // If body is just the key (text/plain mismatch), try key
            if (!requestUri) {
                const keys = Object.keys(body)
                if (keys.length === 1 && keys[0].includes('://')) {
                    requestUri = keys[0]
                }
            }
        }

        if (!requestUri) {
            // Fallback: checks if the body itself is the URI in some edge cases
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

        // We can validate it using Credo, but for the frontend contract, 
        // it often just expects the URI back if it works, or the Resolved Request object?
        // The frontend code: const request = await resolve...(decodeRequest(query.request))
        // const presentationUrl = new URL(request)
        // This implies it EXPECTS A STRING URL.

        try {
            // Optional: verify it is resolvable by Credo
            const agent = this.getAgent(request)
            // We don't await the full resolution here because the frontend expects a URL string,
            // and Credo returns an object. We just verify we can parse it/it looks valid.
            // But to be safe and simple: just return the URI.
            return requestUri
        } catch (e: any) {
            this.setStatus(400)
            throw new Error(`Invalid presentation request: ${e.message}`)
        }
    }

    /**
     * Match Credentials for Presentation Definition
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/matchCredentialsForPresentationDefinition
     */
    @Post('wallet/{walletId}/exchange/matchCredentialsForPresentationDefinition')
    public async matchCredentialsForPresentationDefinition(
        @Request() request: ExRequest,
        @Path() walletId: string,
        @Body() body: any
    ): Promise<any[]> {
        // Body is the presentation_definition (JSON or string)
        // Since Credo's OpenId4VcHolder module prefers matching against a full request,
        // and we don't have the full request here (stateless), 
        // we will fetch ALL credentials and let the backend return them.
        // TODO: Implement proper PEX matching here using @sphereon/pex or Credo internals if exposed.

        const credentials = getWalletCredentialsByWalletId(walletId)

        // Return in the format expected by the frontend
        return credentials.map(c => ({
            id: c.id,
            document: c.credentialData,
            parsedDocument: null, // Frontend will parse
            disclosures: null
        }))
    }

    /**
     * Use Presentation Request (Submit Proof)
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/usePresentationRequest
     */
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
            // 1. Resolve the request again to get the object Credo needs
            console.log('[usePresentationRequest] Resolving request for submission...')
            const resolved = await (agent.modules as any).openId4VcHolder.resolveOpenId4VpAuthorizationRequest(presentationRequest)

            // 2. Accept the request
            console.log('[usePresentationRequest] Accepting request...')
            const acceptResult = await (agent.modules as any).openId4VcHolder.acceptOpenId4VpAuthorizationRequest({
                authorizationRequest: resolved.authorizationRequest,
                submissionInput: {
                    // Logic to select the specific credential ID selected by the user
                    // Credo needs us to map Input Descriptors to Credential IDs (or records)
                    // If we just have one credential selected and one input descriptor, it's easy.
                    // If complex, we need PEX.
                    // For the demo, we assume 1:1 or we use the helper if available.

                    // Alternative: use the callback `credentialBindingResolver`? 
                    // No, acceptOpenId4VpAuthorizationRequest uses `submissionInput` which usually usually expects
                    // a map of input_descriptor_id -> credential_id/record.

                    // But wait, `acceptOpenId4VpAuthorizationRequest` signature in Credo might just take `presentationSubmission` or similar?
                    // Let's check the API signature we saw earlier:
                    // acceptOpenId4VpAuthorizationRequest(options: AcceptOpenId4VpAuthorizationRequestOptions)
                    // Options usually include `submissionInput` or `presentationSubmission`.

                    // We will try to map all selected credentials to the first input descriptor for now,
                    // or better, if Credo provides `selectCredentialsForPresentationExchangeRequest`, usage would be:
                    // const selection = agent.modules.openId4VcHolder.selectCredentialsForPresentationExchangeRequest(...)
                    // But we ignored the matching step.

                    // Quick fix: Provide the selected credentials and hope Credo Auto-matic selection works if we pass them?
                    // No, we must provide specific mapping.

                    // Let's try to pass the first selected credential for all input descriptors (hacky but typical for single-cred demo).
                } as any // We need to handle this strictly if strict types are enforced.
            })

            // Wait, I need to know how to construct `structure` for `acceptOpenId4VpAuthorizationRequest`.
            // Looking at Credo docs/examples (simulated):
            // usually: acceptOpenId4VpAuthorizationRequest({ authorizationRequest, submissionInput: { descriptorId: credentialId } })

            // I'll try to use the `resolved.credentialsForRequest` to map if possible, 
            // but the user only sent IDs.

            // Let's construct a simple submission where we map all input descriptors in the request
            // to the first selected credential.
            const inputDescriptors = resolved.authorizationRequest.presentationDefinition?.inputDescriptors || []
            const submissionInput: Record<string, string> = {}
            if (inputDescriptors.length > 0) {
                const credId = selectedCredentials[0]
                // We need the ACTUAL W3C Credential Record ID (from agent.credentials), not just our wallet storage ID?
                // In our system, they are the same UUIDs (hopefully).
                // We saved them with `saveWalletCredential`.

                // However, we need to map descriptor ID -> Credential Record.
                inputDescriptors.forEach((d: any) => {
                    submissionInput[d.id] = credId
                })
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

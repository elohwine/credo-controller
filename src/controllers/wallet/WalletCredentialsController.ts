import { Controller, Post, Get, Route, Tags, Body, Request, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { container } from 'tsyringe'
import { Agent, W3cCredentialService } from '@credo-ts/core'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import { SCOPES } from '../../enums'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'

interface PendingOffer {
    id: string
    issuerName: string
    credentialType: string
    offerUri: string
    claims?: Record<string, any>
}

@Route('api/wallet/credentials')
@Tags('Wallet-Credentials')
export class WalletCredentialsController extends Controller {

    /**
     * Check for pending offers that the user should claim
     * For now, checks if user needs GenericID and creates offer from Main Issuer
     */
    @Get('/pending-offers')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async getPendingOffers(@Request() request: ExRequest): Promise<{ offers: PendingOffer[] }> {
        const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
        const tenantId = (request as any).user?.tenantId || (request as any).user?.walletId

        if (!tenantId) {
            this.setStatus(401)
            throw new Error('Unauthorized')
        }

        const offers: PendingOffer[] = []

        try {
            // Get tenant agent to check credentials
            const tenantAgent = await baseAgent.modules.tenants.getTenantAgent({ tenantId })

            // Check if user has GenericID using W3cCredentialService (OID4VC credentials are stored here)
            const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)
            const w3cCredentials = await w3cService.getAllCredentialRecords(tenantAgent.context)
            const hasGenericId = w3cCredentials.some((record: any) => {
                const types = record.credential?.type || []
                return types.includes('GenericIDCredential')
            })
            console.log('[getPendingOffers] Checked for GenericID:', { tenantId, credentialCount: w3cCredentials.length, hasGenericId })

            await tenantAgent.endSession()

            // If no GenericID, check if we should create offer from Main Issuer
            if (!hasGenericId) {
                const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'

                // Get user's DID
                const tenantAgent2 = await baseAgent.modules.tenants.getTenantAgent({ tenantId })
                const dids = await tenantAgent2.dids.getCreatedDids({ method: 'key' })
                const holderDid = dids[0]?.did
                await tenantAgent2.endSession()

                if (holderDid && issuerApiUrl) {
                    // Get user info for claims
                    const user = getWalletUserByWalletId(tenantId)

                    // Call Main Issuer to create offer
                    try {
                        const targetUrl = `${issuerApiUrl}/custom-oidc/issuer/credential-offers`
                        const response = await fetch(targetUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': process.env.ISSUER_API_KEY || 'test-api-key-12345'
                            },
                            body: JSON.stringify({
                                credentials: [
                                    {
                                        credentialDefinitionId: 'GenericIDCredential',
                                        // Request generic Credo-supported format (validated by API)
                                        format: 'jwt_vc_json',
                                        type: ['VerifiableCredential', 'GenericIDCredential'],
                                        // Include user claims from registration
                                        claims: {
                                            username: user?.username || 'Unknown',
                                            email: user?.email || '',
                                            walletId: tenantId,
                                            issuedAt: new Date().toISOString()
                                        }
                                    }
                                ]
                            })
                        })

                        if (response.ok) {
                            const offerData = await response.json() as any
                            offers.push({
                                id: offerData.offerId || 'generic-id-offer',
                                issuerName: 'Main Platform Issuer',
                                credentialType: 'GenericIDCredential',
                                offerUri: offerData.credential_offer_uri || offerData.credentialOfferUri,
                                claims: offerData.claims
                            })
                        }
                    } catch (e: any) {
                        request.logger?.error({ err: e.message }, 'Failed to fetch offer from Main Issuer')
                    }
                }
            }

            return { offers }
        } catch (error: any) {
            request.logger?.error({ err: error.message }, 'Failed to get pending offers')
            throw error
        }
    }

    /**
   * Accept and resolve a credential offer
   * 
   * Note: The OpenId4VcHolderModule is registered on the BASE agent, not tenant agents.
   * We use the base agent for OID4VC operations and store credentials in the tenant wallet.
   */
    @Post('/accept-offer')
    @Security('jwt', [SCOPES.TENANT_AGENT])
    public async acceptOffer(
        @Request() request: ExRequest,
        @Body() body: { offerUri: string }
    ): Promise<{ success: boolean; credentialId?: string }> {
        const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
        const tenantId = (request as any).user?.tenantId || (request as any).user?.walletId

        if (!tenantId) {
            this.setStatus(401)
            throw new Error('Unauthorized')
        }

        try {
            console.log('[acceptOffer] === START (Using Base Agent for OID4VC) ===')
            let rawOffer = body.offerUri || ''
            
            // DOCKER NETWORK FIX: Rewrite localhost URLs to Docker internal IPs
            // When running in Docker, the holder can't reach localhost:3000 (which maps to itself)
            // It needs to use the Docker network IP of the issuer service
            const issuerApiUrl = process.env.ISSUER_API_URL || ''
            if (issuerApiUrl && issuerApiUrl.includes('172.')) {
                // Replace localhost:3000 with Docker internal IP
                rawOffer = rawOffer.replace(/http:\/\/localhost:3000/g, issuerApiUrl)
                rawOffer = rawOffer.replace(/http%3A%2F%2Flocalhost%3A3000/gi, encodeURIComponent(issuerApiUrl).replace(/%/g, '%'))
                // Also handle the encoded version more carefully
                const encodedLocalhost = encodeURIComponent('http://localhost:3000')
                const encodedIssuer = encodeURIComponent(issuerApiUrl)
                rawOffer = rawOffer.split(encodedLocalhost).join(encodedIssuer)
            }
            
            console.log('[acceptOffer] Tenant:', tenantId, 'Offer URI len:', rawOffer.length, 'head:', rawOffer.slice(0, 100), 'tail:', rawOffer.slice(-60))

            // Use BASE agent for OID4VC holder operations (module not available on tenant agents)

            // Helper: attempt to extract/normalize an inner HTTP URL from an offer wrapper
            const normalizeOffer = (raw?: string) => {
                if (!raw) return { wrapper: null as string | null, inner: null as string | null }

                // Decode repeated encodings to get a clean wrapper
                let wrapper = raw
                for (let i = 0; i < 3; i++) {
                    if (wrapper.startsWith('openid-credential-offer://') || wrapper.startsWith('openid-initiate-issuance://')) break
                    try {
                        const decoded = decodeURIComponent(wrapper)
                        if (decoded === wrapper) break
                        wrapper = decoded
                    } catch {
                        break
                    }
                }

                // Extract inner URL if wrapper
                let inner: string | null = null
                try {
                    if (wrapper.startsWith('openid-credential-offer://') || wrapper.startsWith('openid-initiate-issuance://')) {
                        const q = wrapper.split('?')[1] || ''
                        const params = new URLSearchParams(q)
                        inner = params.get('credential_offer_uri') || params.get('credential_offer_url') || params.get('request') || null
                    } else if (wrapper.startsWith('http://') || wrapper.startsWith('https://')) {
                        inner = wrapper
                    }
                } catch {
                    inner = null
                }

                // Decode inner URL if encoded
                if (inner) {
                    let candidate = inner
                    for (let i = 0; i < 3; i++) {
                        if (candidate.startsWith('http://') || candidate.startsWith('https://')) break
                        try {
                            const decoded = decodeURIComponent(candidate)
                            if (decoded === candidate) break
                            candidate = decoded
                        } catch {
                            break
                        }
                    }
                    inner = candidate.startsWith('http://') || candidate.startsWith('https://') ? candidate : inner
                }

                return { wrapper, inner }
            }

            const { wrapper, inner } = normalizeOffer(rawOffer)
            const rebuiltWrapper = inner
                ? `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(inner)}`
                : null
            console.log('[acceptOffer] Normalized offer:', {
                hasWrapper: !!wrapper,
                hasInner: !!inner,
                wrapperHead: wrapper?.slice(0, 80),
                innerHead: inner?.slice(0, 80),
                rebuiltHead: rebuiltWrapper?.slice(0, 80)
            })
            let resolvedOffer: any
            try {
                if (!wrapper) throw new Error('Missing offer URI')
                resolvedOffer = await (baseAgent.modules as any).openId4VcHolder.resolveCredentialOffer(wrapper)
            } catch (err: any) {
                // Try rebuilt wrapper (in case of malformed encoding)
                if (rebuiltWrapper && rebuiltWrapper !== wrapper) {
                    try {
                        resolvedOffer = await (baseAgent.modules as any).openId4VcHolder.resolveCredentialOffer(rebuiltWrapper)
                        console.log('[acceptOffer] Resolved offer using rebuilt wrapper')
                    } catch (errRebuilt: any) {
                        err = errRebuilt
                    }
                }

                // If wrapper attempts fail, try resolving the inner HTTP URL directly (common fallback)
                if (!resolvedOffer && inner) {
                    try {
                        resolvedOffer = await (baseAgent.modules as any).openId4VcHolder.resolveCredentialOffer(inner)
                        console.log('[acceptOffer] Resolved offer using inner URL')
                    } catch (err2: any) {
                        err = err2
                        throw err
                    }
                } else if (!resolvedOffer) {
                    throw err
                }
            }
            console.log('[acceptOffer] Offer resolved:', {
                issuer: resolvedOffer.metadata?.credentialIssuer?.credential_issuer,
                offeredCredentials: resolvedOffer.offeredCredentials?.length
            })

            // Get or create a DID in the BASE agent for holder binding
            let baseAgentDids = await baseAgent.dids.getCreatedDids({ method: 'key' })
            let holderDid: string

            if (baseAgentDids.length === 0) {
                console.log('[acceptOffer] No DID in base agent, creating one...')
                const createdDid = await baseAgent.dids.create({
                    method: 'key',
                    options: { keyType: 'ed25519' }
                })
                holderDid = createdDid.didState.did as string
                console.log('[acceptOffer] Created DID in base agent:', holderDid)
            } else {
                holderDid = baseAgentDids[0].did
                console.log('[acceptOffer] Using existing DID from base agent:', holderDid)
            }

            // Build DID URL with fragment for did:key
            let holderDidUrl = holderDid
            if (holderDid.startsWith('did:key:') && !holderDid.includes('#')) {
                const keyId = holderDid.replace('did:key:', '')
                holderDidUrl = `${holderDid}#${keyId}`
            }

            // Accept using pre-authorized code with base agent
            const credentials = await (baseAgent.modules as any).openId4VcHolder.acceptCredentialOfferUsingPreAuthorizedCode(
                resolvedOffer,
                {
                    userPin: undefined,
                    verifyCredentialStatus: false,
                    credentialBindingResolver: async () => {
                        console.log('[acceptOffer] Credential binding resolver called, using:', holderDidUrl)
                        return { method: 'did', didUrl: holderDidUrl }
                    }
                }
            )

            console.log('[acceptOffer] Credentials received:', credentials?.length || 0)

            // Store credentials in TENANT's wallet
            const tenantAgent = await baseAgent.modules.tenants.getTenantAgent({ tenantId })
            const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)

            let savedCredentialId = ''
            for (const credentialRecord of credentials) {
                try {
                    // Store in tenant wallet
                    const storedRecord = await w3cService.storeCredential(tenantAgent.context, {
                        credential: credentialRecord,
                    })
                    savedCredentialId = storedRecord.id
                    console.log('[acceptOffer] Stored credential in tenant wallet:', storedRecord.id)
                } catch (storeError: any) {
                    console.warn('[acceptOffer] Could not store credential:', storeError?.message)
                }
            }

            await tenantAgent.endSession()

            console.log('[acceptOffer] === SUCCESS ===')
            return {
                success: true,
                credentialId: savedCredentialId || 'credential-received'
            }
        } catch (error: any) {
            console.error('[acceptOffer] === FAILED ===')
            console.error('[acceptOffer] Error:', error?.message || error)
            request.logger?.error({ err: error?.message || error, stack: error?.stack }, 'Failed to accept offer')

            // Handle known invalid-state from issuer (single-use or consumed offer)
            const msg = (error && (error.message || JSON.stringify(error))) || String(error)
            if (msg.includes('Invalid state for credential offer') || msg.includes('invalid_request') && msg.includes('Invalid state')) {
                this.setStatus(409)
                throw new Error('Credential offer is no longer valid or has an invalid state. Request a fresh credential offer from the issuer and try again.')
            }

            // Generic failure
            this.setStatus(400)
            throw new Error(`Failed to accept offer: ${msg}`)
        }
    }
}

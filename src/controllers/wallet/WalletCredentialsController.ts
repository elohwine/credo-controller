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
            console.log('[acceptOffer] Tenant:', tenantId, 'Offer URI:', body.offerUri?.slice(0, 100))

            // Use BASE agent for OID4VC holder operations (module not available on tenant agents)
            const resolvedOffer = await (baseAgent.modules as any).openId4VcHolder.resolveCredentialOffer(body.offerUri)
            console.log('[acceptOffer] Offer resolved:', {
                issuer: resolvedOffer.metadata?.credentialIssuer?.credential_issuer,
                offeredCredentials: resolvedOffer.offeredCredentials?.length
            })

            // Get or create a DID in the BASE agent for holder binding
            let baseAgentDids = await baseAgent.dids.getCreatedDids({ method: 'key' })
            let holderDid: string

            if (baseAgentDids.length === 0) {
                console.log('[acceptOffer] No DID in base agent, creating one...')
                const createdDid = await baseAgent.dids.create({ method: 'key' })
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
            console.error('[acceptOffer] Error:', error.message)
            request.logger?.error({ err: error.message, stack: error.stack }, 'Failed to accept offer')
            this.setStatus(400)
            throw new Error(`Failed to accept offer: ${error.message}`)
        }
    }
}

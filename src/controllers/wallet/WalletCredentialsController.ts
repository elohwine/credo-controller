import { Controller, Post, Get, Route, Tags, Body, Request, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { container } from 'tsyringe'
import { Agent } from '@credo-ts/core'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import { SCOPES } from '../../enums'

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

            // Check if user has GenericID
            const credentials = await tenantAgent.credentials.getAll()
            const hasGenericId = credentials.some(cred => {
                const types = (cred as any)?.type || []
                return types.includes('GenericIDCredential')
            })

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
                    // Call Main Issuer to create offer
                    try {
                        const response = await fetch(`${issuerApiUrl}/api/credentials/offer`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': process.env.ISSUER_API_KEY || 'test-api-key-12345'
                            },
                            body: JSON.stringify({
                                credentialType: 'GenericIDCredential',
                                claims: {
                                    holderDid,
                                    issuedAt: new Date().toISOString()
                                },
                                subjectDid: holderDid
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
            const tenantAgent = await baseAgent.modules.tenants.getTenantAgent({ tenantId })

            // Resolve offer
            const resolvedOffer = await tenantAgent.modules.openId4VcHolder.resolveCredentialOffer(body.offerUri)

            // Accept using pre-authorized code
            const credentials = await tenantAgent.modules.openId4VcHolder.acceptCredentialOfferUsingPreAuthorizedCode(
                resolvedOffer,
                {
                    userPin: undefined,
                    verifyCredentialStatus: false,
                    credentialBindingResolver: async () => {
                        const dids = await tenantAgent.dids.getCreatedDids({ method: 'key' })
                        return {
                            method: 'did',
                            didUrl: dids[0]?.did + '#' + dids[0]?.did.split(':').pop()
                        }
                    }
                }
            )

            await tenantAgent.endSession()

            return {
                success: true,
                credentialId: (credentials[0] as any)?.id || 'credential-received'
            }
        } catch (error: any) {
            request.logger?.error({ err: error.message, stack: error.stack }, 'Failed to accept offer')
            this.setStatus(400)
            throw new Error(`Failed to accept offer: ${error.message}`)
        }
    }
}

import { Controller, Post, Get, Route, Tags, Body, Request, Path, Query } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { injectable } from 'tsyringe'
import { getTenantById } from '../../persistence/TenantRepository'
import * as OidcStore from '../../persistence/OidcStoreRepository'
import { getWalletCredentialsByWalletId, getWalletCredentialById } from '../../persistence/WalletCredentialRepository'
import axios from 'axios'
import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'
import { UnauthorizedError } from '../../errors/errors'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import * as jwt from 'jsonwebtoken'

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
@injectable()
export class WalletController extends Controller {

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
    @Get('wallet/accounts/wallets')
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
    @Get('{walletId}/credentials')
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
     * Get Wallet Credential
     * Corresponds to: GET /wallet-api/wallet/{walletId}/credentials/{credentialId}
     */
    @Get('{walletId}/credentials/{credentialId}')
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
     * Resolve Credential Offer
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/resolveCredentialOffer
     */
    @Post('{walletId}/exchange/resolveCredentialOffer')
    public async resolveCredentialOffer(
        @Path() walletId: string,
        @Body() body: any // The body is the raw offer string (e.g. openid-credential-offer://...)
    ): Promise<any> {
        // 1. Parse the offer URI
        // The body might be a JSON object or a string depending on how the UI sends it.
        // Based on issuance.ts: body: request (which is a string)
        let offerUri = typeof body === 'string' ? body : JSON.stringify(body)

        // Clean up if it came as a key in a JSON object (common express parsing quirk if content-type isn't set right)
        if (typeof body === 'object' && Object.keys(body).length === 1) {
            offerUri = Object.keys(body)[0]
        }

        if (offerUri.startsWith('openid-credential-offer://?credential_offer_uri=')) {
            offerUri = decodeURIComponent(offerUri.split('=')[1])
        } else if (offerUri.startsWith('openid-credential-offer://')) {
            // Handle value-based offer if needed, but for now assume reference by URI
            // If it's a value offer, we might need to parse the JSON directly from the param
        }

        // 2. Fetch the offer from the Issuer (which might be us or external)
        // In this "wiring" phase, the wallet UI calls this endpoint to "expand" the offer.
        // If the offer URI points to OUR backend, we could fetch it internally, but to be safe/general
        // we can just make an HTTP request to the URI.
        try {
            const response = await axios.get(offerUri)
            return response.data
        } catch (error: any) {
            this.setStatus(400)
            throw new Error(`Failed to resolve offer URI: ${error.message}`)
        }
    }

    /**
     * Resolve Issuer OpenID Metadata
     * Corresponds to: GET /wallet-api/wallet/{walletId}/exchange/resolveIssuerOpenIDMetadata
     */
    @Get('{walletId}/exchange/resolveIssuerOpenIDMetadata')
    public async resolveIssuerOpenIDMetadata(
        @Path() walletId: string,
        @Query() issuer: string
    ): Promise<any> {
        // The wallet needs the issuer's metadata to know what credentials are supported.
        // We construct the well-known URL and fetch it.
        const metadataUrl = `${issuer}/.well-known/openid-credential-issuer`
        try {
            const response = await axios.get(metadataUrl)
            return response.data
        } catch (error: any) {
            this.setStatus(400)
            throw new Error(`Failed to fetch issuer metadata: ${error.message}`)
        }
    }

    /**
     * Use Offer Request (Execute Issuance)
     * Corresponds to: POST /wallet-api/wallet/{walletId}/exchange/useOfferRequest
     */
    @Post('{walletId}/exchange/useOfferRequest')
    public async useOfferRequest(
        @Path() walletId: string,
        @Query() did: string,
        @Body() body: any // The raw offer string again
    ): Promise<any> {
        // This is the "Accept" action.
        // 1. Re-parse the offer to get the code/state.
        let offerUri = typeof body === 'string' ? body : JSON.stringify(body)
        if (typeof body === 'object' && Object.keys(body).length === 1) {
            offerUri = Object.keys(body)[0]
        }

        let credentialOfferUri = ''
        if (offerUri.startsWith('openid-credential-offer://?credential_offer_uri=')) {
            credentialOfferUri = decodeURIComponent(offerUri.split('=')[1])
        }

        if (!credentialOfferUri) {
            this.setStatus(400)
            throw new Error('Invalid offer URI format')
        }

        // 2. We need to exchange the "pre-authorized_code" for a Token, then for a Credential.
        // Since we are the backend for the wallet, we orchestrate this flow.

        // A. Fetch the offer again to get details (like the code)
        // Optimization: In a real app, we might pass the parsed offer object, but the UI sends the raw string.
        const offerResponse = await axios.get(credentialOfferUri)
        const offerData = offerResponse.data

        const grants = offerData.grants
        const preAuthCode = grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code']

        if (!preAuthCode) {
            this.setStatus(400)
            throw new Error('No pre-authorized_code found in offer')
        }

        const issuerUrl = offerData.credential_issuer

        // B. Request Token (using pre-authorized code)
        // We need to find the token endpoint. Usually in OIDC metadata, but for our custom issuer 
        // we know it is at /token (or we can derive it).
        // Let's fetch metadata to be correct.
        const metadataUrl = `${issuerUrl}/.well-known/openid-credential-issuer`
        const metadataResponse = await axios.get(metadataUrl)
        const tokenEndpoint = metadataResponse.data.token_endpoint || `${issuerUrl}/token` // Fallback for our simple issuer

        // C. Call Token Endpoint
        const tokenBody = {
            grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
            pre_authorized_code: preAuthCode,
            subject_did: did // We inject the DID here so the issuer knows who to issue to
        }

        try {
            const tokenResponse = await axios.post(tokenEndpoint, tokenBody)
            const { verifiableCredential, credentialId } = tokenResponse.data

            // D. Save the VC to the Wallet's storage
            // For this "wiring" phase, we might just log it or store it in a simple way.
            // The UI expects a success response.
            // In a real implementation, we would save to the agent's wallet.

            console.log(`[WalletController] Issued VC for wallet ${walletId}:`, credentialId)

            return {
                id: credentialId,
                verifiableCredential
            }

        } catch (error: any) {
            console.error('Issuance failed:', error.response?.data || error.message)
            this.setStatus(500)
            throw new Error(`Issuance failed: ${error.message}`)
        }
    }

    /**
     * Resolve VCT URL (Verifiable Credential Type)
     * Corresponds to: GET /wallet-api/wallet/{walletId}/exchange/resolveVctUrl
     */
    @Get('{walletId}/exchange/resolveVctUrl')
    public async resolveVctUrl(
        @Path() walletId: string,
        @Query() vct: string
    ): Promise<any> {
        try {
            const response = await axios.get(vct)
            return response.data
        } catch (error: any) {
            // If it fails, just return the VCT as the name (fallback)
            return { name: vct }
        }
    }
}

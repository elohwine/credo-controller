/**
 * CredentialIssuanceService - Unified credential offer creation
 * 
 * All credential issuance flows (login, workflows, API) use this service
 * to create consistent OIDC4VC pre-authorized offers with deeplinks.
 */

import { randomUUID } from 'crypto'
import { container } from 'tsyringe'
import { Agent, KeyType } from '@credo-ts/core'
import type { RestMultiTenantAgentModules } from '../cliAgent'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'CredentialIssuanceService' })

/**
 * Input for creating a credential offer
 */
export interface IssuanceRequest {
    /** Credential type name, e.g., 'GenericID', 'PaymentReceipt', 'Quote' */
    credentialType: string

    /** The actual claims to include in the VC credentialSubject */
    claims: Record<string, any>

    /** Subject DID (the holder's DID) - optional, can be provided at acceptance time */
    subjectDid?: string

    /** Override issuer DID - if not provided, uses tenant's issuer DID */
    issuerDid?: string

    /** Tenant ID for multi-tenant scenarios (REQUIRED for credential issuance) */
    tenantId: string

    /** Expiration time in milliseconds (default: 1 hour) */
    expiresInMs?: number

    /** Base URL for generating offer URIs (default: from env or localhost:3000) */
    baseUrl?: string
}

/**
 * Result of creating a credential offer
 */
export interface IssuanceResult {
    /** Unique offer ID */
    offerId: string

    /** Pre-authorized code for token exchange */
    preAuthorizedCode: string

    /** Direct HTTP URL to fetch the offer */
    credential_offer_uri: string

    /** OIDC4VCI deeplink for wallet scanning/clicking */
    credential_offer_deeplink: string

    /** When the offer expires */
    expiresAt: string

    /** The credential type that will be issued */
    credentialType: string[]
}

/**
 * Unified service for creating credential offers
 */
export class CredentialIssuanceService {

    /**
     * Create a pre-authorized credential offer
     * 
     * @param request - Issuance parameters
     * @returns Offer details with deeplink for wallet acceptance
     */
    async createOffer(request: IssuanceRequest): Promise<IssuanceResult> {
        logger.info({ credentialType: request.credentialType, tenantId: request.tenantId }, 'Creating credential offer')

        // 1. Resolve base agent which has OpenId4VcIssuer module
        const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

        if (!request.tenantId) {
            throw new Error('tenantId is required for credential issuance')
        }

        // Get tenant agent for DID/context purposes
        const tenantAgent = await (baseAgent.modules as any).tenants.getTenantAgent({ tenantId: request.tenantId })

        try {
            // Use BASE agent's openId4VcIssuer, NOT tenant agent (which doesn't have it)
            const baseModules = (baseAgent.modules as any)
            logger.info({ moduleKeys: Object.keys(baseModules || {}), tenantId: request.tenantId }, 'Available modules on Base Agent')

            if (!baseModules.openId4VcIssuer) {
                throw new Error(`OpenId4VcIssuer module is missing on base agent. Available: ${Object.keys(baseModules || {}).join(', ')}`)
            }

            // Get the issuer for this tenant
            const issuers = await baseModules.openId4VcIssuer.getAllIssuers()
            if (!issuers || issuers.length === 0) {
                throw new Error('No OpenID4VC issuers found for this tenant. Tenant provisioning may have failed.')
            }
            const openId4VcIssuer = issuers[0]

            // Ensure we use the full credential configuration ID (e.g. ReceiptVC_jwt_vc_json)
            // our startServer.js and Portal UI use this suffix by default.
            let configId = request.credentialType
            if (!configId.includes('_jwt_vc')) {
                configId = `${configId}_jwt_vc_json`
            }

            // Create credential offer using the Credo API
            const result = await baseModules.openId4VcIssuer.createCredentialOffer({
                issuerId: openId4VcIssuer.issuerId,
                offeredCredentials: [configId],
                preAuthorizedCodeFlowConfig: {
                    userPinRequired: false,
                    // Set detailed expiration for development testing (10 minutes)
                    tokenStatusConfig: {
                        accessTokenLifetimeInSeconds: 600,
                    }
                },
                issuanceMetadata: {
                    claims: request.claims,
                    subjectDid: request.subjectDid,
                }
            })

            // Credo returns: { credentialOffer: string (the fully formed deep link), issuanceSession: ... }
            const credentialOfferDeepLink = result.credentialOffer
            const issuanceSession = result.issuanceSession

            // Extract the actual HTTP URI for clients that need it (decode it first)
            let credentialOfferUri = ''
            if (credentialOfferDeepLink && credentialOfferDeepLink.includes('credential_offer_uri=')) {
                const encodedUri = credentialOfferDeepLink.split('credential_offer_uri=')[1]
                credentialOfferUri = decodeURIComponent(encodedUri)
            } else {
                credentialOfferUri = credentialOfferDeepLink
            }

            // Wrap with Wallet URL if configured (to invoke web wallet)
            const walletUrl = process.env.WALLET_URL || 'http://localhost:4000'
            let finalDeeplink = credentialOfferDeepLink
            if (walletUrl && !credentialOfferDeepLink.startsWith(walletUrl)) {
                // Format: http://localhost:4000/api/siop/initiateIssuance?credential_offer_uri=...
                // This ensures the custom Nuxt page handles the resolution.
                finalDeeplink = `${walletUrl}/api/siop/initiateIssuance?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`
            }

            logger.info({ offerId: issuanceSession?.id, uri: credentialOfferUri?.slice(0, 100), configId }, 'Credential offer created')

            return {
                offerId: issuanceSession?.id || 'unknown',
                preAuthorizedCode: issuanceSession?.preAuthorizedCode || '',
                credential_offer_uri: credentialOfferUri,
                credential_offer_deeplink: finalDeeplink,
                expiresAt: new Date(Date.now() + (request.expiresInMs || 3600000)).toISOString(),
                credentialType: ['VerifiableCredential', request.credentialType.replace(/_jwt_vc(_json)?$/, '')],
            }
        } catch (e: any) {
            logger.error({ error: e.message, stack: e.stack, tenantId: request.tenantId }, 'Failed to create credential offer')
            throw new Error(`Failed to create credential offer: ${e.message}`)
        } finally {
            // End tenant session
            if (tenantAgent && typeof (tenantAgent as any).endSession === 'function') {
                await (tenantAgent as any).endSession()
            }
        }
    }

    /**
     * Get the platform's default issuer DID
     * Creates one if none exists
     */
    private async getDefaultIssuerDid(): Promise<string> {
        const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
        const dids = await agent.dids.getCreatedDids({ method: 'key' })
        if (dids.length > 0) return dids[0].did

        // Create one if missing
        const did = await agent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
        return did.didState.did as string
    }
}

// Singleton instance
export const credentialIssuanceService = new CredentialIssuanceService()

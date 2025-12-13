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

    /** Override issuer DID - if not provided, uses platform's default */
    issuerDid?: string

    /** Tenant ID for multi-tenant scenarios */
    tenantId?: string

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
        logger.info({ credentialType: request.credentialType }, 'Creating credential offer')

        // 1. Resolve issuer DID
        let issuerDid = request.issuerDid
        if (!issuerDid) {
            issuerDid = await this.getDefaultIssuerDid()
        }

        // 2. Determine credential type (config ID)
        // We assume request.credentialType matches the registered Credential Configuration ID.
        // If legacy mapping is needed, it should be done here or in configuration.
        const credentialConfigurationId = request.credentialType

        // Define type array for return value
        const credentialType = ['VerifiableCredential', request.credentialType]

        // 3. Resolve Agent
        const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

        // 4. Create offer using Credo Native Module
        // We use the 'pre-authorized' flow by default for this service
        const preAuthorizedCode = randomUUID()

        // Map credentialType string to a configuration ID that Credo understands
        // For now, we assume the config ID matches the credential type or we need to find it.
        // But Credo createCredentialOffer takes `credentialConfigurationIds`.

        try {
            const modules = (agent as any).modules
            logger.info({ moduleKeys: Object.keys(modules || {}) }, 'Available modules on Agent')

            if (!modules.openId4VcIssuer) {
                throw new Error(`OpenId4VcIssuer module is missing. Available: ${Object.keys(modules || {}).join(', ')}`)
            }

            // Get the first issuer (we initialized one in cliAgent.ts)
            // Reference: https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module
            const issuers = await modules.openId4VcIssuer.getAllIssuers()
            if (!issuers || issuers.length === 0) {
                throw new Error('No OpenID4VC issuers found. Agent initialization may have failed.')
            }
            const openId4VcIssuer = issuers[0]

            // Create credential offer using the Credo API
            // This matches the documentation at https://credo.js.org/guides/tutorials/openid4vc/issuing-credentials-using-openid4vc-issuer-module#creating-a-credential-offer
            const { credentialOffer, issuanceSession } = await modules.openId4VcIssuer.createCredentialOffer({
                issuerId: openId4VcIssuer.issuerId,
                offeredCredentials: [request.credentialType], // e.g., 'GenericID'
                preAuthorizedCodeFlowConfig: {
                    userPinRequired: false,
                },
                issuanceMetadata: {
                    claims: request.claims,
                    subjectDid: request.subjectDid,
                }
            })

            // The credentialOffer should contain the URI
            const credentialOfferUri = credentialOffer

            return {
                offerId: issuanceSession.id,
                preAuthorizedCode: issuanceSession.preAuthorizedCode || '',
                credential_offer_uri: typeof credentialOfferUri === 'string' ? credentialOfferUri : JSON.stringify(credentialOfferUri),
                credential_offer_deeplink: `openid-credential-offer://?credential_offer=${encodeURIComponent(typeof credentialOfferUri === 'string' ? credentialOfferUri : JSON.stringify(credentialOfferUri))}`,
                expiresAt: new Date(Date.now() + (request.expiresInMs || 3600000)).toISOString(),
                credentialType,
            }
        } catch (e: any) {
            logger.error({ error: e.message, stack: e.stack }, 'Failed to create native credential offer')
            throw new Error(`Failed to create credential offer: ${e.message}`)
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

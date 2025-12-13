import { WorkflowActionContext } from '../ActionRegistry'
import { rootLogger } from '../../../utils/pinoLogger'
import { OidcIssuerController } from '../../../controllers/oidc/OidcIssuerController'
import { container } from 'tsyringe'

const logger = rootLogger.child({ module: 'CredentialActions' })

export class CredentialActions {
    /**
     * Issues a Credential Offer based on the workflow state.
     * 
     * Config:
     * - credentialDefinitionId: string (optional, overrides workflow default)
     * - mapping: Record<string, string> (JSONPath-like mapping from state to claims)
     */
    static async issueCredential(context: WorkflowActionContext, config: any = {}) {
        logger.info('Preparing credential offer')

        // Resolve OidcIssuerController to use its logic (or refactor Controller to use a Service)
        // For now, we'll simulate the offer creation logic here or call a service if we had one.
        // Since OidcIssuerController has the logic, we should ideally extract it to OidcIssuerService.
        // But to avoid refactoring the whole controller now, we will construct the offer payload here
        // and use the OidcStore directly.

        const { OidcIssuerController } = await import('../../../controllers/oidc/OidcIssuerController')
        const issuerController = container.resolve(OidcIssuerController)

        // 1. Map Data to Claims
        const claims: Record<string, any> = {}
        const mapping = config.mapping || {}

        // Simple mapping: "claimName": "state.finance.grandTotal"
        for (const [claimKey, statePath] of Object.entries(mapping)) {
            const path = (statePath as string).split('.')
            let value: any = context
            for (const p of path) {
                value = value?.[p]
            }
            claims[claimKey] = value
        }

        // Add any unmapped input if configured (e.g. "copyInput": true)
        if (config.copyInput) {
            Object.assign(claims, context.input)
        }

        // 2. Create Offer Request Body
        // We need to construct a fake request body to reuse the controller's method
        // OR better: just call the store directly like the controller does.
        // Let's use the store directly to be cleaner.

        const { saveCredentialOffer } = await import('../../../persistence/OidcStoreRepository')
        const { randomUUID } = await import('crypto')

        const offerId = randomUUID()
        const preAuthorizedCode = randomUUID()
        const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString() // 10 mins

        // Construct the credential payload
        const credentialPayload = {
            type: ['VerifiableCredential', config.type || 'GenericCredential'],
            format: 'jwt_vc',
            claimsTemplate: claims,
            issuerDid: config.issuerDid || 'did:example:issuer'
        }

        saveCredentialOffer({
            offerId,
            preAuthorizedCode,
            credentials: [credentialPayload],
            issuerDid: credentialPayload.issuerDid,
            expiresAt,
            tenantId: context.tenantId
        })

        // 3. Update State with Offer Details
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
        const credential_offer_uri = `${baseUrl}/oidc/credential-offers/${preAuthorizedCode}`

        context.state.offer = {
            offerId,
            preAuthorizedCode,
            credential_offer_uri,
            expiresAt
        }

        logger.info({ offerId }, 'Credential offer created')
    }
}

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

        const { credentialIssuanceService } = await import('../../../services/CredentialIssuanceService')

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

        // 2. Create Offer using Unified Service
        const result = await credentialIssuanceService.createOffer({
            credentialType: config.type || 'GenericCredential',
            claims: claims,
            tenantId: context.tenantId || 'default'
        })

        // 3. Update State with Offer Details
        context.state.offer = result

        logger.info({ offerId: result.offerId }, 'Credential offer created via IssuanceService')
    }
}

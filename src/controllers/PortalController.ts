import { Controller, Get, Route, Tags, Path } from 'tsoa'
import { injectable, container } from 'tsyringe'
import { Agent } from '@credo-ts/core'
import type { RestMultiTenantAgentModules } from '../cliAgent'
import { credentialDefinitionStore } from '../utils/credentialDefinitionStore'

@Route('api')
@Tags('Portal')
@injectable()
export class PortalController extends Controller {

    /**
     * List available credential types for the Portal
     * Returns names/IDs of all credential definitions
     */
    @Get('list')
    public async getCredentialList(): Promise<string[]> {
        const allDefs = credentialDefinitionStore.list()
        // Extract unique credential type names (last element in credentialType array)
        const types = new Set<string>()

        for (const def of allDefs) {
            if (def.credentialType && Array.isArray(def.credentialType)) {
                // Get the specific type (last item, excluding 'VerifiableCredential')
                const lastType = def.credentialType[def.credentialType.length - 1]
                if (lastType && lastType !== 'VerifiableCredential') {
                    types.add(lastType)
                }
            }
        }

        return Array.from(types)
    }

    /**
     * Get credential definition/offer template by credential type
     */
    @Get('vc/{id}')
    public async getCredentialOffer(@Path() id: string): Promise<any> {
        // Find the credential definition for this type
        const allDefs = credentialDefinitionStore.list()
        const def = allDefs.find(d =>
            d.credentialType &&
            Array.isArray(d.credentialType) &&
            d.credentialType.includes(id)
        )

        if (!def) {
            this.setStatus(404)
            return { message: 'Credential not found' }
        }

        // Return in the format expected by the portal
        return {
            id: id,
            title: def.name || id,
            description: `${def.name} credential (v${def.version})`,
            issuer: def.issuerDid,
            credential_definition: {
                type: def.credentialType,
                credentialSubject: def.claimsTemplate?.credentialSubject || {}
            }
        }
    }
}

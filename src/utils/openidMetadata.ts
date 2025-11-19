interface DisplayMapping {
  name?: string
  locale?: string
  description?: string
}

export interface IssuerMetadataInput {
  issuerDid: string
  credentialEndpoint: string
  tokenEndpoint: string
  baseUrl: string
  display?: DisplayMapping
  tenantId?: string
}

export function buildIssuerMetadata(input: IssuerMetadataInput) {
  // Build credential_configurations_supported from credential definitions
  const credentialConfigurations: Record<string, any> = {}
  
  if (input.tenantId) {
    try {
      const { credentialDefinitionStore } = require('./credentialDefinitionStore')
      const definitions = credentialDefinitionStore.list(input.tenantId)
      
      definitions.forEach((def: any) => {
        const configId = `${def.name}_jwt_vc_json`
        credentialConfigurations[configId] = {
          format: 'jwt_vc_json',
          scope: def.name,
          cryptographic_binding_methods_supported: ['did'],
          cryptographic_suites_supported: ['Ed25519Signature2018'],
          credential_definition: {
            type: def.credentialType || ['VerifiableCredential'],
          },
          display: [
            {
              name: def.name,
              locale: 'en-US',
            },
          ],
        }
      })
    } catch (error) {
      // If credential definitions can't be loaded, use empty object
      console.warn('Failed to load credential definitions for metadata:', error)
    }
  }

  return {
    credential_issuer: input.baseUrl,
    issuer: input.issuerDid,
    credential_endpoint: input.credentialEndpoint,
    token_endpoint: input.tokenEndpoint,
    credential_configurations_supported: credentialConfigurations,
    credentials_supported: [
      {
        format: 'jwt_vc',
        types: ['VerifiableCredential'],
        cryptographic_binding_methods_supported: ['did'],
        cryptographic_suites_supported: ['Ed25519Signature2018'],
      },
    ],
    display: input.display ? [input.display] : [],
  }
}

export interface VerifierMetadataInput {
  verifierDid: string
  baseUrl: string
  presentationEndpoint: string
  display?: DisplayMapping
}

export function buildVerifierMetadata(input: VerifierMetadataInput) {
  return {
    issuer: input.verifierDid,
    presentation_endpoint: input.presentationEndpoint,
    display: input.display ? [input.display] : [],
  }
}

interface DisplayMapping {
  name?: string
  locale?: string
  description?: string
}

export interface IssuerMetadataInput {
  issuerDid: string
  issuerUrl: string
  credentialEndpoint: string
  tokenEndpoint: string
  baseUrl: string
  display?: DisplayMapping
  tenantId?: string
}

export function buildIssuerMetadata(input: IssuerMetadataInput) {
  // Build credential_configurations_supported from credential definitions
  const credentialConfigurations: Record<string, any> = {}
  const credentialsSupported: any[] = []

  if (input.tenantId) {
    try {
      const { credentialDefinitionStore } = require('./credentialDefinitionStore')
      const definitions = credentialDefinitionStore.list(input.tenantId)

      definitions.forEach((def: any) => {
        // Support multiple common formats for each definition
        const formats = ['jwt_vc', 'jwt_vc_json']

        formats.forEach(format => {
          const configId = `${def.name}_${format}`
          credentialConfigurations[configId] = {
            format: format,
            scope: def.name,
            cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
            credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
            proof_types_supported: {
              jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
            },
            credential_definition: {
              type: def.credentialType || ['VerifiableCredential', def.name],
            },
            display: [
              {
                name: def.name,
                locale: 'en-US',
              },
            ],
          }

          // Also populate Draft 11 credentials_supported array for native module compatibility
          credentialsSupported.push({
            id: configId,
            format: format,
            types: def.credentialType || ['VerifiableCredential', def.name],
            cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
            cryptographic_suites_supported: ['EdDSA', 'ES256'],
            display: [{ name: def.name }],
          })
        })
      })
    } catch (error) {
      // If credential definitions can't be loaded, use empty object
      console.warn('Failed to load credential definitions for metadata:', error)
    }
  }

  return {
    credential_issuer: input.issuerUrl,
    issuer: input.issuerDid,
    credential_endpoint: input.credentialEndpoint,
    token_endpoint: input.tokenEndpoint,
    credential_configurations_supported: credentialConfigurations,
    credentials_supported: credentialsSupported,
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

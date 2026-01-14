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

        // Some parts of the codebase (and some clients) reference credential configuration IDs
        // by the *credential definition name* (e.g., FinancialStatementDef_jwt_vc_json), while
        // others reference by the *leaf VC type* (e.g., FinancialStatementCredential_jwt_vc_json).
        // To avoid hard-to-debug 500s during offer creation, we advertise BOTH.
        const leafType = Array.isArray(def.credentialType) && def.credentialType.length
          ? def.credentialType[def.credentialType.length - 1]
          : def.name
        const idBases = Array.from(new Set([def.name, leafType].filter(Boolean)))

        formats.forEach((format) => {
          idBases.forEach((base) => {
            const configId = `${base}_${format}`
            if (!credentialConfigurations[configId]) {
              credentialConfigurations[configId] = {
                format: format,
                scope: base,
                cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
                credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
                proof_types_supported: {
                  jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
                },
                credential_definition: {
                  type: def.credentialType || ['VerifiableCredential', base],
                },
                display: [
                  {
                    name: base,
                    locale: 'en-US',
                  },
                ],
              }
            }

            // Also populate Draft 11 credentials_supported array for native module compatibility
            credentialsSupported.push({
              id: configId,
              format: format,
              types: def.credentialType || ['VerifiableCredential', base],
              cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
              cryptographic_suites_supported: ['EdDSA', 'ES256'],
              display: [{ name: base }],
            })
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

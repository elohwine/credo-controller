interface DisplayMapping {
  name?: string
  locale?: string
  description?: string
}

/**
 * DID the holder bound a credential request to, across Credo versions:
 * - 0.7: `{ bindingMethod: 'did', keys: [{ didUrl }] }`
 * - 0.5: `{ method: 'did', did, didUrl }`
 * Returns the bare DID (fragment stripped) or undefined for jwk / attestation bindings.
 */
export function holderBindingDid(holderBinding: unknown): string | undefined {
  if (!holderBinding || typeof holderBinding !== 'object') return undefined
  const binding = holderBinding as Record<string, any>
  const candidates: unknown[] = [
    binding.did,
    binding.didUrl,
    Array.isArray(binding.didUrls) ? binding.didUrls[0] : undefined,
    Array.isArray(binding.keys) ? binding.keys[0]?.didUrl : undefined,
  ]
  const found = candidates.find((value) => typeof value === 'string' && value.startsWith('did:')) as string | undefined
  return found ? found.split('#')[0] : undefined
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

  const issuerUrl = input.issuerUrl ?? input.baseUrl

  if (input.tenantId) {
    try {
      const { credentialDefinitionStore } = require('./credentialDefinitionStore')
      const definitions = credentialDefinitionStore.list(input.tenantId)

      definitions.forEach((def: any) => {
        // Support multiple common formats for each definition
        const formats = ['jwt_vc', 'jwt_vc_json']

        const leafType =
          Array.isArray(def.credentialType) && def.credentialType.length
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
      // eslint-disable-next-line no-console
      console.warn('Failed to load credential definitions for metadata:', error)
    }
  }

  if (!Object.keys(credentialConfigurations).length && !credentialsSupported.length) {
    credentialsSupported.push({
      format: 'jwt_vc',
      types: ['VerifiableCredential'],
      cryptographic_binding_methods_supported: ['did'],
      cryptographic_suites_supported: ['Ed25519Signature2018'],
    })
  }

  const metadata: Record<string, unknown> = {
    credential_issuer: issuerUrl,
    issuer: input.issuerDid,
    credential_endpoint: input.credentialEndpoint,
    token_endpoint: input.tokenEndpoint,
    credentials_supported: credentialsSupported,
    display: input.display ? [input.display] : [],
  }

  if (Object.keys(credentialConfigurations).length > 0) {
    metadata.credential_configurations_supported = credentialConfigurations
  }

  return metadata
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

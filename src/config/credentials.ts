/**
 * Configuration for credential types and their duplication rules
 */

/**
 * Credential types that should only exist once per wallet
 * These are typically identity-based credentials
 */
export const SINGLETON_CREDENTIAL_TYPES = [
    'GenericID',
    'DriverLicense',
    'Passport',
    'NationalID',
    'StudentID',
]

/**
 * Check if a credential type should be unique per wallet
 */
export function isSingletonType(type: string): boolean {
    return SINGLETON_CREDENTIAL_TYPES.includes(type)
}

/**
 * Extract the specific credential type from a VC type array
 * VCs have a type array like ["VerifiableCredential", "GenericID"]
 * We want to extract "GenericID"
 */
export function extractCredentialType(types: string[]): string | null {
    if (!Array.isArray(types) || types.length === 0) {
        return null
    }

    // Filter out the base "VerifiableCredential" type
    const specificTypes = types.filter(t => t !== 'VerifiableCredential')

    // Return the first specific type, or null if none found
    return specificTypes.length > 0 ? specificTypes[0] : null
}

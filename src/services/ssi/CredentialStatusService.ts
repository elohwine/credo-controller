import type { CredentialStatus } from './SsiTypes'

/**
 * Credential-status boundary for the platform.
 *
 * Business services must not know how status is published. The production
 * implementation will resolve W3C Bitstring Status List entries here and
 * fail closed when status cannot be authoritatively validated.
 */
export interface CredentialStatusResult {
  status: CredentialStatus
  checked: boolean
  reasonCode?: string
}

export interface CredentialStatusResolver {
  resolve(input: {
    credentialId?: string
    credentialStatus?: unknown
    issuerRef?: string
  }): Promise<CredentialStatusResult>
}

export class CredentialStatusService implements CredentialStatusResolver {
  async resolve(input: {
    credentialId?: string
    credentialStatus?: unknown
    issuerRef?: string
  }): Promise<CredentialStatusResult> {
    if (!input.credentialStatus) {
      return {
        status: 'unknown',
        checked: false,
        reasonCode: 'credential_status_not_present',
      }
    }

    return {
      status: 'unknown',
      checked: false,
      reasonCode: 'status_resolver_not_configured',
    }
  }
}

export const credentialStatusService = new CredentialStatusService()

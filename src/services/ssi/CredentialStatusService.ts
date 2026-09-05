import type { CredentialStatus } from './SsiTypes'

/**
 * Credential-status boundary for the platform.
 *
 * Business services must not know how status is published. The first
 * implementation is deliberately conservative: until a credential carries
 * an authoritative status mechanism that the verifier can validate, status
 * remains `unknown` rather than being inferred from application state.
 *
 * The production implementation will resolve W3C Bitstring Status List 1.0
 * entries (or an equivalent format required by the credential profile).
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

    // Parsing/publishing of Bitstring Status List credentials belongs here,
    // not in request or workflow code. Do not guess a credential's status.
    return {
      status: 'unknown',
      checked: false,
      reasonCode: 'status_resolver_not_configured',
    }
  }
}

export const credentialStatusService = new CredentialStatusService()

import type { Request as ExRequest } from 'express'

import { StatusException } from '../errors'

import { type DeviceAssertion, deviceTrustRequired, deviceTrustService } from './DeviceTrustService'
import { getOrCreateOrgProofVcPolicy } from './ProofVcPolicyService'

export function walletTenantIdOf(request: ExRequest): string | undefined {
  const user = (request as any).user || {}
  return String(user.walletTenantId || user.personalTenantId || user.holderTenantId || '').trim() || undefined
}

export function readDeviceAssertion(body: unknown): DeviceAssertion | undefined {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).deviceAssertion : undefined
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const assertion: DeviceAssertion = {
    deviceKeyId: String(record.deviceKeyId || ''),
    nonce: String(record.nonce || ''),
    purpose: String(record.purpose || ''),
    signedAt: String(record.signedAt || ''),
    signature: String(record.signature || ''),
  }
  if (!assertion.deviceKeyId || !assertion.nonce || !assertion.signature) return undefined
  return assertion
}

/**
 * When the organisation requires a phone confirmation for this step, the request
 * must carry a fresh signature from an enrolled hardware key. A browser cannot
 * satisfy this. Organisations that have not turned the setting on are unchanged.
 */
export function requireDeviceTrust(input: {
  request: ExRequest
  orgTenantId: string | undefined
  stageAction: string
  body: unknown
  walletTenantId?: string
  transaction?: Record<string, unknown>
}): void {
  if (!input.orgTenantId || !deviceTrustRequired(getOrCreateOrgProofVcPolicy(input.orgTenantId).deviceTrust, input.stageAction)) {
    return
  }
  const walletTenantId = input.walletTenantId || walletTenantIdOf(input.request)
  const assertion = readDeviceAssertion(input.body)
  if (!walletTenantId || !assertion) {
    throw new StatusException(
      'This step must be confirmed with fingerprint or face on the enrolled phone. A browser cannot release this money.',
      403,
    )
  }
  deviceTrustService.verifyAssertion({
    walletTenantId,
    assertion,
    purpose: input.stageAction,
    transaction: input.transaction,
  })
}

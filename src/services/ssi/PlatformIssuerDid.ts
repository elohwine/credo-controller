import type { AgentContext } from '@credo-ts/core'

import { DidsApi, GenericRecordsApi } from '@credo-ts/core'

/**
 * The platform's own issuer DID (root agent). It signs platform credentials such as
 * PlatformIdentityVC and is never used as a holder key: people hold credentials in their own
 * tenant wallets. Pinned in a generic record so it stays stable when more root DIDs are created.
 * `PLATFORM_ISSUER_DID` may name a different root-created DID.
 */
const RECORD_ID = 'platform-issuer-did'
let cached: string | undefined

export function isRootContext(agentContext: AgentContext): boolean {
  return agentContext.contextCorrelationId === 'default'
}

export async function platformIssuerDid(agentContext: AgentContext): Promise<string> {
  if (cached) return cached
  const dids = agentContext.dependencyManager.resolve(DidsApi)
  const records = agentContext.dependencyManager.resolve(GenericRecordsApi)

  const configured = (process.env.PLATFORM_ISSUER_DID || '').trim()
  if (configured) {
    const [owned] = await dids.getCreatedDids({ did: configured })
    if (!owned) throw new Error('PLATFORM_ISSUER_DID is not a DID this platform created')
    cached = configured
    return configured
  }

  const pinned = await records.findById(RECORD_ID)
  const pinnedDid = typeof pinned?.content?.did === 'string' ? pinned.content.did : undefined
  if (pinnedDid && (await dids.getCreatedDids({ did: pinnedDid })).length > 0) {
    cached = pinnedDid
    return pinnedDid
  }

  // First run: keep the DID existing platform credentials were signed with, or create one.
  const [existing] = await dids.getCreatedDids({ method: 'key' })
  const did =
    existing?.did ||
    (await dids.create({ method: 'key', options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } } })).didState
      .did
  if (!did) throw new Error('Could not create the platform issuer DID')
  if (pinned) await records.deleteById(RECORD_ID)
  await records.save({ id: RECORD_ID, content: { did }, tags: { purpose: 'platform-issuer' } })
  cached = did
  return did
}

/** Test hook. */
export function resetPlatformIssuerDidCache(): void {
  cached = undefined
}

/**
 * The DID that signs a credential in this context. An organisation's record is signed with the
 * organisation's own DID when this wallet holds it (offers made from the organisation's issuer);
 * the root context signs with the platform DID; any other tenant falls back to its first DID.
 */
export async function signingDidFor(agentContext: AgentContext, preferredDid?: string): Promise<string> {
  const dids = agentContext.dependencyManager.resolve(DidsApi)
  if (preferredDid) {
    const [held] = await dids.getCreatedDids({ did: preferredDid })
    if (held) return preferredDid
  }
  if (isRootContext(agentContext)) return platformIssuerDid(agentContext)
  const [first] = await dids.getCreatedDids({ method: 'key' })
  if (first?.did) return first.did
  const did = (await dids.create({ method: 'key', options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } } }))
    .didState.did
  if (!did) throw new Error('Could not create an issuer DID for this organisation')
  return did
}

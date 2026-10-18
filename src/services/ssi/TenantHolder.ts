import { Agent, SdJwtVcRecord, W3cCredentialRecord, W3cCredentialService } from '@credo-ts/core'
import { container } from 'tsyringe'

import { pickOfferResolutionError } from './offerClassification'

/**
 * Holder custody: every person (and every organisation) holds credentials in its OWN tenant wallet,
 * bound to a key only that wallet has. Accepting an offer and signing a presentation both run on
 * the tenant agent, so the platform's issuer key is never a holder key.
 */
export type TenantHolderAgent = any

function rootAgent(): Agent<any> {
  return container.resolve(Agent as unknown as new (...args: any[]) => Agent<any>)
}

/** Opens the tenant wallet, runs `fn` with its agent and always ends the session. */
export async function withTenantHolder<T>(
  tenantId: string,
  fn: (tenantAgent: TenantHolderAgent) => Promise<T>,
  baseAgent: Agent<any> = rootAgent(),
): Promise<T> {
  if (!tenantId) throw new Error('A wallet is required to hold credentials')
  const tenantAgent = await (baseAgent.modules as any).tenants.getTenantAgent({ tenantId })
  try {
    if (!tenantAgent?.openid4vc?.holder) throw new Error('The wallet holder is not available for this account')
    return await fn(tenantAgent)
  } finally {
    await tenantAgent?.endSession?.()
  }
}

/** did:key needs a fragment to name the key. */
export function didKeyUrl(did: string): string {
  if (did.startsWith('did:key:') && !did.includes('#')) return `${did}#${did.slice('did:key:'.length)}`
  return did
}

/**
 * The wallet's holder DID: the first did:key it created (registration provisions it, so it equals
 * `ssi_users.did`). A wallet without one gets a fresh Ed25519 did:key in its own storage.
 */
export async function tenantHolderDid(tenantAgent: TenantHolderAgent): Promise<string> {
  const created = await tenantAgent.dids.getCreatedDids({ method: 'key' })
  if (created.length > 0) return created[0].did as string
  const result = await tenantAgent.dids.create({
    method: 'key',
    options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
  })
  const did = result?.didState?.did
  if (!did) throw new Error('Could not create a holder key for this wallet')
  return did as string
}

/** Binding resolver for Credo `requestCredentials`: the credential is bound to the wallet's own DID. */
export function didBindingResolver(holderDidUrl: string) {
  return async () => ({ method: 'did' as const, didUrls: [holderDidUrl], didUrl: holderDidUrl })
}

export interface RedeemedOffer {
  /** Id of the last stored record (W3C or SD-JWT). */
  savedCredentialId: string
  storedRecords: { id: string; kind: 'w3c' | 'sd-jwt' }[]
  acceptedTypes: string[]
  issuerDid: string
  holderDid: string
}

/** Credo 0.7 two-step pre-authorized flow, with the 0.5 single call as a fallback. */
async function requestCredentials(holder: any, resolvedOffer: any, holderDidUrl: string): Promise<any[]> {
  const credentialBindingResolver = didBindingResolver(holderDidUrl)
  if (typeof holder.requestToken === 'function' && typeof holder.requestCredentials === 'function') {
    const tokenResponse = await holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const result = await holder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
      dpop: tokenResponse.dpop,
      verifyCredentialStatus: false,
      credentialBindingResolver,
    })
    return Array.isArray(result?.credentials) ? result.credentials : Array.isArray(result) ? result : []
  }
  if (typeof holder.acceptCredentialOfferUsingPreAuthorizedCode === 'function') {
    const legacy = await holder.acceptCredentialOfferUsingPreAuthorizedCode(resolvedOffer, {
      verifyCredentialStatus: false,
      credentialBindingResolver,
    })
    return Array.isArray(legacy) ? legacy : []
  }
  throw new Error('OpenID4VC holder module does not expose a credential request API')
}

/**
 * Redeem a credential offer into the tenant wallet: the offer is resolved and redeemed by that
 * wallet, the credential is bound to the wallet's own DID and stored there. The first candidate
 * URI that resolves is used.
 */
export async function redeemOfferIntoWallet(
  tenantAgent: TenantHolderAgent,
  offerCandidates: string[],
): Promise<RedeemedOffer> {
  const holder = tenantAgent.openid4vc.holder
  let resolvedOffer: any
  const errors: any[] = []
  for (const candidate of offerCandidates) {
    try {
      resolvedOffer = await holder.resolveCredentialOffer(candidate)
      break
    } catch (error: any) {
      errors.push(error)
    }
  }
  if (!resolvedOffer) throw pickOfferResolutionError(errors)

  const holderDid = await tenantHolderDid(tenantAgent)
  const received = await requestCredentials(holder, resolvedOffer, didKeyUrl(holderDid))

  const out: RedeemedOffer = { savedCredentialId: '', storedRecords: [], acceptedTypes: [], issuerDid: '', holderDid }
  const acceptedTypes = new Set<string>()
  const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)
  for (const item of received) {
    const record: any = item?.record ?? item
    const credential: any = record?.firstCredential ?? record?.credential ?? record
    // Selective-disclosure card: keep the whole SD-JWT so a later share reveals only named claims.
    if (record?.type === 'SdJwtVcRecord' || typeof credential?.compact === 'string') {
      const sdRecord = record?.type === 'SdJwtVcRecord' ? record : SdJwtVcRecord.fromSdJwtVc(credential)
      const vct = String(sdRecord.firstCredential?.payload?.vct || sdRecord.getTags?.()?.vct || '')
      if (vct) acceptedTypes.add(vct)
      const iss = sdRecord.firstCredential?.payload?.iss
      if (typeof iss === 'string') out.issuerDid = out.issuerDid || iss
      const stored = await tenantAgent.sdJwtVc.store({ record: sdRecord })
      out.savedCredentialId = stored.id
      out.storedRecords.push({ id: stored.id, kind: 'sd-jwt' })
      continue
    }
    // Only array `type` fields are credential types (`record.type` is the record class name).
    const asTypeList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
    ;[...asTypeList(credential?.type), ...asTypeList(credential?.vc?.type), ...asTypeList(record?.vc?.type)]
      .filter(Boolean)
      .forEach((type) => acceptedTypes.add(type))
    const issuer = credential?.issuer ?? record?.issuer
    out.issuerDid = out.issuerDid || (typeof issuer === 'string' ? issuer : issuer?.id || '')
    const recordToStore =
      record instanceof W3cCredentialRecord
        ? record
        : typeof credential?.encoded === 'string' || credential?.type
          ? W3cCredentialRecord.fromCredential(credential)
          : record
    const stored = await w3cService.storeCredential(tenantAgent.context, { record: recordToStore })
    out.savedCredentialId = stored.id
    out.storedRecords.push({ id: stored.id, kind: 'w3c' })
  }
  out.acceptedTypes = [...acceptedTypes]
  return out
}

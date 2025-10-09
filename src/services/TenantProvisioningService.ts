import type { Agent } from '@credo-ts/core'
import type { TenantRecord } from '@credo-ts/tenants'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'

import { KeyType } from '@credo-ts/core'

import { upsertTenant } from '../persistence/TenantRepository'
import { didStore } from '../utils/didStore'
import { buildIssuerMetadata, buildVerifierMetadata } from '../utils/openidMetadata'

export interface TenantProvisioningParams {
  agent: Agent<any>
  tenantRecord: TenantRecord
  baseUrl?: string
  displayName?: string
}

export interface TenantProvisioningResult {
  issuerDid: string
  issuerKid: string
  verifierDid: string
  verifierKid: string
  metadata: {
    issuer: Record<string, unknown>
    verifier: Record<string, unknown>
  }
  askarProfile: string
}

export async function provisionTenantResources({ agent, tenantRecord, baseUrl, displayName }: TenantProvisioningParams) {
  const defaultEndpoint = extractConfigEndpoint(tenantRecord)
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl ?? defaultEndpoint ?? process.env.PUBLIC_BASE_URL)

  if (!resolvedBaseUrl) {
    throw new Error('Tenant provisioning requires a base URL. Provide baseUrl or configure PUBLIC_BASE_URL or agent endpoints.')
  }

  const displayLabel = displayName ?? tenantRecord.config?.label ?? tenantRecord.id
  const display = displayLabel
    ? {
        name: displayLabel,
        description: `${displayLabel} OpenID endpoints`,
        locale: 'en-US',
      }
    : undefined

  const result = await agent.modules.tenants.withTenantAgent({ tenantId: tenantRecord.id }, async (tenantAgent: TenantAgent<any>) => {
    const issuerDidState = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
    if (issuerDidState.didState.state !== 'finished') {
      throw new Error('Failed to create issuer DID for tenant')
    }
    const issuerDid = issuerDidState.didState.did
    const issuerVm = issuerDidState.didState.didDocument?.verificationMethod?.[0]
    const issuerKid = issuerVm?.id ?? `${issuerDid}#key-1`

    const verifierDidState = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
    if (verifierDidState.didState.state !== 'finished') {
      throw new Error('Failed to create verifier DID for tenant')
    }
    const verifierDid = verifierDidState.didState.did
    const verifierVm = verifierDidState.didState.didDocument?.verificationMethod?.[0]
    const verifierKid = verifierVm?.id ?? `${verifierDid}#key-1`

    const issuerMetadata = buildIssuerMetadata({
      issuerDid,
      baseUrl: resolvedBaseUrl,
      credentialEndpoint: `${resolvedBaseUrl}/oidc/token`,
      tokenEndpoint: `${resolvedBaseUrl}/oidc/token`,
      display,
    })

    const verifierMetadata = buildVerifierMetadata({
      verifierDid,
      baseUrl: resolvedBaseUrl,
      presentationEndpoint: `${resolvedBaseUrl}/oidc/verifier/verify`,
      display,
    })

    await tenantAgent.genericRecords.save({
      id: `tenant:${tenantRecord.id}:issuer`,
      content: {
        did: issuerDid,
        kid: issuerKid,
        metadata: issuerMetadata,
      },
      tags: { tenantId: tenantRecord.id, type: 'issuer' },
    })

    await tenantAgent.genericRecords.save({
      id: `tenant:${tenantRecord.id}:verifier`,
      content: {
        did: verifierDid,
        kid: verifierKid,
        metadata: verifierMetadata,
      },
      tags: { tenantId: tenantRecord.id, type: 'verifier' },
    })

    const issuerPkBase58 = extractPublicKeyBase58(issuerVm)
    if (issuerPkBase58) {
      didStore.save({
        did: issuerDid,
        keyRef: issuerKid,
        method: 'key',
        createdAt: new Date().toISOString(),
        type: 'key',
        publicKeyBase58: issuerPkBase58,
        keyType: 'Ed25519',
        didDocument: issuerDidState.didState.didDocument?.toJSON?.() ?? issuerDidState.didState.didDocument,
      })
    }

    const verifierPkBase58 = extractPublicKeyBase58(verifierVm)
    if (verifierPkBase58) {
      didStore.save({
        did: verifierDid,
        keyRef: verifierKid,
        method: 'key',
        createdAt: new Date().toISOString(),
        type: 'key',
        publicKeyBase58: verifierPkBase58,
        keyType: 'Ed25519',
        didDocument: verifierDidState.didState.didDocument?.toJSON?.() ?? verifierDidState.didState.didDocument,
      })
    }

    return {
      issuerDid,
      issuerKid,
      verifierDid,
      verifierKid,
      metadata: {
        issuer: issuerMetadata,
        verifier: verifierMetadata,
      },
      askarProfile: tenantAgent.wallet?.walletConfig?.id || tenantRecord.id,
    }
  })

  upsertTenant({
    id: tenantRecord.id,
    label: tenantRecord.config?.label ?? tenantRecord.id,
    status: 'ACTIVE',
    createdAt: tenantRecord.createdAt?.toISOString?.() ?? new Date().toISOString(),
    issuerDid: result.issuerDid,
    issuerKid: result.issuerKid,
    verifierDid: result.verifierDid,
    verifierKid: result.verifierKid,
    askarProfile: result.askarProfile,
    metadata: result.metadata,
  })

  return result satisfies TenantProvisioningResult
}

function normalizeBaseUrl(base?: string | null) {
  if (!base) return undefined
  return base.replace(/\/+$/, '')
}

function extractConfigEndpoint(tenantRecord: TenantRecord): string | undefined {
  const endpoints = (tenantRecord.config as any)?.endpoints
  if (Array.isArray(endpoints) && typeof endpoints[0] === 'string') {
    return endpoints[0]
  }
  return undefined
}

function extractPublicKeyBase58(verificationMethod?: any): string | undefined {
  if (!verificationMethod) return undefined
  if (verificationMethod.publicKeyBase58) return verificationMethod.publicKeyBase58
  if (typeof verificationMethod.publicKeyMultibase === 'string') {
    const multibase = verificationMethod.publicKeyMultibase
    if (multibase.startsWith('z')) return multibase.slice(1)
  }
  return undefined
}

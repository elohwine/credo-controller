import type { Agent } from '@credo-ts/core'
import type { TenantRecord } from '@credo-ts/tenants'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'

import { KeyType } from '@credo-ts/core'

import { upsertTenant } from '../persistence/TenantRepository'
import { didStore } from '../utils/didStore'
import { issuerMetadataCache } from '../utils/issuerMetadataCache'
import { buildIssuerMetadata, buildVerifierMetadata } from '../utils/openidMetadata'
import { registerDefaultModelsForTenant } from './modelRegistry'

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
    // Determine type (default to USER if not specified in config)
    // We pass tenantType from params or legacy config
    const tenantType = (tenantRecord.config as any)?.tenantType || 'USER'
    const domain = (tenantRecord.config as any)?.domain

    console.log(`[Provisioning] Tenant ${tenantRecord.id} type: ${tenantType}`)

    if (tenantType === 'USER') {
      // === USER TENANT (HOLDER ONLY) ===
      // 1. Create Holder DID (did:key)
      const holderDidResult = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
      const holderDid = holderDidResult.didState.did
      const holderVm = holderDidResult.didState.didDocument?.verificationMethod?.[0]
      const holderKid = holderVm?.id ?? `${holderDid}#key-1`

      if (!holderDid) throw new Error('Failed to create Holder DID')

      console.log(`[Provisioning] Created Holder DID: ${holderDid}`)

      // 2. Return result properly
      // Note: We populate issuerDid/verifierDid with the Holder DID to satisfy NOT NULL constraints in DB,
      // but we do NOT generate issuer metadata or register the tenant as a published issuer.
      return {
        issuerDid: holderDid, // Placeholder
        issuerKid: holderKid, // Placeholder
        verifierDid: holderDid, // Placeholder
        verifierKid: holderKid, // Placeholder
        metadata: {
          issuer: {},   // Empty = Not an Issuer
          verifier: {}, // Empty = Not a Verifier
        },
        askarProfile: tenantAgent.wallet?.walletConfig?.id || tenantRecord.id,
      }
    }

    // === ORG TENANT (ISSUER / VERIFIER) ===
    // Legacy logic for full issuer setup

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

    // Seed default VC models (schemas + credential definitions) for this tenant ONLY if ORG
    if (tenantType === 'ORG') {
      try {
        await registerDefaultModelsForTenant({ issuerDid, tenantId: tenantRecord.id })
        console.log(`[Provisioning] Default models registered for ORG tenant ${tenantRecord.id}`)
      } catch (e) {
        console.warn('Failed to seed default VC models for tenant', { err: (e as Error).message })
      }
    }

    const issuerUrl = `${resolvedBaseUrl}/tenants/${tenantRecord.id}`

    const issuerMetadata = buildIssuerMetadata({
      issuerDid,
      issuerUrl,
      baseUrl: resolvedBaseUrl,
      credentialEndpoint: `${resolvedBaseUrl}/oidc/token`,
      tokenEndpoint: `${resolvedBaseUrl}/oidc/token`,
      display,
      tenantId: tenantRecord.id,
    })

    const verifierMetadata = buildVerifierMetadata({
      verifierDid,
      baseUrl: resolvedBaseUrl,
      presentationEndpoint: `${resolvedBaseUrl}/oidc/verifier/verify`,
      display,
    })

    // Create or Update native OpenID4VC Issuer record in the tenant wallet
    try {
      const existingIssuers = await (tenantAgent.modules as any).openId4VcIssuer.getAllIssuers();

      const newCredentialsSupported = (issuerMetadata as any).credentials_supported || [];
      const newDisplay = (issuerMetadata as any).display || [];

      if (existingIssuers && existingIssuers.length > 0) {
        // Reuse the first issuer found
        const existingIssuer = existingIssuers[0];
        console.log(`[Provisioning] Reuse existing OpenID4VC issuer ${existingIssuer.issuerId} for tenant ${tenantRecord.id}`);

        await (tenantAgent.modules as any).openId4VcIssuer.updateIssuerMetadata({
          issuerId: existingIssuer.issuerId,
          credentialsSupported: newCredentialsSupported,
          display: newDisplay,
        });
      } else {
        // Only create if none exist
        await (tenantAgent.modules as any).openId4VcIssuer.createIssuer({
          credentialsSupported: newCredentialsSupported,
          display: newDisplay,
        });
        console.log(`[Provisioning] Created new native OpenID4VC issuer for tenant ${tenantRecord.id}`);
      }

      // Create or Update native OpenID4VC Verifier record in the tenant wallet
      const existingVerifiers = await (tenantAgent.modules as any).openId4VcVerifier.getAllVerifiers();
      if (existingVerifiers && existingVerifiers.length > 0) {
        console.log(`[Provisioning] Reuse existing OpenID4VC verifier for tenant ${tenantRecord.id}`);
      } else {
        await (tenantAgent.modules as any).openId4VcVerifier.createVerifier({
          // Verifier doesn't have complex metadata in this version of Credo, 
          // but we initialize the record so it's ready.
        });
        console.log(`[Provisioning] Created new native OpenID4VC verifier for tenant ${tenantRecord.id}`);
      }
    } catch (e) {
      console.warn('[Provisioning] Failed to create/update native OpenID4VC issuer/verifier', { err: (e as Error).message });
    }

    await tenantAgent.genericRecords.save({
      id: `tenant:${tenantRecord.id}:issuer`,
      content: {
        did: issuerDid,
        kid: issuerKid,
        metadata: issuerMetadata,
      },
      tags: { tenantId: tenantRecord.id, type: 'issuer' },
    })

    // Populate in-memory cache for scoped fetch (avoids HTTP loopback)
    issuerMetadataCache.set(issuerUrl, issuerMetadata, issuerDid, issuerKid, tenantRecord.id)

    await tenantAgent.genericRecords.save({
      id: `tenant:${tenantRecord.id}:verifier`,
      content: {
        did: verifierDid,
        kid: verifierKid,
        metadata: verifierMetadata,
      },
      tags: { tenantId: tenantRecord.id, type: 'verifier' },
    })

    // ... (DID Store saving logic remains same, just moved down) ... 
    // Optimization: Only save DIDs if we created them as Issuer/Verifier

    // Save Issuer Key
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

    // Save Verifier Key
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

  // Extract config again for upsert
  const tenantType = (tenantRecord.config as any)?.tenantType || 'USER'
  const domain = (tenantRecord.config as any)?.domain

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
    tenantType: tenantType,
    domain: domain
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

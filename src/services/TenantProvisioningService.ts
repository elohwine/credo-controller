import type { Agent, KeyDidCreateOptions } from '@credo-ts/core'
import type { TenantRecord } from '@credo-ts/tenants'
import type { TenantAgent } from '@credo-ts/tenants'

import { getTenantById, upsertTenant } from '../persistence/TenantRepository'
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

export async function provisionTenantResources({
  agent,
  tenantRecord,
  baseUrl,
  displayName,
}: TenantProvisioningParams) {
  const defaultEndpoint = extractConfigEndpoint(tenantRecord)
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl ?? defaultEndpoint ?? process.env.PUBLIC_BASE_URL)

  if (!resolvedBaseUrl) {
    throw new Error(
      'Tenant provisioning requires a base URL. Provide baseUrl or configure PUBLIC_BASE_URL or agent endpoints.',
    )
  }

  const displayLabel = displayName ?? tenantRecord.config?.label ?? tenantRecord.id
  const display = displayLabel
    ? {
        name: displayLabel,
        description: `${displayLabel} OpenID endpoints`,
        locale: 'en-US',
      }
    : undefined

  const result = await agent.modules.tenants.withTenantAgent(
    { tenantId: tenantRecord.id },
    async (tenantAgent: TenantAgent<any>) => {
      // Default to ORG for tenant onboarding so newly created tenants are issuer-capable.
      // USER should be explicit when a holder-only tenant is required.
      const tenantType = (tenantRecord.config as any)?.tenantType || 'ORG'
      const domain = (tenantRecord.config as any)?.domain

      // eslint-disable-next-line no-console
      console.log(`[Provisioning] Tenant ${tenantRecord.id} type: ${tenantType}`)

      if (tenantType === 'USER') {
        const holder = await getOrCreateTenantDid(tenantAgent, tenantRecord.id, 'holder')

        // eslint-disable-next-line no-console
        console.log(`[Provisioning] Holder DID ready: ${holder.did}`)

        return {
          issuerDid: holder.did,
          issuerKid: holder.kid,
          verifierDid: holder.did,
          verifierKid: holder.kid,
          metadata: {
            issuer: {},
            verifier: {},
          },
          askarProfile: tenantRecord.id,
        }
      }

      const issuer = await getOrCreateTenantDid(tenantAgent, tenantRecord.id, 'issuer')
      const verifier = await getOrCreateTenantDid(tenantAgent, tenantRecord.id, 'verifier')
      const issuerDid = issuer.did
      const verifierDid = verifier.did

      await registerDefaultModelsForTenant({ issuerDid, tenantId: tenantRecord.id })
      // eslint-disable-next-line no-console
      console.log(`[Provisioning] Default models registered for ORG tenant ${tenantRecord.id}`)

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

      const existingIssuers =
        (await (tenantAgent as any).openid4vc?.issuer?.getAllIssuers?.()) ??
        (tenantAgent.modules as any).openId4VcIssuer.getAllIssuers()

      const newCredentialsSupported = (issuerMetadata as any).credentials_supported || []
      const newCredentialConfigurationsSupported =
        (issuerMetadata as any).credential_configurations_supported ||
        Object.fromEntries(
          newCredentialsSupported.filter((c: any) => typeof c?.id === 'string' && !!c.id).map((c: any) => [c.id, c]),
        )
      const newDisplay = (issuerMetadata as any).display || []

      if (existingIssuers && existingIssuers.length > 0) {
        const existingIssuer = existingIssuers[0]
        await (tenantAgent as any).openid4vc?.issuer?.updateIssuerMetadata?.({
          issuerId: existingIssuer.issuerId,
          credentialConfigurationsSupported: newCredentialConfigurationsSupported,
          display: newDisplay,
        })
      } else {
        await (tenantAgent as any).openid4vc?.issuer?.createIssuer?.({
          credentialConfigurationsSupported: newCredentialConfigurationsSupported,
          display: newDisplay,
        })
      }

      const existingVerifiers =
        (await (tenantAgent as any).openid4vc?.verifier?.getAllVerifiers?.()) ??
        (tenantAgent.modules as any).openId4VcVerifier.getAllVerifiers()
      if (!existingVerifiers || existingVerifiers.length === 0) {
        await (tenantAgent as any).openid4vc?.verifier?.createVerifier?.({})
      }

      await saveTenantDidRecord(tenantAgent, tenantRecord.id, 'issuer', {
        did: issuerDid,
        kid: issuer.kid,
        metadata: issuerMetadata,
      })

      // Populate in-memory cache for scoped fetch (avoids HTTP loopback)
      issuerMetadataCache.set(issuerUrl, issuerMetadata, issuerDid, issuer.kid, tenantRecord.id)

      await saveTenantDidRecord(tenantAgent, tenantRecord.id, 'verifier', {
        did: verifierDid,
        kid: verifier.kid,
        metadata: verifierMetadata,
      })

      const issuerPkBase58 = extractPublicKeyBase58(issuer.verificationMethod)
      if (issuerPkBase58) {
        didStore.save({
          did: issuerDid,
          keyRef: issuer.kid,
          method: 'key',
          createdAt: new Date().toISOString(),
          type: 'key',
          publicKeyBase58: issuerPkBase58,
          keyType: 'Ed25519',
          didDocument: issuer.didDocument.toJSON?.() ?? issuer.didDocument,
        })
      }

      const verifierPkBase58 = extractPublicKeyBase58(verifier.verificationMethod)
      if (verifierPkBase58) {
        didStore.save({
          did: verifierDid,
          keyRef: verifier.kid,
          method: 'key',
          createdAt: new Date().toISOString(),
          type: 'key',
          publicKeyBase58: verifierPkBase58,
          keyType: 'Ed25519',
          didDocument: verifier.didDocument.toJSON?.() ?? verifier.didDocument,
        })
      }

      return {
        issuerDid,
        issuerKid: issuer.kid,
        verifierDid,
        verifierKid: verifier.kid,
        metadata: {
          issuer: issuerMetadata,
          verifier: verifierMetadata,
        },
        askarProfile: tenantRecord.id,
      }
    },
  )

  // Extract config again for upsert
  const tenantType = (tenantRecord.config as any)?.tenantType || 'ORG'
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
    domain: domain,
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

type TenantDidRole = 'holder' | 'issuer' | 'verifier'

export async function getOrCreateTenantDid(tenantAgent: TenantAgent<any>, tenantId: string, role: TenantDidRole) {
  const recordId = `tenant:${tenantId}:${role}`
  let record = await tenantAgent.genericRecords.findById(recordId)

  if (!record && role !== 'holder') {
    const persistedTenant = getTenantById(tenantId)
    if (persistedTenant?.tenantType === 'ORG') {
      const did = role === 'issuer' ? persistedTenant.issuerDid : persistedTenant.verifierDid
      const kid = role === 'issuer' ? persistedTenant.issuerKid : persistedTenant.verifierKid
      record = await tenantAgent.genericRecords.save({
        id: recordId,
        content: { did, kid },
        tags: { tenantId, type: role },
      })
    }
  }

  if (record) {
    const did = typeof record.content.did === 'string' ? record.content.did : undefined
    const kid = typeof record.content.kid === 'string' ? record.content.kid : undefined
    if (!did || !kid) throw new Error(`Tenant ${role} DID record is incomplete for tenant ${tenantId}`)

    const [ownedDid] = await tenantAgent.dids.getCreatedDids({ did })
    if (!ownedDid) throw new Error(`Tenant ${role} DID record points to a DID not owned by tenant ${tenantId}`)

    const didDocument = await tenantAgent.dids.resolveDidDocument(did)
    const verificationMethod = didDocument.verificationMethod?.find((method) => method.id === kid)
    if (!verificationMethod) throw new Error(`Tenant ${role} DID verification method ${kid} cannot be resolved`)
    return { did, kid, didDocument, verificationMethod }
  }

  const didResult = await createKeyDidForTenant(tenantAgent, role)
  const did = didResult.didState.did
  const didDocument = didResult.didState.didDocument
  const verificationMethod = didDocument?.verificationMethod?.[0]
  if (!did || !didDocument || !verificationMethod?.id) {
    throw new Error(`Failed to create ${role} DID for tenant: DID document or verification method is missing`)
  }

  const kid = verificationMethod.id
  await tenantAgent.genericRecords.save({
    id: recordId,
    content: { did, kid },
    tags: { tenantId, type: role },
  })

  return { did, kid, didDocument, verificationMethod }
}

async function saveTenantDidRecord(
  tenantAgent: TenantAgent<any>,
  tenantId: string,
  role: 'issuer' | 'verifier',
  content: Record<string, unknown>,
) {
  const record = await tenantAgent.genericRecords.findById(`tenant:${tenantId}:${role}`)
  if (!record) throw new Error(`Tenant ${role} DID record is missing for tenant ${tenantId}`)
  record.content = { ...record.content, ...content }
  await tenantAgent.genericRecords.update(record)
}

async function createKeyDidForTenant(tenantAgent: TenantAgent<any>, role: TenantDidRole) {
  const didResult = await tenantAgent.dids.create<KeyDidCreateOptions>({
    method: 'key',
    options: {
      createKey: {
        type: {
          kty: 'OKP',
          crv: 'Ed25519',
        },
      },
    },
  })

  if (didResult.didState.state !== 'finished') {
    const reason = didResult.didState.state === 'failed' ? didResult.didState.reason : 'unknown'
    throw new Error(`Failed to create ${role} DID for tenant: state=${didResult.didState.state}, reason=${reason}`)
  }

  return didResult
}

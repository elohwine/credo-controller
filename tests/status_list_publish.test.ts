import 'reflect-metadata'
import type { W3cJwtVerifiableCredential } from '@credo-ts/core'

import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  W3cCredentialsModule,
  W3cJwtVerifiableCredential as JwtVc,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { statusListAllocatorService } from '../src/services/ssi/StatusListAllocatorService'
import { statusListPublisherService } from '../src/services/ssi/StatusListPublisherService'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

async function makeAgent(name: string) {
  const agent = new Agent({
    config: { label: name } as any,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar: askarNodeJS,
        store: { id: `${name}-${randomUUID()}`, key: name, database: { type: 'sqlite', config: { inMemory: true } } },
      }),
      dids: new DidsModule({ registrars: [new KeyDidRegistrar()], resolvers: [new KeyDidResolver()] }),
      w3cCredentials: new W3cCredentialsModule({}),
    },
  } as any)
  await agent.initialize()
  const result = await agent.dids.create({
    method: 'key',
    options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
  } as any)
  return { agent, did: result.didState.did as string }
}

describe('status list publishing', () => {
  let dbs: TestDatabases
  let platform: Awaited<ReturnType<typeof makeAgent>>
  let org: Awaited<ReturnType<typeof makeAgent>>
  let organizationId: string
  let orgTenantId: string
  const tenantCalls: string[] = []
  let root: any
  const previousBase = process.env.PUBLIC_BASE_URL

  beforeAll(async () => {
    process.env.PUBLIC_BASE_URL = 'https://trust.example.test/'
    delete process.env.STATUS_LIST_BASE_URL
    dbs = initTestDatabases('credo-status-list-')
    const seeded = seedOrganization({ name: 'Status List Org' })
    organizationId = seeded.organizationId
    orgTenantId = seeded.orgTenantId
    platform = await makeAgent('platform')
    org = await makeAgent('org')
    // Root agent shape used by the public endpoint: own wallet plus the tenants module.
    root = {
      dids: platform.agent.dids,
      w3cCredentials: platform.agent.w3cCredentials,
      modules: {
        tenants: {
          withTenantAgent: async ({ tenantId }: { tenantId: string }, cb: (a: any) => Promise<void>) => {
            tenantCalls.push(tenantId)
            await cb(org.agent)
          },
        },
      },
    }
  }, 60000)

  afterAll(async () => {
    process.env.PUBLIC_BASE_URL = previousBase
    await platform?.agent.shutdown()
    await org?.agent.shutdown()
    dbs?.cleanup()
  })

  async function verify(jwt: string) {
    const credential = JwtVc.fromSerializedJwt(jwt) as W3cJwtVerifiableCredential
    return platform.agent.w3cCredentials.verifyCredential({ credential } as any)
  }

  it('signs a platform-issued list with the root wallet at a public URL', async () => {
    const allocation = statusListAllocatorService.allocate(
      organizationId,
      platform.did,
      'revocation' as any,
      `vc-${randomUUID()}`,
    )
    expect(allocation.entry.statusListCredential).toBe(
      `https://trust.example.test/status-lists/${allocation.statusListId}`,
    )

    const jwt = await statusListPublisherService.publishWithOwningAgent(allocation.statusListId, root)
    expect(jwt).toBeTruthy()
    const payload = JSON.parse(Buffer.from(jwt!.split('.')[1], 'base64url').toString())
    expect(payload.iss).toBe(platform.did)
    expect(payload.jti).toBe(allocation.entry.statusListCredential)
    expect((await verify(jwt!)).isValid).toBe(true)
  }, 60000)

  it("signs an org-issued list inside the org's own tenant wallet", async () => {
    tenantCalls.length = 0
    const allocation = statusListAllocatorService.allocate(
      organizationId,
      org.did,
      'revocation' as any,
      `vc-${randomUUID()}`,
    )

    const jwt = await statusListPublisherService.publishWithOwningAgent(allocation.statusListId, root)
    expect(tenantCalls).toEqual([orgTenantId])
    const payload = JSON.parse(Buffer.from(jwt!.split('.')[1], 'base64url').toString())
    expect(payload.iss).toBe(org.did)
    expect((await verify(jwt!)).isValid).toBe(true)
  }, 60000)

  it('re-signs after a revocation so the published list carries the new bit', async () => {
    const credentialRef = `vc-${randomUUID()}`
    const allocation = statusListAllocatorService.allocate(organizationId, org.did, 'revocation' as any, credentialRef)
    const before = await statusListPublisherService.publishWithOwningAgent(allocation.statusListId, root)

    statusListAllocatorService.revoke(allocation.allocationId)
    expect(statusListPublisherService.getSignedVc(allocation.statusListId)).toBeNull()

    const after = await statusListPublisherService.publishWithOwningAgent(allocation.statusListId, root)
    const encoded = (jwt: string) =>
      JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).vc.credentialSubject.encodedList
    expect(encoded(after!)).not.toBe(encoded(before!))
    expect(encoded(after!)).toBe(
      statusListAllocatorService.encodeList(statusListAllocatorService.buildBitstringBuffer(allocation.statusListId)),
    )
  }, 60000)

  it('publishes nothing when no wallet holds the issuer DID', async () => {
    const allocation = statusListAllocatorService.allocate(
      organizationId,
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      'revocation' as any,
      `vc-${randomUUID()}`,
    )
    expect(await statusListPublisherService.publishWithOwningAgent(allocation.statusListId, root)).toBeNull()
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT signed_vc_json FROM credential_status_lists WHERE id = ?')
      .get(allocation.statusListId) as { signed_vc_json: string | null }
    expect(row.signed_vc_json).toBeNull()
  }, 60000)
})

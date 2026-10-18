import 'reflect-metadata'
import type { W3cJwtVerifiableCredential } from '@credo-ts/core'

import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  ClaimFormat,
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  W3cCredential,
  W3cCredentialRecord,
  W3cCredentialService,
  W3cCredentialsModule,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'
import { randomUUID } from 'crypto'

import { CustodyRebindService } from '../CustodyRebindService'
import { platformIssuerDid, resetPlatformIssuerDidCache } from '../PlatformIssuerDid'
import { tenantHolderDid, withTenantHolder } from '../TenantHolder'

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
  return agent
}

async function createDid(agent: Agent<any>) {
  const result = await agent.dids.create({
    method: 'key',
    options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
  } as any)
  return { did: result.didState.did as string, vm: result.didState.didDocument!.verificationMethod![0].id }
}

async function storeCredential(
  holder: Agent<any>,
  issuer: { agent: Agent<any>; did: string; vm: string },
  subject: string,
) {
  const credential = new W3cCredential({
    id: `urn:uuid:${randomUUID()}`,
    context: ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'EmployeeCredential'],
    issuer: issuer.did,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subject, claims: { role: 'clerk' } } as any,
  })
  const signed = (await issuer.agent.w3cCredentials.signCredential({
    format: ClaimFormat.JwtVc,
    credential,
    verificationMethod: issuer.vm,
    alg: 'EdDSA',
  } as any)) as W3cJwtVerifiableCredential
  const service = holder.dependencyManager.resolve(W3cCredentialService)
  return service.storeCredential(holder.context, { record: W3cCredentialRecord.fromCredential(signed) })
}

describe('withTenantHolder', () => {
  function baseAgentWith(tenantAgent: any) {
    return { modules: { tenants: { getTenantAgent: jest.fn(async () => tenantAgent) } } } as any
  }

  it('ends the tenant session when the callback throws', async () => {
    const tenantAgent = { openid4vc: { holder: {} }, endSession: jest.fn(async () => undefined) }
    await expect(
      withTenantHolder(
        't-1',
        async () => {
          throw new Error('boom')
        },
        baseAgentWith(tenantAgent),
      ),
    ).rejects.toThrow('boom')
    expect(tenantAgent.endSession).toHaveBeenCalledTimes(1)
  })

  it('refuses a wallet without a holder module and still ends the session', async () => {
    const tenantAgent = { openid4vc: {}, endSession: jest.fn(async () => undefined) }
    const fn = jest.fn(async () => 'never')
    await expect(withTenantHolder('t-1', fn, baseAgentWith(tenantAgent))).rejects.toThrow(/holder is not available/)
    expect(fn).not.toHaveBeenCalled()
    expect(tenantAgent.endSession).toHaveBeenCalledTimes(1)
  })

  it('requires a wallet id', async () => {
    await expect(withTenantHolder('', async () => 1, baseAgentWith({}))).rejects.toThrow(/wallet is required/)
  })
})

describe('holder custody with a real wallet', () => {
  let platform: Agent<any>
  let wallet: Agent<any>
  let platformDid: { did: string; vm: string }

  beforeAll(async () => {
    platform = await makeAgent('platform')
    wallet = await makeAgent('wallet')
    platformDid = await createDid(platform)
  })

  afterAll(async () => {
    await platform?.shutdown()
    await wallet?.shutdown()
  })

  afterEach(() => {
    delete process.env.PLATFORM_ISSUER_DID
    resetPlatformIssuerDidCache()
  })

  it('pins the existing platform DID and keeps it when more DIDs are created', async () => {
    const pinned = await platformIssuerDid(platform.context)
    expect(pinned).toBe(platformDid.did)

    await createDid(platform)
    resetPlatformIssuerDidCache()
    expect(await platformIssuerDid(platform.context)).toBe(platformDid.did)
  })

  it('accepts PLATFORM_ISSUER_DID only when the platform created it', async () => {
    const second = await createDid(platform)
    process.env.PLATFORM_ISSUER_DID = second.did
    expect(await platformIssuerDid(platform.context)).toBe(second.did)

    resetPlatformIssuerDidCache()
    process.env.PLATFORM_ISSUER_DID = (await createDid(wallet)).did
    await expect(platformIssuerDid(platform.context)).rejects.toThrow(/not a DID this platform created/)
  })

  it('uses the wallet own first DID as the holder DID, never the platform DID', async () => {
    const holderDid = await tenantHolderDid(wallet)
    expect(holderDid).toMatch(/^did:key:/)
    expect(holderDid).not.toBe(platformDid.did)
    expect(await tenantHolderDid(wallet)).toBe(holderDid)
  })

  it('reports only credentials bound to a key the wallet does not hold', async () => {
    const holderDid = await tenantHolderDid(wallet)
    const issuer = { agent: platform, ...platformDid }
    const own = await storeCredential(wallet, issuer, holderDid)
    const misbound = await storeCredential(wallet, issuer, platformDid.did)

    const { scanned, misbound: found } = await new CustodyRebindService().findMisbound(wallet)

    expect(scanned).toBe(2)
    expect(found.map((record) => record.recordId)).toEqual([misbound.id])
    expect(found.map((record) => record.recordId)).not.toContain(own.id)
    expect(found[0]).toMatchObject({
      kind: 'w3c',
      subjectDid: platformDid.did,
      types: ['VerifiableCredential', 'EmployeeCredential'],
      claims: { role: 'clerk' },
    })
    expect(found[0].credentialId).toMatch(/^urn:uuid:/)
  })
})

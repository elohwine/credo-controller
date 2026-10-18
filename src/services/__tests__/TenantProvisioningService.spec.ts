import 'reflect-metadata'

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

jest.mock('../../persistence/TenantRepository', () => ({
  getTenantById: jest.fn(() => null),
  upsertTenant: jest.fn(),
}))

import { getOrCreateTenantDid } from '../TenantProvisioningService'

describe('getOrCreateTenantDid', () => {
  const records = new Map<string, any>()
  const documents = new Map<string, any>()
  const createDid = jest.fn()

  const tenantAgent: any = {
    genericRecords: {
      findById: jest.fn(async (id: string) => records.get(id) ?? null),
      save: jest.fn(async ({ id, content, tags }: any) => {
        const record = { id, content, tags }
        records.set(id, record)
        return record
      }),
    },
    dids: {
      create: createDid,
      getCreatedDids: jest.fn(async ({ did }: { did: string }) => (documents.has(did) ? [{ did }] : [])),
      resolveDidDocument: jest.fn(async (did: string) => documents.get(did)),
    },
  }

  beforeEach(() => {
    records.clear()
    documents.clear()
    jest.clearAllMocks()

    createDid.mockImplementation(async () => {
      const did = `did:key:tenant-${createDid.mock.calls.length}`
      const kid = `${did}#key-1`
      const didDocument = { verificationMethod: [{ id: kid, publicKeyBase58: 'public-key' }] }
      documents.set(did, didDocument)
      return { didState: { state: 'finished', did, didDocument } }
    })
  })

  it('stores the DID as soon as it is created and reuses it on retry', async () => {
    const first = await getOrCreateTenantDid(tenantAgent, 'tenant-123', 'issuer')
    const second = await getOrCreateTenantDid(tenantAgent, 'tenant-123', 'issuer')

    expect(first.did).toBe(second.did)
    expect(first.kid).toBe(second.kid)
    expect(createDid).toHaveBeenCalledTimes(1)
    expect(tenantAgent.genericRecords.save).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a saved tenant DID is not owned by that tenant wallet', async () => {
    records.set('tenant:tenant-123:issuer', {
      id: 'tenant:tenant-123:issuer',
      content: { did: 'did:key:foreign', kid: 'did:key:foreign#key-1' },
    })

    await expect(getOrCreateTenantDid(tenantAgent, 'tenant-123', 'issuer')).rejects.toThrow(
      'not owned by tenant tenant-123',
    )
    expect(createDid).not.toHaveBeenCalled()
  })
})

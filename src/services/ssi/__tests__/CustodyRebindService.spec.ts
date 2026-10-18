import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

import { DatabaseManager } from '../../../persistence/DatabaseManager'

const register = new Map<string, any>()
const redeem = jest.fn<(...args: any[]) => Promise<any>>()
const createOffer = jest.fn<(...args: any[]) => Promise<any>>()
const createPlatformOfferUri = jest.fn<(...args: any[]) => Promise<string | undefined>>()
const revoke = jest.fn()
const removeCredentialRecord = jest.fn<(...args: any[]) => Promise<void>>()
const deleteSdJwt = jest.fn<(...args: any[]) => Promise<void>>()

const walletAgent = {
  context: {},
  dependencyManager: { resolve: () => ({ removeCredentialRecord }) },
  sdJwtVc: { deleteById: deleteSdJwt },
}

jest.unstable_mockModule('../TenantHolder', () => ({
  withTenantHolder: async (_tenantId: string, fn: (agent: any) => Promise<any>) => fn(walletAgent),
  redeemOfferIntoWallet: redeem,
}))
jest.unstable_mockModule('../../../persistence/IssuedCredentialRepository', () => ({
  IssuedCredentialRepository: class {
    public findByCredentialId(id: string) {
      return register.get(id)
    }
  },
}))
jest.unstable_mockModule('../../CredentialIssuanceService', () => ({
  credentialIssuanceService: { createOffer },
}))
jest.unstable_mockModule('../CredentialLifecycleService', () => ({
  credentialLifecycleService: { revoke },
}))
jest.unstable_mockModule('../../SSIAuthService', () => ({
  SSIAuthService: class {
    public createPlatformOfferUri = createPlatformOfferUri
  },
}))

type CustodyRebindModule = typeof import('../CustodyRebindService')
let CustodyRebindService: CustodyRebindModule['CustodyRebindService']

const WALLET = 'wallet-1'
const ROOT_DID = 'did:key:z6MkPlatform'

function misbound(recordId: string, credentialId: string, type: string, kind: 'w3c' | 'sd-jwt' = 'w3c') {
  return {
    recordId,
    kind,
    subjectDid: ROOT_DID,
    credentialId,
    types: ['VerifiableCredential', type],
    claims: { role: 'clerk' },
  }
}

describe('CustodyRebindService.rebindWallet', () => {
  let db: Database.Database
  let service: InstanceType<typeof CustodyRebindService>
  let records: any[]

  const rows = () =>
    db
      .prepare('SELECT old_record_id, status, new_record_id, error FROM wallet_custody_rebinds ORDER BY old_record_id')
      .all() as any[]

  beforeAll(async () => {
    ;({ CustodyRebindService } = await import('../CustodyRebindService'))
    db = new Database(':memory:')
    db.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/121_wallet_custody_rebinds.sql'), 'utf8'))
    ;(DatabaseManager as any).instance = db
  })

  afterAll(() => {
    ;(DatabaseManager as any).instance = undefined
  })

  beforeEach(() => {
    db.exec('DELETE FROM wallet_custody_rebinds')
    register.clear()
    for (const mock of [redeem, createOffer, createPlatformOfferUri, revoke, removeCredentialRecord, deleteSdJwt]) {
      mock.mockReset()
    }
    redeem.mockImplementation(async () => ({ savedCredentialId: `new-${redeem.mock.calls.length}` }))
    createOffer.mockImplementation(async () => ({ credential_offer_deeplink: 'openid-credential-offer://org' }))
    createPlatformOfferUri.mockImplementation(async () => 'openid-credential-offer://platform')
    service = new CustodyRebindService()
    records = []
    jest.spyOn(service, 'findMisbound').mockImplementation(async () => ({ scanned: records.length, misbound: records }))
  })

  it('reissues an organisation credential from its issuer, then replaces and revokes the old one', async () => {
    records = [misbound('old-org', 'urn:uuid:org', 'EmployeeCredential', 'sd-jwt')]
    register.set('urn:uuid:org', {
      tenantId: 'org-1',
      credentialDefinitionId: 'EmployeeCredential_vc+sd-jwt',
      revoked: false,
    })

    const outcome = await service.rebindWallet(WALLET)

    expect(createOffer).toHaveBeenCalledWith({
      credentialType: 'EmployeeCredential_vc+sd-jwt',
      claims: { role: 'clerk' },
      tenantId: 'org-1',
      requireExactCredentialType: true,
    })
    expect(redeem).toHaveBeenCalledWith(walletAgent, ['openid-credential-offer://org'])
    expect(deleteSdJwt).toHaveBeenCalledWith('old-org')
    expect(revoke).toHaveBeenCalledWith('urn:uuid:org', expect.stringContaining('replaced'))
    expect(outcome).toMatchObject({ misbound: 1, rebound: 1, failed: 0 })
    expect(rows()).toEqual([{ old_record_id: 'old-org', status: 'rebound', new_record_id: 'new-1', error: null }])
  })

  it('reissues a platform-issued credential (checkout receipt) from the platform issuer', async () => {
    records = [misbound('old-receipt', 'urn:uuid:receipt', 'ReceiptVC')]
    register.set('urn:uuid:receipt', { tenantId: 'default', credentialDefinitionId: 'ReceiptVC', revoked: false })

    await service.rebindWallet(WALLET)

    expect(createOffer).not.toHaveBeenCalled()
    expect(createPlatformOfferUri).toHaveBeenCalledWith({
      credentialDefinitionId: 'ReceiptVC',
      claims: { role: 'clerk' },
      format: 'jwt_vc_json',
    })
    expect(removeCredentialRecord).toHaveBeenCalledWith(walletAgent.context, 'old-receipt')
    expect(rows()[0].status).toBe('rebound')
  })

  it('never revives a revoked credential and keeps the record in the wallet', async () => {
    records = [misbound('old-revoked', 'urn:uuid:revoked', 'EmployeeCredential')]
    register.set('urn:uuid:revoked', { tenantId: 'org-1', credentialDefinitionId: 'EmployeeCredential', revoked: true })

    const outcome = await service.rebindWallet(WALLET)

    expect(createOffer).not.toHaveBeenCalled()
    expect(redeem).not.toHaveBeenCalled()
    expect(removeCredentialRecord).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ rebound: 0, skipped: 1 })
    expect(rows()[0].status).toBe('no_source')
  })

  it('retries a record without a source once one appears, and skips records already rebound', async () => {
    records = [misbound('old-late', 'urn:uuid:late', 'GenericIDCredential')]
    await service.rebindWallet(WALLET)
    expect(rows()[0].status).toBe('no_source')

    register.set('urn:uuid:late', { tenantId: 'org-1', credentialDefinitionId: 'GenericIDCredential', revoked: false })
    await service.rebindWallet(WALLET)
    expect(rows()[0].status).toBe('rebound')

    const third = await service.rebindWallet(WALLET)
    expect(third).toMatchObject({ rebound: 0, skipped: 1 })
    expect(redeem).toHaveBeenCalledTimes(1)
  })

  it('keeps the old record and does not revoke it when the replacement cannot be stored', async () => {
    records = [misbound('old-fail', 'urn:uuid:fail', 'EmployeeCredential')]
    register.set('urn:uuid:fail', { tenantId: 'org-1', credentialDefinitionId: 'EmployeeCredential', revoked: false })
    redeem.mockImplementation(async () => {
      throw new Error('issuer unreachable')
    })

    const outcome = await service.rebindWallet(WALLET)

    expect(outcome).toMatchObject({ rebound: 0, failed: 1 })
    expect(removeCredentialRecord).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
    expect(rows()[0]).toMatchObject({ status: 'failed', error: 'issuer unreachable' })
  })

  it('runs one pass per wallet at a time', async () => {
    records = []
    const [a, b] = [service.rebindWallet(WALLET), service.rebindWallet(WALLET)]
    expect(a).toBe(b)
    await a
    expect(service.findMisbound).toHaveBeenCalledTimes(1)
  })
})

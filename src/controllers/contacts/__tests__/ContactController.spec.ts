import { jest } from '@jest/globals'

const getTenantById = jest.fn()
jest.unstable_mockModule('../../../persistence/TenantRepository', () => ({ getTenantById }))

let ContactController: typeof import('../ContactController').ContactController

beforeAll(async () => {
  ;({ ContactController } = await import('../ContactController'))
})

describe('ContactController tenant resolution', () => {
  beforeEach(() => {
    getTenantById.mockReset()
  })

  it('accepts personal wallet tokens for non-organization tenants', () => {
    getTenantById.mockReturnValue({ id: 'wallet-tenant', tenantType: 'USER' })

    const controller = new ContactController()
    const request = { user: { tenantId: 'wallet-tenant' } } as any

    expect((controller as any).resolveTenantId(request)).toBe('wallet-tenant')
  })

  it('still requires an org role for organization tenants', () => {
    getTenantById.mockReturnValue({ id: 'org-tenant', tenantType: 'ORG' })

    const controller = new ContactController()
    const request = { user: { tenantId: 'org-tenant' } } as any

    expect(() => (controller as any).resolveTenantId(request)).toThrow()
  })
})

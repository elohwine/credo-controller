import { canReadOrganisationRecords } from '../src/services/ssi/organisationRecordsAccess'
import {
  classifyOfferFailure,
  isCommercialDocumentOffer,
  pickOfferResolutionError,
} from '../src/services/ssi/offerClassification'
import { createLoopbackFetch } from '../src/utils/loopbackFetch'

const FORMAT = "Credential offer did not contain either 'credential_offer' or 'credential_offer_uri' param."

describe('offer resolution errors', () => {
  it('reports the real failure instead of the last format error', () => {
    const real = new Error('fetch failed')
    expect(pickOfferResolutionError([real, new Error(FORMAT)])).toBe(real)
    expect(pickOfferResolutionError([new Error(FORMAT), real])).toBe(real)
  })

  it('falls back to the format error when every form was not an offer', () => {
    const format = new Error(FORMAT)
    expect(pickOfferResolutionError([format, new Error(FORMAT)])).toBe(format)
  })

  it('treats network trouble as retryable, never as expired', () => {
    const failure = classifyOfferFailure('fetch failed: connect ETIMEDOUT 3.78.102.143:443')
    expect(failure).toMatchObject({ unreachable: true, gone: false, unusable: false })
    expect(
      classifyOfferFailure("Fetching credential offer from 'x' resulted in an unsuccessful response with status '502'")
        .unreachable,
    ).toBe(true)
  })

  it('treats an issuer error at the token step as retryable', () => {
    const failure = classifyOfferFailure(
      "Unable to retrieve access token from 'x/token'. Received token error response with status 500",
    )
    expect(failure).toMatchObject({ unreachable: true, unusable: false })
  })

  it('treats a 404 offer as gone and re-sendable', () => {
    const failure = classifyOfferFailure(
      "Fetching credential offer from 'x' resulted in an unsuccessful response with status '404'",
    )
    expect(failure).toMatchObject({ gone: true, unusable: true, unreachable: false })
  })

  it('does not call a format error expired', () => {
    expect(classifyOfferFailure(FORMAT)).toMatchObject({ notAnOffer: true, gone: false, unusable: false })
  })
})

describe('pending receipts', () => {
  it('keeps receipts, invoices and quotes only', () => {
    expect(isCommercialDocumentOffer('invoice_offer', 'InvoiceVC')).toBe(true)
    expect(isCommercialDocumentOffer('quote_offer', 'QuoteVC')).toBe(true)
    expect(isCommercialDocumentOffer('workflow_vc_offer', 'PaymentReceiptVC')).toBe(true)
    expect(isCommercialDocumentOffer('platform_identity', 'PlatformIdentityCredential')).toBe(false)
    expect(isCommercialDocumentOffer('org_employee', 'EmployeeCredential')).toBe(false)
    expect(isCommercialDocumentOffer('workflow_vc_offer', 'SiteInspectionVC')).toBe(false)
  })
})

describe('loopback fetch', () => {
  const calls: string[] = []
  const base = async (input: any) => {
    calls.push(typeof input === 'string' ? input : input.url)
    return { ok: true }
  }

  beforeEach(() => calls.splice(0))

  it('sends calls to the public URL to the local listener', async () => {
    const f = createLoopbackFetch(base, ['https://demo.ngrok-free.dev'], 'http://127.0.0.1:3000')
    await f('https://demo.ngrok-free.dev/oidc/issuer/x/offers/1?a=b')
    await f(new URL('https://demo.ngrok-free.dev/.well-known/openid-credential-issuer'))
    await f(new Request('https://demo.ngrok-free.dev/oidc/token', { method: 'POST', body: 'x' }))
    expect(calls).toEqual([
      'http://127.0.0.1:3000/oidc/issuer/x/offers/1?a=b',
      'http://127.0.0.1:3000/.well-known/openid-credential-issuer',
      'http://127.0.0.1:3000/oidc/token',
    ])
  })

  it('leaves other hosts alone', async () => {
    const f = createLoopbackFetch(base, ['https://demo.ngrok-free.dev'], 'http://127.0.0.1:3000')
    await f('https://issuer.example.org/offers/1')
    expect(calls).toEqual(['https://issuer.example.org/offers/1'])
  })

  it('is a no-op without a public URL', () => {
    expect(createLoopbackFetch(base, [], 'http://127.0.0.1:3000')).toBe(base)
  })
})

describe('organisation records access', () => {
  it('lets owners and admins open the organisation wallet', () => {
    expect(canReadOrganisationRecords({ tenantId: 'org-1', orgRole: 'owner' }, 'org-1')).toBe(true)
    expect(canReadOrganisationRecords({ tenantId: 'org-1', orgRole: 'admin' }, 'org-1')).toBe(true)
  })

  it('keeps other members out of the organisation wallet', () => {
    expect(canReadOrganisationRecords({ tenantId: 'org-1', orgRole: 'employee' }, 'org-1')).toBe(false)
    expect(canReadOrganisationRecords({ tenantId: 'org-1', orgRole: 'approver' }, 'org-1')).toBe(false)
  })

  it('leaves personal wallets to the tenant check', () => {
    expect(canReadOrganisationRecords({ tenantId: 'wallet-1' }, 'wallet-1')).toBe(true)
    expect(canReadOrganisationRecords(undefined, 'wallet-1')).toBe(true)
  })
})

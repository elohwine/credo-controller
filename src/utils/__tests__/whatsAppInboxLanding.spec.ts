import { androidAssetLinks, inboxQuery } from '../whatsAppInboxLanding'

describe('WhatsApp inbox landing', () => {
  it('keeps only safe inbox selectors', () => {
    expect(inboxQuery({ item: 'abc-123', request: 'r:1', other: 'x' } as any).toString()).toBe(
      'item=abc-123&request=r%3A1',
    )
    expect(inboxQuery({ item: '"><script>', request: ['a', 'b'] } as any).toString()).toBe('')
  })

  it('publishes asset links only for valid certificate fingerprints', () => {
    const fp = Array.from({ length: 32 }, () => 'AB').join(':')
    expect(androidAssetLinks({ ANDROID_APP_CERT_SHA256: 'nope' } as any)).toEqual([])
    expect(androidAssetLinks({ ANDROID_APP_CERT_SHA256: fp.toLowerCase() } as any)).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'com.credentis.mobile', sha256_cert_fingerprints: [fp] },
      },
    ])
  })
})

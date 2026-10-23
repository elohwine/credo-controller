import express from 'express'
import request from 'supertest'

import { androidAssetLinks, inboxQuery, inviteQuery, registerWhatsAppInboxLanding } from '../whatsAppInboxLanding'

describe('WhatsApp inbox landing', () => {
  it('keeps only safe inbox selectors', () => {
    expect(inboxQuery({ item: 'abc-123', request: 'r:1', other: 'x' } as any).toString()).toBe(
      'item=abc-123&request=r%3A1',
    )
    expect(inboxQuery({ item: '"><script>', request: ['a', 'b'] } as any).toString()).toBe('')
  })

  it('carries only a well-formed invite code', () => {
    const code = 'Ab_-0123456789abcdefghijKLMNOPQRST'
    expect(inviteQuery({ code, extra: 'x' } as any).toString()).toBe(`code=${code}`)
    expect(inviteQuery({ code: 'short' } as any).toString()).toBe('')
    expect(inviteQuery({ code: '"><script>alert(1)</script>' } as any).toString()).toBe('')
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

  it('serves the template banners and nothing else from the assets folder', async () => {
    const app = express()
    registerWhatsAppInboxLanding(app)
    const banner = await request(app).get('/wa/task.png?v=1')
    expect(banner.status).toBe(200)
    expect(banner.headers['content-type']).toBe('image/png')
    expect(banner.headers['cache-control']).toBe('public, max-age=86400')
    expect((await request(app).get('/wa/other.png')).status).toBe(404)
    expect((await request(app).get('/wa/..%2Fpackage.json')).status).toBe(404)
  })
})

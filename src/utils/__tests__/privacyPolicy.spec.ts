import express from 'express'
import request from 'supertest'

import { registerPrivacyPolicy } from '../privacyPolicy'

describe('public privacy policy', () => {
  const app = express()
  registerPrivacyPolicy(app)

  it.each(['/privacy-policy', '/privacy'])('serves %s without authentication', async (path) => {
    const response = await request(app)
      .get(path)
      .expect(200)
      .expect('Content-Type', /text\/html/)
    expect(response.text).toContain('<title>Privacy Policy | IdenEx Credentis</title>')
    expect(response.text).toContain('mailto:elowine@outlook.com')
    expect(response.text).toContain('Account deletion')
    expect(response.text).toContain('WhatsApp')
    expect(response.text).toContain('STOP')
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(response.headers['location']).toBeUndefined()
    expect(response.headers['set-cookie']).toBeUndefined()
  })
})

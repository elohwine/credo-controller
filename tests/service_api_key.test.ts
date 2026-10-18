import { afterEach, describe, expect, test } from '@jest/globals'

import { getEcoCashWebhookSecret, getIssuerApiKey } from '../src/utils/serviceApiKey'

const originalNodeEnv = process.env.NODE_ENV
const originalIssuerKey = process.env.ISSUER_API_KEY
const originalWebhookSecret = process.env.ECOCASH_WEBHOOK_SECRET

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalIssuerKey === undefined) delete process.env.ISSUER_API_KEY
  else process.env.ISSUER_API_KEY = originalIssuerKey
  if (originalWebhookSecret === undefined) delete process.env.ECOCASH_WEBHOOK_SECRET
  else process.env.ECOCASH_WEBHOOK_SECRET = originalWebhookSecret
})

describe('service-to-service API secrets', () => {
  test('keeps the development keys out of production', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ISSUER_API_KEY
    delete process.env.ECOCASH_WEBHOOK_SECRET

    expect(() => getIssuerApiKey()).toThrow(/ISSUER_API_KEY must be configured/)
    expect(() => getEcoCashWebhookSecret()).toThrow(/ECOCASH_WEBHOOK_SECRET must be configured/)
  })

  test('uses configured secrets and retains local test defaults outside production', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.ISSUER_API_KEY
    delete process.env.ECOCASH_WEBHOOK_SECRET
    expect(getIssuerApiKey()).toBe('test-api-key-12345')
    expect(getEcoCashWebhookSecret()).toBe('test-webhook-secret')

    process.env.ISSUER_API_KEY = 'issuer-secret'
    process.env.ECOCASH_WEBHOOK_SECRET = 'webhook-secret'
    expect(getIssuerApiKey()).toBe('issuer-secret')
    expect(getEcoCashWebhookSecret()).toBe('webhook-secret')
  })
})

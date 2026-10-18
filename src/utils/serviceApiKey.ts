import { StatusException } from '../errors'

export function getIssuerApiKey(): string {
  const configured = process.env.ISSUER_API_KEY?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV !== 'production') return 'test-api-key-12345'
  throw new StatusException('ISSUER_API_KEY must be configured in production', 503)
}

export function getEcoCashWebhookSecret(): string {
  const configured = process.env.ECOCASH_WEBHOOK_SECRET?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV !== 'production') return 'test-webhook-secret'
  throw new StatusException('ECOCASH_WEBHOOK_SECRET must be configured in production', 503)
}

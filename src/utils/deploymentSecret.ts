/**
 * deploymentSecret — one way to read a secret that must come from the environment.
 *
 * Several secrets used to fall back to a value written in the source (`'credo-pin-salt-v1'`,
 * `'default-dev-key-32-chars-long!!'`, `'default-dev-secret-change-me'`, `'shared-controller-key'`).
 * A value in the source is a published value, and `docs/SECRETS_ROTATION.md` already records that
 * this repository's env files were committed once, so anything built into it must be treated as
 * public. A hash or a cipher keyed with a published value protects nobody.
 *
 * So: in production the secret must be set, or the server refuses to start. Outside production the
 * documented development value is used and the log says so once, loudly, per secret.
 */

import { rootLogger } from './pinoLogger'

const logger = rootLogger.child({ module: 'deploymentSecret' })
const warned = new Set<string>()

const isProduction = (): boolean => process.env.NODE_ENV === 'production'

/**
 * The secret named by `name`, or the development value when it is not set and this is not
 * production. Throws in production so a deployment cannot quietly run on a published key.
 */
export function deploymentSecret(name: string, developmentValue: string): string {
  const value = process.env[name]
  if (value && value.trim()) return value

  if (isProduction()) {
    throw new Error(
      `${name} is not set. It keys personal data (hashes or encryption) and has no safe default; ` +
        `set it in the deployment secret store. See docs/SECRETS_ROTATION.md.`,
    )
  }

  if (!warned.has(name)) {
    warned.add(name)
    logger.warn(
      { secret: name },
      `${name} is not set; using the development value. Anything protected with it is readable by ` +
        `anyone with this source. Never run a real deployment this way.`,
    )
  }
  return developmentValue
}

/**
 * Every secret that keys personal data, checked at boot so a misconfigured production deployment
 * fails on startup instead of on the first person who signs in.
 */
export const PERSONAL_DATA_SECRETS = ['CONTACT_HASH_PEPPER', 'PIN_SALT', 'PII_ENCRYPTION_KEY', 'JWT_SECRET'] as const

/** Names of the personal-data secrets that are missing. Empty is what a deployment wants. */
export function missingPersonalDataSecrets(): string[] {
  return PERSONAL_DATA_SECRETS.filter((name) => !process.env[name]?.trim())
}

export function assertPersonalDataSecretsConfigured(): void {
  if (!isProduction()) return
  const missing = missingPersonalDataSecrets()
  if (missing.length > 0) {
    throw new Error(
      `Required deployment secrets are not set: ${missing.join(', ')}. ` +
        `Set them in the deployment secret store before starting the API. See docs/SECRETS_ROTATION.md.`,
    )
  }
}

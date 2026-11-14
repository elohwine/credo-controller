/** Verifier ids reserved for a named outside site; never the organisation's default verifier. */
export const SITE_VERIFIER_PREFIX = 'site-'

/** The organisation's own verifier from a tenant's list, skipping any named outside-site verifier. */
export function defaultVerifierOf<T extends { verifierId?: string }>(verifiers: T[] | undefined | null): T | undefined {
  return (verifiers || []).find((verifier) => !String(verifier?.verifierId || '').startsWith(SITE_VERIFIER_PREFIX))
}

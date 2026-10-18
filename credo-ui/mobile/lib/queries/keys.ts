/** Account + context that cached answers and counts are filed under. */
export function sessionScope(accountId: string | null, mode: 'personal' | 'org', orgId: string | null): string {
  const account = accountId || 'signed-out'
  return mode === 'org' && orgId ? `${account}|org:${orgId}` : `${account}|personal`
}

/**
 * Every cached server answer is filed under the account and context it belongs to, so
 * switching accounts or organisations never shows another context's data, and switching
 * back shows the last answer straight away while it is checked again in the background.
 *
 * Shape: [scope, resource, ...params], where scope = `${accountId}|personal` or `${accountId}|org:${orgId}`.
 */
export const queryKeys = {
  inbox: (scope: string) => [scope, 'inbox-v2'] as const,
  home: (scope: string) => [scope, 'home-v2'] as const,
  fieldRuns: (scope: string, filter?: string) => [scope, 'field-runs', filter || 'all'] as const,
  fieldRun: (scope: string, runId: string) => [scope, 'field-run', runId] as const,
  records: (scope: string) => [scope, 'records'] as const,
  orgs: (scope: string) => [scope, 'orgs'] as const,
}

/** True when `key` belongs to the given account (any of its contexts). */
export function keyBelongsToAccount(key: readonly unknown[], accountId: string): boolean {
  const scope = key[0]
  return typeof scope === 'string' && scope.startsWith(`${accountId}|`)
}

/** How long an answer counts as fresh before a screen visit checks it again. */
export const STALE_TIME = {
  inbox: 15_000,
  home: 30_000,
  fieldRuns: 15_000,
  fieldRun: 10_000,
  records: 60_000,
  orgs: 5 * 60_000,
} as const

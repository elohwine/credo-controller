export interface OrganizationMembership {
  orgTenantId: string
  name: string
  role: string
  canOpenOrgContext?: boolean
  domain?: string
  issuerDid?: string
  memberCount?: number
}

type MembershipStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const CACHE_PREFIX = 'credentisMembershipsV2:'

/** Identifies a cache partition only; the server still authorizes every organisation entry. */
export function membershipAccount(token: string | null): string | null {
  if (!token) return null
  try {
    const segment = token.split('.')[1]
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.orgRole && typeof payload.tenantId === 'string' ? payload.tenantId : null
  } catch {
    return null
  }
}

export function parseMemberships(value: unknown): OrganizationMembership[] {
  if (!Array.isArray(value)) throw new Error('The organisation membership response is invalid. Try refreshing.')
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('The organisation membership response is invalid.')
    const entry = item as Record<string, unknown>
    const id = entry.orgTenantId ?? entry.id
    if (typeof id !== 'string' || !id || typeof entry.name !== 'string' || typeof entry.role !== 'string') {
      throw new Error('The organisation membership response is invalid.')
    }
    return {
      orgTenantId: id,
      name: entry.name,
      role: entry.role,
      ...(typeof entry.canOpenOrgContext === 'boolean' ? { canOpenOrgContext: entry.canOpenOrgContext } : {}),
      ...(typeof entry.domain === 'string' ? { domain: entry.domain } : {}),
      ...(typeof entry.issuerDid === 'string' ? { issuerDid: entry.issuerDid } : {}),
      ...(typeof entry.memberCount === 'number' ? { memberCount: entry.memberCount } : {}),
    }
  })
}

export function readMemberships(storage: MembershipStorage, token: string | null): OrganizationMembership[] {
  const account = membershipAccount(token)
  if (!account) return []
  const key = CACHE_PREFIX + account
  try {
    const raw = storage.getItem(key)
    return raw ? parseMemberships(JSON.parse(raw)) : []
  } catch (error) {
    console.warn('Discarding invalid cached organisation memberships', error)
    storage.removeItem(key)
    return []
  }
}

export function persistMemberships(
  storage: MembershipStorage,
  token: string | null,
  memberships: OrganizationMembership[],
): void {
  const account = membershipAccount(token)
  if (!account) throw new Error('Sign in to your personal account to refresh organisations.')
  const validated = parseMemberships(memberships)
  storage.removeItem('credoOrganizations')
  try {
    storage.setItem(CACHE_PREFIX + account, JSON.stringify(validated))
  } catch (error) {
    // An optional offline cache must not turn a successful server refresh into an API failure.
    storage.removeItem(CACHE_PREFIX + account)
    console.warn('Could not cache organisation memberships', error)
  }
}

export async function refreshMemberships(
  storage: MembershipStorage,
  token: string,
  load: () => Promise<unknown>,
  currentToken: () => string | null,
): Promise<OrganizationMembership[]> {
  const account = membershipAccount(token)
  if (!account) throw new Error('Sign in to your personal account to refresh organisations.')
  const memberships = parseMemberships(await load())
  if (membershipAccount(currentToken()) !== account) {
    throw new Error('The account changed while loading organisations. Refresh to try again.')
  }
  persistMemberships(storage, token, memberships)
  return memberships
}

import { describe, expect, jest, test } from '@jest/globals'
import {
  membershipAccount, parseMemberships, persistMemberships, readMemberships, refreshMemberships,
} from '../credo-ui/shared/organizationMemberships'

const token = (tenantId: string, extra = {}) =>
  `header.${Buffer.from(JSON.stringify({ tenantId, ...extra })).toString('base64url')}.signature`
const alice = token('wallet-a')
const bob = token('wallet-b')
const org = { orgTenantId: 'org-1', name: 'Demo', role: 'owner', canOpenOrgContext: true }

function storage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('authoritative, account-scoped organisation memberships', () => {
  test('an online empty list removes a previously cached organisation', async () => {
    const saved = storage()
    persistMemberships(saved, alice, [org])
    saved.setItem('credoOrganizations', JSON.stringify([org]))
    expect(await refreshMemberships(saved, alice, async () => [], () => alice)).toEqual([])
    expect(readMemberships(saved, alice)).toEqual([])
    expect(saved.getItem('credoOrganizations')).toBeNull()
  })

  test('never uses the unscoped legacy cache as membership evidence', () => {
    const saved = storage()
    saved.setItem('credoOrganizations', JSON.stringify([org]))
    expect(readMemberships(saved, alice)).toEqual([])
    expect(readMemberships(saved, bob)).toEqual([])
  })

  test('account switching does not expose another account cache', () => {
    const saved = storage()
    persistMemberships(saved, alice, [org])
    expect(readMemberships(saved, bob)).toEqual([])
    persistMemberships(saved, bob, [])
    expect(readMemberships(saved, alice)).toEqual([org])
  })

  test('an API failure stays failed and only preserves a display-only offline copy', async () => {
    const saved = storage()
    persistMemberships(saved, alice, [org])
    await expect(refreshMemberships(saved, alice, async () => { throw new Error('Unavailable') }, () => alice))
      .rejects.toThrow('Unavailable')
    expect(readMemberships(saved, alice)).toEqual([org])
  })

  test('invalid server responses do not become success-shaped empty lists', async () => {
    const saved = storage()
    persistMemberships(saved, alice, [org])
    for (const invalid of [null, {}, { organizations: [] }, [{ id: 'bad' }]]) {
      await expect(refreshMemberships(saved, alice, async () => invalid, () => alice)).rejects.toThrow('invalid')
    }
    expect(readMemberships(saved, alice)).toEqual([org])
  })

  test('a response arriving after the account changed cannot update either cache', async () => {
    const saved = storage()
    persistMemberships(saved, bob, [])
    await expect(refreshMemberships(saved, alice, async () => [org], () => bob)).rejects.toThrow('account changed')
    expect(readMemberships(saved, alice)).toEqual([])
    expect(readMemberships(saved, bob)).toEqual([])
  })

  test('a removed manager role is replaced, not merged with the old cached role', async () => {
    const saved = storage()
    persistMemberships(saved, alice, [org])
    const member = { ...org, role: 'member', canOpenOrgContext: false }
    await refreshMemberships(saved, alice, async () => [member], () => alice)
    expect(readMemberships(saved, alice)).toEqual([member])
  })

  test('organisation-scoped sessions cannot create personal membership caches', () => {
    const saved = storage()
    const orgToken = token('org-1', { orgRole: 'owner' })
    expect(membershipAccount(orgToken)).toBeNull()
    expect(() => persistMemberships(saved, orgToken, [org])).toThrow('personal account')
    expect(readMemberships(saved, orgToken)).toEqual([])
  })

  test('cache corruption is reported and discarded', () => {
    const saved = storage()
    saved.setItem('credentisMembershipsV2:wallet-a', '{}')
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(readMemberships(saved, alice)).toEqual([])
    expect(warning).toHaveBeenCalled()
    expect(saved.getItem('credentisMembershipsV2:wallet-a')).toBeNull()
    warning.mockRestore()
  })

  test('normalizes backend membership identifiers without inventing roles', () => {
    expect(parseMemberships([{ id: 'org-1', name: 'Demo', role: 'member' }]))
      .toEqual([{ orgTenantId: 'org-1', name: 'Demo', role: 'member' }])
  })
})

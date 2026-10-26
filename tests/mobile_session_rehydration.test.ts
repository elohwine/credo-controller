import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import vm from 'vm'
import ts from 'typescript'
import * as memberships from '../credo-ui/shared/organizationMemberships'
import * as taskContext from '../credo-ui/shared/taskContext'

const compiled = ts.transpileModule(fs.readFileSync('credo-ui/mobile/lib/auth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const token = (tenantId: string, extra = {}) =>
  `header.${Buffer.from(JSON.stringify({ tenantId, ...extra })).toString('base64url')}.signature`

describe('personal session rehydration and empty membership reconciliation', () => {
  let saved: Map<string, string>
  let local: Storage
  let auth: typeof import('../credo-ui/mobile/lib/auth')
  let fetch: ReturnType<typeof jest.fn<() => Promise<{ ok: boolean; json: () => Promise<unknown> }>>>

  beforeEach(() => {
    saved = new Map()
    local = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value) },
      removeItem: (key: string) => { saved.delete(key) },
    } as Storage
    fetch = jest.fn<() => Promise<{ ok: boolean; json: () => Promise<unknown> }>>()
      .mockResolvedValue({ ok: true, json: async () => [] })
    const exports = {}
    vm.runInNewContext(compiled, {
      exports, atob, Buffer, console, fetch,
      CustomEvent: class { constructor(public type: string) {} },
      URL,
      localStorage: local,
      sessionStorage: local,
      window: { localStorage: local, dispatchEvent: () => true, location: { origin: 'https://localhost' } },
      require: (name: string) => {
        if (name === './baseUrl') return { resolveMobileApiBaseUrl: () => 'https://credentis.fly.dev' }
        if (name === '../../shared/organizationMemberships') return memberships
        if (name === '../../shared/taskContext') return taskContext
        throw new Error(`Unexpected dependency: ${name}`)
      },
    })
    auth = exports as typeof auth
  })

  test('token-only PIN response restores the personal tenant and removes stale organisation context', () => {
    local.setItem('credoTenantId', 'old-org')
    local.setItem('credoOrgToken', token('old-org', { orgRole: 'owner' }))
    local.setItem('credoOrganizations', '[{"name":"Old org"}]')
    auth.applyPersonalWalletContext(token('wallet-a'))
    expect(local.getItem('credoTenantId')).toBe('wallet-a')
    expect(local.getItem('tenantId')).toBe('wallet-a')
    expect(local.getItem('credoContextMode')).toBe('personal')
    expect(local.getItem('credoOrgToken')).toBeNull()
    expect(local.getItem('credoOrganizations')).toBeNull()
  })

  test('personal-mode resume still refreshes and clears empty cached memberships without reloading', async () => {
    auth.applyPersonalWalletContext(token('wallet-a'))
    memberships.persistMemberships(local, token('wallet-a'), [{ orgTenantId: 'deleted', name: 'Old', role: 'owner' }])
    expect(await auth.syncOrgContextFromServer()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(memberships.readMemberships(local, token('wallet-a'))).toEqual([])
    expect(local.getItem('credoContextMode')).toBe('personal')
  })

  test('removed membership exits organisation context instead of keeping an old role', async () => {
    auth.applyPersonalWalletContext(token('wallet-a'))
    auth.applyOrgContext({ orgId: 'deleted', orgName: 'Old', orgToken: token('deleted', { orgRole: 'owner' }), orgRole: 'owner' })
    expect(await auth.syncOrgContextFromServer()).toBe(true)
    expect(local.getItem('credoOrgToken')).toBeNull()
    expect(local.getItem('credoContextMode')).toBe('personal')
    expect(memberships.readMemberships(local, token('wallet-a'))).toEqual([])
  })

  test('malformed or organisation tokens cannot replace a valid personal session', () => {
    auth.applyPersonalWalletContext(token('wallet-a'))
    expect(() => auth.applyPersonalWalletContext('bad')).toThrow('personal wallet session')
    expect(() => auth.applyPersonalWalletContext(token('org', { orgRole: 'owner' }))).toThrow('personal wallet session')
    expect(local.getItem('walletToken')).toBe(token('wallet-a'))
  })
})

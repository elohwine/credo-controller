import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import { applyPersonalLogin } from '../credo-ui/portal/lib/personalSession'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value)
  },
  removeItem: (key: string) => {
    values.delete(key)
  },
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage: storage, dispatchEvent: () => true },
})
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
const token = (tenantId: string) =>
  `header.${Buffer.from(JSON.stringify({ tenantId })).toString('base64url')}.signature`

afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
beforeEach(() => values.clear())

describe('verified personal login session', () => {
  it('maps disclosed identity claims and all personal session aliases', () => {
    applyPersonalLogin({
      token: token('alice'),
      tenantId: 'alice',
      claims: { displayName: 'Alice', phone: '+263123456789' },
    })
    expect(storage.getItem('credoUserName')).toBe('Alice')
    expect(storage.getItem('walletPhone')).toBe('+263123456789')
    for (const key of ['walletToken', 'credoTenantToken', 'tenantToken'])
      expect(storage.getItem(key)).toBe(token('alice'))
    expect(storage.getItem('credoContextMode')).toBe('personal')
    expect(JSON.parse(storage.getItem('credoSavedAccounts') || '[]')[0].id).toBe('alice')
  })

  it('never carries another person’s profile or org context into a VC sign-in', () => {
    applyPersonalLogin({
      token: token('alice'),
      tenantId: 'alice',
      claims: { displayName: 'Alice', email: 'alice@example.test' },
    })
    storage.setItem('credoOrgToken', 'old-org-token')
    storage.setItem('credoActiveOrg', '{"orgTenantId":"old-org"}')
    storage.setItem('credoOrgProfile', '{"name":"old-org"}')
    storage.setItem('auth.token', 'old-alias')
    applyPersonalLogin({ token: token('bob'), tenantId: 'bob' })
    for (const key of [
      'credoUserName',
      'walletEmail',
      'walletPhone',
      'auth.token',
      'credoOrgToken',
      'credoActiveOrg',
      'credoOrgProfile',
    ]) {
      expect(storage.getItem(key)).toBeNull()
    }
    expect(
      JSON.parse(storage.getItem('credoSavedAccounts') || '[]').map((account: { id: string }) => account.id),
    ).toEqual(['bob', 'alice'])
  })

  it('keeps a known name only for the same account when a claim is absent', () => {
    applyPersonalLogin({ token: token('alice'), tenantId: 'alice', claims: { displayName: 'Alice' } })
    applyPersonalLogin({ token: token('alice'), tenantId: 'alice' }, 'alice@example.test')
    expect(storage.getItem('credoUserName')).toBe('Alice')
    expect(storage.getItem('walletEmail')).toBe('alice@example.test')
  })

  it('rejects incomplete sessions before clearing the current account', () => {
    applyPersonalLogin({ token: token('alice'), tenantId: 'alice' })
    expect(() => applyPersonalLogin({ token: '', tenantId: 'bob' })).toThrow('personal session')
    expect(storage.getItem('walletToken')).toBe(token('alice'))
  })
})

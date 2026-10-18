import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import * as portal from '../credo-ui/portal/lib/savedAccounts'
import * as mobile from '../credo-ui/mobile/lib/savedAccounts'

const storage = new Map<string, string>()
const token = (tenantId: string) =>
  `header.${Buffer.from(JSON.stringify({ tenantId })).toString('base64url')}.signature`
const account = (id: string, phone: string) => ({
  id,
  label: phone,
  savedAt: '2026-10-15',
  session: { walletToken: token(id), credoUserPhone: phone },
})

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
})
afterEach(() => {
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('saved account identity labels shared by portal and mobile', () => {
  test('shows name with number in brackets, with an honest unnamed fallback', () => {
    expect(portal.savedAccountLabel('Clive', '263714123456')).toBe('Clive (+263714123456)')
    expect(mobile.savedAccountLabel(undefined, '263714123456')).toBe('Account (+263714123456)')
    expect(portal.savedAccountLabel('Clive')).toBe('Clive')
    expect(portal.savedAccountLabel('Clive', '+263714123456')).toBe('Clive (+263714123456)')
  })

  test('loads existing saved accounts from their own wallet identity, without exposing sessions', async () => {
    storage.set('credoSavedAccounts', JSON.stringify([account('worker', '111'), account('owner', '222')]))
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      const path = String(url)
      if (path.endsWith('/api/ssi/auth/session')) {
        const authorization = (options?.headers as Record<string, string>).Authorization
        return new Response(
          JSON.stringify({ token: authorization.includes(token('worker')) ? 'worker-session' : 'owner-session' }),
        )
      }
      const worker = path.includes('/worker/')
      expect((options?.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${worker ? 'worker' : 'owner'}-session`,
      )
      return new Response(
        JSON.stringify({
          items: [{ parsedDocument: { credentialSubject: { displayName: worker ? 'Clive' : 'Eloh' } } }],
        }),
      )
    })
    await portal.loadSavedAccountNames('http://localhost:3000')
    expect(portal.listSavedAccounts().map((entry) => entry.label)).toEqual(['Clive (111)', 'Eloh (222)'])
    expect(mobile.listSavedAccounts()).toEqual(portal.listSavedAccounts())
    expect(portal.listSavedAccounts().every((entry) => Object.keys(entry.session).length === 0)).toBe(true)
    await portal.loadSavedAccountNames('http://localhost:3000')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  test('restores each account name and removes the previous account name on add-account', () => {
    storage.set(
      'credoSavedAccounts',
      JSON.stringify([
        { ...account('worker', '111'), session: { ...account('worker', '111').session, credoUserName: 'Clive' } },
        { ...account('owner', '222'), session: { ...account('owner', '222').session, credoUserName: 'Eloh' } },
      ]),
    )
    expect(portal.restoreAccount('worker')).toBe(true)
    expect(storage.get('credoUserName')).toBe('Clive')
    expect(mobile.restoreAccount('owner')).toBe(true)
    expect(storage.get('credoUserName')).toBe('Eloh')
    portal.beginAddAccount()
    expect(storage.has('credoUserName')).toBe(false)
    expect(portal.listSavedAccounts().map((entry) => entry.label)).toEqual(['Eloh (222)', 'Clive (111)'])
  })

  test('keeps successful names when another saved session has expired, and reports the failure', async () => {
    storage.set('credoSavedAccounts', JSON.stringify([account('worker', '111'), account('expired', '222')]))
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/ssi/auth/session')) {
        const authorization = (options?.headers as Record<string, string>).Authorization
        return authorization.includes(token('expired'))
          ? new Response('{}', { status: 401 })
          : new Response(JSON.stringify({ token: 'worker-session' }))
      }
      return new Response(
        JSON.stringify({ items: [{ parsedDocument: { credentialSubject: { displayName: 'Clive' } } }] }),
      )
    })
    await expect(portal.loadSavedAccountNames('http://localhost:3000')).rejects.toThrow('(401)')
    expect(portal.listSavedAccounts().map((entry) => entry.label)).toEqual(['Clive (111)', 'Account (222)'])
  })
})

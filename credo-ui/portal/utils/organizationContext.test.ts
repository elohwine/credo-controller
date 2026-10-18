import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import axios from 'axios'

import { switchOrganizationContext } from './organizationContext'

let storage: Storage

beforeEach(() => {
  const values = new Map<string, string>()
  storage = {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
  storage.setItem('walletToken', 'holder')
  storage.setItem('credoContextMode', 'personal')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, dispatchEvent: () => true },
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('organisation switch response ownership', () => {
  const switchOrg = () =>
    switchOrganizationContext({
      backendUrl: 'http://localhost:3000',
      orgTenantId: 'org-b',
      personalToken: 'holder',
    })

  test('applies a switch response when its initiating context remains current', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'new-org-token', name: 'Org B' } })
    await expect(switchOrg()).resolves.toBe('new-org-token')
    expect(storage.getItem('credoOrgToken')).toBe('new-org-token')
    expect(JSON.parse(storage.getItem('credoActiveOrg')!).orgTenantId).toBe('org-b')
  })

  test.each(['walletToken', 'credoActiveOrg', 'credoContextMode', 'credoTaskContext'])(
    'does not overwrite a newer %s choice with a delayed response',
    async (key) => {
      let complete!: (response: { data: { token: string } }) => void
      jest.spyOn(axios, 'post').mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
      const pending = switchOrg()
      storage.setItem(key, 'new-choice')
      complete({ data: { token: 'delayed-org-token' } })
      await expect(pending).rejects.toThrow('account or task changed')
      expect(storage.getItem(key)).toBe('new-choice')
      expect(storage.getItem('credoOrgToken')).toBeNull()
      expect(storage.getItem('tenantToken')).toBeNull()
    },
  )
})

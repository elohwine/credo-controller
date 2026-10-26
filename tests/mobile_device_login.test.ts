import { beforeEach, describe, expect, test } from '@jest/globals'
import fs from 'fs'
import vm from 'vm'
import ts from 'typescript'

const source = fs.readFileSync('credo-ui/mobile/lib/deviceTrust.ts', 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

describe('phone sign-in account selection', () => {
  let storage: Map<string, string>
  let keys: Set<string>
  let available: boolean
  let deviceTrust: typeof import('../credo-ui/mobile/lib/deviceTrust')

  beforeEach(() => {
    storage = new Map()
    keys = new Set(['key-a'])
    available = true
    const exports = {}
    vm.runInNewContext(compiled, {
      exports,
      require: (name: string) => {
        if (name === '@/lib/api' || name === '@/lib/auth') return {}
        throw new Error(`Unexpected dependency: ${name}`)
      },
      window: {
        localStorage: { getItem: (name: string) => storage.get(name) ?? null },
        CredentisDeviceKey: {
          loginAvailable: () => available,
          hasKey: (alias: string) => keys.has(alias),
        },
      },
    })
    deviceTrust = exports as typeof deviceTrust
    storage.set('credentisLoginDevicesV1', JSON.stringify([
      { walletId: 'wallet-a', deviceKeyId: 'device-a', alias: 'key-a', label: 'Phone' },
    ]))
  })

  test.each([undefined, 'wallet-b'])('uses the sole enrolled account with remembered wallet %s', (wallet) => {
    if (wallet) storage.set('credentisPhoneWalletId', wallet)
    expect(deviceTrust.deviceLoginWalletId()).toBe('wallet-a')
  })

  test('prefers the remembered account when several valid accounts exist', () => {
    keys.add('key-b')
    storage.set('credentisPhoneWalletId', 'wallet-b')
    storage.set('credentisLoginDevicesV1', JSON.stringify([
      ...deviceTrust.loginDevices(),
      { walletId: 'wallet-b', deviceKeyId: 'device-b', alias: 'key-b', label: 'Phone' },
    ]))
    expect(deviceTrust.deviceLoginWalletId()).toBe('wallet-b')
    storage.delete('credentisPhoneWalletId')
    expect(() => deviceTrust.deviceLoginWalletId()).toThrow('choose which enrolled account')
  })

  test('does not treat a payment enrollment as a login enrollment', () => {
    storage.delete('credentisLoginDevicesV1')
    storage.set('credentisDeviceKeyId', 'payment-device')
    expect(() => deviceTrust.deviceLoginWalletId()).toThrow('Payment enrollment alone')
    expect(deviceTrust.supportsDeviceLogin()).toBe(true)
  })

  test('explains missing native keys rather than attempting authentication', () => {
    expect(deviceTrust.hasLocalLoginKey('device-a')).toBe(true)
    keys.clear()
    expect(deviceTrust.hasLocalLoginKey('device-a')).toBe(false)
    expect(() => deviceTrust.deviceLoginWalletId()).toThrow('No sign-in key')
  })

  test('server records on other devices do not imply a local key', () => {
    expect(deviceTrust.hasLocalLoginKey('another-device')).toBe(false)
  })

  test('explains unavailable screen-lock authentication', () => {
    available = false
    expect(() => deviceTrust.deviceLoginWalletId()).toThrow('Check your phone screen lock')
  })

  test('reports damaged registration instead of silently hiding it', () => {
    storage.set('credentisLoginDevicesV1', '{}')
    expect(() => deviceTrust.loginDeviceAvailable()).toThrow('registration is damaged')
  })
})

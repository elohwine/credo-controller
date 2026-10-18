/**
 * Same-device sign-in must not present a card for a wallet that has no account.
 * The presentation itself is Credo's job and is not started here.
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WalletAuthController } from '../src/controllers/wallet/WalletAuthController'
import { StatusException } from '../src/errors/StatusException'

import { initTestDatabases, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('same-device-login-')
})

afterAll(() => databases.cleanup())

describe('same-device wallet sign-in', () => {
  test('an unknown wallet is refused before a presentation is built', async () => {
    const controller = new WalletAuthController({} as any)
    await expect(
      controller.presentSameDeviceLogin({} as any, {
        walletId: 'wallet-not-registered',
        authorizationRequest: 'openid4vp://?request_uri=https%3A%2F%2Fexample%2Frequest',
      }),
    ).rejects.toBeInstanceOf(StatusException)
  })
})

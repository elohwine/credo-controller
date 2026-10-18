import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import Database from 'better-sqlite3'

import { DatabaseManager } from '../DatabaseManager'
import { consumeLoginChallenge, saveLoginChallenge } from '../LoginChallengeRepository'

describe('consumeLoginChallenge', () => {
  beforeAll(() => {
    ;(DatabaseManager as any).instance = new Database(':memory:')
  })

  afterAll(() => {
    ;(DatabaseManager as any).instance = undefined
  })

  it('lets a challenge be used exactly once', () => {
    const now = Date.now()
    saveLoginChallenge({
      id: 'nonce-1',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    })
    expect(consumeLoginChallenge('nonce-1')).toBe(true)
    expect(consumeLoginChallenge('nonce-1')).toBe(false)
  })

  it('refuses an expired or unknown challenge', () => {
    saveLoginChallenge({
      id: 'nonce-old',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(consumeLoginChallenge('nonce-old')).toBe(false)
    expect(consumeLoginChallenge('never-issued')).toBe(false)
  })
})

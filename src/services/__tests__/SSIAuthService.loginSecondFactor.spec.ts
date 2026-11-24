import 'reflect-metadata'

import type { Agent } from '@credo-ts/core'
import Database from 'better-sqlite3'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { notificationService } from '../NotificationService'
import { hashPin } from '../ssi/pinHash'

jest.unstable_mockModule('../ssi/CustodyRebindService', () => ({
  custodyRebindService: { scheduleRebind: jest.fn().mockResolvedValue(undefined) },
}))

let SSIAuthServiceClass: typeof import('../SSIAuthService').SSIAuthService
beforeAll(async () => {
  ;({ SSIAuthService: SSIAuthServiceClass } = await import('../SSIAuthService'))
})

describe('PIN second-factor OTP', () => {
  let db: Database.Database
  let service: InstanceType<typeof SSIAuthServiceClass> & Record<string, any>
  let restoreDatabase: { mockRestore: () => void }
  let sendSms: jest.SpiedFunction<typeof notificationService.sendSms>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (
        id TEXT PRIMARY KEY, tenant_id TEXT, did TEXT, pin_hash TEXT, phone_hash TEXT, email_hash TEXT,
        contact_hash_version INTEGER, pin_change_required INTEGER DEFAULT 0, pin_attempts INTEGER DEFAULT 0,
        pin_locked_until TEXT, last_login_at TEXT, updated_at TEXT
      );
    `)
    db.exec(`CREATE TABLE wallet_login_sessions (
      login_id TEXT PRIMARY KEY, poll_token_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, consumed_at TEXT, authorization_request TEXT
    )`)
    db.exec(`
      CREATE TABLE login_second_factor_challenges (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL, used_at TEXT, otp_hash TEXT, otp_salt TEXT, otp_expires_at TEXT,
        otp_sent_at TEXT, otp_attempts INTEGER NOT NULL DEFAULT 0
      );
    `)
    db.prepare(
      `INSERT INTO ssi_users
        (id, tenant_id, did, pin_hash, contact_hash_version, pin_change_required, pin_attempts)
       VALUES (?, ?, ?, ?, 2, 0, 0)`,
    ).run('user-1', 'wallet-1', 'did:key:user', hashPin('5682'))
    restoreDatabase = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db)
    service = new SSIAuthServiceClass({} as Agent) as InstanceType<typeof SSIAuthServiceClass> & Record<string, any>
    service.normalizePhone = (phone: string) => phone
    service.findUserByContact = () => ({ id: 'user-1' })
    service.generateSessionToken = async () => 'session-token'
    sendSms = jest.spyOn(notificationService, 'sendSms').mockResolvedValue({ success: true })
  })

  afterEach(() => {
    sendSms.mockRestore()
    restoreDatabase.mockRestore()
    db.close()
  })

  it('sends a short-lived text code and issues one session only after verification', async () => {
    const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
    const sent = await service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')
    expect(sent.sentTo).toBe('****4567')
    const message = String(sendSms.mock.calls[0][1])
    const code = message.match(/\b\d{6}\b/)?.[0]
    expect(code).toBeDefined()

    await expect(service.verifyLoginOtp(factor.challengeId, factor.challengeToken, code)).resolves.toMatchObject({
      token: 'session-token',
      tenantId: 'wallet-1',
      mustChangePin: false,
    })
    await expect(service.verifyLoginOtp(factor.challengeId, factor.challengeToken, code)).rejects.toMatchObject({
      status: 401,
    })
  })

  it('locks the code path after five wrong attempts and rejects a different phone', async () => {
    const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
    service.findUserByContact = () => ({ id: 'another-user' })
    await expect(service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0770000000')).rejects.toMatchObject({
      status: 400,
    })
    service.findUserByContact = () => ({ id: 'user-1' })
    await service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')
    const code = String(sendSms.mock.calls.at(-1)?.[1]).match(/\b\d{6}\b/)?.[0]
    const wrongCode = code === '000000' ? '000001' : '000000'
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(service.verifyLoginOtp(factor.challengeId, factor.challengeToken, wrongCode)).rejects.toMatchObject({
        status: 401,
      })
    }
    await expect(service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')).rejects.toMatchObject({
      status: 429,
    })
  })

  it('keeps failed guesses counted when a replacement code is sent', async () => {
    const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
    await service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')
    const firstCode = String(sendSms.mock.calls.at(-1)?.[1]).match(/\b\d{6}\b/)?.[0]
    const wrongCode = firstCode === '000000' ? '000001' : '000000'
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(service.verifyLoginOtp(factor.challengeId, factor.challengeToken, wrongCode)).rejects.toMatchObject({
        status: 401,
      })
    }
    db.prepare('UPDATE login_second_factor_challenges SET otp_sent_at = ? WHERE id = ?').run(
      new Date(Date.now() - 61_000).toISOString(),
      factor.challengeId,
    )
    await service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')
    const code = String(sendSms.mock.calls.at(-1)?.[1]).match(/\b\d{6}\b/)?.[0]
    expect(code).toBeDefined()
    const replacementWrongCode = code === wrongCode ? (wrongCode === '000000' ? '000001' : '000000') : wrongCode
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        service.verifyLoginOtp(factor.challengeId, factor.challengeToken, replacementWrongCode),
      ).rejects.toMatchObject({ status: 401 })
    }
    await expect(service.verifyLoginOtp(factor.challengeId, factor.challengeToken, code)).rejects.toMatchObject({
      status: 401,
    })
  })

  it('does not disclose or accept a pending challenge without its secret token', () => {
    const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
    expect(() => service.secondFactorWallet(factor.challengeId, 'wrong-token')).toThrow(/unavailable or has expired/)
  })

  it('limits text-code sends across separate PIN attempts for the same account', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
      await service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')
    }
    const fourth = service.createLoginSecondFactor('user-1', 'wallet-1')
    await expect(service.sendLoginOtp(fourth.challengeId, fourth.challengeToken, '0771234567')).rejects.toMatchObject({
      status: 429,
    })
    expect(sendSms).toHaveBeenCalledTimes(3)
  })

  it('does not leave a usable code when text delivery fails', async () => {
    const factor = service.createLoginSecondFactor('user-1', 'wallet-1')
    sendSms.mockResolvedValueOnce({ success: false, skipped: true })
    await expect(service.sendLoginOtp(factor.challengeId, factor.challengeToken, '0771234567')).rejects.toMatchObject({
      status: 503,
    })
    const row = db
      .prepare('SELECT otp_hash, otp_salt, otp_expires_at FROM login_second_factor_challenges WHERE id = ?')
      .get(factor.challengeId)
    expect(row).toEqual({ otp_hash: null, otp_salt: null, otp_expires_at: null })
  })

  it('does not issue a session after PIN when this account has phone sign-in enabled', async () => {
    service.findUserByContact = () => db.prepare('SELECT * FROM ssi_users WHERE id = ?').get('user-1')
    service.securityStatus = () => ({ phoneSignIn: true })
    service.generateSessionToken = jest.fn(async () => 'should-not-be-issued-yet')
    const result = await service.loginWithPin({ phone: '0771234567', pin: '5682' })
    expect(result).toMatchObject({
      tenantId: 'wallet-1',
      mustChangePin: false,
      secondFactor: { challengeId: expect.any(String), challengeToken: expect.any(String) },
    })
    expect(result.token).toBeUndefined()
    expect(service.generateSessionToken).not.toHaveBeenCalled()
  })

  it('keeps the existing PIN-only sign-in when phone sign-in is not enabled', async () => {
    service.findUserByContact = () => db.prepare('SELECT * FROM ssi_users WHERE id = ?').get('user-1')
    service.securityStatus = () => ({ phoneSignIn: false })
    service.generateSessionToken = jest.fn(async () => 'session-token')
    await expect(service.loginWithPin({ phone: '0771234567', pin: '5682' })).resolves.toMatchObject({
      token: 'session-token',
      tenantId: 'wallet-1',
      mustChangePin: false,
    })
    expect(service.generateSessionToken).toHaveBeenCalledTimes(1)
  })
})

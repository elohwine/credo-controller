/**
 * Invite links: the organisation never picks the person's PIN. The person opens the link sent to
 * their own phone, confirms their name and chooses a PIN.
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { Agent } from '@credo-ts/core'
import { createHash } from 'crypto'
import { container } from 'tsyringe'

import { getContactById, upsertContact } from '../src/persistence/ContactRepository'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { memberInviteLink, memberInviteService } from '../src/services/MemberInviteService'
import { notificationService } from '../src/services/NotificationService'
import { OrganizationService } from '../src/services/OrganizationService'
import { assertPinChangeNotPending } from '../src/services/PersonalSessionPolicy'
import { InviteRequiredError, SSIAuthService } from '../src/services/SSIAuthService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
const env = { ...process.env }

beforeAll(() => {
  databases = initTestDatabases('credo-member-invite-')
  process.env.JWT_SECRET = 'test-secret'
  process.env.WALLET_PUBLIC_URL = 'https://wallet.example'
  container.register(Agent, { useValue: {} as any })
})

afterAll(() => {
  process.env = env
  databases.cleanup()
})

const PHONE = '263771234567'

function invitedPerson(name = 'Rudo Moyo') {
  const org = seedOrganization({ setup: 'new' })
  const userId = `user-${Math.random().toString(36).slice(2)}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId, role: 'field_worker' })
  const phoneHash = createHash('sha256').update(PHONE).digest('hex')
  DatabaseManager.getDatabase()
    .prepare('UPDATE ssi_users SET phone_hash = ?, pin_hash = NULL WHERE id = ?')
    .run(`${phoneHash}`, userId)
  // Only one test user may own the phone at a time.
  DatabaseManager.getDatabase()
    .prepare('UPDATE ssi_users SET phone_hash = NULL WHERE phone_hash = ? AND id != ?')
    .run(phoneHash, userId)
  upsertContact({
    id: `${org.orgTenantId}:member:${userId}`,
    orgTenantId: org.orgTenantId,
    contactScope: 'internal',
    name: 'Team member',
    phone: PHONE,
    walletTenantId: `wallet-${userId}`,
  })
  const inviteId = memberInviteService.create({
    userId,
    orgTenantId: org.orgTenantId,
    invitedBy: 'owner',
    proposedName: name,
  })
  return { org, userId, inviteId }
}

describe('member invite links', () => {
  test('each send replaces the code; used and replaced links stop working', () => {
    const { inviteId } = invitedPerson()
    const first = memberInviteService.issueCode(inviteId)!
    const second = memberInviteService.issueCode(inviteId)!
    expect(memberInviteService.findOpenByCode(first)).toBeUndefined()
    expect(memberInviteService.findOpenByCode(second)?.id).toBe(inviteId)
  })

  test('a newer invite for the same person retires the older one', () => {
    const { org, userId, inviteId } = invitedPerson()
    const code = memberInviteService.issueCode(inviteId)!
    memberInviteService.create({ userId, orgTenantId: org.orgTenantId, invitedBy: 'owner' })
    expect(memberInviteService.findOpenByCode(code)).toBeUndefined()
    expect(memberInviteService.issueCode(inviteId)).toBeUndefined()
  })

  test('an invited account cannot be claimed by guessing the first PIN', async () => {
    invitedPerson()
    const auth = new SSIAuthService({} as any)
    await expect(auth.loginWithPin({ phone: '0771234567', pin: '1234' })).rejects.toBeInstanceOf(InviteRequiredError)
  })

  test('the person confirms their name and chooses their PIN through the link', async () => {
    const { org, userId, inviteId } = invitedPerson('Rudo')
    const code = memberInviteService.issueCode(inviteId)!
    const auth = new SSIAuthService({} as any)
    jest.spyOn(auth, 'reissuePlatformIdentityOffer').mockResolvedValue(undefined)

    expect(auth.describeInvite(code)).toMatchObject({
      role: 'field_worker',
      proposedName: 'Rudo',
      phoneHint: '•••• 4567',
    })
    await expect(auth.acceptInvite({ code, name: 'Rudo Moyo', phone: '0779999999', pin: '2580' })).rejects.toThrow(
      'not the phone number',
    )
    await expect(auth.acceptInvite({ code, name: 'Rudo Moyo', phone: PHONE, pin: '1234' })).rejects.toThrow('too easy')
    await expect(auth.acceptInvite({ code, name: 'Team member', phone: PHONE, pin: '1234' })).rejects.toThrow(
      'Enter your name',
    )

    const accepted = await auth.acceptInvite({ code, name: 'Rudo Moyo', phone: '0771234567', pin: '2468' })
    expect(accepted.token).toBeTruthy()
    expect(auth.reissuePlatformIdentityOffer).toHaveBeenCalledWith(`wallet-${userId}`, 'Rudo Moyo', PHONE)
    expect(getContactById(`${org.orgTenantId}:member:${userId}`, org.orgTenantId)?.name).toBe('Rudo Moyo')

    await expect(auth.acceptInvite({ code, name: 'Rudo Moyo', phone: PHONE, pin: '1111' })).rejects.toThrow('expired')
    await expect(auth.loginWithPin({ phone: PHONE, pin: '2468' })).resolves.toHaveProperty('token')
    await expect(auth.loginWithPin({ phone: PHONE, pin: '1111' })).rejects.toThrow('Invalid credentials')
  })

  test('a person who asks for WhatsApp alerts on joining gets every alert from that org', async () => {
    const { org, userId, inviteId } = invitedPerson()
    const code = memberInviteService.issueCode(inviteId)!
    const auth = new SSIAuthService({} as any)
    await auth.acceptInvite({ code, name: 'Rudo Moyo', phone: '0771234567', pin: '1357', whatsappAlerts: true })
    for (const eventType of ['task', 'vc_offer', 'proof_request', 'payment_link', 'remittance']) {
      expect(notificationService.consentedRecipient(org.orgTenantId, eventType, { userId })).toEqual({
        userId,
        phone: PHONE,
      })
    }
  })

  test('without the alerts tick, joining turns on nothing beyond the invite', async () => {
    const { org, userId, inviteId } = invitedPerson()
    const code = memberInviteService.issueCode(inviteId)!
    const auth = new SSIAuthService({} as any)
    await auth.acceptInvite({ code, name: 'Rudo Moyo', phone: PHONE, pin: '1357' })
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT event_type FROM notification_preferences WHERE tenant_id = ? AND user_id = ? AND enabled = 1')
      .all(org.orgTenantId, userId) as Array<{ event_type: string }>
    expect(rows.map((r) => r.event_type).filter((e) => e !== 'invite')).toEqual([])
  })

  test('an invite link keeps a path on the wallet address', () => {
    process.env.WALLET_PUBLIC_URL = 'http://localhost:3006/app'
    expect(memberInviteLink('abc')).toBe('http://localhost:3006/app/login/join?code=abc')
    process.env.WALLET_PUBLIC_URL = 'https://wallet.example'
    expect(memberInviteLink('abc')).toBe('https://wallet.example/login/join?code=abc')
  })

  test('a text fallback is not spent when no text message can be sent', async () => {
    const { inviteId } = invitedPerson()
    delete process.env.SMS_API_KEY
    delete process.env.AT_API_KEY
    delete process.env.SMS_GATEWAY_URL
    const sms = jest.spyOn(notificationService, 'sendSms')
    await expect(notificationService.sendInviteFallbackSms(inviteId, PHONE)).resolves.toBe(false)
    expect(sms).not.toHaveBeenCalled()
    expect(memberInviteService.get(inviteId)?.fallback_sent_at).toBeNull()
    expect(memberInviteService.issueCode(inviteId)).toBeTruthy()
    sms.mockRestore()
  })

  test('an invite WhatsApp cannot carry falls back to one text message with a fresh link', async () => {
    const { inviteId } = invitedPerson()
    process.env.WALLET_PUBLIC_URL = 'https://wallet.example'
    process.env.SMS_API_KEY = 'test-key'
    const sms = jest.spyOn(notificationService, 'sendSms').mockResolvedValue({ success: true })
    await expect(notificationService.sendInviteFallbackSms(inviteId, PHONE)).resolves.toBe(true)
    await expect(notificationService.sendInviteFallbackSms(inviteId, PHONE)).resolves.toBe(false)
    expect(sms).toHaveBeenCalledTimes(1)
    const text = String(sms.mock.calls[0][1])
    const code = new URL(text.match(/https:\/\/\S+/)![0]).searchParams.get('code')!
    expect(text).toContain('https://wallet.example/login/join?code=')
    expect(memberInviteService.findOpenByCode(code)?.id).toBe(inviteId)
    sms.mockRestore()
  })

  test('a temporary PIN from the organisation opens only the change-PIN screen until replaced', async () => {
    const { userId, inviteId } = invitedPerson()
    const code = memberInviteService.issueCode(inviteId)!
    const auth = new SSIAuthService({} as any)
    expect(() => auth.setTemporaryPin(userId, '0000')).toThrow('too easy')
    auth.setTemporaryPin(userId, '4826')
    expect(memberInviteService.findOpenByCode(code)).toBeUndefined()

    // Earlier tests leave the same phone on accepted accounts in its keyed form.
    DatabaseManager.getDatabase().prepare('UPDATE ssi_users SET phone_hash = NULL WHERE id != ?').run(userId)
    const first = await auth.loginWithPin({ phone: PHONE, pin: '4826' })
    expect(first.mustChangePin).toBe(true)
    expect(auth.securityStatus(userId)).toMatchObject({ mustChangePin: true, hasPin: true })
    const claims = { id: userId }
    expect(() => assertPinChangeNotPending(claims, '/api/organizations/x/members')).toThrow('Choose your own PIN')
    expect(() => assertPinChangeNotPending(claims, '/api/wallet/auth/pin/change')).not.toThrow()

    await expect(auth.changePin(userId, '9999', '7391')).rejects.toThrow('current PIN')
    await expect(auth.changePin(userId, '4826', '4826')).rejects.toThrow('different')
    await expect(auth.changePin(userId, '4826', '7391')).resolves.toHaveProperty('token')
    expect(() => assertPinChangeNotPending(claims, '/api/organizations/x/members')).not.toThrow()
    await expect(auth.loginWithPin({ phone: PHONE, pin: '7391' })).resolves.toMatchObject({ mustChangePin: false })
    // The organisation can never overwrite a PIN the person chose.
    expect(() => auth.setTemporaryPin(userId, '5172')).toThrow('already chosen')
  })

  test('typed names are cleaned and placeholders refused', () => {
    expect(OrganizationService.cleanPersonName('  Tendai   Moyo ')).toBe('Tendai Moyo')
    expect(OrganizationService.cleanPersonName('Team member')).toBeUndefined()
    expect(OrganizationService.cleanPersonName('x')).toBeUndefined()
  })
})

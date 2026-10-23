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
import { memberInviteService } from '../src/services/MemberInviteService'
import { notificationService } from '../src/services/NotificationService'
import { OrganizationService } from '../src/services/OrganizationService'
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

    expect(auth.describeInvite(code)).toMatchObject({ role: 'field_worker', proposedName: 'Rudo', phoneHint: '•••• 4567' })
    await expect(auth.acceptInvite({ code, name: 'Rudo Moyo', phone: '0779999999', pin: '1234' })).rejects.toThrow(
      'not the phone number',
    )
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
      expect(notificationService.consentedRecipient(org.orgTenantId, eventType, { userId })).toEqual({ userId, phone: PHONE })
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

  test('an invite WhatsApp cannot carry falls back to one text message with a fresh link', async () => {
    const { inviteId } = invitedPerson()
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

  test('typed names are cleaned and placeholders refused', () => {
    expect(OrganizationService.cleanPersonName('  Tendai   Moyo ')).toBe('Tendai Moyo')
    expect(OrganizationService.cleanPersonName('Team member')).toBeUndefined()
    expect(OrganizationService.cleanPersonName('x')).toBeUndefined()
  })
})

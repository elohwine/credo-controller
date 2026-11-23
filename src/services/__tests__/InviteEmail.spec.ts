// eslint-disable-next-line import/no-extraneous-dependencies
import { jest } from '@jest/globals'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { memberInviteLink, memberInviteService } from '../MemberInviteService'
import { NotificationService } from '../NotificationService'

describe('invite links by email', () => {
  const env = { ...process.env }
  let db: Database.Database
  let fetchMock: jest.Mock<typeof fetch>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/135_member_invites.sql', 'utf8'))
    jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }))
    global.fetch = fetchMock as any
    process.env = { ...env, RESEND_API_KEY: 're_test', EMAIL_FROM: 'LDK iFacilities <no-reply@mail.ldkgroup.co.uk>' }
    delete process.env.SMTP_HOST
  })

  afterEach(() => {
    process.env = { ...env }
    jest.restoreAllMocks()
    db.close()
  })

  it('points the link at INVITE_JOIN_URL when the phone app is not hosted', () => {
    expect(memberInviteLink('abc', { INVITE_JOIN_URL: 'https://portal.example/auth/join' } as any)).toBe(
      'https://portal.example/auth/join?code=abc',
    )
    expect(memberInviteLink('abc', { INVITE_JOIN_URL: 'javascript:alert(1)' } as any)).toBeUndefined()
  })

  it('emails a working one-time link through Resend', async () => {
    process.env.INVITE_JOIN_URL = 'https://portal.example/auth/join'
    const inviteId = memberInviteService.create({ userId: 'u1', orgTenantId: 'org-1', invitedBy: 'owner', proposedName: 'Tendai' })

    await expect(new NotificationService().sendInviteEmail(inviteId, 'tendai@example.com')).resolves.toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const body = JSON.parse(String(init.body))
    expect(body.from).toBe('LDK iFacilities <no-reply@mail.ldkgroup.co.uk>')
    expect(body.to).toEqual(['tendai@example.com'])
    const code = /code=([\w-]+)/.exec(body.text)?.[1]
    expect(code && memberInviteService.findOpenByCode(code)?.id).toBe(inviteId)
  })

  it('reports failure instead of throwing when Resend rejects the message', async () => {
    process.env.INVITE_JOIN_URL = 'https://portal.example/auth/join'
    fetchMock.mockResolvedValue(new Response('domain not verified', { status: 403 }))
    const inviteId = memberInviteService.create({ userId: 'u2', orgTenantId: 'org-1', invitedBy: 'owner' })

    await expect(new NotificationService().sendInviteEmail(inviteId, 'x@example.com')).resolves.toBe(false)
  })

  it('does not spend the code when email is not set up', async () => {
    delete process.env.RESEND_API_KEY
    process.env.INVITE_JOIN_URL = 'https://portal.example/auth/join'
    const inviteId = memberInviteService.create({ userId: 'u3', orgTenantId: 'org-1', invitedBy: 'owner' })

    await expect(new NotificationService().sendInviteEmail(inviteId, 'x@example.com')).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(memberInviteService.get(inviteId)?.code_hash).toBeNull()
  })
})

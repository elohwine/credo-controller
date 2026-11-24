import crypto from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'

export const MEMBER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface MemberInviteRow {
  id: string
  user_id: string
  org_tenant_id: string
  invited_by: string
  proposed_name: string | null
  code_hash: string | null
  expires_at: string
  used_at: string | null
  fallback_sent_at: string | null
  created_at?: string
  delivery_channel?: InviteDeliveryChannel | null
  delivery_status?: InviteDeliveryStatus | null
  delivery_reason?: string | null
  delivery_ref?: string | null
  delivery_to?: string | null
  delivery_at?: string | null
}

export type InviteDeliveryChannel = 'email' | 'whatsapp' | 'sms' | 'link'
export type InviteDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'not_sent'

export interface InviteDeliveryRecord {
  channel: InviteDeliveryChannel
  status: InviteDeliveryStatus
  reason?: string
  ref?: string
  to?: string
}

const hashCode = (code: string) => crypto.createHash('sha256').update(code.trim()).digest('hex')

/** Where the invited person confirms their name and chooses a PIN. Public page in the wallet app. */
export function memberInviteLink(code: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  try {
    // INVITE_JOIN_URL is the full join page address, e.g. the portal's /auth/join when the phone app is not hosted.
    if (env.INVITE_JOIN_URL) {
      const join = new URL(env.INVITE_JOIN_URL)
      if (!/^https?:$/.test(join.protocol)) return undefined
      join.searchParams.set('code', code)
      return join.toString()
    }
    const base = new URL(env.WALLET_PUBLIC_URL || env.MOBILE_APP_URL || '')
    if (!/^https?:$/.test(base.protocol)) return undefined
    // Keep a path such as /app. A bare origin still lands on /login/join.
    const prefix = base.pathname.replace(/\/+$/, '')
    const link = new URL(`${prefix}/login/join`, base.origin)
    link.searchParams.set('code', code)
    return link.toString()
  } catch {
    return undefined
  }
}

/**
 * One-time invite links. The organisation never chooses the person's PIN: the person opens the
 * link sent to their own phone, confirms their name and picks a PIN. Only a hash of the code is
 * stored and each send replaces it, so an older message stops working.
 */
export class MemberInviteService {
  /** Start a fresh invite for someone who has not chosen a PIN yet. Older open invites for them stop working. */
  public create(input: { userId: string; orgTenantId: string; invitedBy: string; proposedName?: string }): string {
    const db = DatabaseManager.getDatabase()
    const now = new Date()
    const id = crypto.randomUUID()
    db.transaction(() => {
      db.prepare(
        `UPDATE member_invites SET code_hash = NULL, expires_at = ?, updated_at = ?
        WHERE user_id = ? AND used_at IS NULL AND expires_at > ?`,
      ).run(now.toISOString(), now.toISOString(), input.userId, now.toISOString())
      db.prepare(
        `INSERT INTO member_invites (id, user_id, org_tenant_id, invited_by, proposed_name, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.userId,
        input.orgTenantId,
        input.invitedBy,
        input.proposedName || null,
        new Date(now.getTime() + MEMBER_INVITE_TTL_MS).toISOString(),
        now.toISOString(),
        now.toISOString(),
      )
    })()
    return id
  }

  /** A new code for an open invite, right before it is sent. Undefined once used or expired. */
  public issueCode(inviteId: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    const code = crypto.randomBytes(24).toString('base64url')
    const now = new Date().toISOString()
    const updated = db
      .prepare(
        `UPDATE member_invites SET code_hash = ?, updated_at = ?
        WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .run(hashCode(code), now, inviteId, now)
    return updated.changes ? code : undefined
  }

  public get(inviteId: string): MemberInviteRow | undefined {
    return DatabaseManager.getDatabase().prepare('SELECT * FROM member_invites WHERE id = ?').get(inviteId) as
      | MemberInviteRow
      | undefined
  }

  /** The open invite behind a code, or undefined when the code is wrong, replaced, used or expired. */
  public findOpenByCode(code: string): MemberInviteRow | undefined {
    if (!code || code.length > 200) return undefined
    return DatabaseManager.getDatabase()
      .prepare('SELECT * FROM member_invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?')
      .get(hashCode(code), new Date().toISOString()) as MemberInviteRow | undefined
  }

  /** The latest open invite for a person in an organisation. */
  public openForMember(userId: string, orgTenantId: string): MemberInviteRow | undefined {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT * FROM member_invites WHERE user_id = ? AND org_tenant_id = ? AND used_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId, orgTenantId, new Date().toISOString()) as MemberInviteRow | undefined
  }

  /** True when this account was opened by an invite, so its PIN may only be set through the invite link. */
  public wasInvited(userId: string): boolean {
    return Boolean(DatabaseManager.getDatabase().prepare('SELECT 1 FROM member_invites WHERE user_id = ?').get(userId))
  }

  /** Every open invite for the person is spent once they have chosen a PIN. */
  public markUsed(userId: string): void {
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare('UPDATE member_invites SET used_at = ?, code_hash = NULL, updated_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(now, now, userId)
  }

  /** How the latest send of this invite went. Shown on the team list so a failed send can be retried. */
  public recordDelivery(inviteId: string, delivery: InviteDeliveryRecord): void {
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE member_invites SET delivery_channel = ?, delivery_status = ?, delivery_reason = ?, delivery_ref = ?,
          delivery_to = ?, delivery_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        delivery.channel,
        delivery.status,
        delivery.reason ? delivery.reason.slice(0, 300) : null,
        delivery.ref || null,
        delivery.to || null,
        now,
        now,
        inviteId,
      )
  }

  /** The newest not-yet-used invite of each person in an organisation, expired ones included. */
  public latestUnusedByMember(orgTenantId: string): Map<string, MemberInviteRow> {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT * FROM member_invites WHERE org_tenant_id = ? AND used_at IS NULL ORDER BY created_at ASC, rowid ASC`,
      )
      .all(orgTenantId) as MemberInviteRow[]
    const latest = new Map<string, MemberInviteRow>()
    for (const row of rows) latest.set(row.user_id, row)
    return latest
  }

  /** Claims the one fallback text message for an invite. False when one was already sent. */
  public claimFallback(inviteId: string): boolean {
    const now = new Date().toISOString()
    return (
      DatabaseManager.getDatabase()
        .prepare(
          'UPDATE member_invites SET fallback_sent_at = ?, updated_at = ? WHERE id = ? AND fallback_sent_at IS NULL',
        )
        .run(now, now, inviteId).changes > 0
    )
  }
}

export const memberInviteService = new MemberInviteService()

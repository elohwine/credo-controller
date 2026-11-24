/**
 * IdenEx Credentis - Notification Service
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Delivery channels for workflow notifications:
 * - Email (SMTP)
 * - WhatsApp Business Cloud API
 * - Wallet push (HTTP webhook)
 *
 * @module services/NotificationService
 * @copyright 2024-2026 IdenEx Credentis
 */

import axios from 'axios'
import { createHash, randomUUID } from 'crypto'
import nodemailer from 'nodemailer'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { rootLogger } from '../utils/pinoLogger'

import { DispatchError, outboxService } from './OutboxService'
import { phoneHashCandidates } from './ssi/contactHash'
import {
  normalizeNotificationPhone,
  whatsAppGraphUrl,
  whatsAppSenderService,
  WHATSAPP_EVENTS,
} from './WhatsAppSenderService'
import {
  EVENT_EMOJI,
  credentialTypeLabel,
  headerImageUrl,
  richTemplateComponents,
  richTemplateFor,
  roleText,
  templateText,
  type RichTemplateEvent,
} from './whatsAppTemplates'
import { PRODUCT_NAME } from '../config/productEdition'

const logger = rootLogger.child({ module: 'NotificationService' })

/** Outbox topic for an invite email; retried with backoff like WhatsApp alerts. */
export const INVITE_EMAIL_TOPIC = 'member.invite.email'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export interface EmailPayload {
  to: string
  subject: string
  text?: string
  html?: string
  from?: string
  replyTo?: string
}

export interface WhatsAppTextPayload {
  tenantId?: string
  eventType?: string
  dedupeKey?: string
  /** Inbox card the alert opens; the button falls back to the plain inbox without it. */
  inboxItemId?: string
  to: string
  body: string
  previewUrl?: boolean
  /**
   * Where this alert actually leads (a pay link, an acknowledgement link, …). Kept alongside
   * `body` through the outbox so the worker that sends the message later still has the real
   * content and link, not just the event type and an inbox item id it may not be able to match.
   */
  actionUrl?: string
}

export interface WhatsAppCtaPayload {
  tenantId?: string
  eventType?: string
  dedupeKey?: string
  to: string
  headerText: string
  bodyText: string
  buttonText: string
  url: string
}

export interface WalletPushPayload {
  offerUri?: string
  title?: string
  body?: string
  actionUrl?: string
  type?: 'issuance' | 'verification' | 'generic'
}

export interface ContactNotificationResult {
  accepted: boolean
  channels: Array<{
    channel: 'whatsapp' | 'sms' | 'email'
    status: 'accepted' | 'queued' | 'skipped' | 'failed'
    /** The outbox delivery row of a queued message, so its later outcome can be read. */
    notificationId?: string
  }>
}

export class NotificationService {
  public setPreference(input: {
    tenantId: string
    userId: string
    phone: string
    eventType: string
    enabled: boolean
  }): void {
    if (!WHATSAPP_EVENTS.includes(input.eventType as any))
      throw new DispatchError('Unsupported notification event', 'permanent')
    const phone = normalizeNotificationPhone(input.phone)
    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT phone_hash FROM ssi_users WHERE id = ?').get(input.userId) as
      | { phone_hash?: string }
      | undefined
    if (!user?.phone_hash || !phoneHashCandidates(phone).includes(user.phone_hash)) {
      throw new DispatchError('Phone is not owned by authenticated user', 'permanent')
    }
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO notification_preferences (tenant_id, user_id, phone, event_type, enabled, consent_at, consent_source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'authenticated_self', ?) ON CONFLICT(tenant_id, user_id, event_type)
      DO UPDATE SET phone = excluded.phone, enabled = excluded.enabled, consent_at = excluded.consent_at,
      consent_source = excluded.consent_source, updated_at = excluded.updated_at`,
    ).run(input.tenantId, input.userId, phone, input.eventType, input.enabled ? 1 : 0, now, now)
  }

  /**
   * The inviter confirmed the person agreed to get their invite on WhatsApp. Covers the invite
   * message only; every other event still needs the person's own opt-in.
   */
  public recordInviteConsent(orgTenantId: string, userId: string, phone: string): void {
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO notification_preferences (tenant_id, user_id, phone, event_type, enabled, consent_at, consent_source, updated_at)
        VALUES (?, ?, ?, 'invite', 1, ?, 'inviter_confirmed', ?) ON CONFLICT(tenant_id, user_id, event_type)
        DO UPDATE SET phone = excluded.phone, updated_at = excluded.updated_at`,
      )
      .run(orgTenantId, userId, normalizeNotificationPhone(phone), now, now)
  }

  /**
   * Enabled WhatsApp opt-in for one organization's event. The organization's own switch wins (on or off);
   * otherwise the person's own "any organization" switch (stored under their wallet tenant) applies, but
   * only for organizations sending from the shared Credentis platform number they opted in to.
   */
  public consentedRecipient(
    orgTenantId: string,
    eventType: string,
    match: { userId: string } | { phone: string },
  ): { userId: string; phone: string } | undefined {
    const db = DatabaseManager.getDatabase()
    const [column, value] = 'userId' in match ? ['p.user_id', match.userId] : ['p.phone', match.phone]
    const scoped = db
      .prepare(
        `SELECT p.user_id AS userId, p.phone, p.enabled FROM notification_preferences p
        WHERE p.tenant_id = ? AND p.event_type = ? AND ${column} = ? ORDER BY p.enabled DESC LIMIT 1`,
      )
      .get(orgTenantId, eventType, value) as { userId: string; phone: string; enabled: number } | undefined
    if (scoped) return scoped.enabled ? { userId: scoped.userId, phone: scoped.phone } : undefined
    if (whatsAppSenderService.selection(orgTenantId)?.mode !== 'platform') return undefined
    return db
      .prepare(
        `SELECT p.user_id AS userId, p.phone FROM notification_preferences p
        JOIN ssi_users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
        WHERE p.event_type = ? AND p.enabled = 1 AND ${column} = ? LIMIT 1`,
      )
      .get(eventType, value) as { userId: string; phone: string } | undefined
  }

  public queueWhatsApp(input: {
    tenantId: string
    to: string
    eventType: string
    dedupeKey: string
    requestId?: string
    inboxItemId?: string
    inviteId?: string
    /** The real message and link, kept so a payer-facing alert never sends empty-handed. */
    body?: string
    actionUrl?: string
  }): string {
    if (!WHATSAPP_EVENTS.includes(input.eventType as any))
      throw new DispatchError('Unsupported notification event', 'permanent')
    const recipient = normalizeNotificationPhone(input.to)
    const db = DatabaseManager.getDatabase()
    return db.transaction(() => {
      const id = outboxService.enqueue({
        topic: 'notification.whatsapp',
        aggregateKey: input.tenantId,
        dedupeKey: `notification:whatsapp:${input.tenantId}:${input.dedupeKey}:${recipient}`,
        payload: {
          tenantId: input.tenantId,
          to: recipient,
          eventType: input.eventType,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(input.inboxItemId ? { inboxItemId: input.inboxItemId } : {}),
          ...(input.inviteId ? { inviteId: input.inviteId } : {}),
          ...(input.body ? { body: input.body } : {}),
          ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
        },
      })
      const now = new Date().toISOString()
      db.prepare(
        `INSERT OR IGNORE INTO notification_deliveries
        (id, tenant_id, event_type, recipient, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
      ).run(id, input.tenantId, input.eventType, recipient, now, now)
      return id
    })()
  }

  public queueInboxNotification(eventId: string, payload: Record<string, any>): void {
    if (!payload.tenantId || !payload.issuerTenantId) return
    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT id FROM ssi_users WHERE tenant_id = ?').get(payload.tenantId) as
      | { id: string }
      | undefined
    if (!user) return
    const eventType =
      [
        'workflow_stage_action',
        'workflow_request_assignment',
        'requisition_stage_action',
        'ap_workflow_assignment',
        'workflow_update',
      ].includes(payload.sourceType) ||
      ['WorkflowStageAction', 'WorkflowActionAssignment', 'WorkflowRequestApproval', 'RequisitionStageAction'].includes(
        payload.credentialType,
      )
        ? 'task'
        : payload.sourceType === 'proof_request'
          ? 'proof_request'
          : payload.sourceType === 'payment_link'
            ? 'payment_link'
            : payload.sourceType === 'ap_payment' && payload.credentialType === 'RemittanceAdviceVC'
              ? 'remittance'
              : 'vc_offer'
    const preference = this.consentedRecipient(payload.issuerTenantId, eventType, { userId: user.id })
    if (!preference) return
    const sharedKey =
      payload.sourceType === 'contact-offer'
        ? `contact-offer:${payload.sourceId}`
        : payload.sourceType === 'payment_link'
          ? `payment_link:${payload.sourceId}`
          : payload.sourceType === 'proof_request'
            ? `proof_request:${payload.sourceId}`
            : eventType === 'remittance'
              ? `remittance:${payload.sourceId}`
              : undefined
    const request =
      eventType === 'task' && payload.sourceId
        ? (db
            .prepare(
              `SELECT r.id FROM requests r JOIN organizations o ON o.id = r.organization_id
              WHERE r.id = ? AND o.tenant_id = ?`,
            )
            .get(String(payload.sourceId).split(':delegation:')[0], payload.issuerTenantId) as
            | { id: string }
            | undefined)
        : undefined
    const item =
      payload.inboxItemId || (payload.sourceType && payload.sourceId)
        ? (db
            .prepare(
              `SELECT id FROM wallet_pending_offers
          WHERE tenant_id = ? AND issuer_tenant_id = ?
            AND ((? IS NOT NULL AND id = ?) OR (? IS NULL AND source_type = ? AND source_id = ?
              AND (? IS NULL OR credential_type = ?)))
          ORDER BY created_at DESC LIMIT 1`,
            )
            .get(
              payload.tenantId,
              payload.issuerTenantId,
              payload.inboxItemId || null,
              payload.inboxItemId || null,
              payload.inboxItemId || null,
              payload.sourceType || null,
              payload.sourceId || null,
              payload.credentialType || null,
              payload.credentialType || null,
            ) as { id: string } | undefined)
        : undefined
    if (payload.inboxItemId && !item) throw new DispatchError('Notification inbox item not found', 'permanent')
    const itemKey =
      sharedKey ||
      (item
        ? `inbox-item:${item.id}`
        : payload.sourceType && payload.sourceId
          ? `inbox:${payload.tenantId}:${payload.sourceType}:${payload.sourceId}:${payload.credentialType || ''}`
          : eventId)
    this.queueWhatsApp({
      tenantId: payload.issuerTenantId,
      to: preference.phone,
      eventType,
      dedupeKey: itemKey,
      requestId: request?.id,
      inboxItemId: item?.id,
    })
  }

  public async processWhatsAppIntent(id: string, payload: Record<string, any>): Promise<void> {
    if (payload.eventType !== 'invite') return this.sendWhatsAppIntent(id, payload)
    // An invite must reach the person: when WhatsApp cannot carry it, one text message does.
    try {
      await this.sendWhatsAppIntent(id, payload)
    } catch (error) {
      if (error instanceof DispatchError && error.disposition === 'permanent') {
        await this.sendInviteFallbackSms(payload.inviteId, payload.to)
      }
      throw error
    }
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT status FROM notification_deliveries WHERE id = ?')
      .get(id) as { status: string } | undefined
    if (row && ['skipped', 'failed'].includes(row.status))
      await this.sendInviteFallbackSms(payload.inviteId, payload.to)
  }

  /** The invite link by text message, at most once per invite. Each send replaces the code. */
  public async sendInviteFallbackSms(inviteId: string | undefined, phone: string): Promise<boolean> {
    if (!inviteId) return false
    // Do not spend the one text, or the code, when nothing can carry the link.
    if (!process.env.SMS_API_KEY && !process.env.AT_API_KEY && !process.env.SMS_GATEWAY_URL) return false
    const { memberInviteService, memberInviteLink } = await import('./MemberInviteService')
    if (!memberInviteLink('ready')) return false
    const invite = memberInviteService.get(inviteId)
    if (!invite || invite.used_at || !memberInviteService.claimFallback(inviteId)) return false
    const code = memberInviteService.issueCode(inviteId)
    const link = code ? memberInviteLink(code) : undefined
    if (!link) return false
    const orgName = getTenantById(invite.org_tenant_id)?.label || 'your organisation'
    const sms = await this.sendSms(
      phone,
      `${orgName} invited you to ${PRODUCT_NAME}. Confirm your name and choose your own PIN here: ${link} (valid 7 days)`,
    ).catch((error: any) => ({ success: false, error: error?.message }) as { success: boolean; error?: string })
    memberInviteService.recordDelivery(inviteId, {
      channel: 'sms',
      status: sms.success ? 'sent' : 'failed',
      reason: sms.success ? undefined : String((sms as any).error || 'The text message could not be sent'),
      to: phone,
    })
    return sms.success
  }

  private async sendWhatsAppIntent(id: string, payload: Record<string, any>): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM notification_deliveries WHERE id = ?').get(id) as any
    if (
      !row ||
      row.tenant_id !== payload.tenantId ||
      row.recipient !== payload.to ||
      row.event_type !== payload.eventType
    ) {
      throw new DispatchError('Invalid notification intent', 'permanent')
    }
    if (['accepted', 'sent', 'delivered', 'read', 'skipped', 'failed'].includes(row.status)) return
    if (row.status === 'sending' || row.status === 'uncertain') {
      db.prepare(
        `UPDATE notification_deliveries SET status = 'uncertain', reason = 'Provider outcome requires reconciliation' WHERE id = ?`,
      ).run(id)
      throw new DispatchError('Provider outcome requires reconciliation', 'uncertain')
    }
    const update = (status: string, reason?: string) =>
      db
        .prepare('UPDATE notification_deliveries SET status = ?, reason = ?, updated_at = ? WHERE id = ?')
        .run(status, reason || null, new Date().toISOString(), id)
    const consent = this.consentedRecipient(payload.tenantId, payload.eventType, { phone: payload.to })
    if (!consent) {
      update('skipped', 'No recorded consent or opted out')
      return
    }
    let sending = false
    try {
      const sender = whatsAppSenderService.resolve(payload.tenantId)
      const readBinding = () =>
        db
          .prepare('SELECT sender_key, waba_id FROM whatsapp_sender_bindings WHERE phone_number_id = ?')
          .get(sender.phoneNumberId) as { sender_key: string; waba_id: string } | undefined
      let binding = readBinding()
      if (!binding && sender.key === 'platform') {
        await whatsAppSenderService.ensurePlatformBinding(sender)
        binding = readBinding()
      }
      if (binding?.sender_key !== sender.key || binding?.waba_id !== sender.wabaId) {
        throw new DispatchError('Sender connection has not been validated', 'permanent')
      }
      const allowed = (process.env.WHATSAPP_TEST_RECIPIENTS || '').split(',').map((value) => value.trim())
      if (
        process.env.WHATSAPP_DELIVERY_ENABLED !== 'true' ||
        (process.env.WHATSAPP_PRODUCTION_ENABLED !== 'true' && !allowed.includes(payload.to))
      ) {
        update('skipped', 'Live sending not approved for recipient')
        return
      }
      // Organisations that chose templates before invites existed send invites with their card template.
      const templateEvent = payload.eventType === 'invite' && !sender.templates.invite ? 'vc_offer' : payload.eventType
      const base = new URL(process.env.WALLET_PUBLIC_URL || '')
      if (base.protocol !== 'https:' || base.username || base.password)
        throw new DispatchError('HTTPS wallet URL required', 'permanent')
      let action = new URL('/inbox', base.origin)
      let bodyText = `There is an update in your ${PRODUCT_NAME} inbox. Sign in to view it.`
      const orgName = templateText(getTenantById(payload.tenantId)?.label, 40, 'Your organisation')
      // Values for the branded per-event template; left unset when this alert has no item to link to.
      let richValues: { body: string[]; link: string } | undefined
      // A bill or a remittance goes to someone outside this organisation, often on a phone that is
      // signed into a different Credentis account (or none). Its own public page works whoever is
      // signed in, or no one; the wallet's "/inbox?item=" route only works for the one matching
      // account, and otherwise strands the person on a card it cannot find. So this alert always
      // points at the link it was actually created for, not at the inbox item.
      const payerFacingEvent = payload.eventType === 'payment_link' || payload.eventType === 'remittance'
      let matchedItem = false
      if (payload.eventType === 'invite') {
        const { memberInviteService, memberInviteLink } = await import('./MemberInviteService')
        const invite = payload.inviteId ? memberInviteService.get(payload.inviteId) : undefined
        if (!invite || invite.used_at || invite.org_tenant_id !== payload.tenantId) {
          update('skipped', 'Invite already used or replaced')
          return
        }
        const code = memberInviteService.issueCode(invite.id)
        const link = code ? memberInviteLink(code) : undefined
        if (!link) {
          update('skipped', 'Invite expired')
          return
        }
        action = new URL(link)
        const membership = db
          .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
          .get(invite.user_id, invite.org_tenant_id) as { role: string } | undefined
        const role = roleText(membership?.role)
        bodyText = `👋 ${orgName} added you to their team as ${role}. Open the link to confirm your name and choose your own PIN.`
        richValues = {
          body: [templateText(invite.proposed_name, 40, 'there'), orgName, role],
          link: code!,
        }
        matchedItem = true
      } else if (payload.inboxItemId) {
        const owner = db
          .prepare(
            `SELECT u.id, w.title, w.body, w.credential_type FROM wallet_pending_offers w JOIN ssi_users u ON u.tenant_id = w.tenant_id
            WHERE w.id = ? AND w.issuer_tenant_id = ?`,
          )
          .get(payload.inboxItemId, payload.tenantId) as
          | { id: string; title?: string | null; body?: string | null; credential_type?: string }
          | undefined
        const item =
          owner &&
          this.consentedRecipient(payload.tenantId, payload.eventType, { userId: owner.id })?.phone === payload.to
        if (!item) throw new DispatchError('Notification inbox item is not available for this recipient', 'permanent')
        action.searchParams.set('item', payload.inboxItemId)
        const title = templateText(owner!.title, 60, credentialTypeLabel(owner!.credential_type))
        const detail = templateText(
          owner!.body,
          160,
          richTemplateFor(payload.eventType)?.defaultDetail || 'Open it to see the details.',
        )
        const emoji = EVENT_EMOJI[payload.eventType as RichTemplateEvent] || '🔔'
        // The approved generic template carries one line; make it name the organisation and the item.
        bodyText = templateText(`${emoji} ${orgName}: ${title.replace(/[.!?…]+$/, '')}. ${detail}`, 300, bodyText)
        richValues = { body: [orgName, title, detail], link: payload.inboxItemId }
        matchedItem = true
      } else if (
        payload.requestId &&
        db
          .prepare(
            `SELECT 1 FROM requests r JOIN organizations o ON o.id = r.organization_id
          WHERE r.id = ? AND o.tenant_id = ?`,
          )
          .get(payload.requestId, payload.tenantId)
      ) {
        action.searchParams.set('request', payload.requestId)
      }
      // No org inbox item was matched (no account yet, or the item moved on): a bill or
      // remittance falls back to the real text it was raised for, rather than the empty "sign
      // in to view it" default. Other alert types (invites, staff cards) carry their own claim
      // link or token in `body`/`actionUrl` for SMS only; they keep the generic inbox message.
      if (payerFacingEvent && !matchedItem && payload.body) bodyText = templateText(payload.body, 300, bodyText)
      // A bill or remittance alert always leads to its own page, matched item or not, so the
      // button never depends on which wallet account happens to be open on this phone.
      if (payerFacingEvent && payload.actionUrl) {
        try {
          action = new URL(payload.actionUrl)
          richValues = undefined
        } catch {
          // Keep the computed default; a malformed link here must not break the whole send.
        }
      }
      const actionUrl = action.toString()
      const rich = richValues
        ? await whatsAppSenderService.approvedRichTemplate(sender, payload.eventType, base.origin)
        : undefined
      const template = rich
        ? { name: rich.name, language: rich.language }
        : await whatsAppSenderService.requireApprovedTemplate(sender, templateEvent)
      const components = rich
        ? richTemplateComponents(rich, { ...richValues!, imageUrl: headerImageUrl(base.origin, rich.event) })
        : [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: bodyText },
                { type: 'text', text: actionUrl },
              ],
            },
          ]
      const currentSender = whatsAppSenderService.resolve(payload.tenantId)
      if (
        currentSender.key !== sender.key ||
        currentSender.phoneNumberId !== sender.phoneNumberId ||
        currentSender.wabaId !== sender.wabaId ||
        currentSender.token !== sender.token ||
        JSON.stringify(currentSender.templates[templateEvent]) !== JSON.stringify(sender.templates[templateEvent])
      )
        throw new DispatchError('Sender changed during dispatch', 'permanent')
      const stillConsented = this.consentedRecipient(payload.tenantId, payload.eventType, { phone: payload.to })
      if (!stillConsented) {
        update('skipped', 'Consent withdrawn during dispatch')
        return
      }
      // Compare-and-set prevents overlapping workers, including lease recovery, from issuing another POST.
      const claimed = db
        .prepare(
          `UPDATE notification_deliveries SET status = 'sending', sender_key = ?,
        phone_number_id = ?, template_name = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'retry')`,
        )
        .run(sender.key, sender.phoneNumberId, `${template.name}/${template.language}`, new Date().toISOString(), id)
      if (!claimed.changes) throw new DispatchError('Notification is already being sent', 'uncertain')
      sending = true
      const { data } = await axios.post(
        whatsAppGraphUrl(`${sender.phoneNumberId}/messages`),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: payload.to,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            components,
          },
          biz_opaque_callback_data: id,
        },
        { headers: { Authorization: `Bearer ${sender.token}` }, timeout: 15000 },
      )
      const messageId = data?.messages?.[0]?.id
      if (!messageId) throw new DispatchError('Provider accepted outcome unknown', 'uncertain')
      db.prepare(
        `UPDATE notification_deliveries SET provider_message_id = ?, status = CASE
        WHEN status = 'sending' THEN 'accepted' ELSE status END, reason = NULL, updated_at = ? WHERE id = ?`,
      ).run(messageId, new Date().toISOString(), id)
    } catch (error: any) {
      const evidence = db
        .prepare('SELECT status, provider_message_id FROM notification_deliveries WHERE id = ?')
        .get(id) as { status: string; provider_message_id?: string }
      if (evidence.provider_message_id && ['sent', 'delivered', 'read', 'failed'].includes(evidence.status)) return
      // Axios errors contain Authorization headers: never persist, log or return the raw exception.
      const http = Number(error?.response?.status)
      const disposition =
        error instanceof DispatchError
          ? error.disposition
          : http === 429
            ? 'retry'
            : http >= 400 && http < 500
              ? 'permanent'
              : sending
                ? 'uncertain'
                : 'retry'
      const reason =
        error instanceof DispatchError ? error.message : http ? `Provider HTTP ${http}` : 'Provider connection failed'
      update(disposition === 'retry' ? 'retry' : disposition === 'uncertain' ? 'uncertain' : 'failed', reason)
      throw new DispatchError(reason, disposition)
    }
  }

  public applyWhatsAppStatus(
    senderKey: string,
    phoneNumberId: string,
    status: {
      id: string
      status: string
      timestamp: string
      recipient_id?: string
      biz_opaque_callback_data?: string
      errors?: Array<{ code?: number }>
    },
  ): void {
    const ranks: Record<string, number> = { accepted: 1, sent: 2, delivered: 3, read: 4 }
    if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) return
    const providerTime = Number(status.timestamp)
    if (!Number.isSafeInteger(providerTime) || providerTime <= 0) return
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      const row = db
        .prepare(
          `SELECT * FROM notification_deliveries WHERE sender_key = ? AND phone_number_id = ?
        AND (provider_message_id = ? OR (id = ? AND provider_message_id IS NULL AND status IN ('sending', 'uncertain')))`,
        )
        .get(senderKey, phoneNumberId, status.id, status.biz_opaque_callback_data || '') as any
      if (!row || (status.recipient_id && normalizeNotificationPhone(status.recipient_id) !== row.recipient)) return
      const callbackKey = createHash('sha256')
        .update(`${senderKey}:${status.id}:${status.status}:${status.timestamp}`)
        .digest('hex')
      if (
        !db
          .prepare('INSERT OR IGNORE INTO notification_callbacks VALUES (?, ?)')
          .run(callbackKey, new Date().toISOString()).changes
      )
        return
      const advance =
        status.status === 'failed'
          ? !['delivered', 'read'].includes(row.status) && providerTime >= row.provider_status_at
          : (ranks[status.status] || 0) > (ranks[row.status] || 0) &&
            (row.status !== 'failed' || ranks[status.status] >= 3 || providerTime > row.provider_status_at)
      if (!advance) return
      const errorCode = Number(status.errors?.[0]?.code)
      const failure = Number.isSafeInteger(errorCode)
        ? `Provider delivery failure (code ${errorCode})`
        : 'Provider delivery failure'
      db.prepare(
        `UPDATE notification_deliveries SET status = ?, provider_message_id = ?, provider_status_at = ?,
        reason = ?, updated_at = ? WHERE id = ?`,
      ).run(
        status.status,
        status.id,
        providerTime,
        status.status === 'failed' ? failure : null,
        new Date().toISOString(),
        row.id,
      )
      db.prepare(
        `UPDATE integration_outbox SET status = 'processed', error_message = NULL, dispatched_at = ?,
        lease_until = NULL WHERE id = ? AND status = 'uncertain'`,
      ).run(new Date().toISOString(), row.id)
    })()
  }

  public applyWhatsAppOptOut(senderKey: string, phone: string, messageId: string): void {
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      if (
        !db
          .prepare('INSERT OR IGNORE INTO notification_callbacks VALUES (?, ?)')
          .run(`stop:${senderKey}:${messageId}`, new Date().toISOString()).changes
      )
        return
      const tenants =
        senderKey === 'platform'
          ? (db
              .prepare(
                `SELECT tenant_id FROM provider_configs WHERE provider_id = 'whatsapp-business'
            AND json_extract(config, '$.mode') = 'platform'`,
              )
              .all() as Array<{ tenant_id: string }>)
          : [{ tenant_id: senderKey.slice(7) }]
      for (const tenant of tenants) {
        db.prepare(
          'UPDATE notification_preferences SET enabled = 0, consent_source = ?, updated_at = ? WHERE tenant_id = ? AND phone = ?',
        ).run('signed_whatsapp_stop', new Date().toISOString(), tenant.tenant_id, normalizeNotificationPhone(phone))
      }
      // A STOP to the shared platform number also withdraws the person's own "any organization" opt-ins.
      if (senderKey === 'platform') {
        db.prepare(
          `UPDATE notification_preferences SET enabled = 0, consent_source = ?, updated_at = ?
          WHERE phone = ? AND tenant_id IN (SELECT tenant_id FROM ssi_users WHERE id = notification_preferences.user_id)`,
        ).run('signed_whatsapp_stop', new Date().toISOString(), normalizeNotificationPhone(phone))
      }
    })()
  }

  /** True when this server can actually send email (Resend API key, or a full SMTP login). */
  public emailReady(): boolean {
    if (process.env.RESEND_API_KEY) return true
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  }

  /** The invite link by email, sent now. Each send replaces the code, so only the newest message works. */
  public async sendInviteEmail(inviteId: string, email: string): Promise<boolean> {
    const { memberInviteService } = await import('./MemberInviteService')
    const result = await this.attemptInviteEmail(inviteId, email)
    if (result.ok) {
      memberInviteService.recordDelivery(inviteId, { channel: 'email', status: 'sent', ref: result.ref, to: email })
      return true
    }
    if (!result.gone)
      memberInviteService.recordDelivery(inviteId, { channel: 'email', status: 'failed', reason: result.reason, to: email })
    return false
  }

  /**
   * The invite email through the outbox: sent straight away, retried with backoff when the mail
   * service is briefly unavailable, and marked failed on the invite when it gives up. False when
   * this server cannot send email at all, so the caller can pick another channel.
   */
  public async queueInviteEmail(input: {
    tenantId: string
    inviteId: string
    email: string
    /** WhatsApp to use when the email finally fails; the person agreed to WhatsApp. */
    whatsappFallback?: string
  }): Promise<boolean> {
    const { memberInviteService, memberInviteLink } = await import('./MemberInviteService')
    const unavailable = !this.emailReady()
      ? 'Email is not set up on this server'
      : !memberInviteLink('ready')
        ? 'The join page address is not set on this server'
        : undefined
    if (unavailable) {
      logger.warn({ inviteId: input.inviteId }, `Invite email skipped: ${unavailable}`)
      memberInviteService.recordDelivery(input.inviteId, {
        channel: 'email',
        status: 'failed',
        reason: unavailable,
        to: input.email,
      })
      return false
    }
    memberInviteService.recordDelivery(input.inviteId, { channel: 'email', status: 'sending', to: input.email })
    outboxService.enqueue({
      topic: INVITE_EMAIL_TOPIC,
      aggregateKey: input.tenantId,
      dedupeKey: `member-invite:${input.inviteId}:email`,
      payload: {
        tenantId: input.tenantId,
        inviteId: input.inviteId,
        email: input.email,
        ...(input.whatsappFallback ? { whatsappFallback: input.whatsappFallback } : {}),
      },
    })
    return true
  }

  /** Outbox handler for one invite email attempt. Throws so the outbox retries or gives up. */
  public async processInviteEmailIntent(_id: string, payload: Record<string, any>): Promise<void> {
    const { memberInviteService } = await import('./MemberInviteService')
    const result = await this.attemptInviteEmail(String(payload.inviteId), String(payload.email))
    if (result.ok) {
      memberInviteService.recordDelivery(String(payload.inviteId), {
        channel: 'email',
        status: 'sent',
        ref: result.ref,
        to: payload.email,
      })
      return
    }
    if (result.gone) return
    if (result.retry)
      memberInviteService.recordDelivery(String(payload.inviteId), {
        channel: 'email',
        status: 'sending',
        reason: `Trying again: ${result.reason}`,
        to: payload.email,
      })
    throw new DispatchError(result.reason, result.retry ? 'retry' : 'permanent')
  }

  /** The outbox gave up on an invite email: mark it failed, or hand it to WhatsApp when the person agreed. */
  public async inviteEmailGaveUp(payload: Record<string, any>, reason: string): Promise<void> {
    const { memberInviteService } = await import('./MemberInviteService')
    const inviteId = String(payload.inviteId || '')
    const invite = inviteId ? memberInviteService.get(inviteId) : undefined
    if (!invite || invite.used_at) return
    memberInviteService.recordDelivery(inviteId, { channel: 'email', status: 'failed', reason, to: payload.email })
    const phone = payload.whatsappFallback ? String(payload.whatsappFallback) : undefined
    if (!phone || whatsAppSenderService.selection(invite.org_tenant_id)?.enabled !== true) return
    if (!this.consentedRecipient(invite.org_tenant_id, 'invite', { userId: invite.user_id })) return
    try {
      const notificationId = this.queueWhatsApp({
        tenantId: invite.org_tenant_id,
        to: phone,
        eventType: 'invite',
        dedupeKey: `invite:${inviteId}`,
        inviteId,
      })
      memberInviteService.recordDelivery(inviteId, {
        channel: 'whatsapp',
        status: 'sending',
        reason: `Email failed: ${reason}`,
        ref: notificationId,
        to: phone,
      })
    } catch (error: any) {
      logger.warn({ error: error?.message, inviteId }, 'Invite WhatsApp fallback could not be queued')
    }
  }

  /** One try at the invite email. `gone` when the invite was used, replaced or expired meanwhile. */
  private async attemptInviteEmail(
    inviteId: string,
    email: string,
  ): Promise<{ ok: true; ref?: string } | { ok: false; reason: string; retry: boolean; gone?: boolean }> {
    if (!this.emailReady()) return { ok: false, reason: 'Email is not set up on this server', retry: false }
    const { memberInviteService, memberInviteLink } = await import('./MemberInviteService')
    if (!memberInviteLink('ready'))
      return { ok: false, reason: 'The join page address is not set on this server', retry: false }
    const invite = memberInviteService.get(inviteId)
    if (!invite || invite.used_at) return { ok: false, reason: 'Invite already used', retry: false, gone: true }
    const code = memberInviteService.issueCode(inviteId)
    const link = code ? memberInviteLink(code) : undefined
    if (!link) return { ok: false, reason: 'Invite expired or replaced', retry: false, gone: true }
    const orgName = getTenantById(invite.org_tenant_id)?.label || 'your organisation'
    const greeting = invite.proposed_name ? `Hello ${invite.proposed_name},` : 'Hello,'
    const text = [
      greeting,
      '',
      `${orgName} invited you to ${PRODUCT_NAME}, where the team gets jobs, approvals and their staff card.`,
      'Open this link, confirm your name and choose your own PIN. Nobody else will know it.',
      '',
      link,
      '',
      'The link works once and expires in 7 days. If you were not expecting this, ignore this email.',
    ].join('\n')
    const html = `<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(orgName)} invited you to ${escapeHtml(PRODUCT_NAME)}, where the team gets jobs, approvals and their staff card.</p>
<p>Open this link, confirm your name and choose your own PIN. Nobody else will know it.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#1c7ed6;color:#fff;border-radius:6px;text-decoration:none">Join ${escapeHtml(orgName)}</a></p>
<p style="color:#666;font-size:13px">Or copy this link: ${escapeHtml(link)}<br/>It works once and expires in 7 days. If you were not expecting this, ignore this email.</p>`
    try {
      const sent = await this.sendEmail({ to: email, subject: `${orgName} invited you to ${PRODUCT_NAME}`, text, html })
      if (!sent.success) return { ok: false, reason: 'Email is not set up on this server', retry: false }
      return { ok: true, ref: sent.messageId }
    } catch (error: any) {
      const reason = String(error?.message || 'The email could not be sent').slice(0, 300)
      logger.warn({ error: reason, inviteId }, 'Invite email could not be sent')
      // The mail service refusing the message itself (bad address, unverified sender) will not change on retry.
      const status = Number(/\((\d{3})\)/.exec(reason)?.[1] || 0)
      const retry = !status || status === 429 || status >= 500
      return { ok: false, reason, retry }
    }
  }

  /** Recent outcome lookups, so opening the team list does not ask the mail service every time. */
  private emailOutcomeCheckedAt = new Map<string, number>()

  /**
   * Final outcomes for sent emails, from the Resend API: delivered, or failed when the message
   * bounced, was marked as spam or was refused. Emails still in transit, and lookups that fail or
   * are too slow, are left out. At most ten lookups per call, each message at most once a minute.
   */
  public async emailOutcomes(
    messageIds: string[],
  ): Promise<Map<string, { status: 'delivered' | 'failed'; reason?: string }>> {
    const outcomes = new Map<string, { status: 'delivered' | 'failed'; reason?: string }>()
    const key = process.env.RESEND_API_KEY
    if (!key) return outcomes
    const now = Date.now()
    const due = messageIds
      .filter((id) => /^[\w-]{8,100}$/.test(id) && now - (this.emailOutcomeCheckedAt.get(id) || 0) > 60000)
      .slice(0, 10)
    await Promise.all(
      due.map(async (id) => {
        this.emailOutcomeCheckedAt.set(id, now)
        try {
          const response = await fetch(`https://api.resend.com/emails/${id}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(3000),
          })
          if (!response.ok) return
          const event = String(((await response.json()) as { last_event?: string }).last_event || '')
          if (['delivered', 'opened', 'clicked'].includes(event)) outcomes.set(id, { status: 'delivered' })
          else if (event === 'bounced') outcomes.set(id, { status: 'failed', reason: 'The email bounced' })
          else if (event === 'complained') outcomes.set(id, { status: 'failed', reason: 'The email was marked as spam' })
          else if (event === 'failed') outcomes.set(id, { status: 'failed', reason: 'The mail service could not send it' })
        } catch {
          // Unknown for now; the next look at the team list asks again.
        }
      }),
    )
    if (this.emailOutcomeCheckedAt.size > 5000) this.emailOutcomeCheckedAt.clear()
    return outcomes
  }

  public async sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }> {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: payload.from || process.env.EMAIL_FROM || `${PRODUCT_NAME} <no-reply@mail.ldkgroup.co.uk>`,
          to: [payload.to],
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          reply_to: payload.replyTo,
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Resend rejected the email (${response.status}) ${body.slice(0, 200)}`.trim())
      }
      const data = (await response.json().catch(() => ({}))) as { id?: string }
      logger.info({ messageId: data.id }, 'Email sent')
      return { success: true, messageId: data.id }
    }

    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 587)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = payload.from || process.env.SMTP_FROM || 'no-reply@credentis.africa'

    if (!host || !user || !pass) {
      logger.warn('SMTP not configured, skipping email send')
      return { success: false }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    const result = await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo,
    })

    logger.info({ to: payload.to, messageId: result.messageId }, 'Email sent')
    return { success: true, messageId: result.messageId }
  }

  public async sendWhatsAppText(payload: WhatsAppTextPayload): Promise<any> {
    if (!payload.tenantId || !payload.eventType) return { skipped: true, reason: 'explicit_tenant_and_event_required' }
    const id = this.queueWhatsApp({
      tenantId: payload.tenantId,
      to: payload.to,
      eventType: payload.eventType,
      dedupeKey: payload.dedupeKey || randomUUID(),
      ...(payload.inboxItemId ? { inboxItemId: payload.inboxItemId } : {}),
      ...(payload.body ? { body: payload.body } : {}),
      ...(payload.actionUrl ? { actionUrl: payload.actionUrl } : {}),
    })
    const delivery = DatabaseManager.getDatabase()
      .prepare('SELECT status, provider_message_id FROM notification_deliveries WHERE id = ?')
      .get(id) as { status: string; provider_message_id: string | null }
    if (['accepted', 'sent', 'delivered', 'read'].includes(delivery.status) && delivery.provider_message_id) {
      return { notificationId: id, messages: [{ id: delivery.provider_message_id }] }
    }
    if (['failed', 'uncertain'].includes(delivery.status)) return { failed: true, notificationId: id }
    if (delivery.status === 'skipped') return { skipped: true, notificationId: id }
    return { queued: true, notificationId: id }
  }

  public async sendWhatsAppCta(payload: WhatsAppCtaPayload): Promise<any> {
    return this.sendWhatsAppText({ ...payload, body: payload.bodyText })
  }

  public async sendWalletPush(payload: WalletPushPayload): Promise<any> {
    const pushUrl = process.env.WALLET_PUSH_URL || process.env.OFFER_PUSH_URL
    const pushApiKey = process.env.WALLET_PUSH_API_KEY || process.env.OFFER_PUSH_API_KEY

    if (!pushUrl) {
      logger.warn('Wallet push not configured, skipping push')
      return { skipped: true, reason: 'not_configured' }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (pushApiKey) headers['x-api-key'] = pushApiKey

    const response = await axios.post(
      pushUrl,
      {
        type: payload.type || 'issuance',
        title: payload.title || 'New Credential Offer',
        body: payload.body || 'Tap to open your credential offer.',
        offerUri: payload.offerUri,
        actionUrl: payload.actionUrl,
      },
      { headers },
    )

    logger.info({ pushUrl }, 'Wallet push sent')
    return response.data
  }

  public async sendSms(
    to: string,
    message: string,
  ): Promise<{ success: boolean; skipped?: boolean; messageId?: string }> {
    const adapter = (process.env.SMS_ADAPTER || 'africastalking').toLowerCase()
    const apiKey = process.env.SMS_API_KEY || process.env.AT_API_KEY
    const username = process.env.SMS_USERNAME || process.env.AT_USERNAME
    const from = process.env.SMS_FROM || process.env.AT_SENDER_ID || 'CREDENTIS'
    const url = process.env.SMS_GATEWAY_URL

    if (!apiKey && !url) {
      logger.warn({ to }, 'SMS not configured — skipping')
      return { success: false, skipped: true }
    }

    try {
      if (adapter === 'africastalking') {
        const { data } = await axios.post(
          'https://api.africastalking.com/version1/messaging',
          new URLSearchParams({ username: username || 'sandbox', to, message, from }).toString(),
          {
            headers: {
              apiKey: apiKey!,
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        )
        const messageId = data?.SMSMessageData?.Recipients?.[0]?.messageId
        logger.info({ to, messageId }, "SMS sent via Africa's Talking")
        return { success: true, messageId }
      }

      if (adapter === 'bulksms') {
        const { data } = await axios.post(
          'https://api.bulksms.com/v1/messages',
          { to: [{ address: to }], body: message, from },
          { auth: { username: username!, password: apiKey! } },
        )
        const messageId = data?.[0]?.id
        logger.info({ to, messageId }, 'SMS sent via BulkSMS')
        return { success: true, messageId }
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      const { data } = await axios.post(url!, { to, message, from }, { headers })
      logger.info({ to }, 'SMS sent via generic HTTP gateway')
      return { success: true, messageId: data?.messageId || data?.id }
    } catch (error) {
      logger.error({ to, err: error instanceof Error ? error.message : String(error) }, 'SMS send failed')
      return { success: false }
    }
  }

  /** Same ownership rule the WhatsApp sender enforces, so a mismatched item never makes the send fail. */
  private recipientOwnsInboxItem(tenantId: string, eventType: string, phone: string, inboxItemId: string): boolean {
    try {
      const owner = DatabaseManager.getDatabase()
        .prepare(
          `SELECT u.id FROM wallet_pending_offers w JOIN ssi_users u ON u.tenant_id = w.tenant_id
          WHERE w.id = ? AND w.issuer_tenant_id = ?`,
        )
        .get(inboxItemId, tenantId) as { id: string } | undefined
      return (
        !!owner &&
        this.consentedRecipient(tenantId, eventType, { userId: owner.id })?.phone === normalizeNotificationPhone(phone)
      )
    } catch {
      return false
    }
  }

  public async dispatchContactNotification(opts: {
    tenantId?: string
    dedupeKey?: string
    /** The payer's inbox card for this bill, when the phone has a Credentis account. */
    inboxItemId?: string
    contact: { name: string; phone?: string; email?: string }
    type: 'vc_offer' | 'payment_link' | 'proof_request'
    url: string
    issuerName?: string
    amount?: number
    currency?: string
  }): Promise<ContactNotificationResult> {
    const { contact, type, url, issuerName = PRODUCT_NAME, amount, currency } = opts
    const inboxItemId =
      opts.inboxItemId && opts.tenantId && contact.phone
        ? this.recipientOwnsInboxItem(opts.tenantId, type, contact.phone, opts.inboxItemId)
          ? opts.inboxItemId
          : undefined
        : undefined
    const message =
      type === 'vc_offer'
        ? `Hi ${contact.name}, ${issuerName} has issued you a verifiable credential. Open: ${url}`
        : type === 'proof_request'
          ? `Hi ${contact.name}, ${issuerName} requests credential proof. Open your wallet: ${url}`
          : `Hi ${contact.name}, payment request ${amount ?? ''} ${currency ?? ''} from ${issuerName}: ${url}`
    const subject =
      type === 'vc_offer'
        ? `Your verifiable credential from ${issuerName}`
        : type === 'proof_request'
          ? `Credential proof request from ${issuerName}`
          : `Payment request from ${issuerName}`

    const tasks: Array<{
      channel: 'whatsapp' | 'sms' | 'email'
      send: Promise<'accepted' | 'queued' | 'skipped' | 'failed'>
    }> = []
    let whatsAppId: string | undefined
    if (contact.phone) {
      tasks.push({
        channel: 'whatsapp',
        send: this.sendWhatsAppText({
          to: contact.phone,
          body: message,
          // Only a bill's own pay page is ever the WhatsApp button target; a vc_offer/proof_request
          // link can carry a one-time claim token meant for SMS, not for the outbox or WhatsApp.
          ...(type === 'payment_link' ? { actionUrl: url } : {}),
          tenantId: opts.tenantId,
          eventType: type,
          dedupeKey: opts.dedupeKey,
          ...(inboxItemId ? { inboxItemId } : {}),
        }).then((result) => {
          whatsAppId = result?.notificationId
          return result?.messages?.[0]?.id ? 'accepted' : result?.queued ? 'queued' : result?.skipped ? 'skipped' : 'failed'
        }),
      })
      tasks.push({
        channel: 'sms',
        send: this.sendSms(contact.phone, message).then((result) =>
          result.success ? 'accepted' : result.skipped ? 'skipped' : 'failed',
        ),
      })
    }
    if (contact.email) {
      tasks.push({
        channel: 'email',
        send: this.sendEmail({ to: contact.email, subject, text: message, html: `<p>${message}</p>` }).then((result) =>
          result.success ? 'accepted' : 'skipped',
        ),
      })
    }

    const results = await Promise.allSettled(tasks.map((task) => task.send))
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn('Contact notification failed')
      }
    }
    const channels: ContactNotificationResult['channels'] = results.map((result, index) => ({
      channel: tasks[index].channel,
      status: result.status === 'rejected' ? 'failed' : result.value,
      ...(tasks[index].channel === 'whatsapp' && whatsAppId ? { notificationId: whatsAppId } : {}),
    }))
    const accepted = channels.some((channel) => channel.status === 'accepted')
    if (!accepted) logger.warn({ type, channels }, 'Contact notification was not accepted by any delivery provider')
    return { accepted, channels }
  }

  /** Tell a supplier that a bill was paid, and where to confirm it. */
  public async dispatchRemittanceNotification(opts: {
    tenantId?: string
    dedupeKey?: string
    contact: { name: string; phone?: string; email?: string }
    buyerName: string
    amountPaid: number
    currency: string
    remainingBalance: number
    invoiceRef: string
    acknowledgeUrl: string
  }): Promise<ContactNotificationResult> {
    const { contact, buyerName, amountPaid, currency, remainingBalance, invoiceRef, acknowledgeUrl } = opts
    const formattedPaid = `${currency} ${amountPaid.toFixed(2)}`
    const formattedBalance = `${currency} ${remainingBalance.toFixed(2)}`
    const bodyText =
      remainingBalance > 0
        ? `Hi ${contact.name}, ${buyerName} has paid ${formattedPaid} against invoice ${invoiceRef}. Remaining balance: ${formattedBalance}. Confirm: ${acknowledgeUrl}`
        : `Hi ${contact.name}, ${buyerName} has paid ${formattedPaid} for invoice ${invoiceRef}. The bill is settled. Confirm: ${acknowledgeUrl}`
    const tasks: Array<{
      channel: 'whatsapp' | 'sms' | 'email'
      send: Promise<'queued' | 'accepted' | 'skipped' | 'failed'>
    }> = []
    if (contact.phone) {
      tasks.push({
        channel: 'whatsapp',
        send: this.sendWhatsAppText({
          to: contact.phone,
          body: bodyText,
          actionUrl: acknowledgeUrl,
          tenantId: opts.tenantId,
          eventType: 'remittance',
          dedupeKey: opts.dedupeKey,
        }).then((result) =>
          result?.messages?.[0]?.id ? 'accepted' : result?.queued ? 'queued' : result?.failed ? 'failed' : 'skipped',
        ),
      })
      tasks.push({
        channel: 'sms',
        send: this.sendSms(contact.phone, bodyText).then((result) =>
          result.success ? 'accepted' : result.skipped ? 'skipped' : 'failed',
        ),
      })
    }
    if (contact.email) {
      tasks.push({
        channel: 'email',
        send: this.sendEmail({
          to: contact.email,
          subject: `Payment received from ${buyerName}`,
          text: bodyText,
          html: `<p>${bodyText}</p>`,
        }).then((result) => (result.success ? 'accepted' : 'skipped')),
      })
    }
    const results = await Promise.allSettled(tasks.map((task) => task.send))
    const channels: ContactNotificationResult['channels'] = results.map((result, index) => ({
      channel: tasks[index].channel,
      status: result.status === 'rejected' ? 'failed' : result.value,
    }))
    const accepted = channels.some((channel) => channel.status === 'accepted')
    if (!accepted) logger.warn({ channels }, 'Remittance not accepted by a delivery provider')
    return { accepted, channels }
  }

  /**
   * Remember a WhatsApp message Graph already accepted, so a later sent, delivered or read
   * callback can update this row. This does not send and does not create consent.
   */
  recordAcceptedWhatsApp(input: {
    tenantId: string
    to: string
    eventType: string
    messageId: string
    senderKey: string
    phoneNumberId: string
  }): void {
    if (!input.messageId || !input.tenantId || !input.senderKey || !input.phoneNumberId) return
    const recipient = normalizeNotificationPhone(input.to)
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO notification_deliveries
        (id, tenant_id, event_type, recipient, sender_key, phone_number_id, provider_message_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)`,
      )
      .run(
        `wa-${randomUUID()}`,
        input.tenantId,
        input.eventType,
        recipient,
        input.senderKey,
        input.phoneNumberId,
        input.messageId,
        now,
        now,
      )
  }
}

export const notificationService = new NotificationService()

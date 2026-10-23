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
import {
  normalizeNotificationPhone,
  whatsAppGraphUrl,
  whatsAppSenderService,
  WHATSAPP_EVENTS,
} from './WhatsAppSenderService'
import { credentialTypeLabel, richTemplateComponents, roleText, templateText } from './whatsAppTemplates'

const logger = rootLogger.child({ module: 'NotificationService' })

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
  to: string
  body: string
  previewUrl?: boolean
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
  channels: Array<{ channel: 'whatsapp' | 'sms' | 'email'; status: 'accepted' | 'queued' | 'skipped' | 'failed' }>
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
    if (!user?.phone_hash || user.phone_hash !== createHash('sha256').update(phone).digest('hex')) {
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
    const { memberInviteService, memberInviteLink } = await import('./MemberInviteService')
    const invite = memberInviteService.get(inviteId)
    if (!invite || invite.used_at || !memberInviteService.claimFallback(inviteId)) return false
    const code = memberInviteService.issueCode(inviteId)
    const link = code ? memberInviteLink(code) : undefined
    if (!link) return false
    const orgName = getTenantById(invite.org_tenant_id)?.label || 'your organisation'
    const sms = await this.sendSms(
      phone,
      `${orgName} invited you to Credentis. Confirm your name and choose your own PIN here: ${link} (valid 7 days)`,
    )
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
      let bodyText = 'There is an update in your Credentis inbox. Sign in to view it.'
      const orgName = templateText(getTenantById(payload.tenantId)?.label, 40, 'Your organisation')
      // Values for the branded per-event template; left unset when this alert has no item to link to.
      let richValues: { header: string; body: string[]; link: string } | undefined
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
        bodyText = `${orgName} invited you to Credentis. Open the link to confirm your name and choose your own PIN.`
        const membership = db
          .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
          .get(invite.user_id, invite.org_tenant_id) as { role: string } | undefined
        richValues = {
          header: orgName,
          body: [templateText(invite.proposed_name, 40, 'there'), orgName, roleText(membership?.role)],
          link: code!,
        }
      } else if (payload.inboxItemId) {
        const owner = db
          .prepare(
            `SELECT u.id, w.title, w.credential_type FROM wallet_pending_offers w JOIN ssi_users u ON u.tenant_id = w.tenant_id
            WHERE w.id = ? AND w.issuer_tenant_id = ?`,
          )
          .get(payload.inboxItemId, payload.tenantId) as
          | { id: string; title?: string | null; credential_type?: string }
          | undefined
        const item =
          owner &&
          this.consentedRecipient(payload.tenantId, payload.eventType, { userId: owner.id })?.phone === payload.to
        if (!item) throw new DispatchError('Notification inbox item is not available for this recipient', 'permanent')
        action.searchParams.set('item', payload.inboxItemId)
        richValues = {
          header: orgName,
          body: [templateText(owner!.title, 60, credentialTypeLabel(owner!.credential_type))],
          link: payload.inboxItemId,
        }
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
      const actionUrl = action.toString()
      const rich = richValues
        ? await whatsAppSenderService.approvedRichTemplate(sender, payload.eventType, base.origin)
        : undefined
      const template = rich
        ? { name: rich.name, language: rich.language }
        : await whatsAppSenderService.requireApprovedTemplate(sender, templateEvent)
      const components = rich
        ? richTemplateComponents(rich, richValues!)
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
        phone_number_id = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'retry')`,
        )
        .run(sender.key, sender.phoneNumberId, new Date().toISOString(), id)
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

  public async sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }> {
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

  public async dispatchContactNotification(opts: {
    tenantId?: string
    dedupeKey?: string
    contact: { name: string; phone?: string; email?: string }
    type: 'vc_offer' | 'payment_link' | 'proof_request'
    url: string
    issuerName?: string
    amount?: number
    currency?: string
  }): Promise<ContactNotificationResult> {
    const { contact, type, url, issuerName = 'IdenEx Credentis', amount, currency } = opts
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
    if (contact.phone) {
      tasks.push({
        channel: 'whatsapp',
        send: this.sendWhatsAppText({
          to: contact.phone,
          body: message,
          tenantId: opts.tenantId,
          eventType: type,
          dedupeKey: opts.dedupeKey,
        }).then((result) =>
          result?.messages?.[0]?.id ? 'accepted' : result?.queued ? 'queued' : result?.skipped ? 'skipped' : 'failed',
        ),
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
}

export const notificationService = new NotificationService()

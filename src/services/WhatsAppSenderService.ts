import axios from 'axios'
import { createHash, createHmac, timingSafeEqual } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { providerRepository } from '../persistence/ProviderRepository'

import { DispatchError } from './OutboxService'

export interface WhatsAppSenderSelection {
  mode: 'platform' | 'tenant'
  enabled: boolean
  phoneNumberId?: string
  wabaId?: string
  templates: Record<string, { name: string; language: string }>
}

export interface ResolvedWhatsAppSender {
  key: string
  phoneNumberId: string
  wabaId: string
  token: string
  appSecret: string
  templates: WhatsAppSenderSelection['templates']
}

export const WHATSAPP_EVENTS = ['task', 'vc_offer', 'payment_link', 'proof_request', 'remittance'] as const

export const DEFAULT_WHATSAPP_GRAPH_VERSION = 'v26.0'

/** Meta Graph URL. Override the version with WHATSAPP_GRAPH_VERSION (e.g. v26.0) when Meta retires one. */
export function whatsAppGraphUrl(path: string): string {
  const configured = (process.env.WHATSAPP_GRAPH_VERSION || '').trim()
  const version = /^v\d+\.\d+$/.test(configured) ? configured : DEFAULT_WHATSAPP_GRAPH_VERSION
  return `https://graph.facebook.com/${version}/${path.replace(/^\/+/, '')}`
}

export function normalizeNotificationPhone(phone: string): string {
  let result = phone.replace(/\D/g, '')
  if (result.startsWith('0') && result.length === 10) result = `263${result.slice(1)}`
  if (!/^[1-9]\d{7,14}$/.test(result)) throw new DispatchError('Invalid recipient phone', 'permanent')
  return result
}

/** Tokens remain in the deployment secret environment, never in provider_configs or API projections. */
export function tenantWhatsAppSecretPrefix(tenantId: string): string {
  return `WHATSAPP_TENANT_${createHash('sha256').update(tenantId).digest('hex').toUpperCase()}`
}

export const DEFAULT_PLATFORM_TEMPLATE = { name: 'credentis_inbox_update', language: 'en_US' }

/**
 * Until organisations bring their own numbers, an organisation that never chose a sender uses the
 * shared platform number with one approved inbox template for every event. A saved choice (including off) wins.
 */
export function platformDefaultSelection(): WhatsAppSenderSelection | undefined {
  const env = process.env
  if (
    !env.WABA_TOKEN ||
    !env.WHATSAPP_APP_SECRET ||
    !/^\d+$/.test(env.WABA_PHONE_NUMBER_ID || '') ||
    !/^\d+$/.test(env.WABA_BUSINESS_ACCOUNT_ID || '')
  ) {
    return undefined
  }
  const name = (env.WHATSAPP_PLATFORM_TEMPLATE || DEFAULT_PLATFORM_TEMPLATE.name).trim()
  const language = (env.WHATSAPP_PLATFORM_TEMPLATE_LANGUAGE || DEFAULT_PLATFORM_TEMPLATE.language).trim()
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) return undefined
  return {
    mode: 'platform',
    enabled: true,
    templates: Object.fromEntries(WHATSAPP_EVENTS.map((event) => [event, { name, language }])),
  }
}

export class WhatsAppSenderService {
  public selection(tenantId: string): WhatsAppSenderSelection | undefined {
    const config = providerRepository.findConfigById(`whatsapp:${tenantId}`)
    if (!config) return platformDefaultSelection()
    if (config.tenantId !== tenantId || config.status !== 'active') return undefined
    const provider = providerRepository.findProviderById(config.providerId)
    if (!provider || provider.type !== 'notification' || provider.status !== 'active') return undefined
    // Deliberately project only public fields, even if an older operator inserted tokens into provider_configs.
    return {
      mode: config.config.mode,
      enabled: config.config.enabled === true,
      phoneNumberId: config.config.phoneNumberId,
      wabaId: config.config.wabaId,
      templates: config.config.templates || {},
    }
  }

  public configure(tenantId: string, selection: WhatsAppSenderSelection): WhatsAppSenderSelection {
    if (!['platform', 'tenant'].includes(selection.mode))
      throw new DispatchError('Explicit sender mode required', 'permanent')
    const templates: WhatsAppSenderSelection['templates'] = {}
    for (const [event, template] of Object.entries(selection.templates || {})) {
      if (
        !WHATSAPP_EVENTS.includes(event as any) ||
        !/^[a-z0-9_]{1,512}$/.test(template.name) ||
        !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(template.language)
      ) {
        throw new DispatchError('Invalid transactional template selection', 'permanent')
      }
      templates[event] = { name: template.name, language: template.language }
    }
    const safe: WhatsAppSenderSelection = {
      mode: selection.mode,
      enabled: selection.enabled === true,
      templates,
      ...(selection.mode === 'tenant' ? { phoneNumberId: selection.phoneNumberId, wabaId: selection.wabaId } : {}),
    }
    if (safe.mode === 'tenant' && (!/^\d+$/.test(safe.phoneNumberId || '') || !/^\d+$/.test(safe.wabaId || ''))) {
      throw new DispatchError('Tenant phone and WABA IDs required', 'permanent')
    }
    if (!providerRepository.findProviderById('whatsapp-business')) {
      providerRepository.saveProvider({
        id: 'whatsapp-business',
        tenantId: 'system',
        name: 'WhatsApp Business',
        type: 'notification',
        authType: 'oauth2',
        isSystem: true,
      })
    }
    providerRepository.saveConfig({
      id: `whatsapp:${tenantId}`,
      tenantId,
      providerId: 'whatsapp-business',
      name: 'Transactional WhatsApp',
      config: safe,
      status: 'active',
      environment: 'production',
    })
    return safe
  }

  public resolve(tenantId: string): ResolvedWhatsAppSender {
    const selected = this.selection(tenantId)
    if (!selected?.enabled) throw new DispatchError('Sender not selected or disabled', 'permanent')
    const platform = selected.mode === 'platform'
    if (!platform && selected.mode !== 'tenant') throw new DispatchError('Invalid sender mode', 'permanent')
    const prefix = tenantWhatsAppSecretPrefix(tenantId)
    const sender: ResolvedWhatsAppSender = {
      key: platform ? 'platform' : `tenant:${tenantId}`,
      phoneNumberId: platform ? process.env.WABA_PHONE_NUMBER_ID || '' : selected.phoneNumberId || '',
      wabaId: platform ? process.env.WABA_BUSINESS_ACCOUNT_ID || '' : selected.wabaId || '',
      token: process.env[platform ? 'WABA_TOKEN' : `${prefix}_TOKEN`] || '',
      appSecret: process.env[platform ? 'WHATSAPP_APP_SECRET' : `${prefix}_APP_SECRET`] || '',
      templates: selected.templates,
    }
    if (!sender.token || !sender.appSecret || !/^\d+$/.test(sender.phoneNumberId) || !/^\d+$/.test(sender.wabaId)) {
      throw new DispatchError('Selected sender is not configured', 'permanent')
    }
    return sender
  }

  public async validate(
    tenantId: string,
  ): Promise<{ ready: boolean; templates: string[]; webhookSubscribed: boolean }> {
    const sender = this.resolve(tenantId)
    await this.requireOwnedPhone(sender)
    const approved: string[] = []
    for (const event of Object.keys(sender.templates)) {
      await this.requireApprovedTemplate(sender, event)
      approved.push(event)
    }
    await this.subscribeAndBind(sender)
    return { ready: approved.length > 0, templates: approved, webhookSubscribed: true }
  }

  /** Connects the shared platform number on first use, so organisations on it need no setup step. */
  public async ensurePlatformBinding(sender: ResolvedWhatsAppSender): Promise<void> {
    if (sender.key !== 'platform') throw new DispatchError('Sender connection has not been validated', 'permanent')
    await this.requireOwnedPhone(sender)
    await this.subscribeAndBind(sender)
  }

  private async requireOwnedPhone(sender: ResolvedWhatsAppSender): Promise<void> {
    const { data } = await axios.get(whatsAppGraphUrl(`${sender.wabaId}/phone_numbers`), {
      headers: { Authorization: 'Bearer ' + sender.token },
      timeout: 15000,
    })
    if (!data?.data?.some((phone: any) => phone.id === sender.phoneNumberId)) {
      throw new DispatchError('Phone does not belong to selected WABA', 'permanent')
    }
  }

  private async subscribeAndBind(sender: ResolvedWhatsAppSender): Promise<void> {
    // Meta only delivers status and STOP callbacks for a WABA subscribed to this app; the call is idempotent.
    const subscribed = await axios.post(whatsAppGraphUrl(`${sender.wabaId}/subscribed_apps`), undefined, {
      headers: { Authorization: 'Bearer ' + sender.token },
      timeout: 15000,
    })
    if (subscribed?.data?.success !== true) throw new DispatchError('Webhook subscription failed', 'permanent')
    const db = DatabaseManager.getDatabase()
    const binding = db
      .prepare('SELECT sender_key FROM whatsapp_sender_bindings WHERE phone_number_id = ?')
      .get(sender.phoneNumberId) as { sender_key: string } | undefined
    if (binding && binding.sender_key !== sender.key) throw new DispatchError('Sender phone already bound', 'permanent')
    db.prepare(
      `INSERT INTO whatsapp_sender_bindings (phone_number_id, sender_key, waba_id, validated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(phone_number_id) DO UPDATE SET waba_id = excluded.waba_id, validated_at = excluded.validated_at`,
    ).run(sender.phoneNumberId, sender.key, sender.wabaId, new Date().toISOString())
  }

  public async requireApprovedTemplate(
    sender: ResolvedWhatsAppSender,
    event: string,
  ): Promise<{ name: string; language: string }> {
    const template = sender.templates[event]
    if (!template) throw new DispatchError('No sender-specific template for event', 'permanent')
    const { data } = await axios.get(whatsAppGraphUrl(`${sender.wabaId}/message_templates`), {
      params: { name: template.name, limit: 100 },
      headers: { Authorization: `Bearer ${sender.token}` },
      timeout: 15000,
    })
    const approved = data?.data?.find(
      (item: any) =>
        item.name === template.name &&
        item.language === template.language &&
        item.status === 'APPROVED' &&
        item.category === 'UTILITY' &&
        item.components?.some(
          (component: any) =>
            component.type === 'BODY' && component.text?.includes('{{1}}') && component.text?.includes('{{2}}'),
        ),
    )
    if (!approved) throw new DispatchError('Selected utility template not approved or incompatible', 'permanent')
    return template
  }

  public verifyCallback(phoneNumberId: string, wabaId: string, rawBody: Buffer, signature: string): string {
    const binding = DatabaseManager.getDatabase()
      .prepare('SELECT sender_key, waba_id FROM whatsapp_sender_bindings WHERE phone_number_id = ?')
      .get(phoneNumberId) as { sender_key: string; waba_id: string } | undefined
    if (!binding || binding.waba_id !== wabaId) throw new DispatchError('Unknown callback sender', 'permanent')
    const prefix = binding.sender_key === 'platform' ? '' : tenantWhatsAppSecretPrefix(binding.sender_key.slice(7))
    const secret = process.env[prefix ? `${prefix}_APP_SECRET` : 'WHATSAPP_APP_SECRET']
    if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature))
      throw new DispatchError('Invalid callback signature', 'permanent')
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      throw new DispatchError('Invalid callback signature', 'permanent')
    return binding.sender_key
  }
}

export const whatsAppSenderService = new WhatsAppSenderService()

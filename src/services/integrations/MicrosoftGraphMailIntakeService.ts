/**
 * Jobs mailbox → job intake, through Microsoft Graph (application permission `Mail.Read`).
 *
 * Every message in the jobs mailbox becomes one unassigned job in intake. Nothing is missed:
 * the delta link only moves forward after every message on the page was saved, so a failed run
 * reads the same messages again. Nothing is booked twice: the email's Internet message id is
 * unique per organisation, and a job naming a store and client PO that is already booked is
 * saved as a possible repeat that the dispatcher must confirm before it starts.
 *
 * Configuration (all required to switch it on):
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET  app registration
 *   MS_GRAPH_MAILBOX        the jobs mailbox, e.g. jobs@sgk.co.za
 *   MS_GRAPH_ORG_TENANT_ID  the organisation that receives the jobs
 * Optional: MS_GRAPH_MAIL_FOLDER (inbox), MS_GRAPH_POLL_SECONDS (120),
 *   MS_GRAPH_FIRST_SYNC_DAYS (14) how far back the first read goes.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { contactRepository, listContacts } from '../../persistence/ContactRepository'
import { jobIntakeRepository, type JobIntakeAttachmentInput } from '../../persistence/JobIntakeRepository'
import { parseJobEmail } from './jobEmailParser'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])
const MAX_ATTACHMENTS = 6
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export interface MailIntakeConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  mailbox: string
  orgTenantId: string
  folder: string
  pollSeconds: number
  firstSyncDays: number
}

export interface GraphMessage {
  id: string
  internetMessageId?: string
  subject?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  receivedDateTime?: string
  hasAttachments?: boolean
  body?: { contentType?: string; content?: string }
  '@removed'?: unknown
}

export interface MailSyncResult {
  imported: number
  repeats: number
  alreadySaved: number
  failed: number
  error?: string
}

type Fetch = typeof fetch

export function readMailIntakeConfig(env: NodeJS.ProcessEnv = process.env): MailIntakeConfig | undefined {
  const value = (key: string) => String(env[key] || '').trim()
  const config = {
    tenantId: value('MS_GRAPH_TENANT_ID'),
    clientId: value('MS_GRAPH_CLIENT_ID'),
    clientSecret: value('MS_GRAPH_CLIENT_SECRET'),
    mailbox: value('MS_GRAPH_MAILBOX'),
    orgTenantId: value('MS_GRAPH_ORG_TENANT_ID'),
    folder: value('MS_GRAPH_MAIL_FOLDER') || 'inbox',
    pollSeconds: Math.max(30, Number(value('MS_GRAPH_POLL_SECONDS')) || 120),
    firstSyncDays: Math.max(1, Number(value('MS_GRAPH_FIRST_SYNC_DAYS')) || 14),
  }
  return config.tenantId && config.clientId && config.clientSecret && config.mailbox && config.orgTenantId
    ? config
    : undefined
}

export class MicrosoftGraphMailIntakeService {
  private token?: { value: string; expiresAt: number }
  private running?: Promise<MailSyncResult>
  private timer?: NodeJS.Timeout

  public constructor(
    private readonly configOf: () => MailIntakeConfig | undefined = () => readMailIntakeConfig(),
    private readonly http: Fetch = (...args) => fetch(...args),
  ) {}

  public isConfiguredFor(orgTenantId: string): boolean {
    return this.configOf()?.orgTenantId === orgTenantId
  }

  public start(): boolean {
    const config = this.configOf()
    if (!config || this.timer) return false
    this.timer = setInterval(() => void this.syncNow(), config.pollSeconds * 1000)
    this.timer.unref()
    setTimeout(() => void this.syncNow(), 5_000).unref()
    return true
  }

  public status(orgTenantId: string) {
    const config = this.configOf()
    if (!config || config.orgTenantId !== orgTenantId) return { connected: false as const }
    const state = this.state(config)
    return {
      connected: true as const,
      mailbox: config.mailbox,
      lastReadAt: state?.lastPolledAt,
      lastError: state?.lastError || undefined,
      imported: state?.importedCount ?? 0,
      repeats: state?.repeatCount ?? 0,
    }
  }

  /** One read at a time; a second call waits for the read in progress. */
  public syncNow(): Promise<MailSyncResult> {
    if (!this.running) {
      this.running = this.sync().finally(() => {
        this.running = undefined
      })
    }
    return this.running
  }

  private async sync(): Promise<MailSyncResult> {
    const config = this.configOf()
    const result: MailSyncResult = { imported: 0, repeats: 0, alreadySaved: 0, failed: 0 }
    if (!config) return { ...result, error: 'The jobs mailbox is not connected.' }
    try {
      const since = new Date(Date.now() - config.firstSyncDays * 86_400_000).toISOString()
      let url: string | undefined =
        this.state(config)?.deltaLink ||
        `${GRAPH}/users/${encodeURIComponent(config.mailbox)}/mailFolders/${encodeURIComponent(config.folder)}/messages/delta` +
          `?$select=id,internetMessageId,subject,from,receivedDateTime,hasAttachments,body` +
          `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`
      while (url) {
        const page = (await this.graph(config, url)) as {
          value?: GraphMessage[]
          '@odata.nextLink'?: string
          '@odata.deltaLink'?: string
        }
        for (const message of page.value || []) {
          if (message['@removed']) continue
          const outcome = await this.importMessage(config, message)
          result[outcome] += 1
        }
        if (result.failed > 0) throw new Error(`${result.failed} email(s) could not be saved; they will be read again.`)
        url = page['@odata.nextLink']
        if (!url && page['@odata.deltaLink']) this.saveState(config, { deltaLink: page['@odata.deltaLink'] })
      }
      this.saveState(config, { error: null, imported: result.imported, repeats: result.repeats })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.saveState(config, { error: message, imported: result.imported, repeats: result.repeats })
      return { ...result, error: message }
    }
  }

  public async importMessage(
    config: MailIntakeConfig,
    message: GraphMessage,
  ): Promise<'imported' | 'repeats' | 'alreadySaved' | 'failed'> {
    const sourceMessageId = String(message.internetMessageId || message.id).slice(0, 500)
    const db = DatabaseManager.getDatabase()
    const known = db
      .prepare('SELECT id FROM job_intakes WHERE tenant_id = ? AND source_message_id = ?')
      .get(config.orgTenantId, sourceMessageId)
    if (known) return 'alreadySaved'
    try {
      const subject = String(message.subject || '').slice(0, 500)
      const sender = String(message.from?.emailAddress?.address || '').slice(0, 320)
      const parsed = parseJobEmail(subject, String(message.body?.content || ''), message.body?.contentType)
      const senderStore = sender
        ? listContacts(config.orgTenantId).find(
            (contact) => contact.storeNumber && contact.email?.toLowerCase() === sender.toLowerCase(),
          )
        : undefined
      const storeNumber = parsed.storeNumber || senderStore?.storeNumber
      const store = storeNumber ? contactRepository.findByStoreNumber(config.orgTenantId, storeNumber) : undefined
      const { attachments, left } = message.hasAttachments
        ? await this.attachments(config, message.id)
        : { attachments: [], left: 0 }
      const note = left > 0 ? `\n\n(${left} attachment(s) in the email were not kept: wrong type or too large.)` : ''
      const input = {
        reference: `EM-${Date.now()}-${randomUUID().slice(0, 6)}`,
        storeNumber,
        poNumber: parsed.poNumber,
        problemType: parsed.problemType,
        description: `${parsed.description}${note}`.slice(0, 4000),
        clientName: store?.name || message.from?.emailAddress?.name || undefined,
        clientPhone: parsed.clientPhone || store?.phone,
        location: parsed.location,
        scheduledDate: parsed.scheduledDate,
        amount: parsed.amount || 0,
        currency: parsed.currency || 'USD',
        callOut: parsed.callOut,
        sourceType: 'email' as const,
        sourceMessageId,
        sourceSender: sender || undefined,
        sourceSubject: subject || undefined,
      }
      let saved
      try {
        saved = jobIntakeRepository.create(config.orgTenantId, `mail:${config.mailbox}`, { ...input, attachments })
      } catch (error) {
        // A file whose contents do not match its type must not cost us the job itself.
        if (!(error instanceof Error && /attachment/i.test(error.message)) || attachments.length === 0) throw error
        saved = jobIntakeRepository.create(config.orgTenantId, `mail:${config.mailbox}`, {
          ...input,
          description: `${input.description}\n\n(The email's attachments could not be kept.)`.slice(0, 4000),
        })
      }
      return saved.duplicateOf ? 'repeats' : 'imported'
    } catch {
      return 'failed'
    }
  }

  private async attachments(
    config: MailIntakeConfig,
    messageId: string,
  ): Promise<{ attachments: JobIntakeAttachmentInput[]; left: number }> {
    const page = (await this.graph(
      config,
      `${GRAPH}/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`,
    )) as { value?: Array<{ '@odata.type'?: string; name?: string; contentType?: string; size?: number; isInline?: boolean; contentBytes?: string }> }
    const kept: JobIntakeAttachmentInput[] = []
    let total = 0
    let left = 0
    for (const item of page.value || []) {
      const type = String(item.contentType || '').toLowerCase()
      const size = Number(item.size || 0)
      const isFile = item['@odata.type'] === '#microsoft.graph.fileAttachment' && item.contentBytes
      if (item.isInline && type.startsWith('image/')) continue
      if (!isFile || !ALLOWED_TYPES.has(type) || size > MAX_ATTACHMENT_BYTES || kept.length >= MAX_ATTACHMENTS || total + size > MAX_TOTAL_BYTES) {
        left += 1
        continue
      }
      total += size
      kept.push({ filename: String(item.name || 'attachment').slice(0, 255), mediaType: type, contentBase64: item.contentBytes! })
    }
    return { attachments: kept, left }
  }

  private async graph(config: MailIntakeConfig, url: string): Promise<unknown> {
    const response = await this.http(url, {
      headers: {
        Authorization: `Bearer ${await this.accessToken(config)}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    })
    if (response.status === 410) {
      // The delta link expired: start again from the first-sync window; message ids stop repeats.
      this.saveState(config, { deltaLink: null })
      throw new Error('The mailbox position expired and was reset; the next read starts again.')
    }
    if (!response.ok) throw new Error(`Microsoft Graph answered ${response.status}`)
    return response.json()
  }

  private async accessToken(config: MailIntakeConfig): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value
    const response = await this.http(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    })
    if (!response.ok) throw new Error(`Microsoft sign-in for the jobs mailbox failed (${response.status})`)
    const body = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!body.access_token) throw new Error('Microsoft sign-in for the jobs mailbox returned no token')
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 }
    return this.token.value
  }

  private state(config: MailIntakeConfig) {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT delta_link AS deltaLink, last_polled_at AS lastPolledAt, last_error AS lastError,
                imported_count AS importedCount, repeat_count AS repeatCount
           FROM mail_intake_state WHERE org_tenant_id = ? AND mailbox = ?`,
      )
      .get(config.orgTenantId, config.mailbox) as
      | { deltaLink?: string; lastPolledAt?: string; lastError?: string; importedCount: number; repeatCount: number }
      | undefined
  }

  private saveState(
    config: MailIntakeConfig,
    changes: { deltaLink?: string | null; error?: string | null; imported?: number; repeats?: number },
  ): void {
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO mail_intake_state (org_tenant_id, mailbox) VALUES (?, ?)
       ON CONFLICT (org_tenant_id, mailbox) DO NOTHING`,
    ).run(config.orgTenantId, config.mailbox)
    if (changes.deltaLink !== undefined) {
      db.prepare('UPDATE mail_intake_state SET delta_link = ? WHERE org_tenant_id = ? AND mailbox = ?').run(
        changes.deltaLink,
        config.orgTenantId,
        config.mailbox,
      )
    }
    if (changes.error !== undefined) {
      db.prepare(
        `UPDATE mail_intake_state
            SET last_error = ?, last_polled_at = ?, imported_count = imported_count + ?, repeat_count = repeat_count + ?
          WHERE org_tenant_id = ? AND mailbox = ?`,
      ).run(
        changes.error,
        new Date().toISOString(),
        changes.imported || 0,
        changes.repeats || 0,
        config.orgTenantId,
        config.mailbox,
      )
    }
  }
}

export const microsoftGraphMailIntakeService = new MicrosoftGraphMailIntakeService()

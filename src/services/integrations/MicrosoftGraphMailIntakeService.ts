/**
 * Jobs mailbox → job intake, through Microsoft Graph (application permission `Mail.Read`).
 *
 * Every message in the jobs mailbox becomes one unassigned job in intake. Nothing is missed:
 * the delta link only moves forward after every message on the page was saved, so a failed run
 * reads the same messages again. Nothing is booked twice: the email's Internet message id is
 * unique per organisation, and a job naming a store and client PO that is already booked is
 * saved as a possible repeat that the dispatcher must confirm before it starts.
 *
 * Same approach as the LDK website: an Entra app registration signs in on its own (client
 * credentials, application permission `Mail.Read`, admin consent) and reads one named mailbox.
 * LDK is told about new mail by Graph webhooks; here the mailbox is read on a timer with a
 * delta link, which needs no public address and gives the same guarantees.
 *
 * Like LDK's lead activity, a conversation stays on one record: a reply in the conversation that
 * started a job (from the store, or the office's answer in Sent Items) is kept on that job's mail
 * thread instead of becoming a second job. Sent Items never create jobs.
 *
 * Configuration (all required to switch it on). The names are LDK's; the older MS_GRAPH_* names still work:
 *   MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET  app registration
 *   MICROSOFT_GRAPH_PRIMARY_MAILBOX   the jobs mailbox, e.g. jobs@sgk.co.za
 *   MICROSOFT_GRAPH_ORG_TENANT_ID     the organisation that receives the jobs
 * Optional: MICROSOFT_GRAPH_MAIL_FOLDER (inbox), MICROSOFT_GRAPH_POLL_SECONDS (120),
 *   MICROSOFT_GRAPH_FIRST_SYNC_DAYS (14) how far back the first read goes,
 *   MICROSOFT_GRAPH_READ_SENT (true) keep the office's replies from Sent Items on the job.
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
  readSent: boolean
}

export interface GraphMessage {
  id: string
  internetMessageId?: string
  conversationId?: string
  subject?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  receivedDateTime?: string
  sentDateTime?: string
  hasAttachments?: boolean
  isDraft?: boolean
  body?: { contentType?: string; content?: string }
  webLink?: string
  '@removed'?: unknown
}

export interface MailSyncResult {
  imported: number
  repeats: number
  /** Replies kept on the mail thread of a job that is already saved. */
  replies: number
  alreadySaved: number
  /** Drafts and no-reply or bounce mail: read, but not turned into jobs. */
  skipped: number
  failed: number
  error?: string
}

type Fetch = typeof fetch

/** A setting copied from an example file ("your-…", "replace_…") counts as not set. */
function setting(env: NodeJS.ProcessEnv, ...keys: string[]): string {
  for (const key of keys) {
    const value = String(env[key] || '').trim()
    if (value && !/^(your-|replace[_-])/i.test(value)) return value
  }
  return ''
}

const SETTING_KEYS = {
  tenantId: ['MICROSOFT_GRAPH_TENANT_ID', 'MS_GRAPH_TENANT_ID'],
  clientId: ['MICROSOFT_GRAPH_CLIENT_ID', 'MS_GRAPH_CLIENT_ID'],
  clientSecret: ['MICROSOFT_GRAPH_CLIENT_SECRET', 'MS_GRAPH_CLIENT_SECRET'],
  mailbox: ['MICROSOFT_GRAPH_PRIMARY_MAILBOX', 'MS_GRAPH_MAILBOX'],
  orgTenantId: ['MICROSOFT_GRAPH_ORG_TENANT_ID', 'MS_GRAPH_ORG_TENANT_ID'],
  folder: ['MICROSOFT_GRAPH_MAIL_FOLDER', 'MS_GRAPH_MAIL_FOLDER'],
  pollSeconds: ['MICROSOFT_GRAPH_POLL_SECONDS', 'MS_GRAPH_POLL_SECONDS'],
  firstSyncDays: ['MICROSOFT_GRAPH_FIRST_SYNC_DAYS', 'MS_GRAPH_FIRST_SYNC_DAYS'],
  readSent: ['MICROSOFT_GRAPH_READ_SENT', 'MS_GRAPH_READ_SENT'],
} as const

const REQUIRED_SETTINGS = ['tenantId', 'clientId', 'clientSecret', 'mailbox', 'orgTenantId'] as const

/** Names of the required settings that are still empty (never their values). */
export function missingMailIntakeSettings(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED_SETTINGS.filter((name) => !setting(env, ...SETTING_KEYS[name])).map((name) => SETTING_KEYS[name][0])
}

export function readMailIntakeConfig(env: NodeJS.ProcessEnv = process.env): MailIntakeConfig | undefined {
  const value = (name: keyof typeof SETTING_KEYS) => setting(env, ...SETTING_KEYS[name])
  const config = {
    tenantId: value('tenantId'),
    clientId: value('clientId'),
    clientSecret: value('clientSecret'),
    mailbox: value('mailbox').toLowerCase(),
    orgTenantId: value('orgTenantId'),
    folder: value('folder') || 'inbox',
    pollSeconds: Math.max(30, Number(value('pollSeconds')) || 120),
    firstSyncDays: Math.max(1, Number(value('firstSyncDays')) || 14),
    readSent: !/^(false|0|no|off)$/i.test(value('readSent')),
  }
  return missingMailIntakeSettings(env).length === 0 ? config : undefined
}

/**
 * Graph hands back page and delta links, and every request to them carries our token.
 * Only an address on Graph itself may be followed.
 */
export function assertGraphUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Microsoft Graph returned an invalid page address.')
  }
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) {
    throw new Error('Microsoft Graph returned an unexpected page address.')
  }
  return url.toString()
}

/** Drafts and mail sent by a machine (no-reply, postmaster, bounce notices) are not jobs. */
export function isAutomatedMessage(message: Pick<GraphMessage, 'isDraft' | 'from'>): boolean {
  const sender = String(message.from?.emailAddress?.address || '').trim().toLowerCase()
  return Boolean(message.isDraft) || /^(no-?reply|do-?not-?reply|postmaster|mailer-daemon)@/.test(sender)
}

/** Only a link that opens the email in Outlook on the web is kept (LDK's rule). */
export function safeOutlookMessageUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'].includes(url.hostname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

const SELECT = 'id,internetMessageId,conversationId,subject,from,receivedDateTime,sentDateTime,hasAttachments,isDraft,body,webLink'

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
    if (!config || config.orgTenantId !== orgTenantId) {
      // Names only, so an admin can see what is still to be filled in; never a value.
      return { connected: false as const, missing: missingMailIntakeSettings() }
    }
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
    const result: MailSyncResult = { imported: 0, repeats: 0, replies: 0, alreadySaved: 0, skipped: 0, failed: 0 }
    if (!config) return { ...result, error: 'The jobs mailbox is not connected.' }
    try {
      await this.readFolder(config, config.folder, config.mailbox, result, (message) => this.importMessage(config, message))
      if (config.readSent) {
        // The office's own answers: kept on the job they reply to, never turned into jobs.
        await this.readFolder(config, 'sentitems', `${config.mailbox}#sent`, result, (message) =>
          Promise.resolve(this.keepReply(config, message, 'out')),
        )
      }
      this.saveState(config, { error: null, imported: result.imported, repeats: result.repeats })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.saveState(config, { error: message, imported: result.imported, repeats: result.repeats })
      return { ...result, error: message }
    }
  }

  private async readFolder(
    config: MailIntakeConfig,
    folder: string,
    stateKey: string,
    result: MailSyncResult,
    handle: (message: GraphMessage) => Promise<keyof Omit<MailSyncResult, 'error'>>,
  ): Promise<void> {
    const since = new Date(Date.now() - config.firstSyncDays * 86_400_000).toISOString()
    let url: string | undefined =
      this.state(config, stateKey)?.deltaLink ||
      `${GRAPH}/users/${encodeURIComponent(config.mailbox)}/mailFolders/${encodeURIComponent(folder)}/messages/delta` +
        `?$select=${SELECT}` +
        `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`
    while (url) {
      const page = (await this.graph(config, url, stateKey)) as {
        value?: GraphMessage[]
        '@odata.nextLink'?: string
        '@odata.deltaLink'?: string
      }
      for (const message of page.value || []) {
        if (message['@removed']) continue
        result[await handle(message)] += 1
      }
      if (result.failed > 0) throw new Error(`${result.failed} email(s) could not be saved; they will be read again.`)
      url = page['@odata.nextLink']
      if (!url && page['@odata.deltaLink']) this.saveState(config, { deltaLink: page['@odata.deltaLink'] }, stateKey)
    }
  }

  /** A message in a conversation that already has a job goes on that job's thread. */
  private keepReply(
    config: MailIntakeConfig,
    message: GraphMessage,
    direction: 'in' | 'out',
  ): 'replies' | 'alreadySaved' | 'skipped' {
    if (message.isDraft) return 'skipped'
    const intake = jobIntakeRepository.findByConversation(config.orgTenantId, String(message.conversationId || ''))
    if (!intake) return 'skipped'
    const added = jobIntakeRepository.addMailMessage(config.orgTenantId, intake.id, {
      ...this.threadEntry(message, direction),
    })
    return added ? 'replies' : 'alreadySaved'
  }

  private threadEntry(message: GraphMessage, direction: 'in' | 'out') {
    return {
      internetMessageId: String(message.internetMessageId || message.id),
      conversationId: message.conversationId || undefined,
      direction,
      sender: String(message.from?.emailAddress?.address || '').toLowerCase() || undefined,
      subject: message.subject || undefined,
      bodyText: String(message.body?.content || '').replace(/\s+\n/g, '\n').trim() || undefined,
      receivedAt: message.receivedDateTime || message.sentDateTime || new Date().toISOString(),
      webLink: safeOutlookMessageUrl(message.webLink),
    }
  }

  public async importMessage(
    config: MailIntakeConfig,
    message: GraphMessage,
  ): Promise<'imported' | 'repeats' | 'replies' | 'alreadySaved' | 'skipped' | 'failed'> {
    if (isAutomatedMessage(message)) return 'skipped'
    const sourceMessageId = String(message.internetMessageId || message.id).slice(0, 500)
    const db = DatabaseManager.getDatabase()
    const known = db
      .prepare('SELECT id FROM job_intakes WHERE tenant_id = ? AND source_message_id = ?')
      .get(config.orgTenantId, sourceMessageId)
    if (known) return 'alreadySaved'
    if (message.conversationId && jobIntakeRepository.findByConversation(config.orgTenantId, message.conversationId)) {
      return this.keepReply(config, message, 'in')
    }
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
        sourceConversationId: message.conversationId ? String(message.conversationId).slice(0, 500) : undefined,
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
      jobIntakeRepository.addMailMessage(config.orgTenantId, saved.id, this.threadEntry(message, 'in'))
      if (saved.duplicateOf) return 'repeats'
      // An emailed job goes straight onto the Jobs list as unassigned, like any other new job.
      const { jobIntakeOpeningService } = await import('../JobIntakeOpeningService')
      await jobIntakeOpeningService.openQuietly(saved)
      return 'imported'
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

  private async graph(config: MailIntakeConfig, url: string, stateKey = config.mailbox): Promise<unknown> {
    const response = await this.http(assertGraphUrl(url), {
      headers: {
        Authorization: `Bearer ${await this.accessToken(config)}`,
        // Text body, and ids that stay the same when someone moves the email to another folder.
        Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"',
      },
    })
    if (response.status === 410) {
      // The delta link expired: start again from the first-sync window; message ids stop repeats.
      this.saveState(config, { deltaLink: null }, stateKey)
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

  private state(config: MailIntakeConfig, key = config.mailbox) {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT delta_link AS deltaLink, last_polled_at AS lastPolledAt, last_error AS lastError,
                imported_count AS importedCount, repeat_count AS repeatCount
           FROM mail_intake_state WHERE org_tenant_id = ? AND mailbox = ?`,
      )
      .get(config.orgTenantId, key) as
      | { deltaLink?: string; lastPolledAt?: string; lastError?: string; importedCount: number; repeatCount: number }
      | undefined
  }

  private saveState(
    config: MailIntakeConfig,
    changes: { deltaLink?: string | null; error?: string | null; imported?: number; repeats?: number },
    key = config.mailbox,
  ): void {
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO mail_intake_state (org_tenant_id, mailbox) VALUES (?, ?)
       ON CONFLICT (org_tenant_id, mailbox) DO NOTHING`,
    ).run(config.orgTenantId, key)
    if (changes.deltaLink !== undefined) {
      db.prepare('UPDATE mail_intake_state SET delta_link = ? WHERE org_tenant_id = ? AND mailbox = ?').run(
        changes.deltaLink,
        config.orgTenantId,
        key,
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
        key,
      )
    }
  }
}

export const microsoftGraphMailIntakeService = new MicrosoftGraphMailIntakeService()

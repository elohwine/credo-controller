/**
 * A person messages the business number and gets businesses that fit, in that same chat.
 * A real request asks those businesses for a quote through the same request the app uses.
 * Their price, a decline, and the payment link come back in the chat.
 * This is a reply to the message they just sent. It does not opt them in to alerts,
 * and alerts stay on consented templates. STOP is handled before this runs.
 * "status" (or "my requests") answers with the sender's own latest requests.
 * A number with no account asks through a guest record that moves onto their account
 * when they sign up with the same number. The guest record stores no phone hash,
 * so signing up is not blocked by it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { organizationRegistryRepository } from '../persistence/OrganizationRegistryRepository'
import { workflowRequestRepository } from '../persistence/WorkflowRequestRepository'
import { rootLogger } from '../utils/pinoLogger'

import { jobDepositService } from './JobDepositService'
import { notificationService } from './NotificationService'
import { orgOfferingsService, type ProviderMatch } from './OrgOfferingsService'
import { describeRequest, readRequest } from './providerMatch'
import { contactHash, normalizeContactPhone, phoneHashCandidates } from './ssi/contactHash'
import { normalizeNotificationPhone, whatsAppSenderService } from './WhatsAppSenderService'

const logger = rootLogger.child({ module: 'WhatsAppInquiry' })

/** A link a phone can open: the public https address when one is set, never a localhost one if it can help it. */
export function findPageUrl(need: string): string {
  const bases = [process.env.PUBLIC_BASE_URL, process.env.WALLET_PUBLIC_URL]
    .map((value) => String(value || '').replace(/\/+$/, ''))
    .filter(Boolean)
  const base = bases.find((value) => value.startsWith('https://')) || bases[0] || ''
  const path = `/find?need=${encodeURIComponent(need)}`
  return base ? `${base}${path}` : path
}

/** A reply in the chat: the words, and optionally the same words with buttons or a pick list. */
export interface ChatReply {
  text: string
  interactive?: Record<string, unknown>
}

interface TapFrame {
  header?: string
  footer?: string
}

function clip(value: string, max: number): string {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function framed(body: string, frame: TapFrame) {
  return {
    ...(frame.header ? { header: { type: 'text', text: clip(frame.header, 60) } } : {}),
    body: { text: clip(body, 1024) },
    ...(frame.footer ? { footer: { text: clip(frame.footer, 60) } } : {}),
  }
}

/** Up to three buttons. A tap comes back with the button id, which is the command it stands for. */
export function tapButtons(body: string, buttons: Array<{ id: string; title: string }>, frame: TapFrame = {}) {
  return {
    type: 'button',
    ...framed(body, frame),
    action: {
      buttons: buttons.slice(0, 3).map((button) => ({
        type: 'reply',
        reply: { id: button.id.slice(0, 256), title: clip(button.title, 20) },
      })),
    },
  }
}

/** A list the person opens and picks one row from (at most ten rows). */
export function pickList(
  body: string,
  label: string,
  rows: Array<{ id: string; title: string; description?: string }>,
  frame: TapFrame & { section?: string } = {},
) {
  return {
    type: 'list',
    ...framed(body, frame),
    action: {
      button: clip(label, 20),
      sections: [
        {
          title: clip(frame.section || 'Choose one', 24),
          rows: rows.slice(0, 10).map((row) => ({
            id: row.id.slice(0, 200),
            title: clip(row.title, 24),
            ...(row.description ? { description: clip(row.description, 72) } : {}),
          })),
        },
      ],
    },
  }
}

/** One button that opens a link, such as the business's payment page. */
export function linkButton(body: string, label: string, url: string, frame: TapFrame = {}) {
  return {
    type: 'cta_url',
    ...framed(body, frame),
    action: { name: 'cta_url', parameters: { display_text: clip(label, 20), url } },
  }
}

/** `id` is the search word; `words` spots the trade in what someone typed. */
const CATEGORIES = [
  { id: 'plumber', label: 'Plumber', emoji: '🔧', description: 'Leaks, geysers, new pipes', words: /plumb|pipe|leak|geyser|drain|toilet|burst|\btap\b/i },
  { id: 'electrical', label: 'Electrician', emoji: '⚡', description: 'Faults, wiring, prepaid meters', words: /electric|wiring|socket|prepaid|power cut|no power/i },
  { id: 'cement', label: 'Hardware', emoji: '🧱', description: 'Cement, roofing sheets, paint', words: /cement|hardware|roof|paint|brick|sand|timber/i },
  { id: 'cleaning', label: 'Cleaning', emoji: '🧹', description: 'Homes and offices', words: /clean|maid|laundry/i },
  { id: 'cake', label: 'Bakery', emoji: '🎂', description: 'Cakes, bread and buns', words: /cake|bread|bak|\bbuns?\b/i },
  { id: 'school fees', label: 'School fees', emoji: '🎓', description: 'Pay a school', words: /school|fees|tuition/i },
]

const MY_REQUESTS = { id: 'STATUS', title: 'My requests' }
const NEW_SEARCH = { id: 'hi', title: 'New search' }
const SERVICE_ROWS = CATEGORIES.map((category) => ({
  id: `CAT:${category.id}`,
  title: category.label,
  description: category.description,
}))

/** The trade in what they typed, or the service of the business that matched best. */
export function categoryFor(text: string, serviceName?: string): { id?: string; label: string; emoji: string } {
  const known = CATEGORIES.find((category) => category.words.test(text) || category.id === text.trim().toLowerCase())
  if (known) return { id: known.id, label: known.label, emoji: known.emoji }
  const named = String(serviceName || '').trim()
  return { label: named ? named.charAt(0).toUpperCase() + named.slice(1) : 'Service', emoji: '🛠️' }
}

function firstName(name?: string): string {
  return name?.trim() ? clip(name.trim().split(/\s+/)[0], 30) : ''
}

/** Morning, afternoon or evening in Harare, where the pilot businesses are. */
function dayPart(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Harare' }).format(now),
  )
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** The first message: what this chat does, and three ways in. */
export function welcomeReply(name?: string, now = new Date()): ChatReply {
  const first = firstName(name)
  const hello = `${dayPart(now)}${first ? `, ${first}` : ''}! 👋`
  return {
    text: `${hello} Welcome to Credentis. Say what you need, for example: a plumber in Borrowdale. Reply STATUS to see your requests.`,
    interactive: tapButtons(
      `${hello} Welcome to *Credentis*.\n\nFind trusted local businesses, get their prices and pay them, all in this chat.\n\nWhat would you like to do?`,
      [{ id: 'SERVICE', title: 'I need a service' }, MY_REQUESTS, { id: 'PROVIDER', title: 'I run a business' }],
      { footer: 'Verified businesses · you pay them direct' },
    ),
  }
}

/** "Just describe it", with the popular services one tap away. */
export function startReply(): ChatReply {
  return {
    text: 'Say what you need, for example: a plumber in Borrowdale. You can send a photo or your location too.',
    interactive: pickList(
      'What do you need help with? Just describe it 🛠️\n\nFor example: *burst kitchen pipe in Avondale*\nYou can send a photo or your location too.',
      'Browse services',
      SERVICE_ROWS,
      { section: 'Popular' },
    ),
  }
}

function pickCategoryReply(): ChatReply {
  return {
    text: `Which service fits best? Reply with one: ${CATEGORIES.map((category) => category.label).join(', ')}.`,
    interactive: pickList('Which one fits best? 👇', 'Choose a service', SERVICE_ROWS, { section: 'Services' }),
  }
}

function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function categoryReply(draft: ChatDraft, names: string[]): ChatReply {
  const found = `${names.length === 1 ? '1 business fits' : `${names.length} businesses fit`}: ${namesLine(names)}.`
  return {
    text: `Sounds like you need a ${draft.label}. ${found} Reply YES to go on, or say it another way.`,
    interactive: tapButtons(
      `Sounds like you need a *${draft.label}* ${draft.emoji}\n\n${found}\n\nIs that the right category?`,
      [
        { id: 'DRAFT_YES', title: 'Yes, that fits' },
        { id: 'DRAFT_PICK', title: 'Pick another' },
      ],
    ),
  }
}

export function placeReply(): ChatReply {
  return {
    text: '📍 Where do you need it? Type the area, for example: Avondale, Harare. Or send your location pin.',
  }
}

export function summaryReply(draft: ChatDraft, names: string[], photos: number): ChatReply {
  const details = draft.text.charAt(0).toUpperCase() + draft.text.slice(1)
  const lines = [
    `${draft.emoji} ${draft.label}`,
    `📝 ${details}`,
    draft.area ? `📍 ${draft.area}` : '',
    photos ? `📷 ${photos} photo${photos === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  const to = names.length === 1 ? names[0] : `${names.length} businesses: ${namesLine(names)}`
  return {
    text: `Your request: ${lines.join(' · ')}. Reply SEND to send it to ${to}, or say it another way to start again.`,
    interactive: tapButtons(
      `📋 *Here's your request:*\n\n${lines.join('\n')}\n\nLook good? Tap *Confirm & Send* to send it to ${to}.`,
      [
        { id: 'DRAFT_SEND', title: 'Confirm & Send' },
        { id: 'DRAFT_CANCEL', title: 'Cancel' },
      ],
    ),
  }
}

export function sentReply(names: string[], already: string[] = []): ChatReply {
  const count = names.length === 1 ? '*1* business' : `*${names.length}* businesses`
  const also = already.length ? `\nAlready asked before: ${namesLine(already)}.` : ''
  const body = `Done! ✅ I've sent your request to ${count}:\n${names.map((name) => `• ${name}`).join('\n')}${also}\n\nSit tight. Their prices will arrive here in this chat.`
  return {
    text: `Asked ${names.join(', ')} for a quote. They'll reply here with a price.${already.length ? ` Already asked ${already.join(', ')}.` : ''}`,
    interactive: tapButtons(body, [MY_REQUESTS, { id: 'hi', title: 'New request' }], {
      footer: 'You only pay the business you choose',
    }),
  }
}

function noMatchReply(said: string): ChatReply {
  return {
    text: `No business matched ${said} yet. Try a trade and a place, for example: plumber in Borrowdale.`,
    interactive: tapButtons(
      `😕 I couldn't find a business for *${clip(said, 80)}* yet.\n\nTry saying it another way, or pick a service.`,
      [
        { id: 'DRAFT_PICK', title: 'Pick a service' },
        { id: 'hi', title: 'Start again' },
      ],
    ),
  }
}

function providerReply(): ChatReply {
  const text =
    'List your business on Credentis and get job requests right here on WhatsApp. Open the Credentis app and add what you offer.'
  const url = appUrl()
  if (!url.startsWith('https://')) return { text }
  return {
    text,
    interactive: linkButton(
      '*Grow your business with Credentis* 🚀\n\n✅ Customers find you by what you do and where\n💬 Get job requests and send quotes in this chat\n💵 Customers pay you directly. Credentis does not hold the money',
      'List my business',
      url,
      { footer: 'Free to start' },
    ),
  }
}

/** The Credentis app on the web, where a business signs up. */
function appUrl(): string {
  const find = findPageUrl('')
  return find.replace(/\/find\?need=$/, '/app/')
}

export function inquiryReply(
  need: string,
  matches: Array<{ name: string; reasons: string[]; standing?: { verified: string; live: string }; offer?: string }>,
  understood?: string,
): string {
  const heard = understood ? `Looking for: ${understood}` : ''
  if (!matches.length) {
    return [heard, 'No business matched that. Try a trade and a place, for example: plumber in Borrowdale.'].filter(Boolean).join('\n')
  }
  const lines = matches.slice(0, 3).map((match, index) => {
    const why = match.reasons.slice(0, 2).join('. ')
    const check = match.standing ? `${match.standing.verified} ${match.standing.live}` : ''
    const offer = match.offer ? `Offer: ${match.offer}` : ''
    const parts = [match.name, why, check, offer].map((part) => part.replace(/[.\s]+$/, '')).filter(Boolean)
    return `${index + 1}. ${parts.join('. ')}.`
  })
  return [heard, `${matches.length === 1 ? '1 business' : `${Math.min(matches.length, 3)} businesses`} can help:`, ...lines, `Open the list: ${findPageUrl(need)}`]
    .filter(Boolean)
    .join('\n')
}

const STATUS_WORDS: Record<string, string> = {
  pending: 'waiting for the business',
  approved: 'accepted',
  rejected: 'declined',
  fulfilled: 'done',
  cancelled: 'cancelled',
  expired: 'expired',
}

/** "status", "my requests", "track": the person wants their own requests, not a search. */
export function isStatusAsk(text: string): boolean {
  return /^(status|quotes?|prices?|track|tracking|my requests?|my orders?|where is my (order|request|job))\??$/i.test(text.trim())
}

export function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|ok|okay)\??$/i.test(text.trim())
}

/** PAY 1, ASK, ASK 2, NOT DONE 1 … — or a search. */
export function readChatCommand(
  text: string,
):
  | { type: 'pay'; n: number }
  | { type: 'dispute'; n: number; reason: string }
  | { type: 'ask'; picks: number[] }
  | { type: 'status' }
  | { type: 'greeting' }
  | { type: 'tap'; id: string; arg?: string }
  | { type: 'search' } {
  const trimmed = text.trim()
  // Button ids from the chat's own cards, and the short words that stand for them.
  const tap = /^(SERVICE|PROVIDER|DRAFT_YES|DRAFT_PICK|DRAFT_SEND|DRAFT_CANCEL)$/.exec(trimmed)
  if (tap) return { type: 'tap', id: tap[1] }
  const arg = /^(CAT|WAIT|JOB_QUOTE|JOB_ASK|JOB_SKIP)[: ](.{1,120})$/.exec(trimmed)
  if (arg) return { type: 'tap', id: arg[1], arg: arg[2].trim() }
  if (/^(yes|yes,? that fits)$/i.test(trimmed)) return { type: 'tap', id: 'DRAFT_YES' }
  if (/^(send|confirm|confirm (and|&) send)$/i.test(trimmed)) return { type: 'tap', id: 'DRAFT_SEND' }
  if (isGreeting(trimmed)) return { type: 'greeting' }
  if (isStatusAsk(trimmed)) return { type: 'status' }
  const pay = /^(?:pay|choose|yes)\s*#?([1-5])\b/i.exec(trimmed)
  if (pay) return { type: 'pay', n: Number(pay[1]) }
  const dispute = /^(?:not done|dispute)\s*#?([1-5])\s+(.{8,400})$/i.exec(trimmed)
  if (dispute) return { type: 'dispute', n: Number(dispute[1]), reason: dispute[2].trim() }
  // A bare "1" after the list picks that business.
  const ask = /^(?:(?:ask|ask them)(?:\s+([1-5](?:[\s,]+[1-5])*))?|#?([1-5]))$/i.exec(trimmed)
  if (ask?.[2]) return { type: 'ask', picks: [Number(ask[2])] }
  if (ask) {
    const picks = ask[1] ? [...new Set(ask[1].split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 5))] : []
    return { type: 'ask', picks }
  }
  return { type: 'search' }
}

export function statusReply(
  requests: Array<{ title: string; business: string; status: string; price?: string }>,
): string {
  if (!requests.length) {
    return 'No requests found for this number. Tell us what you need, for example: a plumber in Borrowdale.'
  }
  const lines = requests.map((request, index) => {
    const word = STATUS_WORDS[request.status] || 'in progress'
    return `${index + 1}. ${request.title} with ${request.business}: ${word}${request.price ? `, ${request.price}` : ''}.`
  })
  const payable = requests.some((request) => request.price)
  return [
    'Your latest requests:',
    ...lines,
    payable
      ? 'Reply PAY 1 to get the link to pay the first one with a price. The payment goes to that business.'
      : 'Open My requests in the Credentis app for the details.',
  ].join('\n')
}

export function quoteNotice(business: string, price: string, title: string, n?: number): string {
  const pay = n ? `Reply PAY ${n} to get the link to pay them.` : 'Reply STATUS, then PAY and its number, to pay them.'
  return `${business} quoted ${price} for ${title}. ${pay} The payment goes to them.`
}

/** The same quote with a Pay button. Without a request number it stays as words. */
export function quoteReply(business: string, price: string, title: string, n?: number): ChatReply {
  const text = quoteNotice(business, price, title, n)
  if (!n) return { text }
  return {
    text,
    interactive: tapButtons(
      `*${business}* sent you a quote ✅\n\n💵 *${price}*\n📝 ${title}\n\nThe payment goes straight to them. Credentis does not hold it.`,
      [
        { id: `PAY ${n}`, title: `Pay ${price}` },
        { id: 'STATUS', title: 'Compare quotes' },
      ],
      { header: '💬 New quote', footer: `Request ${n}` },
    ),
  }
}

interface StoredMatch {
  orgId: string
  tenantId: string
  name: string
  quoteServiceId?: string
  serviceName?: string
  reasons: string[]
  unsure: string[]
  standing?: ProviderMatch['standing']
  offer?: string
}

interface ChatPhoto {
  id: string
  caption?: string
}

interface AskedQuote {
  n: number
  requestId: string
  tenantId: string
  name: string
  need: string
}

/** A request being put together before anything is sent. */
export interface ChatDraft {
  text: string
  need: string
  area?: string
  payment?: string
  label: string
  emoji: string
  stage: 'category' | 'place' | 'confirm'
}

/** A business that tapped Send quote or Ask a question; their next message is the answer. */
interface JobAnswer {
  requestId: string
  kind: 'quote' | 'ask'
}

/** A customer asked a question by a business; their next message goes back to that business. */
interface Relay {
  requestId: string
  to: string
  senderKey: string
  business: string
}

interface ChatSession {
  senderKey: string
  phone: string
  requesterTenantId?: string
  search?: string
  matches: StoredMatch[]
  asked: AskedQuote[]
  photos: ChatPhoto[]
  place?: string
  draft?: ChatDraft
  job?: JobAnswer
  relay?: Relay
  lastInboundAt: string
  persist: boolean
}

function digitsOf(phone: string): string {
  try {
    return normalizeNotificationPhone(phone)
  } catch {
    return String(phone || '').replace(/\D/g, '').slice(0, 20)
  }
}

function asPhoto(value: unknown): ChatPhoto | undefined {
  if (typeof value === 'string' && value) return { id: value }
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    const caption = (value as { caption?: unknown }).caption
    return { id: (value as { id: string }).id, ...(typeof caption === 'string' && caption ? { caption } : {}) }
  }
  return undefined
}

/** The `media` column also keeps the place and the half-finished steps of this chat. */
function readMedia(raw: string): Pick<ChatSession, 'photos' | 'place' | 'draft' | 'job' | 'relay'> {
  try {
    const parsed = JSON.parse(raw || '[]')
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.photos) ? parsed.photos : []
    const photos = list.map(asPhoto).filter((photo: ChatPhoto | undefined): photo is ChatPhoto => Boolean(photo)).slice(0, 3)
    const kept = Array.isArray(parsed) ? {} : parsed || {}
    return {
      photos,
      ...(typeof kept.place === 'string' ? { place: kept.place } : {}),
      ...(kept.draft && typeof kept.draft.text === 'string' ? { draft: kept.draft } : {}),
      ...(kept.job && typeof kept.job.requestId === 'string' ? { job: kept.job } : {}),
      ...(kept.relay && typeof kept.relay.requestId === 'string' ? { relay: kept.relay } : {}),
    }
  } catch {
    return { photos: [] }
  }
}

function safeMediaId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
}

function mediaDir(): string {
  return join(process.cwd(), 'data', 'whatsapp-media')
}

function loadSession(senderKey: string, phone: string): ChatSession {
  const now = new Date().toISOString()
  const blank: ChatSession = {
    senderKey,
    phone,
    matches: [],
    asked: [],
    photos: [],
    lastInboundAt: now,
    persist: true,
  }
  try {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT * FROM whatsapp_chat_sessions WHERE sender_key = ? AND phone = ?`)
      .get(senderKey, phone) as
      | {
          requester_tenant_id?: string
          search?: string
          matches?: string
          asked?: string
          media?: string
          last_inbound_at?: string
        }
      | undefined
    if (!row) return blank
    const media = readMedia(row.media || '[]')
    let matches: StoredMatch[] = []
    let asked: AskedQuote[] = []
    try {
      matches = JSON.parse(row.matches || '[]')
    } catch {
      matches = []
    }
    try {
      asked = JSON.parse(row.asked || '[]')
    } catch {
      asked = []
    }
    return {
      ...blank,
      requesterTenantId: row.requester_tenant_id || undefined,
      search: row.search || undefined,
      matches: Array.isArray(matches) ? matches : [],
      asked: Array.isArray(asked) ? asked : [],
      ...media,
      lastInboundAt: row.last_inbound_at || now,
    }
  } catch (error) {
    if (String((error as Error).message || '').includes('no such table')) return { ...blank, persist: false }
    throw error
  }
}

function saveSession(session: ChatSession): void {
  if (!session.persist) return
  const now = new Date().toISOString()
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO whatsapp_chat_sessions
        (sender_key, phone, requester_tenant_id, search, matches, asked, media, last_inbound_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sender_key, phone) DO UPDATE SET
         requester_tenant_id = excluded.requester_tenant_id,
         search = excluded.search,
         matches = excluded.matches,
         asked = excluded.asked,
         media = excluded.media,
         last_inbound_at = excluded.last_inbound_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      session.senderKey,
      session.phone,
      session.requesterTenantId || null,
      session.search || null,
      JSON.stringify(session.matches),
      JSON.stringify(session.asked),
      JSON.stringify({
        photos: session.photos,
        ...(session.place ? { place: session.place } : {}),
        ...(session.draft ? { draft: session.draft } : {}),
        ...(session.job ? { job: session.job } : {}),
        ...(session.relay ? { relay: session.relay } : {}),
      }),
      session.lastInboundAt,
      now,
    )
}

function sessionByPhone(phone: string): ChatSession | undefined {
  try {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT sender_key, phone FROM whatsapp_chat_sessions WHERE phone = ? ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(phone) as { sender_key: string; phone: string } | undefined
    return row ? loadSession(row.sender_key, row.phone) : undefined
  } catch (error) {
    if (String((error as Error).message || '').includes('no such table')) return undefined
    throw error
  }
}

/**
 * The account for this number, or a guest record when there is none.
 * The guest row has no phone hash, so a later sign-up with that number is not refused.
 */
function requesterForPhone(phone: string): { tenantId: string; holderDid?: string } | undefined {
  const db = DatabaseManager.getDatabase()
  try {
    const hashes = phoneHashCandidates(normalizeContactPhone(phone))
    if (hashes.length) {
      const user = db
        .prepare(`SELECT tenant_id, did FROM ssi_users WHERE phone_hash IN (${hashes.map(() => '?').join(',')}) LIMIT 1`)
        .get(...hashes) as { tenant_id?: string; did?: string } | undefined
      if (user?.tenant_id) return { tenantId: user.tenant_id, holderDid: user.did }
    }
  } catch (error) {
    if (String((error as Error).message || '').includes('no such table')) return undefined
    throw error
  }
  const tenantId = `wa-${contactHash(normalizeContactPhone(phone)).slice(0, 32)}`
  const existing = db.prepare(`SELECT did FROM ssi_users WHERE tenant_id = ? LIMIT 1`).get(tenantId) as { did?: string } | undefined
  if (existing) return { tenantId, holderDid: existing.did }
  const now = new Date().toISOString()
  const did = `did:web:credentis.local:wa:${tenantId.slice(3, 15)}`
  db.prepare(`INSERT INTO ssi_users (id, tenant_id, did, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
    tenantId,
    tenantId,
    did,
    now,
    now,
  )
  return { tenantId, holderDid: did }
}

/** Move quote requests made before sign-up onto the new account. Leaves every other tenant alone. */
export function adoptWhatsAppGuest(phone: string, tenantId: string): void {
  if (!tenantId) return
  const digits = digitsOf(phone)
  if (!digits) return
  const db = DatabaseManager.getDatabase()
  const guests = db
    .prepare(
      `SELECT requester_tenant_id FROM whatsapp_chat_sessions
        WHERE phone = ? AND requester_tenant_id LIKE 'wa-%'`,
    )
    .all(digits) as Array<{ requester_tenant_id: string }>
  for (const guest of [...new Set(guests.map((row) => row.requester_tenant_id))]) {
    if (guest === tenantId) continue
    db.prepare(`UPDATE workflow_requests SET requester_tenant_id = ? WHERE requester_tenant_id = ?`).run(tenantId, guest)
    try {
      db.prepare(`UPDATE org_contacts SET wallet_tenant_id = ? WHERE wallet_tenant_id = ?`).run(tenantId, guest)
    } catch {
      /* contacts are not required for the request to move */
    }
    try {
      db.prepare(`UPDATE job_deposits SET author_tenant_id = ? WHERE author_tenant_id = ?`).run(tenantId, guest)
    } catch {
      /* a quote with no deposit yet has nothing here */
    }
  }
  db.prepare(
    `UPDATE whatsapp_chat_sessions SET requester_tenant_id = ?, updated_at = ?
      WHERE phone = ? AND requester_tenant_id LIKE 'wa-%'`,
  ).run(tenantId, new Date().toISOString(), digits)
}

function requestsForTenant(tenantId: string, limit: number) {
  const rows = DatabaseManager.getDatabase()
    .prepare(
      `SELECT target_org_tenant_id, request_type, status, payload FROM workflow_requests
        WHERE requester_tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(tenantId, limit) as Array<{ target_org_tenant_id: string; request_type: string; status: string; payload: string }>
  return rows.map((row) => {
    let payload: any = {}
    try {
      payload = JSON.parse(row.payload || '{}')
    } catch {
      payload = {}
    }
    const amount = Number(payload.totalAmount ?? payload.amount)
    const business = organizationRegistryRepository.findOrganizationByTenantId(row.target_org_tenant_id)?.displayName || 'the business'
    return {
      title: String(payload.title || '').trim() || 'Your request',
      business,
      status: row.status,
      ...(row.status === 'approved' && Number.isFinite(amount) && amount > 0
        ? { price: `${String(payload.currency || 'USD').toUpperCase()} ${amount}` }
        : {}),
    }
  })
}

/** The latest requests of the account whose phone sent the message. Empty when no account has it. */
export function latestRequestsForPhone(phone: string, limit = 3) {
  const db = DatabaseManager.getDatabase()
  const hashes = phoneHashCandidates(normalizeContactPhone(phone))
  let tenantId: string | undefined
  try {
    if (hashes.length) {
      const user = db
        .prepare(`SELECT tenant_id FROM ssi_users WHERE phone_hash IN (${hashes.map(() => '?').join(',')}) LIMIT 1`)
        .get(...hashes) as { tenant_id?: string } | undefined
      tenantId = user?.tenant_id
    }
  } catch (error) {
    if (!String((error as Error).message || '').includes('no such table')) throw error
  }
  if (!tenantId) tenantId = sessionByPhone(digitsOf(phone))?.requesterTenantId
  if (!tenantId) return []
  try {
    return requestsForTenant(tenantId, limit)
  } catch (error) {
    if (String((error as Error).message || '').includes('no such table')) return []
    throw error
  }
}

/**
 * The quotes asked in this chat, newest first, as a list to compare: a priced one pays when
 * tapped, the rest say where they stand. Words only when nothing was asked in this chat.
 */
function quotesReply(session: ChatSession, words: string): ChatReply {
  const rows: Array<{ id: string; title: string; description: string }> = []
  let priced = 0
  let waiting = 0
  for (const item of [...session.asked].reverse().slice(0, 10)) {
    let request: ReturnType<typeof workflowRequestRepository.findById>
    try {
      request = workflowRequestRepository.findById(item.requestId)
    } catch {
      continue
    }
    if (!request) continue
    const payload: any = request.payload && typeof request.payload === 'object' ? request.payload : {}
    const amount = Number(payload.totalAmount ?? payload.amount)
    if (request.status === 'approved' && Number.isFinite(amount) && amount > 0) {
      priced += 1
      rows.push({ id: `PAY ${item.n}`, title: item.name, description: `💵 ${money(amount, payload.currency)} · tap to pay` })
    } else if (request.status === 'pending') {
      waiting += 1
      rows.push({ id: `WAIT ${item.n}`, title: item.name, description: '⏳ Waiting for their price' })
    } else {
      rows.push({ id: `WAIT ${item.n}`, title: item.name, description: STATUS_WORDS[request.status] || 'In progress' })
    }
  }
  if (!rows.length) return { text: words, interactive: tapButtons(words, [NEW_SEARCH], { header: 'Your requests' }) }
  const lead = priced
    ? `💵 ${priced} price${priced === 1 ? '' : 's'} in${waiting ? ` · ⏳ ${waiting} waiting` : ''}\n\nTap a business to pay it. The payment goes straight to them.`
    : `⏳ ${waiting || rows.length} waiting\n\nBusinesses reply here as soon as they set a price.`
  return {
    text: words,
    interactive: pickList(`📋 *Your requests*\n\n${lead}`, priced ? 'Compare quotes' : 'See requests', rows, {
      section: 'Latest',
    }),
  }
}

function storeMatch(match: ProviderMatch): StoredMatch {
  return {
    orgId: match.orgId,
    tenantId: match.tenantId,
    name: match.name,
    quoteServiceId: match.quoteServiceId,
    serviceName: match.serviceName,
    reasons: match.reasons,
    unsure: match.unsure,
    standing: match.standing,
    offer: match.offer,
  }
}

function asMatch(stored: StoredMatch): ProviderMatch {
  return {
    orgId: stored.orgId,
    tenantId: stored.tenantId,
    name: stored.name,
    category: 'supplier',
    trustScore: 0,
    verificationStatus: 'unverified',
    standing: stored.standing || { configured: '', verified: '', live: '' },
    quoteServiceId: stored.quoteServiceId,
    serviceName: stored.serviceName,
    score: 0,
    reasons: stored.reasons || [],
    unsure: stored.unsure || [],
    offer: stored.offer,
    reviewAverage: null,
    reviewCount: 0,
  }
}

/**
 * The chat asks through the same quote request Discover uses.
 * Tests replace this; the real one loads the controller only when someone asks.
 */
export const whatsAppQuoteRequests = {
  async create(
    requester: { tenantId: string; holderDid?: string },
    matches: ProviderMatch[],
    body: { need: string; area?: string; payment?: string; details?: string; requesterName?: string },
    extra: Record<string, unknown>,
  ) {
    const { WorkflowRequestController } = await import('../controllers/contacts/WorkflowRequestController')
    return new WorkflowRequestController().askMatches(
      matches,
      { ...body, requesterName: body.requesterName?.trim() || 'WhatsApp customer' },
      { tenantId: requester.tenantId, holderDid: requester.holderDid } as any,
      extra,
    )
  },

  /** A business member's price from the chat, through the same accept the app uses (role checks included). */
  async answer(
    orgTenantId: string,
    actor: { userId: string; role: string },
    requestId: string,
    price: { amount: number; currency: string },
  ): Promise<void> {
    const { WorkflowRequestController } = await import('../controllers/contacts/WorkflowRequestController')
    await new WorkflowRequestController().approveRequest(requestId, { price }, {
      tenantId: orgTenantId,
      user: { id: actor.userId, orgRole: actor.role },
      headers: {},
    } as any)
  },
}

/**
 * Who at the business is answering this job from this phone: the number must be the one that
 * member chose for task alerts at that business, and their role must be one that may accept.
 */
function jobActor(
  requestId: string,
  from: string,
): { request: NonNullable<ReturnType<typeof workflowRequestRepository.findById>>; userId: string; role: string } | undefined {
  const request = workflowRequestRepository.findById(requestId)
  if (!request || request.requestType !== 'quote') return undefined
  let phone: string
  try {
    phone = normalizeNotificationPhone(from)
  } catch {
    return undefined
  }
  const recipient = notificationService.consentedRecipient(request.targetOrgTenantId, 'task', { phone })
  if (!recipient) return undefined
  const membership = DatabaseManager.getDatabase()
    .prepare(
      `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
    )
    .get(recipient.userId, request.targetOrgTenantId) as { role?: string } | undefined
  const role = String(membership?.role || '').trim().toLowerCase()
  if (!['owner', 'admin', 'manager', 'approver'].includes(role)) return undefined
  return { request, userId: recipient.userId, role }
}

/** "25", "$25", "USD 25.50", "25 usd". */
export function readAmount(text: string): number | undefined {
  const found = /^\s*(?:usd|us\$|\$)?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:usd|\$|dollars?)?\s*$/i.exec(text)
  if (!found) return undefined
  const amount = Number(found[1].replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function windowOpen(lastInboundAt: string): boolean {
  const age = Date.now() - new Date(lastInboundAt).getTime()
  return Number.isFinite(age) && age <= 24 * 60 * 60 * 1000
}

async function deliver(
  senderKey: string,
  to: string,
  reply: string | ChatReply,
  tenantId?: string,
): Promise<'sent' | 'held' | 'failed'> {
  const message = typeof reply === 'string' ? { text: reply } : reply
  try {
    let sent: Awaited<ReturnType<typeof whatsAppSenderService.sendSessionMessage>> | undefined
    if (message.interactive) {
      try {
        sent = await whatsAppSenderService.sendSessionInteractive(senderKey, to, message.interactive)
      } catch {
        logger.warn({ senderKey }, 'WhatsApp buttons were refused; sending the words instead')
      }
    }
    if (!sent) sent = await whatsAppSenderService.sendSessionMessage(senderKey, to, message.text)
    if (sent.status === 'sent' && sent.messageId && sent.phoneNumberId && tenantId) {
      try {
        notificationService.recordAcceptedWhatsApp({
          tenantId,
          to,
          eventType: 'whatsapp_chat',
          messageId: sent.messageId,
          senderKey,
          phoneNumberId: sent.phoneNumberId,
        })
      } catch {
        /* the reply was sent; a missing delivery row must not fail the chat */
      }
    }
    return sent.status
  } catch (error) {
    logger.warn({ senderKey }, 'WhatsApp chat reply failed')
    return 'failed'
  }
}

function money(amount: number, currency?: string): string {
  return `${String(currency || 'USD').toUpperCase()} ${amount}`
}

export class WhatsAppInquiryService {
  /**
   * Answer one inbound text, photo or location. The same message id is answered once.
   * Returns without sending when the words are a stop request.
   */
  async handle(input: {
    senderKey: string
    messageId: string
    from: string
    text: string
    name?: string
    imageId?: string
    location?: string
  }): Promise<{ status: string }> {
    const text = String(input.text || '').trim()
    if (!input.imageId && !input.location && /^(stop|unsubscribe|cancel)$/i.test(text)) return { status: 'ignored' }
    const phone = digitsOf(input.from)
    const need = (input.imageId ? 'photo' : input.location ? 'location' : text).replace(/\s+/g, ' ').slice(0, 200)
    const db = DatabaseManager.getDatabase()
    const { randomUUID } = await import('crypto')
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO whatsapp_inquiries
          (id, sender_key, message_id, phone, need, match_count, reply_status, created_at)
          VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
      )
      .run(randomUUID(), input.senderKey, input.messageId, phone.slice(0, 20), need, new Date().toISOString())
    if (!inserted.changes) return { status: 'duplicate' }

    const session = loadSession(input.senderKey, phone)
    session.lastInboundAt = new Date().toISOString()
    let body: string | ChatReply = ''
    let matchCount = 0

    if (input.imageId && !session.photos.some((photo) => photo.id === input.imageId)) {
      session.photos = [...session.photos, { id: input.imageId, ...(text ? { caption: text.slice(0, 200) } : {}) }].slice(-3)
      await this.keepPhoto(input.senderKey, input.imageId)
    }
    const command = readChatCommand(text)
    const jobTap = command.type === 'tap' && command.id.startsWith('JOB_') ? command : undefined
    if (jobTap) {
      body = await this.jobTap(session, input.from, jobTap.id, jobTap.arg || '')
    } else if (session.job && text && command.type !== 'greeting' && command.type !== 'status') {
      body = await this.jobAnswer(session, input.from, text)
    } else if (input.imageId && !text) {
      body = 'Photo received 📷 Say what you need and it goes with the request. For example: a plumber in Borrowdale.'
    } else if (input.location && !text) {
      session.place = input.location.slice(0, 120)
      if (session.draft?.stage === 'place') {
        session.draft.area = session.place
        body = this.draftNext(session)
        matchCount = session.matches.length
      } else {
        body = `📍 Got the place${session.place ? `: ${session.place}` : ''}. Now say what you need. For example: a plumber.`
      }
    } else if (session.relay && command.type === 'search') {
      body = await this.relayAnswer(session, text, input.name)
    } else if (session.draft?.stage === 'place' && command.type === 'search') {
      session.draft.area = text.slice(0, 120)
      session.place = session.draft.area
      body = this.draftNext(session)
      matchCount = session.matches.length
    } else if (command.type === 'greeting') {
      session.draft = undefined
      body = welcomeReply(input.name)
    } else if (command.type === 'status') {
      body = quotesReply(session, statusReply(latestRequestsForPhone(input.from)))
    } else if (command.type === 'pay') {
      body = await this.payFromChat(session, command.n)
    } else if (command.type === 'dispute') {
      body = await this.disputeFromChat(session, command.n, command.reason)
    } else if (command.type === 'ask') {
      body = (await this.askFromChat(session, input.from, session.search || '', command.picks, input.name)).text
      matchCount = session.matches.length
    } else if (command.type === 'tap') {
      body = await this.customerTap(session, input.from, command.id, command.arg, input.name)
      matchCount = session.matches.length
    } else {
      const asked = readRequest(text)
      if (asked.need.length < 2) {
        body = startReply()
      } else {
        const category = categoryFor(text)
        session.draft = {
          text: text.slice(0, 200),
          need: asked.need,
          area: asked.area || session.place,
          payment: asked.payment,
          label: category.label,
          emoji: category.emoji,
          stage: 'category',
        }
        this.findFor(session)
        matchCount = session.matches.length
        if (!session.matches.length) {
          body = noMatchReply(describeRequest({ ...asked, area: session.draft.area }) || text)
          session.draft = undefined
        } else {
          if (!category.id) {
            const named = categoryFor('', session.matches[0].serviceName)
            session.draft.label = named.label
            session.draft.emoji = named.emoji
          }
          body = categoryReply(session.draft, session.matches.map((match) => match.name))
        }
      }
    }

    saveSession(session)
    const replyStatus = await deliver(input.senderKey, input.from, body, session.requesterTenantId)
    db.prepare(`UPDATE whatsapp_inquiries SET match_count = ?, reply_status = ? WHERE sender_key = ? AND message_id = ?`).run(
      matchCount,
      replyStatus,
      input.senderKey,
      input.messageId,
    )
    return { status: replyStatus }
  }

  /** A business answered a request that was asked in this chat. Every other request is ignored. */
  async requestAnswered(requestId: string): Promise<void> {
    const request = workflowRequestRepository.findById(requestId)
    const payload = request?.payload && typeof request.payload === 'object' ? request.payload : {}
    if (!request || payload.channel !== 'whatsapp') return
    const phone = digitsOf(String(payload.customerMsisdn || ''))
    if (!phone) return
    const session = sessionByPhone(phone)
    if (!session) return
    const age = Date.now() - new Date(session.lastInboundAt).getTime()
    if (Number.isFinite(age) && age > 24 * 60 * 60 * 1000) return
    const business = organizationRegistryRepository.findOrganizationByTenantId(request.targetOrgTenantId)?.displayName || 'The business'
    const title = String(payload.title || 'your request')
    const amount = Number(payload.totalAmount ?? payload.amount)
    const priced = Number.isFinite(amount) && amount > 0 ? money(amount, payload.currency) : ''
    const number = session.asked.find((item) => item.requestId === request.id)?.n
    let text = ''
    if (request.status === 'approved' && priced) {
      await deliver(session.senderKey, phone, quoteReply(business, priced, title, number), request.targetOrgTenantId)
      return
    }
    if (request.status === 'approved') text = `${business} accepted ${title}. They have not set a price yet.`
    else if (request.status === 'rejected') text = `${business} declined ${title}.`
    else if (request.status === 'fulfilled') text = `${business} marked ${title} done.`
    else if (request.status === 'cancelled') text = `${business} cancelled ${title}.`
    else return
    const next = request.status === 'rejected' || request.status === 'cancelled' ? [NEW_SEARCH, MY_REQUESTS] : [MY_REQUESTS]
    await deliver(session.senderKey, phone, { text, interactive: tapButtons(text, next) }, request.targetOrgTenantId)
  }

  /** A pin the person dropped in the chat. The next request uses it as the place. */
  handleLocation(input: {
    senderKey: string
    messageId: string
    from: string
    location: { name?: string; address?: string; latitude?: number; longitude?: number }
  }): Promise<{ status: string }> {
    const named = [input.location.name, input.location.address].filter(Boolean).join(', ')
    const pin =
      input.location.latitude != null && input.location.longitude != null
        ? `${input.location.latitude}, ${input.location.longitude}`
        : ''
    return this.handle({ ...input, text: '', location: named || pin || 'the pin you sent' })
  }

  /** A photo or file. A caption is read as the request, and the file goes with it. */
  handleMedia(input: {
    senderKey: string
    messageId: string
    from: string
    media: { id: string; mimeType?: string; caption?: string }
  }): Promise<{ status: string }> {
    return this.handle({
      senderKey: input.senderKey,
      messageId: input.messageId,
      from: input.from,
      text: input.media.caption || '',
      imageId: input.media.id,
    })
  }

  /** Businesses for the draft; a place that matches no one falls back to the whole list. */
  private findFor(session: ChatSession): void {
    const draft = session.draft
    if (!draft) return
    const look = (area?: string) =>
      orgOfferingsService.match({ need: draft.need, area, payment: draft.payment, limit: 3 })
    let matches = look(draft.area)
    if (!matches.length && draft.area) matches = look(undefined)
    session.search = draft.text
    session.matches = matches.map(storeMatch)
  }

  /** After the category is right: ask for the place if there is none, then show the summary. */
  private draftNext(session: ChatSession): ChatReply {
    const draft = session.draft
    if (!draft) return startReply()
    this.findFor(session)
    if (!session.matches.length) {
      session.draft = undefined
      return noMatchReply(draft.label)
    }
    if (!draft.area) {
      draft.stage = 'place'
      return placeReply()
    }
    draft.stage = 'confirm'
    return summaryReply(
      draft,
      session.matches.map((match) => match.name),
      session.photos.length,
    )
  }

  private async customerTap(
    session: ChatSession,
    from: string,
    id: string,
    arg: string | undefined,
    name?: string,
  ): Promise<string | ChatReply> {
    if (id === 'SERVICE') return startReply()
    if (id === 'PROVIDER') return providerReply()
    if (id === 'DRAFT_PICK') return pickCategoryReply()
    if (id === 'DRAFT_YES') return session.draft ? this.draftNext(session) : startReply()
    if (id === 'CAT') {
      const category = CATEGORIES.find((entry) => entry.id === String(arg || '').toLowerCase())
      if (!category) return startReply()
      session.draft = session.draft
        ? { ...session.draft, need: category.id, label: category.label, emoji: category.emoji }
        : { text: category.label, need: category.id, area: session.place, label: category.label, emoji: category.emoji, stage: 'category' }
      return this.draftNext(session)
    }
    if (id === 'DRAFT_SEND') {
      const draft = session.draft
      if (!draft || draft.stage !== 'confirm' || !session.matches.length) return startReply()
      const result = await this.askFromChat(session, from, draft.text, [], name, draft)
      if (!result.names.length) return result.text
      session.draft = undefined
      return sentReply(result.names, result.already)
    }
    if (id === 'DRAFT_CANCEL') {
      session.draft = undefined
      return {
        text: 'Cancelled. Nothing was sent. Say what you need whenever you are ready.',
        interactive: tapButtons('❌ Cancelled. Nothing was sent.\n\nWhenever you are ready, just say what you need.', [
          { id: 'SERVICE', title: 'New request' },
          MY_REQUESTS,
        ]),
      }
    }
    if (id === 'WAIT') {
      const item = session.asked.find((asked) => asked.n === Number(arg))
      if (!item) return quotesReply(session, statusReply(latestRequestsForPhone(from)))
      return {
        text: `Still waiting for ${item.name}. Their price will arrive here.`,
        interactive: tapButtons(
          `⏳ Still waiting for *${item.name}*.\n\nTheir price will arrive here as soon as they reply.`,
          [MY_REQUESTS],
        ),
      }
    }
    return startReply()
  }

  /** A business tapped Send quote, Ask a question or Skip on a job card. */
  private async jobTap(session: ChatSession, from: string, id: string, requestId: string): Promise<string | ChatReply> {
    const actor = jobActor(requestId, from)
    if (!actor) {
      return 'This job is not linked to this number. Turn on task alerts for this number in Credentis, then try again.'
    }
    const title = String(actor.request.payload?.title || 'this job')
    if (actor.request.status !== 'pending') {
      session.job = undefined
      return `This job was already answered (${STATUS_WORDS[actor.request.status] || actor.request.status}).`
    }
    const skip = { id: `JOB_SKIP:${requestId}`, title: 'Skip' }
    if (id === 'JOB_SKIP') {
      session.job = undefined
      return '👍 No problem, skipped. The request stays in your Credentis inbox if you change your mind.'
    }
    if (id === 'JOB_ASK') {
      session.job = { requestId, kind: 'ask' }
      return {
        text: 'What would you like to ask the customer? Type your question.',
        interactive: tapButtons('💬 What would you like to ask the customer?\n\nType your question and I will pass it on.', [skip]),
      }
    }
    session.job = { requestId, kind: 'quote' }
    const currency = String(actor.request.payload?.currency || 'USD').toUpperCase()
    return {
      text: `How much would you charge for ${title}? Type the amount in ${currency}, for example 25.`,
      interactive: tapButtons(
        `💵 How much would you charge for *${title}*?\n\nType the amount in ${currency}. For example: *25*`,
        [skip],
      ),
    }
  }

  /** The business's next message after Send quote (a price) or Ask a question (the question). */
  private async jobAnswer(session: ChatSession, from: string, text: string): Promise<string | ChatReply> {
    const job = session.job!
    const actor = jobActor(job.requestId, from)
    if (!actor || actor.request.status !== 'pending') {
      session.job = undefined
      return 'This job is no longer waiting for an answer.'
    }
    const business =
      organizationRegistryRepository.findOrganizationByTenantId(actor.request.targetOrgTenantId)?.displayName || 'The business'
    const skip = { id: `JOB_SKIP:${job.requestId}`, title: 'Skip' }
    if (job.kind === 'quote') {
      const amount = readAmount(text)
      if (!amount) {
        return {
          text: 'Type just the amount, for example 25.',
          interactive: tapButtons('Type just the amount, for example *25*.', [skip]),
        }
      }
      const currency = String(actor.request.payload?.currency || 'USD').toUpperCase()
      try {
        await whatsAppQuoteRequests.answer(
          actor.request.targetOrgTenantId,
          { userId: actor.userId, role: actor.role },
          job.requestId,
          { amount, currency },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        return message || 'The quote could not be sent. Open the job in Credentis.'
      }
      session.job = undefined
      return `Quote sent! *${money(amount, currency)}* ✅\n\nI'll tell you here as soon as the customer pays.`
    }
    const customer = digitsOf(String(actor.request.payload?.customerMsisdn || ''))
    const chat = customer ? sessionByPhone(customer) : undefined
    session.job = undefined
    if (!chat || !windowOpen(chat.lastInboundAt)) {
      return 'The customer has not written in the last day, so the question cannot reach them here. Send a quote, or open the job in Credentis.'
    }
    const question = clip(text, 600)
    const sent = await deliver(
      chat.senderKey,
      chat.phone,
      {
        text: `${business} asks: ${question} Reply here and the answer goes to them.`,
        interactive: tapButtons(
          `💬 *${business}* has a question about your request:\n\n_${question}_\n\nJust reply here and I'll pass it on.`,
          [MY_REQUESTS],
        ),
      },
      actor.request.targetOrgTenantId,
    )
    if (sent !== 'sent') return 'The question could not be sent just now. Try again in a minute.'
    chat.relay = { requestId: job.requestId, to: session.phone, senderKey: session.senderKey, business }
    saveSession(chat)
    return {
      text: 'Sent to the customer. Their answer will come here.',
      interactive: tapButtons('✅ Sent to the customer. Their answer will come here.', [
        { id: `JOB_QUOTE:${job.requestId}`, title: 'Send quote' },
        skip,
      ]),
    }
  }

  /** The customer's answer to a business's question goes back to that business. */
  private async relayAnswer(session: ChatSession, text: string, name?: string): Promise<string | ChatReply> {
    const relay = session.relay!
    session.relay = undefined
    const business = loadSession(relay.senderKey, relay.to)
    const request = workflowRequestRepository.findById(relay.requestId)
    if (!request || request.status !== 'pending' || !windowOpen(business.lastInboundAt)) {
      return `${relay.business} cannot be reached in this chat right now. Their price will still arrive here.`
    }
    const who = firstName(name) || String(request.payload?.clientName || 'The customer')
    const answer = clip(text, 600)
    const sent = await deliver(
      relay.senderKey,
      relay.to,
      {
        text: `${who} answered: ${answer}`,
        interactive: tapButtons(`💬 *${who}* answered:\n\n_${answer}_`, [
          { id: `JOB_QUOTE:${relay.requestId}`, title: 'Send quote' },
          { id: `JOB_SKIP:${relay.requestId}`, title: 'Skip' },
        ]),
      },
      request.targetOrgTenantId,
    )
    if (sent !== 'sent') return `Your answer could not reach ${relay.business} just now.`
    return `✅ Passed on to *${relay.business}*. Their price will arrive here.`
  }

  private async askFromChat(
    session: ChatSession,
    from: string,
    need: string,
    picks: number[],
    name?: string,
    draft?: ChatDraft,
  ): Promise<{ text: string; names: string[]; already: string[] }> {
    const fail = (text: string) => ({ text, names: [] as string[], already: [] as string[] })
    const chosen = picks.length
      ? session.matches.filter((_, index) => picks.includes(index + 1))
      : session.matches.slice(0, 3)
    if (!chosen.length) return fail('Say what you need first, for example: a plumber in Borrowdale.')
    const fresh = chosen.filter(
      (match) => !session.asked.some((item) => item.tenantId === match.tenantId && item.need === need),
    )
    const already = chosen.filter((match) => !fresh.includes(match)).map((match) => match.name)
    if (!fresh.length) return fail(`Already asked ${already.join(', ')}. Reply STATUS to see their prices.`)
    const requester = session.requesterTenantId
      ? { tenantId: session.requesterTenantId }
      : requesterForPhone(from)
    if (!requester) return fail('Those businesses could not be asked just yet. Reply ASK to try again.')
    session.requesterTenantId = requester.tenantId
    const heard = readRequest(need)
    const photoLine = session.photos.length
      ? `They sent ${session.photos.length} photo${session.photos.length === 1 ? '' : 's'} in the chat.`
      : ''
    const said = draft && draft.text.toLowerCase() !== draft.label.toLowerCase() ? draft.text : ''
    const details = [said, photoLine].filter(Boolean).join('\n')
    let result: { asked: Array<{ requestId: string; tenantId: string; name: string }>; skipped: Array<{ name: string }> }
    try {
      result = await whatsAppQuoteRequests.create(
        requester,
        fresh.map(asMatch),
        {
          need: draft?.label && draft.label !== 'Service' ? draft.label : heard.need || need,
          area: draft?.area || heard.area || session.place,
          payment: draft?.payment || heard.payment,
          ...(details ? { details } : {}),
          ...(name?.trim() ? { requesterName: name.trim().slice(0, 80) } : {}),
        },
        {
          channel: 'whatsapp',
          customerMsisdn: `+${digitsOf(from)}`,
          ...(session.photos.length
            ? { whatsappMedia: session.photos.map((photo) => ({ id: photo.id, ...(photo.caption ? { caption: photo.caption } : {}) })) }
            : {}),
        },
      )
    } catch (error) {
      logger.warn({ senderKey: session.senderKey }, 'WhatsApp quote ask failed')
      return fail('Those businesses could not be asked just yet. Reply ASK to try again.')
    }
    let next = session.asked.reduce((max, item) => Math.max(max, item.n), 0)
    for (const asked of result.asked) {
      next += 1
      session.asked.push({ n: next, requestId: asked.requestId, tenantId: asked.tenantId, name: asked.name, need })
    }
    const names = result.asked.map((item) => item.name)
    if (!names.length) return fail('Those businesses could not be asked just yet. Reply ASK to try again.')
    const askedLine = `Asked ${names.join(', ')} for a quote. They'll reply here with a price.`
    return { text: already.length ? `${askedLine} Already asked ${already.join(', ')}.` : askedLine, names, already }
  }

  private async payFromChat(session: ChatSession, n: number): Promise<string | ChatReply> {
    const item = session.asked.find((asked) => asked.n === n)
    if (!item || !session.requesterTenantId) return 'Reply PAY and the number from the list, for example PAY 1.'
    try {
      const view = jobDepositService.open(item.requestId, session.requesterTenantId)
      const amount = view.amount ? money(view.amount, view.currency) : 'the price they set'
      const link = view.payUrl ? ` Pay them here: ${view.payUrl}` : ''
      const text = `${item.name}: ${amount}.${link} The payment goes to them. Credentis does not hold it.`
      if (!view.payUrl || !/^https:\/\//.test(view.payUrl)) return text
      return {
        text,
        interactive: linkButton(
          `💳 *${item.name}*\n💵 ${amount}\n\nTap below to pay them. The payment goes straight to them. Credentis does not hold it.`,
          view.amount ? `Pay ${amount}` : 'Pay now',
          view.payUrl,
          { header: 'Pay the business', footer: `Not done? Reply NOT DONE ${n} and why` },
        ),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return message || `${item.name} cannot be paid yet.`
    }
  }

  private async disputeFromChat(session: ChatSession, n: number, reason: string): Promise<string> {
    const item = session.asked.find((asked) => asked.n === n)
    if (!item || !session.requesterTenantId) return 'Reply NOT DONE, the number, and what was not done.'
    try {
      jobDepositService.dispute(item.requestId, session.requesterTenantId, reason)
      return `${item.name} has been told the work was not done. They cannot mark it done until this is settled.`
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return message || 'That could not be recorded.'
    }
  }

  /** Requests made before this number had an account follow the account. */
  claimGuest(phone: string, tenantId: string): void {
    adoptWhatsAppGuest(phone, tenantId)
  }

  /**
   * The photo sent with this request. Only the person who asked, or someone who works
   * at the business, can open it. Anyone else, and any other request, gets nothing.
   */
  photoFor(
    requestId: string,
    photoId: string,
    caller: { tenantId?: string; isMember: (orgTenantId: string) => boolean },
  ): { data: Buffer; mimeType: string } | undefined {
    const request = workflowRequestRepository.findById(requestId)
    const payload = request?.payload && typeof request.payload === 'object' ? request.payload : {}
    const media = Array.isArray(payload.whatsappMedia) ? payload.whatsappMedia : []
    const listed = media.some((photo: { id?: unknown }) => photo?.id === photoId)
    if (!request || !listed) return undefined
    const allowed = caller.tenantId === request.requesterTenantId || caller.isMember(request.targetOrgTenantId)
    if (!allowed) return undefined
    const safe = safeMediaId(photoId)
    const path = join(mediaDir(), safe)
    if (!safe || !existsSync(path)) return undefined
    let mimeType = 'image/jpeg'
    try {
      const saved = readFileSync(`${path}.type`, 'utf8').trim()
      if (saved) mimeType = saved
    } catch {
      /* the bytes are still the photo */
    }
    return { data: readFileSync(path), mimeType }
  }

  /** A deposit paid from this chat is confirmed in the chat. Other payments are ignored. */
  async linkPaid(linkId: string, reference: string): Promise<void> {
    let row: { request_id: string; amount: number; currency: string } | undefined
    try {
      row = DatabaseManager.getDatabase()
        .prepare(`SELECT request_id, amount, currency FROM job_deposits WHERE payment_link_id = ?`)
        .get(linkId) as { request_id: string; amount: number; currency: string } | undefined
    } catch {
      return
    }
    if (!row) return
    const request = workflowRequestRepository.findById(row.request_id)
    const payload = request?.payload && typeof request.payload === 'object' ? request.payload : {}
    if (!request || payload.channel !== 'whatsapp') return
    const phone = digitsOf(String(payload.customerMsisdn || ''))
    const session = phone ? sessionByPhone(phone) : undefined
    if (!session) return
    const age = Date.now() - new Date(session.lastInboundAt).getTime()
    if (Number.isFinite(age) && age > 24 * 60 * 60 * 1000) return
    const business = organizationRegistryRepository.findOrganizationByTenantId(request.targetOrgTenantId)?.displayName || 'The business'
    const number = session.asked.find((item) => item.requestId === request.id)?.n
    const follow = number ? ` Reply NOT DONE ${number} and what was not done, if the work was not done.` : ''
    const paid = money(Number(row.amount), row.currency)
    const text = `${business} received your payment of ${paid}. Reference ${reference}.${follow}`
    await deliver(
      session.senderKey,
      phone,
      {
        text,
        interactive: tapButtons(
          `🎉 *${business}* received your payment.\n\n💵 *${paid}*\n🧾 Reference ${reference}\n\nThey will be in touch about the job.${follow ? `\n\nNot done? Reply NOT DONE ${number} and what was not done.` : ''}`,
          [MY_REQUESTS],
          { header: 'Payment received' },
        ),
      },
      request.targetOrgTenantId,
    )
    await this.tellBusinessPaid(request, paid, reference, session.senderKey)
  }

  /**
   * The member who quoted hears it in the chat, when they answered from this chat in the
   * last day. Otherwise the app and their alerts carry it.
   */
  private async tellBusinessPaid(
    request: NonNullable<ReturnType<typeof workflowRequestRepository.findById>>,
    paid: string,
    reference: string,
    senderKey: string,
  ): Promise<void> {
    if (!request.approverId) return
    const recipient = notificationService.consentedRecipient(request.targetOrgTenantId, 'task', {
      userId: request.approverId,
    })
    const phone = recipient ? digitsOf(recipient.phone) : ''
    if (!phone) return
    const chat = loadSession(senderKey, phone)
    if (!chat.persist || !windowOpen(chat.lastInboundAt)) return
    const exists = DatabaseManager.getDatabase()
      .prepare(`SELECT 1 FROM whatsapp_chat_sessions WHERE sender_key = ? AND phone = ?`)
      .get(senderKey, phone)
    if (!exists) return
    const who = String(request.payload?.clientName || request.payload?.requesterName || 'The customer')
    const title = String(request.payload?.title || 'the job')
    await deliver(
      senderKey,
      phone,
      `🎉 *${who} accepted your quote!*\n\n💵 *${paid}* paid for ${title}\n🧾 Reference ${reference}\n\nThe job is yours. The payment went to your business; Credentis does not hold it.`,
      request.targetOrgTenantId,
    )
  }

  /** Keep the photo the person sent, when WhatsApp will still hand it over. The chat reply never depends on this. */
  private async keepPhoto(senderKey: string, imageId: string): Promise<void> {
    try {
      const file = await whatsAppSenderService.downloadMedia(senderKey, imageId)
      if (!file) return
      const safe = safeMediaId(imageId)
      if (!safe) return
      const dir = mediaDir()
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, safe), file.data)
      writeFileSync(join(dir, `${safe}.type`), String(file.mimeType || 'image/jpeg').slice(0, 80))
    } catch {
      /* the business still sees that a photo was sent */
    }
  }
}

export const whatsAppInquiryService = new WhatsAppInquiryService()

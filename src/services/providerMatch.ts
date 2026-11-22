/**
 * Decides which listed businesses can take a request, and why.
 *
 * A business that has not filled in an area, a payment method or a way of doing
 * the work is still eligible: those facts are missing, not a refusal. A business
 * that has filled them in and does not match is left out. A suspended business
 * is left out before this runs, and one that says it is not taking new work is left out here.
 * Finished work and ratings only change the order of businesses that already fit.
 */

import { PRODUCT_NAME } from '../config/productEdition'

export const FULFILMENT_OPTIONS = ['call_out', 'delivery', 'collection'] as const
export type FulfilmentOption = (typeof FULFILMENT_OPTIONS)[number]

export const FULFILMENT_LABELS: Record<FulfilmentOption, string> = {
  call_out: 'Comes to you',
  delivery: 'Delivers',
  collection: 'You collect',
}

export interface ProviderReach {
  serviceAreas: string[]
  hours?: string
  fulfilment: FulfilmentOption[]
  /**
   * How this business tells customers it gets paid.
   * Absent means it has not said, and matching falls back to the methods already on its account.
   */
  paymentMethods?: string[]
  /** False while the business has said it is not taking new work. Absent means it is. */
  acceptingWork?: boolean
}

const PAYMENT_METHODS = ['ecocash', 'innbucks', 'bank', 'card', 'cash'] as const

export interface MatchNeed {
  /** What the customer asked for, in their words. */
  need?: string
  /** Suburb or city. */
  area?: string
  /** A payment method the customer wants to use, such as ecocash. */
  payment?: string
  fulfilment?: FulfilmentOption
}

export interface MatchCandidate {
  name: string
  description?: string
  category?: string
  subCategory?: string
  trustScore: number
  verified: boolean
  reach: ProviderReach
  paymentRails: string[]
  services: Array<{ id: string; name: string; description?: string; offeringKey?: string }>
  /** What this business has already done on Credentis. Counts only; ranks, never admits. */
  track?: { finished: number; reviewAverage: number | null; reviewCount: number }
}

export interface MatchVerdict {
  eligible: boolean
  score: number
  /** Why this business was kept, in plain words. */
  reasons: string[]
  /** Facts the business has not given. It is still offered. */
  unsure: string[]
  serviceId?: string
  serviceName?: string
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'need', 'want', 'please', 'from', 'near',
  'job', 'service', 'quote', 'price', 'cost', 'help', 'some', 'your', 'you',
  'in', 'on', 'at', 'to', 'of', 'my', 'me', 'is', 'it', 'an', 'or', 'by', 'can', 'who',
  'what', 'where', 'when', 'how', 'do', 'does', 'we', 'our', 'they', 'them',
])

/** "a plumber in Borrowdale" is a trade plus a place. The place is only the words after the last "in". */
export function splitPlace(text: string): { need: string; area?: string } {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const match = cleaned.match(/^(.*)\s+in\s+([A-Za-z][A-Za-z .'-]{1,40})$/i)
  if (!match) return { need: cleaned }
  const need = match[1].trim()
  const area = match[2].trim().replace(/[.,]$/, '')
  if (need.length < 2 || area.length < 2) return { need: cleaned }
  return { need, area }
}

export interface ReadRequest extends MatchNeed {
  need: string
  /** "20 bags", when the sentence says how many. */
  quantity?: string
  /** "tomorrow", "this week", in the person's words. */
  when?: string
}

const PAYMENT_WORDS: Array<[RegExp, string]> = [
  [/\beco\s?cash\b/i, 'ecocash'],
  [/\binn\s?bucks\b/i, 'innbucks'],
  [/\bbank(\s+transfer)?\b/i, 'bank'],
  [/\b(card|visa|mastercard)\b/i, 'card'],
  [/\bcash\b/i, 'cash'],
]
const FULFILMENT_WORDS: Array<[RegExp, FulfilmentOption]> = [
  [/\b(deliver(ed|y|s)?)\b/i, 'delivery'],
  [/\b(collect(ion)?|pick\s?up|pickup)\b/i, 'collection'],
  [/\b(come\s+to\s+(me|us|my\s+\w+)|call[\s-]?out|visit)\b/i, 'call_out'],
]
const WHEN_WORDS =
  /\b(today|tonight|tomorrow|this\s+week(end)?|next\s+week|asap|urgently|on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i
const QUANTITY =
  /\b(\d+(?:[.,]\d+)?)\s*(bags?|litres?|liters?|tonnes?|tons?|units?|pieces?|boxes?|loads?|sheets?|metres?|meters?|kg)\b(\s+of)?/i

/**
 * Reads one sentence such as "I need 20 bags of cement delivered to Borrowdale tomorrow,
 * I can pay with EcoCash" into the trade, the place, how to pay, how it is done, when and how many.
 * Anything it does not recognise stays in the need, so nothing the person said is dropped.
 */
export function readRequest(text: string): ReadRequest {
  let rest = ` ${String(text || '').replace(/\s+/g, ' ').trim()} `
  const found: Omit<ReadRequest, 'need'> = {}
  for (const [pattern, method] of PAYMENT_WORDS) {
    const hit = rest.match(new RegExp(`(?:\\b(?:i\\s+(?:can|will)\\s+)?pay(?:ing)?\\s+(?:using|with|by|via|in)?\\s*)?${pattern.source}`, 'i'))
    if (hit) {
      found.payment = method
      rest = rest.replace(hit[0], ' ')
      break
    }
  }
  for (const [pattern, option] of FULFILMENT_WORDS) {
    const hit = rest.match(pattern)
    if (hit) {
      found.fulfilment = option
      rest = rest.replace(hit[0], ' ')
      break
    }
  }
  const when = rest.match(WHEN_WORDS)
  if (when) {
    found.when = when[0].toLowerCase()
    rest = rest.replace(when[0], ' ')
  }
  const quantity = rest.match(QUANTITY)
  if (quantity) {
    found.quantity = `${quantity[1]} ${quantity[2].toLowerCase()}`
    rest = rest.replace(quantity[0], ' ')
  }
  rest = rest
    .replace(/^\s*(hi|hello|please)[,!.]?\s+/i, ' ')
    .replace(/^\s*(i\s+(need|want|am\s+looking\s+for)|looking\s+for|need|want)\s+(an?\s+)?/i, ' ')
    .replace(/[.,;!]+/g, ' ')
    .replace(/\s+(and|i)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const place = rest.match(/^(.*?)\s+(?:in|to|at)\s+([A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+)?)\s*$/i)
  if (place && place[1].trim().length >= 2) {
    return { need: place[1].trim(), area: place[2].trim(), ...found }
  }
  return { ...splitPlace(rest || String(text || '').trim()), ...found }
}

/** "cement · 20 bags · Borrowdale · Delivers · tomorrow · EcoCash", for a reply. */
export function describeRequest(request: ReadRequest): string {
  const payment: Record<string, string> = { ecocash: 'EcoCash', innbucks: 'InnBucks', bank: 'Bank transfer', card: 'Card', cash: 'Cash' }
  return [
    request.need,
    request.quantity,
    request.area,
    request.fulfilment ? FULFILMENT_LABELS[request.fulfilment] : undefined,
    request.when,
    request.payment ? payment[request.payment] : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function readReach(metadata: Record<string, unknown> | undefined): ProviderReach {
  const reach = metadata && typeof metadata.reach === 'object' && metadata.reach ? (metadata.reach as Record<string, unknown>) : {}
  return cleanReach({ ...reach, paymentMethods: reach.paymentMethods })
}

/** Keeps only areas, hours and ways of doing the work that are safe to store and show. */
export function cleanReach(input: {
  serviceAreas?: unknown
  hours?: unknown
  fulfilment?: unknown
  paymentMethods?: unknown
  acceptingWork?: unknown
}): ProviderReach {
  const rawAreas = Array.isArray(input.serviceAreas) ? input.serviceAreas : []
  const serviceAreas: string[] = []
  for (const value of rawAreas) {
    const area = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
    if (area.length < 2 || serviceAreas.some((have) => have.toLowerCase() === area.toLowerCase())) continue
    serviceAreas.push(area)
    if (serviceAreas.length >= 12) break
  }
  const hours = String(input.hours ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const fulfilment: FulfilmentOption[] = []
  for (const value of Array.isArray(input.fulfilment) ? input.fulfilment : []) {
    const option = String(value ?? '').trim() as FulfilmentOption
    if (FULFILMENT_OPTIONS.includes(option) && !fulfilment.includes(option)) fulfilment.push(option)
  }
  let paymentMethods: string[] | undefined
  if (Array.isArray(input.paymentMethods)) {
    paymentMethods = []
    for (const value of input.paymentMethods) {
      const method = String(value ?? '').trim().toLowerCase()
      if (PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number]) && !paymentMethods.includes(method)) {
        paymentMethods.push(method)
      }
    }
  }
  return {
    serviceAreas,
    ...(hours ? { hours } : {}),
    fulfilment,
    ...(paymentMethods ? { paymentMethods } : {}),
    ...(input.acceptingWork === false ? { acceptingWork: false } : {}),
  }
}

function words(need: string): string[] {
  const seen = new Set<string>()
  for (const word of need.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue
    seen.add(word)
  }
  return Array.from(seen)
}

/** "plumber" also matches "plumbing", and "leaks" matches "leak". */
function forms(word: string): string[] {
  const found = [word]
  if (word.endsWith('er') && word.length > 4) found.push(word.slice(0, -2))
  if (word.endsWith('ing') && word.length > 5) found.push(word.slice(0, -3))
  if (word.endsWith('s') && word.length > 3) found.push(word.slice(0, -1))
  return found.filter((form) => form.length >= 4)
}

function hits(haystack: string, needles: string[]): number {
  const text = haystack.toLowerCase()
  return needles.filter((word) => forms(word).some((form) => text.includes(form)) || text.includes(word)).length
}

const PAYMENT_LABELS: Record<string, string> = {
  ecocash: 'EcoCash',
  innbucks: 'InnBucks',
  bank: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
}

function paymentHits(rails: string[], payment: string): boolean {
  const want = payment.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!want) return false
  return rails.some((rail) => {
    const have = rail.toLowerCase().replace(/[^a-z0-9]/g, '')
    return have.length > 0 && (have.includes(want) || want.includes(have))
  })
}

function areaHit(areas: string[], area: string): string | undefined {
  const want = area.toLowerCase().trim()
  if (want.length < 2) return undefined
  return areas.find((item) => {
    const have = item.toLowerCase().trim()
    return have === want || have.includes(want) || want.includes(have)
  })
}

export function judgeProvider(candidate: MatchCandidate, request: MatchNeed): MatchVerdict {
  const reasons: string[] = []
  const unsure: string[] = []
  if (candidate.reach.acceptingWork === false) {
    return { eligible: false, score: 0, reasons: [], unsure: [], serviceId: undefined, serviceName: undefined }
  }
  let score = Math.max(0, Math.min(5, Number(candidate.trustScore) || 0))
  const needles = words(request.need || '')

  let serviceId: string | undefined
  let serviceName: string | undefined
  if (needles.length > 0) {
    let best = 0
    for (const service of candidate.services) {
      const count = hits(`${service.name} ${service.description || ''} ${service.offeringKey || ''}`, needles)
      if (count > best) {
        best = count
        serviceId = service.id
        serviceName = service.name
      }
    }
    const described = hits(
      `${candidate.name} ${candidate.description || ''} ${candidate.category || ''} ${candidate.subCategory || ''}`,
      needles,
    )
    if (best === 0 && described === 0) {
      return { eligible: false, score: 0, reasons: [], unsure: [], serviceId: undefined, serviceName: undefined }
    }
    if (best > 0 && serviceName) {
      score += 3
      reasons.push(`Offers ${serviceName}`)
    } else {
      score += 1
      reasons.push('Says they do this')
    }
  }

  const area = (request.area || '').trim()
  if (area) {
    if (candidate.reach.serviceAreas.length === 0) {
      unsure.push('Has not said where they work')
    } else {
      const matched = areaHit(candidate.reach.serviceAreas, area)
      if (!matched) {
        return { eligible: false, score: 0, reasons: [], unsure: [], serviceId: undefined, serviceName: undefined }
      }
      score += 3
      reasons.push(`Works in ${matched}`)
    }
  }

  const payment = (request.payment || '').trim()
  if (payment) {
    if (candidate.paymentRails.length === 0) {
      unsure.push('Has not said how they get paid')
    } else if (!paymentHits(candidate.paymentRails, payment)) {
      return { eligible: false, score: 0, reasons: [], unsure: [], serviceId: undefined, serviceName: undefined }
    } else {
      score += 2
      reasons.push(`Takes ${PAYMENT_LABELS[payment.toLowerCase()] || payment}`)
    }
  }

  if (request.fulfilment) {
    if (candidate.reach.fulfilment.length === 0) {
      unsure.push('Has not said how the work is done')
    } else if (!candidate.reach.fulfilment.includes(request.fulfilment)) {
      return { eligible: false, score: 0, reasons: [], unsure: [], serviceId: undefined, serviceName: undefined }
    } else {
      score += 2
      reasons.push(FULFILMENT_LABELS[request.fulfilment])
    }
  }

  if (candidate.verified) {
    score += 2
    reasons.push('Verified organisation')
  }
  const finished = Math.max(0, Math.floor(Number(candidate.track?.finished) || 0))
  if (finished > 0) {
    score += Math.min(finished, 10) * 0.2
    reasons.push(`${finished} paid or finished ${finished === 1 ? 'job' : 'jobs'} on ${PRODUCT_NAME}`)
  }
  const reviewCount = Math.max(0, Number(candidate.track?.reviewCount) || 0)
  const reviewAverage = Number(candidate.track?.reviewAverage)
  if (reviewCount > 0 && Number.isFinite(reviewAverage)) {
    score += (reviewAverage - 3) * 0.5 * (Math.min(reviewCount, 5) / 5)
  }
  if (candidate.reach.hours) reasons.push(candidate.reach.hours)

  return { eligible: true, score, reasons, unsure, serviceId, serviceName }
}

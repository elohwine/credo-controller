/**
 * What a team member still has to do before they can act for the organisation,
 * in plain words. Mirrors `GET /api/organizations/{org}/members/onboarding`.
 *
 * Keep this file identical to `credo-ui/mobile/lib/orgOnboarding.ts`.
 */

export type MemberCardState = 'accepted' | 'waiting' | 'expired' | 'not_sent'
export type MemberCardKind = 'identity' | 'employee' | 'role'
export type MemberOnboardingSummary = 'ready' | 'waiting' | 'needs_cards' | 'no_app'

export interface MemberCard {
  kind: MemberCardKind
  label: string
  state: MemberCardState
  workflowType?: string
  covers?: string[]
  sentAt?: string
  acceptedAt?: string
}

export interface MemberOnboarding {
  userId: string
  role: string
  status: string
  createdAt: string
  displayName?: string
  phone?: string
  hasApp: boolean
  cards: MemberCard[]
  summary: MemberOnboardingSummary
  nextStep: string
}

export const ONBOARDING_PATH = '/members/onboarding'

export function sendCardsPath(userId: string): string {
  return `/members/${encodeURIComponent(userId)}/cards/send`
}

/** Short badge text for the team list. */
export const SUMMARY_LABEL: Record<MemberOnboardingSummary, string> = {
  ready: 'Ready',
  waiting: 'Waiting on them',
  needs_cards: 'Cards to send',
  no_app: 'Not in the app yet',
}

export const SUMMARY_COLOR: Record<MemberOnboardingSummary, string> = {
  ready: 'teal',
  waiting: 'yellow',
  needs_cards: 'orange',
  no_app: 'gray',
}

export const CARD_STATE_LABEL: Record<MemberCardState, string> = {
  accepted: 'In their app',
  waiting: 'Waiting for them to accept',
  expired: 'Expired',
  not_sent: 'Not sent yet',
}

export const CARD_STATE_COLOR: Record<MemberCardState, string> = {
  accepted: 'teal',
  waiting: 'yellow',
  expired: 'orange',
  not_sent: 'gray',
}

/** What the card lets the person do, in one line. */
export function cardPurpose(card: MemberCard): string {
  if (card.kind === 'identity') return 'Proves who they are when they confirm a step.'
  if (card.kind === 'employee') {
    const steps = card.covers && card.covers.length > 0 ? ` They confirm: ${card.covers.join(', ')}.` : ''
    return `Shows they work here.${steps} Sent again when their role or their steps change.`
  }
  if (card.covers && card.covers.length > 0) return `Lets them confirm: ${card.covers.join(', ')}.`
  return 'Lets them confirm the steps they handle.'
}

/**
 * Can the owner usefully press "Send again" for this card? A staff card can always be sent
 * again: the fresh card replaces the one they hold. An identity card they already hold cannot.
 */
export function cardCanResend(card: MemberCard): boolean {
  if (card.kind === 'employee') return true
  return card.state !== 'accepted'
}

/** One line under "Send again" when the person already holds the card. */
export function cardResendHint(card: MemberCard): string | undefined {
  if (card.kind === 'employee' && card.state === 'accepted') {
    return 'Sends a fresh card. The one they hold stops working once they accept it.'
  }
  return undefined
}

/** What happens to an earlier staff card when someone's role changes. Saved on the organisation. */
export type StaffCardChangeRule = 'stop_when_narrower' | 'stop_now'

export const DEFAULT_STAFF_CARD_CHANGE: StaffCardChangeRule = 'stop_when_narrower'

export const STAFF_CARD_CHANGE_OPTIONS: Array<{ value: StaffCardChangeRule; label: string; hint: string }> = [
  {
    value: 'stop_when_narrower',
    label: 'Stops straight away only if the new role has fewer steps (recommended)',
    hint: 'If the new role adds steps, the earlier card keeps working until they accept the new one, so work is not held up.',
  },
  {
    value: 'stop_now',
    label: 'Stops straight away, every time',
    hint: 'They cannot confirm any step until they accept the new card in their inbox.',
  },
]

export function staffCardChangeRule(value: unknown): StaffCardChangeRule {
  return value === 'stop_now' ? 'stop_now' : DEFAULT_STAFF_CARD_CHANGE
}

export function readyCount(rows: MemberOnboarding[]): { ready: number; total: number } {
  return { ready: rows.filter((row) => row.summary === 'ready').length, total: rows.length }
}

/** Steps shown on a member's own "getting started" card. */
export function myOnboardingSteps(me: MemberOnboarding | null): Array<{ label: string; done: boolean; hint: string }> {
  if (!me) return []
  const steps = [{ label: 'Signed in to the app', done: me.hasApp, hint: 'Sign in with your phone number and PIN.' }]
  for (const card of me.cards) {
    steps.push({
      label: card.label,
      done: card.state === 'accepted',
      hint:
        card.state === 'accepted'
          ? cardPurpose(card)
          : card.state === 'waiting'
            ? 'Open your Inbox and accept it.'
            : 'Ask your organisation to send it again.',
    })
  }
  return steps
}

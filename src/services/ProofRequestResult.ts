/**
 * What a checker sees after asking a contact to share a record.
 * The share itself stays in the verifier session. This only turns that session into plain words.
 */

export interface SharedCard {
  types: string[]
  subject: Record<string, unknown>
  id?: string
}

export interface ProofShareView {
  status: 'pending' | 'shared' | 'failed'
  summary: string
  standing?: 'valid' | 'revoked' | 'expired' | 'not_found' | 'invalid'
  standingTitle?: string
  cardLabel?: string
  issuerName?: string
  reference?: string
  rows?: Array<{ label: string; value: string }>
}

const STANDING_TITLE: Record<string, string> = {
  valid: 'Still valid',
  revoked: 'No longer valid',
  expired: 'Expired',
  not_found: 'Not confirmed here',
  invalid: 'Not valid',
}

const ROW_LABELS: Record<string, string> = {
  schoolName: 'From',
  amount: 'Amount',
  term: 'Term',
  feeType: 'Fee',
  studentName: 'Student',
  paidAt: 'Paid',
  paymentRef: 'Payment reference',
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function money(amount: unknown, currency: unknown): string {
  const raw = text(amount)
  if (!raw) return ''
  const code = text(currency).toUpperCase()
  const number = Number(raw)
  const shown = Number.isFinite(number) ? (Number.isInteger(number) ? String(number) : number.toFixed(2)) : raw
  if (code === 'USD') return `$${shown}`
  return code ? `${shown} ${code}` : shown
}

function cardLabelOf(types: string[]): string {
  const type = types.find((item) => item && item !== 'VerifiableCredential') || ''
  if (!type) return 'Record'
  return type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Record'
}

/** Pending until the wallet answers. Shared once a record is in the answer, with its standing. */
export function describeProofShare(input: {
  sessionState?: string
  cards?: SharedCard[]
  standing?: { status?: string; issuerName?: string }
}): ProofShareView {
  const state = input.sessionState || ''
  if (state === 'Error') return { status: 'failed', summary: 'The share did not go through.' }
  if (state !== 'ResponseVerified') return { status: 'pending', summary: 'Waiting for them to share.' }

  const cards = input.cards || []
  const card = cards.find((item) => item.types.some((type) => type !== 'VerifiableCredential')) || cards[0]
  if (!card) return { status: 'failed', summary: 'The share did not include a record.' }

  const subject = card.subject || {}
  const standing = text(input.standing?.status) || 'not_found'
  const standingTitle = STANDING_TITLE[standing] || 'Not confirmed here'
  const issuerName = text(input.standing?.issuerName) || text(subject.schoolName) || text(subject.orgName) || undefined
  const cardLabel = cardLabelOf(card.types)
  const paid = money(subject.amount, subject.currency)
  const term = text(subject.term)

  const rows: Array<{ label: string; value: string }> = []
  for (const key of Object.keys(ROW_LABELS)) {
    const value = key === 'amount' ? paid : text(subject[key])
    if (value) rows.push({ label: ROW_LABELS[key], value })
  }

  const summary = [
    `Shared: ${cardLabel}${issuerName ? ` from ${issuerName}` : ''}.`,
    paid ? `Paid ${paid}${term ? `, ${term}` : ''}.` : '',
    `${standingTitle}.`,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    status: 'shared',
    summary,
    standing: standing as ProofShareView['standing'],
    standingTitle,
    cardLabel,
    issuerName,
    reference: card.id,
    rows,
  }
}

/**
 * Who approves each kind of request in an organisation, in order, and what starts after it.
 * Mirrors RequestFlowSettingsService (GET/PUT /api/organizations/{org}/workflows/request-flows).
 */

export interface RequestFlowStep {
  kind: 'review' | 'finance' | 'custom'
  stageAction: string
  workflowType: string
  title: string
  amountAtLeast?: number
  /** Only a staff-card share from the wallet decides this step. */
  staffCardNeeded?: boolean
  /** What the step asks for when it is not marked. */
  staffCardDefault?: 'required' | 'offered' | 'sign_in'
}

export interface RequestFlowThen {
  key: string
  label: string
  startMode: 'auto' | 'manual'
  enabled: boolean
  conditionLabel: string
}

export interface RequestFlow {
  requestType: string
  label: string
  templateId: string
  steps: RequestFlowStep[]
  customised: boolean
  then: RequestFlowThen[]
}

export interface RequestFlowStepInput {
  kind: 'review' | 'finance'
  amountAtLeast?: number
  staffCardNeeded?: boolean
}

/**
 * Finance as a later approval: off, on for every request, or only from an amount up. Each
 * approval can also need the staff card, shared from the wallet.
 */
export interface FinanceApproval {
  on: boolean
  amountAtLeast?: number
  reviewCard?: boolean
  financeCard?: boolean
}

export function financeApprovalOf(flow: RequestFlow): FinanceApproval {
  const review = flow.steps.find((entry) => entry.kind === 'review')
  const step = flow.steps.find((entry) => entry.kind === 'finance')
  return step
    ? { on: true, amountAtLeast: step.amountAtLeast, reviewCard: Boolean(review?.staffCardNeeded), financeCard: Boolean(step.staffCardNeeded) }
    : { on: false, reviewCard: Boolean(review?.staffCardNeeded), financeCard: false }
}

/**
 * Turning finance on asks for the staff card at that step by default: a second approval on bigger
 * amounts is the high-impact step, so it is the one worth a share from the wallet.
 */
export function withFinance(choice: FinanceApproval, on: boolean): FinanceApproval {
  return on && !choice.on ? { ...choice, on, financeCard: true } : { ...choice, on }
}

/** The steps to save for a choice about finance; the usual approver always decides first. */
export function stepsForFinance(choice: FinanceApproval): RequestFlowStepInput[] {
  const amount = Number(choice.amountAtLeast)
  const review: RequestFlowStepInput = { kind: 'review', ...(choice.reviewCard ? { staffCardNeeded: true } : {}) }
  if (!choice.on) return [review]
  return [
    review,
    {
      kind: 'finance',
      ...(Number.isFinite(amount) && amount > 0 ? { amountAtLeast: amount } : {}),
      ...(choice.financeCard ? { staffCardNeeded: true } : {}),
    },
  ]
}

/** "Manager approval (staff card) → Finance approval (from 500, staff card)". */
export function requestFlowStepsLine(flow: RequestFlow): string {
  return flow.steps
    .map((step) => {
      const notes = [step.amountAtLeast ? `from ${step.amountAtLeast}` : '', step.staffCardNeeded ? 'staff card' : '']
        .filter(Boolean)
        .join(', ')
      return notes ? `${step.title} (${notes})` : step.title
    })
    .join(' → ')
}

/** Under the "staff card needed" switch, what happens when it is off. */
export function staffCardDefaultLine(flow: RequestFlow): string {
  const fallback = flow.steps[0]?.staffCardDefault
  if (fallback === 'required') return 'Off: your staff-card setting already asks for the card on every approval.'
  if (fallback === 'offered') return 'Off: the card is offered, and needed above your staff-card amount.'
  return 'Off: signing in is enough.'
}

/** "Then: Advance payment, by itself" — only the follow-ons that are switched on. */
export function requestFlowThenLine(flow: RequestFlow): string {
  const on = flow.then.filter((entry) => entry.enabled)
  if (on.length === 0) return ''
  return `Then: ${on.map((entry) => `${entry.label}, ${entry.startMode === 'auto' ? 'by itself' : 'when someone asks'}`).join('; ')}`
}

export function sameFinanceApproval(a: FinanceApproval, b: FinanceApproval): boolean {
  return (
    a.on === b.on &&
    Boolean(a.reviewCard) === Boolean(b.reviewCard) &&
    (a.on ? Number(a.amountAtLeast || 0) === Number(b.amountAtLeast || 0) && Boolean(a.financeCard) === Boolean(b.financeCard) : true)
  )
}

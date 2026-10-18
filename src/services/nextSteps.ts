/**
 * What a person should do next in an organisation.
 * Inbox cards (a paused step already routed to them) come before setup blockers.
 * Setup blockers are only for an owner or admin.
 */

export type NextStepKind = 'inbox' | 'setup'
export type NextStepScreen = 'inbox' | 'setup'

export interface NextStepItem {
  id: string
  kind: NextStepKind
  title: string
  detail: string
  /** Logical screen. Each app turns this into its own route. */
  href: NextStepScreen
  /** Organisation Inbox destinations; personal offers never belong to this summary. */
  inboxItemId?: string
  requestId?: string
}

export interface NextStepsResult {
  items: NextStepItem[]
}

const SETUP_ROLES = new Set(['owner', 'admin'])
const INBOUND_ROLES = new Set(['owner', 'admin', 'manager', 'approver'])

export function canSeeSetupSteps(role: string | null | undefined): boolean {
  return SETUP_ROLES.has(String(role || '').toLowerCase())
}

export function canSeeUnassignedInbound(role: string | null | undefined): boolean {
  return INBOUND_ROLES.has(String(role || '').toLowerCase())
}

/** Inbox first, then setup. At most `limit` items. Setup is dropped unless includeSetup. */
export function rankNextSteps(input: {
  inbox: NextStepItem[]
  setup: NextStepItem[]
  includeSetup: boolean
  limit?: number
}): NextStepItem[] {
  const limit = input.limit ?? 5
  const inbox = input.inbox.filter((item) => item.kind === 'inbox')
  const setup = input.includeSetup ? input.setup.filter((item) => item.kind === 'setup') : []
  return [...inbox, ...setup].slice(0, limit)
}

/**
 * The DCQL query a step sends, and the one-line purpose the share screen shows.
 * Kept apart from the verifier service so a test can build the query without
 * starting a wallet.
 */

import { missingTransactionBindingError, proofPolicyForFlow, splitAcceptedProofTypes } from './proofModeMatrix'

/** DCQL credential query id for the selective-disclosure staff/role card. */
export const DCQL_STAFF_CARD_QUERY_ID = 'staff_card'

/** Claim names in a selective-disclosure staff or role card that a stage request may ask for. */
const STAFF_CARD_CLAIM_PATHS: Record<string, string> = {
  org: 'orgTenantId',
  org_name: 'orgName',
  role: 'role',
  status: 'employmentStatus',
  steps: 'stageActions',
  flow: 'workflowType',
  person: 'userId',
}

/** Plain title for the step a share is about. */
const SHARE_STEP_TITLES: Record<string, string> = {
  trigger_payout: 'Release worker payout',
  acknowledge_execution: 'Sign off this job',
  approve_requisition: 'Approve this request',
  finance_approve_requisition: 'Approve this request',
  approve_request: 'Approve this request',
  release_funds: 'Release the money',
  record_payment: 'Record this payment',
  acknowledge_remittance: 'Confirm this payment',
}

/** One line for the share screen: the step, the job reference, and the amount when we have them. */
export function sharePurposeFromBinding(binding: { step?: unknown; job?: unknown; amount?: unknown }): string {
  const stepKey = String(binding.step || '')
    .trim()
    .toLowerCase()
  const step = SHARE_STEP_TITLES[stepKey] || ''
  const job = String(binding.job || '').trim()
  const humanJob = job && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(job) ? `Job ${job}` : ''
  const amount = binding.amount == null || binding.amount === '' ? '' : String(binding.amount)
  return [step, humanJob, amount].filter(Boolean).join(' · ')
}

/** The job binding the verifier put on the request (step, job reference, amount), decoded. */
export function shareBindingFromResolvedRequest(resolved: any): { step?: string; job?: string; amount?: string } {
  const raw = resolved?.authorizationRequestPayload?.transaction_data
  const encoded = Array.isArray(raw) ? raw.find((item: unknown) => typeof item === 'string') : undefined
  if (typeof encoded !== 'string' || !encoded) return {}
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (!decoded || typeof decoded !== 'object') return {}
    return {
      step:
        String(decoded.step || '')
          .trim()
          .toLowerCase() || undefined,
      job: String(decoded.job || '').trim() || undefined,
      amount: decoded.amount == null || decoded.amount === '' ? undefined : String(decoded.amount),
    }
  } catch {
    return {}
  }
}

/** Read the job binding the verifier put on the request, for the share screen. */
export function purposeLineFromResolvedRequest(resolved: any): string {
  const binding = shareBindingFromResolvedRequest(resolved)
  return binding.step || binding.job || binding.amount ? sharePurposeFromBinding(binding) : ''
}

/**
 * The card that signs each job binding on the request, as Credo's `acceptOpenId4VpAuthorizationRequest`
 * wants it (`transactionData`). Undefined when the request carries no binding.
 */
export function transactionDataSigners(
  resolved: any,
  credentials: Record<string, unknown> | undefined,
): Array<{ credentialId: string }> | undefined {
  const raw = resolved?.authorizationRequestPayload?.transaction_data
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const chosen = Object.keys(credentials || {})
  return raw.map((encoded: unknown) => {
    let allowed: string[] = []
    try {
      const decoded = JSON.parse(Buffer.from(String(encoded), 'base64url').toString('utf8'))
      allowed = Array.isArray(decoded?.credential_ids) ? decoded.credential_ids.map(String) : []
    } catch {
      allowed = []
    }
    return { credentialId: allowed.find((id) => chosen.includes(id)) || chosen[0] || '' }
  })
}

/**
 * Split one SD-JWT card for a share: `disclosed` is what the wallet sends, `withheld` stays on the
 * phone, `presentPayload` is what Credo turns into the presentation frame.
 *
 * Credo frames any list as `true`, which reveals no item of a list whose items are disclosed one
 * by one (its DCQL output for such a list is already `[]`). So the items are picked here from
 * the values the request asked for (`wantedItems`, from a `[list, null]` claim), or from the
 * positions the DCQL output kept, and passed as `{ index: value }` so Credo frames exactly those.
 * A list issued as one unit can only be revealed whole, so it is shared whole.
 */
export function splitSdJwtShare(
  all: Record<string, unknown>,
  output: Record<string, unknown>,
  perItemLists: ReadonlySet<string>,
  wantedItems: Record<string, unknown[]> = {},
): { disclosed: Record<string, unknown>; withheld: Record<string, unknown>; presentPayload: Record<string, unknown> } {
  const disclosed: Record<string, unknown> = {}
  const withheld: Record<string, unknown> = {}
  const presentPayload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(output || {})) {
    const full = all[key]
    if (Array.isArray(value) && Array.isArray(full)) {
      if (!perItemLists.has(key)) {
        disclosed[key] = full
        presentPayload[key] = full
        continue
      }
      const picked: Record<string, unknown> = {}
      const wanted = wantedItems[key]
      if (wanted && wanted.length > 0) {
        full.forEach((item, index) => {
          if (wanted.includes(item)) picked[String(index)] = item
        })
      } else {
        value.forEach((item, index) => {
          if (item !== null && item !== undefined) picked[String(index)] = item
        })
      }
      disclosed[key] = Object.values(picked)
      presentPayload[key] = picked
      const held = full.filter((_, index) => !(String(index) in picked))
      if (held.length > 0) withheld[key] = held
      continue
    }
    disclosed[key] = value
    presentPayload[key] = value
  }
  for (const [key, value] of Object.entries(all)) if (!(key in output)) withheld[key] = value
  return { disclosed, withheld, presentPayload }
}

/** Values a DCQL credential query asks for inside a list (`path: [list, null]`), by list name. */
export function wantedListItems(dcqlQuery: any, queryId: string): Record<string, unknown[]> {
  const credential = (dcqlQuery?.credentials || []).find((item: any) => item?.id === queryId)
  const out: Record<string, unknown[]> = {}
  for (const claim of credential?.claims || []) {
    const path = Array.isArray(claim?.path) ? claim.path : []
    if (path.length === 2 && typeof path[0] === 'string' && path[1] === null && Array.isArray(claim.values)) {
      out[path[0]] = claim.values
    }
  }
  return out
}

/** List claims in a raw SD-JWT payload whose items are disclosed one by one (`{ '...': digest }`). */
export function perItemListsOf(rawPayload: unknown): Set<string> {
  const out = new Set<string>()
  if (!rawPayload || typeof rawPayload !== 'object') return out
  for (const [key, value] of Object.entries(rawPayload as Record<string, unknown>)) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === 'object' && '...' in (item as object))) {
      out.add(key)
    }
  }
  return out
}

/**
 * Build the DCQL query for a stage. The selective-disclosure card reveals the organisation,
 * that the person is active, and only the one step this share is for. When the job names a
 * person for the step, that person's card may answer with who they are instead of the step,
 * because being named on the job is what gives them the step. Cards that cannot name claims
 * are not an alternative here. Steps that accept no selective-disclosure card (identity only)
 * get no DCQL query and are asked for the whole card over Presentation Exchange instead
 * (see `stageProofModeFor`).
 *
 * Whole cards (DelegationCredential, WorkflowRequestApproval) are deliberately not offered as a
 * `jwt_vc_json` option: the request carries the step and job as transaction data, and Credo 0.7
 * signs transaction data only with an SD-JWT key binding. A whole-card answer would either fail
 * or drop that binding.
 */
export function buildStageProofDcqlQuery(params: {
  acceptedVcTypes: string[]
  orgTenantId?: string
  stageAction?: string
  namedUserId?: string
}): any | undefined {
  const acceptedVcTypes = [...new Set(params.acceptedVcTypes.filter(Boolean))]
  const flowPolicy = proofPolicyForFlow('workflow_stage')
  const { selectiveDisclosureTypes: sdTypes } = splitAcceptedProofTypes(acceptedVcTypes, flowPolicy)
  if (sdTypes.length === 0) return undefined
  const orgTenantId = String(params.orgTenantId || '').trim()
  const stageAction = String(params.stageAction || '')
    .trim()
    .toLowerCase()
  const namedUserId = stageAction ? String(params.namedUserId || '').trim() : ''

  const claims: any[] = [
    {
      id: 'org',
      path: [STAFF_CARD_CLAIM_PATHS.org],
      ...(orgTenantId ? { values: [orgTenantId] } : {}),
    },
    { id: 'status', path: [STAFF_CARD_CLAIM_PATHS.status], values: ['active'] },
    { id: 'role', path: [STAFF_CARD_CLAIM_PATHS.role] },
    { id: 'flow', path: [STAFF_CARD_CLAIM_PATHS.flow] },
    stageAction
      ? { id: 'steps', path: [STAFF_CARD_CLAIM_PATHS.steps, null], values: [stageAction] }
      : { id: 'steps', path: [STAFF_CARD_CLAIM_PATHS.steps] },
    ...(namedUserId ? [{ id: 'person', path: [STAFF_CARD_CLAIM_PATHS.person], values: [namedUserId] }] : []),
  ]

  return {
    credentials: [
      {
        id: DCQL_STAFF_CARD_QUERY_ID,
        format: 'dc+sd-jwt',
        meta: { vct_values: sdTypes },
        claims,
        // Every accepted combination names the step, or the person the job names for it.
        // A card with neither is not an answer. Role cards carry a workflow instead of a status.
        claim_sets: [
          ['org', 'status', 'steps'],
          ['org', 'role', 'steps', 'flow'],
          ['org', 'role', 'steps'],
          ...(namedUserId ? [['org', 'status', 'person']] : []),
          // No single step to name (AP transactions): an active staff card of this org answers,
          // and the transaction itself is what the wallet signs.
          ...(stageAction ? [] : [['org', 'status']]),
        ],
      },
    ],
    credential_sets: [{ options: [[DCQL_STAFF_CARD_QUERY_ID]], required: true }],
  }
}

/** Why this card can answer the step, from what it would reveal. */
export type ShareBasis = 'step_on_card' | 'named_on_job' | 'role_for_flow' | 'whole_card'

export const SHARE_BASIS_LINES: Record<ShareBasis, string> = {
  step_on_card: 'Your card lists this step',
  named_on_job: 'You are the person named on this job',
  role_for_flow: 'Your role card covers this kind of work',
  whole_card: 'This card cannot share only some details, so the whole card is shared',
}

export interface ShareReviewRow {
  label: string
  value: string
}

/** Keys that are bookkeeping on a card, never a detail a person reads. */
const SHARE_HIDDEN_KEYS = /^(claims|assignmentMode|requestType|stageAction|templateId|fingerprint|offerId|did|jti|id)$/i

function readableWords(value: string): string {
  return value
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

/** A step key as words: "acknowledge_execution" → "Sign off this job". */
export function shareStepLabel(step: string): string {
  const key = String(step || '')
    .trim()
    .toLowerCase()
  return SHARE_STEP_TITLES[key] || readableWords(key)
}

function looksLikeRawId(value: string): boolean {
  return (
    /^did:/i.test(value) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value) ||
    /^[0-9a-f]{20,}$/i.test(value)
  )
}

function listOf(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value]
  return items.map((item) => String(item ?? '').trim()).filter(Boolean)
}

/**
 * What the share screen lists, in words: the details this card would send and the ones that stay
 * on the phone, plus why this card answers the step. Stored ids are never shown as values; a shared
 * organisation id reads as the organisation's name, a shared person id as "the person named on
 * this job".
 */
export function shareReviewRows(input: {
  disclosed: Record<string, unknown>
  withheld?: Record<string, unknown>
  selective: boolean
  orgName?: string
}): { shared: ShareReviewRow[]; withheld: ShareReviewRow[]; basis: ShareBasis; basisLine: string } {
  const disclosed = input.disclosed || {}
  const held = input.withheld || {}
  const orgName =
    String(input.orgName || '').trim() ||
    String(disclosed.orgName || '').trim() ||
    (disclosed.orgTenantId ? 'Your organisation' : '')

  const rowsFor = (source: Record<string, unknown>, isHeld: boolean): ShareReviewRow[] => {
    const rows: ShareReviewRow[] = []
    const seen = new Set<string>()
    const push = (label: string, value: string) => {
      const text = value.trim()
      if (!text) return
      const stamp = `${label}:${text}`
      if (seen.has(stamp)) return
      seen.add(stamp)
      rows.push({ label, value: text })
    }
    for (const [key, raw] of Object.entries(source)) {
      if (raw == null || raw === '' || SHARE_HIDDEN_KEYS.test(key)) continue
      if (key === 'orgTenantId' || key === 'targetOrgTenantId') {
        if (!isHeld) push('Organisation', orgName)
        continue
      }
      if (key === 'orgName') {
        // Shared through the organisation id already: one row, on the shared side.
        if (isHeld && disclosed.orgTenantId) continue
        push('Organisation', String(raw))
        continue
      }
      if (key === 'userId') {
        if (!isHeld) push('You', 'The person named on this job')
        continue
      }
      if (key === 'stageActions') {
        const steps = listOf(raw).map(shareStepLabel)
        if (steps.length === 0) continue
        push(isHeld ? 'Other steps on your card' : steps.length === 1 ? 'This step' : 'Steps', steps.join(', '))
        continue
      }
      if (key === 'employmentStatus') {
        push('Status', readableWords(String(raw)))
        continue
      }
      if (key === 'role' || key === 'memberRole') {
        push('Role', String(raw).replace(/_/g, ' '))
        continue
      }
      if (key === 'workflowType') {
        push('Kind of work', readableWords(String(raw)))
        continue
      }
      if (/id$/i.test(key)) continue
      if (typeof raw === 'object' && !Array.isArray(raw)) continue
      const value = Array.isArray(raw) ? listOf(raw).join(', ') : String(raw).trim()
      if (!value || looksLikeRawId(value)) continue
      push(readableWords(key), value)
    }
    return rows
  }

  let basis: ShareBasis
  if (!input.selective) basis = 'whole_card'
  else if (disclosed.userId) basis = 'named_on_job'
  else if (disclosed.workflowType || (disclosed.role && !disclosed.employmentStatus)) basis = 'role_for_flow'
  else basis = 'step_on_card'

  return {
    shared: rowsFor(disclosed, false),
    withheld: input.selective ? rowsFor(held, true) : [],
    basis,
    basisLine: SHARE_BASIS_LINES[basis],
  }
}

/** Transaction-data type the wallet signs for an AP/AR workflow step. */
export const AP_WORKFLOW_TRANSACTION_TYPE = 'ap_workflow'

export function buildApWorkflowTransactionData(params: { transactionId: string; requiredAction: string }) {
  return {
    type: AP_WORKFLOW_TRANSACTION_TYPE,
    credential_ids: [DCQL_STAFF_CARD_QUERY_ID],
    step: params.requiredAction,
    job: params.transactionId,
  }
}

/**
 * Why a verified AP share does not answer this transaction, or undefined when it does.
 * Whole-card (identity-only) requests carry no transaction data and have nothing to check;
 * an SD-bound request must come back signed.
 */
export function apWorkflowBindingError(
  verificationResult: any,
  expected: { transactionId: string; requiredAction?: string | null },
): string | undefined {
  const missing = missingTransactionBindingError(verificationResult, AP_WORKFLOW_TRANSACTION_TYPE)
  if (missing) return missing
  const entries = Array.isArray(verificationResult?.transactionData) ? verificationResult.transactionData : []
  for (const entry of entries) {
    const decoded = entry?.decoded && typeof entry.decoded === 'object' ? entry.decoded : {}
    if (decoded.type !== AP_WORKFLOW_TRANSACTION_TYPE) continue
    if (String(decoded.job || '') !== expected.transactionId) {
      return 'This proof was signed for a different transaction.'
    }
    if (expected.requiredAction && String(decoded.step || '') !== expected.requiredAction) {
      return 'This proof was signed for a different workflow step.'
    }
  }
  return undefined
}

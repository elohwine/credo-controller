/**
 * The DCQL query a step sends, and the one-line purpose the share screen shows.
 * Kept apart from the verifier service so a test can build the query without
 * starting a wallet.
 */

import { isSelectiveDisclosureVcType } from '../../utils/credentialDefinitionStore'

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
 * are not an alternative here; Presentation Exchange remains for wallets that only speak that
 * (`PROOF_REQUEST_QUERY=pex`).
 */
export function buildStageProofDcqlQuery(params: {
  acceptedVcTypes: string[]
  orgTenantId?: string
  stageAction?: string
  namedUserId?: string
}): any | undefined {
  const acceptedVcTypes = [...new Set(params.acceptedVcTypes.filter(Boolean))]
  const sdTypes = acceptedVcTypes.filter((type) => isSelectiveDisclosureVcType(type))
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
        ],
      },
    ],
    credential_sets: [{ options: [[DCQL_STAFF_CARD_QUERY_ID]], required: true }],
  }
}

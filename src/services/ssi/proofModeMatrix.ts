import { EMPLOYEE_VC_TYPE } from '../../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../config/credentials/PlatformIdentityVC'
import { isSelectiveDisclosureVcType } from '../../utils/credentialDefinitionStore'

/**
 * Every place the platform asks a wallet for a proof:
 * - `workflow_stage`: a person acts on a workflow step (approve, sign off, release money).
 * - `ap_workflow`: an accounts-payable transaction moves to its next step.
 * - `organization_entry`: a member proves they belong to an organisation to enter it.
 * - `wallet_login`: a holder signs in to the platform with their identity card.
 * - `partner_sign_in`: a partner app signs a holder in through the Hydra bridge.
 * - `contact_check`: an org asks a contact for a card of a named type, with nothing to bind.
 */
export type ProofFlowKey =
  | 'workflow_stage'
  | 'ap_workflow'
  | 'organization_entry'
  | 'wallet_login'
  | 'partner_sign_in'
  | 'contact_check'

export interface ProofFlowPolicy {
  flow: ProofFlowKey
  requiresSelectiveDisclosure: boolean
  /** The wallet signs the step, job and amount; the answer must carry that signature. */
  transactionBound: boolean
  allowPexFallback: boolean
  /** Card types that may be shared whole; `'*'` allows any requested type. */
  wholeCardAllowList: string[]
}

const WHOLE_CARD_ALLOWLIST = [PLATFORM_IDENTITY_VC_TYPE, EMPLOYEE_VC_TYPE] as const

const STAGE_FLOW_POLICY: ProofFlowPolicy = {
  flow: 'workflow_stage',
  // Workflow stage proofs sign transaction data (step/job/amount), so we must keep SD proof binding.
  requiresSelectiveDisclosure: true,
  transactionBound: true,
  allowPexFallback: false,
  wholeCardAllowList: [],
}

const AP_FLOW_POLICY: ProofFlowPolicy = { ...STAGE_FLOW_POLICY, flow: 'ap_workflow' }

const ENTRY_FLOW_POLICY: ProofFlowPolicy = {
  flow: 'organization_entry',
  requiresSelectiveDisclosure: false,
  transactionBound: false,
  allowPexFallback: true,
  wholeCardAllowList: [...WHOLE_CARD_ALLOWLIST],
}

const WALLET_LOGIN_POLICY: ProofFlowPolicy = {
  flow: 'wallet_login',
  requiresSelectiveDisclosure: false,
  transactionBound: false,
  allowPexFallback: true,
  wholeCardAllowList: [...WHOLE_CARD_ALLOWLIST],
}

const PARTNER_SIGN_IN_POLICY: ProofFlowPolicy = {
  flow: 'partner_sign_in',
  requiresSelectiveDisclosure: false,
  transactionBound: false,
  allowPexFallback: true,
  wholeCardAllowList: [PLATFORM_IDENTITY_VC_TYPE],
}

const CONTACT_CHECK_POLICY: ProofFlowPolicy = {
  flow: 'contact_check',
  requiresSelectiveDisclosure: false,
  transactionBound: false,
  allowPexFallback: true,
  wholeCardAllowList: ['*'],
}

const FLOW_POLICIES: Record<ProofFlowKey, ProofFlowPolicy> = {
  workflow_stage: STAGE_FLOW_POLICY,
  ap_workflow: AP_FLOW_POLICY,
  organization_entry: ENTRY_FLOW_POLICY,
  wallet_login: WALLET_LOGIN_POLICY,
  partner_sign_in: PARTNER_SIGN_IN_POLICY,
  contact_check: CONTACT_CHECK_POLICY,
}

export function proofPolicyForFlow(flow: ProofFlowKey): ProofFlowPolicy {
  return FLOW_POLICIES[flow]
}

function allowsWholeCard(policy: ProofFlowPolicy, vcType: string): boolean {
  return policy.wholeCardAllowList.includes('*') || policy.wholeCardAllowList.includes(vcType)
}

export function splitAcceptedProofTypes(
  acceptedVcTypes: string[],
  policy: ProofFlowPolicy,
): { selectiveDisclosureTypes: string[]; wholeCardTypes: string[] } {
  const normalized = [...new Set(acceptedVcTypes.map((entry) => String(entry || '').trim()).filter(Boolean))]
  const selectiveDisclosureTypes = normalized.filter((type) => isSelectiveDisclosureVcType(type))
  const wholeCardTypes = normalized.filter(
    (type) => !isSelectiveDisclosureVcType(type) && allowsWholeCard(policy, type),
  )
  return { selectiveDisclosureTypes, wholeCardTypes }
}

/**
 * How a workflow-stage proof is requested.
 * - `sd_bound`: an SD-JWT actor card is accepted, so the wallet signs the step/job/amount
 *   (Credo 0.7 signs transaction data only through the SD-JWT key-binding JWT). No downgrade.
 * - `whole_card_identity`: only identity cards are accepted (no actor configured), so nothing
 *   step-specific can be bound; the whole identity card is asked for with no transaction data.
 */
export type StageProofMode = 'sd_bound' | 'whole_card_identity'

export const STAGE_IDENTITY_WHOLE_CARD_TYPES = [PLATFORM_IDENTITY_VC_TYPE] as const

export function stageProofModeFor(acceptedVcTypes: string[]): StageProofMode {
  const normalized = acceptedVcTypes.map((entry) => String(entry || '').trim()).filter(Boolean)
  return normalized.some((type) => isSelectiveDisclosureVcType(type)) ? 'sd_bound' : 'whole_card_identity'
}

export function shouldAllowWholeCardType(flow: ProofFlowKey, vcType: string): boolean {
  return allowsWholeCard(proofPolicyForFlow(flow), String(vcType || '').trim())
}

/**
 * Checked just before a proof request is created. A transaction-bound flow asking for an
 * SD-bound share must use DCQL and carry its transaction data; anything else would let a
 * whole card stand in for a signed approval. Identity-only steps (`whole_card_identity`) bind
 * nothing and are allowed over PEX.
 */
export function assertProofRequestAllowed(
  flow: ProofFlowKey,
  request: { mode: StageProofMode | 'whole_card'; queryLanguage: 'dcql' | 'pex'; transactionDataTypes: string[] },
): void {
  const policy = proofPolicyForFlow(flow)
  if (request.mode === 'sd_bound' && policy.transactionBound) {
    if (request.queryLanguage !== 'dcql') {
      throw new Error(`${flow} proofs must use selective disclosure; a whole-card request is not allowed`)
    }
    if (request.transactionDataTypes.length === 0) {
      throw new Error(`${flow} proofs must carry the step and job for the wallet to sign`)
    }
    return
  }
  if (request.mode !== 'sd_bound' && policy.requiresSelectiveDisclosure && request.transactionDataTypes.length > 0) {
    throw new Error(`${flow} whole-card requests cannot carry transaction data; only SD-JWT cards can sign it`)
  }
  if (request.queryLanguage === 'pex' && !policy.allowPexFallback && request.mode === 'sd_bound') {
    throw new Error(`${flow} proofs cannot fall back to Presentation Exchange`)
  }
}

/** Transaction-data types the verifier put on the original request, read from the verified session. */
export function requestedTransactionDataTypes(verificationResult: any): string[] {
  const session = verificationResult?.verificationSession
  let payload: any
  try {
    payload = session?.requestPayload
  } catch {
    payload = undefined
  }
  payload = payload || session?.authorizationRequestPayload
  const raw = Array.isArray(payload?.transaction_data) ? payload.transaction_data : []
  const types: string[] = []
  for (const encoded of raw) {
    try {
      const decoded = JSON.parse(Buffer.from(String(encoded), 'base64url').toString('utf8'))
      if (decoded?.type) types.push(String(decoded.type))
    } catch {
      // unreadable entries are left to the protocol check
    }
  }
  return types
}

/**
 * Why a verified answer is missing a signature the request asked for, or undefined. The
 * OpenID4VP library already refuses an answer without the matching hash; this keeps the rule
 * in our code too, so a library change cannot silently turn a signed approval into a plain share.
 */
export function missingTransactionBindingError(verificationResult: any, transactionType: string): string | undefined {
  if (!requestedTransactionDataTypes(verificationResult).includes(transactionType)) return undefined
  const signed = Array.isArray(verificationResult?.transactionData) ? verificationResult.transactionData : []
  const found = signed.some((entry: any) => entry?.decoded?.type === transactionType)
  return found ? undefined : 'This proof was not signed for this step. Share it again from your wallet.'
}

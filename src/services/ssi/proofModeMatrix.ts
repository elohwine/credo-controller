import { EMPLOYEE_VC_TYPE } from '../../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../config/credentials/PlatformIdentityVC'

import { isSelectiveDisclosureVcType } from '../../utils/credentialDefinitionStore'

export type ProofFlowKey = 'workflow_stage' | 'organization_entry' | 'wallet_login'

export interface ProofFlowPolicy {
  flow: ProofFlowKey
  requiresSelectiveDisclosure: boolean
  allowPexFallback: boolean
  wholeCardAllowList: string[]
}

const WHOLE_CARD_ALLOWLIST = [PLATFORM_IDENTITY_VC_TYPE, EMPLOYEE_VC_TYPE] as const

const STAGE_FLOW_POLICY: ProofFlowPolicy = {
  flow: 'workflow_stage',
  // Workflow stage proofs sign transaction data (step/job/amount), so we must keep SD proof binding.
  requiresSelectiveDisclosure: true,
  allowPexFallback: false,
  wholeCardAllowList: [],
}

const ENTRY_FLOW_POLICY: ProofFlowPolicy = {
  flow: 'organization_entry',
  requiresSelectiveDisclosure: false,
  allowPexFallback: true,
  wholeCardAllowList: [...WHOLE_CARD_ALLOWLIST],
}

const WALLET_LOGIN_POLICY: ProofFlowPolicy = {
  flow: 'wallet_login',
  requiresSelectiveDisclosure: false,
  allowPexFallback: true,
  wholeCardAllowList: [...WHOLE_CARD_ALLOWLIST],
}

export function proofPolicyForFlow(flow: ProofFlowKey): ProofFlowPolicy {
  if (flow === 'workflow_stage') return STAGE_FLOW_POLICY
  if (flow === 'organization_entry') return ENTRY_FLOW_POLICY
  return WALLET_LOGIN_POLICY
}

export function splitAcceptedProofTypes(
  acceptedVcTypes: string[],
  policy: ProofFlowPolicy,
): { selectiveDisclosureTypes: string[]; wholeCardTypes: string[] } {
  const normalized = [...new Set(acceptedVcTypes.map((entry) => String(entry || '').trim()).filter(Boolean))]
  const selectiveDisclosureTypes = normalized.filter((type) => isSelectiveDisclosureVcType(type))
  const wholeCardTypes = normalized.filter(
    (type) => !isSelectiveDisclosureVcType(type) && policy.wholeCardAllowList.includes(type),
  )
  return { selectiveDisclosureTypes, wholeCardTypes }
}

export function shouldAllowWholeCardType(flow: ProofFlowKey, vcType: string): boolean {
  const policy = proofPolicyForFlow(flow)
  return policy.wholeCardAllowList.includes(String(vcType || '').trim())
}

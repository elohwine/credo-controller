import { describe, expect, it } from '@jest/globals'

import { EMPLOYEE_VC_TYPE } from '../../../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../../config/credentials/PlatformIdentityVC'
import {
  proofPolicyForFlow,
  shouldAllowWholeCardType,
  splitAcceptedProofTypes,
  stageProofModeFor,
} from '../proofModeMatrix'
import {
  apWorkflowBindingError,
  buildApWorkflowTransactionData,
  buildStageProofDcqlQuery,
} from '../stageProofQuery'

describe('proofModeMatrix', () => {
  it('maps stage workflow proofs to selective-disclosure only', () => {
    const policy = proofPolicyForFlow('workflow_stage')
    expect(policy.requiresSelectiveDisclosure).toBe(true)
    expect(policy.allowPexFallback).toBe(false)
    expect(shouldAllowWholeCardType('workflow_stage', EMPLOYEE_VC_TYPE)).toBe(false)
  })

  it('allows non-SD whole-card employee proof for organisation entry', () => {
    const policy = proofPolicyForFlow('organization_entry')
    expect(policy.requiresSelectiveDisclosure).toBe(false)
    expect(policy.allowPexFallback).toBe(true)
    expect(shouldAllowWholeCardType('organization_entry', EMPLOYEE_VC_TYPE)).toBe(true)
    const split = splitAcceptedProofTypes([EMPLOYEE_VC_TYPE, PLATFORM_IDENTITY_VC_TYPE], policy)
    expect(split.wholeCardTypes).toEqual([PLATFORM_IDENTITY_VC_TYPE])
    expect(split.selectiveDisclosureTypes).toEqual([EMPLOYEE_VC_TYPE])
  })

  it('asks for the whole identity card when a stage accepts no SD actor card', () => {
    expect(stageProofModeFor([PLATFORM_IDENTITY_VC_TYPE])).toBe('whole_card_identity')
    expect(stageProofModeFor(['DelegationCredential', PLATFORM_IDENTITY_VC_TYPE])).toBe('whole_card_identity')
    expect(buildStageProofDcqlQuery({ acceptedVcTypes: [PLATFORM_IDENTITY_VC_TYPE], stageAction: 'x' })).toBeUndefined()
  })

  it('keeps a stage SD-bound whenever an SD actor card is accepted', () => {
    expect(stageProofModeFor([EMPLOYEE_VC_TYPE, 'DelegationCredential', PLATFORM_IDENTITY_VC_TYPE])).toBe('sd_bound')
    expect(stageProofModeFor(['OrgWorkflowActorCredential'])).toBe('sd_bound')
  })

  it('lets any active staff card of the org answer an AP step and binds the transaction', () => {
    const query = buildStageProofDcqlQuery({ acceptedVcTypes: [EMPLOYEE_VC_TYPE], orgTenantId: 'org-1' })
    expect(query.credentials[0].format).toBe('dc+sd-jwt')
    expect(query.credentials[0].claim_sets).toContainEqual(['org', 'status'])
    const stepQuery = buildStageProofDcqlQuery({
      acceptedVcTypes: [EMPLOYEE_VC_TYPE],
      orgTenantId: 'org-1',
      stageAction: 'approve_requisition',
    })
    expect(stepQuery.credentials[0].claim_sets).not.toContainEqual(['org', 'status'])

    const tx = buildApWorkflowTransactionData({ transactionId: 'tx-1', requiredAction: 'approve_payment' })
    expect(tx).toMatchObject({ type: 'ap_workflow', credential_ids: ['staff_card'], job: 'tx-1' })
    const signed = { transactionData: [{ decoded: tx }] }
    expect(apWorkflowBindingError(signed, { transactionId: 'tx-1', requiredAction: 'approve_payment' })).toBeUndefined()
    expect(apWorkflowBindingError(signed, { transactionId: 'tx-2', requiredAction: 'approve_payment' })).toMatch(
      /different transaction/,
    )
    expect(apWorkflowBindingError(signed, { transactionId: 'tx-1', requiredAction: 'release_funds' })).toMatch(
      /different workflow step/,
    )
    expect(apWorkflowBindingError({}, { transactionId: 'tx-1' })).toBeUndefined()
  })
})

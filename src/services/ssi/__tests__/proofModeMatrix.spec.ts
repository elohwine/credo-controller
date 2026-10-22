import { describe, expect, it } from '@jest/globals'

import { EMPLOYEE_VC_TYPE } from '../../../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../../config/credentials/PlatformIdentityVC'
import { proofPolicyForFlow, shouldAllowWholeCardType, splitAcceptedProofTypes } from '../proofModeMatrix'

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
})

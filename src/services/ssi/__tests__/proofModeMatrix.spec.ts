import { describe, expect, it } from '@jest/globals'

import { EMPLOYEE_VC_TYPE } from '../../../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../../../config/credentials/PlatformIdentityVC'
import {
  assertProofRequestAllowed,
  missingTransactionBindingError,
  proofPolicyForFlow,
  requestedTransactionDataTypes,
  shouldAllowWholeCardType,
  splitAcceptedProofTypes,
  stageProofModeFor,
} from '../proofModeMatrix'
import { apWorkflowBindingError, buildApWorkflowTransactionData, buildStageProofDcqlQuery } from '../stageProofQuery'

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

  it('names a policy for every proof flow and keeps transaction-bound flows SD-only', () => {
    for (const flow of ['workflow_stage', 'ap_workflow'] as const) {
      const policy = proofPolicyForFlow(flow)
      expect(policy).toMatchObject({
        requiresSelectiveDisclosure: true,
        transactionBound: true,
        allowPexFallback: false,
      })
      expect(policy.wholeCardAllowList).toEqual([])
    }
    for (const flow of ['organization_entry', 'wallet_login', 'partner_sign_in', 'contact_check'] as const) {
      const policy = proofPolicyForFlow(flow)
      expect(policy).toMatchObject({
        requiresSelectiveDisclosure: false,
        transactionBound: false,
        allowPexFallback: true,
      })
    }
    expect(shouldAllowWholeCardType('partner_sign_in', PLATFORM_IDENTITY_VC_TYPE)).toBe(true)
    expect(shouldAllowWholeCardType('partner_sign_in', EMPLOYEE_VC_TYPE)).toBe(false)
    expect(shouldAllowWholeCardType('contact_check', 'AnyCard')).toBe(true)
    expect(shouldAllowWholeCardType('ap_workflow', PLATFORM_IDENTITY_VC_TYPE)).toBe(false)
  })

  it('refuses a request that would let a whole card stand in for a signed approval', () => {
    const ok = { mode: 'sd_bound' as const, queryLanguage: 'dcql' as const, transactionDataTypes: ['workflow_stage'] }
    expect(() => assertProofRequestAllowed('workflow_stage', ok)).not.toThrow()
    expect(() => assertProofRequestAllowed('workflow_stage', { ...ok, queryLanguage: 'pex' })).toThrow(
      /must use selective disclosure/,
    )
    expect(() => assertProofRequestAllowed('ap_workflow', { ...ok, transactionDataTypes: [] })).toThrow(
      /must carry the step and job/,
    )
    expect(() =>
      assertProofRequestAllowed('workflow_stage', {
        mode: 'whole_card_identity',
        queryLanguage: 'pex',
        transactionDataTypes: [],
      }),
    ).not.toThrow()
    expect(() =>
      assertProofRequestAllowed('workflow_stage', {
        mode: 'whole_card_identity',
        queryLanguage: 'pex',
        transactionDataTypes: ['workflow_stage'],
      }),
    ).toThrow(/cannot carry transaction data/)
    expect(() =>
      assertProofRequestAllowed('organization_entry', {
        mode: 'whole_card',
        queryLanguage: 'pex',
        transactionDataTypes: [],
      }),
    ).not.toThrow()
  })

  it('refuses an unsigned answer to a request that asked for a signature', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const tx = buildApWorkflowTransactionData({ transactionId: 'tx-1', requiredAction: 'approve_payment' })
    const session = { requestPayload: { transaction_data: [encode(tx)] } }

    expect(requestedTransactionDataTypes({ verificationSession: session })).toEqual(['ap_workflow'])
    expect(requestedTransactionDataTypes({ verificationSession: { authorizationRequestPayload: {} } })).toEqual([])

    const unsigned = { verificationSession: session, transactionData: [] }
    expect(missingTransactionBindingError(unsigned, 'ap_workflow')).toMatch(/not signed for this step/)
    expect(apWorkflowBindingError(unsigned, { transactionId: 'tx-1' })).toMatch(/not signed for this step/)

    const signed = { verificationSession: session, transactionData: [{ decoded: tx }] }
    expect(missingTransactionBindingError(signed, 'ap_workflow')).toBeUndefined()
    expect(apWorkflowBindingError(signed, { transactionId: 'tx-1', requiredAction: 'approve_payment' })).toBeUndefined()

    // Identity-only requests asked for no signature and have nothing to check.
    expect(missingTransactionBindingError({ verificationSession: {} }, 'workflow_stage')).toBeUndefined()
  })

  it('reads the request from the session even when the payload getter throws', () => {
    const session = {
      get requestPayload() {
        throw new Error('no request')
      },
      authorizationRequestPayload: {
        transaction_data: [Buffer.from(JSON.stringify({ type: 'workflow_stage' })).toString('base64url')],
      },
    }
    expect(requestedTransactionDataTypes({ verificationSession: session })).toEqual(['workflow_stage'])
  })
})

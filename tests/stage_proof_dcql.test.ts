import { describe, expect, test } from '@jest/globals'

import {
  DCQL_STAFF_CARD_QUERY_ID,
  buildStageProofDcqlQuery,
  perItemListsOf,
  sharePurposeFromBinding,
  shareReviewRows,
  splitSdJwtShare,
  wantedListItems,
} from '../src/services/ssi/stageProofQuery'
import { proofPolicyForFlow, splitAcceptedProofTypes } from '../src/services/ssi/proofModeMatrix'
import { sdJwtDisclosureFrame } from '../src/utils/credentialDefinitionStore'

describe('step-specific disclosure', () => {
  test('a payout asks only for that step on the staff card', () => {
    const query = buildStageProofDcqlQuery({
      acceptedVcTypes: ['EmployeeCredential', 'PlatformIdentityCredential'],
      orgTenantId: 'org-1',
      stageAction: 'trigger_payout',
    })
    expect(query?.credentials.map((item: { id: string }) => item.id)).toEqual([DCQL_STAFF_CARD_QUERY_ID])
    const card = query?.credentials[0]
    const steps = card.claims.find((claim: { id: string }) => claim.id === 'steps')
    expect(steps.path).toEqual(['stageActions', null])
    expect(steps.values).toEqual(['trigger_payout'])
    expect(card.claims.some((claim: { id: string }) => claim.id === 'org_name')).toBe(false)
    expect(card.claim_sets.every((set: string[]) => set.includes('steps'))).toBe(true)
  })

  test('the person a job names may answer with who they are instead of the step', () => {
    const query = buildStageProofDcqlQuery({
      acceptedVcTypes: ['EmployeeCredential'],
      orgTenantId: 'org-1',
      stageAction: 'acknowledge_execution',
      namedUserId: 'user-rudo',
    })
    const card = query?.credentials[0]
    expect(card.claims.find((claim: { id: string }) => claim.id === 'person')).toEqual({
      id: 'person',
      path: ['userId'],
      values: ['user-rudo'],
    })
    expect(card.claim_sets[0]).toEqual(['org', 'status', 'steps'])
    expect(card.claim_sets).toContainEqual(['org', 'status', 'person'])
    const unnamed = buildStageProofDcqlQuery({
      acceptedVcTypes: ['EmployeeCredential'],
      orgTenantId: 'org-1',
      stageAction: 'trigger_payout',
    })
    expect(unnamed.credentials[0].claim_sets.some((set: string[]) => set.includes('person'))).toBe(false)
  })

  test('the share line names the step and the job', () => {
    expect(sharePurposeFromBinding({ step: 'trigger_payout', job: 'FR-1791644376331', amount: '95' })).toBe(
      'Release worker payout · Job FR-1791644376331 · 95',
    )
  })

  test('each step on a card is its own disclosure', () => {
    const frame = sdJwtDisclosureFrame({
      orgTenantId: 'org-1',
      role: 'supervisor',
      stageActions: ['acknowledge_execution', 'trigger_payout'],
    })
    expect(frame.stageActions).toEqual({ _sd: [0, 1] })
    expect(frame._sd).toEqual(['orgTenantId', 'role'])
  })

  test('a share sends the one step and keeps the other steps on the phone', () => {
    const all = {
      orgTenantId: 'org-1',
      employmentStatus: 'active',
      role: 'finance_manager',
      stageActions: ['approve_requisition', 'trigger_payout', 'acknowledge_execution'],
    }
    const output = { orgTenantId: 'org-1', employmentStatus: 'active', stageActions: [null, 'trigger_payout'] }
    const raw = { stageActions: [{ '...': 'a' }, { '...': 'b' }, { '...': 'c' }] }
    const split = splitSdJwtShare(all, output, perItemListsOf(raw))
    expect(split.disclosed.stageActions).toEqual(['trigger_payout'])
    expect(split.withheld.stageActions).toEqual(['approve_requisition', 'acknowledge_execution'])
    expect(split.withheld.role).toBe('finance_manager')
    expect(split.presentPayload.stageActions).toEqual({ '1': 'trigger_payout' })
  })

  test('the asked-for step is picked from the card when Credo hands back an empty list', () => {
    const all = { orgTenantId: 'org-1', stageActions: ['acknowledge_execution', 'inspect_site', 'review_completion'] }
    const query = buildStageProofDcqlQuery({
      acceptedVcTypes: ['EmployeeCredential'],
      orgTenantId: 'org-1',
      stageAction: 'acknowledge_execution',
    })
    const raw = { stageActions: [{ '...': 'a' }, { '...': 'b' }, { '...': 'c' }] }
    const split = splitSdJwtShare(
      all,
      { orgTenantId: 'org-1', stageActions: [] },
      perItemListsOf(raw),
      wantedListItems(query, 'staff_card'),
    )
    expect(split.disclosed.stageActions).toEqual(['acknowledge_execution'])
    expect(split.withheld.stageActions).toEqual(['inspect_site', 'review_completion'])
    expect(split.presentPayload.stageActions).toEqual({ '0': 'acknowledge_execution' })
  })

  test('a card whose step list is one unit shares the whole list', () => {
    const all = { orgTenantId: 'org-1', stageActions: ['approve_requisition', 'trigger_payout'] }
    const output = { orgTenantId: 'org-1', stageActions: [null, 'trigger_payout'] }
    const split = splitSdJwtShare(
      all,
      output,
      perItemListsOf({ stageActions: ['approve_requisition', 'trigger_payout'] }),
    )
    expect(split.disclosed.stageActions).toEqual(all.stageActions)
    expect(split.withheld.stageActions).toBeUndefined()
    expect(split.presentPayload.stageActions).toEqual(all.stageActions)
  })
})

describe('what each step asks each card for', () => {
  const query = buildStageProofDcqlQuery({
    acceptedVcTypes: ['EmployeeCredential', 'OrgWorkflowActorCredential', 'DelegationCredential', 'WorkflowRequestApproval'],
    orgTenantId: 'org-1',
    stageAction: 'acknowledge_execution',
    namedUserId: 'user-7',
  })
  const card = query?.credentials[0]
  const pathsOf = (set: string[]) =>
    set.map((id) => card.claims.find((claim: { id: string }) => claim.id === id).path[0]).sort()

  test('every claim set reveals only the organisation plus what gives the step', () => {
    expect(card.claim_sets.map(pathsOf)).toEqual([
      ['employmentStatus', 'orgTenantId', 'stageActions'],
      ['orgTenantId', 'role', 'stageActions', 'workflowType'],
      ['orgTenantId', 'role', 'stageActions'],
      ['employmentStatus', 'orgTenantId', 'userId'],
    ])
  })

  test('whole cards are not offered, because only SD-JWT can sign the job binding', () => {
    expect(query?.credentials).toHaveLength(1)
    expect(card.format).toBe('dc+sd-jwt')
    expect(card.meta.vct_values).toEqual(['EmployeeCredential', 'OrgWorkflowActorCredential'])
  })

  test('proof matrix keeps transaction-bound stage proofs SD-only', () => {
    const policy = proofPolicyForFlow('workflow_stage')
    expect(policy.requiresSelectiveDisclosure).toBe(true)
    expect(policy.allowPexFallback).toBe(false)
    const split = splitAcceptedProofTypes(['EmployeeCredential', 'PlatformIdentityCredential'], policy)
    expect(split.selectiveDisclosureTypes).toEqual(['EmployeeCredential'])
    expect(split.wholeCardTypes).toEqual([])
  })
})

describe('share screen rows', () => {
  test('a staff card shares the organisation by name, the step, and the status', () => {
    const rows = shareReviewRows({
      disclosed: { orgTenantId: 'org-1', employmentStatus: 'active', stageActions: ['acknowledge_execution'] },
      withheld: { orgName: 'Demo Org', role: 'site_manager', userId: 'user-7', stageActions: ['trigger_payout'] },
      selective: true,
      orgName: 'Demo Org',
    })
    expect(rows.shared).toEqual([
      { label: 'Organisation', value: 'Demo Org' },
      { label: 'Status', value: 'Active' },
      { label: 'This step', value: 'Sign off this job' },
    ])
    // The organisation is already shared; its name is not listed as kept back.
    expect(rows.withheld).toEqual([
      { label: 'Role', value: 'site manager' },
      { label: 'Other steps on your card', value: 'Release worker payout' },
    ])
    expect(rows.basis).toBe('step_on_card')
  })

  test('the person named on the job is told so, never shown their id', () => {
    const rows = shareReviewRows({
      disclosed: { orgTenantId: 'org-1', employmentStatus: 'active', userId: 'user-7' },
      withheld: {},
      selective: true,
    })
    expect(rows.shared).toContainEqual({ label: 'You', value: 'The person named on this job' })
    expect(rows.shared).toContainEqual({ label: 'Organisation', value: 'Your organisation' })
    expect(JSON.stringify(rows)).not.toContain('user-7')
    expect(rows.basis).toBe('named_on_job')
  })

  test('a role card says its role covers this kind of work', () => {
    const rows = shareReviewRows({
      disclosed: { orgTenantId: 'org-1', role: 'finance', workflowType: 'field_execution_fept', stageActions: ['trigger_payout'] },
      selective: true,
      orgName: 'Demo Org',
    })
    expect(rows.basis).toBe('role_for_flow')
    expect(rows.shared).toContainEqual({ label: 'Kind of work', value: 'Field execution fept' })
  })

  test('a whole card lists everything as shared and nothing as kept back', () => {
    const rows = shareReviewRows({
      disclosed: { delegatorName: 'Ann', scope: 'approve_request', holderDid: 'did:key:z6Mk' },
      withheld: { anything: 'x' },
      selective: false,
    })
    expect(rows.basis).toBe('whole_card')
    expect(rows.withheld).toEqual([])
    expect(rows.shared).toEqual([
      { label: 'Delegator Name', value: 'Ann' },
      { label: 'Scope', value: 'approve_request' },
    ])
  })
})

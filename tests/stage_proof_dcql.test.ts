import { describe, expect, test } from '@jest/globals'

import {
  DCQL_STAFF_CARD_QUERY_ID,
  buildStageProofDcqlQuery,
  perItemListsOf,
  sharePurposeFromBinding,
  splitSdJwtShare,
  wantedListItems,
} from '../src/services/ssi/stageProofQuery'
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

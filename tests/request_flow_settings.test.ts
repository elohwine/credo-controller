/**
 * An organisation shapes each kind of request as a flow: the usual approver, then finance
 * (always or from an amount up), then what starts once it is decided. Only work areas switched
 * on in setup are listed. Payroll adds the salary advance, which ends in an advance payment.
 */

import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { MEMBER_REQUEST_FLOWS } from '../src/config/requestFlows'
import { orgEntitlementService } from '../src/services/OrgEntitlementService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { resolveAcceptedProofVcTypes } from '../src/services/ProofVcPolicyService'
import { stageProofModeFor } from '../src/services/ssi/proofModeMatrix'
import { requestFlowSettingsService } from '../src/services/RequestFlowSettingsService'
import { requestHandoffService } from '../src/services/RequestHandoffService'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('request-flow-settings-')
})
afterAll(() => databases.cleanup())

function payrollOrg() {
  const org = seedOrganization({ name: `Settings ${randomUUID().slice(0, 6)}` })
  orgEntitlementService.setPlan(org.orgTenantId, { grantedModules: ['people_payroll'] })
  orgSetupProfileService.save(org.orgTenantId, {
    operatingModel: 'internal',
    kinds: ['office'],
    modules: ['people_payroll', 'collections'],
    expectedRevision: orgSetupProfileService.get(org.orgTenantId).access.revision,
  })
  return org
}

describe('Request flow settings', () => {
  test('lists the request flows the organisation set up, each with its approvals and what follows', () => {
    const org = payrollOrg()
    const flows = requestFlowSettingsService.list(org.orgTenantId)
    const types = flows.map((flow) => flow.requestType)
    expect(types).toEqual(expect.arrayContaining(['hr.leave', 'hr.salary_advance']))
    for (const flow of flows) {
      expect(MEMBER_REQUEST_FLOWS.some((entry) => entry.requestType === flow.requestType)).toBe(true)
      expect(flow.steps[0].kind).toBe('review')
      expect(flow.customised).toBe(false)
    }
    const advance = flows.find((flow) => flow.requestType === 'hr.salary_advance')!
    expect(advance.then.map((entry) => entry.label)).toContain('Advance payment')
  })

  test('payroll flows are hidden when payroll is not switched on', () => {
    const org = seedOrganization({ name: 'No payroll', setup: 'new' })
    const types = requestFlowSettingsService.list(org.orgTenantId).map((flow) => flow.requestType)
    expect(types).not.toContain('hr.salary_advance')
    expect(() => requestFlowSettingsService.saveSteps(org.orgTenantId, 'hr.salary_advance', [{ kind: 'review' }])).toThrow(
      expect.objectContaining({ status: 403 }) as any,
    )
  })

  test('adding finance from an amount up changes which approvals a request needs', () => {
    const org = payrollOrg()
    const saved = requestFlowSettingsService.saveSteps(org.orgTenantId, 'finance.expense_claim', [
      { kind: 'review' },
      { kind: 'finance', amountAtLeast: 300 },
    ])
    expect(saved.customised).toBe(true)
    expect(saved.steps.map((step) => [step.kind, step.amountAtLeast])).toEqual([
      ['review', undefined],
      ['finance', 300],
    ])
    const small = platformRequestService.decisionStagesFor(org.orgTenantId, 'finance.expense_claim', 50)
    const big = platformRequestService.decisionStagesFor(org.orgTenantId, 'finance.expense_claim', 900)
    expect(small).toHaveLength(1)
    expect(big.map((stage) => stage.stageAction)).toEqual([small[0].stageAction, 'finance_approve_requisition'])

    // Back to the usual approver only.
    const reset = requestFlowSettingsService.saveSteps(org.orgTenantId, 'finance.expense_claim', [{ kind: 'review' }])
    expect(reset.steps).toHaveLength(1)
    expect(reset.customised).toBe(false)
  })

  test('refuses approvals that cannot work', () => {
    const org = payrollOrg()
    const save = (steps: any[]) => () => requestFlowSettingsService.saveSteps(org.orgTenantId, 'hr.leave', steps)
    expect(save([])).toThrow(expect.objectContaining({ status: 400 }) as any)
    expect(save([{ kind: 'finance' }])).toThrow(expect.objectContaining({ status: 400 }) as any)
    expect(save([{ kind: 'review', amountAtLeast: 10 }])).toThrow(expect.objectContaining({ status: 400 }) as any)
    expect(save([{ kind: 'review' }, { kind: 'finance', amountAtLeast: -5 }])).toThrow(
      expect.objectContaining({ status: 400 }) as any,
    )
    expect(save([{ kind: 'review' }, { kind: 'review' }])).toThrow(expect.objectContaining({ status: 400 }) as any)
    expect(() => requestFlowSettingsService.saveSteps(org.orgTenantId, 'quote', [{ kind: 'review' }])).toThrow(
      expect.objectContaining({ status: 404 }) as any,
    )
  })

  describe('which approvals need the staff card', () => {
    function raise(org: { orgTenantId: string; organizationId: string }, requestType: string, amount?: number) {
      const { orgTenantId } = org
      const memberUserId = `member-${randomUUID()}`
      addMember({ orgTenantId, organizationId: org.organizationId, userId: memberUserId, role: 'member' })
      const created = platformRequestService.create({
        tenantId: orgTenantId,
        subjectRef: memberUserId,
        requestType,
        title: `${requestType} test`,
        ...(amount ? { amount, currency: 'USD' } : {}),
        targetModule: requestType.startsWith('hr.') ? 'hr' : 'finance',
      } as any) as { id: string }
      platformRequestService.submit(created.id, orgTenantId, memberUserId)
      return created.id
    }

    test('leave keeps the sign-in; a salary advance offers the card; marking a step makes it required', () => {
      const org = payrollOrg()
      const flows = requestFlowSettingsService.list(org.orgTenantId)
      expect(flows.find((flow) => flow.requestType === 'hr.leave')!.steps[0]).toMatchObject({
        staffCardNeeded: false,
        staffCardDefault: 'sign_in',
      })
      expect(flows.find((flow) => flow.requestType === 'hr.salary_advance')!.steps[0].staffCardDefault).toBe('offered')

      const leave = raise(org, 'hr.leave')
      expect(platformRequestService.cardRuleFor({ tenantId: org.orgTenantId, requestId: leave, requestType: 'hr.leave', toStatus: 'approved' }).mode).toBe('session')

      const advance = raise(org, 'hr.salary_advance', 200)
      const offered = platformRequestService.cardRuleFor({
        tenantId: org.orgTenantId,
        requestId: advance,
        requestType: 'hr.salary_advance',
        toStatus: 'approved',
        amount: 200,
      })
      expect(offered).toEqual({ actionKey: 'stage:approve_request', mode: 'card_optional' })

      const saved = requestFlowSettingsService.saveSteps(org.orgTenantId, 'hr.leave', [{ kind: 'review', staffCardNeeded: true }])
      expect(saved.steps[0].staffCardNeeded).toBe(true)
      expect(saved.customised).toBe(true)
      expect(platformRequestService.cardRuleFor({ tenantId: org.orgTenantId, requestId: leave, requestType: 'hr.leave', toStatus: 'approved' })).toEqual({
        actionKey: 'stage:approve_request',
        mode: 'card_required',
      })
      expect(() => platformRequestService.transitionBySubject(leave, org.orgTenantId, org.ownerUserId, 'approved')).toThrow(
        'This step needs your staff card. Use "Approve with staff card".',
      )
      const listed: any = platformRequestService.list(org.orgTenantId, org.ownerUserId)
      const items: any[] = Array.isArray(listed) ? listed : listed?.items || listed?.data || []
      expect(items.find((item) => item.id === leave)?.decision).toMatchObject({ staffCard: true, cardRequired: true })

      // The share asks for the staff card for this one step, as the job sign-off does, not the identity card.
      // Who does what names the owner as the approver (main person); that still accepts the staff card.
      orgWorkflowActorService.savePolicy(org.orgTenantId, {
        mainPeople: { approver: { type: 'role', value: 'owner' } },
      })
      const step = platformRequestService.staffCardStep(leave, org.orgTenantId, org.ownerUserId, 'approved')
      expect(step.workflowType).toBeTruthy()
      const accepted = resolveAcceptedProofVcTypes(org.orgTenantId, step.actionKey, [step.workflowType!])
      expect(stageProofModeFor(accepted)).toBe('sd_bound')
    })

    test('finance as a later step is checked against its own step, and can need the card on its own', () => {
      const org = payrollOrg()
      requestFlowSettingsService.saveSteps(org.orgTenantId, 'finance.expense_claim', [
        { kind: 'review' },
        { kind: 'finance', amountAtLeast: 300, staffCardNeeded: true },
      ])
      const stages = platformRequestService.decisionStagesFor(org.orgTenantId, 'finance.expense_claim', 900)
      expect(stages.map((stage) => Boolean(stage.requireProof))).toEqual([false, true])
      const progress = (index: number) => ({
        stages,
        index,
        current: stages[index],
        final: index === stages.length - 1,
        earlierApproverPersonIds: [],
      })
      const rule = (index: number) =>
        platformRequestService.cardRuleFor({
          tenantId: org.orgTenantId,
          requestType: 'finance.expense_claim',
          toStatus: 'approved',
          amount: 900,
          progress: progress(index) as any,
        })
      expect(rule(0)).toEqual({ actionKey: 'stage:approve_request', mode: 'card_optional' })
      expect(rule(1)).toEqual({ actionKey: 'stage:finance_approve_requisition', mode: 'card_required' })
    })

    test('a purchase keeps its proof key on the usual approver', () => {
      const org = payrollOrg()
      expect(
        platformRequestService.cardRuleFor({ tenantId: org.orgTenantId, requestType: 'procurement.requisition', toStatus: 'approved', amount: 80 }),
      ).toEqual({ actionKey: 'requisition_approval', mode: 'card_optional' })
    })
  })

  test('the salary advance is offered with payroll and continues into an advance payment', () => {
    const org = payrollOrg()
    const memberUserId = `member-${randomUUID()}`
    addMember({ ...org, userId: memberUserId, role: 'member' })
    const membership = platformRequestService
      .optionsForSubject(memberUserId)
      .memberships.find((entry) => entry.orgTenantId === org.orgTenantId)
    expect(membership?.kinds).toContain('hr.salary_advance')
    expect(orgSetupProfileService.moduleForOperation('hr.salary_advance')).toBe('people_payroll')

    const rule = requestHandoffService
      .catalogFor(org.organizationId)
      .find((entry) => entry.fromType === 'hr.salary_advance')
    expect(rule).toMatchObject({ onStatus: 'approved', toType: 'finance.payment_request', title: 'Advance payment' })
  })
})

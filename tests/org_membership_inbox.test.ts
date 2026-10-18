/**
 * Employee and delegation credentials, plus stage inbox routing for fees, AP/AR,
 * requisitions, FEPT and department requests.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { evaluateOrgEvidenceProof } from '../src/services/ActorCredentialProofService'
import { orgMembershipCredentialService } from '../src/services/OrgMembershipCredentialService'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { resolveAcceptedProofVcTypes } from '../src/services/ProofVcPolicyService'
import {
  delegationCoversStage,
  resolveStageRoute,
  routeWorkflowStageInbox,
} from '../src/services/WorkflowStageInboxService'
import { DatabaseManager } from '../src/persistence/DatabaseManager'

import {
  addDepartment,
  addMember,
  initTestDatabases,
  seedOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-membership-inbox-')
  orgMembershipCredentialService.setOfferFactory(async () => ({
    offerId: `offer-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/1',
  }))
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `actor-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => {
  databases.cleanup()
})

function pending(walletTenantId: string, sourceType: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT source_id, credential_type, title FROM wallet_pending_offers
       WHERE tenant_id = ? AND source_type = ? AND resolved_at IS NULL`,
    )
    .all(walletTenantId, sourceType) as Array<{ source_id: string; credential_type: string; title: string }>
}

describe('stage route mapping', () => {
  test('fees, AP, AR, requisitions, FEPT, department and onboarding each resolve a stage', () => {
    expect(resolveStageRoute('education_fee_payment')).toEqual({
      workflowType: 'education_fee_payment',
      stageAction: 'record_payment',
    })
    expect(resolveStageRoute('finance.payment_request').workflowType).toBe('accounts_payable')
    expect(resolveStageRoute('finance.expense_claim').stageAction).toBe('approve_request')
    expect(resolveStageRoute('invoice', 'accounts_receivable').stageAction).toBe('record_payment')
    expect(resolveStageRoute('requisition').workflowType).toBe('internal_requisitions')
    expect(resolveStageRoute('field.inspection', 'field_execution_fept').stageAction).toBe('inspect_site')
    expect(resolveStageRoute('hr.onboarding').stageAction).toBe('approve_onboarding')
    expect(resolveStageRoute('department_request').stageAction).toBe('approve_requisition')
    expect(delegationCoversStage(['finance.approve'], 'record_payment', 'education_fee_payment')).toBe(true)
    expect(delegationCoversStage(['field.assign'], 'approve_requisition', 'requisition')).toBe(false)
  })
})

describe('employee and delegation offers', () => {
  test('offers an employee credential once, then again when the role changes', async () => {
    const org = seedOrganization({ name: 'People Ltd' })
    const userId = `user-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId, role: 'clerk' })

    const first = await orgMembershipCredentialService.ensureEmployeeCredential({
      orgTenantId: org.orgTenantId,
      userId,
      role: 'clerk',
      source: 'membership',
    })
    const second = await orgMembershipCredentialService.ensureEmployeeCredential({
      orgTenantId: org.orgTenantId,
      userId,
      role: 'clerk',
      source: 'membership',
    })
    const changed = await orgMembershipCredentialService.ensureEmployeeCredential({
      orgTenantId: org.orgTenantId,
      userId,
      role: 'finance_manager',
      source: 'membership',
    })

    expect(first.outcome).toBe('offered')
    expect(second.outcome).toBe('already_offered')
    expect(changed.outcome).toBe('offered')
    expect(pending(`wallet-${userId}`, 'org_employee')).toHaveLength(1)
    expect(pending(`wallet-${userId}`, 'org_employee')[0].credential_type).toBe('EmployeeCredential')
  })

  test('offers a delegation credential to the delegate wallet', async () => {
    const org = seedOrganization({ name: 'Delegate Ltd' })
    const delegatorUserId = `user-${randomUUID()}`
    const delegateUserId = `user-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: delegatorUserId,
      role: 'owner',
    })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: delegateUserId,
      role: 'clerk',
    })

    const delegationId = randomUUID()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO delegations (id, organization_id, delegator_person_id, delegate_person_id, scope_json, valid_from, status)
         VALUES (?, ?, (SELECT id FROM people WHERE subject_ref = ?), (SELECT id FROM people WHERE subject_ref = ?), ?, ?, 'active')`,
      )
      .run(
        delegationId,
        org.organizationId,
        delegatorUserId,
        delegateUserId,
        JSON.stringify({ permissions: ['finance.approve'] }),
        new Date().toISOString(),
      )

    const result = await orgMembershipCredentialService.ensureDelegationCredential({
      orgTenantId: org.orgTenantId,
      delegationId,
      delegatorUserId,
      delegateUserId,
      permissions: ['finance.approve'],
      validFrom: new Date().toISOString(),
    })

    expect(result.outcome).toBe('offered')
    expect(pending(`wallet-${delegateUserId}`, 'org_delegation')[0].title).toContain('Delegate Ltd')
  })

  test('queues a platform identity offer for the holder inbox', () => {
    const walletTenantId = `wallet-${randomUUID()}`
    const outcome = orgMembershipCredentialService.queuePlatformIdentityOffer({
      walletTenantId,
      offerUri: 'https://issuer.example/offers/platform',
      displayName: 'Ada',
    })
    expect(outcome).toBe('offered')
    expect(pending(walletTenantId, 'platform_identity')[0].credential_type).toBe('PlatformIdentityCredential')
  })
})

describe('stage inbox routing', () => {
  test('routes fees to the stage actor and a delegate whose scope covers payment', () => {
    const org = seedOrganization({ name: 'Fees Ltd' })
    const actorUserId = `user-${randomUUID()}`
    const delegateUserId = `user-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: actorUserId,
      role: 'finance_manager',
    })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: delegateUserId,
      role: 'clerk',
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'education_fee_payment',
      stageAction: 'record_payment',
      defaultUserId: actorUserId,
    })
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO delegations (id, organization_id, delegator_person_id, delegate_person_id, scope_json, valid_from, status)
         VALUES (?, ?, (SELECT id FROM people WHERE organization_id = ? AND subject_ref = ?), (SELECT id FROM people WHERE organization_id = ? AND subject_ref = ?), ?, ?, 'active')`,
      )
      .run(
        randomUUID(),
        org.organizationId,
        org.organizationId,
        actorUserId,
        org.organizationId,
        delegateUserId,
        JSON.stringify({ permissions: ['finance.approve'], maxAmount: 1000 }),
        new Date().toISOString(),
      )

    const routed = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'education_fee_payment',
      sourceId: `fee-${randomUUID()}`,
      title: 'Term fees',
      body: 'Record the fee payment.',
      amount: 200,
    })

    expect(routed.routed).toBe(2)
    expect(pending(`wallet-${actorUserId}`, 'workflow_stage_action')[0].title).toBe('Term fees')
    expect(pending(`wallet-${delegateUserId}`, 'workflow_stage_action')[0].title).toContain('delegated')
  })

  test('a department member receives a department request ahead of the owner fallback', () => {
    const org = seedOrganization({ name: 'Dept Ltd' })
    const clerkUserId = `user-${randomUUID()}`
    const personId = addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: clerkUserId,
      role: 'approver',
    })
    const departmentId = addDepartment(org.organizationId, 'Finance')
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO organization_memberships (id, organization_id, person_id, department_id, membership_status)
         VALUES (?, ?, ?, ?, 'active')`,
      )
      .run(randomUUID(), org.organizationId, personId, departmentId)

    const routed = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'department_request',
      sourceId: `dept-${randomUUID()}`,
      title: 'Department approval',
      body: 'Finance department should act.',
      departmentId,
    })

    expect(routed.recipients[0]?.userId).toBe(clerkUserId)
    expect(routed.recipients[0]?.via).toBe('department')
    expect(pending(`wallet-${clerkUserId}`, 'workflow_stage_action')).toHaveLength(1)
    expect(pending(`wallet-${org.ownerUserId}`, 'workflow_stage_action')).toHaveLength(0)
  })

  test('field sign-off falls to the supervisors: each gets the card, the step, and may finish it', () => {
    const org = seedOrganization({ name: 'Crew Ltd' })
    const supervisorA = `user-${randomUUID()}`
    const supervisorB = `user-${randomUUID()}`
    const worker = `user-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: supervisorA,
      role: 'supervisor',
    })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: supervisorB,
      role: 'supervisor',
    })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: worker,
      role: 'field_worker',
    })

    const routed = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'field.signoff',
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
      sourceId: `job-${randomUUID()}`,
      title: 'Sign off job',
      body: 'Confirm the work is done.',
    })

    const recipients = routed.recipients.map((r) => r.userId).sort()
    expect(recipients).toEqual([supervisorA, supervisorB].sort())
    expect(pending(`wallet-${worker}`, 'workflow_stage_action')).toHaveLength(0)
    expect(pending(`wallet-${org.ownerUserId}`, 'workflow_stage_action')).toHaveLength(0)

    // The staff card of every supervisor lists the sign-off step; the worker's does not.
    for (const supervisor of [supervisorA, supervisorB]) {
      expect(
        orgWorkflowActorCredentialService.coveredStageActions(org.orgTenantId, 'field_execution_fept', supervisor),
      ).toContain('acknowledge_execution')
    }
    expect(
      orgWorkflowActorCredentialService.coveredStageActions(org.orgTenantId, 'field_execution_fept', worker),
    ).not.toContain('acknowledge_execution')

    // The finishing endpoints ask the same question.
    const scope = {
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
    }
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: supervisorA }).allowed).toBe(true)
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: supervisorB }).why).toBe('role')
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: org.ownerUserId }).why).toBe('admin')
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: worker }).allowed).toBe(false)
    // The person a job names for the step may act even without the role.
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: worker, namedUserId: worker }).why).toBe('named')
  })

  test('a step with a chosen person stays with that person; owners stand in', () => {
    const org = seedOrganization({ name: 'Chosen Ltd' })
    const chosen = `user-${randomUUID()}`
    const otherSupervisor = `user-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: chosen, role: 'supervisor' })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: otherSupervisor,
      role: 'supervisor',
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
      defaultUserId: chosen,
    })

    const routed = routeWorkflowStageInbox({
      orgTenantId: org.orgTenantId,
      requestType: 'field.signoff',
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
      sourceId: `job-${randomUUID()}`,
      title: 'Sign off job',
      body: 'Confirm the work is done.',
    })
    expect(routed.recipients.map((r) => r.userId)).toEqual([chosen])

    const scope = {
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'acknowledge_execution',
    }
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: chosen }).why).toBe('configured')
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: otherSupervisor }).allowed).toBe(false)
    expect(orgWorkflowActorService.mayAct({ ...scope, userId: org.ownerUserId }).why).toBe('admin')
  })
})

describe('presented evidence', () => {
  test('accepts an employee credential for the org and rejects one from another org', () => {
    const org = seedOrganization({ name: 'Evidence Ltd' })
    const actorUserId = `user-${randomUUID()}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: actorUserId,
      role: 'approver',
    })
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: 'internal_requisitions',
      stageAction: 'approve_requisition',
      defaultUserId: actorUserId,
    })

    const accepted = resolveAcceptedProofVcTypes(org.orgTenantId, 'requisition_approval')
    expect(accepted).toEqual(
      expect.arrayContaining(['EmployeeCredential', 'DelegationCredential', 'OrgWorkflowActorCredential']),
    )

    const good = evaluateOrgEvidenceProof(
      {
        presentation: {
          verifiableCredential: [
            {
              type: ['VerifiableCredential', 'EmployeeCredential'],
              credentialSubject: {
                orgTenantId: org.orgTenantId,
                userId: actorUserId,
                role: 'approver',
                employmentStatus: 'active',
              },
            },
          ],
        },
      },
      { orgTenantId: org.orgTenantId, stageAction: 'approve_requisition' },
    )
    const bad = evaluateOrgEvidenceProof(
      {
        presentation: {
          verifiableCredential: [
            {
              type: ['VerifiableCredential', 'DelegationCredential'],
              credentialSubject: {
                orgTenantId: 'someone-else',
                delegateUserId: actorUserId,
                permissions: ['finance.approve'],
              },
            },
          ],
        },
      },
      { orgTenantId: org.orgTenantId, stageAction: 'approve_requisition' },
    )

    expect(good).toMatchObject({ present: true, valid: true, role: 'approver' })
    expect(bad).toMatchObject({ present: true, valid: false })
  })

  test('a staff card that lists other steps still counts when the job names its holder for this step', () => {
    const org = seedOrganization({ name: 'Named Ltd' })
    const signer = `user-${randomUUID()}`
    const stranger = `user-${randomUUID()}`
    const cardOf = (userId: string) => ({
      presentation: {
        verifiableCredential: [
          {
            type: ['VerifiableCredential', 'EmployeeCredential'],
            credentialSubject: {
              orgTenantId: org.orgTenantId,
              userId,
              role: 'supervisor',
              employmentStatus: 'active',
              stageActions: ['inspect_site'],
            },
          },
        ],
      },
    })

    const scope = { orgTenantId: org.orgTenantId, stageAction: 'acknowledge_execution' }
    expect(evaluateOrgEvidenceProof(cardOf(signer), scope)).toMatchObject({ present: true, valid: false })
    expect(evaluateOrgEvidenceProof(cardOf(signer), { ...scope, namedUserId: signer })).toMatchObject({
      present: true,
      valid: true,
    })
    expect(evaluateOrgEvidenceProof(cardOf(stranger), { ...scope, namedUserId: signer })).toMatchObject({
      present: true,
      valid: false,
    })
  })
})

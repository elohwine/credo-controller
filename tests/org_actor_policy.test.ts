/**
 * Organization-configurable stage-actor fallbacks.
 *
 * Stage defaults say WHO acts at a stage. The per-org policy says what happens when no
 * default matches: the org's own user/role/wallet chains, then the platform's built-in
 * role order, then (optionally) the owner. Readiness reads the same resolver, so an
 * org that explicitly routes a stage to its owner is "ready" instead of "owner fallback".
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { orgWorkflowActorService, requisitionApprovalSignMode } from '../src/services/OrgWorkflowActorService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'

import {
  addMember,
  addRole,
  configureFeptTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-actor-policy-')
})

afterAll(() => {
  databases.cleanup()
})

const WORKFLOW = 'field_execution_fept'
const STAGE = 'assign_field_worker'

function resolve(orgTenantId: string, stageAction = STAGE) {
  return orgWorkflowActorService.resolveActor({ orgTenantId, workflowType: WORKFLOW, stageAction })
}

function stageItem(orgTenantId: string) {
  const report = workflowReadinessService.evaluateTemplate(orgTenantId, WORKFLOW)
  return report.items.find((item) => item.key === `stage_actor:${STAGE}`)
}

describe('OrgWorkflowActorService — fallback policy', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Policy Ltd' })
    addRole(org.organizationId, 'Field Worker')
    configureFeptTemplate(org.orgTenantId)
  })

  test('default policy: owner-only org falls to owner_fallback and readiness flags the stage', () => {
    const policy = orgWorkflowActorService.getPolicy(org.orgTenantId)
    expect(policy.ownerFallbackEnabled).toBe(true)
    expect(policy.useBuiltInRoleFallbacks).toBe(true)
    expect(policy.defaultChain).toEqual([])

    const actor = resolve(org.orgTenantId)
    expect(actor.mode).toBe('owner_fallback')
    expect(actor.userId).toBe(org.ownerUserId)
    expect(stageItem(org.orgTenantId)?.status).toBe('needs_attention')
    expect(stageItem(org.orgTenantId)?.actionPath).toBe('/organization/actors')
  })

  test('an org-wide chain that names the owner role makes the stage explicitly configured', () => {
    orgWorkflowActorService.savePolicy(org.orgTenantId, { defaultChain: [{ type: 'role', value: 'owner' }] })

    const actor = resolve(org.orgTenantId)
    expect(actor.mode).toBe('policy_fallback')
    expect(actor.userId).toBe(org.ownerUserId)
    expect(actor.via).toEqual({ type: 'role', value: 'owner' })
    expect(stageItem(org.orgTenantId)?.status).toBe('ready')
  })

  test('a per-stage chain naming a member wins over the org-wide chain', () => {
    const clerkPerson = addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'clerk' })
    expect(clerkPerson).toBeTruthy()
    const clerk = orgWorkflowActorService.listOrgMembers(org.orgTenantId).find((m) => m.role === 'clerk')
    expect(clerk).toBeDefined()

    orgWorkflowActorService.savePolicy(org.orgTenantId, {
      stageChains: { [STAGE]: [{ type: 'user', value: clerk!.userId, label: 'Clerk' }] },
    })

    const actor = resolve(org.orgTenantId)
    expect(actor.mode).toBe('policy_fallback')
    expect(actor.userId).toBe(clerk!.userId)
    expect(actor.via?.type).toBe('user')

    // Other stages still use the org-wide chain.
    expect(resolve(org.orgTenantId, 'trigger_payout').userId).toBe(org.ownerUserId)
  })

  test('chain entries that do not resolve are skipped in order', () => {
    orgWorkflowActorService.savePolicy(org.orgTenantId, {
      stageChains: {
        [STAGE]: [
          { type: 'user', value: 'user-does-not-exist' },
          { type: 'role', value: 'nobody_has_this_role' },
          { type: 'role', value: 'clerk' },
        ],
      },
    })
    const actor = resolve(org.orgTenantId)
    expect(actor.mode).toBe('policy_fallback')
    expect(actor.role).toBe('clerk')
  })

  test('a saved stage default beats every fallback chain; clearing it restores the chain', () => {
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: WORKFLOW,
      stageAction: STAGE,
      defaultRole: 'owner',
    })
    expect(resolve(org.orgTenantId).mode).toBe('configured_role')

    expect(orgWorkflowActorService.deleteDefault(org.orgTenantId, 'field_execution', STAGE)).toBe(true)
    expect(resolve(org.orgTenantId).mode).toBe('policy_fallback')
  })

  test('built-in role order can be switched off; owner fallback can be disabled', () => {
    const strict = seedOrganization({ name: 'Strict Ltd' })
    addRole(strict.organizationId, 'Field Worker')
    configureFeptTemplate(strict.orgTenantId)
    addMember({ orgTenantId: strict.orgTenantId, organizationId: strict.organizationId, role: 'field_worker' })

    // Built-in order routes assign_field_worker to the field_worker member.
    expect(resolve(strict.orgTenantId).mode).toBe('role_fallback')

    orgWorkflowActorService.savePolicy(strict.orgTenantId, { useBuiltInRoleFallbacks: false })
    expect(resolve(strict.orgTenantId).mode).toBe('owner_fallback')

    orgWorkflowActorService.savePolicy(strict.orgTenantId, { ownerFallbackEnabled: false })
    const actor = resolve(strict.orgTenantId)
    expect(actor.mode).toBe('unassigned')
    expect(actor.userId).toBeUndefined()

    const item = stageItem(strict.orgTenantId)
    expect(item?.status).toBe('needs_attention')
    expect(item?.reason).toMatch(/owner fallback is disabled/)

    // Re-enabling built-in order resolves it again without touching the owner switch.
    orgWorkflowActorService.savePolicy(strict.orgTenantId, { useBuiltInRoleFallbacks: true })
    expect(resolve(strict.orgTenantId).mode).toBe('role_fallback')
    expect(orgWorkflowActorService.getPolicy(strict.orgTenantId).ownerFallbackEnabled).toBe(false)
  })

  test('savePolicy sanitises chains and role options include org roles and membership roles', () => {
    const saved = orgWorkflowActorService.savePolicy(org.orgTenantId, {
      defaultChain: [
        { type: 'role', value: ' Owner ' },
        { type: 'role', value: 'owner' }, // duplicate
        { type: 'bogus' as any, value: 'x' },
        { type: 'user', value: '' },
      ],
    })
    expect(saved.defaultChain).toEqual([{ type: 'role', value: 'owner' }])

    const roles = orgWorkflowActorService.listRoleOptions(org.orgTenantId)
    expect(roles).toContain('owner')
    expect(roles).toContain('clerk')
    expect(roles).toContain('field_worker')
  })

  test('a purchase-request setup chooses one confirmation or two, and names the roles', () => {
    expect(requisitionApprovalSignMode(orgWorkflowActorService.getPolicy(org.orgTenantId))).toBe('both')

    orgWorkflowActorService.applyPreset(org.orgTenantId, 'director_signs_once')
    expect(requisitionApprovalSignMode(orgWorkflowActorService.getPolicy(org.orgTenantId))).toBe('one')
    const once = orgWorkflowActorService.listDefaults(org.orgTenantId, 'internal_requisitions')
    expect(once.find((row) => row.stageAction === 'approve_requisition')?.defaultRole).toBe('director')
    expect(once.find((row) => row.stageAction === 'release_funds')?.defaultRole).toBe('finance_manager')

    orgWorkflowActorService.applyPreset(org.orgTenantId, 'finance_team')
    expect(requisitionApprovalSignMode(orgWorkflowActorService.getPolicy(org.orgTenantId))).toBe('both')
    const team = orgWorkflowActorService.listDefaults(org.orgTenantId, 'internal_requisition_approval')
    expect(team.find((row) => row.stageAction === 'approve_requisition')?.defaultRole).toBe('manager')
    expect(team.find((row) => row.stageAction === 'finance_approve_requisition')?.defaultRole).toBe('finance_manager')
    expect(team.find((row) => row.stageAction === 'release_funds')?.defaultRole).toBe('director')
  })
})

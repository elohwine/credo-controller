import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { cardCoversStep } from '../src/services/ActorCredentialProofService'
import { stageProofService } from '../src/services/ssi/StageProofService'
import { buildStageProofDcqlQuery } from '../src/services/ssi/stageProofQuery'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-stage-actor-cards-')
})
afterAll(() => databases.cleanup())

/** A field job paused for sign-off, with the people chosen while it ran kept in its state. */
function fieldJob() {
  const org = seedOrganization()
  const worker = addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'field_worker' })
  const workflowId = `tpl-fept-field-execution-${org.orgTenantId}`
  workflowRepository.save({
    id: workflowId,
    tenantId: org.orgTenantId,
    name: 'Field',
    category: 'field_execution_fept',
    provider: 'test',
    actions: [],
  })
  const run = workflowRunRepository.createRun({
    workflowId,
    tenantId: org.orgTenantId,
    status: 'paused',
    input: { requestId: 'FR-1' },
    output: {
      pauseReason: 'await_acknowledgement',
      jobActors: { receiverId: org.ownerUserId },
      assignment: { assigneeId: worker },
    },
  })
  return { org, worker, run }
}

function card(userId: string, stageActions: string[], orgTenantId: string): any {
  return {
    queryId: 'staff',
    claimFormat: 'dc+sd-jwt',
    record: { id: `card-${userId}` },
    disclosed: { userId, orgTenantId, stageActions, employmentStatus: 'active' },
    withheld: {},
    types: ['EmployeeCredential'],
    orgTenantId,
  }
}

describe('who may use a card for a step', () => {
  test('the sign-off person saved on the job (not in the original request) is named for it', () => {
    const { org, worker, run } = fieldJob()
    expect(stageProofService.namedPersonOnRun(run.id, 'acknowledge_execution')).toBe(org.ownerUserId)
    expect(stageProofService.namedPersonOnRun(run.id, 'capture_evidence')).toBe(worker)
  })

  test('owner and named sign-off person are offered their card even when it lists other steps', () => {
    const { org, worker, run } = fieldJob()
    const allowed = stageProofService.stageActorIds(run.id, 'acknowledge_execution')
    expect(allowed).toContain(org.ownerUserId)
    expect(allowed).not.toContain(worker)

    const { kept, dropped } = stageProofService.presentableCandidates(
      [
        card(org.ownerUserId, ['approve_requisition', 'release_funds'], org.orgTenantId),
        card(worker, ['capture_evidence'], org.orgTenantId),
      ],
      'acknowledge_execution',
      allowed,
    )
    expect(kept.map((c) => c.disclosed.userId)).toEqual([org.ownerUserId])
    expect(dropped.stage).toBe(1)
  })

  test('a step with no job (purchase request approval) still lets the owner present', () => {
    const { org } = fieldJob()
    expect(stageProofService.stageActorIds(undefined, 'approve_requisition', org.orgTenantId)).toContain(
      org.ownerUserId,
    )
  })

  test('the wallet request accepts the card of anyone allowed to do the step', () => {
    const query = buildStageProofDcqlQuery({
      acceptedVcTypes: ['EmployeeCredential'],
      orgTenantId: 'org-1',
      stageAction: 'acknowledge_execution',
      namedUserId: ['owner-1', 'approver-1', 'owner-1'],
    })
    const person = query.credentials[0].claims.find((claim: any) => claim.id === 'person')
    expect(person.values).toEqual(['owner-1', 'approver-1'])
    expect(query.credentials[0].claim_sets).toContainEqual(['org', 'status', 'person'])
  })

  test('the proof check accepts a card whose holder is on the allowed list', () => {
    const subject = { userId: 'approver-1', stageActions: ['approve_requisition'] }
    expect(cardCoversStep(subject, 'acknowledge_execution', ['owner-1', 'approver-1'])).toBe(true)
    expect(cardCoversStep(subject, 'acknowledge_execution', ['owner-1'])).toBe(false)
    expect(cardCoversStep(subject, 'acknowledge_execution', 'approver-1')).toBe(true)
    expect(cardCoversStep({ stageActions: ['x'] }, 'acknowledge_execution', [''])).toBe(false)
  })
})

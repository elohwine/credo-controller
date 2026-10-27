/**
 * A workflow the organisation onboarded itself inherits the job-flow architecture.
 *
 * The template names its own step (`approve_shipment`). Nothing in the platform knows that word,
 * and it still has to behave like a job sign-off: the step appears under "Who does what", the card
 * lands in the chosen person's inbox, the run waits, the step can only be finished with a staff
 * card, and the accepted cards are the organisation's own.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../src/persistence/WorkflowTemplateRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { notificationService } from '../src/services/NotificationService'
import { orgWorkflowActorService } from '../src/services/OrgWorkflowActorService'
import { proofActionForStage, resolveAcceptedProofVcTypes, stageActionForProofAction } from '../src/services/ProofVcPolicyService'
import { assertRunResume, canAccessRun } from '../src/services/RunAccessPolicy'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { getDeclaredPrerequisites, prerequisiteItemKey } from '../src/services/workflow/prerequisites'
import { ORG_WORKFLOW_ACTOR_VC_TYPE } from '../src/config/credentials/OrgWorkflowActorVC'

import {
  addMember,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

const workflowTemplateRepository = new WorkflowTemplateRepository()
let databases: TestDatabases
let org: SeededOrganization
/** The member the organisation chooses for its own step. */
let approverUserId: string

const WORKFLOW_TYPE = 'shipment_release'
const STEP = 'approve_shipment'

function templateId() {
  return `${WORKFLOW_TYPE}-${org.orgTenantId}`
}

function stepsOfTemplate() {
  return [
    {
      action: 'stage.await_actor',
      description: 'Someone approves the shipment',
      config: { stageAction: STEP, title: 'Approve the shipment', workflowType: WORKFLOW_TYPE },
    },
    { action: 'trust.update_score', description: 'Record the outcome', config: {} },
  ]
}

function saveTemplate() {
  workflowTemplateRepository.save({
    id: templateId(),
    tenantId: org.orgTenantId,
    workflowType: WORKFLOW_TYPE,
    name: 'Shipment release',
    sector: 'custom',
    enabled: true,
    version: 1,
    steps: stepsOfTemplate(),
    paymentModes: [],
    credentialPolicy: { outputVCs: [], autoIssue: false },
    reconciliationPolicy: { mode: 'manual_close', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
    experience: { version: 1, family: 'requests', reviewAction: STEP },
  } as any)
  return workflowTemplateRepository.findById(templateId())!
}

function cardsFor(userId: string) {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT title, body, metadata FROM wallet_pending_offers
        WHERE issuer_tenant_id = ? AND source_type = 'workflow_stage_action' AND tenant_id = ?`,
    )
    .all(org.orgTenantId, `wallet-${userId}`) as Array<{ title: string; body: string; metadata: string }>
}

beforeAll(() => {
  databases = initTestDatabases('credo-custom-stage-')
  jest
    .spyOn(notificationService, 'dispatchContactNotification')
    .mockResolvedValue({ accepted: true, channels: [] } as any)
  org = seedOrganization({ name: 'Zambezi Freight' })
  approverUserId = `user-approver-${Date.now()}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: approverUserId, role: 'admin' })
  ActionRegistry.register('trust.update_score', async () => undefined)
  saveTemplate()
})

afterAll(() => {
  databases.cleanup()
})

describe('A workflow onboarded by the organisation uses the job-flow architecture', () => {
  test('the step the template named itself is asked for under "Who does what"', () => {
    const template = workflowTemplateRepository.findById(templateId())!
    const keys = getDeclaredPrerequisites(template, [WORKFLOW_TYPE]).map((item) => prerequisiteItemKey(item))
    expect(keys).toContain(`stage_actor:${STEP}`)
  })

  test('the step is implemented, so the catalogue is honest about it', () => {
    expect(ActionRegistry.missing(stepsOfTemplate())).toEqual([])
  })

  test('the run waits at the step and the card goes to the person chosen for it', async () => {
    orgWorkflowActorService.upsertDefault({
      orgTenantId: org.orgTenantId,
      workflowType: WORKFLOW_TYPE,
      stageAction: STEP,
      defaultUserId: approverUserId,
      defaultWalletTenantId: `wallet-${approverUserId}`,
    })

    const start = await workflowService.executeWorkflow(
      WORKFLOW_TYPE,
      { reference: 'SHP-7', amount: 400, currency: 'USD' },
      org.orgTenantId,
    )
    const run = workflowRunRepository.findRunById(start.runId)!
    expect(run.status).toBe('paused')
    expect(run.output.pauseReason).toBe(`await_stage:${STEP}`)
    expect(run.output.stageGate).toMatchObject({ stageAction: STEP, workflowType: WORKFLOW_TYPE, requireProof: true })

    const cards = cardsFor(approverUserId)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe('Approve the shipment')
    expect(JSON.parse(cards[0].metadata)).toMatchObject({ workflowRunId: start.runId, stageAction: STEP })
    // Plain words only: nobody reads a stage code or a credential type on a card.
    expect(`${cards[0].title} ${cards[0].body}`).not.toMatch(/await_stage|VC\b|presentation/i)
  })

  test('the chosen person sees the run, and the step is finished with a staff card, not a plain resume', async () => {
    const start = await workflowService.executeWorkflow(WORKFLOW_TYPE, { reference: 'SHP-8' }, org.orgTenantId)
    const run = workflowRunRepository.findRunById(start.runId)!

    expect(canAccessRun({ id: approverUserId, tenantId: `wallet-${approverUserId}` }, run)).toBe(true)
    expect(canAccessRun({ id: 'someone-else', tenantId: 'wallet-someone-else' }, run)).toBe(false)

    expect(() => assertRunResume({ id: approverUserId, tenantId: `wallet-${approverUserId}` }, run)).toThrow(
      /wallet proof/i,
    )
  })

  test('the step gets its own proof key, and the cards accepted are the organisation’s own', () => {
    const actionKey = proofActionForStage(STEP)
    expect(actionKey).toBe(`stage:${STEP}`)
    expect(stageActionForProofAction(actionKey!)).toBe(STEP)
    expect(resolveAcceptedProofVcTypes(org.orgTenantId, actionKey!)).toContain(ORG_WORKFLOW_ACTOR_VC_TYPE)
  })

  test('a built-in step keeps its own proof key, so job policy is untouched', () => {
    expect(proofActionForStage('acknowledge_execution', 'field_ack')).toBe('field_ack')
    expect(proofActionForStage('trigger_payout')).toBe('field_payout')
  })
})

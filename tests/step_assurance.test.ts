/**
 * Which steps need a fresh staff-card share (step assurance), and that a share is bound to the
 * record and amount it was started for.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { RequestController } from '../src/controllers/platform/RequestController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } from '../src/services/ProofVcPolicyService'
import { stageProofService } from '../src/services/ssi/StageProofService'
import { parseStepAssurance, resolveStepAssurance, stepAssuranceSteps } from '../src/services/stepAssurance'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-step-assurance-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `actor-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => databases.cleanup())
afterEach(() => jest.restoreAllMocks())

function purchaseOrg(name: string) {
  const org = seedOrganization({ name })
  const clerk = `user-${randomUUID()}`
  addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: clerk })
  return { ...org, clerk }
}

function raisePurchase(orgTenantId: string, requesterUserId: string, amount: number) {
  const created = platformRequestService.create({
    tenantId: orgTenantId,
    subjectRef: requesterUserId,
    requestType: 'procurement.requisition',
    title: 'Laptop bag',
    amount,
    currency: 'USD',
    targetModule: 'finance',
    context: { supplierRef: 'bags' },
    items: [{ description: 'Laptop bag', quantity: 1, unitPrice: amount }],
  }) as { id: string }
  platformRequestService.submit(created.id, orgTenantId, requesterUserId)
  return created.id
}

function decisionOf(orgTenantId: string, userId: string, requestId: string): any {
  const listed: any = platformRequestService.list(orgTenantId, userId)
  const items: any[] = Array.isArray(listed) ? listed : listed?.items || listed?.data || []
  return items.find((item) => item.id === requestId)?.decision
}

function asUser(tenantId: string, userId: string, orgRole = 'owner') {
  return { user: { tenantId, sub: userId, id: userId, orgRole }, headers: {}, agent: {} } as any
}

describe('step assurance policy', () => {
  test('defaults: approvals offer the card, job sign-off and payout always need it', () => {
    const policy = parseStepAssurance({})
    expect(policy.cardRequiredAbove).toBeNull()
    expect(resolveStepAssurance(policy, 'requisition_approval', 5000).mode).toBe('card_optional')
    expect(resolveStepAssurance(policy, 'field_ack').mode).toBe('card_required')
    expect(resolveStepAssurance(policy, 'field_payout').mode).toBe('card_required')
    expect(resolveStepAssurance(policy, 'hr_onboarding').mode).toBe('session')
    expect(resolveStepAssurance(policy, undefined).mode).toBe('session')
    expect(stepAssuranceSteps(policy).find((step) => step.actionKey === 'field_ack')?.locked).toBe(true)
  })

  test('a limit makes card-optional steps need the card above it; unknown or locked keys cannot be changed', () => {
    const policy = parseStepAssurance({
      cardRequiredAbove: 100,
      steps: { requisition_approval: 'card_optional', field_ack: 'session', bogus: 'session' },
    })
    expect(policy.steps).toEqual({ requisition_approval: 'card_optional' })
    expect(resolveStepAssurance(policy, 'requisition_approval', 100).mode).toBe('card_optional')
    expect(resolveStepAssurance(policy, 'requisition_approval', 120)).toEqual({ mode: 'card_required', reason: 'over_limit' })
    expect(resolveStepAssurance(policy, 'field_ack').mode).toBe('card_required')
    expect(resolveStepAssurance(parseStepAssurance({ steps: { requisition_approval: 'session' } }), 'requisition_approval', 9999).mode).toBe('session')
  })

  test('the setting is saved with the proof policy', () => {
    const org = seedOrganization({ name: 'Assurance Save Ltd' })
    expect(getOrCreateOrgProofVcPolicy(org.orgTenantId).stepAssurance).toEqual({ cardRequiredAbove: null, steps: {} })
    updateOrgProofVcPolicy(org.orgTenantId, { stepAssurance: { cardRequiredAbove: 100, steps: { requisition_approval: 'card_required' } } })
    expect(getOrCreateOrgProofVcPolicy(org.orgTenantId).stepAssurance).toEqual({
      cardRequiredAbove: 100,
      steps: { requisition_approval: 'card_required' },
    })
  })
})

describe('enforcing the card on request approvals', () => {
  test('over the limit, plain approve is refused and only the staff card approves', async () => {
    const org = purchaseOrg('Card Limit Ltd')
    updateOrgProofVcPolicy(org.orgTenantId, { stepAssurance: { cardRequiredAbove: 100, steps: {} } })
    const small = raisePurchase(org.orgTenantId, org.clerk, 80)
    const large = raisePurchase(org.orgTenantId, org.clerk, 120)

    expect(decisionOf(org.orgTenantId, org.ownerUserId, small)).toMatchObject({ staffCard: true, cardRequired: false })
    expect(decisionOf(org.orgTenantId, org.ownerUserId, large)).toMatchObject({ staffCard: true, cardRequired: true })

    expect(platformRequestService.decideBySubject(small, org.orgTenantId, org.ownerUserId, 'approve')).toMatchObject({
      status: 'approved',
    })
    expect(() => platformRequestService.decideBySubject(large, org.orgTenantId, org.ownerUserId, 'approve')).toThrow(
      expect.objectContaining({ status: 403 }) as any,
    )
    const declined = raisePurchase(org.orgTenantId, org.clerk, 300)
    expect(
      platformRequestService.decideBySubject(declined, org.orgTenantId, org.ownerUserId, 'reject', 'Not in budget'),
    ).toMatchObject({ status: 'rejected' })

    jest.spyOn(stageProofService, 'verifyStageProof').mockImplementation(async (params) => ({
      requestId: params.requestId,
      holderDid: 'did:key:approver',
      presentedTypes: ['OrgMembershipVC'],
      actorProof: { present: true, valid: true } as any,
      verifiedAt: new Date().toISOString(),
    }))
    const approved = await new RequestController().staffCardComplete(asUser(org.orgTenantId, org.ownerUserId), large, {
      toStatus: 'approved',
      requestId: `proof-${randomUUID()}`,
    })
    expect(approved.status).toBe('approved')
  })

  test('session mode hides the card; a forged staffCard payload is not stored', () => {
    const org = purchaseOrg('Card Session Ltd')
    updateOrgProofVcPolicy(org.orgTenantId, { stepAssurance: { cardRequiredAbove: null, steps: { requisition_approval: 'session' } } })
    const requestId = raisePurchase(org.orgTenantId, org.clerk, 500)
    expect(decisionOf(org.orgTenantId, org.ownerUserId, requestId)).toMatchObject({ staffCard: false, cardRequired: false })

    platformRequestService.transitionBySubject(requestId, org.orgTenantId, org.ownerUserId, 'approved', {
      staffCard: { requestId: 'forged', actorCredential: true },
    })
    const event = DatabaseManager.getDatabase()
      .prepare(`SELECT payload_json FROM request_events WHERE request_id = ? AND to_status = 'approved' ORDER BY rowid DESC LIMIT 1`)
      .get(requestId) as { payload_json?: string }
    expect(JSON.parse(event?.payload_json || '{}').staffCard).toBeUndefined()
  })
})

describe('a share is bound to its record and amount', () => {
  function bind(sessionId: string, reference: string, amount: string) {
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO stage_proof_bindings (session_id, org_tenant_id, action_key, reference, amount, currency, created_at)
         VALUES (?, NULL, 'requisition_approval', ?, ?, 'USD', ?)`,
      )
      .run(sessionId, reference, amount, new Date().toISOString())
  }
  const check = (sessionId: string, reference: string, actionKey = 'requisition_approval') =>
    (stageProofService as any).assertStoredBinding(sessionId, actionKey, reference, 'approve_requisition')

  test('a share started for one request cannot finish another, or after the amount changed', () => {
    const org = purchaseOrg('Share Binding Ltd')
    const first = raisePurchase(org.orgTenantId, org.clerk, 120)
    const second = raisePurchase(org.orgTenantId, org.clerk, 120)
    bind('share-a', first, '120')

    expect(() => check('share-a', first)).not.toThrow()
    expect(() => check('share-a', second)).toThrow('This share was started for a different record.')
    expect(() => check('share-a', first, 'payment_record')).toThrow('This share was for a different step.')

    DatabaseManager.getDatabase().prepare(`UPDATE requests SET amount = 900 WHERE id = ?`).run(first)
    expect(() => check('share-a', first)).toThrow(expect.objectContaining({ status: 409 }) as any)
    // A share with no stored binding (started before this check existed) is judged by its signed data alone.
    expect(() => check('unknown-share', first)).not.toThrow()
  })

  test('the request, amount and currency go into what the wallet signs', () => {
    const org = purchaseOrg('Share Facts Ltd')
    const requestId = raisePurchase(org.orgTenantId, org.clerk, 75)
    expect((stageProofService as any).shareFacts(requestId, 'approve_requisition')).toEqual({
      request: requestId,
      amount: '75',
      currency: 'USD',
    })
  })
})

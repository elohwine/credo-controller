import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'
import express from 'express'
import request from 'supertest'
import { WorkflowController } from '../src/controllers/workflow/WorkflowController'
import { StatusException } from '../src/errors'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../src/persistence/IssuedCredentialRepository'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { FieldExecutionActions } from '../src/services/workflow/actions/FieldExecutionActions'
import { jobAssignmentOfferTtlMs, workflowVcOfferDispatcher } from '../src/services/workflow/WorkflowVcOfferDispatcher'
import { credentialIssuanceService, offerExpirationInSeconds } from '../src/services/CredentialIssuanceService'
import { fieldEvidenceResumePayload, assertFieldStepSucceeded } from '../credo-ui/shared/fieldEvidence'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-job-assignment-')
})
beforeEach(() => {
  jest.spyOn(orgWorkflowActorCredentialService, 'ensureActorCredentialInBackground').mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
})
afterAll(() => {
  databases.cleanup()
})

describe('dedicated job assignment record replacement', () => {
  test('issues to the actual worker, withdraws the old record, preserves progress and is replay-safe', async () => {
    const org = seedOrganization()
    const workerId = `worker-${org.orgTenantId}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerId,
      role: 'field_worker',
    })
    const workflowId = `field-${org.orgTenantId}`
    workflowRepository.save({
      id: workflowId,
      tenantId: org.orgTenantId,
      name: 'Field',
      category: 'field_execution_fept',
      provider: 'test',
      actions: [],
    })
    const legacyId = `legacy-${org.orgTenantId}`
    const run = workflowRunRepository.createRun({
      workflowId,
      tenantId: org.orgTenantId,
      status: 'paused',
      currentStep: 3,
      input: { reference: 'FR-TEST' },
      output: {
        workflowStage: 'ASSIGNED',
        pauseReason: 'await_worker_start',
        assignment: { assigneeId: workerId, assignedAt: new Date().toISOString() },
        issuedCredentials: { RequisitionVC: { offerId: legacyId, recipientStage: 'assign_field_worker' } },
      },
    })
    new IssuedCredentialRepository().save({
      id: legacyId,
      tenantId: org.orgTenantId,
      credentialId: `urn:uuid:${legacyId}`,
      credentialDefinitionId: 'RequisitionVC',
      credentialData: {},
      format: 'jwt_vc_json',
      revoked: false,
    })
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri, metadata, workflow_run_id, accepted_at)
       VALUES (?, ?, ?, 'workflow_vc_offer', ?, 'RequisitionVC', 'openid-credential-offer://legacy', ?, ?, ?)`,
      )
      .run(
        legacyId,
        `wallet-${workerId}`,
        org.orgTenantId,
        run.id,
        JSON.stringify({ offerId: legacyId }),
        run.id,
        new Date().toISOString(),
      )
    const issue = jest.spyOn(workflowVcOfferDispatcher, 'issueToHolder').mockResolvedValue({
      offerId: 'dedicated-offer',
      walletOfferId: 'dedicated-row',
      alreadySent: false,
    })
    const result = await FieldExecutionActions.replaceLegacyAssignmentRecord(run.id, org.ownerUserId)
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialType: 'JobAssignmentVC',
        walletTenantId: `wallet-${workerId}`,
        claims: expect.objectContaining({
          jobId: run.id,
          assignment: expect.objectContaining({ assigneeId: workerId }),
        }),
      }),
    )
    expect(new IssuedCredentialRepository().findById(legacyId)?.revoked).toBe(true)
    const saved = workflowRunRepository.findRunById(run.id)!
    expect(saved.status).toBe('paused')
    expect(saved.currentStep).toBe(3)
    expect(saved.output.pauseReason).toBe('await_worker_start')
    expect(saved.output.issuedCredentials.JobAssignmentVC.offerId).toBe('dedicated-offer')
    expect(saved.output.issuedCredentials.RequisitionVC.replacedBy).toBe('dedicated-offer')
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(
        org.orgTenantId,
        run.id,
        legacyId,
        workerId,
        'RequisitionVC',
      ),
    ).toThrow('current job assignment')
    expect(await FieldExecutionActions.replaceLegacyAssignmentRecord(run.id, org.ownerUserId)).toEqual(result)
    expect(issue).toHaveBeenCalledTimes(1)
    const oldOffer = DatabaseManager.getDatabase()
      .prepare('SELECT last_error FROM wallet_pending_offers WHERE id = ?')
      .get(legacyId) as { last_error: string }
    expect(oldOffer.last_error).toMatch(/^withdrawn: replaced by JobAssignmentVC/)
  })
})

describe('job assignment offer lifetime', () => {
  const DAY = 24 * 60 * 60
  function seedAssignedJob(status: 'paused' | 'cancelled' = 'paused') {
    const org = seedOrganization()
    const workerId = `worker-${org.orgTenantId}`
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: workerId,
      role: 'field_worker',
    })
    const workflowId = `field-${org.orgTenantId}`
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
      status,
      currentStep: 3,
      input: { reference: 'FR-TTL', location: 'Block B', amount: 50, currency: 'USD' },
      output: {
        assignment: { assigneeId: workerId, status: 'assigned' },
        issuedCredentials: { JobAssignmentVC: { offerId: 'first-offer', recipientStage: 'assign_field_worker' } },
      },
    })
    const wallet = `wallet-${workerId}`
    const offerUri = `http://localhost:4000/api/siop/initiateIssuance?credential_offer_uri=first-${run.id}`
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri, metadata, workflow_run_id)
       VALUES (?, ?, ?, 'workflow_vc_offer', ?, 'JobAssignmentVC', ?, ?, ?)`,
      )
      .run(
        `row-${run.id}`,
        wallet,
        org.orgTenantId,
        run.id,
        offerUri,
        JSON.stringify({ offerId: 'first-offer' }),
        run.id,
      )
    return { org, run, wallet, offerUri, workerId }
  }
  const openRows = (wallet: string) =>
    DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, offer_uri FROM wallet_pending_offers WHERE tenant_id = ? AND credential_type = 'JobAssignmentVC' AND resolved_at IS NULL`,
      )
      .all(wallet) as Array<{ id: string; offer_uri: string }>

  test('keeps assignment offers claimable for 30 days and honours the requested window', () => {
    expect(jobAssignmentOfferTtlMs()).toBe(30 * DAY * 1000)
    expect(offerExpirationInSeconds(jobAssignmentOfferTtlMs())).toBe(30 * DAY)
    expect(offerExpirationInSeconds(7 * DAY * 1000)).toBe(7 * DAY)
    expect(offerExpirationInSeconds()).toBe(30 * DAY)
  })

  test('passes the requested lifetime to the real issuer API option, not the access-token configuration', async () => {
    const create = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      credentialOffer: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      issuanceSession: { id: 'lifetime-offer', preAuthorizedCode: 'code' },
    })
    const endSession = jest.fn<() => Promise<void>>().mockResolvedValue()
    jest.spyOn(container, 'resolve').mockImplementation((token) => {
      expect(token).toBe(Agent)
      return {
        modules: {
          tenants: { getTenantAgent: async () => ({ endSession }) },
          openId4VcIssuer: {
            getAllIssuers: async () => [
              { issuerId: 'test', credentialConfigurationsSupported: { JobAssignmentVC_jwt_vc_json: {} } },
            ],
            createCredentialOffer: create,
          },
        },
      }
    })
    const before = Date.now()
    const result = await credentialIssuanceService.createOffer({
      tenantId: 'test',
      credentialType: 'JobAssignmentVC',
      claims: {},
      expiresInMs: 7 * DAY * 1000,
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ expirationInSeconds: 7 * DAY }))
    expect(create.mock.calls[0][0].preAuthorizedCodeFlowConfig).not.toHaveProperty('tokenStatusConfig')
    expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(before + 7 * DAY * 1000)
    expect(endSession).toHaveBeenCalledTimes(1)
  })

  test('registers the assignment model on first use by a fresh organisation', async () => {
    const { org } = seedAssignedJob()
    const create = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      credentialOffer: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ffirst',
      issuanceSession: { id: 'first-use-offer', preAuthorizedCode: 'code' },
    })
    const issuer = {
      issuerId: 'fresh-issuer',
      credentialConfigurationsSupported: { GenericID_jwt_vc_json: {} } as Record<string, unknown>,
    }
    const endSession = jest.fn<() => Promise<void>>().mockResolvedValue()
    const update = jest
      .fn<(input: { credentialConfigurationsSupported: Record<string, unknown> }) => Promise<void>>()
      .mockImplementation(async (input) => {
        issuer.credentialConfigurationsSupported = input.credentialConfigurationsSupported
      })
    jest.spyOn(container, 'resolve').mockImplementation(() => ({
      modules: {
        tenants: { getTenantAgent: async () => ({ endSession }) },
        openId4VcIssuer: {
          getAllIssuers: async () => [issuer],
          updateIssuerMetadata: update,
          createCredentialOffer: create,
        },
      },
    }))
    const result = await credentialIssuanceService.createOffer({
      tenantId: org.orgTenantId,
      credentialType: 'JobAssignmentVC',
      claims: {},
    })
    expect(result.offerId).toBe('first-use-offer')
    expect(update).toHaveBeenCalled()
    expect(issuer.credentialConfigurationsSupported).toHaveProperty('GenericID_jwt_vc_json')
    expect(issuer.credentialConfigurationsSupported).toHaveProperty('JobAssignmentVC_jwt_vc_json')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationIds: ['JobAssignmentVC_jwt_vc_json'],
      }),
    )
    expect(endSession).toHaveBeenCalledTimes(1)
  })

  test('issuer-side checks reject stale assignment offers even outside the app accept endpoint', () => {
    const { run, org, workerId, wallet, offerUri } = seedAssignedJob()
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(org.orgTenantId, run.id, 'first-offer', workerId),
    ).not.toThrow()
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent('foreign', run.id, 'first-offer', workerId),
    ).toThrow('current')
    workflowRunRepository.updateRun(run.id, { status: 'cancelled' })
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(org.orgTenantId, run.id, 'first-offer', workerId),
    ).toThrow('cancelled')
    expect(workflowVcOfferDispatcher.checkJobAssignmentOffer(wallet, offerUri)).toMatchObject({
      outcome: 'not_current',
    })
  })

  test('preserves named external-worker eligibility but revokes explicitly inactive members', () => {
    const { run, org, workerId, wallet, offerUri } = seedAssignedJob()
    DatabaseManager.getDatabase()
      .prepare('UPDATE org_memberships SET status = ? WHERE user_id = ?')
      .run('inactive', workerId)
    expect(workflowVcOfferDispatcher.checkJobAssignmentOffer(wallet, offerUri).outcome).toBe('not_current')
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(org.orgTenantId, run.id, 'first-offer', workerId),
    ).toThrow('inactive organization membership')
    const external = seedAssignedJob()
    DatabaseManager.getDatabase().prepare('DELETE FROM org_memberships WHERE user_id = ?').run(external.workerId)
    expect(workflowVcOfferDispatcher.checkJobAssignmentOffer(external.wallet, external.offerUri).outcome).toBe(
      'current',
    )
    expect(() =>
      workflowVcOfferDispatcher.assertAssignmentIssuanceCurrent(
        external.org.orgTenantId,
        external.run.id,
        'first-offer',
        external.workerId,
      ),
    ).not.toThrow()
  })

  test('concurrent renewal of the same offer creates only one replacement', async () => {
    const { run, wallet, offerUri } = seedAssignedJob()
    const create = jest.spyOn(credentialIssuanceService, 'createOffer').mockResolvedValue({
      offerId: 'concurrent-offer',
      preAuthorizedCode: '',
      credential_offer_uri: 'https://issuer.example/new',
      credential_offer_deeplink: `https://issuer.example/new-${run.id}`,
      expiresAt: '',
      credentialType: ['JobAssignmentVC'],
    })
    const results = await Promise.all([
      workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri),
      workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri),
    ])
    expect(results.map((result) => result.outcome)).toEqual(['reissued', 'not_current'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(openRows(wallet)).toHaveLength(1)
  })

  test('re-sends an unclaimed current assignment once, to the same worker, with the long lifetime', async () => {
    const { run, wallet, offerUri } = seedAssignedJob()
    const create = jest.spyOn(credentialIssuanceService, 'createOffer').mockResolvedValue({
      offerId: 'second-offer',
      preAuthorizedCode: '',
      credential_offer_uri: 'x',
      credential_offer_deeplink: `http://localhost:4000/api/siop/initiateIssuance?credential_offer_uri=second-${run.id}`,
      expiresAt: '',
      credentialType: ['VerifiableCredential', 'JobAssignmentVC'],
    } as any)
    const result = await workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri)
    expect(result).toEqual(expect.objectContaining({ outcome: 'reissued', offerId: 'second-offer' }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialType: 'JobAssignmentVC',
        tenantId: run.tenantId,
        expiresInMs: 30 * DAY * 1000,
        claims: expect.objectContaining({
          jobId: run.id,
          reference: 'FR-TTL',
          assignment: expect.objectContaining({ status: 'assigned' }),
        }),
      }),
    )
    const saved = workflowRunRepository.findRunById(run.id)!
    expect(saved.output.issuedCredentials.JobAssignmentVC).toEqual(
      expect.objectContaining({ offerId: 'second-offer', reissuedFrom: 'first-offer' }),
    )
    expect(openRows(wallet)).toEqual([expect.objectContaining({ offer_uri: expect.stringContaining('second-') })])

    // The superseded link is never re-sent again.
    expect(await workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri)).toEqual(
      expect.objectContaining({ outcome: 'not_current' }),
    )
    expect(create).toHaveBeenCalledTimes(1)
    expect(openRows(wallet)).toHaveLength(1)
  })

  test.each([
    [
      'reassigned',
      (run: any) =>
        workflowRunRepository.updateRun(run.id, {
          output: { ...run.output, assignment: { assigneeId: 'someone-else' } },
        }),
      /assigned to someone else/,
    ],
    [
      'replaced',
      (run: any) =>
        workflowRunRepository.updateRun(run.id, {
          output: { ...run.output, issuedCredentials: { JobAssignmentVC: { offerId: 'newer' } } },
        }),
      /newer assignment record/,
    ],
  ])('does not re-send a %s assignment and withdraws it from the inbox', async (_label, change, reason) => {
    const { run, wallet, offerUri } = seedAssignedJob()
    change(run)
    const create = jest.spyOn(credentialIssuanceService, 'createOffer')
    const result = await workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri)
    expect(result.outcome).toBe('not_current')
    expect((result as any).reason).toMatch(reason)
    expect(create).not.toHaveBeenCalled()
    expect(openRows(wallet)).toHaveLength(0)
  })

  test('does not re-send for a cancelled job', async () => {
    const { wallet, offerUri } = seedAssignedJob('cancelled')
    const create = jest.spyOn(credentialIssuanceService, 'createOffer')
    expect(await workflowVcOfferDispatcher.reissueJobAssignmentOffer(wallet, offerUri)).toEqual({
      outcome: 'not_current',
      reason: 'the job was cancelled',
    })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('job assignment record follows a reassigned job', () => {
  function seedJob(issued: Record<string, any> | undefined, acceptedOld = false) {
    const org = seedOrganization()
    const first = `first-${org.orgTenantId}`
    const relief = `relief-${org.orgTenantId}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: first, role: 'field_worker' })
    addMember({
      orgTenantId: org.orgTenantId,
      organizationId: org.organizationId,
      userId: relief,
      role: 'field_worker',
    })
    const workflowId = `field-${org.orgTenantId}`
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
      currentStep: 3,
      input: { reference: 'FR-MOVE', location: 'Block C' },
      output: {
        workflowStage: 'ASSIGNED',
        pauseReason: 'await_worker_start',
        assignment: { assigneeId: first, status: 'assigned' },
        ...(issued ? { issuedCredentials: { JobAssignmentVC: issued } } : {}),
      },
    })
    if (issued?.offerId) {
      DatabaseManager.getDatabase()
        .prepare(
          `INSERT INTO wallet_pending_offers (id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri, metadata, workflow_run_id, accepted_at)
         VALUES (?, ?, ?, 'workflow_vc_offer', ?, 'JobAssignmentVC', 'openid-credential-offer://old', ?, ?, ?)`,
        )
        .run(
          `old-row-${run.id}`,
          `wallet-${first}`,
          org.orgTenantId,
          run.id,
          JSON.stringify({ offerId: issued.offerId }),
          run.id,
          acceptedOld ? new Date().toISOString() : null,
        )
      if (acceptedOld) {
        new IssuedCredentialRepository().save({
          id: issued.offerId,
          tenantId: org.orgTenantId,
          credentialId: `urn:uuid:${issued.offerId}`,
          credentialDefinitionId: 'JobAssignmentVC',
          credentialData: {},
          format: 'jwt_vc_json',
          revoked: false,
        })
      }
    }
    return { org, run, first, relief }
  }
  const mockOffer = (offerId: string) =>
    jest.spyOn(credentialIssuanceService, 'createOffer').mockResolvedValue({
      offerId,
      preAuthorizedCode: '',
      credential_offer_uri: 'x',
      credential_offer_deeplink: `http://localhost:4000/api/siop/initiateIssuance?credential_offer_uri=${offerId}`,
      expiresAt: '',
      credentialType: ['VerifiableCredential', 'JobAssignmentVC'],
    } as any)
  const rowsFor = (wallet: string, runId: string) =>
    DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, resolved_at, last_error FROM wallet_pending_offers WHERE tenant_id = ? AND workflow_run_id = ? AND credential_type = 'JobAssignmentVC'`,
      )
      .all(wallet, runId) as Array<{ id: string; resolved_at: string | null; last_error: string | null }>

  test('withdraws the unsaved record and sends one to the new worker, once', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const { org, run, first, relief } = seedJob({
      offerId: `old-${Date.now()}`,
      recipientStage: 'assign_field_worker',
      recipientUserId: 'x',
    })
    const create = mockOffer(`new-${run.id}`)
    const moved = await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    expect(moved).toEqual(expect.objectContaining({ assigneeId: relief, assignmentRecord: 'transferred' }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialType: 'JobAssignmentVC',
        subjectDid: `did:key:${relief}`,
        claims: expect.objectContaining({ jobId: run.id, assignment: expect.objectContaining({ assigneeId: relief }) }),
      }),
    )
    expect(rowsFor(`wallet-${first}`, run.id)).toEqual([
      expect.objectContaining({ last_error: 'withdrawn: the job was reassigned to another worker' }),
    ])
    expect(rowsFor(`wallet-${relief}`, run.id)).toEqual([
      expect.objectContaining({ resolved_at: null, last_error: null }),
    ])
    const record = workflowRunRepository.findRunById(run.id)!.output.issuedCredentials.JobAssignmentVC
    expect(record).toEqual(
      expect.objectContaining({ offerId: `new-${run.id}`, recipientUserId: relief, replacedReason: 'reassigned' }),
    )

    // Replaying the transfer changes nothing.
    expect(await workflowVcOfferDispatcher.transferJobAssignmentRecord(run.id)).toEqual({
      outcome: 'already_current',
      offerId: `new-${run.id}`,
    })
    expect(create).toHaveBeenCalledTimes(1)
    expect(rowsFor(`wallet-${relief}`, run.id)).toHaveLength(1)
  })

  test('revokes a record the previous worker already saved', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const offerId = `saved-${Date.now()}`
    const { org, run, relief } = seedJob({ offerId, recipientStage: 'assign_field_worker' }, true)
    mockOffer(`new-${run.id}`)
    await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    const old = new IssuedCredentialRepository().findById(offerId)!
    expect(old.revoked).toBe(true)
  })

  test('revokes a saved assignment even when its inbox row is no longer available', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const offerId = `saved-without-inbox-${Date.now()}`
    const { org, run, relief } = seedJob({ offerId, recipientStage: 'assign_field_worker' }, true)
    DatabaseManager.getDatabase().prepare('DELETE FROM wallet_pending_offers WHERE workflow_run_id = ?').run(run.id)
    mockOffer(`new-${run.id}`)
    await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    expect(new IssuedCredentialRepository().findById(offerId)?.revoked).toBe(true)
  })

  test('reports record transfer failure explicitly and retries without repeating the reassignment', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const { org, run, first, relief } = seedJob(
      { offerId: `failed-${Date.now()}`, recipientStage: 'assign_field_worker' },
      true,
    )
    const create = mockOffer(`retry-${run.id}`)
    create.mockRejectedValueOnce(new Error('Issuer unavailable'))
    await expect(workflowService.reassignRun(run.id, relief, org.ownerUserId)).rejects.toThrow('job was reassigned')
    expect(rowsFor(`wallet-${first}`, run.id)[0].last_error).toMatch(/^withdrawn:/)
    expect(workflowRunRepository.findRunById(run.id)?.output.assignment.assigneeId).toBe(relief)
    const result = await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    expect(result.assignmentRecord).toBe('transferred')
    expect(workflowRunRepository.findRunById(run.id)?.output.reassignments).toHaveLength(1)
    expect(rowsFor(`wallet-${relief}`, run.id)).toHaveLength(1)
  })

  test('does nothing when the job has not issued an assignment record yet', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const { org, run, relief } = seedJob(undefined)
    const create = jest.spyOn(credentialIssuanceService, 'createOffer')
    const moved = await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    expect(moved.assignmentRecord).toBe('not_issued_yet')
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ credentialType: 'JobAssignmentVC' }))
  })

  describe('assignment replacement endpoint access', () => {
    test('rejects a worker, another tenant and revoked admin membership before issuance', async () => {
      const org = seedOrganization()
      const worker = `worker-${org.orgTenantId}`
      addMember({ ...org, userId: worker, role: 'field_worker' })
      const workflowId = `auth-${org.orgTenantId}`
      workflowRepository.save({
        id: workflowId,
        tenantId: org.orgTenantId,
        name: 'Field',
        category: 'field_execution_fept',
        provider: 'test',
        actions: [],
      })
      const run = workflowRunRepository.createRun({ workflowId, tenantId: org.orgTenantId, status: 'paused' })
      const app = express()
      app.post('/runs/:id/replace', async (req, res, next) => {
        Object.assign(req, { user: { id: req.header('x-user'), tenantId: req.header('x-tenant') } })
        try {
          res.json(await new WorkflowController().replaceAssignmentRecord(String(req.params.id), req))
        } catch (error) {
          next(error)
        }
      })
      app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(error instanceof StatusException ? error.status : 500).json({ message: error.message })
      })
      const issue = jest.spyOn(workflowVcOfferDispatcher, 'issueToHolder')
      await request(app)
        .post(`/runs/${run.id}/replace`)
        .set('x-user', worker)
        .set('x-tenant', org.orgTenantId)
        .expect(403)
      await request(app)
        .post(`/runs/${run.id}/replace`)
        .set('x-user', org.ownerUserId)
        .set('x-tenant', 'foreign')
        .expect(404)
      DatabaseManager.getDatabase()
        .prepare(`UPDATE org_memberships SET status = 'inactive' WHERE user_id = ?`)
        .run(org.ownerUserId)
      await request(app)
        .post(`/runs/${run.id}/replace`)
        .set('x-user', org.ownerUserId)
        .set('x-tenant', org.orgTenantId)
        .expect(403)
      expect(issue).not.toHaveBeenCalled()
    })
  })

  test('withdraws without re-sending when the organisation turned the record off', async () => {
    const { workflowService } = await import('../src/services/WorkflowService')
    const { org, run, first, relief } = seedJob({ offerId: `off-${Date.now()}`, recipientStage: 'assign_field_worker' })
    const db = DatabaseManager.getDatabase()
    const policy = JSON.stringify({ vcOfferModes: { JobAssignmentVC: 'disabled' } })
    const updated = db
      .prepare(
        `UPDATE workflow_templates SET credential_policy = ?, updated_at = datetime('now', '+1 minute') WHERE tenant_id = ? AND workflow_type = 'field_execution_fept'`,
      )
      .run(policy, org.orgTenantId)
    if (!updated.changes) {
      db.prepare(
        `INSERT INTO workflow_templates (id, tenant_id, name, workflow_type, sector, credential_policy, created_at, updated_at) VALUES (?, ?, 'Field', 'field_execution_fept', 'field', ?, datetime('now'), datetime('now'))`,
      ).run(`tpl-${org.orgTenantId}`, org.orgTenantId, policy)
    }
    const create = jest.spyOn(credentialIssuanceService, 'createOffer')
    const moved = await workflowService.reassignRun(run.id, relief, org.ownerUserId)
    expect(moved.assignmentRecord).toBe('withdrawn')
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ credentialType: 'JobAssignmentVC' }))
    expect(rowsFor(`wallet-${first}`, run.id)[0].last_error).toMatch(/^withdrawn:/)
    expect(rowsFor(`wallet-${relief}`, run.id)).toHaveLength(0)
  })
})

describe('shared portal and mobile evidence contract', () => {
  const photo = {
    imageBase64: 'dGVzdA==',
    mimeType: 'image/jpeg',
    gpsLat: -17.8,
    gpsLng: 31.0,
    timestamp: '2026-10-15T12:00:00.000Z',
    sha256: 'hash',
    notes: 'E2E test photo',
  }
  test('sends time, location, image and hash without inventing evidence', () => {
    expect(fieldEvidenceResumePayload(photo, 'before')).toEqual(
      expect.objectContaining({
        photoUri: 'data:image/jpeg;base64,dGVzdA==',
        evidenceHash: 'hash',
        gps: { lat: -17.8, lng: 31.0 },
        deviceCapturedAt: photo.timestamp,
        phase: 'before',
      }),
    )
    expect(fieldEvidenceResumePayload(photo, 'concealed').phase).toBe('concealed')
  })
  test('requires location for before, concealed-work and after photos', () => {
    for (const phase of ['before', 'concealed', 'after'] as const) {
      expect(() => fieldEvidenceResumePayload({ ...photo, gpsLat: null }, phase)).toThrow('location')
    }
  })
  test('does not report an HTTP-200 failed workflow as success', () => {
    expect(() => assertFieldStepSucceeded({ status: 'failed', error: 'Wrong actor' })).toThrow('Wrong actor')
    expect(() => assertFieldStepSucceeded({ status: 'paused' })).not.toThrow()
  })
})

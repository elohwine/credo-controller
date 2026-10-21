import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import { StatusException } from '../src/errors'
import { PaymentLinkController } from '../src/controllers/payments/PaymentLinkController'
import { WorkflowController } from '../src/controllers/workflow/WorkflowController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { workflowRequestRepository } from '../src/persistence/WorkflowRequestRepository'
import { workflowService } from '../src/services/WorkflowService'
import { notificationService } from '../src/services/NotificationService'
import { credentialIssuanceService } from '../src/services/CredentialIssuanceService'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { workflowVcOfferDispatcher } from '../src/services/workflow/WorkflowVcOfferDispatcher'
import { FieldExecutionActions } from '../src/services/workflow/actions/FieldExecutionActions'
import { ClientPaymentActions } from '../src/services/workflow/actions/ClientPaymentActions'
import { paymentLinkService } from '../src/services/PaymentLinkService'
import { ShortlinkService } from '../src/services/ShortlinkService'
import { workflowReadinessService } from '../src/services/WorkflowReadinessService'
import { orgSetupProfileService } from '../src/services/OrgSetupProfileService'
import type { WorkflowActionContext } from '../src/services/workflow/ActionRegistry'
import { feptStages as portalStages } from '../credo-ui/portal/components/finance/financeStages'
import { actorDisplay as mobileActorDisplay, feptStages as mobileStages } from '../credo-ui/mobile/lib/uxCopy'
import { fieldJobBillingExceptions, clientBillingStages } from '../credo-ui/shared/fieldJobOutcomes'
import {
  buildJobAuditTrail as portalHistory,
  auditTableRows as portalTable,
  closeoutSummary as portalCloseout,
  stageRelatedWork as portalRelatedWork,
  trailFromRequest as portalRequestHistory,
  financePathForChainMember as portalRelatedPath,
} from '../credo-ui/portal/components/finance/jobAuditTrail'
import {
  buildJobAuditTrail as mobileHistory,
  auditTableRows as mobileTable,
  closeoutSummary as mobileCloseout,
  jobSheetEvidence,
  stageRelatedWork as mobileRelatedWork,
  trailFromRequest as mobileRequestHistory,
  financePathForChainMember as mobileRelatedPath,
} from '../credo-ui/mobile/lib/jobAuditTrail'
import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases
beforeAll(() => {
  databases = initTestDatabases('credo-job-alignment-')
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

describe('truthful portal/mobile progress, history and tables', () => {
  test('History closeout line counts not-needed steps and lists what is still to do, the same on both apps', () => {
    const trail = {
      reference: 'FR-1',
      title: 'Repair',
      status: 'paused',
      people: [],
      records: [],
      holds: [],
      stageChanges: [],
      steps: [
        { id: 'arrival', title: 'Arrival', status: 'done' as const, details: ['Location confirmed'], photos: [] },
        { id: 'concealed', title: 'Concealed-work photo', status: 'skipped' as const, details: [], photos: [] },
        { id: 'signoff', title: 'Customer sign-off', status: 'active' as const, details: [], photos: [] },
        { id: 'closed', title: 'Closed', status: 'pending' as const, details: [], photos: [] },
      ],
    }
    const expected = { settled: 2, total: 4, stillOpen: ['Customer sign-off', 'Closed'] }
    expect(portalCloseout(trail)).toEqual(expected)
    expect(mobileCloseout(trail)).toEqual(expected)
  })

  test('Job created step in History notes the client source documents logged at intake', () => {
    const run = (input: Record<string, unknown>) => ({ id: 'r1', status: 'running', input, output: { workflowInput: input } })
    const withDocs = run({ jobIntakeId: 'in-1', problemType: 'Leak', sourceAttachments: [{ id: 'a' }, { id: 'b' }] })
    for (const build of [portalHistory, mobileHistory]) {
      const created = build(withDocs, []).steps.find((step) => step.id === 'created')
      expect(created?.details).toEqual(expect.arrayContaining(['Problem: Leak', '2 client source documents attached']))
      const noDocs = build(run({ jobIntakeId: 'in-2' }), []).steps.find((step) => step.id === 'created')
      expect(noDocs?.details).toContain('No client source documents attached')
      const manual = build(run({}), []).steps.find((step) => step.id === 'created')
      expect(manual?.details.join(' ')).not.toMatch(/source document/)
    }
  })

  test.each(['Purchase request', 'Purchase order', 'Supplier bill', 'Payment request'])(
    '%s opens its own request rather than an organisation-wide list',
    (label) => {
      const item = { kind: 'request', id: 'child/a', label }
      expect(portalRelatedPath(item)).toBe('/requests?requestId=child%2Fa')
      expect(mobileRelatedPath(item)).toContain('requestId=child%2Fa')
      expect(portalRelatedPath({ kind: 'job', id: 'job-a', label: 'Job' })).toBe('/finance/job-cards?runId=job-a')
    },
  )
  test.each([
    ['portal', portalHistory, portalRelatedWork, portalRequestHistory],
    ['mobile', mobileHistory, mobileRelatedWork, mobileRequestHistory],
  ] as const)(
    '%s links existing steps to recorded relatives without manufacturing completion or events',
    (_name, history, relatedWork, requestHistory) => {
      const run = {
        status: 'paused',
        output: {
          workflowStage: 'RECEIPTS',
          handoffs: [
            {
              key: 'field_buy_materials',
              status: 'running',
              steps: [{ requestId: 'purchase-a', label: 'Purchase request', status: 'submitted' }],
            },
          ],
        },
      }
      const before = history({ ...run, output: { ...run.output, handoffs: [] } })
      const linked = history(run)
      expect(linked.steps.map(({ id, status, at }) => ({ id, status, at }))).toEqual(
        before.steps.map(({ id, status, at }) => ({ id, status, at })),
      )
      expect(relatedWork(linked).RECEIPTS).toEqual([{ kind: 'request', id: 'purchase-a', label: 'Purchase request' }])
      const child = requestHistory({
        id: 'purchase-a',
        status: 'submitted',
        family: {
          chain: [
            { kind: 'job', id: 'job-a', label: 'Job' },
            { kind: 'request', id: 'purchase-a', label: 'Purchase request', current: true },
            { kind: 'request', label: 'Future bill' },
          ],
          root: { kind: 'job', id: 'job-a', label: 'Job' },
        },
        events: [{ id: 'created', event_type: 'request.created', created_at: '2026-10-16T10:00:00Z' }],
      })
      expect(child.steps).toHaveLength(1)
      expect(child.steps[0]).toMatchObject({
        title: 'Raised',
        at: '2026-10-16T10:00:00Z',
        related: [{ kind: 'job', id: 'job-a', label: 'Job' }],
      })
      const chain = requestHistory({
        id: 'purchase-a',
        family: {
          chain: [
            { kind: 'job', id: 'job-a', label: 'Job' },
            { kind: 'request', id: 'purchase-a', label: 'Purchase request', current: true },
            { kind: 'request', id: 'bill-a', label: 'Supplier bill' },
          ],
        },
        events: [
          { id: 'raised', event_type: 'request.created', created_at: '2026-10-16T10:00:00Z' },
          {
            id: 'handoff',
            event_type: 'request.handoff',
            created_at: '2026-10-16T11:00:00Z',
            payload_json: JSON.stringify({ childRequestId: 'bill-a' }),
          },
          { id: 'other', event_type: 'request.handoff', payload: { childRequestId: 'unrelated' } },
        ],
      })
      expect(chain.steps).toHaveLength(3)
      expect(chain.steps[0].related).toEqual([{ kind: 'job', id: 'job-a', label: 'Job' }])
      expect(chain.steps[1]).toMatchObject({
        title: 'Next step started',
        at: '2026-10-16T11:00:00Z',
        related: [{ kind: 'request', id: 'bill-a', label: 'Supplier bill' }],
      })
      expect(chain.steps[2].related).toEqual([])
    },
  )
  const output = {
    workflowStage: 'RECONCILED',
    stageHistory: [{ stage: 'RECONCILED', at: '2026-10-15T12:00:00.000Z' }],
    evidenceReceipt: { skipped: true },
    payment: { status: 'not_needed' },
    receipt: { status: 'not_needed' },
    startedWorkflows: { 'tpl-payment-collection': { runId: 'billing', status: 'completed' } },
    clientBill: { status: 'not_sent', reason: 'No client phone on the job' },
    issuedCredentials: { SiteInspectionVC: { recipientUserId: 'worker' } },
  }
  test.each([
    ['portal', portalStages, portalHistory, portalTable],
    ['mobile', mobileStages, mobileHistory, mobileTable],
  ] as const)(
    '%s does not turn skipped steps or job closure into invoice/payment success',
    (_name, stages, history, table) => {
      const progress = stages('RECONCILED', output)
      for (const key of ['RECEIPTS', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED']) {
        expect(progress.find((step) => step.key === key)?.status).toBe('skipped')
      }
      expect(progress.find((step) => step.key === 'CLIENT_INVOICE')).toMatchObject({
        status: 'held',
        note: expect.stringContaining('No client phone'),
      })
      const trail = history({ status: 'completed', input: { amount: 50 }, output })
      for (const id of ['receipt', 'payment', 'receipt_issued'])
        expect(trail.steps.find((step) => step.id === id)?.status).toBe('skipped')
      expect(table(trail).find((row) => row.id === 'client_invoice')).toMatchObject({
        status: 'held',
        details: expect.arrayContaining([expect.stringContaining('No client phone')]),
      })
      expect(trail.records[0].to).toBe('Organisation records')
      expect(trail.steps.find((step) => step.id === 'closed')?.details.join(' ')).not.toContain('all matched up')
    },
  )
  test.each(['running', 'paused', 'completed'])('a %s child is not evidence an invoice was sent', (status) => {
    const state = { startedWorkflows: { 'tpl-payment-collection': { runId: 'child', status } } }
    expect(portalStages('RECONCILED', state).find((step) => step.key === 'CLIENT_INVOICE')?.status).toBe('active')
    expect(mobileHistory({ output: state }).steps.find((step) => step.id === 'client_invoice')?.status).toBe('active')
  })
  test('Money in shows an uninvoiced job/client without inventing debt or duplicating existing payment links', () => {
    const run = { id: 'job', input: { reference: 'FR-1', clientName: 'Avondale Flats', amount: 50 }, output }
    expect(fieldJobBillingExceptions([run], [])).toEqual([
      expect.objectContaining({
        runId: 'job',
        reference: 'FR-1',
        client: 'Avondale Flats',
        amount: 50,
        status: 'NOT INVOICED',
        debtRecorded: false,
        note: expect.stringContaining('No client phone'),
      }),
    ])
    expect(fieldJobBillingExceptions([run], [{ id: 'link', sourceRunId: 'job' }])).toEqual([])
    expect(fieldJobBillingExceptions([{ ...run, output: {} }], [])).toEqual([])
  })
  test('billing stages keep receivable, delivery and confirmed payment separate', () => {
    expect(clientBillingStages({ output })[0]).toMatchObject({ status: 'held', note: 'No client phone on the job' })
    const link = {
      obligationId: 'debt',
      status: 'active',
      createdAt: '2026-10-15T12:00:00Z',
      notification: { accepted: false },
    }
    expect(clientBillingStages(undefined, link).map((stage) => stage.status)).toEqual(['done', 'held', 'pending'])
    expect(clientBillingStages(undefined, link)[0].at).toBe(link.createdAt)
    expect(
      clientBillingStages(undefined, { ...link, notification: { accepted: true } }).map((stage) => stage.status),
    ).toEqual(['done', 'done', 'pending'])
    expect(clientBillingStages(undefined, { ...link, status: 'paid' })[2].status).toBe('done')
  })
  test('job detail sheets do not turn skipped materials into a receipt or org records into personal records', () => {
    const sheets = jobSheetEvidence(output)
    expect(sheets.receiptCount).toBe(0)
    expect(sheets.receiptPhotos).toEqual([])
    expect(sheets.records.find((record) => record.type === 'SiteInspectionVC')?.to).toBe('Organisation records')
  })
})

describe('current same-tenant billing projection', () => {
  test('reads actual child outcome without rewriting the original launch snapshot', async () => {
    const org = seedOrganization()
    const workflowId = `projection-${org.orgTenantId}`
    workflowRepository.save({
      id: workflowId,
      tenantId: org.orgTenantId,
      name: 'Projection',
      category: 'field_execution_fept',
      provider: 'test',
      actions: [],
    })
    const parent = workflowRunRepository.createRun({ workflowId, tenantId: org.orgTenantId, status: 'completed' })
    const child = workflowRunRepository.createRun({
      workflowId,
      tenantId: org.orgTenantId,
      status: 'completed',
      input: { parentRunId: parent.id },
      output: { clientBill: { status: 'not_sent', reason: 'No client phone on the job' } },
    })
    workflowRunRepository.updateRun(parent.id, {
      output: { startedWorkflows: { 'tpl-payment-collection': { runId: child.id, status: 'running' } } },
    })
    expect((await workflowService.getRunStatus(parent.id)).output.clientBill.status).toBe('not_sent')
    expect(
      (await workflowService.listRuns(org.orgTenantId)).find((run) => run.id === parent.id)?.output.startedWorkflows[
        'tpl-payment-collection'
      ].status,
    ).toBe('completed')
    expect(workflowRunRepository.findRunById(parent.id)?.output.startedWorkflows['tpl-payment-collection'].status).toBe(
      'running',
    )
    const foreign = seedOrganization()
    workflowRunRepository.updateRun(parent.id, {
      output: { startedWorkflows: { 'tpl-payment-collection': { runId: child.id } } },
    })
    DatabaseManager.getDatabase()
      .prepare('UPDATE workflow_runs SET tenant_id = ? WHERE id = ?')
      .run(foreign.orgTenantId, child.id)
    expect((await workflowService.getRunStatus(parent.id)).output.clientBill).toBeUndefined()
  })
})

describe('continuation routing', () => {
  test('keeps the same job, updates the action, resolves old tasks, and is retry-safe', async () => {
    const org = seedOrganization()
    const worker = `worker-${org.orgTenantId}`
    addMember({ ...org, userId: worker, role: 'field_worker' })
    const context: WorkflowActionContext = {
      workflowId: 'field',
      workflowType: 'field_execution_fept',
      tenantId: org.orgTenantId,
      runId: `run-${org.orgTenantId}`,
      input: { reference: 'FR-CONTINUE', assigneeId: worker },
      state: { assignment: { assigneeId: worker }, workflowStage: 'ASSIGNED' },
    }
    await expect(FieldExecutionActions.pause(context, { reason: 'await_worker_start' })).rejects.toThrow(
      'WORKFLOW_PAUSE',
    )
    await expect(FieldExecutionActions.pause(context, { reason: 'await_arrival' })).rejects.toThrow('WORKFLOW_PAUSE')
    await expect(FieldExecutionActions.pause(context, { reason: 'await_arrival' })).rejects.toThrow('WORKFLOW_PAUSE')
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT tenant_id, source_id, title, body, metadata, resolved_at FROM wallet_pending_offers
       WHERE source_type = 'workflow_stage_action' AND issuer_tenant_id = ?`,
      )
      .all(org.orgTenantId) as Array<{
      tenant_id: string
      source_id: string
      title: string
      body: string
      metadata: string
      resolved_at: string | null
    }>
    expect(rows).toHaveLength(2)
    const current = rows.filter((row) => !row.resolved_at)
    expect(current).toHaveLength(1)
    expect(current[0].tenant_id).toBe(`wallet-${worker}`)
    expect(current[0].title).toContain('Continue job FR-CONTINUE: Confirm arrival')
    expect(current[0].body).toContain('not a new request')
    expect(JSON.parse(current[0].metadata)).toMatchObject({
      workflowRunId: context.runId,
      stageAction: 'confirm_arrival',
      continuation: true,
    })
    FieldExecutionActions.closeStageCards(context.runId!)
    expect(
      DatabaseManager.getDatabase()
        .prepare(
          `SELECT count(*) AS n FROM wallet_pending_offers WHERE issuer_tenant_id = ? AND source_type = 'workflow_stage_action' AND resolved_at IS NULL`,
        )
        .get(org.orgTenantId),
    ).toEqual({ n: 0 })
  })
})

describe('organisation records are not personal assignments', () => {
  test('offers the record to the org wallet and removes legacy copies from personal assigned work', async () => {
    const org = seedOrganization()
    jest.spyOn(credentialIssuanceService, 'createOffer').mockResolvedValue({
      offerId: 'org-inspection',
      preAuthorizedCode: 'test',
      credential_offer_uri: 'http://localhost/offer/test',
      credential_offer_deeplink: 'openid-credential-offer://test',
    })
    const result = await workflowVcOfferDispatcher.dispatch({
      orgTenantId: org.orgTenantId,
      workflowType: 'field_execution_fept',
      stageAction: 'inspect_site',
      credentialType: 'SiteInspectionVC',
      walletTenantId: org.orgTenantId,
      claims: {},
      contextRef: 'job',
    })
    expect(result.assignedUserId).toBeUndefined()
    expect(result.assignedWalletTenantId).toBe(org.orgTenantId)
    expect(orgWorkflowActorCredentialService.ensureActorCredentialInBackground).not.toHaveBeenCalled()
    const db = DatabaseManager.getDatabase()
    expect(db.prepare('SELECT tenant_id FROM wallet_pending_offers WHERE id = ?').get(result.walletOfferId)).toEqual({
      tenant_id: org.orgTenantId,
    })
    db.prepare(
      'UPDATE workflow_requests SET assignee_user_id = ?, assignee_wallet_tenant_id = ?, payload = ? WHERE id = ?',
    ).run(
      org.ownerUserId,
      `wallet-${org.ownerUserId}`,
      JSON.stringify({ credentialType: 'SiteInspectionVC' }),
      result.inboxItemId,
    )
    expect(workflowRequestRepository.listAssignedToApprover({ userId: org.ownerUserId })).toEqual([])
  })
})

describe('AR and client delivery are separate facts', () => {
  test('provider exceptions persist an unsent attempt without losing the receivable or creating a second one', async () => {
    const org = seedOrganization()
    const notify = jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockRejectedValue(new Error('Provider unavailable'))
    const context: WorkflowActionContext = {
      workflowId: 'billing',
      tenantId: org.orgTenantId,
      runId: `bill-${org.orgTenantId}`,
      input: { parentRunId: `job-${org.orgTenantId}`, payerPhone: '263771000099', payerName: 'Client', amount: 50 },
      state: {},
    }
    await expect(ClientPaymentActions.requestPayment(context)).rejects.toThrow('WORKFLOW_PAUSE')
    const id = context.state.clientBill.linkId
    expect(paymentLinkService.find(id)?.metadata.notification.accepted).toBe(false)
    await expect(ClientPaymentActions.requestPayment(context)).rejects.toThrow('WORKFLOW_PAUSE')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(
      DatabaseManager.getDatabase()
        .prepare('SELECT COUNT(*) AS n FROM financial_obligations WHERE tenant_id = ?')
        .get(org.orgTenantId),
    ).toEqual({ n: 1 })
    await expect(paymentLinkService.resend(id, org.orgTenantId, {}, true)).rejects.toThrow('Provider unavailable')
    expect(paymentLinkService.find(id)?.metadata.deliveryHistory).toHaveLength(2)
  })
  describe('billing mutation controller authorization and replay', () => {
    function api(orgTenantId: string, userId: string) {
      const app = express()
      app.use(express.json())
      app.use((req, _res, next) => {
        Object.assign(req, { user: { id: userId, tenantId: orgTenantId, orgRole: 'owner' } })
        next()
      })
      app.post('/links/:id/send', async (req, res, next) => {
        try {
          res.json(await new PaymentLinkController().sendPaymentLink(String(req.params.id), req.body, req))
        } catch (error) {
          next(error)
        }
      })
      app.post('/jobs/:id/retry', async (req, res, next) => {
        try {
          res.json(await new WorkflowController().retryClientBilling(String(req.params.id), req.body, req))
        } catch (error) {
          next(error)
        }
      })
      app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(error instanceof StatusException ? error.status : 500).json({ message: error.message })
      })
      return app
    }

    test('send requires a key and live membership before replay, returns contact/history and does not notify another tenant', async () => {
      const org = seedOrganization()
      orgSetupProfileService.save(org.orgTenantId, {
        operatingModel: 'internal',
        kinds: ['office'],
        modules: ['collections'],
        expectedRevision: 0,
      })
      const app = api(org.orgTenantId, org.ownerUserId)
      const notify = jest
        .spyOn(notificationService, 'dispatchContactNotification')
        .mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] })
      const link = paymentLinkService.create({
        merchantId: org.orgTenantId,
        description: 'Job',
        amount: 50,
        payerPhone: '263771000099',
        metadata: { payerName: 'Client' },
      })
      await request(app).post(`/links/${link.id}/send`).send({}).expect(400)
      for (let i = 0; i < 2; i++)
        await request(app).post(`/links/${link.id}/send`).set('x-idempotency-key', 'send-once').send({}).expect(200)
      expect(notify).toHaveBeenCalledTimes(1)
      const foreign = seedOrganization()
      const foreignLink = paymentLinkService.create({
        merchantId: foreign.orgTenantId,
        description: 'Private',
        amount: 10,
      })
      await request(app).post(`/links/${foreignLink.id}/send`).set('x-idempotency-key', 'foreign').send({}).expect(404)
      DatabaseManager.getDatabase()
        .prepare(`UPDATE org_memberships SET status = 'inactive' WHERE org_tenant_id = ? AND user_id = ?`)
        .run(org.orgTenantId, org.ownerUserId)
      await request(app).post(`/links/${link.id}/send`).set('x-idempotency-key', 'send-once').send({}).expect(403)
      expect(notify).toHaveBeenCalledTimes(1)
    })

    test('billing retry rejects a worker and another tenant before calling the service', async () => {
      const org = seedOrganization()
      const worker = `worker-${org.orgTenantId}`
      addMember({ ...org, userId: worker, role: 'field_worker' })
      const workflowId = `billing-auth-${org.orgTenantId}`
      workflowRepository.save({
        id: workflowId,
        tenantId: org.orgTenantId,
        name: 'Job',
        category: 'field_execution_fept',
        provider: 'test',
        actions: [],
      })
      const run = workflowRunRepository.createRun({
        workflowId,
        tenantId: org.orgTenantId,
        status: 'completed',
        input: { assigneeId: worker },
      })
      const retry = jest.spyOn(workflowService, 'retryClientBilling')
      await request(api(org.orgTenantId, worker))
        .post(`/jobs/${run.id}/retry`)
        .set('x-idempotency-key', 'worker')
        .send({ clientName: 'Client', clientPhone: '263771000099' })
        .expect(403)
      const other = seedOrganization()
      await request(api(other.orgTenantId, other.ownerUserId))
        .post(`/jobs/${run.id}/retry`)
        .set('x-idempotency-key', 'foreign')
        .send({ clientName: 'Client', clientPhone: '263771000099' })
        .expect(404)
      expect(retry).not.toHaveBeenCalled()
    })
  })
  test('resend and renewal retain one debt, record delivery, reject other tenants and invalidate the old renewed URL', async () => {
    const org = seedOrganization()
    const notify = jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockResolvedValue({ accepted: false, channels: [{ channel: 'sms', status: 'skipped' }] })
    const link = paymentLinkService.create({
      merchantId: org.orgTenantId,
      description: 'Job FR-RENEW',
      amount: 50,
      currency: 'USD',
      payerPhone: '263771000099',
      metadata: { payerName: 'Client', kind: 'invoice' },
    })
    const db = DatabaseManager.getDatabase()
    const original = db.prepare('SELECT obligation_id FROM payment_links WHERE id = ?').get(link.id)
    await expect(paymentLinkService.resend(link.id, 'other-tenant', {}, false)).rejects.toThrow('not found')
    expect(notify).not.toHaveBeenCalled()
    expect((await paymentLinkService.resend(link.id, org.orgTenantId, {}, false)).notification.accepted).toBe(false)
    db.prepare(`UPDATE payment_links SET expiry = ? WHERE id = ?`).run(
      new Date(Date.now() - 1000).toISOString(),
      link.id,
    )
    await expect(paymentLinkService.resend(link.id, org.orgTenantId, {}, false)).rejects.toThrow('expired')
    notify.mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] })
    const renewed = await paymentLinkService.resend(
      link.id,
      org.orgTenantId,
      { payerName: 'Client', payerPhone: '263771000098' },
      true,
      org.ownerUserId,
    )
    expect(renewed.notification.accepted).toBe(true)
    expect(renewed.url).not.toBe(link.shortlinkUrl)
    expect(ShortlinkService.resolve(link.shortlinkCode)).toBeNull()
    const stored = db
      .prepare('SELECT obligation_id, shortlink_code, metadata FROM payment_links WHERE id = ?')
      .get(link.id) as { obligation_id: string; shortlink_code: string; metadata: string }
    expect(ShortlinkService.resolve(stored.shortlink_code)?.targetId).toBe(link.id)
    expect({ obligation_id: stored.obligation_id }).toEqual(original)
    expect(JSON.parse(stored.metadata).deliveryHistory).toHaveLength(2)
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM financial_obligations WHERE tenant_id = ?').get(org.orgTenantId),
    ).toEqual({ n: 1 })
    db.prepare(`UPDATE payment_links SET status = 'paid' WHERE id = ?`).run(link.id)
    await expect(paymentLinkService.resend(link.id, org.orgTenantId, {}, true)).rejects.toThrow('Paid or cancelled')
    db.prepare(`UPDATE payment_links SET status = 'cancelled' WHERE id = ?`).run(link.id)
    await expect(paymentLinkService.resend(link.id, org.orgTenantId, {}, true)).rejects.toThrow('Paid or cancelled')
    expect(notify).toHaveBeenCalledTimes(2)
  })
  test('adding a missing contact retries only the original billing step and preserves the closed job', async () => {
    const org = seedOrganization()
    orgSetupProfileService.save(org.orgTenantId, {
      operatingModel: 'internal',
      kinds: ['office'],
      modules: ['collections'],
      expectedRevision: 0,
    })
    const report = workflowReadinessService.evaluateTemplate(org.orgTenantId, 'tpl-payment-collection')
    jest.spyOn(workflowReadinessService, 'evaluateTemplate').mockReturnValue({ ...report, ready: true, blocking: [] })
    jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] })
    const parentWorkflow = `parent-${org.orgTenantId}`
    const childWorkflow = `child-${org.orgTenantId}`
    workflowRepository.save({
      id: parentWorkflow,
      tenantId: org.orgTenantId,
      name: 'Job',
      category: 'field_execution_fept',
      provider: 'test',
      actions: [{ action: 'workflow.start', config: { workflow: 'tpl-payment-collection' } }],
    })
    workflowRepository.save({
      id: childWorkflow,
      tenantId: org.orgTenantId,
      name: 'Bill',
      category: 'collect_payments',
      provider: 'test',
      actions: [
        { action: 'client.request_payment', config: { kind: 'invoice' } },
        { action: 'client.record_payment', config: {} },
      ],
    })
    const parent = workflowRunRepository.createRun({
      workflowId: parentWorkflow,
      tenantId: org.orgTenantId,
      status: 'completed',
      input: { amount: 50, reference: 'FR-RETRY' },
    })
    const child = workflowRunRepository.createRun({
      workflowId: childWorkflow,
      tenantId: org.orgTenantId,
      status: 'completed',
      input: { parentRunId: parent.id, amount: 50, reference: 'FR-RETRY' },
      output: { clientBill: { status: 'not_sent', reason: 'No client phone on the job' } },
    })
    workflowRunRepository.updateRun(parent.id, {
      output: { startedWorkflows: { 'tpl-payment-collection': { runId: child.id } } },
    })
    const result = await workflowService.retryClientBilling(parent.id, 'Client', '263771000099', org.ownerUserId)
    expect(result.status).toBe('running')
    expect(result.runId).toBe(child.id)
    expect(workflowRunRepository.findRunById(child.id)?.status).toBe('paused')
    expect(workflowRunRepository.findRunById(parent.id)).toMatchObject({
      status: 'completed',
      input: { customerMsisdn: '263771000099' },
    })
    expect((await workflowService.getRunStatus(parent.id)).output.clientBill).toMatchObject({
      status: 'sent',
      amount: 50,
    })
    await expect(
      workflowService.retryClientBilling(parent.id, 'Client', '263771000099', org.ownerUserId),
    ).rejects.toThrow('Resend or renew')
  })
  test('creates one receivable/link on retry and does not call a rejected delivery sent', async () => {
    const org = seedOrganization()
    const notify = jest
      .spyOn(notificationService, 'dispatchContactNotification')
      .mockResolvedValue({ accepted: false, channels: [{ channel: 'sms', status: 'skipped' }] })
    const context: WorkflowActionContext = {
      workflowId: 'collection',
      tenantId: org.orgTenantId,
      runId: `bill-${org.orgTenantId}`,
      input: {
        parentRunId: `job-${org.orgTenantId}`,
        payerPhone: '263771000099',
        amount: 50,
        currency: 'USD',
        reference: 'FR-BILL',
      },
      state: {},
    }
    await expect(ClientPaymentActions.requestPayment(context, { kind: 'invoice' })).rejects.toThrow('WORKFLOW_PAUSE')
    expect(context.state.clientBill).toMatchObject({ status: 'delivery_failed', amount: 50 })
    const linkId = context.state.clientBill.linkId
    await expect(ClientPaymentActions.requestPayment(context, { kind: 'invoice' })).rejects.toThrow('WORKFLOW_PAUSE')
    expect(context.state.clientBill.linkId).toBe(linkId)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(
      DatabaseManager.getDatabase()
        .prepare(`SELECT direction, original_amount FROM financial_obligations WHERE tenant_id = ?`)
        .all(org.orgTenantId),
    ).toEqual([{ direction: 'receivable', original_amount: 50 }])
    expect(portalStages('RECONCILED', context.state).find((step) => step.key === 'CLIENT_INVOICE')?.status).toBe('held')
    context.input.clientPayment = { status: 'paid', linkId }
    await ClientPaymentActions.recordPayment(context)
    expect(context.state.clientBill.status).toBe('paid')
  })
  test('only reports provider acceptance when a channel actually accepts the message', async () => {
    jest.spyOn(notificationService, 'sendWhatsAppText').mockResolvedValue({ skipped: true })
    jest.spyOn(notificationService, 'sendSms').mockResolvedValue({ success: false, skipped: true })
    expect(
      await notificationService.dispatchContactNotification({
        contact: { name: 'Client', phone: 'test' },
        type: 'payment_link',
        url: 'http://localhost/pay/test',
      }),
    ).toMatchObject({ accepted: false })
    jest.spyOn(notificationService, 'sendSms').mockResolvedValue({ success: true, messageId: 'provider-id' })
    expect(
      await notificationService.dispatchContactNotification({
        contact: { name: 'Client', phone: 'test' },
        type: 'payment_link',
        url: 'http://localhost/pay/test',
      }),
    ).toMatchObject({ accepted: true, channels: expect.arrayContaining([{ channel: 'sms', status: 'accepted' }]) })
  })
})

describe('who does each job step (phone)', () => {
  it('names the assigned worker on worker steps, never "Nobody chosen yet"', () => {
    expect(mobileActorDisplay(undefined, { stageAction: 'start_job', assigneeName: '263714123456' })).toBe(
      '263714123456 (assigned field worker)',
    )
    expect(mobileActorDisplay(undefined, { stageAction: 'capture_evidence', hasAssignee: true })).toBe(
      'The assigned field worker',
    )
    expect(mobileActorDisplay(undefined, { stageAction: 'capture_evidence' })).toContain('Nobody chosen yet')
  })

  it('keeps the owner fallback for office steps', () => {
    const owner = { userId: 'u-owner', role: 'owner', mode: 'owner_fallback' }
    expect(
      mobileActorDisplay(owner, {
        stageAction: 'review_completion',
        hasAssignee: true,
        people: [{ userId: 'u-owner', role: 'owner', displayName: 'Eloh' }],
      }),
    ).toBe('Eloh · Owner')
  })
})

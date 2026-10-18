import 'reflect-metadata'

import { randomUUID } from 'crypto'

import { describe, expect, it, jest } from '@jest/globals'

import { ApiClient } from '../utils/apiClient'
import { createTestServerContext } from '../utils/testServer'
import { DatabaseManager } from '../../src/persistence/DatabaseManager'
import { contactRepository } from '../../src/persistence/ContactRepository'
import { workflowRequestRepository } from '../../src/persistence/WorkflowRequestRepository'
import { paymentLinkService } from '../../src/services/PaymentLinkService'
import { workflowService } from '../../src/services/WorkflowService'
import { orgWorkflowActorService } from '../../src/services/OrgWorkflowActorService'
import { EducationFeeTemplate, instantiateTemplate } from '../../src/services/workflow/templates'

jest.setTimeout(180000)

describe('School fees payment e2e', () => {
  it('sends the parent a pay link, keeps the school receipt once paid, and routes org-configured personnel', async () => {
    const context = await createTestServerContext()
    const client = new ApiClient(context.app)

    try {
      const baseToken = await client.getAgentToken(context.apiKey)

      const orgTenant = await client.createTenant(baseToken, {
        config: { label: 'School Org', tenantType: 'ORG' },
        displayName: 'School Org',
        baseUrl: 'http://localhost:3000',
      })
      const requesterTenant = await client.createTenant(baseToken, {
        config: { label: 'Parent Wallet', tenantType: 'USER' },
        displayName: 'Parent Wallet',
        baseUrl: 'http://localhost:3000',
      })
      const paymentOfficerTenant = await client.createTenant(baseToken, {
        config: { label: 'Finance Officer Wallet', tenantType: 'USER' },
        displayName: 'Finance Officer Wallet',
        baseUrl: 'http://localhost:3000',
      })
      const receiptIssuerTenant = await client.createTenant(baseToken, {
        config: { label: 'Receipt Issuer Wallet', tenantType: 'USER' },
        displayName: 'Receipt Issuer Wallet',
        baseUrl: 'http://localhost:3000',
      })

      const requesterDid = await client.createKeyDid(requesterTenant.token)
      const holderDid = requesterDid.did

      const schoolFeeWorkflow = instantiateTemplate(EducationFeeTemplate, orgTenant.tenantId, {
        name: 'School Fee Payment',
      })
      schoolFeeWorkflow.id = 'education_fee_payment'
      schoolFeeWorkflow.tenantId = orgTenant.tenantId
      schoolFeeWorkflow.name = 'School Fee Payment'
      schoolFeeWorkflow.category = 'education'
      await workflowService.registerWorkflow(schoolFeeWorkflow)

      const contact = contactRepository.upsert({
        orgTenantId: orgTenant.tenantId,
        contactScope: 'external',
        name: 'Springfield High School',
        notes: 'School-fees target contact for e2e verification',
      })

      workflowRequestRepository.addCapability({
        contactId: contact.id,
        orgTenantId: orgTenant.tenantId,
        capabilityType: 'education_fees',
        vcTypes: ['InvoiceVC', 'SchoolFeeReceiptVC'],
        enabled: true,
        metadata: {
          supportedRequestTypes: ['invoice'],
          supportedWorkflows: ['education_fee_payment'],
          defaultWorkflowType: 'education_fee_payment',
          paymentMethods: ['ecocash'],
          approvalPolicies: ['record_payment'],
        },
      })

      orgWorkflowActorService.upsertDefault({
        orgTenantId: orgTenant.tenantId,
        workflowType: 'education_fee_payment',
        stageAction: 'record_payment',
        defaultWalletTenantId: paymentOfficerTenant.tenantId,
        defaultRole: 'approver',
        enabled: true,
      })

      orgWorkflowActorService.upsertDefault({
        orgTenantId: orgTenant.tenantId,
        workflowType: 'education_fee_payment',
        stageAction: 'issue_receipt_vc',
        defaultWalletTenantId: receiptIssuerTenant.tenantId,
        defaultRole: 'issuer',
        enabled: true,
      })

      const createdRequest = workflowRequestRepository.create({
        requesterTenantId: requesterTenant.tenantId,
        requesterDid: holderDid,
        targetOrgTenantId: orgTenant.tenantId,
        contactId: contact.id,
        requestType: 'invoice',
        workflowType: 'education_fee_payment',
        payload: {
          studentId: 'STU-2026-001',
          studentName: 'Brian Moyo',
          term: 'Term 3 2026',
          feeType: 'tuition',
          amount: 650,
          currency: 'USD',
          schoolName: 'Springfield High School',
          payerPhone: '+263770000001',
          stageAction: 'record_payment',
        },
        status: 'pending',
      })

      const paymentActor = orgWorkflowActorService.resolveActor({
        orgTenantId: orgTenant.tenantId,
        workflowType: 'education_fee_payment',
        stageAction: 'record_payment',
      })
      expect(paymentActor.mode).toBe('configured_wallet')
      expect(paymentActor.walletTenantId).toBe(paymentOfficerTenant.tenantId)

      const receiptActor = orgWorkflowActorService.resolveActor({
        orgTenantId: orgTenant.tenantId,
        workflowType: 'education_fee_payment',
        stageAction: 'issue_receipt_vc',
      })
      expect(receiptActor.mode).toBe('configured_wallet')
      expect(receiptActor.walletTenantId).toBe(receiptIssuerTenant.tenantId)

      workflowRequestRepository.assignRequest(createdRequest.id, {
        assigneeWalletTenantId: paymentActor.walletTenantId,
        assigneeRole: paymentActor.role,
        assignmentMode: paymentActor.mode,
        assignmentNote: 'Configured school-fees payment officer',
      })

      const assignedRequest = workflowRequestRepository.findById(createdRequest.id)
      expect(assignedRequest?.assigneeWalletTenantId).toBe(paymentOfficerTenant.tenantId)
      expect(assignedRequest?.assignmentMode).toBe('configured_wallet')

      const workflowResult = await workflowService.executeWorkflow(
        'education_fee_payment',
        {
          studentId: 'STU-2026-001',
          studentName: 'Brian Moyo',
          term: 'Term 3 2026',
          feeType: 'tuition',
          amount: 650,
          currency: 'USD',
          schoolName: 'Springfield High School',
          payerPhone: '+263770000001',
        },
        orgTenant.tenantId,
      )

      // The parent gets a pay link and the fee waits for the money (same rail as the SGK client bill).
      expect(workflowResult.status).not.toBe('failed')
      const waiting = await workflowService.getRunStatus(workflowResult.runId)
      expect(waiting.status).toBe('paused')
      const bill = (waiting.output as any)?.clientBill
      expect(bill).toMatchObject({ status: 'sent', kind: 'invoice', amount: 650 })

      const feeRecord = DatabaseManager.getDatabase()
        .prepare(`SELECT transaction_type AS type FROM business_transactions WHERE id = ?`)
        .get(bill.transactionId) as { type: string }
      expect(feeRecord.type).toBe('fee_assessment')

      await paymentLinkService.settlePaid(bill.linkId, { reference: 'ECO-E2E-1' })

      const runStatus = await workflowService.getRunStatus(workflowResult.runId)
      expect(runStatus.status).toBe('completed')
      expect((runStatus.output as any)?.payment).toMatchObject({ status: 'completed', reference: 'ECO-E2E-1' })

      const credentialSteps = (runStatus.steps || []).filter((step: any) => step.actionName === 'credential.issue')
      expect(credentialSteps).toHaveLength(1)
      const receiptOffer = credentialSteps[0]?.outputState?.offer
      expect(receiptOffer?.credentialType).toContain('SchoolFeeReceiptVC')

      const credentialRecords = await client.listIssuedCredentials(orgTenant.token)
      const serialisedRecords = credentialRecords.map((record) => JSON.stringify(record)).join('\n')
      expect(serialisedRecords).toContain('SchoolFeeReceiptVC')
    } finally {
      await context.cleanup()
    }
  })
})

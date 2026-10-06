import 'reflect-metadata'

import { randomUUID } from 'crypto'

import { describe, expect, it, jest } from '@jest/globals'

import { ApiClient } from '../utils/apiClient'
import { createTestServerContext } from '../utils/testServer'
import { DatabaseManager } from '../../src/persistence/DatabaseManager'
import { contactRepository } from '../../src/persistence/ContactRepository'
import { workflowRequestRepository } from '../../src/persistence/WorkflowRequestRepository'
import { workflowService } from '../../src/services/WorkflowService'
import { orgWorkflowActorService } from '../../src/services/OrgWorkflowActorService'
import { EducationFeeTemplate, instantiateTemplate } from '../../src/services/workflow/templates'

jest.setTimeout(180000)

describe('School fees payment e2e', () => {
  it('issues invoice and school-fee receipt VCs and routes org-configured personnel correctly', async () => {
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

      expect(workflowResult.status).toBe('completed')
      expect(workflowResult.output?.payment?.status || workflowResult.output?.ecocashPayment?.status).toBe('completed')

      const runStatus = await workflowService.getRunStatus(workflowResult.runId)
      const credentialSteps = (runStatus.steps || []).filter((step: any) => step.actionName === 'credential.issue')

      expect(credentialSteps).toHaveLength(2)

      const invoiceOffer = credentialSteps[0]?.outputState?.offer
      const receiptOffer = credentialSteps[1]?.outputState?.offer

      expect(invoiceOffer?.credentialType).toContain('InvoiceVC')
      expect(receiptOffer?.credentialType).toContain('SchoolFeeReceiptVC')
      expect(invoiceOffer?.preAuthorizedCode).toBeDefined()
      expect(receiptOffer?.preAuthorizedCode).toBeDefined()

      const invoiceHolderDid = await client.createKeyDid(requesterTenant.token)

      const invoiceCredential = await client.redeemCredential({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        pre_authorized_code: invoiceOffer.preAuthorizedCode,
        subject_did: invoiceHolderDid.did,
      })
      const receiptCredential = await client.redeemCredential({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        pre_authorized_code: receiptOffer.preAuthorizedCode,
        subject_did: invoiceHolderDid.did,
      })

      expect(invoiceCredential.credentialId).toBeDefined()
      expect(receiptCredential.credentialId).toBeDefined()
      expect(invoiceCredential.verifiableCredential).toMatch(/^eyJ/)
      expect(receiptCredential.verifiableCredential).toMatch(/^eyJ/)

      const credentialRecords = await client.listIssuedCredentials(orgTenant.token)
      expect(Array.isArray(credentialRecords)).toBe(true)
      expect(credentialRecords.length).toBeGreaterThanOrEqual(2)

      const serialisedRecords = credentialRecords.map((record) => JSON.stringify(record)).join('\n')
      expect(serialisedRecords).toContain('InvoiceVC')
      expect(serialisedRecords).toContain('SchoolFeeReceiptVC')
    } finally {
      await context.cleanup()
    }
  })
})

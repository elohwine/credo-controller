/**
 * Unit tests for WorkflowVcOfferDispatcher
 *
 */

import 'reflect-metadata'
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

import { OrgWorkflowActorService } from '../../OrgWorkflowActorService'
import { credentialIssuanceService } from '../../CredentialIssuanceService'
import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { WorkflowVcOfferDispatcher } from '../WorkflowVcOfferDispatcher'

// ── DB stub ───────────────────────────────────────────────────────────────────

let mockRun: any
let mockPrepare: any

// ── helpers ───────────────────────────────────────────────────────────────────

function baseParams() {
    return {
        orgTenantId: 'org-tenant-abc',
        workflowType: 'internal_requisitions',
        stageAction: 'credential.issue',
        credentialType: 'RequisitionAcknowledgementVC',
        claims: { requisitionId: 'REQ-001', amount: 500 },
        contextRef: 'run-xyz',
    }
}

// Spies
let resolveActorSpy: any
let createOfferSpy: any
let getDatabaseSpy: any

beforeEach(() => {
    jest.clearAllMocks()

    mockRun = jest.fn()
    mockPrepare = jest.fn().mockReturnValue({ run: mockRun })

    // Spy on OrgWorkflowActorService prototype
    resolveActorSpy = jest.spyOn(OrgWorkflowActorService.prototype, 'resolveActor')

    // Spy on dynamic CredentialIssuanceService singleton
    createOfferSpy = jest.spyOn(credentialIssuanceService as any, 'createOffer')

    // Default happy path
    createOfferSpy.mockResolvedValue({
        offerId: 'offer-111',
        credential_offer_deeplink: 'openid-credential-offer://offer-111',
    })

    // Spy on DatabaseManager static
    getDatabaseSpy = jest.spyOn(DatabaseManager, 'getDatabase')
    getDatabaseSpy.mockReturnValue({ prepare: mockPrepare } as any)
})

afterEach(() => {
    jest.restoreAllMocks()
})

// ── Test cases ────────────────────────────────────────────────────────────────

describe('WorkflowVcOfferDispatcher.dispatch', () => {
    describe('when actor resolves to a specific userId', () => {
        beforeEach(() => {
            resolveActorSpy.mockReturnValue({
                userId: 'user-finance-001',
                walletTenantId: 'wallet-tenant-fin',
                role: 'finance_manager',
                mode: 'configured_user',
            })
        })

        it('calls CredentialIssuanceService.createOffer with correct params', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            expect(createOfferSpy).toHaveBeenCalledWith({
                credentialType: 'RequisitionAcknowledgementVC',
                claims: { requisitionId: 'REQ-001', amount: 500 },
                tenantId: 'org-tenant-abc',
                subjectDid: undefined,
            })
        })

        it('returns offerId and offerUri from the issuance service', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            const result = await dispatcher.dispatch(baseParams())

            expect(result.offerId).toBe('offer-111')
            expect(result.offerUri).toBe('openid-credential-offer://offer-111')
        })

        it('writes a workflow_requests inbox row with assigneeUserId', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workflow_requests'))
            const runArgs = mockRun.mock.calls[0][0] as any
            expect(runArgs.assigneeUserId).toBe('user-finance-001')
            expect(runArgs.assigneeWalletTenantId).toBe('wallet-tenant-fin')
            expect(runArgs.assigneeRole).toBe('finance_manager')
            expect(runArgs.requestType).toBe('vc_offer')
            expect(runArgs.status).toBe('pending')
        })

        it('stores offerUri in the inbox item payload', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            const runArgs = mockRun.mock.calls[0][0] as any
            const payload = JSON.parse(runArgs.payload)
            expect(payload.offerUri).toBe('openid-credential-offer://offer-111')
            expect(payload.credentialType).toBe('RequisitionAcknowledgementVC')
            expect(payload.contextRef).toBe('run-xyz')
        })

        it('returns the resolved actor fields in the result', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            const result = await dispatcher.dispatch(baseParams())

            expect(result.assignedUserId).toBe('user-finance-001')
            expect(result.assignedWalletTenantId).toBe('wallet-tenant-fin')
            expect(result.assignedRole).toBe('finance_manager')
            expect(result.actorMode).toBe('configured_user')
        })
    })

    describe('when actor resolves to a role only (no specific userId)', () => {
        beforeEach(() => {
            resolveActorSpy.mockReturnValue({
                userId: undefined,
                walletTenantId: undefined,
                role: 'approver',
                mode: 'role_fallback',
            })
        })

        it('writes inbox row with null assigneeUserId and non-null assigneeRole', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            const runArgs = mockRun.mock.calls[0][0] as any
            expect(runArgs.assigneeUserId).toBeNull()
            expect(runArgs.assigneeWalletTenantId).toBeNull()
            expect(runArgs.assigneeRole).toBe('approver')
        })

        it('still creates the VC offer even with role-only actor', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            const result = await dispatcher.dispatch(baseParams())

            expect(createOfferSpy).toHaveBeenCalledTimes(1)
            expect(result.offerId).toBe('offer-111')
        })
    })

    describe('when actor cannot be resolved (returns undefined)', () => {
        beforeEach(() => {
            resolveActorSpy.mockReturnValue(undefined)
        })

        it('still creates the VC offer', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            expect(createOfferSpy).toHaveBeenCalledTimes(1)
        })

        it('writes inbox row with null assignee fields', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await dispatcher.dispatch(baseParams())

            const runArgs = mockRun.mock.calls[0][0] as any
            expect(runArgs.assigneeUserId).toBeNull()
            expect(runArgs.assigneeRole).toBeNull()
        })
    })

    describe('when CredentialIssuanceService.createOffer throws', () => {
        beforeEach(() => {
            resolveActorSpy.mockReturnValue({
                userId: 'user-001',
                walletTenantId: 'wallet-001',
                role: 'owner',
                mode: 'configured_user',
            })
            createOfferSpy.mockImplementation(() => Promise.reject(new Error('Issuer DID not found')))
        })

        it('propagates the error', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await expect(dispatcher.dispatch(baseParams())).rejects.toThrow('Issuer DID not found')
        })

        it('does NOT write an inbox row', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            await expect(dispatcher.dispatch(baseParams())).rejects.toThrow()
            // prepare/run should not have been called for inbox write
            expect(mockRun).not.toHaveBeenCalled()
        })
    })

    describe('when DB insert throws (non-fatal)', () => {
        beforeEach(() => {
            resolveActorSpy.mockReturnValue({
                userId: 'user-001',
                walletTenantId: 'wallet-001',
                role: 'owner',
                mode: 'configured_user',
            })
            mockRun.mockImplementation(() => {
                throw new Error('DB locked')
            })
        })

        it('still returns the offer result without throwing', async () => {
            const dispatcher = new WorkflowVcOfferDispatcher()
            const result = await dispatcher.dispatch(baseParams())

            expect(result.offerId).toBe('offer-111')
            expect(result.offerUri).toBe('openid-credential-offer://offer-111')
        })
    })
})

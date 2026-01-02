import { Body, Controller, Get, Path, Post, Put, Route, Tags, Request, Header } from 'tsoa'
import { rootLogger } from '../../utils/pinoLogger'
import { OnboardingService, onboardingService, OnboardingRequest, OnboardingData } from '../../services/OnboardingService'
import { Request as ExRequest } from 'express'

const logger = rootLogger.child({ module: 'OnboardingController' })

interface InitOnboardingPayload {
    email: string
    fullName: string
    phone?: string
    tenantId?: string
}

interface UpdateOnboardingPayload {
    step: string // 'personal_details', 'documents', 'contract', 'complete'
    data: Partial<OnboardingData>
}

@Route('api/onboarding')
@Tags('HR')
export class OnboardingController extends Controller {

    /**
     * Invite a new candidate for onboarding.
     * Generates a request ID and access token.
     */
    @Post('/init')
    public async initOnboarding(
        @Body() payload: InitOnboardingPayload,
        @Request() request?: ExRequest
    ): Promise<OnboardingRequest> {
        // TODO: Validate auth (HR Admin only)
        logger.info({ payload }, 'Initializing onboarding')
        const tenantId = payload.tenantId || 'default'

        try {
            const req = await onboardingService.createRequest(tenantId, payload.email, payload.fullName, payload.phone)
            this.setStatus(201)
            return req
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to init onboarding')
            this.setStatus(500)
            throw new Error(`Failed to init onboarding: ${error.message}`)
        }
    }

    /**
     * Get onboarding request details.
     * Can be accessed by candidate (via token) or HR (via auth).
     */
    @Get('{id}')
    public async getRequest(
        @Path() id: string
    ): Promise<OnboardingRequest> {
        const req = await onboardingService.getRequest(id)
        if (!req) {
            this.setStatus(404)
            throw new Error('Onboarding request not found')
        }
        return req
    }

    /**
     * Update progress and save form data.
     * Used by the candidate portal/wizard.
     */
    @Put('{id}/step')
    public async updateStep(
        @Path() id: string,
        @Body() payload: UpdateOnboardingPayload
    ): Promise<OnboardingRequest> {
        try {
            const req = await onboardingService.updateProgress(id, payload.step, payload.data)
            return req
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to update progress')
            this.setStatus(500)
            throw new Error(`Failed to update: ${error.message}`)
        }
    }

    /**
     * Approve onboarding and hire candidate.
     * Issues EmploymentContractVC and creates Employee record.
     */
    @Post('{id}/approve')
    public async approveRequest(
        @Path() id: string
    ): Promise<{ status: string, employeeId: string }> {
        // TODO: Validate auth (HR Admin only)
        try {
            logger.info({ id }, 'Approving onboarding request')
            const employeeId = await onboardingService.approveRequest(id)
            return {
                status: 'approved',
                employeeId
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to approve request')
            this.setStatus(500)
            throw new Error(`Failed to approve: ${error.message}`)
        }
    }
}

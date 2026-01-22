
import { Controller, Post, Get, Put, Route, Tags, Body, Path, Query } from 'tsoa'
import { operationsService, LeaveRequest, ExpenseClaim } from '../../services/OperationsService'

export interface CreateLeaveRequestPayload {
    employeeId: string
    leaveType: 'annual' | 'sick' | 'unpaid' | 'maternity' | 'study'
    startDate: string
    endDate: string
    daysCount: number
    reason?: string
}

export interface UpdateOperationsStatusPayload {
    adminDid: string
    status: 'approved' | 'rejected' | 'paid'
}

export interface CreateExpenseClaimPayload {
    employeeId: string
    description: string
    amount: number
    currency: string
    category: 'travel' | 'meals' | 'equipment' | 'other'
    receiptUrl?: string
}

@Route('api/operations')
@Tags('HR & Operations')
export class OperationsController extends Controller {

    // --- Leave Endpoints ---

    /**
     * Submit a new leave request
     */
    @Post('leave')
    public async requestLeave(
        @Body() body: CreateLeaveRequestPayload
    ): Promise<LeaveRequest> {
        // In real app, get tenant from AUTH header
        return operationsService.createLeaveRequest('default', body.employeeId, body)
    }

    /**
     * List leave requests (optionally filtered by employee)
     */
    @Get('leave')
    public async listLeave(
        @Query() employeeId?: string
    ): Promise<LeaveRequest[]> {
        return operationsService.listLeaveRequests('default', employeeId)
    }

    /**
     * Update leave request status (Approve/Reject)
     */
    @Put('leave/{leaveId}/status')
    public async updateLeaveStatus(
        @Path() leaveId: string,
        @Body() body: UpdateOperationsStatusPayload
    ): Promise<void> {
        // Enforce type safety for status
        if (body.status !== 'approved' && body.status !== 'rejected') {
            this.setStatus(400)
            throw new Error('Invalid status for leave request')
        }
        await operationsService.updateLeaveStatus('default', body.adminDid, leaveId, body.status)
    }

    // --- Expense Endpoints ---

    /**
     * Submit a new expense claim
     */
    @Post('expenses')
    public async submitExpense(
        @Body() body: CreateExpenseClaimPayload
    ): Promise<ExpenseClaim> {
        return operationsService.createExpenseClaim('default', body.employeeId, body)
    }

    /**
     * List expense claims (optionally filtered by employee)
     */
    @Get('expenses')
    public async listExpenses(
        @Query() employeeId?: string
    ): Promise<ExpenseClaim[]> {
        return operationsService.listExpenseClaims('default', employeeId)
    }

    /**
     * Update expense claim status (Approve/Reject/Pay)
     */
    @Put('expenses/{claimId}/status')
    public async updateExpenseStatus(
        @Path() claimId: string,
        @Body() body: UpdateOperationsStatusPayload
    ): Promise<void> {
        await operationsService.updateExpenseStatus('default', body.adminDid, claimId, body.status)
    }

    /**
     * Re-offer leave approval credential
     * Returns the credential offer URI for users who missed the initial invitation
     */
    @Post('leave/{leaveId}/reoffer')
    public async reofferLeaveApproval(
        @Path() leaveId: string
    ): Promise<{ offerUri: string, credential_offer_deeplink: string }> {
        const offer = await operationsService.getLeaveApprovalVCOffer('default', leaveId)
        return {
            offerUri: offer.credential_offer_uri,
            credential_offer_deeplink: offer.credential_offer_deeplink
        }
    }

    /**
     * Re-offer expense approval credential
     * Returns the credential offer URI for users who missed the initial invitation
     */
    @Post('expenses/{claimId}/reoffer')
    public async reofferExpenseApproval(
        @Path() claimId: string
    ): Promise<{ offerUri: string, credential_offer_deeplink: string }> {
        const offer = await operationsService.getExpenseApprovalVCOffer('default', claimId)
        return {
            offerUri: offer.credential_offer_uri,
            credential_offer_deeplink: offer.credential_offer_deeplink
        }
    }
}

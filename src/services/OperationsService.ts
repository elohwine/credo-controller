
import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { auditService } from './AuditService'
import { credentialIssuanceService } from './CredentialIssuanceService'

const logger = rootLogger.child({ module: 'OperationsService' })

export interface LeaveRequest {
    id: string
    tenantId: string
    employeeId: string
    leaveType: 'annual' | 'sick' | 'unpaid' | 'maternity' | 'study'
    startDate: string
    endDate: string
    daysCount: number
    reason?: string
    status: 'pending' | 'approved' | 'rejected'
    approverId?: string
    approvalVcId?: string
    createdAt: string
}

export interface ExpenseClaim {
    id: string
    tenantId: string
    employeeId: string
    description: string
    amount: number
    currency: string
    category: 'travel' | 'meals' | 'equipment' | 'other'
    receiptUrl?: string | null
    status: 'pending' | 'approved' | 'paid' | 'rejected'
    approvedBy?: string
    approvalVcId?: string
    paidAt?: string
    createdAt: string
}

export class OperationsService {

    // --- Leave Management ---

    async createLeaveRequest(
        tenantId: string,
        employeeId: string,
        data: Omit<LeaveRequest, 'id' | 'tenantId' | 'employeeId' | 'status' | 'createdAt'>
    ): Promise<LeaveRequest> {
        const db = DatabaseManager.getDatabase()
        const id = `LEAVE-${randomUUID()}`
        const now = new Date().toISOString()

        const req: LeaveRequest = {
            id,
            tenantId,
            employeeId,
            ...data,
            status: 'pending',
            createdAt: now
        }

        db.prepare(`
            INSERT INTO leave_requests (id, tenant_id, employee_id, leave_type, start_date, end_date, days_count, reason, status, created_at)
            VALUES (@id, @tenantId, @employeeId, @leaveType, @startDate, @endDate, @daysCount, @reason, @status, @createdAt)
        `).run(req)

        await auditService.logAction({
            tenantId,
            actorDid: employeeId,
            actionType: 'leave_request_created',
            details: { leaveId: id, type: data.leaveType }
        })

        return req
    }

    async updateLeaveStatus(tenantId: string, adminDid: string, leaveId: string, status: 'approved' | 'rejected'): Promise<{ approvalVcId?: string }> {
        const db = DatabaseManager.getDatabase()
        
        // Get leave details
        const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(leaveId) as any
        if (!leave) throw new Error('Leave request not found')

        let approvalVcId: string | undefined
        let approvalVcOfferUri: string | undefined

        // Issue LeaveApprovalVC on approval
        if (status === 'approved') {
            try {
                const offer = await credentialIssuanceService.createOffer({
                    credentialType: 'LeaveApprovalVC',
                    claims: {
                        leaveRequestId: leaveId,
                        employeeId: leave.employee_id,
                        leaveType: leave.leave_type,
                        startDate: leave.start_date,
                        endDate: leave.end_date,
                        daysCount: leave.days_count,
                        reason: leave.reason || '',
                        approvedBy: adminDid,
                        approvedAt: new Date().toISOString()
                    },
                    tenantId
                })
                approvalVcId = offer.offerId
                approvalVcOfferUri = offer.credential_offer_deeplink
                logger.info({ leaveId, vcId: approvalVcId }, 'LeaveApprovalVC issued')
            } catch (e: any) {
                logger.warn({ error: e.message, leaveId }, 'Failed to issue LeaveApprovalVC')
            }
        }

        const res = db.prepare('UPDATE leave_requests SET status = ?, approver_id = ?, approval_vc_id = ?, approval_vc_offer_uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, adminDid, approvalVcId || null, approvalVcOfferUri || null, leaveId)

        if (res.changes === 0) throw new Error('Leave request not found')

        await auditService.logAction({
            tenantId,
            actorDid: adminDid,
            actionType: `leave_request_${status}`,
            details: { leaveId, approvalVcId }
        })

        return { approvalVcId }
    }

    /**
     * Get leave approval VC offer for reoffer
     */
    async getLeaveApprovalVCOffer(tenantId: string, leaveId: string): Promise<{ credential_offer_uri: string, credential_offer_deeplink: string }> {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare('SELECT approval_vc_offer_uri FROM leave_requests WHERE id = ? AND tenant_id = ?').get(leaveId, tenantId) as any
        if (!row || !row.approval_vc_offer_uri) {
            throw new Error(`No LeaveApprovalVC credential offer found for leave request ${leaveId}`)
        }

        const deeplink = row.approval_vc_offer_uri
        // Extract HTTP URI from deeplink
        let uri = deeplink
        if (deeplink.includes('credential_offer_uri=')) {
            const encodedUri = deeplink.split('credential_offer_uri=')[1]
            uri = decodeURIComponent(encodedUri)
        }

        return {
            credential_offer_uri: uri,
            credential_offer_deeplink: deeplink
        }
    }

    async listLeaveRequests(tenantId: string, employeeId?: string): Promise<LeaveRequest[]> {
        const db = DatabaseManager.getDatabase()
        let query = 'SELECT * FROM leave_requests WHERE tenant_id = ?'
        const params: any[] = [tenantId]

        if (employeeId) {
            query += ' AND employee_id = ?'
            params.push(employeeId)
        }

        query += ' ORDER BY created_at DESC'

        const rows = db.prepare(query).all(...params) as any[]
        return rows.map(r => ({
            id: r.id,
            tenantId: r.tenant_id,
            employeeId: r.employee_id,
            leaveType: r.leave_type,
            startDate: r.start_date,
            endDate: r.end_date,
            daysCount: r.days_count,
            reason: r.reason,
            status: r.status,
            approverId: r.approver_id,
            approvalVcId: r.approval_vc_id,
            createdAt: r.created_at
        }))
    }

    // --- Expense Management ---

    async createExpenseClaim(
        tenantId: string,
        employeeId: string,
        data: Omit<ExpenseClaim, 'id' | 'tenantId' | 'employeeId' | 'status' | 'createdAt'>
    ): Promise<ExpenseClaim> {
        const db = DatabaseManager.getDatabase()
        const id = `EXP-${randomUUID()}`
        const now = new Date().toISOString()

        const claim: ExpenseClaim = {
            id,
            tenantId,
            employeeId,
            ...data,
            receiptUrl: data.receiptUrl ?? null,
            status: 'pending',
            createdAt: now
        }

        db.prepare(`
            INSERT INTO expense_claims (id, tenant_id, employee_id, description, amount, currency, category, receipt_url, status, created_at)
            VALUES (@id, @tenantId, @employeeId, @description, @amount, @currency, @category, @receiptUrl, @status, @createdAt)
        `).run(claim)

        await auditService.logAction({
            tenantId,
            actorDid: employeeId,
            actionType: 'expense_claim_created',
            details: { claimId: id, amount: data.amount }
        })

        return claim
    }

    async updateExpenseStatus(tenantId: string, adminDid: string, claimId: string, status: 'approved' | 'rejected' | 'paid'): Promise<{ approvalVcId?: string }> {
        const db = DatabaseManager.getDatabase()
        
        // Get expense details
        const expense = db.prepare('SELECT * FROM expense_claims WHERE id = ?').get(claimId) as any
        if (!expense) throw new Error('Expense claim not found')

        const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP']
        const params: any[] = [status]
        let approvalVcId: string | undefined

        if (status === 'approved') {
            updates.push('approved_by = ?')
            params.push(adminDid)

            // Issue ExpenseApprovalVC
            try {
                const offer = await credentialIssuanceService.createOffer({
                    credentialType: 'ExpenseApprovalVC',
                    claims: {
                        expenseClaimId: claimId,
                        employeeId: expense.employee_id,
                        description: expense.description,
                        amount: expense.amount,
                        currency: expense.currency,
                        category: expense.category,
                        approvedBy: adminDid,
                        approvedAt: new Date().toISOString()
                    },
                    tenantId
                })
                approvalVcId = offer.offerId
                updates.push('approval_vc_id = ?')
                params.push(approvalVcId)
                updates.push('approval_vc_offer_uri = ?')
                params.push(offer.credential_offer_deeplink)
                logger.info({ claimId, vcId: approvalVcId }, 'ExpenseApprovalVC issued')
            } catch (e: any) {
                logger.warn({ error: e.message, claimId }, 'Failed to issue ExpenseApprovalVC')
            }
        } else if (status === 'paid') {
            updates.push('paid_at = CURRENT_TIMESTAMP')
        }

        params.push(claimId)

        const res = db.prepare(`UPDATE expense_claims SET ${updates.join(', ')} WHERE id = ?`).run(...params)

        if (res.changes === 0) throw new Error('Expense claim not found')

        await auditService.logAction({
            tenantId,
            actorDid: adminDid,
            actionType: `expense_claim_${status}`,
            details: { claimId, approvalVcId }
        })

        return { approvalVcId }
    }

    /**
     * Get expense approval VC offer for reoffer
     */
    async getExpenseApprovalVCOffer(tenantId: string, claimId: string): Promise<{ credential_offer_uri: string, credential_offer_deeplink: string }> {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare('SELECT approval_vc_offer_uri FROM expense_claims WHERE id = ? AND tenant_id = ?').get(claimId, tenantId) as any
        if (!row || !row.approval_vc_offer_uri) {
            throw new Error(`No ExpenseApprovalVC credential offer found for claim ${claimId}`)
        }

        const deeplink = row.approval_vc_offer_uri
        // Extract HTTP URI from deeplink
        let uri = deeplink
        if (deeplink.includes('credential_offer_uri=')) {
            const encodedUri = deeplink.split('credential_offer_uri=')[1]
            uri = decodeURIComponent(encodedUri)
        }

        return {
            credential_offer_uri: uri,
            credential_offer_deeplink: deeplink
        }
    }

    async listExpenseClaims(tenantId: string, employeeId?: string): Promise<ExpenseClaim[]> {
        const db = DatabaseManager.getDatabase()
        let query = 'SELECT * FROM expense_claims WHERE tenant_id = ?'
        const params: any[] = [tenantId]

        if (employeeId) {
            query += ' AND employee_id = ?'
            params.push(employeeId)
        }

        query += ' ORDER BY created_at DESC'

        const rows = db.prepare(query).all(...params) as any[]
        return rows.map(r => ({
            id: r.id,
            tenantId: r.tenant_id,
            employeeId: r.employee_id,
            description: r.description,
            amount: r.amount,
            currency: r.currency,
            category: r.category,
            receiptUrl: r.receipt_url,
            status: r.status,
            approvedBy: r.approved_by,
            approvalVcId: r.approval_vc_id,
            paidAt: r.paid_at,
            createdAt: r.created_at
        }))
    }
}

export const operationsService = new OperationsService()


import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { auditService } from './AuditService'

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

    async updateLeaveStatus(tenantId: string, adminDid: string, leaveId: string, status: 'approved' | 'rejected'): Promise<void> {
        const db = DatabaseManager.getDatabase()
        const res = db.prepare('UPDATE leave_requests SET status = ?, approver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, adminDid, leaveId)

        if (res.changes === 0) throw new Error('Leave request not found')

        await auditService.logAction({
            tenantId,
            actorDid: adminDid,
            actionType: `leave_request_${status}`,
            details: { leaveId }
        })
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

    async updateExpenseStatus(tenantId: string, adminDid: string, claimId: string, status: 'approved' | 'rejected' | 'paid'): Promise<void> {
        const db = DatabaseManager.getDatabase()
        const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP']
        const params: any[] = [status]

        if (status === 'approved') {
            updates.push('approved_by = ?')
            params.push(adminDid)
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
            details: { claimId }
        })
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
            paidAt: r.paid_at,
            createdAt: r.created_at
        }))
    }
}

export const operationsService = new OperationsService()

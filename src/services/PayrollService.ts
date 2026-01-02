/**
 * Payroll Service
 * Handles employee management, payroll calculation, and payslip generation.
 * Supports plugin architecture for statutory deductions (NSSA, PAYE).
 */

import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { credentialIssuanceService } from './CredentialIssuanceService'
import { NSSACalculator, PAYECalculator } from './payroll/plugins/StatutoryPlugins'

const logger = rootLogger.child({ module: 'PayrollService' })

export interface Employee {
    id: string
    tenantId: string
    did?: string
    firstName: string
    lastName: string
    email?: string
    phone?: string
    baseSalary: number
    currency: string
    nssaNumber?: string
    tin?: string
    status: 'active' | 'terminated' | 'on_leave'
    createdAt: string
}

export interface PayrollRun {
    id: string
    tenantId: string
    period: string
    status: 'draft' | 'processing' | 'completed' | 'paid'
    totalGross: number
    totalNet: number
    createdAt: string
}

export interface Payslip {
    id: string
    runId: string
    employeeId: string
    period: string
    grossAmount: number
    deductions: {
        nssa: number
        paye: number
        aids_levy: number
        other: number
    }
    netAmount: number
    currency: string
    payslipVcId?: string
    status: string
    createdAt: string
}

export class PayrollService {

    /**
     * Create or update an employee record
     */
    async saveEmployee(employee: Partial<Employee> & { firstName: string, lastName: string, baseSalary: number }): Promise<Employee> {
        const db = DatabaseManager.getDatabase()
        const id = employee.id || `EMP-${randomUUID()}`
        const now = new Date().toISOString()
        const tenantId = employee.tenantId || 'default'

        const record = {
            id,
            tenant_id: tenantId,
            did: employee.did || null,
            first_name: employee.firstName,
            last_name: employee.lastName,
            email: employee.email || null,
            phone: employee.phone || null,
            base_salary: employee.baseSalary,
            currency: employee.currency || 'USD',
            nssa_number: employee.nssaNumber || null,
            tin: employee.tin || null,
            status: employee.status || 'active',
            created_at: now,
            updated_at: now
        }

        db.prepare(`
            INSERT OR REPLACE INTO employees 
            (id, tenant_id, did, first_name, last_name, email, phone, base_salary, currency, nssa_number, tin, status, created_at, updated_at)
            VALUES (@id, @tenant_id, @did, @first_name, @last_name, @email, @phone, @base_salary, @currency, @nssa_number, @tin, @status, @created_at, @updated_at)
        `).run(record)

        const saved = await this.getEmployee(id)
        if (!saved) throw new Error('Failed to save employee')
        return saved
    }

    async getEmployee(id: string): Promise<Employee | null> {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any
        if (!row) return null

        return {
            id: row.id,
            tenantId: row.tenant_id,
            did: row.did,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            phone: row.phone,
            baseSalary: row.base_salary,
            currency: row.currency,
            nssaNumber: row.nssa_number,
            tin: row.tin,
            status: row.status as any,
            createdAt: row.created_at
        }
    }

    async listEmployees(tenantId: string = 'default'): Promise<Employee[]> {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare('SELECT * FROM employees WHERE tenant_id = ?').all(tenantId) as any[]
        return rows.map(row => ({
            id: row.id,
            tenantId: row.tenant_id,
            did: row.did,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            phone: row.phone,
            baseSalary: row.base_salary,
            currency: row.currency,
            nssaNumber: row.nssa_number,
            tin: row.tin,
            status: row.status as any,
            createdAt: row.created_at
        }))
    }

    /**
     * Run payroll calculation for a period
     * This applies NSSA (4.5% up to max) and PAYE tables
     */
    async calculatePayrollRun(tenantId: string, period: string): Promise<PayrollRun> {
        const db = DatabaseManager.getDatabase()
        const runId = `RUN-${period}-${randomUUID().substring(0, 6)}`
        const employees = await this.listEmployees(tenantId)
        const activeEmployees = employees.filter(e => e.status === 'active')

        let totalGross = 0
        let totalNet = 0
        const payslips: any[] = []

        // Statutory Constants (Zimbabwe 2024 Estimates for MVP)
        const NSSA_RATE = 0.045 // 4.5%
        const NSSA_CEILING_USD = 700 // Max insurable earnings
        const AIDS_LEVY_RATE = 0.03 // 3% of PAYE

        // Transaction within database transaction
        const insertTx = db.transaction(() => {
            // Create Run
            db.prepare(`
                INSERT INTO payroll_runs (id, tenant_id, period, status, total_gross, total_net)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(runId, tenantId, period, 'draft', 0, 0)

            for (const emp of activeEmployees) {
                const gross = emp.baseSalary

                // 1. Calculate NSSA
                const nssaCalc = new NSSACalculator()
                const nssa = nssaCalc.calculate(gross)

                // 2. Calculate Taxable Income (Gross - NSSA)
                const taxableIncome = gross - nssa

                // 3. Calculate PAYE & AIDS Levy
                const payeCalc = new PAYECalculator()
                const paye = payeCalc.calculate(taxableIncome)
                const aidsLevy = payeCalc.calculateAidsLevy(paye)

                const totalDeductions = nssa + paye + aidsLevy
                const net = gross - totalDeductions

                totalGross += gross
                totalNet += net

                const payslipId = `SLIP-${randomUUID()}`
                const deductions = { nssa, paye, aids_levy: aidsLevy, other: 0 }

                db.prepare(`
                    INSERT INTO payslips (id, run_id, employee_id, period, gross_amount, deductions, net_amount, currency, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    payslipId,
                    runId,
                    emp.id,
                    period,
                    gross,
                    JSON.stringify(deductions),
                    net,
                    emp.currency,
                    'pending'
                )
            }

            // Update Run Totals
            db.prepare(`
                UPDATE payroll_runs SET total_gross = ?, total_net = ? WHERE id = ?
            `).run(totalGross, totalNet, runId)
        })

        insertTx()

        return {
            id: runId,
            tenantId,
            period,
            status: 'draft',
            totalGross,
            totalNet,
            createdAt: new Date().toISOString()
        }
    }

    /**
     * Issue Payslip Verifiable Credentials for a completed run
     */
    async issuePayslips(runId: string): Promise<number> {
        const db = DatabaseManager.getDatabase()
        const slips = db.prepare(`
            SELECT p.*, e.did, e.first_name, e.last_name, e.nssa_number 
            FROM payslips p 
            JOIN employees e ON p.employee_id = e.id 
            WHERE p.run_id = ? AND p.status = 'pending'
        `).all(runId) as any[]

        let issuedCount = 0

        for (const slip of slips) {
            try {
                const deductions = JSON.parse(slip.deductions)

                // Prepare VC Claims
                const claims = {
                    payslipId: slip.id,
                    employeeName: `${slip.first_name} ${slip.last_name}`,
                    nssaNumber: slip.nssa_number,
                    period: slip.period,
                    grossAmount: slip.gross_amount,
                    netAmount: slip.net_amount,
                    currency: slip.currency,
                    deductions: deductions,
                    employer: 'Credo Merchant (Demo)' // In real app, fetch tenant name
                }

                // Issue Credential Offer
                const offer = await credentialIssuanceService.createOffer({
                    credentialType: 'PayslipDef',
                    claims: claims,
                    tenantId: 'default', // TODO: Use actual tenant ID from run
                    subjectDid: slip.did // If employee has DID, we can enable direct issuance
                })

                // Update payslip record
                db.prepare(`
                    UPDATE payslips SET payslip_vc_id = ?, status = 'issued' WHERE id = ?
                `).run(offer.offerId, slip.id)

                issuedCount++
            } catch (err) {
                logger.error({ payslipId: slip.id, error: err }, 'Failed to issue Payslip VC')
            }
        }

        db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('completed', runId)

        return issuedCount
    }

    async listRuns(tenantId: string = 'default'): Promise<PayrollRun[]> {
        const db = DatabaseManager.getDatabase()
        const rows = db.prepare('SELECT * FROM payroll_runs WHERE tenant_id = ? ORDER BY period DESC').all(tenantId) as any[]
        return rows.map(r => ({
            id: r.id,
            tenantId: r.tenant_id,
            period: r.period,
            status: r.status as any,
            totalGross: r.total_gross,
            totalNet: r.total_net,
            createdAt: r.created_at
        }))
    }

    async getRunDetails(runId: string): Promise<{ run: PayrollRun, payslips: Payslip[] }> {
        const db = DatabaseManager.getDatabase()
        const runRow = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId) as any
        if (!runRow) throw new Error('Run not found')

        const slipRows = db.prepare('SELECT * FROM payslips WHERE run_id = ?').all(runId) as any[]

        return {
            run: {
                id: runRow.id,
                tenantId: runRow.tenant_id,
                period: runRow.period,
                status: runRow.status as any,
                totalGross: runRow.total_gross,
                totalNet: runRow.total_net,
                createdAt: runRow.created_at
            },
            payslips: slipRows.map(s => ({
                id: s.id,
                runId: s.run_id,
                employeeId: s.employee_id,
                period: s.period,
                grossAmount: s.gross_amount,
                deductions: JSON.parse(s.deductions),
                netAmount: s.net_amount,
                currency: s.currency,
                payslipVcId: s.payslip_vc_id,
                status: s.status,
                createdAt: s.created_at
            }))
        }
    }
}

export const payrollService = new PayrollService()

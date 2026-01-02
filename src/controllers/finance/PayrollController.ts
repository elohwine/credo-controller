import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { payrollService, Employee, PayrollRun, Payslip } from '../../services/PayrollService'
import { payoutService } from '../../services/PayoutService'

export interface CreateEmployeeRequest {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    baseSalary: number
    currency?: string
    nssaNumber?: string
    tin?: string
    did?: string
}

export interface CreateRunRequest {
    period: string // YYYY-MM
}

@Route('api/payroll')
@Tags('Payroll Module')
export class PayrollController extends Controller {

    /**
     * List all employees
     */
    @Get('employees')
    public async listEmployees(): Promise<Employee[]> {
        return payrollService.listEmployees()
    }

    /**
     * Create or update an employee
     */
    @Post('employees')
    public async saveEmployee(
        @Body() body: CreateEmployeeRequest
    ): Promise<Employee> {
        const employee = await payrollService.saveEmployee(body)
        this.setStatus(201)
        return employee
    }

    /**
     * List payroll runs
     */
    @Get('runs')
    public async listRuns(): Promise<PayrollRun[]> {
        return payrollService.listRuns()
    }

    /**
     * Calculate a new payroll run (Draft)
     */
    @Post('runs')
    public async createRun(
        @Body() body: CreateRunRequest
    ): Promise<PayrollRun> {
        return payrollService.calculatePayrollRun('default', body.period)
    }

    /**
     * Get details of a specific payroll run including payslips
     */
    @Get('runs/{runId}')
    public async getRunDetails(
        @Path() runId: string
    ): Promise<{ run: PayrollRun, payslips: Payslip[] }> {
        return payrollService.getRunDetails(runId)
    }

    /**
     * Issue Payslip VCs for a completed payroll run
     */
    @Post('runs/{runId}/issue')
    public async issuePayslips(
        @Path() runId: string
    ): Promise<{ issuedCount: number, status: string }> {
        const count = await payrollService.issuePayslips(runId)
        return {
            issuedCount: count,
            status: 'completed'
        }
    }

    /**
     * Process salary disbursements (EcoCash Bulk) and Statutory Remittances
     */
    @Post('runs/{runId}/payout')
    public async processPayout(
        @Path() runId: string
    ): Promise<any> {
        return payoutService.processRunPayout(runId)
    }
}

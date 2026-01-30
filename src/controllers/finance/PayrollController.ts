import { Controller, Post, Get, Route, Tags, Body, Path, Query } from 'tsoa'
import { payrollService, Employee, PayrollRun, Payslip, TaxCompliance } from '../../services/PayrollService'
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

export interface IssueTaxComplianceRequest {
    taxType: 'NSSA' | 'PAYE' | 'AIDS_LEVY'
    referenceNumber?: string
}

export interface UpdateTaxComplianceStatusRequest {
    status: 'filed' | 'confirmed' | 'rejected'
    proofOfPaymentRef?: string
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
     * Also issues a PayrollRunVC as batch summary
     */
    @Post('runs/{runId}/issue')
    public async issuePayslips(
        @Path() runId: string
    ): Promise<{ issuedCount: number, runVcId?: string, status: string }> {
        const result = await payrollService.issuePayslips(runId)
        return {
            issuedCount: result.issuedCount,
            runVcId: result.runVcId,
            status: 'completed'
        }
    }

    /**
     * Re-offer PayrollRunVC credential
     * Returns the credential offer URI for users who missed the initial invitation
     */
    @Post('runs/{runId}/reoffer')
    public async reofferPayrollRunVC(
        @Path() runId: string
    ): Promise<{ offerUri: string, credential_offer_deeplink: string }> {
        const offer = await payrollService.getPayrollRunVCOffer(runId)
        return {
            offerUri: offer.credential_offer_deeplink,
            credential_offer_deeplink: offer.credential_offer_deeplink
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

    // ==================== TAX COMPLIANCE ENDPOINTS ====================

    /**
     * List all tax compliance records
     */
    @Get('tax-compliance')
    public async listTaxCompliance(): Promise<TaxCompliance[]> {
        return payrollService.listTaxCompliance()
    }

    /**
     * Issue a TaxComplianceVC for a payroll run
     */
    @Post('runs/{runId}/tax-compliance')
    public async issueTaxCompliance(
        @Path() runId: string,
        @Body() body: IssueTaxComplianceRequest
    ): Promise<TaxCompliance> {
        return payrollService.issueTaxComplianceVC(runId, body.taxType, body.referenceNumber)
    }

    /**
     * Update tax compliance status after filing with authority
     */
    @Post('tax-compliance/{complianceId}/status')
    public async updateTaxComplianceStatus(
        @Path() complianceId: string,
        @Body() body: UpdateTaxComplianceStatusRequest
    ): Promise<{ success: boolean }> {
        await payrollService.updateTaxComplianceStatus(
            complianceId,
            body.status,
            body.proofOfPaymentRef
        )
        return { success: true }
    }
}

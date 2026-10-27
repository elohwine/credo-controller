import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Path, Request, Security } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { orgEntitlementService } from '../../services/OrgEntitlementService'
import { payoutService } from '../../services/PayoutService'
import { payrollService, Employee, PayrollRun, Payslip, TaxCompliance } from '../../services/PayrollService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

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

/** The same people who may issue payslips (`OrgWorkflowActorService` issue_payslip), plus owners and admins. */
const PAYROLL_ROLES = new Set(['owner', 'admin', 'payroll', 'hr_manager', 'finance_manager', 'accountant'])

@Route('api/payroll')
@Tags('Payroll Module')
export class PayrollController extends Controller {
  /** Payroll belongs to one organisation, needs People & payroll switched on, and a role that runs pay. */
  private payrollTenant(request: ExRequest): string {
    const user = (request as any).user
    const tenantId = String(user?.tenantId || '')
    if (!tenantId) throw new StatusException('Unauthorized', 401)
    if (getTenantById(tenantId)?.tenantType !== 'ORG') {
      throw new StatusException('Switch into your organisation to open payroll.', 403)
    }
    if (!PAYROLL_ROLES.has(String(user?.orgRole || ''))) {
      throw new StatusException('Only an owner, admin, HR or finance manager can run payroll.', 403)
    }
    if (!orgEntitlementService.hasModule(tenantId, 'people_payroll')) {
      throw new StatusException(
        'Your organisation has not switched on People & payroll. Ask the owner to turn it on under Organization setup.',
        403,
      )
    }
    return tenantId
  }

  private async ownRun(tenantId: string, runId: string): Promise<{ run: PayrollRun; payslips: Payslip[] }> {
    const details = await payrollService.getRunDetails(runId).catch(() => null)
    if (!details || details.run.tenantId !== tenantId) throw new StatusException('Payroll run not found', 404)
    return details
  }

  /**
   * List all employees
   */
  @Get('employees')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listEmployees(@Request() request: ExRequest): Promise<Employee[]> {
    return payrollService.listEmployees(this.payrollTenant(request))
  }

  /**
   * Create or update an employee
   */
  @Post('employees')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async saveEmployee(@Request() request: ExRequest, @Body() body: CreateEmployeeRequest): Promise<Employee> {
    const tenantId = this.payrollTenant(request)
    const employee = await payrollService.saveEmployee({ ...body, tenantId })
    this.setStatus(201)
    return employee
  }

  /**
   * List payroll runs
   */
  @Get('runs')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listRuns(@Request() request: ExRequest): Promise<PayrollRun[]> {
    return payrollService.listRuns(this.payrollTenant(request))
  }

  /**
   * Calculate a new payroll run (Draft)
   */
  @Post('runs')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createRun(@Request() request: ExRequest, @Body() body: CreateRunRequest): Promise<PayrollRun> {
    const tenantId = this.payrollTenant(request)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body?.period || ''))) {
      throw new StatusException('Choose a month as YYYY-MM.', 400)
    }
    const db = DatabaseManager.getDatabase()
    const action = `payroll:create-run:${body.period}`
    const replay = IdempotencyGuard.guard(db, request, tenantId, action)
    if (replay.duplicate) return replay.response as PayrollRun
    const run = await payrollService.calculatePayrollRun(tenantId, body.period)
    if (replay.key) IdempotencyGuard.record(db, replay.key, tenantId, action, run)
    return run
  }

  /**
   * Get details of a specific payroll run including payslips
   */
  @Get('runs/{runId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getRunDetails(
    @Request() request: ExRequest,
    @Path() runId: string,
  ): Promise<{ run: PayrollRun; payslips: Payslip[] }> {
    return this.ownRun(this.payrollTenant(request), runId)
  }

  /**
   * Issue Payslip VCs for a completed payroll run
   * Also issues a PayrollRunVC as batch summary
   */
  @Post('runs/{runId}/issue')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issuePayslips(
    @Request() request: ExRequest,
    @Path() runId: string,
  ): Promise<{ issuedCount: number; runVcId?: string; status: string }> {
    const tenantId = this.payrollTenant(request)
    await this.ownRun(tenantId, runId)
    const result = await payrollService.issuePayslips(runId)
    return {
      issuedCount: result.issuedCount,
      runVcId: result.runVcId,
      status: 'completed',
    }
  }

  /**
   * Re-offer PayrollRunVC credential
   * Returns the credential offer URI for users who missed the initial invitation
   */
  @Post('runs/{runId}/reoffer')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async reofferPayrollRunVC(
    @Request() request: ExRequest,
    @Path() runId: string,
  ): Promise<{ offerUri: string; credential_offer_deeplink: string }> {
    const tenantId = this.payrollTenant(request)
    await this.ownRun(tenantId, runId)
    const offer = await payrollService.getPayrollRunVCOffer(runId)
    return {
      offerUri: offer.credential_offer_deeplink,
      credential_offer_deeplink: offer.credential_offer_deeplink,
    }
  }

  /**
   * Pay salaries for a run once. A run that is already paid answers with its earlier result.
   */
  @Post('runs/{runId}/payout')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async processPayout(@Request() request: ExRequest, @Path() runId: string): Promise<any> {
    const tenantId = this.payrollTenant(request)
    const { run } = await this.ownRun(tenantId, runId)
    const db = DatabaseManager.getDatabase()
    const action = 'payroll:payout'
    const naturalKey = `natural:payroll-payout:${tenantId}:${runId}`
    const replay = IdempotencyGuard.checkAndReturn(db, naturalKey, tenantId, action)
    if (replay) return replay.response
    if (run.status === 'paid') throw new StatusException('This payroll run is already paid.', 409)
    if (run.status !== 'completed') {
      throw new StatusException('Issue the payslips for this run before paying it.', 409)
    }
    const result = await payoutService.processRunPayout(runId)
    IdempotencyGuard.record(db, naturalKey, tenantId, action, result)
    return result
  }

  // ==================== TAX COMPLIANCE ENDPOINTS ====================

  /**
   * List all tax compliance records
   */
  @Get('tax-compliance')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listTaxCompliance(@Request() request: ExRequest): Promise<TaxCompliance[]> {
    return payrollService.listTaxCompliance(this.payrollTenant(request))
  }

  /**
   * Issue a TaxComplianceVC for a payroll run
   */
  @Post('runs/{runId}/tax-compliance')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issueTaxCompliance(
    @Request() request: ExRequest,
    @Path() runId: string,
    @Body() body: IssueTaxComplianceRequest,
  ): Promise<TaxCompliance> {
    const tenantId = this.payrollTenant(request)
    await this.ownRun(tenantId, runId)
    return payrollService.issueTaxComplianceVC(runId, body.taxType, body.referenceNumber)
  }

  /**
   * Update tax compliance status after filing with authority
   */
  @Post('tax-compliance/{complianceId}/status')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async updateTaxComplianceStatus(
    @Request() request: ExRequest,
    @Path() complianceId: string,
    @Body() body: UpdateTaxComplianceStatusRequest,
  ): Promise<{ success: boolean }> {
    const tenantId = this.payrollTenant(request)
    const owned = (await payrollService.listTaxCompliance(tenantId)).some((row) => row.id === complianceId)
    if (!owned) throw new StatusException('Tax record not found', 404)
    await payrollService.updateTaxComplianceStatus(complianceId, body.status, body.proofOfPaymentRef)
    return { success: true }
  }
}

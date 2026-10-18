import { Request as ExRequest } from 'express'
import { Controller, Get, Post, Route, Tags, Query, Body, Request, Security } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { reportingService, IncomeStatement, BalanceSheet, CashFlowStatement } from '../../services/ReportingService'

export interface CreateStatementOfferRequest {
  startDate: string
  endDate: string
}

export interface CreateBalanceSheetOfferRequest {
  asOfDate: string
}

export interface StatementOfferResponse {
  uri: string
  statementType: string
}

@Route('api/finance')
@Tags('Financial Reporting')
export class ReportingController extends Controller {
  private tenantForReporter(request: ExRequest): string {
    const user = (request as any).user || {}
    const tenantId = String(user.tenantId || '')
    if (!tenantId || !user.id) throw new StatusException('Organization sign-in is required.', 401)
    const membership = DatabaseManager.getDatabase()
      .prepare(
        `SELECT m.role, r.permissions
           FROM org_memberships m
           LEFT JOIN organizations o ON o.tenant_id = m.org_tenant_id
           LEFT JOIN roles r ON r.organization_id = o.id AND r.membership_role = m.role
          WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active' LIMIT 1`,
      )
      .get(tenantId, String(user.id)) as { role?: string; permissions?: string } | undefined
    let permissions: string[] = []
    try {
      permissions = membership?.permissions ? JSON.parse(membership.permissions) : []
    } catch {
      permissions = []
    }
    if (
      !['owner', 'admin'].includes(String(membership?.role || '').toLowerCase()) &&
      !permissions.includes('report.read')
    ) {
      throw new StatusException('You do not have permission to view reports.', 403)
    }
    return tenantId
  }

  /**
   * Generate an Income Statement (P&L) for a specific period.
   * Aggregates Sales, Payroll, and Expenses.
   */
  @Get('income-statement')
  @Security('jwt', ['tenant'])
  public async getIncomeStatement(
    @Query() startDate: string,
    @Query() endDate: string,
    @Request() request: ExRequest,
  ): Promise<IncomeStatement> {
    return reportingService.generateIncomeStatement(this.tenantForReporter(request), startDate, endDate)
  }

  /**
   * Generate a Balance Sheet as of a specific date.
   */
  @Get('balance-sheet')
  @Security('jwt', ['tenant'])
  public async getBalanceSheet(@Query() asOfDate: string, @Request() request: ExRequest): Promise<BalanceSheet> {
    return reportingService.generateBalanceSheet(this.tenantForReporter(request), asOfDate)
  }

  /**
   * Generate a Cash Flow Statement for a specific period.
   */
  @Get('cash-flow')
  @Security('jwt', ['tenant'])
  public async getCashFlowStatement(
    @Query() startDate: string,
    @Query() endDate: string,
    @Request() request: ExRequest,
  ): Promise<CashFlowStatement> {
    return reportingService.generateCashFlowStatement(this.tenantForReporter(request), startDate, endDate)
  }

  /**
   * Create a Credential Offer for a verifiable Income Statement VC.
   * The returned URI can be displayed as a QR code for an auditor to scan.
   */
  @Post('income-statement/offer')
  @Security('jwt', ['tenant'])
  public async createIncomeStatementOffer(
    @Body() body: CreateStatementOfferRequest,
    @Request() request: ExRequest,
  ): Promise<StatementOfferResponse> {
    const uri = await reportingService.createIncomeStatementOffer(
      this.tenantForReporter(request),
      body.startDate,
      body.endDate,
    )
    return { uri, statementType: 'IncomeStatementVC' }
  }

  /**
   * Create a Credential Offer for a verifiable Balance Sheet VC.
   */
  @Post('balance-sheet/offer')
  @Security('jwt', ['tenant'])
  public async createBalanceSheetOffer(
    @Body() body: CreateBalanceSheetOfferRequest,
    @Request() request: ExRequest,
  ): Promise<StatementOfferResponse> {
    const uri = await reportingService.createBalanceSheetOffer(this.tenantForReporter(request), body.asOfDate)
    return { uri, statementType: 'BalanceSheetVC' }
  }

  /**
   * Create a Credential Offer for a verifiable Cash Flow Statement VC.
   */
  @Post('cash-flow/offer')
  @Security('jwt', ['tenant'])
  public async createCashFlowOffer(
    @Body() body: CreateStatementOfferRequest,
    @Request() request: ExRequest,
  ): Promise<StatementOfferResponse> {
    const uri = await reportingService.createCashFlowOffer(
      this.tenantForReporter(request),
      body.startDate,
      body.endDate,
    )
    return { uri, statementType: 'CashFlowVC' }
  }
}

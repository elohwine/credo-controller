
import { Controller, Get, Post, Route, Tags, Query, Body } from 'tsoa'
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

    /**
     * Generate an Income Statement (P&L) for a specific period.
     * Aggregates Sales, Payroll, and Expenses.
     */
    @Get('income-statement')
    public async getIncomeStatement(
        @Query() startDate: string,
        @Query() endDate: string
    ): Promise<IncomeStatement> {
        // In a real app, we'd get tenantId from auth context
        return reportingService.generateIncomeStatement('default', startDate, endDate)
    }

    /**
     * Generate a Balance Sheet as of a specific date.
     */
    @Get('balance-sheet')
    public async getBalanceSheet(
        @Query() asOfDate: string
    ): Promise<BalanceSheet> {
        return reportingService.generateBalanceSheet('default', asOfDate)
    }

    /**
     * Generate a Cash Flow Statement for a specific period.
     */
    @Get('cash-flow')
    public async getCashFlowStatement(
        @Query() startDate: string,
        @Query() endDate: string
    ): Promise<CashFlowStatement> {
        return reportingService.generateCashFlowStatement('default', startDate, endDate)
    }

    /**
     * Create a Credential Offer for a verifiable Income Statement VC.
     * The returned URI can be displayed as a QR code for an auditor to scan.
     */
    @Post('income-statement/offer')
    public async createIncomeStatementOffer(
        @Body() body: CreateStatementOfferRequest
    ): Promise<StatementOfferResponse> {
        const uri = await reportingService.createIncomeStatementOffer(
            'default',
            body.startDate,
            body.endDate
        )
        return { uri, statementType: 'IncomeStatementVC' }
    }

    /**
     * Create a Credential Offer for a verifiable Balance Sheet VC.
     */
    @Post('balance-sheet/offer')
    public async createBalanceSheetOffer(
        @Body() body: CreateBalanceSheetOfferRequest
    ): Promise<StatementOfferResponse> {
        const uri = await reportingService.createBalanceSheetOffer(
            'default',
            body.asOfDate
        )
        return { uri, statementType: 'BalanceSheetVC' }
    }

    /**
     * Create a Credential Offer for a verifiable Cash Flow Statement VC.
     */
    @Post('cash-flow/offer')
    public async createCashFlowOffer(
        @Body() body: CreateStatementOfferRequest
    ): Promise<StatementOfferResponse> {
        const uri = await reportingService.createCashFlowOffer(
            'default',
            body.startDate,
            body.endDate
        )
        return { uri, statementType: 'CashFlowVC' }
    }
}

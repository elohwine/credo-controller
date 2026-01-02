
import { Controller, Get, Post, Route, Tags, Query, Body } from 'tsoa'
import { reportingService, IncomeStatement } from '../../services/ReportingService'

export interface CreateStatementOfferRequest {
    startDate: string
    endDate: string
}

export interface StatementOfferResponse {
    uri: string
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
     * Create a Credential Offer for a verifiable Financial Statement (Income Statement).
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
        return { uri }
    }
}

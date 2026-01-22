
import { DatabaseManager } from '../persistence/DatabaseManager'
import { credentialIssuanceService } from './CredentialIssuanceService'
import { rootLogger } from '../utils/pinoLogger'
import { randomUUID } from 'crypto'

const logger = rootLogger.child({ module: 'ReportingService' })

export interface IncomeStatement {
    statementId: string
    organizationName: string
    periodStart: string
    periodEnd: string
    revenue: number
    costOfGoodsSold: number
    grossProfit: number
    operatingExpenses: number
    operatingIncome: number
    otherIncome: number
    otherExpenses: number
    expenses: number
    netIncome: number
    breakdown: {
        sales: number
        payroll: number
        operations: number
    }
    currency: string
    generatedAt: string
}

export interface BalanceSheet {
    statementId: string
    organizationName: string
    asOfDate: string
    // Assets
    currentAssets: number
    cash: number
    accountsReceivable: number
    inventory: number
    nonCurrentAssets: number
    propertyPlantEquipment: number
    totalAssets: number
    // Liabilities
    currentLiabilities: number
    accountsPayable: number
    shortTermDebt: number
    nonCurrentLiabilities: number
    longTermDebt: number
    totalLiabilities: number
    // Equity
    shareCapital: number
    retainedEarnings: number
    totalEquity: number
    currency: string
    generatedAt: string
}

export interface CashFlowStatement {
    statementId: string
    organizationName: string
    periodStart: string
    periodEnd: string
    // Operating Activities
    cashFromOperations: number
    netIncome: number
    depreciation: number
    changesInWorkingCapital: number
    // Investing Activities
    cashFromInvesting: number
    capitalExpenditures: number
    assetSales: number
    // Financing Activities
    cashFromFinancing: number
    debtProceeds: number
    debtRepayments: number
    dividendsPaid: number
    // Summary
    netCashFlow: number
    beginningCash: number
    endingCash: number
    currency: string
    generatedAt: string
}

export class ReportingService {

    /**
     * Generate an Income Statement for a given period.
     * Aggregates Sales (Carts), Payroll (Gross), and Operations (Expense Claims).
     */
    async generateIncomeStatement(tenantId: string, startDate: string, endDate: string, organizationName = 'Demo Corp'): Promise<IncomeStatement> {
        const db = DatabaseManager.getDatabase()
        const statementId = `IS-${startDate.slice(0, 7)}-${randomUUID().slice(0, 8)}`

        // 1. Calculate Revenue (Paid Carts)
        const salesRow = db.prepare(`
            SELECT SUM(total) as total 
            FROM carts 
            WHERE merchant_id = ? 
              AND status = 'paid' 
              AND updated_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const revenue = salesRow?.total || 0

        // 2. Calculate Payroll Expense (Completed Runs)
        const payrollRow = db.prepare(`
            SELECT SUM(total_gross) as total 
            FROM payroll_runs 
            WHERE tenant_id = ? 
              AND status IN ('completed', 'paid')
              AND created_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const payrollExpense = payrollRow?.total || 0

        // 3. Calculate Operations Expense (Paid Claims)
        const opsRow = db.prepare(`
            SELECT SUM(amount) as total 
            FROM expense_claims 
            WHERE tenant_id = ? 
              AND status = 'paid' 
              AND paid_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const opsExpense = opsRow?.total || 0

        // Calculate derived values
        const costOfGoodsSold = revenue * 0.4 // Simplified: 40% COGS
        const grossProfit = revenue - costOfGoodsSold
        const operatingExpenses = payrollExpense + opsExpense
        const operatingIncome = grossProfit - operatingExpenses
        const otherIncome = 0
        const otherExpenses = 0
        const totalExpenses = costOfGoodsSold + operatingExpenses + otherExpenses
        const netIncome = revenue - totalExpenses + otherIncome

        return {
            statementId,
            organizationName,
            periodStart: startDate,
            periodEnd: endDate,
            revenue,
            costOfGoodsSold,
            grossProfit,
            operatingExpenses,
            operatingIncome,
            otherIncome,
            otherExpenses,
            expenses: totalExpenses,
            netIncome,
            breakdown: {
                sales: revenue,
                payroll: payrollExpense,
                operations: opsExpense
            },
            currency: 'USD',
            generatedAt: new Date().toISOString()
        }
    }

    /**
     * Generate a Balance Sheet as of a specific date.
     * Note: This is a simplified version using available data.
     */
    async generateBalanceSheet(tenantId: string, asOfDate: string, organizationName = 'Demo Corp'): Promise<BalanceSheet> {
        const db = DatabaseManager.getDatabase()
        const statementId = `BS-${asOfDate.slice(0, 7)}-${randomUUID().slice(0, 8)}`

        // Cash: Sum of paid carts minus paid expenses minus paid payroll
        const cashInRow = db.prepare(`
            SELECT SUM(total) as total FROM carts 
            WHERE merchant_id = ? AND status = 'paid' AND updated_at <= ?
        `).get(tenantId, asOfDate) as { total: number }
        const cashIn = cashInRow?.total || 0

        const expenseOutRow = db.prepare(`
            SELECT SUM(amount) as total FROM expense_claims 
            WHERE tenant_id = ? AND status = 'paid' AND paid_at <= ?
        `).get(tenantId, asOfDate) as { total: number }
        const expenseOut = expenseOutRow?.total || 0

        const payrollOutRow = db.prepare(`
            SELECT SUM(total_net) as total FROM payroll_runs 
            WHERE tenant_id = ? AND status = 'paid' AND created_at <= ?
        `).get(tenantId, asOfDate) as { total: number }
        const payrollOut = payrollOutRow?.total || 0

        // Accounts Receivable: Unpaid carts
        const arRow = db.prepare(`
            SELECT SUM(total) as total FROM carts 
            WHERE merchant_id = ? AND status = 'pending' AND created_at <= ?
        `).get(tenantId, asOfDate) as { total: number }
        const accountsReceivable = arRow?.total || 0

        // Calculate values
        const cash = Math.max(0, cashIn - expenseOut - payrollOut + 50000) // Starting capital
        const inventory = 25000 // Placeholder
        const currentAssets = cash + accountsReceivable + inventory
        const propertyPlantEquipment = 100000 // Placeholder
        const nonCurrentAssets = propertyPlantEquipment
        const totalAssets = currentAssets + nonCurrentAssets

        // Accounts Payable: Pending expense claims
        const apRow = db.prepare(`
            SELECT SUM(amount) as total FROM expense_claims 
            WHERE tenant_id = ? AND status IN ('approved', 'pending') AND created_at <= ?
        `).get(tenantId, asOfDate) as { total: number }
        const accountsPayable = apRow?.total || 0

        const shortTermDebt = 10000 // Placeholder
        const currentLiabilities = accountsPayable + shortTermDebt
        const longTermDebt = 50000 // Placeholder
        const nonCurrentLiabilities = longTermDebt
        const totalLiabilities = currentLiabilities + nonCurrentLiabilities

        // Equity (balancing entry)
        const shareCapital = 50000
        const retainedEarnings = totalAssets - totalLiabilities - shareCapital
        const totalEquity = shareCapital + retainedEarnings

        return {
            statementId,
            organizationName,
            asOfDate,
            currentAssets,
            cash,
            accountsReceivable,
            inventory,
            nonCurrentAssets,
            propertyPlantEquipment,
            totalAssets,
            currentLiabilities,
            accountsPayable,
            shortTermDebt,
            nonCurrentLiabilities,
            longTermDebt,
            totalLiabilities,
            shareCapital,
            retainedEarnings,
            totalEquity,
            currency: 'USD',
            generatedAt: new Date().toISOString()
        }
    }

    /**
     * Generate a Cash Flow Statement for a given period.
     */
    async generateCashFlowStatement(tenantId: string, startDate: string, endDate: string, organizationName = 'Demo Corp'): Promise<CashFlowStatement> {
        const db = DatabaseManager.getDatabase()
        const statementId = `CF-${startDate.slice(0, 7)}-${randomUUID().slice(0, 8)}`

        // Get income statement for the period
        const incomeStatement = await this.generateIncomeStatement(tenantId, startDate, endDate, organizationName)

        // Cash from customers (paid carts)
        const cashInRow = db.prepare(`
            SELECT SUM(total) as total FROM carts 
            WHERE merchant_id = ? AND status = 'paid' 
            AND updated_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const cashFromCustomers = cashInRow?.total || 0

        // Cash paid to employees (payroll)
        const payrollRow = db.prepare(`
            SELECT SUM(total_net) as total FROM payroll_runs 
            WHERE tenant_id = ? AND status = 'paid' 
            AND created_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const cashToEmployees = payrollRow?.total || 0

        // Cash paid for expenses
        const expenseRow = db.prepare(`
            SELECT SUM(amount) as total FROM expense_claims 
            WHERE tenant_id = ? AND status = 'paid' 
            AND paid_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const cashForExpenses = expenseRow?.total || 0

        // Calculate operating cash flow
        const depreciation = 5000 // Placeholder monthly depreciation
        const changesInWorkingCapital = 0 // Simplified
        const cashFromOperations = cashFromCustomers - cashToEmployees - cashForExpenses

        // Investing (placeholders)
        const capitalExpenditures = 0
        const assetSales = 0
        const cashFromInvesting = assetSales - capitalExpenditures

        // Financing (placeholders)
        const debtProceeds = 0
        const debtRepayments = 0
        const dividendsPaid = 0
        const cashFromFinancing = debtProceeds - debtRepayments - dividendsPaid

        const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing

        // Get beginning balance from balance sheet at start date
        const beginningBalance = await this.generateBalanceSheet(tenantId, startDate, organizationName)
        const beginningCash = beginningBalance.cash
        const endingCash = beginningCash + netCashFlow

        return {
            statementId,
            organizationName,
            periodStart: startDate,
            periodEnd: endDate,
            cashFromOperations,
            netIncome: incomeStatement.netIncome,
            depreciation,
            changesInWorkingCapital,
            cashFromInvesting,
            capitalExpenditures,
            assetSales,
            cashFromFinancing,
            debtProceeds,
            debtRepayments,
            dividendsPaid,
            netCashFlow,
            beginningCash,
            endingCash,
            currency: 'USD',
            generatedAt: new Date().toISOString()
        }
    }

    /**
     * Creates a Credential Offer URI for the Income Statement VC.
     * This allows an Auditor/Bank wallet to scan and receive the VC.
     */
    async createIncomeStatementOffer(tenantId: string, startDate: string, endDate: string): Promise<string> {
        const statement = await this.generateIncomeStatement(tenantId, startDate, endDate)

        const result = await credentialIssuanceService.createOffer({
            tenantId,
            credentialType: 'IncomeStatementVC',
            claims: statement
        })

        logger.info({ tenantId, statementId: statement.statementId }, 'Created IncomeStatementVC offer')
        return result.credential_offer_uri
    }

    /**
     * Creates a Credential Offer URI for the Balance Sheet VC.
     */
    async createBalanceSheetOffer(tenantId: string, asOfDate: string): Promise<string> {
        const statement = await this.generateBalanceSheet(tenantId, asOfDate)

        const result = await credentialIssuanceService.createOffer({
            tenantId,
            credentialType: 'BalanceSheetVC',
            claims: statement
        })

        logger.info({ tenantId, statementId: statement.statementId }, 'Created BalanceSheetVC offer')
        return result.credential_offer_uri
    }

    /**
     * Creates a Credential Offer URI for the Cash Flow Statement VC.
     */
    async createCashFlowOffer(tenantId: string, startDate: string, endDate: string): Promise<string> {
        const statement = await this.generateCashFlowStatement(tenantId, startDate, endDate)

        const result = await credentialIssuanceService.createOffer({
            tenantId,
            credentialType: 'CashFlowVC',
            claims: statement
        })

        logger.info({ tenantId, statementId: statement.statementId }, 'Created CashFlowVC offer')
        return result.credential_offer_uri
    }
}

export const reportingService = new ReportingService()


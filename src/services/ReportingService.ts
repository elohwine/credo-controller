
import { DatabaseManager } from '../persistence/DatabaseManager'
import { credentialIssuanceService } from './CredentialIssuanceService'
import { rootLogger } from '../utils/pinoLogger'
import { randomUUID } from 'crypto'

const logger = rootLogger.child({ module: 'ReportingService' })

export interface IncomeStatement {
    periodStart: string
    periodEnd: string
    revenue: number
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

export class ReportingService {

    /**
     * Generate an Income Statement for a given period.
     * Aggregates Sales (Carts), Payroll (Gross), and Operations (Expense Claims).
     */
    async generateIncomeStatement(tenantId: string, startDate: string, endDate: string): Promise<IncomeStatement> {
        const db = DatabaseManager.getDatabase()

        // 1. Calculate Revenue (Paid Carts)
        // Note: Using updated_at as the 'paid' time proxy if status is paid
        const salesRow = db.prepare(`
            SELECT SUM(total) as total 
            FROM carts 
            WHERE merchant_id = ? 
              AND status = 'paid' 
              AND updated_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const revenue = salesRow.total || 0

        // 2. Calculate Payroll Expense (Completed Runs)
        // Using total_gross as the expense
        // Note: Period in payroll_runs is 'YYYY-MM', so we might need fuzzy matching or just rely on created_at/updated_at
        // For simplicity in MVP, we'll use created_at of the run
        const payrollRow = db.prepare(`
            SELECT SUM(total_gross) as total 
            FROM payroll_runs 
            WHERE tenant_id = ? 
              AND status IN ('completed', 'paid')
              AND created_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const payrollExpense = payrollRow.total || 0

        // 3. Calculate Operations Expense (Paid Claims)
        const opsRow = db.prepare(`
            SELECT SUM(amount) as total 
            FROM expense_claims 
            WHERE tenant_id = ? 
              AND status = 'paid' 
              AND paid_at BETWEEN ? AND ?
        `).get(tenantId, startDate, endDate) as { total: number }
        const opsExpense = opsRow.total || 0

        const totalExpenses = payrollExpense + opsExpense
        const netIncome = revenue - totalExpenses

        return {
            periodStart: startDate,
            periodEnd: endDate,
            revenue,
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
     * Issue a Financial Statement VC for the given period.
     */
    async issueIncomeStatementVC(tenantId: string, startDate: string, endDate: string): Promise<any> {
        const statement = await this.generateIncomeStatement(tenantId, startDate, endDate)

        // Use the tenant's DID as the subject (self-signed statement about the org)
        // In a real scenario, this might be issued TO a bank or regulator, but here it's often self-asserted 
        // or we need to look up the organization's DID.
        // For this MVP, we'll assume the holder is the Tenant Agent's own DID (Self-Issued) or we create a specific Holder.
        // Let's look up the Issuer DID to use as the subject too (Self-Certification).

        // We need the issuer DID. We can get it via a hack or pass it in.
        // Better: The ReportingController will likely know the context. 
        // But for now, let's just query the DID from the 'dids' table for this tenant?
        // Actually, credentialIssuanceService needs a holderDid/connectionId. 
        // Phase 5 requirement is "SummaryVCs". Let's assume for now we issue it to a specific holder (e.g. an auditor)
        // OR we just create the credential object and return it (unsigned/signed?).
        // `credentialIssuanceService.issueCredential` expects a `connectionId`.

        // To keep it simple: We return the DATA required to issue it. Converting it to a VC usually happens via the OIDC flow 
        // when a "Financial Statement" offer is scanned. 
        // SO: We should likely Create an Offer for this.

        // Wait, the standard flow is:
        // 1. User clicks "Generate Statement" in Portal.
        // 2. Portal shows data.
        // 3. User clicks "Sign & Save" (Self-Issue to Org Wallet) or "Share with Bank" (Issue to Bank).

        // We'll mimic the "Issue to Holder" flow. We need a `holderDid`. 
        // For the MVP, we might require the caller to provide a `connectionId` or `holderDid`.
        throw new Error("Direct issuance not yet implemented. Use the data to create an Offer.")
    }

    /**
     * Creates a Credential Offer URI for the Income Statement.
     * This allows an Auditor/Bank wallet to scan and receive the VC.
     */
    async createIncomeStatementOffer(tenantId: string, startDate: string, endDate: string): Promise<string> {
        const statement = await this.generateIncomeStatement(tenantId, startDate, endDate)

        const credentialSubject = {
            statementType: 'IncomeStatement',
            periodStart: statement.periodStart,
            periodEnd: statement.periodEnd,
            revenue: statement.revenue,
            expenses: statement.expenses,
            netIncome: statement.netIncome,
            assets: 0, // Placeholder for Balance Sheet
            liabilities: 0, // Placeholder
            equity: 0, // Placeholder
            currency: statement.currency,
            generatedAt: statement.generatedAt
        }

        // We use the 'FinancialStatementDef' schema (matches DB entry)
        const result = await credentialIssuanceService.createOffer({
            tenantId,
            credentialType: 'FinancialStatementDef',
            claims: credentialSubject
        })

        return result.credential_offer_uri
    }
}

export const reportingService = new ReportingService()


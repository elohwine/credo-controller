
import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { payrollService } from './PayrollService'
import { credentialIssuanceService } from './CredentialIssuanceService'
import { randomUUID } from 'crypto'

const logger = rootLogger.child({ module: 'PayoutService' })

export interface PayoutResult {
    runId: string
    totalPaid: number
    employeesPaid: number
    failures: number
    remittanceId?: string
}

export class PayoutService {

    /**
     * Process salary disbursements for a payroll run.
     * Simulates EcoCash Bulk Payment.
     */
    async processRunPayout(runId: string): Promise<PayoutResult> {
        const db = DatabaseManager.getDatabase()
        // 1. Get Run and Payslips
        const { run, payslips } = await payrollService.getRunDetails(runId)

        if (run.status !== 'completed' && run.status !== 'processing') {
            // In real life, we only pay 'completed' (vc issued) or processing
            // For now, let's allow paying 'completed' runs where VCs are issued
        }

        logger.info({ runId, count: payslips.length }, 'Starting bulk payout processing')

        let totalPaid = 0
        let successCount = 0
        let failCount = 0

        // 2. Iterate and "Pay"
        for (const slip of payslips) {
            try {
                // Simulate Bank/EcoCash API Call
                // await ecocash.transfer(slip.phoneNumber, slip.netAmount)

                // For demo: 100ms delay
                await new Promise(r => setTimeout(r, 50))

                // Log payment
                logger.info({ employee: slip.employeeId, amount: slip.netAmount }, 'Disbursement successful')

                totalPaid += slip.netAmount
                successCount++

            } catch (e) {
                logger.error({ employee: slip.employeeId, error: e }, 'Disbursement failed')
                failCount++
            }
        }

        // 3. Process Remittance (Simulated)
        const remittanceId = `REM-${randomUUID().substring(0, 8)}`
        // Calculate totals from run
        const nssaTotal = payslips.reduce((sum, p) => sum + p.deductions.nssa, 0)
        const payeTotal = payslips.reduce((sum, p) => sum + p.deductions.paye, 0)

        logger.info({
            remittanceId,
            nssa: nssaTotal,
            paye: payeTotal
        }, 'Statutory remittance processed to authorities')

        // 4. Update Run Status
        db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run('paid', runId)

        return {
            runId,
            totalPaid,
            employeesPaid: successCount,
            failures: failCount,
            remittanceId
        }
    }
}

export const payoutService = new PayoutService()

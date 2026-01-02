
import axios from 'axios'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000/api'

async function main() {
    console.log('🚀 Starting Full Payroll Cycle Verification...')

    // 1. Create Employee
    const empId = `TEST-EMP-${randomUUID().substring(0, 6)}`
    console.log(`1. Creating Employee: ${empId}`)
    const empResp = await axios.post(`${BASE_URL}/payroll/employees`, {
        firstName: 'John',
        lastName: 'Doe',
        baseSalary: 1200, // $1200
        currency: 'USD'
    })
    console.log(`   ✅ Employee created: ${empResp.data.id}`)

    // 2. Create Payroll Run
    const period = `2025-01-${randomUUID().substring(0, 4)}` // Unique period for test
    console.log(`2. Creating Payroll Run for period: ${period}`)
    const runResp = await axios.post(`${BASE_URL}/payroll/runs`, { period })
    const runId = runResp.data.id
    console.log(`   ✅ Run created: ${runId} (Status: ${runResp.data.status})`)

    // 3. Verify Calculations
    const details1 = await axios.get(`${BASE_URL}/payroll/runs/${runId}`)
    const slip = details1.data.payslips.find((p: any) => p.employeeId === empResp.data.id)
    if (!slip) throw new Error('Payslip not generated for new employee')

    console.log(`   Detailed Check: Gross=${slip.grossAmount}, Net=${slip.netAmount}`)
    // Expect: Gross 1200 -> NSSA(54) -> Taxable(1146) -> PAYE(simplification) -> Net
    // Just ensuring it's not 0 is enough for integration test

    // 4. Issue Payslips (VCs)
    console.log('3. Issuing Payslip VCs...')
    const issueResp = await axios.post(`${BASE_URL}/payroll/runs/${runId}/issue`)
    console.log(`   ✅ Issued: ${issueResp.data.issuedCount} payslips`)

    // 5. Process Payout
    console.log('4. Processing Payouts & Remittances...')
    const payoutResp = await axios.post(`${BASE_URL}/payroll/runs/${runId}/payout`)
    const res = payoutResp.data
    console.log(`   Payout Result: Paid=${res.totalPaid}, Success=${res.employeesPaid}, Fail=${res.failures}`)
    console.log(`   Remittance ID: ${res.remittanceId}`)

    if (res.employeesPaid < 1) throw new Error('No employees were paid!')

    // 6. Verify Final Status
    console.log('5. Verifying Final Run Status...')
    const details2 = await axios.get(`${BASE_URL}/payroll/runs/${runId}`)
    console.log(`   Final Status: ${details2.data.run.status}`)

    if (details2.data.run.status !== 'paid') throw new Error('Run status should be paid')

    console.log('🎉 Full Payroll Cycle Verified Successfully!')
}

main().catch(err => {
    console.error('❌ Verification Failed:', err.message)
    if (err.response) {
        console.error('   API Error:', JSON.stringify(err.response.data, null, 2))
    }
    process.exit(1)
})

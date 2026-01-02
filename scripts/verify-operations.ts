
import axios from 'axios'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000/api'
const ADMIN_DID = 'did:test:admin'

async function main() {
    console.log('🚀 Starting HR Operations Verification...')

    // 1. Create Mock Employee
    console.log('1. Setting up Employee...')
    const empResp = await axios.post(`${BASE_URL}/payroll/employees`, {
        firstName: 'Alice',
        lastName: 'Wonder',
        baseSalary: 2000,
        currency: 'USD'
    })
    const empId = empResp.data.id
    console.log(`   ✅ Employee: ${empId}`)

    // --- Leave Flow ---
    console.log('2. Testing Leave Management...')
    // Request Leave
    const leaveResp = await axios.post(`${BASE_URL}/operations/leave`, {
        employeeId: empId,
        leaveType: 'annual',
        startDate: '2025-12-20',
        endDate: '2025-12-25',
        daysCount: 5,
        reason: 'Christmas Break'
    })
    const leaveId = leaveResp.data.id
    console.log(`   ✅ Requested Leave: ${leaveId}`)

    // Approve Leave
    await axios.put(`${BASE_URL}/operations/leave/${leaveId}/status`, {
        adminDid: ADMIN_DID,
        status: 'approved'
    })
    console.log(`   ✅ Approved Leave`)

    // Verify Status
    const listLeave = await axios.get(`${BASE_URL}/operations/leave?employeeId=${empId}`)
    const leave = listLeave.data.find((l: any) => l.id === leaveId)
    if (leave.status !== 'approved') throw new Error('Leave status check failed')

    // --- Expense Flow ---
    console.log('3. Testing Expense Claims...')
    // Submit Claim
    const expResp = await axios.post(`${BASE_URL}/operations/expenses`, {
        employeeId: empId,
        description: 'Team Lunch',
        amount: 85.50,
        currency: 'USD',
        category: 'meals'
    })
    const claimId = expResp.data.id
    console.log(`   ✅ Submitted Claim: ${claimId}`)

    // Approve Claim
    await axios.put(`${BASE_URL}/operations/expenses/${claimId}/status`, {
        adminDid: ADMIN_DID,
        status: 'approved'
    })
    console.log(`   ✅ Approved Claim`)

    // Pay Claim
    await axios.put(`${BASE_URL}/operations/expenses/${claimId}/status`, {
        adminDid: ADMIN_DID,
        status: 'paid'
    })
    console.log(`   ✅ Paid Claim`)

    // Verify Final State
    const listExp = await axios.get(`${BASE_URL}/operations/expenses?employeeId=${empId}`)
    const claim = listExp.data.find((c: any) => c.id === claimId)

    if (claim.status !== 'paid') throw new Error('Expense status check failed')
    if (claim.approvedBy !== ADMIN_DID) throw new Error('Approver check failed')

    console.log('🎉 HR Operations Verification Successful!')
}

main().catch(err => {
    console.error('❌ Verification Failed:', err.message)
    if (err.response) console.error('   API Error:', JSON.stringify(err.response.data, null, 2))
    process.exit(1)
})

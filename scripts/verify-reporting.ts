
import axios from 'axios'
import db from 'better-sqlite3'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000/api'
const DB_PATH = './data/persistence.db'

async function main() {
    console.log('🚀 Starting Financial Reporting Verification...')
    const database = db(DB_PATH)
    
    // Enable foreign keys to match app behavior
    database.pragma('foreign_keys = ON')

    // 1. Seed Data (Direct DB)
    console.log('1. Seeding Financial Data...')
    const tenantId = 'default'
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const now = new Date().toISOString()

    // Clean up previous runs - need to delete in FK order
    // payslips -> expense_claims -> payroll_runs -> employees -> carts
    console.log('   Cleaning up previous runs...')
    database.prepare("DELETE FROM payslips WHERE run_id IN (SELECT id FROM payroll_runs WHERE tenant_id = ?)").run(tenantId)
    database.prepare("DELETE FROM expense_claims WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM payroll_runs WHERE tenant_id = ?").run(tenantId)
    database.prepare("DELETE FROM employees WHERE first_name = 'Test' AND last_name = 'User'").run()
    database.prepare("DELETE FROM carts WHERE merchant_id = ?").run(tenantId)
    console.log('   Cleanup done')

    // Revenue: Paid Cart
    console.log('   Inserting cart...')
    const cartId = `CART-${randomUUID()}`
    database.prepare(`
        INSERT INTO carts (id, merchant_id, items, total, status, updated_at)
        VALUES (?, ?, '[]', 1000, 'paid', ?)
    `).run(cartId, tenantId, now)
    console.log('   Cart inserted:', cartId)

    // Seed Employee for Expense Claim FK
    console.log('   Inserting employee...')
    const empId = `emp-${randomUUID()}`
    database.prepare(`
        INSERT INTO employees (id, tenant_id, first_name, last_name, base_salary)
        VALUES (?, ?, 'Test', 'User', 1000)
    `).run(empId, tenantId)
    console.log('   Employee inserted:', empId)

    // Expense: Payroll Run
    console.log('   Inserting payroll run...')
    const runId = `RUN-${randomUUID()}`
    database.prepare(`
        INSERT INTO payroll_runs (id, tenant_id, period, status, total_gross, created_at)
        VALUES (?, ?, '2025-01', 'completed', 500, ?)
    `).run(runId, tenantId, now)
    console.log('   Payroll run inserted:', runId)

    // Expense: Operation Claim
    console.log('   Inserting expense claim...')
    const claimId = `EXP-${randomUUID()}`
    database.prepare(`
        INSERT INTO expense_claims (id, tenant_id, employee_id, description, amount, category, status, paid_at)
        VALUES (?, ?, ?, 'Test Expense', 100, 'other', 'paid', ?)
    `).run(claimId, tenantId, empId, now)

    console.log('   ✅ Seeded: Revenue=$1000, Payroll=$500, Ops=$100')

    // 2. Verify Income Statement
    console.log('2. Fetching Income Statement...')
    // Query covering "today"
    const start = new Date(Date.now() - 86400000).toISOString() // Yesterday
    const end = new Date(Date.now() + 86400000).toISOString()   // Tomorrow

    const resp = await axios.get(`${BASE_URL}/finance/income-statement`, {
        params: { startDate: start, endDate: end }
    })

    const report = resp.data
    console.log('   📊 Report Received:', JSON.stringify(report, null, 2))

    // Assertions
    if (report.revenue !== 1000) throw new Error(`Expected Revenue 1000, got ${report.revenue}`)
    if (report.expenses !== 600) throw new Error(`Expected Expenses 600, got ${report.expenses}`)
    if (report.netIncome !== 400) throw new Error(`Expected Net Income 400, got ${report.netIncome}`)
    console.log('   ✅ Income Statement Calculations Correct')

    // 3. Verify Credential Offer
    console.log('3. Generating Credential Offer...')
    const offerResp = await axios.post(`${BASE_URL}/finance/income-statement/offer`, {
        startDate: start,
        endDate: end
    })

    if (!offerResp.data.uri) throw new Error('No URI returned for offer')
    console.log(`   ✅ Offer Created: ${offerResp.data.uri.substring(0, 50)}...`)

    console.log('🎉 Financial Reporting Verified Successfully!')
}

main().catch(err => {
    console.error('❌ Verification Failed:', err.message)
    if (err.response) console.error('   API Error:', JSON.stringify(err.response.data, null, 2))
    process.exit(1)
})

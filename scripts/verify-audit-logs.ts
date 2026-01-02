
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { auditService } from '../src/services/AuditService'

async function main() {
    console.log('Verifying Audit Logs Table...')

    // Initialize DB
    DatabaseManager.initialize({ path: './data/persistence.db', verbose: false })
    const db = DatabaseManager.getDatabase()

    // Check Schema
    const tableInfo = db.prepare("PRAGMA table_info(audit_logs)").all()
    if (tableInfo.length === 0) {
        console.error('❌ audit_logs table does not exist!')
        process.exit(1)
    }
    console.log('✅ audit_logs table exists with columns:', tableInfo.map((c: any) => c.name).join(', '))

    // Test Write
    console.log('Testing Audit Log Write...')
    await auditService.logAction({
        tenantId: 'default',
        actionType: 'test_action',
        actorDid: 'did:test:123',
        details: { foo: 'bar' }
    })

    // Allow immediate/async write to flush
    await new Promise(r => setTimeout(r, 2000))

    // Debug: Check Raw DB
    const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any
    console.log('Row count in audit_logs:', count.c)

    const allRows = db.prepare('SELECT * FROM audit_logs').all()
    console.log('All Rows:', JSON.stringify(allRows, null, 2))

    // Test Read
    const logs = await auditService.getLogs('default', undefined, 10)
    console.log('Logs from Service:', logs)

    if (logs.length > 0 && logs[0].actionType === 'test_action') {
        console.log('✅ Write/Read verification successful')
        console.log('Log Entry:', logs[0])
    } else {
        console.error('❌ Failed to retrieve written log entry')
        // process.exit(1) // Don't exit yet, let us see output
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})

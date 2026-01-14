/**
 * Metrics Service for Production Observability
 * Phase 9C: Production Hardening - Metrics & Monitoring
 * 
 * Collects and exposes operational metrics for monitoring dashboards.
 */
import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'MetricsService' })

export interface SystemMetrics {
    timestamp: string
    uptime: number
    memory: {
        heapUsed: number
        heapTotal: number
        external: number
        rss: number
    }
    cpu: {
        user: number
        system: number
    }
}

export interface DatabaseMetrics {
    totalSize: number
    walSize: number
    tableStats: Array<{
        name: string
        rowCount: number
    }>
}

export interface BusinessMetrics {
    credentials: {
        totalIssued: number
        last24h: number
        byType: Record<string, number>
    }
    wallets: {
        totalRegistered: number
        last24h: number
    }
    inventory: {
        totalEvents: number
        stockouts: number
        reservationsPending: number
    }
    finance: {
        receiptsLast24h: number
        revenueUsd: number
    }
    tenants: {
        total: number
        active: number
    }
}

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
        database: boolean
        agent: boolean
        memory: boolean
    }
    details: Record<string, any>
}

class MetricsService {
    private startTime = Date.now()
    private lastCpuUsage = process.cpuUsage()

    /**
     * Get system-level metrics (memory, CPU, uptime)
     */
    getSystemMetrics(): SystemMetrics {
        const memory = process.memoryUsage()
        const cpuUsage = process.cpuUsage(this.lastCpuUsage)
        this.lastCpuUsage = process.cpuUsage()

        return {
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            memory: {
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                external: memory.external,
                rss: memory.rss,
            },
            cpu: {
                user: cpuUsage.user / 1000, // Convert to ms
                system: cpuUsage.system / 1000,
            },
        }
    }

    /**
     * Get database-level metrics
     */
    getDatabaseMetrics(): DatabaseMetrics {
        try {
            const db = DatabaseManager.getDatabase()

            // Get database file size
            const pageCount = db.pragma('page_count', { simple: true }) as number
            const pageSize = db.pragma('page_size', { simple: true }) as number
            const totalSize = pageCount * pageSize

            // Get WAL size
            const walCheckpoint = db.pragma('wal_checkpoint(PASSIVE)') as any[]
            const walSize = walCheckpoint?.[0]?.log || 0

            // Get row counts for key tables
            const tables = [
                'issued_credentials',
                'wallet_users',
                'tenants',
                'inventory_events',
                'inventory_projections',
                'carts',
                'audit_logs',
            ]

            const tableStats = tables.map(name => {
                try {
                    const result = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number }
                    return { name, rowCount: result.count }
                } catch {
                    return { name, rowCount: -1 } // Table doesn't exist
                }
            }).filter(t => t.rowCount >= 0)

            return { totalSize, walSize, tableStats }
        } catch (err: any) {
            logger.error({ err }, 'Failed to get database metrics')
            return { totalSize: 0, walSize: 0, tableStats: [] }
        }
    }

    /**
     * Get business-level metrics
     */
    getBusinessMetrics(): BusinessMetrics {
        try {
            const db = DatabaseManager.getDatabase()
            const now = new Date().toISOString()
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

            // Credential stats
            let totalIssued = 0, last24hCreds = 0
            const credsByType: Record<string, number> = {}
            try {
                const credTotal = db.prepare('SELECT COUNT(*) as count FROM issued_credentials').get() as { count: number }
                totalIssued = credTotal.count

                const cred24h = db.prepare(
                    'SELECT COUNT(*) as count FROM issued_credentials WHERE created_at >= ?'
                ).get(yesterday) as { count: number }
                last24hCreds = cred24h.count

                const credTypes = db.prepare(
                    'SELECT credential_type, COUNT(*) as count FROM issued_credentials GROUP BY credential_type'
                ).all() as Array<{ credential_type: string; count: number }>
                for (const row of credTypes) {
                    credsByType[row.credential_type] = row.count
                }
            } catch { /* table may not exist */ }

            // Wallet stats
            let totalWallets = 0, last24hWallets = 0
            try {
                const walletTotal = db.prepare('SELECT COUNT(*) as count FROM wallet_users').get() as { count: number }
                totalWallets = walletTotal.count

                const wallet24h = db.prepare(
                    'SELECT COUNT(*) as count FROM wallet_users WHERE created_at >= ?'
                ).get(yesterday) as { count: number }
                last24hWallets = wallet24h.count
            } catch { /* table may not exist */ }

            // Inventory stats
            let totalEvents = 0, stockouts = 0, pendingReservations = 0
            try {
                const evTotal = db.prepare('SELECT COUNT(*) as count FROM inventory_events').get() as { count: number }
                totalEvents = evTotal.count

                const stockoutCount = db.prepare(
                    "SELECT COUNT(*) as count FROM inventory_projections WHERE available_quantity <= 0"
                ).get() as { count: number }
                stockouts = stockoutCount.count

                const pendingRes = db.prepare(
                    "SELECT COUNT(*) as count FROM inventory_allocations WHERE status = 'reserved'"
                ).get() as { count: number }
                pendingReservations = pendingRes.count
            } catch { /* table may not exist */ }

            // Finance stats
            let receipts24h = 0, revenueUsd = 0
            try {
                const receiptCount = db.prepare(
                    "SELECT COUNT(*) as count FROM issued_credentials WHERE credential_type = 'PaymentReceiptVC' AND created_at >= ?"
                ).get(yesterday) as { count: number }
                receipts24h = receiptCount.count

                // Revenue would need to be parsed from VC claims - simplified here
                revenueUsd = receipts24h * 50 // Placeholder
            } catch { /* table may not exist */ }

            // Tenant stats
            let totalTenants = 0, activeTenants = 0
            try {
                const tenantTotal = db.prepare('SELECT COUNT(*) as count FROM tenants').get() as { count: number }
                totalTenants = tenantTotal.count

                const tenantActive = db.prepare(
                    "SELECT COUNT(*) as count FROM tenants WHERE status = 'active'"
                ).get() as { count: number }
                activeTenants = tenantActive.count
            } catch { /* table may not exist */ }

            return {
                credentials: {
                    totalIssued,
                    last24h: last24hCreds,
                    byType: credsByType,
                },
                wallets: {
                    totalRegistered: totalWallets,
                    last24h: last24hWallets,
                },
                inventory: {
                    totalEvents,
                    stockouts,
                    reservationsPending: pendingReservations,
                },
                finance: {
                    receiptsLast24h: receipts24h,
                    revenueUsd,
                },
                tenants: {
                    total: totalTenants,
                    active: activeTenants,
                },
            }
        } catch (err: any) {
            logger.error({ err }, 'Failed to get business metrics')
            return {
                credentials: { totalIssued: 0, last24h: 0, byType: {} },
                wallets: { totalRegistered: 0, last24h: 0 },
                inventory: { totalEvents: 0, stockouts: 0, reservationsPending: 0 },
                finance: { receiptsLast24h: 0, revenueUsd: 0 },
                tenants: { total: 0, active: 0 },
            }
        }
    }

    /**
     * Perform health checks
     */
    async getHealthStatus(): Promise<HealthStatus> {
        const checks = {
            database: false,
            agent: false,
            memory: false,
        }
        const details: Record<string, any> = {}

        // Database check
        try {
            const db = DatabaseManager.getDatabase()
            db.prepare('SELECT 1').get()
            checks.database = true
        } catch (err: any) {
            details.databaseError = err.message
        }

        // Memory check (alert if heap > 90%)
        const memory = process.memoryUsage()
        const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100
        checks.memory = heapUsagePercent < 90
        details.heapUsagePercent = Math.round(heapUsagePercent)

        // Agent check (simplified - just check if running)
        checks.agent = true // Would need agent reference to verify

        // Determine overall status
        const allHealthy = Object.values(checks).every(c => c)
        const anyUnhealthy = !checks.database
        const status = anyUnhealthy ? 'unhealthy' : (allHealthy ? 'healthy' : 'degraded')

        return { status, checks, details }
    }

    /**
     * Get all metrics in Prometheus format
     */
    getPrometheusMetrics(): string {
        const system = this.getSystemMetrics()
        const db = this.getDatabaseMetrics()
        const business = this.getBusinessMetrics()

        const lines: string[] = [
            '# HELP credentis_uptime_seconds Server uptime in seconds',
            '# TYPE credentis_uptime_seconds gauge',
            `credentis_uptime_seconds ${system.uptime}`,
            '',
            '# HELP credentis_memory_heap_bytes Heap memory usage',
            '# TYPE credentis_memory_heap_bytes gauge',
            `credentis_memory_heap_bytes{type="used"} ${system.memory.heapUsed}`,
            `credentis_memory_heap_bytes{type="total"} ${system.memory.heapTotal}`,
            '',
            '# HELP credentis_database_size_bytes Database file size',
            '# TYPE credentis_database_size_bytes gauge',
            `credentis_database_size_bytes ${db.totalSize}`,
            '',
            '# HELP credentis_credentials_total Total credentials issued',
            '# TYPE credentis_credentials_total counter',
            `credentis_credentials_total ${business.credentials.totalIssued}`,
            '',
            '# HELP credentis_wallets_total Total registered wallets',
            '# TYPE credentis_wallets_total counter',
            `credentis_wallets_total ${business.wallets.totalRegistered}`,
            '',
            '# HELP credentis_inventory_events_total Total inventory events',
            '# TYPE credentis_inventory_events_total counter',
            `credentis_inventory_events_total ${business.inventory.totalEvents}`,
            '',
            '# HELP credentis_inventory_stockouts Current stockouts',
            '# TYPE credentis_inventory_stockouts gauge',
            `credentis_inventory_stockouts ${business.inventory.stockouts}`,
            '',
            '# HELP credentis_tenants_total Total tenants',
            '# TYPE credentis_tenants_total gauge',
            `credentis_tenants_total{status="active"} ${business.tenants.active}`,
            `credentis_tenants_total{status="all"} ${business.tenants.total}`,
        ]

        // Add per-credential-type metrics
        for (const [type, count] of Object.entries(business.credentials.byType)) {
            lines.push(`credentis_credentials_total{type="${type}"} ${count}`)
        }

        return lines.join('\n')
    }
}

export const metricsService = new MetricsService()
export default metricsService

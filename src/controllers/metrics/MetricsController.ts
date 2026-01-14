/**
 * Metrics & Health Controller
 * Phase 9C: Production Hardening - Observability
 * 
 * Exposes health checks and metrics for monitoring systems.
 */
import { Controller, Get, Route, Tags, Response, Request } from 'tsoa'
import { metricsService } from '../../services/MetricsService'
import type { Request as ExRequest } from 'express'

interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
        database: boolean
        agent: boolean
        memory: boolean
    }
    details: Record<string, any>
    timestamp: string
}

interface MetricsResponse {
    system: {
        uptime: number
        memory: {
            heapUsed: number
            heapTotal: number
            rss: number
        }
    }
    database: {
        totalSize: number
        tableStats: Array<{ name: string; rowCount: number }>
    }
    business: {
        credentials: {
            totalIssued: number
            last24h: number
        }
        wallets: {
            totalRegistered: number
        }
        inventory: {
            totalEvents: number
            stockouts: number
        }
        tenants: {
            total: number
            active: number
        }
    }
}

@Route('')
@Tags('Health & Metrics')
export class MetricsController extends Controller {
    /**
     * Health check endpoint for load balancers and orchestrators
     * Returns 200 if healthy, 503 if unhealthy
     */
    @Get('/health')
    @Response<HealthResponse>(200, 'System is healthy')
    @Response<HealthResponse>(503, 'System is unhealthy')
    public async healthCheck(): Promise<HealthResponse> {
        const health = await metricsService.getHealthStatus()
        
        if (health.status === 'unhealthy') {
            this.setStatus(503)
        }

        return {
            ...health,
            timestamp: new Date().toISOString(),
        }
    }

    /**
     * Liveness probe for Kubernetes
     * Simple check that the process is running
     */
    @Get('/health/live')
    public async livenessProbe(): Promise<{ status: string }> {
        return { status: 'ok' }
    }

    /**
     * Readiness probe for Kubernetes
     * Checks if the service can accept traffic
     */
    @Get('/health/ready')
    @Response<{ status: string }>(200, 'Ready')
    @Response<{ status: string; reason: string }>(503, 'Not ready')
    public async readinessProbe(): Promise<{ status: string; reason?: string }> {
        const health = await metricsService.getHealthStatus()
        
        if (!health.checks.database) {
            this.setStatus(503)
            return { status: 'not_ready', reason: 'database_unavailable' }
        }

        return { status: 'ready' }
    }

    /**
     * JSON metrics endpoint for custom dashboards
     */
    @Get('/metrics/json')
    public async getJsonMetrics(): Promise<MetricsResponse> {
        const system = metricsService.getSystemMetrics()
        const database = metricsService.getDatabaseMetrics()
        const business = metricsService.getBusinessMetrics()

        return {
            system: {
                uptime: system.uptime,
                memory: {
                    heapUsed: system.memory.heapUsed,
                    heapTotal: system.memory.heapTotal,
                    rss: system.memory.rss,
                },
            },
            database: {
                totalSize: database.totalSize,
                tableStats: database.tableStats,
            },
            business: {
                credentials: {
                    totalIssued: business.credentials.totalIssued,
                    last24h: business.credentials.last24h,
                },
                wallets: {
                    totalRegistered: business.wallets.totalRegistered,
                },
                inventory: {
                    totalEvents: business.inventory.totalEvents,
                    stockouts: business.inventory.stockouts,
                },
                tenants: {
                    total: business.tenants.total,
                    active: business.tenants.active,
                },
            },
        }
    }

    /**
     * Prometheus-compatible metrics endpoint
     * Returns metrics in Prometheus text format
     */
    @Get('/metrics')
    public async getPrometheusMetrics(@Request() request: ExRequest): Promise<string> {
        // Set content type for Prometheus
        request.res?.setHeader('Content-Type', 'text/plain; version=0.0.4')
        return metricsService.getPrometheusMetrics()
    }
}

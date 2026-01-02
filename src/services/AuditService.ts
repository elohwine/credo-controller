import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { AuditLog } from '../types/trust'

const logger = rootLogger.child({ module: 'AuditService' })

export interface AuditLogEntry {
    tenantId: string
    actorDid?: string
    actionType: string
    resourceId?: string
    details?: object
    ipAddress?: string
    userAgent?: string
}

export class AuditService {

    /**
     * Log a sensitive action for compliance and security auditing.
     * This method is "fire and forget" to avoid blocking main flows,
     * but critical errors are logged to system logs.
     */
    async logAction(entry: AuditLogEntry): Promise<void> {
        // Run asynchronously to not block the main process
        setImmediate(async () => {
            try {
                const db = DatabaseManager.getDatabase()
                const id = randomUUID()

                db.prepare(`
                    INSERT INTO audit_logs (
                        id, tenant_id, actor_did, action_type, resource_id, 
                        details, ip_address, user_agent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    id,
                    entry.tenantId,
                    entry.actorDid,
                    entry.actionType,
                    entry.resourceId,
                    JSON.stringify(entry.details || {}),
                    entry.ipAddress,
                    entry.userAgent
                )

                logger.debug({ action: entry.actionType, id }, 'Audit log recorded')
            } catch (error: any) {
                // If writing to audit log fails, we MUST log to system logger 
                // heavily as this is a compliance failure.
                logger.error({
                    error: error.message,
                    entry,
                    alert: 'AUDIT_WRITE_FAILURE'
                }, 'CRITICAL: Failed to write audit log')
            }
        })
    }

    /**
     * Retrieve audit logs for a resource or tenant.
     * Pagination would be added here in a real scenario.
     */
    async getLogs(tenantId: string, resourceId?: string, limit = 50): Promise<AuditLog[]> {
        const db = DatabaseManager.getDatabase()

        let query = 'SELECT * FROM audit_logs WHERE tenant_id = ?'
        const params: any[] = [tenantId]

        if (resourceId) {
            query += ' AND resource_id = ?'
            params.push(resourceId)
        }

        query += ' ORDER BY created_at DESC LIMIT ?'
        params.push(limit)

        const rows = db.prepare(query).all(...params)
        return rows.map((r: any) => ({
            id: r.id,
            tenantId: r.tenant_id,
            actorDid: r.actor_did,
            actionType: r.action_type,
            resourceId: r.resource_id,
            details: JSON.parse(r.details || '{}'),
            ipAddress: r.ip_address,
            userAgent: r.user_agent,
            createdAt: r.created_at
        }))
    }
}

export const auditService = new AuditService()

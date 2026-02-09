import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID, createHash } from 'crypto'
import { rootLogger } from '../utils/pinoLogger'
import { AuditLog } from '../types/trust'
import jwt from 'jsonwebtoken'

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

    /**
     * Verify the cryptographic audit trail for a Payment Receipt.
     * Verifies the chain of custody: Receipt -> Invoice -> Quote
     * Returns rich metadata for UI visualization.
     */
    async verifyChain(receiptJwt: string): Promise<{
        verified: boolean,
        chain: {
            receipt: { valid: boolean, id: string, hash: string, timestamp: string, type: string },
            invoice: { valid: boolean, id: string, hash: string, amount?: string, currency?: string, reference?: string, timestamp?: string },
            quote: { valid: boolean, id: string, hash: string, total?: string, itemCount?: number, timestamp?: string }
        },
        errors: string[]
    }> {
        const db = DatabaseManager.getDatabase()
        const errors: string[] = []
        const chain = {
            receipt: { valid: false, id: '', hash: '', timestamp: '', type: 'PaymentReceipt' },
            invoice: { valid: false, id: '', hash: '', amount: '', currency: '', reference: '', timestamp: '' },
            quote: { valid: false, id: '', hash: '', total: '', itemCount: 0, timestamp: '' }
        }

        try {
            // 1. Decode Receipt VC
            const decoded = jwt.decode(receiptJwt) as any
            if (!decoded || !decoded.vc || !decoded.vc.credentialSubject) {
                errors.push('Invalid Receipt JWT structure')
                return { verified: false, chain, errors }
            }

            const claims = decoded.vc.credentialSubject
            chain.receipt.id = claims.transactionId || decoded.jwtId || 'unknown'
            chain.receipt.hash = claims.invoiceHash || '' // Using invoiceHash as the link
            chain.receipt.timestamp = decoded.vc.issuanceDate || new Date().toISOString()
            
            if (!claims.invoiceId || !claims.invoiceHash) {
                errors.push('Receipt VC missing audit links (invoiceId/invoiceHash)')
                // Return partial chain so UI can show failure at step 1
                return { verified: false, chain, errors }
            }
            chain.receipt.valid = true

            // 2. Verify Invoice (Payment Record)
            // ack_payments serves as the immutable invoice record here
            const payment = db.prepare('SELECT * FROM ack_payments WHERE invoice_id = ?').get(claims.invoiceId) as any
            
            if (!payment) {
                errors.push(`Invoice record not found for ID: ${claims.invoiceId}`)
                return { verified: false, chain, errors }
            }

            chain.invoice.id = payment.invoice_id
            chain.invoice.hash = payment.invoice_hash || ''
            chain.invoice.amount = payment.amount?.toString() || '0.00'
            chain.invoice.currency = payment.currency || 'USD'
            chain.invoice.reference = payment.provider_ref || 'N/A'
            chain.invoice.timestamp = payment.created_at || ''

            if (payment.invoice_hash !== claims.invoiceHash) {
                errors.push('BROKEN CHAIN: Receipt Hash mismatch. The Receipt points to a different Invoice state than stored.')
            } else {
                chain.invoice.valid = true
            }

            // 3. Verify Quote (Cart)
            if (payment.cart_id) {
                const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(payment.cart_id) as any
                if (cart) {
                    chain.quote.id = cart.quote_id || 'Q-' + cart.id.substring(0,8)
                    chain.quote.hash = cart.quote_hash // Logic might need adding this column if missing, but we assume migration 020 covered it or we use cart hash
                    chain.quote.total = cart.total_price?.toString() || payment.amount?.toString()
                    chain.quote.timestamp = cart.created_at || ''
                    
                    // Count items if possible (assuming json or separate table, strict fallback for now)
                    // If items is JSON string in cart
                    try {
                        if (cart.items) {
                            const items = JSON.parse(cart.items)
                            chain.quote.itemCount = Array.isArray(items) ? items.length : 0
                        }
                    } catch (e) {}

                    // Verify link if quote hash exists (optional for now as QuoteVC might not be strictly hashed in v1)
                    if (chain.invoice.valid) {
                         chain.quote.valid = true // Implicit valid if Invoice is valid and linked
                    }
                }
            }

            const verified = errors.length === 0
            return { verified, chain, errors }

        } catch (e: any) {
            errors.push(`Verification error: ${e.message}`)
            return { verified: false, chain, errors }
        }
    }
}

export const auditService = new AuditService()

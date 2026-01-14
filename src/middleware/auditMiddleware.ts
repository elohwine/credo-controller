/**
 * Audit Logging Middleware
 * Automatically captures sensitive API operations for compliance auditing.
 * Phase 9A: Production Hardening - Observability
 */
import type { Request, Response, NextFunction } from 'express'
import { auditService } from '../services/AuditService'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'AuditMiddleware' })

// Routes that should be audited (mutating or sensitive operations)
const AUDIT_ROUTES: Array<{ method: string; pattern: RegExp; actionType: string }> = [
    // Credential operations
    { method: 'POST', pattern: /^\/api\/oidc\/.*offer/, actionType: 'credential.offer_created' },
    { method: 'POST', pattern: /^\/api\/wallet\/credentials/, actionType: 'credential.stored' },
    { method: 'POST', pattern: /^\/api\/credentials\/revoke/, actionType: 'credential.revoked' },
    { method: 'POST', pattern: /^\/oidc\/issuer\/.*credential/, actionType: 'credential.issued' },
    
    // Finance operations
    { method: 'POST', pattern: /^\/api\/finance\/receipt/, actionType: 'finance.receipt_issued' },
    { method: 'POST', pattern: /^\/api\/finance\/invoice/, actionType: 'finance.invoice_issued' },
    { method: 'POST', pattern: /^\/api\/payments/, actionType: 'finance.payment_initiated' },
    
    // Inventory operations
    { method: 'POST', pattern: /^\/api\/inventory\/receive/, actionType: 'inventory.goods_received' },
    { method: 'POST', pattern: /^\/api\/inventory\/reserve/, actionType: 'inventory.stock_reserved' },
    { method: 'POST', pattern: /^\/api\/inventory\/fulfill/, actionType: 'inventory.sale_fulfilled' },
    { method: 'POST', pattern: /^\/api\/inventory\/transfer/, actionType: 'inventory.stock_transferred' },
    { method: 'POST', pattern: /^\/api\/inventory\/adjust/, actionType: 'inventory.stock_adjusted' },
    
    // HR operations
    { method: 'POST', pattern: /^\/api\/hr\/employees/, actionType: 'hr.employee_created' },
    { method: 'POST', pattern: /^\/api\/hr\/payroll\/run/, actionType: 'hr.payroll_run' },
    { method: 'POST', pattern: /^\/api\/operations\/leave/, actionType: 'hr.leave_request' },
    { method: 'POST', pattern: /^\/api\/operations\/expense/, actionType: 'hr.expense_claim' },
    
    // Trust operations
    { method: 'POST', pattern: /^\/api\/trust\/escalation/, actionType: 'trust.escalation_created' },
    { method: 'POST', pattern: /^\/api\/trust\/verify/, actionType: 'trust.verification_performed' },
    
    // Tenant operations
    { method: 'POST', pattern: /^\/multi-tenancy\/create-tenant/, actionType: 'tenant.created' },
    { method: 'DELETE', pattern: /^\/multi-tenancy\/tenant/, actionType: 'tenant.deleted' },
    
    // Authentication
    { method: 'POST', pattern: /^\/api\/wallet\/auth\/login/, actionType: 'auth.login' },
    { method: 'POST', pattern: /^\/api\/wallet\/auth\/register/, actionType: 'auth.register' },
    { method: 'POST', pattern: /^\/api\/wallet\/auth\/logout/, actionType: 'auth.logout' },
    
    // Cart operations
    { method: 'POST', pattern: /^\/api\/whatsapp\/cart/, actionType: 'commerce.cart_created' },
    { method: 'POST', pattern: /^\/api\/catalog/, actionType: 'commerce.item_created' },
]

// Routes to NEVER audit (high-volume read operations)
const SKIP_PATTERNS = [
    /^\/docs/,
    /^\/health/,
    /^\/metrics/,
    /^\/swagger/,
    /\.well-known/,
    /^\/api\/wallet\/accounts\/wallets$/, // list wallets (read-only)
]

function shouldAudit(method: string, path: string): { audit: boolean; actionType?: string } {
    // Skip read-heavy or public endpoints
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
        return { audit: false }
    }

    // Skip utility endpoints
    for (const pattern of SKIP_PATTERNS) {
        if (pattern.test(path)) {
            return { audit: false }
        }
    }

    // Check explicit audit routes
    for (const route of AUDIT_ROUTES) {
        if (route.method === method && route.pattern.test(path)) {
            return { audit: true, actionType: route.actionType }
        }
    }

    // Default: audit all other POST/PUT/DELETE/PATCH
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        return { audit: true, actionType: `api.${method.toLowerCase()}` }
    }

    return { audit: false }
}

function extractTenantId(req: Request): string {
    // Try multiple sources for tenant ID
    return (
        (req as any).tenantId ||
        req.headers['x-tenant-id'] as string ||
        (req as any).user?.tenantId ||
        'default'
    )
}

function extractActorDid(req: Request): string | undefined {
    // Extract DID from JWT claims or request context
    const user = (req as any).user
    if (user?.did) return user.did
    if (user?.sub) return user.sub
    return undefined
}

function extractResourceId(req: Request, responseBody: any): string | undefined {
    // Try to extract the affected resource ID
    // From URL params
    const pathParts = req.path.split('/')
    const lastPart = pathParts[pathParts.length - 1]
    if (lastPart && !['create', 'run', 'issue', 'accept', 'reserve', 'fulfill'].includes(lastPart)) {
        return lastPart
    }

    // From response body
    if (responseBody) {
        try {
            const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody
            return parsed.id || parsed.credentialId || parsed.cartId || parsed.invoiceId || parsed.receiptId
        } catch {
            // ignore
        }
    }

    // From request body
    if (req.body) {
        return req.body.id || req.body.cartId || req.body.credentialId
    }

    return undefined
}

function sanitizeDetails(req: Request, res: Response): object {
    // Capture relevant details without sensitive data
    const details: Record<string, any> = {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        correlationId: (req as any).correlationId,
    }

    // Add non-sensitive body fields
    if (req.body) {
        const { password, secret, token, authorization, ...safeBody } = req.body
        // Only include small payloads
        const bodyStr = JSON.stringify(safeBody)
        if (bodyStr.length < 2000) {
            details.requestSummary = safeBody
        }
    }

    // Add query params
    if (Object.keys(req.query).length > 0) {
        details.query = req.query
    }

    return details
}

/**
 * Express middleware that automatically audits sensitive operations.
 * Captures: actor, action, resource, context, IP, user-agent
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
    const { audit, actionType } = shouldAudit(req.method, req.path)

    if (!audit) {
        return next()
    }

    // Capture original send to extract response body
    const originalSend = res.send.bind(res)
    let responseBody: any

    res.send = function (body?: any): Response {
        responseBody = body
        return originalSend(body)
    }

    res.on('finish', () => {
        // Only audit successful or meaningful responses
        if (res.statusCode >= 200 && res.statusCode < 500) {
            const tenantId = extractTenantId(req)
            const actorDid = extractActorDid(req)
            const resourceId = extractResourceId(req, responseBody)
            const details = sanitizeDetails(req, res)

            auditService.logAction({
                tenantId,
                actorDid,
                actionType: actionType || `api.${req.method.toLowerCase()}`,
                resourceId,
                details,
                ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
                userAgent: req.headers['user-agent'],
            }).catch(err => {
                logger.error({ err, path: req.path }, 'Failed to log audit event')
            })
        }
    })

    next()
}

export default auditMiddleware

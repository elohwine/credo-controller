import { Body, Controller, Get, Path, Post, Route, Tags, Query } from 'tsoa'
import { ShortlinkService } from '../../services/ShortlinkService'

interface CreateShortlinkRequest {
    type: 'credential' | 'receipt' | 'verification'
    targetId: string
    metadata?: Record<string, any>
    ttlHours?: number
}

interface ShortlinkResponse {
    code: string
    url: string
    expiresAt: string
}

interface ResolveResponse {
    valid: boolean
    type?: string
    targetId?: string
    metadata?: Record<string, any> | null
    expiresAt?: string
    verificationUrl?: string
}

/**
 * Shortlink Controller - Generate and resolve short verification links
 * 
 * Used for driver verification QR codes during delivery handover.
 */
@Route('api/shortlinks')
@Tags('Shortlinks')
export class ShortlinkController extends Controller {

    /**
     * Create a new shortlink for verification
     */
    @Post('')
    public async createShortlink(
        @Body() body: CreateShortlinkRequest
    ): Promise<ShortlinkResponse> {
        const result = ShortlinkService.create(
            body.type,
            body.targetId,
            body.metadata,
            body.ttlHours
        )

        this.setStatus(201)
        return result
    }

    /**
     * Resolve a shortlink code
     */
    @Get('{code}')
    public async resolveShortlink(
        @Path() code: string
    ): Promise<ResolveResponse> {
        const result = ShortlinkService.resolve(code)

        if (!result) {
            this.setStatus(404)
            return { valid: false }
        }

        // Build verification page URL
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
        const verificationUrl = `${baseUrl}/verify/receipt/${result.targetId}`

        return {
            valid: true,
            type: result.type,
            targetId: result.targetId,
            metadata: result.metadata,
            expiresAt: result.expiresAt,
            verificationUrl,
        }
    }

    /**
     * Create a receipt verification shortlink
     */
    @Post('receipt')
    public async createReceiptShortlink(
        @Body() body: {
            transactionId: string
            amount?: string
            currency?: string
            merchant?: string
        }
    ): Promise<ShortlinkResponse> {
        const { transactionId, amount, currency, merchant } = body

        const result = ShortlinkService.createReceiptLink(transactionId, {
            amount,
            currency,
            merchant,
        })

        this.setStatus(201)
        return result
    }

    /**
     * Cleanup expired shortlinks (admin only)
     */
    @Post('cleanup')
    public async cleanupExpired(): Promise<{ deleted: number }> {
        const deleted = ShortlinkService.cleanup()
        return { deleted }
    }
}

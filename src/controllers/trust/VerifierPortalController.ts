
import { Body, Controller, Post, Get, Route, Tags, Request, Query } from 'tsoa'
import { rootLogger } from '../../utils/pinoLogger'
import { verifierPortalService } from '../../services/VerifierPortalService'
import { Request as ExRequest } from 'express'

const logger = rootLogger.child({ module: 'VerifierPortalController' })

@Route('api/verifier')
@Tags('Trust')
export class VerifierPortalController extends Controller {

    /**
     * Verify a credential against policies and revocation status.
     * Records the attempt in the audit log.
     */
    @Post('/verify')
    public async verify(
        @Body() payload: any
    ): Promise<any> {
        logger.info({ vcType: payload?.vc?.type }, 'Received verification request')
        const tenantId = payload.tenantId || 'default'

        // Default policy if none provided
        const policy = payload.policy || { checkRevocation: false }

        try {
            return await verifierPortalService.verifyCredential(
                payload.vc,
                payload.statusListEncoded,
                policy,
                tenantId
            )
        } catch (error: any) {
            logger.error({ error: error.message }, 'Verification processing failed')
            this.setStatus(500)
            throw new Error(error.message)
        }
    }

    /**
     * Get the history of verifications performed by this tenant.
     */
    @Get('/history')
    public async getHistory(
        @Query() limit = 50,
        @Request() request?: ExRequest
    ): Promise<any[]> {
        // TODO: Extract tenantId from auth header in real impl
        const tenantId = 'default'
        return await verifierPortalService.getHistory(tenantId, limit)
    }
}

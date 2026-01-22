/**
 * IdenEx Credentis - Revocation Controller
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Minimal revocation list APIs for status-list updates.
 * Production deployments should persist list state per tenant.
 * 
 * @module controllers/trust/RevocationController
 * @copyright 2024-2026 IdenEx Credentis
 */

import { Body, Controller, Post, Route, Tags, Request } from 'tsoa'
import { rootLogger } from '../../utils/pinoLogger'
import { revocationService } from '../../services/RevocationService'
import { Request as ExRequest } from 'express'

const logger = rootLogger.child({ module: 'RevocationController' })

interface CreateStatusListPayload {
    size?: number
    tenantId?: string
}

interface UpdateStatusPayload {
    listData: string // Current encoded list (state passing for MVP)
    index: number
    revoked: boolean
    tenantId?: string
}

@Route('api/revocation')
@Tags('Trust')
export class RevocationController extends Controller {

    /**
     * Create a new Status List credential body
     */
    @Post('/list')
    public async createList(
        @Body() payload: CreateStatusListPayload
    ): Promise<{ encodedList: string, size: number }> {
        logger.info('Creating revocation list')
        const tenantId = payload.tenantId || 'default'
        try {
            return await revocationService.createStatusList(tenantId, payload.size)
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to create list')
            this.setStatus(500)
            throw new Error(error.message)
        }
    }

    /**
     * Update a status bit in a list
     */
    @Post('/update')
    public async updateStatus(
        @Body() payload: UpdateStatusPayload
    ): Promise<{ encodedList: string }> {
        logger.info({ index: payload.index, revoked: payload.revoked }, 'Updating revocation status')
        const tenantId = payload.tenantId || 'default'
        try {
            const newList = await revocationService.updateStatus(tenantId, payload.listData, payload.index, payload.revoked)
            return { encodedList: newList }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to update status')
            this.setStatus(500)
            throw new Error(error.message)
        }
    }
}

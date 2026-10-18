import type { ConnectedRecord, SendConnectedRecordRequest } from '../../services/connected/ConnectedRecordService'
import type { RecordField } from '../../services/connected/OrgRecordTypeService'
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Header, Path, Post, Request, Route, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { authenticateConnectedSystem, connectedRecordService } from '../../services/connected/ConnectedRecordService'

interface ConnectedRecordType {
  credentialType: string
  label: string
  description: string | null
  version: number
  fields: RecordField[]
}

/**
 * Records an organisation's own software sends to people's Credentis wallets. Authenticate
 * with HTTP Basic using a connected-system client id and secret registered to send records.
 */
@Route('api/partner/v1/records')
@Tags('Connected System Records')
export class ConnectedRecordsController extends Controller {
  /** Record types this organisation has defined, with their fields. */
  @Get('/types')
  public async listRecordTypes(@Request() request: ExRequest): Promise<{ types: ConnectedRecordType[] }> {
    return { types: connectedRecordService.recordTypes(this.requireClient(request)) }
  }

  /**
   * Send a record to a person's wallet. Repeat the same Idempotency-Key to retry safely: the
   * same record is returned. Reusing a key for a different record is refused (409).
   */
  @Post('/')
  public async sendRecord(
    @Request() request: ExRequest,
    @Header('Idempotency-Key') idempotencyKey: string,
    @Body() body: SendConnectedRecordRequest,
  ): Promise<ConnectedRecord> {
    const { record, replayed } = await connectedRecordService.submit(this.requireClient(request), idempotencyKey, body)
    this.setStatus(replayed ? 200 : 201)
    return record
  }

  /** Current state: processing, failed, pending, accepted, expired, withdrawn or resolved. */
  @Get('/{recordId}')
  public async getRecord(@Request() request: ExRequest, @Path() recordId: string): Promise<ConnectedRecord> {
    return connectedRecordService.get(this.requireClient(request), recordId)
  }

  private requireClient(request: ExRequest) {
    const client = authenticateConnectedSystem(request.headers.authorization)
    if (!client) {
      this.setHeader('WWW-Authenticate', 'Basic realm="credentis-connected-system"')
      throw new StatusException('Connected system authentication failed', 401)
    }
    return client
  }
}

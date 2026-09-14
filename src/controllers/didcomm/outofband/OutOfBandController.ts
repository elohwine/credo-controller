/* eslint-disable import/no-extraneous-dependencies */
import type { OutOfBandInvitationProps, OutOfBandRecordWithInvitationProps } from '../../examples'
import type { AgentMessageType, RecipientKeyOption, CreateInvitationOptions, Routing } from '../../types'
import type { PeerDidNumAlgo2CreateOptions } from '@credo-ts/core'
import type { CreateLegacyInvitationConfig } from '@credo-ts/didcomm'

import { DidKey, JsonTransformer, createPeerDidDocumentFromServices, PeerDidNumAlgo } from '@credo-ts/core'
import { DidCommMessage, DidCommOutOfBandInvitation } from '@credo-ts/didcomm'
import { Request as Req } from 'express'
import { Body, Controller, Delete, Get, Path, Post, Query, Route, Tags, Security, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { SCOPES } from '../../../enums'
import ErrorHandlingService from '../../../errorHandlingService'
import { InternalServerError, NotFoundError } from '../../../errors'
import { ConnectionRecordExample, outOfBandInvitationExample, outOfBandRecordExample, RecordId } from '../../examples'
import { AcceptInvitationConfig, ReceiveInvitationByUrlProps, ReceiveInvitationProps } from '../../types'

@Tags('DIDComm - Out Of Band')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@Route('/didcomm/oob')
@injectable()
export class OutOfBandController extends Controller {
  /**
   * Retrieve all out of band records
   * @param invitationId invitation identifier
   * @returns OutOfBandRecord[]
   */
  @Get()
  public async getAllOutOfBandRecords(
    @Request() request: Req,
    @Query('invitationId') invitationId?: RecordId,
  ): Promise<any> {
    try {
      const query = invitationId
        ? {
            invitationId: invitationId,
          }
        : {}
      const outOfBandRecords = await request.agent.didcomm.oob.findAllByQuery(query)

      return outOfBandRecords.map((c) => c.toJSON())
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Retrieve an out of band record by id
   * @param recordId record identifier
   * @returns OutOfBandRecord
   */
  @Get('/:outOfBandId')
  public async getOutOfBandRecordById(
    @Request() request: Req,
    @Path('outOfBandId') outOfBandId: RecordId,
  ): Promise<any> {
    try {
      const outOfBandRecord = await request.agent.didcomm.oob.findById(outOfBandId)

      if (!outOfBandRecord) throw new NotFoundError(`Out of band record with id "${outOfBandId}" not found.`)

      return outOfBandRecord.toJSON()
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates an outbound out-of-band record containing out-of-band invitation message defined in
   * Aries RFC 0434: Out-of-Band Protocol 1.1.
   * @param config configuration of how out-of-band invitation should be created
   * @returns Out of band record
   */
  @Post('/create-invitation')
  public async createInvitation(
    @Request() request: Req,
    @Body() config: any, // keep the schema simple for tsoa generation
  ): Promise<any> {
    try {
      let invitationDid: string | undefined
      if (config?.invitationDid) {
        invitationDid = config?.invitationDid
      } else {
        const didRouting = await request.agent.didcomm.mediationRecipient.getRouting({})
        const { didDocument, keys } = createPeerDidDocumentFromServices(
          [
            {
              id: 'didcomm',
              recipientKeys: [didRouting.recipientKey],
              routingKeys: didRouting.routingKeys,
              serviceEndpoint: didRouting.endpoints[0],
            },
          ],
          true,
        )
        const did = await request.agent.dids.create<PeerDidNumAlgo2CreateOptions>({
          method: 'peer',
          options: {
            numAlgo: PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc,
            keys,
          },
          didDocument,
        })

        invitationDid = did.didState.did

        if (!invitationDid) {
          throw new InternalServerError('Error in creating invitationDid')
        }
      }

      const outOfBandRecord = await request.agent.didcomm.oob.createInvitation({ ...config, invitationDid })
      return {
        invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({
          domain: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
        }),
        invitation: outOfBandRecord.outOfBandInvitation.toJSON(),
        outOfBandRecord: outOfBandRecord.toJSON(),
        invitationDid: config?.invitationDid ? '' : invitationDid,
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates an outbound out-of-band record in the same way how `createInvitation` method does it,
   * but it also converts out-of-band invitation message to an "legacy" invitation message defined
   * in RFC 0160: Connection Protocol and returns it together with out-of-band record.
   *
   * @param config configuration of how a invitation should be created
   * @returns out-of-band record and invitation
   */
  @Post('/create-legacy-invitation')
  public async createLegacyInvitation(@Request() request: Req, @Body() config?: any): Promise<any> {
    try {
      let routing: Routing
      if (config?.recipientKey) {
        routing = {
          endpoints: ((request.agent as any).config?.endpoints ?? [
            process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
          ]) as string[],
          routingKeys: [],
          recipientKey: config.recipientKey as any,
        } as any
      } else {
        routing = await request.agent.didcomm.mediationRecipient.getRouting({})
      }

      const { outOfBandRecord, invitation } = await request.agent.didcomm.oob.createLegacyInvitation({
        ...config,
        routing,
      })

      return {
        invitationUrl: invitation.toUrl({
          domain: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
          useDidSovPrefixWhereAllowed: !!((request.agent as any).config?.useDidSovPrefixWhereAllowed ?? false),
        }),
        invitation: invitation.toJSON({
          useDidSovPrefixWhereAllowed: !!((request.agent as any).config?.useDidSovPrefixWhereAllowed ?? false),
        }),
        outOfBandRecord: outOfBandRecord.toJSON(),
        ...(config?.recipientKey
          ? {}
          : { recipientKey: (routing as any).recipientKey?.publicKeyBase58 || (routing as any).recipientKey }),
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates a new connectionless legacy invitation.
   *
   * @param config configuration of how a connection invitation should be created
   * @returns a message and a invitationUrl
   */
  @Post('/create-legacy-connectionless-invitation')
  public async createLegacyConnectionlessInvitation(
    @Request() request: Req,
    @Body()
    config: any,
  ): Promise<any> {
    try {
      const agentMessage = JsonTransformer.fromJSON(config.message, DidCommMessage)

      return await request.agent.didcomm.oob.createLegacyConnectionlessInvitation({
        ...config,
        message: agentMessage,
      })
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates inbound out-of-band record and assigns out-of-band invitation message to it if the
   * message is valid.
   *
   * @param invitation either OutOfBandInvitation or ConnectionInvitationMessage
   * @param config config for handling of invitation
   * @returns out-of-band record and connection record if one has been created.
   */
  @Post('/receive-invitation')
  public async receiveInvitation(@Request() request: Req, @Body() invitationRequest: any): Promise<any> {
    const { invitation, ...config } = invitationRequest

    try {
      const invite = new DidCommOutOfBandInvitation({
        ...invitation,
        handshakeProtocols: invitation.handshake_protocols,
      })
      const { outOfBandRecord, connectionRecord } = await request.agent.didcomm.oob.receiveInvitation(invite, config)

      return {
        outOfBandRecord: outOfBandRecord.toJSON(),
        connectionRecord: connectionRecord?.toJSON(),
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates inbound out-of-band record and assigns out-of-band invitation message to it if the
   * message is valid.
   *
   * @param invitationUrl invitation url
   * @param config config for handling of invitation
   * @returns out-of-band record and connection record if one has been created.
   */
  @Post('/receive-invitation-url')
  public async receiveInvitationFromUrl(@Request() request: Req, @Body() invitationRequest: any): Promise<any> {
    const { invitationUrl, ...config } = invitationRequest

    try {
      // const linkSecretIds = await request.agent.modules.anoncreds.getLinkSecretIds()
      // if (linkSecretIds.length === 0) {
      //   await request.agent.modules.anoncreds.createLinkSecret()
      // }
      const { outOfBandRecord, connectionRecord } = await request.agent.didcomm.oob.receiveInvitationFromUrl(
        invitationUrl,
        config,
      )
      return {
        outOfBandRecord: outOfBandRecord.toJSON(),
        connectionRecord: connectionRecord?.toJSON(),
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a connection invitation as invitee (by sending a connection request message) for the connection with the specified connection id.
   * This is not needed when auto accepting of connections is enabled.
   */
  @Post('/:outOfBandId/accept-invitation')
  public async acceptInvitation(
    @Request() request: Req,
    @Path('outOfBandId') outOfBandId: RecordId,
    @Body() acceptInvitationConfig: any,
  ): Promise<any> {
    try {
      const { outOfBandRecord, connectionRecord } = await request.agent.didcomm.oob.acceptInvitation(outOfBandId, {
        ...acceptInvitationConfig,
        label: acceptInvitationConfig.label ?? 'Credo Controller',
      })

      return {
        outOfBandRecord: outOfBandRecord.toJSON(),
        connectionRecord: connectionRecord?.toJSON(),
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Deletes an out of band record from the repository.
   *
   * @param outOfBandId Record identifier
   */
  @Delete('/:outOfBandId')
  public async deleteOutOfBandRecord(
    @Request() request: Req,
    @Path('outOfBandId') outOfBandId: RecordId,
  ): Promise<any> {
    try {
      this.setStatus(204)
      await request.agent.didcomm.oob.deleteById(outOfBandId)
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }
}

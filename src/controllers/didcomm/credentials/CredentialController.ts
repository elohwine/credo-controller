import type {
  CredentialExchangeRecordProps,
  CredentialProtocolVersionType,
  PeerDidNumAlgo2CreateOptions,
  Routing,
} from '@credo-ts/core'

import {
  CredentialState,
  W3cCredentialService,
  CredentialRole,
  createPeerDidDocumentFromServices,
  PeerDidNumAlgo,
} from '@credo-ts/core'
import { Request as Req } from 'express'
import { Body, Controller, Get, Path, Post, Route, Tags, Example, Query, Security, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { SCOPES } from '../../../enums'
import ErrorHandlingService from '../../../errorHandlingService'
import { AgentType } from '../../../types'
import { CredentialExchangeRecordExample, RecordId } from '../../examples'
import {
  AcceptCredentialRequestOptions,
  ProposeCredentialOptions,
  AcceptCredentialProposalOptions,
  CredentialOfferOptions,
  CreateOfferOptions,
  AcceptCredential,
  CreateOfferOobOptions,
  ThreadId,
} from '../../types'
import { OutOfBandController } from '../outofband/OutOfBandController'

@Tags('DIDComm - Credentials')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@Route('/didcomm/credentials')
@injectable()
export class CredentialController extends Controller {
  private outOfBandController: OutOfBandController

  public constructor(outOfBandController: OutOfBandController) {
    super()
    this.outOfBandController = outOfBandController
  }

  /**
   * Retrieve all credential exchange records
   *
   * @returns CredentialExchangeRecord[]
   */
  @Example<CredentialExchangeRecordProps[]>([CredentialExchangeRecordExample])
  @Get('/')
  public async getAllCredentials(
    @Request() request: Req,
    @Query('threadId') threadId?: ThreadId,
    @Query('parentThreadId') parentThreadId?: ThreadId,
    @Query('connectionId') connectionId?: RecordId,
    @Query('state') state?: CredentialState,
    @Query('role') role?: CredentialRole,
  ) {
    try {
      // Legacy DIDComm credentials API not available with W3C-only stack.
      return []
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  // TODO: Fix W3cCredentialRecordExample from example
  // @Example<W3cCredentialRecordOptions[]>([W3cCredentialRecordExample])
  @Get('/w3c')
  public async getAllW3c(@Request() request: Req) {
    try {
      const w3cCredentialService = await request.agent.dependencyManager.resolve(W3cCredentialService)
      const w3cCredentialRecords = await w3cCredentialService.getAllCredentialRecords(request.agent.context)
      return w3cCredentialRecords
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  // TODO: Fix W3cCredentialRecordExample from example
  // @Example<W3cCredentialRecordOptions[]>([W3cCredentialRecordExample])
  @Get('/w3c/:id')
  public async getW3cById(@Request() request: Req, @Path('id') id: string) {
    try {
      const w3cCredentialService = await request.agent.dependencyManager.resolve(W3cCredentialService)
      const w3cRecord = await w3cCredentialService.getCredentialRecordById(request.agent.context, id)
      return w3cRecord
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Retrieve credential exchange record by credential record id
   *
   * @param credentialRecordId
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Get('/:credentialRecordId')
  public async getCredentialById(@Request() request: Req, @Path('credentialRecordId') credentialRecordId: RecordId) {
    try {
      return { id: credentialRecordId, state: 'unknown' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Initiate a new credential exchange as holder by sending a propose credential message
   * to the connection with a specified connection id.
   *
   * @param options
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/propose-credential')
  public async proposeCredential(@Request() request: Req, @Body() proposeCredentialOptions: ProposeCredentialOptions) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a credential proposal as issuer by sending an accept proposal message
   * to the connection associated with the credential exchange record.
   *
   * @param credentialRecordId credential identifier
   * @param options
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/accept-proposal')
  public async acceptProposal(
    @Request() request: Req,
    @Body() acceptCredentialProposal: AcceptCredentialProposalOptions,
  ) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Initiate a new credential exchange as issuer by creating a credential offer
   * without specifying a connection id
   *
   * @param options
   * @returns AgentMessage, CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/create-offer')
  public async createOffer(@Request() request: Req, @Body() createOfferOptions: CreateOfferOptions) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  @Post('/create-offer-oob')
  public async createOfferOob(@Request() request: Req, @Body() outOfBandOption: CreateOfferOobOptions) {
    try {
      let invitationDid: string | undefined
      let routing: Routing
      await this.ensureLinkSecretExists(request.agent)

      if (outOfBandOption?.invitationDid) {
        invitationDid = outOfBandOption?.invitationDid
      } else {
        routing = await request.agent.mediationRecipient.getRouting({})
        const didDocument = createPeerDidDocumentFromServices([
          {
            id: 'didcomm',
            recipientKeys: [routing.recipientKey],
            routingKeys: routing.routingKeys,
            serviceEndpoint: routing.endpoints[0],
          },
        ])
        const did = await request.agent.dids.create<PeerDidNumAlgo2CreateOptions>({
          didDocument,
          method: 'peer',
          options: {
            numAlgo: PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc,
          },
        })
        invitationDid = did.didState.did
      }

      const offerOob = await (request.agent as any).credentials?.createOffer?.({
        protocolVersion: outOfBandOption.protocolVersion as CredentialProtocolVersionType<[]>,
        credentialFormats: outOfBandOption.credentialFormats,
        autoAcceptCredential: outOfBandOption.autoAcceptCredential,
        comment: outOfBandOption.comment,
      })

      const credentialMessage = offerOob.message
      const outOfBandRecord = await request.agent.oob.createInvitation({
        label: outOfBandOption.label,
        messages: [credentialMessage],
        autoAcceptConnection: true,
        imageUrl: outOfBandOption?.imageUrl,
        goalCode: outOfBandOption?.goalCode,
        invitationDid,
      })
      return {
        invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({
          domain: request.agent.config.endpoints[0],
        }),
        invitation: outOfBandRecord.outOfBandInvitation.toJSON({
          useDidSovPrefixWhereAllowed: request.agent.config.useDidSovPrefixWhereAllowed,
        }),
        outOfBandRecord: outOfBandRecord.toJSON(),
        outOfBandRecordId: outOfBandRecord.id,
        credentialRequestThId: offerOob.credentialRecord.threadId,
        invitationDid: outOfBandOption?.invitationDid ? '' : invitationDid,
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a credential offer as holder by sending an accept offer message
   * to the connection associated with the credential exchange record.
   *
   * @param credentialRecordId credential identifier
   * @param options
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/accept-offer')
  public async acceptOffer(@Request() request: Req, @Body() acceptCredentialOfferOptions: CredentialOfferOptions) {
    try {
      // Link secret is not applicable in W3C-only build
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a credential request as issuer by sending an accept request message
   * to the connection associated with the credential exchange record.
   *
   * @param credentialRecordId credential identifier
   * @param options
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/accept-request')
  public async acceptRequest(
    @Request() request: Req,
    @Body() acceptCredentialRequestOptions: AcceptCredentialRequestOptions,
  ) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a credential as holder by sending an accept credential message
   * to the connection associated with the credential exchange record.
   *
   * @param options
   * @returns CredentialExchangeRecord
   */
  @Example<CredentialExchangeRecordProps>(CredentialExchangeRecordExample)
  @Post('/accept-credential')
  public async acceptCredential(@Request() request: Req, @Body() acceptCredential: AcceptCredential) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Return credentialRecord
   *
   * @param credentialRecordId
   * @returns credentialRecord
   */
  @Get('/:credentialRecordId/form-data')
  public async credentialFormData(@Request() request: Req, @Path('credentialRecordId') credentialRecordId: string) {
    try {
      this.setStatus(501)
      return { message: 'Not implemented in W3C-only build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  private async ensureLinkSecretExists(agent: AgentType): Promise<void> {
    return
  }
}

import type { PeerDidNumAlgo2CreateOptions } from '@credo-ts/core'
import type { Routing } from '../../types'

import { PeerDidNumAlgo, createPeerDidDocumentFromServices } from '@credo-ts/core'
import type {
  AcceptProofRequestOptions,
  DidCommProofExchangeRecordProps,
  ProofsProtocolVersionType,
} from '@credo-ts/didcomm'
import { Request as Req } from 'express'
import { Body, Controller, Get, Path, Post, Query, Route, Tags, Security, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { SCOPES } from '../../../enums'
import ErrorHandlingService from '../../../errorHandlingService'
import { ProofRecordExample, RecordId } from '../../examples'
import {
  AcceptProofProposal,
  CreateProofRequestOobOptions,
  RequestProofOptions,
  RequestProofProposalOptions,
} from '../../types'

@Tags('DIDComm - Proofs')
@Route('/didcomm/proofs')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@injectable()
export class ProofController extends Controller {
  /**
   * Retrieve all proof records
   *
   * @param threadId
   * @returns ProofRecord[]
   */
  @Get('/')
  public async getAllProofs(@Request() request: Req, @Query('threadId') threadId?: string): Promise<any> {
    try {
      const query = threadId ? { threadId } : {}
      const proofs = await request.agent.didcomm.proofs.findAllByQuery(query)

      return proofs.map((proof) => proof.toJSON())
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Retrieve proof record by proof record id
   *
   * @param proofRecordId
   * @returns ProofRecord
   */
  @Get('/:proofRecordId')
  public async getProofById(@Request() request: Req, @Path('proofRecordId') proofRecordId: RecordId): Promise<any> {
    try {
      const proof = await request.agent.didcomm.proofs.getById(proofRecordId)

      return proof.toJSON()
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Initiate a new presentation exchange as prover by sending a presentation proposal request
   * to the connection with the specified connection id.
   *
   * @param proposal
   * @returns ProofRecord
   */
  @Post('/propose-proof')
  public async proposeProof(@Request() request: Req, @Body() requestProofProposalOptions: RequestProofProposalOptions): Promise<any> {
    try {
      const proof = await request.agent.didcomm.proofs.proposeProof({
        connectionId: requestProofProposalOptions.connectionId,
        protocolVersion: 'v2' as ProofsProtocolVersionType<[]>,
        proofFormats: requestProofProposalOptions.proofFormats,
        comment: requestProofProposalOptions.comment,
        autoAcceptProof: requestProofProposalOptions.autoAcceptProof,
        goalCode: requestProofProposalOptions.goalCode,
        parentThreadId: requestProofProposalOptions.parentThreadId,
      })

      return proof
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a presentation proposal as verifier by sending an accept proposal message
   * to the connection associated with the proof record.
   *
   * @param proofRecordId
   * @param proposal
   * @returns ProofRecord
   */
  @Post('/:proofRecordId/accept-proposal')
  public async acceptProposal(@Request() request: Req, @Body() acceptProposal: AcceptProofProposal): Promise<any> {
    try {
      const proof = await request.agent.didcomm.proofs.acceptProposal({
        proofExchangeRecordId: acceptProposal.proofRecordId,
        proofFormats: acceptProposal.proofFormats,
        comment: acceptProposal.comment,
        autoAcceptProof: acceptProposal.autoAcceptProof,
        willConfirm: acceptProposal.willConfirm,
      })

      return proof
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates a presentation request bound to existing connection
   */
  @Post('/request-proof')
  public async requestProof(@Request() request: Req, @Body() requestProofOptions: RequestProofOptions): Promise<any> {
    try {
      const requestProofPayload = {
        connectionId: requestProofOptions.connectionId,
        protocolVersion: requestProofOptions.protocolVersion as ProofsProtocolVersionType<[]>,
        comment: requestProofOptions.comment,
        proofFormats: requestProofOptions.proofFormats,
        autoAcceptProof: requestProofOptions.autoAcceptProof,
        goalCode: requestProofOptions.goalCode,
        parentThreadId: requestProofOptions.parentThreadId,
        willConfirm: requestProofOptions.willConfirm,
      }
      const proof = await request.agent.didcomm.proofs.requestProof(requestProofPayload)

      return proof
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates a presentation request not bound to any proposal or existing connection
   */
  @Post('create-request-oob')
  public async createRequest(@Request() request: Req, @Body() createRequestOptions: CreateProofRequestOobOptions): Promise<any> {
    try {
      let routing: Routing
      let invitationDid: string | undefined

      if (createRequestOptions?.invitationDid) {
        invitationDid = createRequestOptions?.invitationDid
      } else {
        routing = await request.agent.didcomm.mediationRecipient.getRouting({})
        const { didDocument, keys } = createPeerDidDocumentFromServices(
          [
            {
              id: 'didcomm',
              recipientKeys: [routing.recipientKey],
              routingKeys: routing.routingKeys,
              serviceEndpoint: routing.endpoints[0],
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
      }

      const proof = await request.agent.didcomm.proofs.createRequest({
        protocolVersion: createRequestOptions.protocolVersion as ProofsProtocolVersionType<[]>,
        proofFormats: createRequestOptions.proofFormats,
        goalCode: createRequestOptions.goalCode,
        willConfirm: createRequestOptions.willConfirm,
        parentThreadId: createRequestOptions.parentThreadId,
        autoAcceptProof: createRequestOptions.autoAcceptProof,
        comment: createRequestOptions.comment,
      })
      const proofMessage = proof.message
      const outOfBandRecord = await request.agent.didcomm.oob.createInvitation({
        label: createRequestOptions.label,
        messages: [proofMessage],
        autoAcceptConnection: true,
        imageUrl: createRequestOptions?.imageUrl,
        goalCode: createRequestOptions?.goalCode,
        invitationDid,
      })

      return {
        invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({
          domain: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
        }),
        invitation: outOfBandRecord.outOfBandInvitation.toJSON(),
        outOfBandRecord: outOfBandRecord.toJSON(),
        invitationDid: createRequestOptions?.invitationDid ? '' : invitationDid,
        proofRecordThId: proof.proofRecord.threadId,
        proofMessageId: proof.message.thread?.threadId || proof.message.threadId || proof.message.id,
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a presentation request as prover by sending an accept request message
   * to the connection associated with the proof record.
   *
   * @param proofRecordId
   * @param request
   * @returns ProofRecord
   */
  @Post('/:proofRecordId/accept-request')
  public async acceptRequest(
    @Request() request: Req,
    @Path('proofRecordId') proofRecordId: string,
    @Body()
    body: {
      filterByPresentationPreview?: boolean
      filterByNonRevocationRequirements?: boolean
      comment?: string
    },
  ) {
    try {
      const requestedCredentials = await request.agent.didcomm.proofs.selectCredentialsForRequest({
        proofExchangeRecordId: proofRecordId,
      })

      const acceptProofRequest: AcceptProofRequestOptions = {
        proofExchangeRecordId: proofRecordId,
        proofFormats: requestedCredentials.proofFormats,
        comment: body.comment,
      }

      const proof = await request.agent.didcomm.proofs.acceptRequest(acceptProofRequest)

      return proof.toJSON()
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Accept a presentation as prover by sending an accept presentation message
   * to the connection associated with the proof record.
   *
   * @param proofRecordId
   * @returns ProofRecord
   */
  @Post('/:proofRecordId/accept-presentation')
  public async acceptPresentation(@Request() request: Req, @Path('proofRecordId') proofRecordId: string): Promise<any> {
    try {
      const proof = await request.agent.didcomm.proofs.acceptPresentation({ proofExchangeRecordId: proofRecordId })
      return proof
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Return proofRecord
   *
   * @param proofRecordId
   * @returns ProofRecord
   */
  @Get('/:proofRecordId/form-data')
  // TODO: Add return type
  public async proofFormData(@Request() request: Req, @Path('proofRecordId') proofRecordId: string): Promise<any> {
    try {
      const proof = await request.agent.didcomm.proofs.getFormatData(proofRecordId)
      return proof
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }
}

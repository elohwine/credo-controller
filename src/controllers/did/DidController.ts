import type { DidResolutionResultProps } from '../types'
import type { DidDocument, KeyDidCreateOptions, PeerDidNumAlgo2CreateOptions } from '@credo-ts/core'

import { Request as Req } from 'express'
import { Body, Controller, Example, Get, Path, Post, Route, Tags, Security, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { DidMethod, SCOPES } from '../../enums'
import ErrorHandlingService from '../../errorHandlingService'
import { BadRequestError, InternalServerError } from '../../errors'
import type { AgentType } from '../../types'
import { CreateDidResponse, Did, DidRecordExample } from '../examples'
import type { DidCreate } from '../types'

@Tags('Dids')
@Route('/dids')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@injectable()
export class DidController extends Controller {
  /**
   * Resolves did and returns did resolution result
   * @param did Decentralized Identifier
   * @returns DidResolutionResult
   */
  @Example<DidResolutionResultProps>(DidRecordExample)
  @Get('/:did')
  public async getDidRecordByDid(@Request() request: Req, @Path('did') did: Did): Promise<any> {
    const req = request as Req & { agent: AgentType }
    try {
      const resolveResult = await req.agent.dids.resolve(did)
      const importDid = await req.agent.dids.import({
        did,
        overwrite: true,
      })
      if (!resolveResult.didDocument) {
        throw new InternalServerError(`Error resolving DID docs for did: ${importDid}`)
      }

      return { ...resolveResult, didDocument: resolveResult.didDocument.toJSON() }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Did nym registration
   * @body DidCreateOptions
   * @returns DidResolutionResult
   */
  // @Example<DidResolutionResultProps>(DidRecordExample)
  @Example(CreateDidResponse)
  @Post('/write')
  public async writeDid(@Request() request: Req, @Body() createDidOptions: DidCreate): Promise<any> {
    const req = request as Req & { agent: AgentType }
    let didRes

    try {
      if (!createDidOptions.method) {
        throw new BadRequestError('Method is required')
      }

      let result
      switch (createDidOptions.method) {
        case DidMethod.Key:
          result = await this.handleKey(req.agent, createDidOptions)
          break

        case DidMethod.Web:
          result = await this.handleWeb(req.agent, createDidOptions)
          break

        case DidMethod.Peer:
          result = await this.handleDidPeer(req.agent, createDidOptions)
          break

        default:
          throw new BadRequestError(`Invalid method: ${createDidOptions.method}`)
      }

      didRes = { ...result }

      return didRes
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  private async handleDidPeer(agent: AgentType, createDidOptions: DidCreate) {
    if (!createDidOptions.keyType) {
      throw Error('keyType is required')
    }

    const didPeerResponse = await (agent.dids as any).create({ method: DidMethod.Peer, options: {} })
    return { did: didPeerResponse?.didState?.did }
  }

  public async handleKey(agent: AgentType, didOptions: DidCreate): Promise<any> {
    let did
    let didResponse
    let didDocument

    if (!didOptions.seed) {
      throw new BadRequestError('Seed is required')
    }
    if (!didOptions.keyType) {
      throw new BadRequestError('keyType is required')
    }
    if (didOptions.keyType !== 'Ed25519' && didOptions.keyType !== 'Bls12381g2') {
      throw new BadRequestError('Only ed25519 and bls12381g2 key type supported')
    }

    if (!didOptions.did) {
      didResponse = await (agent.dids as any).create({
        method: DidMethod.Key,
        options: {
          keyType: didOptions.keyType as any,
        },
      })
      did = `${didResponse.didState.did}`
      didDocument = didResponse.didState.didDocument
    } else {
      did = didOptions.did
      const createdDid = await agent.dids.getCreatedDids({
        method: DidMethod.Key,
        did: didOptions.did,
      })
      didDocument = createdDid[0]?.didDocument
    }

    await agent.dids.import({
      did,
      overwrite: true,
      didDocument,
    })
    return { did: did, didDocument: didDocument }
  }

  public async handleWeb(agent: AgentType, didOptions: DidCreate): Promise<any> {
    let didDocument: DidDocument | undefined
    if (!didOptions.domain) {
      throw new BadRequestError('For create did:web, domain is required')
    }

    if (!didOptions.seed) {
      throw new BadRequestError('Seed is required')
    }

    if (!didOptions.keyType) {
      throw new BadRequestError('keyType is required')
    }

    if (didOptions.keyType !== 'Ed25519' && didOptions.keyType !== 'Bls12381g2') {
      throw new BadRequestError('Only ed25519 and bls12381g2 key type supported')
    }

    const did = `did:${didOptions.method}:${didOptions.domain}`

    const didResult = await (agent.dids as any).create({
      method: DidMethod.Web,
      options: {
        domain: didOptions.domain,
        keyType: didOptions.keyType as any,
      },
    })

    if (didResult?.didState?.state !== 'finished') {
      throw new BadRequestError('Failed to create did:web')
    }

    didDocument = didResult.didState.didDocument

    await agent.dids.import({
      did,
      overwrite: true,
      didDocument,
    })
    return { did: didResult.didState.did || did, didDocument }
  }

  @Get('/')
  public async getDids(@Request() request: Req): Promise<any> {
    const req = request as Req & { agent: AgentType }
    try {
      const createdDids = await req.agent.dids.getCreatedDids()
      return createdDids
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }
}

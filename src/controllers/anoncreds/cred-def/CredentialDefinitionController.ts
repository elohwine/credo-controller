import type { SchemaId } from '../../examples'

// Removed parseIndyCredentialDefinitionId, getUnqualifiedCredentialDefinitionId - not needed in W3C-only build
import { Agent } from '@credo-ts/core'
import { Request as Req } from 'express'
import { Body, Controller, Example, Get, Path, Post, Route, Tags, Security, Response, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { CredentialEnum, EndorserMode, SchemaError, SCOPES } from '../../../enums'
import ErrorHandlingService from '../../../errorHandlingService'
import { ENDORSER_DID_NOT_PRESENT } from '../../../errorMessages'
import { BadRequestError, InternalServerError, NotFoundError } from '../../../errors/errors'
import { CredentialDefinitionExample, CredentialDefinitionId } from '../../examples'

@Tags('Anoncreds - Credential Definitions')
@Route('/anoncreds/credential-definitions')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@injectable()
export class CredentialDefinitionController extends Controller {
  /**
   * Retrieve credential definition by credential definition id
   *
   * @param credentialDefinitionId
   * @returns CredDef
   */
  @Example(CredentialDefinitionExample)
  @Get('/:credentialDefinitionId')
  public async getCredentialDefinitionById(
    @Request() request: Req,
    @Path('credentialDefinitionId') credentialDefinitionId: CredentialDefinitionId,
  ) {
    try {
      this.setStatus(501)
      return { message: 'AnonCreds not supported in this build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Creates a new credential definition.
   *
   * @param credentialDefinitionRequest
   * @returns CredDef
   */
  @Example(CredentialDefinitionExample)
  @Response(200, 'Action required')
  @Response(202, 'Wait for action to complete')
  @Post('/')
  public async createCredentialDefinition(
    @Request() request: Req,
    @Body()
    credentialDefinitionRequest: {
      issuerId: string
      schemaId: SchemaId
      tag: string
      endorse?: boolean
      endorserDid?: string
    },
  ) {
    try {
      this.setStatus(501)
      return { message: 'AnonCreds not supported in this build' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }
}

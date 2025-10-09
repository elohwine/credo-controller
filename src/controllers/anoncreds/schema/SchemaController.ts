// Removed parseIndySchemaId, getUnqualifiedSchemaId - not needed in W3C-only build
import { Request as Req } from 'express'
import { Example, Get, Post, Route, Tags, Security, Path, Body, Controller, Request } from 'tsoa'
import { injectable } from 'tsyringe'

import { CredentialEnum, EndorserMode, SchemaError, SCOPES } from '../../../enums'
import ErrorHandlingService from '../../../errorHandlingService'
import { ENDORSER_DID_NOT_PRESENT } from '../../../errorMessages'
import { BadRequestError, InternalServerError, NotFoundError } from '../../../errors/errors'
import { CreateSchemaSuccessful, SchemaExample, SchemaId } from '../../examples'
import { CreateSchemaInput } from '../../types'

@Tags('AnonCreds - Schemas (Preserved)')
@Route('/anoncreds/schemas')
@Security('jwt', [SCOPES.TENANT_AGENT, SCOPES.DEDICATED_AGENT])
@injectable()
export class SchemaController extends Controller {
  /**
   * Get schema by schemaId
   * @param schemaId
   * @param notFoundErrormessage
   * @param forbiddenError
   * @param badRequestError
   * @param internalServerError
   * @returns get schema by Id
   */
  @Example(SchemaExample)
  @Get('/:schemaId')
  public async getSchemaById(@Request() request: Req, @Path('schemaId') schemaId: SchemaId) {
    try {
      this.setStatus(410)
      return { message: 'AnonCreds schema lookup is no longer supported in this build.' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  /**
   * Create schema
   * @param schema
   * @param notFoundError
   * @param forbiddenError
   * @param badRequestError
   * @param internalServerError
   * @returns get schema
   */
  @Post('/')
  @Example(CreateSchemaSuccessful)
  public async createSchema(@Request() request: Req, @Body() schema: CreateSchemaInput) {
    try {
      this.setStatus(410)
      return { message: 'AnonCreds schema creation is no longer supported in this build.' }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }
}

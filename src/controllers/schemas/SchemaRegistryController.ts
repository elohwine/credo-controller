import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type { RegisterSchemaRequestBody } from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Controller, Get, Post, Route, Tags, Body, SuccessResponse, Path, Security, Request } from 'tsoa'
import { injectable } from '@credo-ts/core'

import { schemaStore, RegisterSchemaRequest, RegisteredSchema } from '../../utils/schemaStore'
import { BadRequestError, ConflictError } from '../../errors/errors'

// Controller delegates to shared schemaStore so other modules (issuance) can validate claims.

@Route('oidc')
@Tags('OIDC-Schema')
@injectable()
export class SchemaRegistryController extends Controller {
  /** Register a JSON Schema for W3C VC payload validation */
  @Post('schemas')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async registerSchema(@Request() request: ExRequest, @Body() body: RegisterSchemaRequestBody) {
    if (!body?.jsonSchema || typeof body.jsonSchema !== 'object') {
      throw new BadRequestError('jsonSchema required')
    }
    const result = schemaStore.register(body)
    if ('error' in result) {
      if (result.error.includes('exists')) {
        throw new ConflictError(result.error)
      }
      throw new BadRequestError(result.error)
    }
    request.logger?.info({ module: 'schema', operation: 'register', schemaId: result.schemaId }, 'Registered schema')
    return result
  }

  /** List registered schemas */
  @Get('schemas')
  @Security('jwt', ['tenant'])
  public async listSchemas(): Promise<RegisteredSchema[]> {
    return schemaStore.list()
  }

  /** Get a schema by id */
  @Get('schemas/{schemaId}')
  @Security('jwt', ['tenant'])
  public async getSchema(@Path() schemaId: string): Promise<RegisteredSchema | undefined> {
    const schema = schemaStore.get(schemaId)
    if (!schema) {
      this.setStatus(404)
      throw new Error('schema not found')
    }
    return schema
  }
}

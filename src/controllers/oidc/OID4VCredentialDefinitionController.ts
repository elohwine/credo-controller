import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Route, Security, Tags, Request } from 'tsoa'

import { credentialDefinitionStore } from '../../utils/credentialDefinitionStore'
import { schemaStore } from '../../utils/schemaStore'

interface RegisterCredentialDefinitionBody {
  name: string
  version: string
  schemaId: string
  credentialType: string[]
  issuerDid: string
  claimsTemplate?: Record<string, unknown>
  format?: 'jwt_vc' | 'sd_jwt'
}

@Route('oidc/credential-definitions')
@Tags('OIDC4VC Credential Definitions')
@Security('jwt', ['tenant'])
export class OID4VCredentialDefinitionController extends Controller {
  @Get('/')
  public async listCredentialDefinitions() {
    return credentialDefinitionStore.list()
  }

  @Get('/{id}')
  public async getCredentialDefinition(@Path() id: string) {
    const def = credentialDefinitionStore.get(id)
    if (!def) {
      this.setStatus(404)
      throw new Error('credential definition not found')
    }
    return def
  }

  @Post('/')
  public async registerCredentialDefinition(
    @Request() request: ExRequest,
    @Body() body: RegisterCredentialDefinitionBody,
  ) {
    const schema = schemaStore.get(body.schemaId)
    if (!schema) {
      this.setStatus(400)
      throw new Error('schemaId not registered')
    }
    const result = credentialDefinitionStore.register({
      name: body.name,
      version: body.version,
      schemaId: body.schemaId,
      credentialType: body.credentialType,
      issuerDid: body.issuerDid,
      claimsTemplate: body.claimsTemplate,
      format: body.format ?? 'jwt_vc',
    })
    if ('error' in result) {
      this.setStatus(400)
      throw new Error(result.error)
    }
    request.logger?.info(
      { module: 'credentialDefinition', operation: 'register', credentialDefinitionId: result.credentialDefinitionId },
      'Registered credential definition',
    )
    return result
  }
}

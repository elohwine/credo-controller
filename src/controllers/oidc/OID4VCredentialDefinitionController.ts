import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Route, Security, Tags, Request } from 'tsoa'
import jwt from 'jsonwebtoken'

import { credentialDefinitionStore } from '../../utils/credentialDefinitionStore'
import { schemaStore } from '../../utils/schemaStore'

interface RegisterCredentialDefinitionBody {
  name: string
  version: string
  schemaId: string
  credentialType: string[]
  issuerDid: string
  claimsTemplate?: Record<string, unknown>
  format?: 'jwt_vc' | 'sd_jwt' | 'jwt_vc_json' | 'jwt_vc_json-ld'
}

@Route('oidc/credential-definitions')
@Tags('OIDC4VC Credential Definitions')
export class OID4VCredentialDefinitionController extends Controller {
  @Get('/')
  public async listCredentialDefinitions(@Request() request: ExRequest) {
    // Return all credential definitions, deduplicated by name+version
    const allDefs = credentialDefinitionStore.list()
    const seen = new Map<string, any>()

    // Keep only the most recent definition for each name+version combination
    for (const def of allDefs) {
      const key = `${def.name}:${def.version}`
      if (!seen.has(key)) {
        seen.set(key, def)
      }
    }

    return Array.from(seen.values())
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
  @Security('jwt', ['tenant'])
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

    // Update OIDC Issuer Metadata for the tenant
    try {
      const { buildIssuerMetadata } = require('../../utils/openidMetadata')
      const { issuerMetadataCache } = require('../../utils/issuerMetadataCache')
      const tenantId = (request as any).user?.tenantId
      const agent = request.agent

      if (tenantId && agent.modules.openId4VcIssuer) {
        const issuers = await agent.modules.openId4VcIssuer.getAllIssuers()
        if (issuers.length > 0) {
          const issuer = issuers[0]
          const issuerUrl = `${process.env.PUBLIC_BASE_URL}/tenants/${tenantId}`

          const newMetadata = buildIssuerMetadata({
            issuerDid: body.issuerDid,
            issuerUrl,
            baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
            credentialEndpoint: `${process.env.PUBLIC_BASE_URL}/oidc/token`,
            tokenEndpoint: `${process.env.PUBLIC_BASE_URL}/oidc/token`,
            tenantId
          })

          await agent.modules.openId4VcIssuer.updateIssuerMetadata({
            issuerId: issuer.issuerId,
            credentialsSupported: newMetadata.credentials_supported,
            credentialConfigurationsSupported: newMetadata.credential_configurations_supported
          })

          // Update cache
          issuerMetadataCache.set(issuerUrl, newMetadata, body.issuerDid, 'kid-1', tenantId)
          console.log(`✅ Updated OIDC Issuer metadata for tenant ${tenantId}`)
        }
      }
    } catch (e: any) {
      console.warn('Failed to update OIDC issuer metadata after registration:', e.message)
    }

    return result
  }
}

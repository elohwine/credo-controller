import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Get, Route, Tags, Path, Request } from 'tsoa'

import { getTenantById } from '../../persistence/TenantRepository'

/**
 * Public OIDC metadata endpoints for issuer/verifier discovery
 * No authentication required - these are public discovery documents
 */
@Route('tenants')
@Tags('OIDC Discovery')
export class OidcMetadataController extends Controller {
  /**
   * Get OpenID Credential Issuer metadata (public endpoint)
   * Implements: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata
   */
  @Get('{tenantId}/.well-known/openid-credential-issuer')
  public async getIssuerMetadata(
    @Request() request: ExRequest,
    @Path() tenantId: string,
  ): Promise<Record<string, unknown>> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      this.setStatus(404)
      throw new Error('Tenant not found')
    }

    const issuerMetadata = tenant.metadata?.issuer
    if (!issuerMetadata || typeof issuerMetadata !== 'object') {
      this.setStatus(404)
      throw new Error('Issuer metadata not configured for this tenant')
    }

    // Dynamically add credential_configurations_supported from credential definitions
    const metadata = { ...issuerMetadata }
    try {
        // NOTE: controller is under src/controllers/oidc, utils is two levels up
        const { credentialDefinitionStore } = require('../../utils/credentialDefinitionStore')
      const definitions = credentialDefinitionStore.list(tenantId)
      
      const credentialConfigurations: Record<string, any> = {}
      definitions.forEach((def: any) => {
        const configId = `${def.credentialDefinitionId}_jwt_vc_json`
        credentialConfigurations[configId] = {
          format: 'jwt_vc_json',
          scope: def.name,
          cryptographic_binding_methods_supported: ['did'],
          cryptographic_suites_supported: ['Ed25519Signature2018'],
          credential_definition: {
            type: def.credentialType || ['VerifiableCredential'],
          },
          display: [
            {
              name: def.name,
              locale: 'en-US',
            },
          ],
        }
      })
      
      metadata.credential_configurations_supported = credentialConfigurations
    } catch (error) {
      request.logger?.warn({ error: (error as Error).message }, 'Failed to load credential configurations')
      metadata.credential_configurations_supported = {}
    }

    request.logger?.info(
      { module: 'oidc-metadata', operation: 'getIssuerMetadata', tenantId },
      'Served issuer metadata',
    )

    return metadata
  }

  /**
   * Get OpenID Verifier metadata (public endpoint)
   * Implements verifier discovery for OIDC4VP flows
   */
  @Get('{tenantId}/.well-known/openid-verifier')
  public async getVerifierMetadata(
    @Request() request: ExRequest,
    @Path() tenantId: string,
  ): Promise<Record<string, unknown>> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      this.setStatus(404)
      throw new Error('Tenant not found')
    }

    const verifierMetadata = tenant.metadata?.verifier
    if (!verifierMetadata || typeof verifierMetadata !== 'object') {
      this.setStatus(404)
      throw new Error('Verifier metadata not configured for this tenant')
    }

    request.logger?.info(
      { module: 'oidc-metadata', operation: 'getVerifierMetadata', tenantId },
      'Served verifier metadata',
    )

    return verifierMetadata
  }

  /**
   * Get tenant's issuer DID document (public endpoint)
   * Useful for resolving issuer identity during verification
   */
  @Get('{tenantId}/issuer/did')
  public async getIssuerDid(
    @Request() request: ExRequest,
    @Path() tenantId: string,
  ): Promise<{ did: string; kid: string }> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      this.setStatus(404)
      throw new Error('Tenant not found')
    }

    request.logger?.info(
      { module: 'oidc-metadata', operation: 'getIssuerDid', tenantId, did: tenant.issuerDid },
      'Served issuer DID',
    )

    return {
      did: tenant.issuerDid,
      kid: tenant.issuerKid,
    }
  }
}

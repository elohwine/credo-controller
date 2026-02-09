import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Get, Route, Tags, Path, Request } from 'tsoa'

import { getTenantById } from '../../persistence/TenantRepository'

/**
 * Public OIDC metadata endpoints for issuer/verifier discovery
 * No authentication required - these are public discovery documents
 */
@Route('')
@Tags('OIDC Discovery')
export class OidcMetadataController extends Controller {
  /**
   * Platform-level OpenID Credential Issuer metadata (no-tenant)
   * Serves a minimal issuer metadata document at `/.well-known/openid-credential-issuer`
   * This is useful for non-tenant offers that reference the base server as issuer.
   */
  @Get('.well-known/openid-credential-issuer')
  public async getPlatformIssuerMetadata(@Request() request: ExRequest): Promise<Record<string, unknown>> {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get('host')}`
    // Minimal metadata required by wallets to discover token endpoint and issuer
    const metadata: Record<string, unknown> = {
      issuer: baseUrl,
      credential_issuer: baseUrl,
      token_endpoint: `${baseUrl}/oidc/issuer/default-platform-issuer/token`,
      credential_endpoint: `${baseUrl}/oidc/issuer/default-platform-issuer/credential`,
      // Indicate support for pre-authorized_code grant
      grants: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    }

    // Populate credential configurations from the global credential definition store so
    // wallet UIs can display human-friendly credential cards when the platform is the issuer.
    try {
      // Lazy-require to avoid circular deps during startup
      const { credentialDefinitionStore } = require('../../utils/credentialDefinitionStore')
      const definitions = credentialDefinitionStore.list() || []

      const credentialConfigurations: Record<string, any> = {}
      definitions.forEach((def: any) => {
        const storedFormat = (def.format || 'jwt_vc') as string
        // Map stored format to advertised OpenID4VC format
        let advertisedFormat = 'jwt_vc'
        let suffix = '_jwt_vc'
        if (storedFormat.toLowerCase() === 'sd_jwt') {
          advertisedFormat = 'vc+sd-jwt'
          suffix = '_vc+sd-jwt'
        } else if (storedFormat.toLowerCase().startsWith('jwt_vc_json')) {
          advertisedFormat = 'jwt_vc_json'
          suffix = '_jwt_vc_json'
        }

        const configId = `${def.name}${suffix}`
        credentialConfigurations[configId] = {
          format: advertisedFormat,
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
      request.logger?.warn({ error: (error as Error).message }, 'Failed to load global credential configurations')
      metadata.credential_configurations_supported = {}
    }

    request.logger?.info({ module: 'oidc-metadata', operation: 'getPlatformIssuerMetadata', baseUrl }, 'Served platform issuer metadata')
    return metadata
  }

  /**
   * OAuth Authorization Server metadata for issuer-specific OID4VCI flows
   * This is required by some wallets to validate token endpoint URLs
   */
  @Get('oidc/issuer/{issuerId}/.well-known/oauth-authorization-server')
  public async getIssuerAuthorizationServerMetadata(
    @Request() request: ExRequest,
    @Path() issuerId: string,
  ): Promise<Record<string, unknown>> {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get('host')}`
    const issuerBase = `${baseUrl}/oidc/issuer/${issuerId}`

    return {
      issuer: issuerBase,
      authorization_server: issuerBase,
      token_endpoint: `${issuerBase}/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      token_endpoint_auth_methods_supported: ['none'],
    }
  }

  /**
   * Platform-level OAuth Authorization Server metadata
   */
  @Get('.well-known/oauth-authorization-server')
  public async getPlatformAuthorizationServerMetadata(
    @Request() request: ExRequest,
  ): Promise<Record<string, unknown>> {
    const baseUrl = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get('host')}`
    const issuerBase = `${baseUrl}/oidc/issuer/default-platform-issuer`

    return {
      issuer: issuerBase,
      authorization_server: issuerBase,
      token_endpoint: `${issuerBase}/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      token_endpoint_auth_methods_supported: ['none'],
    }
  }
  /**
   * Get OpenID Credential Issuer metadata (public endpoint)
   * Implements: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata
   */
  @Get('tenants/{tenantId}/.well-known/openid-credential-issuer')
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
      console.log(`[OidcMetadata] Found ${definitions.length} definitions for tenant ${tenantId}`);

      const credentialConfigurations: Record<string, any> = {}
      definitions.forEach((def: any) => {
        const storedFormat = (def.format || 'jwt_vc') as string
        let advertisedFormat = 'jwt_vc'
        let suffix = '_jwt_vc'
        if (storedFormat.toLowerCase() === 'sd_jwt') {
          advertisedFormat = 'vc+sd-jwt'
          suffix = '_vc+sd-jwt'
        } else if (storedFormat.toLowerCase().startsWith('jwt_vc_json')) {
          advertisedFormat = 'jwt_vc_json'
          suffix = '_jwt_vc_json'
        }

        const configId = `${def.name}${suffix}`
        credentialConfigurations[configId] = {
          format: advertisedFormat,
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
  @Get('tenants/{tenantId}/.well-known/openid-verifier')
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
  @Get('tenants/{tenantId}/issuer/did')
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

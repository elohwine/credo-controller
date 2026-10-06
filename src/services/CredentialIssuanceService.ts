/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * CredentialIssuanceService - Unified credential offer creation
 *
 * All credential issuance flows (login, workflows, API) use this service
 * to create consistent OIDC4VC pre-authorized offers with deeplinks.
 */

import type { RestMultiTenantAgentModules } from '../cliAgent'

import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { container } from 'tsyringe'

import { credentialDefinitionStore } from '../utils/credentialDefinitionStore'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'CredentialIssuanceService' })

/**
 * Input for creating a credential offer
 */
export interface IssuanceRequest {
  /** Credential type name, e.g., 'GenericID', 'PaymentReceipt', 'Quote' */
  credentialType: string

  /** The actual claims to include in the VC credentialSubject */
  claims: Record<string, any>

  /** Subject DID (the holder's DID) - optional, can be provided at acceptance time */
  subjectDid?: string

  /** Override issuer DID - if not provided, uses tenant's issuer DID */
  issuerDid?: string

  /** Tenant ID for multi-tenant scenarios (REQUIRED for credential issuance) */
  tenantId: string

  /** Expiration time in milliseconds (default: 1 hour) */
  expiresInMs?: number

  /** Base URL for generating offer URIs (default: from env or localhost:3000) */
  baseUrl?: string
}

/**
 * Result of creating a credential offer
 */
export interface IssuanceResult {
  /** Unique offer ID */
  offerId: string

  /** Pre-authorized code for token exchange */
  preAuthorizedCode: string

  /** Direct HTTP URL to fetch the offer */
  credential_offer_uri: string

  /** OIDC4VCI deeplink for wallet scanning/clicking */
  credential_offer_deeplink: string

  /** When the offer expires */
  expiresAt: string

  /** The credential type that will be issued */
  credentialType: string[]
}

/**
 * Unified service for creating credential offers
 */
export class CredentialIssuanceService {
  /**
   * Create a pre-authorized credential offer
   *
   * @param request - Issuance parameters
   * @returns Offer details with deeplink for wallet acceptance
   */
  async createOffer(request: IssuanceRequest): Promise<IssuanceResult> {
    logger.info({ credentialType: request.credentialType, tenantId: request.tenantId }, 'Creating credential offer')

    // 1. Resolve base agent which has OpenId4VcIssuer module
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    if (!request.tenantId) {
      throw new Error('tenantId is required for credential issuance')
    }

    // Get tenant agent for DID/context purposes
    const tenantAgent = await (baseAgent.modules as any).tenants.getTenantAgent({ tenantId: request.tenantId })

    try {
      // Use BASE agent's OpenID4VC issuer, NOT tenant agent (which doesn't have it)
      const baseModules = baseAgent.modules as any
      logger.info(
        { moduleKeys: Object.keys(baseModules || {}), tenantId: request.tenantId },
        'Available modules on Base Agent',
      )

      const issuerModule = (baseAgent as any).openid4vc?.issuer || baseModules.openId4VcIssuer
      if (!issuerModule) {
        throw new Error(
          `OpenID4VC issuer module is missing on base agent. Available: ${Object.keys(baseModules || {}).join(', ')}`,
        )
      }

      // Get the issuer for this tenant
      const issuers = await issuerModule.getAllIssuers()
      if (!issuers || issuers.length === 0) {
        throw new Error('No OpenID4VC issuers found for this tenant. Tenant provisioning may have failed.')
      }
      let openId4VcIssuer = issuers[0]

      // Resolve a supported credential configuration id.
      // Invalid IDs can cause deep library errors, so always validate against issuer metadata.
      const requestedBaseId = request.credentialType
      const requestedConfigId = requestedBaseId.includes('_jwt_vc') ? requestedBaseId : `${requestedBaseId}_jwt_vc_json`

      const supportedIds = new Set<string>()
      const issuerAny = openId4VcIssuer as any
      const credentialsSupported = Array.isArray(issuerAny?.credentialsSupported) ? issuerAny.credentialsSupported : []
      for (const item of credentialsSupported) {
        if (item?.id && typeof item.id === 'string') supportedIds.add(item.id)
      }

      const credentialConfigurationsSupported = issuerAny?.credentialConfigurationsSupported
      if (
        credentialConfigurationsSupported &&
        typeof credentialConfigurationsSupported === 'object' &&
        !Array.isArray(credentialConfigurationsSupported)
      ) {
        for (const key of Object.keys(credentialConfigurationsSupported)) supportedIds.add(key)
      }

      // Self-heal stale issuer metadata for existing tenants by rebuilding supported
      // credential configurations from tenant credential definitions.
      if (supportedIds.size === 0) {
        const tenantDefinitions = credentialDefinitionStore.list(request.tenantId)
        if (tenantDefinitions.length > 0) {
          const rebuiltConfigs = Object.fromEntries(
            tenantDefinitions.flatMap((def: any) => {
              const leafType =
                Array.isArray(def.credentialType) && def.credentialType.length
                  ? def.credentialType[def.credentialType.length - 1]
                  : def.name
              const idBases = Array.from(new Set([def.name, leafType].filter(Boolean)))
              return idBases.map((base) => {
                const id = `${base}_jwt_vc_json`
                return [
                  id,
                  {
                    id,
                    format: 'jwt_vc_json',
                    scope: base,
                    cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
                    credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
                    proof_types_supported: {
                      jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
                    },
                    credential_definition: {
                      type: def.credentialType || ['VerifiableCredential', base],
                    },
                    display: [{ name: base, locale: 'en-US' }],
                  },
                ]
              })
            }),
          )

          await issuerModule.updateIssuerMetadata({
            issuerId: openId4VcIssuer.issuerId,
            credentialConfigurationsSupported: rebuiltConfigs,
            display: issuerAny?.display || [],
          })

          const refreshedIssuers = await issuerModule.getAllIssuers()
          openId4VcIssuer =
            refreshedIssuers.find((i: any) => i.issuerId === openId4VcIssuer.issuerId) || openId4VcIssuer

          for (const key of Object.keys(rebuiltConfigs)) supportedIds.add(key)
          logger.info(
            { tenantId: request.tenantId, issuerId: openId4VcIssuer.issuerId, supportedCount: supportedIds.size },
            'Rebuilt issuer credential configuration metadata for tenant',
          )
        }
      }

      let configId = requestedConfigId
      if (supportedIds.size > 0 && !supportedIds.has(configId)) {
        const byBaseMatch = Array.from(supportedIds).find((id) => id.startsWith(`${requestedBaseId}_`))
        configId = byBaseMatch || Array.from(supportedIds)[0]
        logger.warn(
          {
            requestedConfigId,
            resolvedConfigId: configId,
            supportedCount: supportedIds.size,
          },
          'Requested credential config is not supported by issuer. Falling back to a supported id.',
        )
      }

      // Create credential offer using the Credo API
      const result = await issuerModule.createCredentialOffer({
        issuerId: openId4VcIssuer.issuerId,
        credentialConfigurationIds: [configId],
        version: 'v1.draft11-14',
        preAuthorizedCodeFlowConfig: {
          userPinRequired: false,
          // The pre-authorized code must live as long as the offer we tell the holder about.
          // A 10-minute code expired employee and role-card offers before anyone could accept them.
          tokenStatusConfig: {
            accessTokenLifetimeInSeconds: Math.min(
              Math.max(60, Math.round((request.expiresInMs && request.expiresInMs > 0 ? request.expiresInMs : 24 * 60 * 60 * 1000) / 1000)),
              30 * 24 * 60 * 60,
            ),
          },
        },
        issuanceMetadata: {
          claims: request.claims,
          subjectDid: request.subjectDid,
          tenantId: request.tenantId,
          credentialDefinitionId: configId,
        },
      })

      // Credo returns: { credentialOffer: string (the fully formed deep link), issuanceSession: ... }
      const credentialOfferDeepLink = result.credentialOffer
      const issuanceSession = result.issuanceSession

      // Extract the actual HTTP URI for clients that need it (decode it first)
      let credentialOfferUri = ''
      if (credentialOfferDeepLink && credentialOfferDeepLink.includes('credential_offer_uri=')) {
        const encodedUri = credentialOfferDeepLink.split('credential_offer_uri=')[1]
        credentialOfferUri = decodeURIComponent(encodedUri)
      } else {
        credentialOfferUri = credentialOfferDeepLink
      }

      // Wrap with Wallet URL if configured (to invoke web wallet)
      const walletUrl = process.env.WALLET_URL || 'http://localhost:4000'
      let finalDeeplink = credentialOfferDeepLink
      if (walletUrl && !credentialOfferDeepLink.startsWith(walletUrl)) {
        // Format: http://localhost:4000/api/siop/initiateIssuance?credential_offer_uri=...
        // This ensures the custom Nuxt page handles the resolution.
        finalDeeplink = `${walletUrl}/api/siop/initiateIssuance?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`
      }

      logger.info(
        { offerId: issuanceSession?.id, uri: credentialOfferUri?.slice(0, 100), configId },
        'Credential offer created',
      )

      return {
        offerId: issuanceSession?.id || 'unknown',
        preAuthorizedCode: issuanceSession?.preAuthorizedCode || '',
        credential_offer_uri: credentialOfferUri,
        credential_offer_deeplink: finalDeeplink,
        expiresAt: new Date(Date.now() + (request.expiresInMs && request.expiresInMs > 0 ? request.expiresInMs : 24 * 60 * 60 * 1000)).toISOString(),
        credentialType: ['VerifiableCredential', request.credentialType.replace(/_jwt_vc(_json)?$/, '')],
      }
    } catch (e: any) {
      logger.error(
        { error: e.message, stack: e.stack, tenantId: request.tenantId },
        'Failed to create credential offer',
      )
      throw new Error(`Failed to create credential offer: ${e.message}`)
    } finally {
      // End tenant session
      if (tenantAgent && typeof (tenantAgent as any).endSession === 'function') {
        await (tenantAgent as any).endSession()
      }
    }
  }

  /**
   * Get the platform's default issuer DID
   * Creates one if none exists
   */
  private async getDefaultIssuerDid(): Promise<string> {
    const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
    const dids = await agent.dids.getCreatedDids({ method: 'key' })
    if (dids.length > 0) return dids[0].did

    // Create one if missing
    const did = await agent.dids.create({
      method: 'key',
      options: {
        createKey: {
          type: {
            kty: 'OKP',
            crv: 'Ed25519',
          },
        },
      },
    })
    return did.didState.did as string
  }
}

// Singleton instance
export const credentialIssuanceService = new CredentialIssuanceService()

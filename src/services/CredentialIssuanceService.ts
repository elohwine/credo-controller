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

import {
  SD_JWT_CONFIG_SUFFIX,
  credentialDefinitionStore,
  issuerConfigurationIdFor,
  issuerConfigurationsForDefinition,
} from '../utils/credentialDefinitionStore'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'CredentialIssuanceService' })

export function offerExpirationInSeconds(expiresInMs = 30 * 24 * 60 * 60 * 1000): number {
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new Error('Credential offer lifetime must be a positive number of milliseconds')
  }
  return Math.max(1, Math.ceil(expiresInMs / 1000))
}

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

  /** Legacy field; issuer selection is governed by signAs and the tenant's credential definitions. */
  issuerDid?: string

  /** Tenant ID for multi-tenant scenarios (REQUIRED for credential issuance) */
  tenantId: string

  /** Prevent silently falling back to a different supported credential configuration. */
  requireExactCredentialType?: boolean

  /** Offer/session lifetime in milliseconds (default: 30 days), not credential validity. */
  expiresInMs?: number

  /** Base URL for generating offer URIs (default: from env or localhost:3000) */
  baseUrl?: string

  /**
   * `organisation`: require an organisation issuer for this type. When omitted, the service
   * prefers the organisation issuer when configured and otherwise uses the platform issuer.
   */
  signAs?: 'organisation' | 'platform'
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

  /** Whose issuer made the offer, and so whose DID signs the record. */
  signedBy: 'organisation' | 'platform'
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

      let issuerModule = (baseAgent as any).openid4vc?.issuer || baseModules.openId4VcIssuer
      let signedBy: IssuanceResult['signedBy'] = 'platform'
      if (request.signAs !== 'platform') {
        const organisationIssuer = await this.organisationIssuer(tenantAgent, request.tenantId, request.credentialType)
        if (organisationIssuer) {
          issuerModule = organisationIssuer
          signedBy = 'organisation'
        } else {
          const { getTenantById } = await import('../persistence/TenantRepository')
          const tenantType = getTenantById(request.tenantId)?.tenantType
          const organisationSigningRequired = request.signAs === 'organisation' || tenantType === 'ORG'
          if (organisationSigningRequired) {
            throw new Error(
              `The organisation issuer for tenant ${request.tenantId} is not configured for ${request.credentialType}`,
            )
          }
          logger.warn(
            { tenantId: request.tenantId, credentialType: request.credentialType },
            'No organisation issuer is configured for this type; the platform issuer signs it',
          )
        }
      }
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
      // Staff and role cards are offered with selective disclosure (`vc+sd-jwt`); other types as `jwt_vc_json`.
      const requestedConfigId =
        requestedBaseId.includes('_jwt_vc') || requestedBaseId.endsWith(SD_JWT_CONFIG_SUFFIX)
          ? requestedBaseId
          : issuerConfigurationIdFor(requestedBaseId)

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
            tenantDefinitions
              .flatMap((def: any) => issuerConfigurationsForDefinition(def))
              .map((config) => [config.id, config]),
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
      // A workflow record the organisation has not issued before: register it now so the holder
      // keeps a card of that type instead of whatever the issuer happened to support first.
      if (supportedIds.size > 0 && !supportedIds.has(configId)) {
        try {
          const { ensureRecordModels } = await import('./modelRegistry')
          const { getTenantById } = await import('../persistence/TenantRepository')
          const issuerDid = getTenantById(request.tenantId)?.issuerDid
          const registered = issuerDid ? await ensureRecordModels(request.tenantId, issuerDid, [requestedBaseId]) : []
          if (registered.length > 0) {
            const refreshedIssuers = await issuerModule.getAllIssuers()
            openId4VcIssuer =
              refreshedIssuers.find((i: any) => i.issuerId === openId4VcIssuer.issuerId) || openId4VcIssuer
            for (const key of Object.keys((openId4VcIssuer as any)?.credentialConfigurationsSupported || {}))
              supportedIds.add(key)
            logger.info(
              { tenantId: request.tenantId, credentialType: requestedBaseId },
              'Registered record model on first use',
            )
          }
        } catch (error: any) {
          logger.warn(
            { error: error?.message, credentialType: requestedBaseId },
            'Could not register record model; falling back',
          )
        }
      }
      if (request.requireExactCredentialType && !supportedIds.has(configId)) {
        throw new Error(`The issuer does not support the requested credential type: ${requestedBaseId}`)
      }
      if (supportedIds.size > 0 && !supportedIds.has(configId)) {
        const byBaseMatch = Array.from(supportedIds).find((id) => id.startsWith(`${requestedBaseId}_`))
        if (requestedBaseId === 'JobAssignmentVC' && !byBaseMatch) {
          throw new Error(
            'The issuer does not support JobAssignmentVC. Register the assignment record model before retrying.',
          )
        }
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
        expirationInSeconds: offerExpirationInSeconds(request.expiresInMs),
        preAuthorizedCodeFlowConfig: {
          userPinRequired: false,
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
        expiresAt: new Date(Date.now() + offerExpirationInSeconds(request.expiresInMs) * 1000).toISOString(),
        credentialType: ['VerifiableCredential', request.credentialType.replace(/_jwt_vc(_json)?$/, '')],
        signedBy,
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
   * The organisation's own OpenID4VC issuer, ready to offer `credentialType`, or undefined when
   * the organisation's wallet does not hold the DID its definition names. Credo routes the
   * holder's token and credential requests for this issuer into the organisation's wallet.
   */
  private async organisationIssuer(tenantAgent: any, tenantId: string, credentialType: string): Promise<any> {
    const baseType = credentialType.replace(/(_jwt_vc_json|_jwt_vc|_vc\+sd-jwt)$/, '')
    let definitions = credentialDefinitionStore.list(tenantId)
    let definition = definitions.find(
      (def: any) =>
        def.name === baseType || (Array.isArray(def.credentialType) && def.credentialType.includes(baseType)),
    )
    if (!definition) {
      const { getTenantById } = await import('../persistence/TenantRepository')
      const tenant = getTenantById(tenantId)
      if (tenant?.tenantType === 'ORG' && tenant.issuerDid) {
        const { ensureRecordModels } = await import('./modelRegistry')
        await ensureRecordModels(tenantId, tenant.issuerDid, [baseType])
        definitions = credentialDefinitionStore.list(tenantId)
        definition = definitions.find(
          (def: any) =>
            def.name === baseType || (Array.isArray(def.credentialType) && def.credentialType.includes(baseType)),
        )
      }
    }
    if (!definition?.issuerDid) return undefined
    if (typeof tenantAgent.dids?.getCreatedDids !== 'function') return undefined
    const [held] = await tenantAgent.dids.getCreatedDids({ did: definition.issuerDid })
    if (!held) return undefined

    const module = tenantAgent.openid4vc?.issuer || tenantAgent.modules?.openId4VcIssuer
    if (!module?.getAllIssuers) return undefined
    const configurations = Object.fromEntries(
      definitions
        .filter((def: any) => def.issuerDid === definition.issuerDid)
        .flatMap((def: any) => issuerConfigurationsForDefinition(def))
        .map((config) => [config.id, config]),
    )
    let [issuer] = await module.getAllIssuers()
    if (!issuer) {
      issuer = await module.createIssuer({ credentialConfigurationsSupported: configurations, display: [] })
    } else if (Object.keys(configurations).some((id) => !issuer.credentialConfigurationsSupported?.[id])) {
      await module.updateIssuerMetadata({
        issuerId: issuer.issuerId,
        credentialConfigurationsSupported: { ...(issuer.credentialConfigurationsSupported || {}), ...configurations },
        display: issuer.display || [],
      })
    }
    return module
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

/**
 * Public discovery: organisations that chose to be found, what they offer, and their storefront.
 *
 * Read-only and unauthenticated, like the public checkout routes. Everything comes from the
 * organisation registry and service catalogue the organisation already maintains; a request to
 * one of these organisations goes through `POST /workflow-requests` with `targetOrgTenantId`.
 * `POST /api/discovery/match` ranks who can take one request. Asking them is
 * `POST /workflow-requests/ask`, which creates the same quote request as writing to one of them.
 */
import type { Request as ExRequest } from 'express'
import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { StatusException } from '../../errors/StatusException'
import { marketingService, type OfferPreference } from '../../services/MarketingService'
import { providerReviewService, type ReviewSummary, type SavedReview } from '../../services/ProviderReviewService'
import {
  organizationRegistryRepository,
  type OrganizationCategory,
  type OrganizationRegistry,
} from '../../persistence/OrganizationRegistryRepository'
import {
  orgOfferingsService,
  type MatchRequest,
  type ProviderMatch,
  type PublicGoodsItem,
  type PublicService,
  type PublicStorefront,
} from '../../services/OrgOfferingsService'

/** One row of the Discover list. */
export interface DiscoveryOrganizationSummary {
  id: string
  tenantId: string
  name: string
  description?: string
  logo?: string
  category: string
  trustScore: number
  verificationStatus: string
  /** Services people can ask for or book. */
  availableServices: number
  /** Products for sale in the shop; 0 when the organisation does not sell goods. */
  goodsCount: number
}

export type DiscoveryService = PublicService
export type DiscoveryCatalogItem = PublicGoodsItem

export interface DiscoveryOrganizationProfile {
  org: {
    id: string
    tenantId: string
    displayName: string
    description?: string
    logoUrl?: string
    category: string
    trustScore: number
    verificationStatus: string
    issuerDid: string
    website?: string
    contactPhone?: string
    contactEmail?: string
    address?: string
  }
  services: DiscoveryService[]
}

export type DiscoveryStorefront = PublicStorefront

export interface ReviewInput {
  /** 1 to 5. */
  rating: number
  comment?: string
}

/** The phone on the person's account. Offers only; this does not change alert settings. */
export interface OfferOptIn {
  phone: string
  /** Defaults to on. Send false to stop offers from this business. */
  enabled?: boolean
}

function toSummary(org: OrganizationRegistry): DiscoveryOrganizationSummary {
  return {
    id: org.id,
    tenantId: org.tenantId,
    name: org.displayName,
    description: org.description,
    logo: org.logoUrl,
    category: org.category,
    trustScore: Number(org.trustScore || 0),
    verificationStatus: org.verificationStatus,
    availableServices: orgOfferingsService.publishedServices(org).length,
    goodsCount: orgOfferingsService.goods(org.tenantId).length,
  }
}

@Route('api/discovery')
@Tags('Discovery')
export class DiscoveryController extends Controller {
  /** Organisations that chose to be found, best-trusted first. */
  @Get('organizations')
  public async listOrganizations(
    @Query() category?: string,
    @Query() verifiedOnly?: boolean,
    @Query() limit?: number,
  ): Promise<DiscoveryOrganizationSummary[]> {
    const orgs = organizationRegistryRepository.listPublicOrganizations({
      category: category ? (category as OrganizationCategory) : undefined,
      verifiedOnly: Boolean(verifiedOnly),
      limit: limit ? Math.min(Math.max(Number(limit), 1), 100) : 50,
    })
    return orgs.filter((org) => orgOfferingsService.isDiscoverable(org)).map(toSummary)
  }

  /** Search those organisations by name, description or category. */
  @Get('search')
  public async search(@Query() q: string, @Query() category?: string): Promise<DiscoveryOrganizationSummary[]> {
    const query = String(q || '').trim()
    if (!query) return []
    const orgs = organizationRegistryRepository.searchOrganizations(query, {
      publicOnly: true,
      category: category ? (category as OrganizationCategory) : undefined,
      limit: 30,
    })
    return orgs.filter((org) => orgOfferingsService.isDiscoverable(org)).map(toSummary)
  }

  /** One organisation and the services it offers. Accepts the registry id or the tenant id. */
  @Get('organizations/{id}')
  public async getOrganization(@Path() id: string): Promise<DiscoveryOrganizationProfile> {
    const org = this.resolvePublicOrganization(id)
    return {
      org: {
        id: org.id,
        tenantId: org.tenantId,
        displayName: org.displayName,
        description: org.description,
        logoUrl: org.logoUrl,
        category: org.category,
        trustScore: Number(org.trustScore || 0),
        verificationStatus: org.verificationStatus,
        issuerDid: org.issuerDid,
        website: org.website,
        contactPhone: org.contactPhone,
        contactEmail: org.contactEmail,
        address: org.address,
      },
      services: orgOfferingsService.publishedServices(org),
    }
  }

  /**
   * Who can take this request, best first, each with the reason.
   * Read-only. Asking them is a separate, signed-in step.
   */
  @Post('match')
  public async match(@Body() body: MatchRequest): Promise<ProviderMatch[]> {
    return orgOfferingsService.match(body || {})
  }

  /** Ratings from customers who paid this business or whose request it accepted. */
  @Get('organizations/{id}/reviews')
  public async reviews(@Path() id: string): Promise<ReviewSummary> {
    const org = this.resolvePublicOrganization(id)
    return providerReviewService.summary(org.tenantId)
  }

  /** Leave or replace your rating. You must have paid them, or they must have accepted your request. */
  @Post('organizations/{id}/reviews')
  @Security('jwt', ['wallet'])
  public async review(
    @Path() id: string,
    @Body() body: ReviewInput,
    @Request() request: ExRequest,
  ): Promise<SavedReview> {
    const tenantId = (request as ExRequest & { tenantId?: string }).tenantId
    if (!tenantId) throw new StatusException('Sign in to rate a business.', 401)
    return providerReviewService.submit(tenantId, id, body?.rating, body?.comment)
  }

  /**
   * Ask this business to send you offers. Separate from WhatsApp alerts.
   * STOP on their number turns this off as well.
   */
  @Post('organizations/{id}/offers')
  @Security('jwt', ['wallet'])
  public async offers(
    @Path() id: string,
    @Body() body: OfferOptIn,
    @Request() request: ExRequest,
  ): Promise<OfferPreference> {
    const tenantId = (request as ExRequest & { tenantId?: string; userId?: string; user?: { id?: string } }).tenantId
    const userId =
      (request as ExRequest & { userId?: string; user?: { id?: string } }).user?.id ||
      (request as ExRequest & { userId?: string }).userId
    if (!tenantId || !userId) throw new StatusException('Sign in to ask for offers.', 401)
    return marketingService.setOptIn(userId, tenantId, id, body?.phone, body?.enabled !== false)
  }

  /** The organisation's storefront: services it offers, goods it sells, badges and how it takes payment. */
  @Get('organizations/{id}/storefront')
  public async getStorefront(@Path() id: string): Promise<DiscoveryStorefront> {
    return orgOfferingsService.storefront(this.resolvePublicOrganization(id))
  }

  /** A listed organisation by registry id or tenant id. Unlisted organisations, or ones with nothing to show, are not found here. */
  private resolvePublicOrganization(id: string): OrganizationRegistry {
    const key = String(id || '').trim()
    const org =
      organizationRegistryRepository.findOrganizationById(key) ||
      organizationRegistryRepository.findOrganizationByTenantId(key)
    if (!org || !orgOfferingsService.isDiscoverable(org)) {
      this.setStatus(404)
      throw new StatusException('Organisation not found', 404)
    }
    return org
  }
}

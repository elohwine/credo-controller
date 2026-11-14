/**
 * A connected system searches the same businesses a person sees on Discover.
 * The client must be registered with the `discover` operation. Sign-in clients
 * are not given it. The reply is the public match: no phone, no email, no tenant id.
 */
import type { Request as ExRequest } from 'express'

import { Body, Controller, Post, Request, Route, Tags } from 'tsoa'

import { StatusException } from '../../errors/StatusException'
import { orgOfferingsService, type MatchRequest, type ProviderMatch, type ProviderStanding } from '../../services/OrgOfferingsService'
import { PartnerVerificationService } from '../../services/partner/PartnerVerificationService'

export interface PartnerMatch {
  orgId: string
  name: string
  category: string
  serviceName?: string
  score: number
  reasons: string[]
  unsure: string[]
  standing: ProviderStanding
  offer?: string
  reviewAverage: number | null
  reviewCount: number
}

export function toPartnerMatch(match: ProviderMatch): PartnerMatch {
  return {
    orgId: match.orgId,
    name: match.name,
    category: match.category,
    ...(match.serviceName ? { serviceName: match.serviceName } : {}),
    score: match.score,
    reasons: match.reasons,
    unsure: match.unsure,
    standing: match.standing,
    ...(match.offer ? { offer: match.offer } : {}),
    reviewAverage: match.reviewAverage,
    reviewCount: match.reviewCount,
  }
}

@Route('api/partner/v1/discovery')
@Tags('Partner Discovery')
export class PartnerDiscoveryController extends Controller {
  /** Businesses that fit this request, best first. Same ranking as Discover. */
  @Post('search')
  public async search(@Request() request: ExRequest, @Body() body: MatchRequest): Promise<PartnerMatch[]> {
    const client = PartnerVerificationService.authenticateCaller(request.headers as Record<string, unknown>)
    if (!client) {
      this.setHeader('WWW-Authenticate', 'Basic realm="Credentis"')
      throw new StatusException('Sign in with the client id and secret.', 401)
    }
    if (!client.policy.operations.includes('discover')) {
      throw new StatusException('This client cannot search businesses.', 403)
    }
    return orgOfferingsService.match(body || {}).map(toPartnerMatch)
  }
}

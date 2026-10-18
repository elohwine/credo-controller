import type { Request as ExRequest } from 'express'
import type { WalletLoginStart } from '../../services/WalletLoginService'
import type { OrganizationEntryPoll } from '../../services/OrganizationEntryProofService'

import { Agent } from '@credo-ts/core'
import { Controller, Get, Header, Path, Post, Request, Route, Security, Tags } from 'tsoa'
import { container } from 'tsyringe'

import { AuthContext } from '../../enums'
import { StatusException } from '../../errors'
import { OrganizationService } from '../../services/OrganizationService'
import { OrganizationEntryProofService } from '../../services/OrganizationEntryProofService'

@Route('/api/organizations')
@Tags('Organizations')
export class OrganizationEntryController extends Controller {
  private personalSession(request: ExRequest): { userId: string; token: string } {
    const authenticated = request as ExRequest & { user?: { id?: string }; authContext?: string }
    const user = authenticated.user
    if (!user?.id || authenticated.authContext !== AuthContext.Personal) {
      throw new StatusException('Sign in to your personal wallet before entering an organisation', 403)
    }
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw new StatusException('Personal session required', 401)
    return { userId: user.id, token: authorization.slice(7) }
  }

  private service(): OrganizationEntryProofService {
    return new OrganizationEntryProofService(container.resolve(Agent), container.resolve(OrganizationService))
  }

  @Post('/{orgTenantId}/entry-proof')
  @Security('jwt')
  public async startEntry(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<WalletLoginStart> {
    const session = this.personalSession(request)
    return this.service().start(session.userId, orgTenantId, session.token)
  }

  @Get('/{orgTenantId}/entry-proof/{requestId}')
  @Security('jwt')
  public async pollEntry(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() requestId: string,
    @Header('x-login-poll-token') pollToken: string,
  ): Promise<OrganizationEntryPoll> {
    const session = this.personalSession(request)
    return this.service().poll(session.userId, orgTenantId, session.token, requestId, pollToken)
  }
}

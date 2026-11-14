import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { ageGateDemoService, type AgeGatePoll, type AgeGateStart } from '../../services/AgeGateDemoService'

/** Demonstration age check. The site learns only whether the person is 18 or over. */
@Route('api/public/demo/age-gate')
@Tags('Public')
export class AgeGateDemoController extends Controller {
  /**
   * Reissues the holder's PlatformIdentityCredential with a date of birth so it can disclose
   * "18 or over" to the demonstration site. `dateOfBirth` must be the real one for that wallet
   * (self-attested by the demo participant); nothing here invents one.
   */
  @Post('issue')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issue(
    @Request() request: ExRequest,
    @Body() body: { walletTenantId: string; dateOfBirth: string; displayName?: string },
  ): Promise<{ status: 'offered' }> {
    const orgTenantId = String((request as any).user?.tenantId || '').trim()
    if (!orgTenantId) throw new StatusException('Organization context required', 403)
    const walletTenantId = String(body?.walletTenantId || '').trim()
    if (!walletTenantId) throw new StatusException('walletTenantId is required', 400)
    const dateOfBirth = String(body?.dateOfBirth || '').trim()
    if (!dateOfBirth) throw new StatusException('dateOfBirth is required', 400)
    return ageGateDemoService.issue(orgTenantId, walletTenantId, dateOfBirth, body?.displayName)
  }

  @Post('start')
  public async start(): Promise<AgeGateStart> {
    return ageGateDemoService.start()
  }

  @Get('{requestId}')
  public async poll(@Path() requestId: string, @Query() pollToken: string): Promise<AgeGatePoll> {
    return ageGateDemoService.poll(requestId, pollToken)
  }
}

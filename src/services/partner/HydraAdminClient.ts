import { StatusException } from '../../errors'

/**
 * Minimal Ory Hydra admin client used to keep partner OAuth clients in step with the
 * Credentis partner registry. Disabled unless HYDRA_ADMIN_URL is set. The admin API must
 * only be reachable on the private network; HYDRA_ADMIN_TOKEN is sent when configured.
 */
export interface HydraClientInput {
  clientId: string
  clientName: string
  clientSecret: string
  redirectUris: string[]
  orgTenantId: string
}

export class HydraAdminClient {
  public constructor(
    private readonly baseUrl: string | undefined = process.env.HYDRA_ADMIN_URL,
    private readonly token: string | undefined = process.env.HYDRA_ADMIN_TOKEN,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public get enabled(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.trim())
  }

  public async createClient(input: HydraClientInput): Promise<void> {
    await this.call('POST', '/admin/clients', {
      client_id: input.clientId,
      client_name: input.clientName,
      client_secret: input.clientSecret,
      redirect_uris: input.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid offline_access profile email phone',
      token_endpoint_auth_method: 'client_secret_basic',
      metadata: { credentis_org_tenant_id: input.orgTenantId },
    })
  }

  public async patchClient(
    clientId: string,
    patch: Array<{ op: 'replace'; path: string; value: unknown }>,
  ): Promise<void> {
    await this.call('PATCH', `/admin/clients/${encodeURIComponent(clientId)}`, patch)
  }

  public async deleteClient(clientId: string): Promise<void> {
    await this.call('DELETE', `/admin/clients/${encodeURIComponent(clientId)}`, undefined, [404])
  }

  private async call(method: string, path: string, body?: unknown, allowedStatuses: number[] = []): Promise<void> {
    if (!this.enabled) return
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.token) headers.authorization = `Bearer ${this.token}`
    // Hydra outside --dev only accepts plain HTTP from its TLS-terminating network with this header.
    if (process.env.HYDRA_ADMIN_FORWARDED_PROTO) headers['x-forwarded-proto'] = process.env.HYDRA_ADMIN_FORWARDED_PROTO
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl!.replace(/\/+$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new StatusException('The sign-in service is unreachable; try again shortly', 502)
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new StatusException(`The sign-in service rejected the change (${response.status})`, 502)
    }
  }
}

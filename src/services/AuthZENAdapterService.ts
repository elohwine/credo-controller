import { createHash } from 'crypto'

import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'AuthZENAdapterService' })

/** Timeout for external authorization calls. Fail closed on timeout. */
const REQUEST_TIMEOUT_MS = 3_000

/** Maximum response body size to prevent memory exhaustion. */
const MAX_RESPONSE_BYTES = 64 * 1024

export interface AuthZENSubject {
  /** Opaque subject reference — never expose internal person IDs externally. */
  type: string
  id: string
  properties?: Record<string, unknown>
}

export interface AuthZENAction {
  name: string
}

export interface AuthZENResource {
  type: string
  id?: string
  properties?: Record<string, unknown>
}

export interface AuthZENContext {
  organizationId: string
  tenantId?: string
  amount?: number
  currency?: string
  departmentId?: string
}

export interface AuthZENEvaluationResult {
  decision: boolean
  reasonCode?: string
  policyVersion?: string
  latencyMs: number
}

/**
 * Calls an OpenID AuthZEN-compatible external authorization endpoint.
 *
 * The AuthZEN standard (OIDF AuthZEN WG) defines POST /access/v1/evaluations
 * with a JSON body:
 *   { subject, action, resource, context }
 *
 * The response is:
 *   { decision: true | false, context?: { reason_admin?: {...} } }
 *
 * This service:
 * - Times out after REQUEST_TIMEOUT_MS (fail-closed on timeout).
 * - Caps response body to MAX_RESPONSE_BYTES.
 * - Never logs subject identifiers or auth tokens.
 * - Returns decision=false on any transport/parse error.
 */
export class AuthZENAdapterService {
  public async evaluate(
    endpoint: string,
    tokenRef: string,
    subject: AuthZENSubject,
    action: AuthZENAction,
    resource: AuthZENResource,
    context?: AuthZENContext,
  ): Promise<AuthZENEvaluationResult> {
    const start = Date.now()

    // Validate endpoint is HTTPS
    try {
      const url = new URL(endpoint)
      if (url.protocol !== 'https:') {
        logger.warn({ endpoint: this.redactEndpoint(endpoint) }, 'AuthZEN endpoint must use HTTPS — denying')
        return { decision: false, reasonCode: 'authzen_endpoint_not_https', latencyMs: Date.now() - start }
      }
    } catch {
      logger.warn({ endpoint: this.redactEndpoint(endpoint) }, 'AuthZEN endpoint URL is invalid — denying')
      return { decision: false, reasonCode: 'authzen_endpoint_invalid_url', latencyMs: Date.now() - start }
    }

    const body = JSON.stringify({ subject, action, resource, context })
    const requestDigest = createHash('sha256').update(body).digest('hex').slice(0, 8)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef}`,
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timer)
      const latencyMs = Date.now() - start

      if (!response.ok) {
        logger.warn(
          { endpoint: this.redactEndpoint(endpoint), status: response.status, requestDigest },
          'AuthZEN endpoint returned non-2xx — denying',
        )
        return { decision: false, reasonCode: `authzen_http_${response.status}`, latencyMs }
      }

      const text = await this.readBoundedBody(response)
      const payload = JSON.parse(text) as Record<string, unknown>

      const decision = payload.decision === true
      const reasonCode = this.extractReasonCode(payload)
      const policyVersion = typeof payload.policy_version === 'string' ? payload.policy_version : undefined

      logger.info(
        { endpoint: this.redactEndpoint(endpoint), decision, reasonCode, latencyMs, requestDigest },
        'AuthZEN evaluation complete',
      )

      return { decision, reasonCode, policyVersion, latencyMs }
    } catch (err: unknown) {
      clearTimeout(timer)
      const latencyMs = Date.now() - start

      const isTimeout = err instanceof Error && err.name === 'AbortError'
      logger.warn(
        { endpoint: this.redactEndpoint(endpoint), isTimeout, latencyMs, requestDigest },
        'AuthZEN call failed — fail-closed deny',
      )
      return {
        decision: false,
        reasonCode: isTimeout ? 'authzen_timeout' : 'authzen_transport_error',
        latencyMs,
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  /** Reads up to MAX_RESPONSE_BYTES to prevent memory exhaustion. */
  private async readBoundedBody(response: Response): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) return await response.text()

    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value?.length ?? 0
      if (total > MAX_RESPONSE_BYTES) {
        reader.cancel()
        throw new Error('AuthZEN response body exceeds size limit')
      }
      if (value) chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  /** Strips sensitive path segments from endpoint URL for safe logging. */
  private redactEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint)
      return `${url.protocol}//${url.host}${url.pathname}`
    } catch {
      return '[invalid-url]'
    }
  }

  private extractReasonCode(payload: Record<string, unknown>): string | undefined {
    const ctx = payload.context
    if (!ctx || typeof ctx !== 'object') return undefined
    const admin = (ctx as Record<string, unknown>).reason_admin
    if (!admin || typeof admin !== 'object') return undefined
    const code = (admin as Record<string, unknown>).en
    return typeof code === 'string' ? code : undefined
  }
}

export const authZENAdapterService = new AuthZENAdapterService()

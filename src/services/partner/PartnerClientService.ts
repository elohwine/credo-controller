import crypto from 'crypto'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'

import { HydraAdminClient } from './HydraAdminClient'

/** Claims from the person's PlatformIdentityVC a partner may receive. Nothing else is released. */
export const RELEASABLE_IDENTITY_CLAIMS = ['displayName', 'verificationLevel', 'phone', 'email'] as const
export type ReleasableIdentityClaim = (typeof RELEASABLE_IDENTITY_CLAIMS)[number]

/** What a connected system may do. Fixed when the client is registered. */
export const PARTNER_CLIENT_OPERATIONS = ['sign_in', 'send_records'] as const
export type PartnerClientOperation = (typeof PARTNER_CLIENT_OPERATIONS)[number]

export interface PartnerClientPolicy {
  /** PlatformIdentityVC claims released to the partner. Contact details only when listed. */
  releaseClaims: ReleasableIdentityClaim[]
  /** `org_members`: only active members of the owning organisation may sign in. */
  audience: 'any' | 'org_members'
  operations: PartnerClientOperation[]
  /** Who may receive records it sends: active members only, or any registered Credentis user. */
  recipientScope: 'org_members' | 'any_registered'
}

export interface PartnerClient {
  clientId: string
  orgTenantId: string
  name: string
  redirectUris: string[]
  policy: PartnerClientPolicy
  status: 'active' | 'revoked'
  createdAt: string
  updatedAt: string
  secretRotatedAt: string | null
  revokedAt: string | null
}

export interface PartnerClientWithSecret extends PartnerClient {
  /** Shown once. Store it in the partner's secret store; it cannot be read again. */
  clientSecret: string
}

export interface PartnerClientInput {
  name: string
  /** Required when the client signs people in. */
  redirectUris?: string[]
  releaseClaims?: string[]
  audience?: string
  /** Defaults to `sign_in`. Cannot be changed later; register a new client instead. */
  operations?: string[]
  recipientScope?: string
}

interface PartnerClientRow {
  client_id: string
  org_tenant_id: string
  name: string
  secret_hash: string
  subject_salt: string
  redirect_uris: string
  policy: string
  status: string
  created_at: string
  updated_at: string
  secret_rotated_at: string | null
  revoked_at: string | null
}

const MAX_REDIRECT_URIS = 10
const DEFAULT_RELEASE: ReleasableIdentityClaim[] = ['displayName', 'verificationLevel']

export function hashSecret(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right)
}

function newSecret(): string {
  return `cs_${crypto.randomBytes(32).toString('base64url')}`
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function normaliseRedirectUris(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new StatusException('Add at least one redirect URI', 400)
  }
  if (input.length > MAX_REDIRECT_URIS) {
    throw new StatusException(`Use at most ${MAX_REDIRECT_URIS} redirect URIs`, 400)
  }
  const uris = input.map((raw) => {
    let url: URL
    try {
      url = new URL(String(raw).trim())
    } catch {
      throw new StatusException(`Redirect URI is not a valid URL: ${String(raw)}`, 400)
    }
    if (url.hash) throw new StatusException('Redirect URIs cannot contain a fragment', 400)
    if (url.username || url.password) throw new StatusException('Redirect URIs cannot contain credentials', 400)
    const secure = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname))
    if (!secure) throw new StatusException('Redirect URIs must use https (http only for localhost)', 400)
    return url.toString()
  })
  return [...new Set(uris)]
}

export function normaliseOperations(input: unknown): PartnerClientOperation[] {
  if (input === undefined) return ['sign_in']
  if (!Array.isArray(input) || input.length === 0) throw new StatusException('Choose at least one operation', 400)
  const operations = [...new Set(input.map((item) => String(item).trim()))]
  const unknown = operations.filter((item) => !(PARTNER_CLIENT_OPERATIONS as readonly string[]).includes(item))
  if (unknown.length > 0) throw new StatusException(`Unknown operations: ${unknown.join(', ')}`, 400)
  return operations as PartnerClientOperation[]
}

export function normalisePolicy(input: {
  releaseClaims?: unknown
  audience?: unknown
  operations?: unknown
  recipientScope?: unknown
}): PartnerClientPolicy {
  const requested = input.releaseClaims === undefined ? DEFAULT_RELEASE : input.releaseClaims
  if (!Array.isArray(requested)) throw new StatusException('releaseClaims must be a list', 400)
  const releaseClaims = [...new Set(requested.map((claim) => String(claim).trim()))]
  const unknown = releaseClaims.filter((claim) => !(RELEASABLE_IDENTITY_CLAIMS as readonly string[]).includes(claim))
  if (unknown.length > 0) {
    throw new StatusException(`These claims cannot be released: ${unknown.join(', ')}`, 400)
  }
  const audience = input.audience === undefined ? 'any' : String(input.audience)
  if (audience !== 'any' && audience !== 'org_members') {
    throw new StatusException('audience must be "any" or "org_members"', 400)
  }
  const recipientScope = input.recipientScope === undefined ? 'org_members' : String(input.recipientScope)
  if (recipientScope !== 'org_members' && recipientScope !== 'any_registered') {
    throw new StatusException('recipientScope must be "org_members" or "any_registered"', 400)
  }
  return {
    releaseClaims: releaseClaims as ReleasableIdentityClaim[],
    audience,
    operations: normaliseOperations(input.operations),
    recipientScope,
  }
}

/** Policies saved before connected-system operations existed sign people in only. */
export function storedPolicy(raw: string): PartnerClientPolicy {
  const parsed = JSON.parse(raw || '{}')
  return {
    releaseClaims: Array.isArray(parsed.releaseClaims) ? parsed.releaseClaims : DEFAULT_RELEASE,
    audience: parsed.audience === 'org_members' ? 'org_members' : 'any',
    operations: Array.isArray(parsed.operations) && parsed.operations.length ? parsed.operations : ['sign_in'],
    recipientScope: parsed.recipientScope === 'any_registered' ? 'any_registered' : 'org_members',
  }
}

export function canSignIn(client: { policy: PartnerClientPolicy }): boolean {
  return client.policy.operations.includes('sign_in')
}

/**
 * Partner clients an organisation registers for "Sign in with Credentis". Secrets are
 * returned once and stored hashed. When Hydra is configured the OAuth client is kept in
 * step; a revoked client is refused here even if Hydra could not be reached.
 */
export class PartnerClientService {
  public constructor(private readonly hydra: HydraAdminClient = new HydraAdminClient()) {}

  public list(orgTenantId: string): PartnerClient[] {
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT * FROM partner_clients WHERE org_tenant_id = ? ORDER BY created_at DESC')
      .all(orgTenantId) as PartnerClientRow[]
    return rows.map((row) => this.toClient(row))
  }

  public async create(
    orgTenantId: string,
    actorId: string,
    input: PartnerClientInput,
  ): Promise<PartnerClientWithSecret> {
    const name = String(input?.name || '').trim()
    if (!name || name.length > 120) throw new StatusException('Give the client a name (up to 120 characters)', 400)
    const policy = normalisePolicy({
      releaseClaims: input?.releaseClaims,
      audience: input?.audience,
      operations: input?.operations,
      recipientScope: input?.recipientScope,
    })
    const signIn = canSignIn({ policy })
    const redirectUris =
      signIn || (Array.isArray(input?.redirectUris) && input.redirectUris.length > 0)
        ? normaliseRedirectUris(input?.redirectUris)
        : []

    const clientId = `cred_${crypto.randomBytes(16).toString('hex')}`
    const clientSecret = newSecret()
    const now = new Date().toISOString()

    if (signIn) await this.hydra.createClient({ clientId, clientName: name, clientSecret, redirectUris, orgTenantId })
    try {
      DatabaseManager.getDatabase()
        .prepare(
          `INSERT INTO partner_clients (client_id, org_tenant_id, name, secret_hash, subject_salt, redirect_uris,
             policy, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          clientId,
          orgTenantId,
          name,
          hashSecret(clientSecret),
          crypto.randomBytes(32).toString('hex'),
          JSON.stringify(redirectUris),
          JSON.stringify(policy),
          actorId || null,
          now,
          now,
        )
    } catch (error) {
      if (signIn) await this.hydra.deleteClient(clientId).catch(() => undefined)
      throw error
    }
    return { ...this.toClient(this.requireRow(orgTenantId, clientId)), clientSecret }
  }

  public async update(
    orgTenantId: string,
    clientId: string,
    input: Partial<PartnerClientInput>,
  ): Promise<PartnerClient> {
    const row = this.requireActive(orgTenantId, clientId)
    const current = this.toClient(row)
    if (
      input?.operations !== undefined &&
      normaliseOperations(input.operations).sort().join() !== [...current.policy.operations].sort().join()
    ) {
      throw new StatusException('What a client can do is fixed. Register a new client instead.', 409)
    }
    const signIn = canSignIn(current)
    const redirectUris =
      input?.redirectUris === undefined || (!signIn && input.redirectUris.length === 0)
        ? current.redirectUris
        : normaliseRedirectUris(input.redirectUris)
    const policy = normalisePolicy({
      releaseClaims: input?.releaseClaims === undefined ? current.policy.releaseClaims : input.releaseClaims,
      audience: input?.audience === undefined ? current.policy.audience : input.audience,
      operations: current.policy.operations,
      recipientScope: input?.recipientScope === undefined ? current.policy.recipientScope : input.recipientScope,
    })
    const name = input?.name === undefined ? current.name : String(input.name).trim()
    if (!name || name.length > 120) throw new StatusException('Give the client a name (up to 120 characters)', 400)

    if (signIn) {
      await this.hydra.patchClient(clientId, [
        { op: 'replace', path: '/redirect_uris', value: redirectUris },
        { op: 'replace', path: '/client_name', value: name },
      ])
    }
    DatabaseManager.getDatabase()
      .prepare('UPDATE partner_clients SET name = ?, redirect_uris = ?, policy = ?, updated_at = ? WHERE client_id = ?')
      .run(name, JSON.stringify(redirectUris), JSON.stringify(policy), new Date().toISOString(), clientId)
    return this.toClient(this.requireRow(orgTenantId, clientId))
  }

  public async rotateSecret(orgTenantId: string, clientId: string): Promise<PartnerClientWithSecret> {
    const row = this.requireActive(orgTenantId, clientId)
    const clientSecret = newSecret()
    if (canSignIn(this.toClient(row))) {
      await this.hydra.patchClient(clientId, [{ op: 'replace', path: '/client_secret', value: clientSecret }])
    }
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare('UPDATE partner_clients SET secret_hash = ?, secret_rotated_at = ?, updated_at = ? WHERE client_id = ?')
      .run(hashSecret(clientSecret), now, now, clientId)
    return { ...this.toClient(this.requireRow(orgTenantId, clientId)), clientSecret }
  }

  /** Revoke locally first so verification stops at once, then remove the Hydra client. */
  public async revoke(
    orgTenantId: string,
    clientId: string,
    actorId: string,
  ): Promise<{ client: PartnerClient; hydraRemoved: boolean }> {
    const row = this.requireActive(orgTenantId, clientId)
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE partner_clients SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE client_id = ?`,
      )
      .run(now, actorId || null, now, clientId)
    let hydraRemoved = true
    try {
      if (canSignIn(this.toClient(row))) await this.hydra.deleteClient(clientId)
    } catch {
      hydraRemoved = false
    }
    return { client: this.toClient(this.requireRow(orgTenantId, clientId)), hydraRemoved }
  }

  /** The active client for a client id and secret, or undefined. */
  public authenticate(clientId: string, clientSecret: string): PartnerClientRecord | undefined {
    const row = this.activeRow(clientId)
    if (!row || !clientSecret || !sameHash(row.secret_hash, hashSecret(clientSecret))) return undefined
    return this.toRecord(row)
  }

  /** The active client for a client id, for callers already trusted (the hosted bridge). */
  public findActive(clientId: string): PartnerClientRecord | undefined {
    const row = this.activeRow(clientId)
    return row ? this.toRecord(row) : undefined
  }

  private activeRow(clientId: string): PartnerClientRow | undefined {
    if (!clientId) return undefined
    return DatabaseManager.getDatabase()
      .prepare(`SELECT * FROM partner_clients WHERE client_id = ? AND status = 'active'`)
      .get(clientId) as PartnerClientRow | undefined
  }

  private requireRow(orgTenantId: string, clientId: string): PartnerClientRow {
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT * FROM partner_clients WHERE client_id = ? AND org_tenant_id = ?')
      .get(clientId, orgTenantId) as PartnerClientRow | undefined
    if (!row) throw new StatusException('Partner client not found', 404)
    return row
  }

  private requireActive(orgTenantId: string, clientId: string): PartnerClientRow {
    const row = this.requireRow(orgTenantId, clientId)
    if (row.status !== 'active') throw new StatusException('This partner client has been revoked', 409)
    return row
  }

  private toRecord(row: PartnerClientRow): PartnerClientRecord {
    return { ...this.toClient(row), subjectSalt: row.subject_salt }
  }

  private toClient(row: PartnerClientRow): PartnerClient {
    return {
      clientId: row.client_id,
      orgTenantId: row.org_tenant_id,
      name: row.name,
      redirectUris: JSON.parse(row.redirect_uris),
      policy: storedPolicy(row.policy),
      status: row.status === 'active' ? 'active' : 'revoked',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      secretRotatedAt: row.secret_rotated_at,
      revokedAt: row.revoked_at,
    }
  }
}

/** Server-side view of a client, including the salt for pairwise subjects. Never returned to callers. */
export interface PartnerClientRecord extends PartnerClient {
  subjectSalt: string
}

export const partnerClientService = new PartnerClientService()

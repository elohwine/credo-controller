import type { Agent } from '@credo-ts/core'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { rootLogger } from '../../utils/pinoLogger'

import { statusListAllocatorService } from './StatusListAllocatorService'

const logger = rootLogger.child({ module: 'StatusListPublisherService' })

interface StatusListRow {
  id: string
  organization_id: string
  issuer_ref: string
  purpose: string
  list_size: number
  allocated_count: number
  status: string
  signed_vc_json: string | null
  published_at: string | null
}

export interface PublishResult {
  statusListId: string
  url: string
  published: boolean
}

/**
 * Builds and signs W3C BitstringStatusListCredential VCs for status lists.
 *
 * The signed VC is stored in `credential_status_lists.signed_vc_json` and
 * served from GET /status-lists/:id. Holders and verifiers dereference this
 * URL to check credential status.
 *
 * Signing uses Credo's W3C credentials API with the issuer's existing key.
 * If signing fails (e.g., issuer DID not found), the method throws so the
 * caller can decide whether to retry or serve a stale VC.
 */
export class StatusListPublisherService {
  /**
   * Builds, signs, and persists the BitstringStatusListCredential for a status
   * list. The `agent` must have access to the issuer DID's signing key.
   */
  public async publish(statusListId: string, agent: Agent<any>): Promise<PublishResult> {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`SELECT * FROM credential_status_lists WHERE id = ?`).get(statusListId) as
      | StatusListRow
      | undefined

    if (!row) throw new Error(`Status list not found: ${statusListId}`)

    const statusListUrl = statusListAllocatorService.buildStatusListUrl(statusListId)
    const encodedList = statusListAllocatorService.encodeList(
      statusListAllocatorService.buildBitstringBuffer(statusListId),
    )

    const issuanceDate = new Date().toISOString()

    // Locate the issuer's verification method (first Ed25519 key on the DID)
    const verificationMethod = await this.resolveVerificationMethod(agent, row.issuer_ref)

    // Build the unsigned W3C credential structure
    const credentialPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/vc/status-list/2021/v1'],
      id: statusListUrl,
      type: ['VerifiableCredential', 'BitstringStatusListCredential'],
      issuer: row.issuer_ref,
      issuanceDate,
      credentialSubject: {
        id: `${statusListUrl}#list`,
        type: 'BitstringStatusList',
        statusPurpose: row.purpose,
        encodedList,
      },
    }

    // Sign with Credo — result is a W3cJwtVerifiableCredential or JsonLd VC
    let signedVcJson: string
    try {
      const signResult = await (agent.w3cCredentials as any).signCredential({
        format: 'jwt_vc',
        credential: credentialPayload,
        verificationMethod,
        alg: 'EdDSA',
      })
      // Credo returns a W3cJwtVerifiableCredential; serialise to compact JWT string
      signedVcJson =
        typeof signResult === 'string' ? signResult : (signResult?.serializedJwt ?? JSON.stringify(signResult))
    } catch (err) {
      logger.error({ statusListId, issuerRef: row.issuer_ref, err }, 'Failed to sign status list VC')
      throw err
    }

    db.prepare(
      `UPDATE credential_status_lists
         SET signed_vc_json = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(signedVcJson, statusListId)

    logger.info({ statusListId, url: statusListUrl, purpose: row.purpose }, 'Status list published')
    return { statusListId, url: statusListUrl, published: true }
  }

  /**
   * Returns the stored signed VC for serving over HTTP.
   * Returns null when the status list has not been published yet or the signed
   * VC was invalidated by a status update.
   */
  public getSignedVc(statusListId: string): string | null {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`SELECT signed_vc_json FROM credential_status_lists WHERE id = ?`).get(statusListId) as
      | { signed_vc_json?: string | null }
      | undefined
    return row?.signed_vc_json ?? null
  }

  /**
   * Returns the stored signed VC, or builds and publishes one on-demand if
   * none exists. This is the path used by the HTTP endpoint.
   *
   * An agent is required for on-demand signing. Pass null to return only cached
   * values (useful when the agent is not available in the request context).
   */
  public async serveOrPublish(statusListId: string, agent: Agent<any> | null): Promise<string | null> {
    const cached = this.getSignedVc(statusListId)
    if (cached) return cached
    if (!agent) return null
    try {
      await this.publish(statusListId, agent)
      return this.getSignedVc(statusListId)
    } catch (err) {
      logger.warn({ statusListId, err }, 'On-demand status list publish failed')
      return null
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  private async resolveVerificationMethod(agent: Agent<any>, issuerDid: string): Promise<string> {
    try {
      const didsApi = (agent as any).dids
      if (didsApi) {
        const [didRecord] = await didsApi.getCreatedDids({ did: issuerDid })
        const vm = didRecord?.didDocument?.verificationMethod?.[0]?.id
        if (vm) return vm
      }
    } catch (err) {
      logger.warn({ issuerDid, err }, 'Could not resolve DID document for status list signing')
    }
    // Fallback: construct verification method from DID key fragment convention
    const fragment = issuerDid.split(':').pop() ?? issuerDid
    return `${issuerDid}#${fragment}`
  }
}

export const statusListPublisherService = new StatusListPublisherService()

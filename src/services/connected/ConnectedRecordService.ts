import crypto from 'crypto'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { auditService } from '../AuditService'
import { hashSecret, partnerClientService, sameHash, type PartnerClientRecord } from '../partner/PartnerClientService'
import { findWalletTenantByContact } from '../ssi/walletLookup'

import { offerLifecycleStatus, sendDirectRecord } from './directRecordOffer'
import { orgRecordTypeService, type OrgRecordTypeService } from './OrgRecordTypeService'

export const CONNECTED_RECORD_SOURCE = 'connected_system_record'

export type ConnectedRecordStatus =
  | 'processing'
  | 'failed'
  | 'pending'
  | 'accepted'
  | 'withdrawn'
  | 'resolved'
  | 'expired'

export interface SendConnectedRecordRequest {
  /** Record type the organisation defined, e.g. `TrainingCertificateRecord`. */
  credentialType: string
  recipient: { phone: string }
  claims: Record<string, unknown>
  /** Your own reference for this record (order, certificate or case number). */
  externalReference?: string
  title?: string
  message?: string
}

export interface ConnectedRecord {
  id: string
  status: ConnectedRecordStatus
  credentialType: string
  recordTypeVersion: number
  externalReference: string | null
  createdAt: string
  updatedAt: string
  acceptedAt: string | null
  expiresAt: string | null
  error: string | null
}

export interface ConnectedRecordActivity extends ConnectedRecord {
  clientId: string
  clientName: string
  /** Name of the record type at the version sent, so retired types still read correctly. */
  label: string
}

interface RequestRow {
  id: string
  org_tenant_id: string
  client_id: string
  idempotency_key: string
  request_hash: string
  credential_type: string
  record_type_version: number
  recipient_tenant_id: string
  offer_row_id: string | null
  external_reference: string | null
  status: string
  error_message: string | null
  created_at: string
  updated_at: string
  accepted_at?: string | null
  resolved_at?: string | null
  last_error?: string | null
  offer_expires_at?: string | null
  client_name?: string
  type_label?: string | null
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/
// A send that has not finished after this long crashed; the retry adopts any offer it made.
const STALE_PROCESSING_MS = 2 * 60 * 1000

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

/** Client id and secret from HTTP Basic. Connected systems never use the hosted bridge key. */
export function authenticateConnectedSystem(authorization: unknown): PartnerClientRecord | undefined {
  const header = String(authorization || '')
  if (!header.toLowerCase().startsWith('basic ')) return undefined
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator <= 0) return undefined
  return partnerClientService.authenticate(
    decodeURIComponent(decoded.slice(0, separator)),
    decodeURIComponent(decoded.slice(separator + 1)),
  )
}

type SendRecord = typeof sendDirectRecord

/**
 * Records an organisation's own software sends to people's wallets. One Idempotency-Key is
 * one logical send: a repeat returns the same record, a different payload is refused.
 */
export class ConnectedRecordService {
  public constructor(
    private readonly types: Pick<OrgRecordTypeService, 'validateClaims' | 'list'> = orgRecordTypeService,
    private readonly send: SendRecord = sendDirectRecord,
  ) {}

  public recordTypes(client: PartnerClientRecord) {
    this.requireSendRecords(client)
    return this.types.list(client.orgTenantId).map((type) => ({
      credentialType: type.credentialType,
      label: type.label,
      description: type.description,
      version: type.version,
      fields: type.fields,
    }))
  }

  public async submit(
    client: PartnerClientRecord,
    idempotencyKey: unknown,
    body: SendConnectedRecordRequest,
  ): Promise<{ record: ConnectedRecord; replayed: boolean }> {
    this.requireSendRecords(client)
    const key = String(idempotencyKey || '').trim()
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw new StatusException('Send an Idempotency-Key header (8-128 letters, digits, ".", "_", ":" or "-")', 400)
    }
    const input = this.normaliseInput(body)
    const requestHash = hashSecret(JSON.stringify(canonical(input)))
    const db = DatabaseManager.getDatabase()

    const existing = this.findByKey(client, key)
    if (existing) {
      if (!sameHash(existing.request_hash, requestHash)) {
        throw new StatusException('This Idempotency-Key was already used for a different record', 409)
      }
      if (!this.shouldResume(existing))
        return { record: this.view(this.requireRow(client, existing.id)), replayed: true }
    }

    const version = this.types.validateClaims(client.orgTenantId, input.credentialType, input.claims)
    const recipientTenantId = this.resolveRecipient(client, input.recipient.phone)
    const now = new Date().toISOString()

    let requestId = existing?.id
    if (!requestId) {
      requestId = crypto.randomUUID()
      const inserted = db
        .prepare(
          `INSERT OR IGNORE INTO integration_record_requests (id, org_tenant_id, client_id, idempotency_key, request_hash,
             credential_type, record_type_version, recipient_tenant_id, external_reference, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
        )
        .run(
          requestId,
          client.orgTenantId,
          client.clientId,
          key,
          requestHash,
          input.credentialType,
          version.version,
          recipientTenantId,
          input.externalReference,
          now,
          now,
        )
      if (!inserted.changes) {
        // A concurrent send with the same key won the insert.
        const raced = this.findByKey(client, key)!
        if (!sameHash(raced.request_hash, requestHash)) {
          throw new StatusException('This Idempotency-Key was already used for a different record', 409)
        }
        return { record: this.view(this.requireRow(client, raced.id)), replayed: true }
      }
    } else {
      db.prepare(
        `UPDATE integration_record_requests SET status = 'processing', error_message = NULL, record_type_version = ?,
           recipient_tenant_id = ?, updated_at = ? WHERE id = ?`,
      ).run(version.version, recipientTenantId, now, requestId)
    }

    const sourceId = `connected:${requestId}`
    const adopted = db
      .prepare(`SELECT id FROM wallet_pending_offers WHERE source_type = ? AND source_id = ? LIMIT 1`)
      .get(CONNECTED_RECORD_SOURCE, sourceId) as { id: string } | undefined
    try {
      const offerRowId =
        adopted?.id ||
        (
          await this.send({
            orgTenantId: client.orgTenantId,
            walletTenantId: recipientTenantId,
            credentialType: input.credentialType,
            claims: input.claims,
            title: input.title || `${version.label}`,
            body: input.message || 'Sent to you by your organisation. Add it to your records.',
            sourceType: CONNECTED_RECORD_SOURCE,
            sourceId,
            metadata: {
              connectedClientId: client.clientId,
              recordTypeVersion: version.version,
              externalReference: input.externalReference,
            },
          })
        ).rowId
      db.prepare(
        `UPDATE integration_record_requests SET status = 'offered', offer_row_id = ?, updated_at = ? WHERE id = ?`,
      ).run(offerRowId, new Date().toISOString(), requestId)
    } catch {
      db.prepare(
        `UPDATE integration_record_requests SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
      ).run(
        'The record could not be offered. Retry with the same Idempotency-Key.',
        new Date().toISOString(),
        requestId,
      )
    }

    void auditService.logAction({
      tenantId: client.orgTenantId,
      actionType: 'connected_record_sent',
      resourceId: requestId,
      details: { clientId: client.clientId, credentialType: input.credentialType, version: version.version },
    })
    return { record: this.view(this.requireRow(client, requestId)), replayed: Boolean(existing) }
  }

  public get(client: PartnerClientRecord, recordId: string): ConnectedRecord {
    this.requireSendRecords(client)
    return this.view(this.requireRow(client, recordId))
  }

  /** Recent sends across the organisation's connected systems, for its administrators. */
  public activity(orgTenantId: string, limit = 50): ConnectedRecordActivity[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(`${this.selectSql()} WHERE r.org_tenant_id = ? ORDER BY datetime(r.created_at) DESC LIMIT ?`)
      .all(orgTenantId, Math.max(1, Math.min(200, limit))) as RequestRow[]
    return rows.map((row) => ({
      ...this.view(row),
      clientId: row.client_id,
      clientName: row.client_name || (row.client_id === 'file-upload' ? 'File upload' : row.client_id),
      label: row.type_label || row.credential_type,
    }))
  }

  /** The checks a send makes before offering, without sending. Used to preview uploaded files. */
  public checkClaims(orgTenantId: string, credentialType: string, claims: Record<string, unknown>): void {
    this.types.validateClaims(orgTenantId, credentialType, claims)
  }

  public checkRecipient(client: PartnerClientRecord, phone: string): void {
    this.resolveRecipient(client, phone)
  }

  private requireSendRecords(client: PartnerClientRecord): void {
    if (!client.policy.operations.includes('send_records')) {
      throw new StatusException('This client is not registered to send records', 403)
    }
    const active = DatabaseManager.getDatabase()
      .prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(client.orgTenantId)
    if (!active) throw new StatusException('The organisation is not active', 403)
  }

  private normaliseInput(body: SendConnectedRecordRequest) {
    const credentialType = String(body?.credentialType || '').trim()
    if (!credentialType) throw new StatusException('credentialType is required', 400)
    const phone = String(body?.recipient?.phone || '').trim()
    if (phone.replace(/\D/g, '').length < 9) throw new StatusException('recipient.phone is required', 400)
    const claims = body?.claims
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
      throw new StatusException('claims object is required', 400)
    }
    const text = (value: unknown, max: number, field: string) => {
      if (value === undefined || value === null || value === '') return null
      const result = String(value).trim()
      if (result.length > max) throw new StatusException(`${field} is longer than ${max} characters`, 400)
      return result || null
    }
    return {
      credentialType,
      recipient: { phone },
      claims: claims as Record<string, unknown>,
      externalReference: text(body.externalReference, 120, 'externalReference'),
      title: text(body.title, 120, 'title'),
      message: text(body.message, 500, 'message'),
    }
  }

  private resolveRecipient(client: PartnerClientRecord, phone: string): string {
    const walletTenantId = findWalletTenantByContact(phone)
    const allowed =
      walletTenantId &&
      (client.policy.recipientScope === 'any_registered' ||
        DatabaseManager.getDatabase()
          .prepare(
            `SELECT 1 FROM ssi_users u JOIN org_memberships m ON m.user_id = u.id
              WHERE u.tenant_id = ? AND m.org_tenant_id = ? AND m.status = 'active' LIMIT 1`,
          )
          .get(walletTenantId, client.orgTenantId))
    if (!allowed) {
      throw new StatusException(
        client.policy.recipientScope === 'any_registered'
          ? 'No Credentis wallet is registered for this phone number'
          : 'This phone number does not belong to an active member of the organisation',
        422,
      )
    }
    return walletTenantId!
  }

  private shouldResume(row: RequestRow): boolean {
    if (row.status === 'failed') return true
    return row.status === 'processing' && Date.now() - new Date(row.updated_at).getTime() > STALE_PROCESSING_MS
  }

  private findByKey(client: PartnerClientRecord, key: string): RequestRow | undefined {
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT * FROM integration_record_requests WHERE org_tenant_id = ? AND client_id = ? AND idempotency_key = ?`,
      )
      .get(client.orgTenantId, client.clientId, key) as RequestRow | undefined
  }

  private selectSql(): string {
    return `SELECT r.*, w.accepted_at, w.resolved_at, w.last_error, pc.name AS client_name, rt.label AS type_label,
              COALESCE(json_extract(w.metadata, '$.offerExpiresAt'), datetime(w.created_at, '+30 days')) AS offer_expires_at
         FROM integration_record_requests r
         LEFT JOIN wallet_pending_offers w ON w.id = r.offer_row_id
         LEFT JOIN partner_clients pc ON pc.client_id = r.client_id
         LEFT JOIN org_record_types rt ON rt.org_tenant_id = r.org_tenant_id
              AND rt.credential_type = r.credential_type AND rt.version = r.record_type_version`
  }

  private requireRow(client: PartnerClientRecord, recordId: string): RequestRow {
    const row = DatabaseManager.getDatabase()
      .prepare(`${this.selectSql()} WHERE r.id = ? AND r.org_tenant_id = ? AND r.client_id = ?`)
      .get(recordId, client.orgTenantId, client.clientId) as RequestRow | undefined
    if (!row) throw new StatusException('Record not found', 404)
    return row
  }

  private view(row: RequestRow): ConnectedRecord {
    const offered = row.status === 'offered' && row.offer_row_id
    return {
      id: row.id,
      status: offered ? offerLifecycleStatus(row) : (row.status as ConnectedRecordStatus),
      credentialType: row.credential_type,
      recordTypeVersion: Number(row.record_type_version),
      externalReference: row.external_reference,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      acceptedAt: row.accepted_at || null,
      expiresAt: offered ? row.offer_expires_at || null : null,
      error: row.status === 'failed' ? row.error_message : null,
    }
  }
}

export const connectedRecordService = new ConnectedRecordService()

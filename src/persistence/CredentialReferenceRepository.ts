import { createHash, randomUUID } from 'crypto'

import { DatabaseManager } from './DatabaseManager'

export interface CredentialReferenceRecord {
  id: string
  organizationId: string
  subjectRef?: string
  credentialType: string
  issuerRef?: string
  format?: string
  externalRef?: string
  status: 'valid' | 'revoked' | 'suspended' | 'expired' | 'unknown'
  issuedAt?: string
  expiresAt?: string
  lastVerifiedAt?: string
  digest?: string
}

export interface UpsertCredentialReferenceInput {
  organizationId: string
  subjectRef?: string
  credentialType: string
  issuerRef?: string
  format?: string
  externalRef?: string
  status?: CredentialReferenceRecord['status']
  issuedAt?: string
  expiresAt?: string
  lastVerifiedAt?: string
  digest?: string
}

/**
 * Reference-first credential persistence. The repository deliberately has no
 * credential payload field: signed VCs, SD-JWTs and mdocs remain in the holder
 * wallet or protocol layer.
 */
export class CredentialReferenceRepository {
  public upsert(input: UpsertCredentialReferenceInput): CredentialReferenceRecord {
    const db = DatabaseManager.getDatabase()
    const id = randomUUID()
    const digest = input.digest ?? this.createReferenceDigest(input)

    db.prepare(`
      INSERT INTO credential_references (
        id, organization_id, subject_ref, credential_type, issuer_ref,
        format, external_ref, status, issued_at, expires_at,
        last_verified_at, digest
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject_ref = excluded.subject_ref,
        credential_type = excluded.credential_type,
        issuer_ref = excluded.issuer_ref,
        format = excluded.format,
        external_ref = excluded.external_ref,
        status = excluded.status,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at,
        last_verified_at = excluded.last_verified_at,
        digest = excluded.digest
    `).run(
      id,
      input.organizationId,
      input.subjectRef ?? null,
      input.credentialType,
      input.issuerRef ?? null,
      input.format ?? null,
      input.externalRef ?? null,
      input.status ?? 'unknown',
      input.issuedAt ?? null,
      input.expiresAt ?? null,
      input.lastVerifiedAt ?? null,
      digest
    )

    return {
      id,
      organizationId: input.organizationId,
      subjectRef: input.subjectRef,
      credentialType: input.credentialType,
      issuerRef: input.issuerRef,
      format: input.format,
      externalRef: input.externalRef,
      status: input.status ?? 'unknown',
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      lastVerifiedAt: input.lastVerifiedAt,
      digest,
    }
  }

  public create(input: UpsertCredentialReferenceInput): CredentialReferenceRecord {
    const db = DatabaseManager.getDatabase()
    const id = randomUUID()
    const digest = input.digest ?? this.createReferenceDigest(input)

    db.prepare(`
      INSERT INTO credential_references (
        id, organization_id, subject_ref, credential_type, issuer_ref,
        format, external_ref, status, issued_at, expires_at,
        last_verified_at, digest
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.organizationId,
      input.subjectRef ?? null,
      input.credentialType,
      input.issuerRef ?? null,
      input.format ?? null,
      input.externalRef ?? null,
      input.status ?? 'unknown',
      input.issuedAt ?? null,
      input.expiresAt ?? null,
      input.lastVerifiedAt ?? null,
      digest
    )

    return {
      id,
      organizationId: input.organizationId,
      subjectRef: input.subjectRef,
      credentialType: input.credentialType,
      issuerRef: input.issuerRef,
      format: input.format,
      externalRef: input.externalRef,
      status: input.status ?? 'unknown',
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      lastVerifiedAt: input.lastVerifiedAt,
      digest,
    }
  }

  public findById(organizationId: string, id: string): CredentialReferenceRecord | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT
        id, organization_id AS organizationId, subject_ref AS subjectRef,
        credential_type AS credentialType, issuer_ref AS issuerRef,
        format, external_ref AS externalRef, status,
        issued_at AS issuedAt, expires_at AS expiresAt,
        last_verified_at AS lastVerifiedAt, digest
      FROM credential_references
      WHERE organization_id = ? AND id = ?
      LIMIT 1
    `).get(organizationId, id) as CredentialReferenceRecord | undefined

    return row
  }

  public findForSubject(
    organizationId: string,
    subjectRef: string,
    credentialType?: string
  ): CredentialReferenceRecord[] {
    const db = DatabaseManager.getDatabase()
    const rows = db.prepare(`
      SELECT
        id, organization_id AS organizationId, subject_ref AS subjectRef,
        credential_type AS credentialType, issuer_ref AS issuerRef,
        format, external_ref AS externalRef, status,
        issued_at AS issuedAt, expires_at AS expiresAt,
        last_verified_at AS lastVerifiedAt, digest
      FROM credential_references
      WHERE organization_id = ?
        AND subject_ref = ?
        AND (? IS NULL OR credential_type = ?)
      ORDER BY created_at DESC
    `).all(organizationId, subjectRef, credentialType ?? null, credentialType ?? null) as CredentialReferenceRecord[]

    return rows
  }

  public updateStatus(
    organizationId: string,
    id: string,
    status: CredentialReferenceRecord['status'],
    verifiedAt = new Date().toISOString()
  ): boolean {
    const db = DatabaseManager.getDatabase()
    const result = db.prepare(`
      UPDATE credential_references
      SET status = ?, last_verified_at = ?
      WHERE organization_id = ? AND id = ?
    `).run(status, verifiedAt, organizationId, id)
    return result.changes === 1
  }

  private createReferenceDigest(input: UpsertCredentialReferenceInput): string {
    const canonical = JSON.stringify({
      organizationId: input.organizationId,
      subjectRef: input.subjectRef ?? null,
      credentialType: input.credentialType,
      issuerRef: input.issuerRef ?? null,
      format: input.format ?? null,
      externalRef: input.externalRef ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    return createHash('sha256').update(canonical).digest('hex')
  }
}

export const credentialReferenceRepository = new CredentialReferenceRepository()

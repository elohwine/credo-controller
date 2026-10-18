import crypto from 'crypto'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { schemaStore } from '../../utils/schemaStore'

export const RECORD_FIELD_TYPES = ['text', 'number', 'date', 'yes_no'] as const
export type RecordFieldType = (typeof RECORD_FIELD_TYPES)[number]

export interface RecordField {
  key: string
  label: string
  type: RecordFieldType
  required: boolean
}

export interface OrgRecordType {
  id: string
  credentialType: string
  label: string
  description: string | null
  version: number
  fields: RecordField[]
  status: 'active' | 'superseded' | 'retired'
  createdAt: string
  retiredAt: string | null
}

export interface OrgRecordTypeInput {
  label: string
  description?: string
  fields: Array<Partial<RecordField>>
}

interface OrgRecordTypeRow {
  id: string
  org_tenant_id: string
  credential_type: string
  label: string
  description: string | null
  version: number
  fields: string
  schema_id: string
  status: string
  created_at: string
  retired_at: string | null
}

const MAX_FIELDS = 20
const FIELD_KEY = /^[a-z][a-zA-Z0-9]{0,39}$/
const RESERVED_FIELD_KEYS = new Set(['id', 'type', 'issuer', 'holder', 'credentialStatus', 'proof', 'context'])
// Platform-owned meanings: an organisation-defined record must not look like identity,
// authority or a money/tax fact the platform establishes elsewhere.
const RESERVED_LABEL_WORDS =
  /\b(identity|identities|id card|credentis|platform|payment|payments|receipt|receipts|invoice|invoices|payout|settlement|fiscal|tax|delegation|authority|membership card|staff card)\b/i

/** "Training certificate" -> "TrainingCertificateRecord". */
export function credentialTypeForLabel(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')
  if (!/^[A-Z][A-Za-z0-9]*$/.test(pascal)) throw new StatusException('Give the record type a name with letters', 400)
  return pascal.endsWith('Record') ? pascal : `${pascal}Record`
}

export function normaliseRecordFields(input: unknown): RecordField[] {
  if (!Array.isArray(input) || input.length === 0) throw new StatusException('Add at least one field', 400)
  if (input.length > MAX_FIELDS) throw new StatusException(`Use at most ${MAX_FIELDS} fields`, 400)
  const seen = new Set<string>()
  return input.map((raw: any) => {
    const key = String(raw?.key || '').trim()
    const label = String(raw?.label || '').trim()
    const type = String(raw?.type || 'text') as RecordFieldType
    if (!FIELD_KEY.test(key)) {
      throw new StatusException(`Field key "${key}" must start with a lower-case letter and use letters or digits`, 400)
    }
    if (RESERVED_FIELD_KEYS.has(key)) throw new StatusException(`Field key "${key}" is reserved`, 400)
    if (seen.has(key)) throw new StatusException(`Field key "${key}" is used twice`, 400)
    seen.add(key)
    if (!label || label.length > 60) throw new StatusException(`Give field "${key}" a label (up to 60 characters)`, 400)
    if (!(RECORD_FIELD_TYPES as readonly string[]).includes(type)) {
      throw new StatusException(`Field "${key}" type must be one of ${RECORD_FIELD_TYPES.join(', ')}`, 400)
    }
    return { key, label, type, required: raw?.required !== false }
  })
}

export function jsonSchemaForRecord(
  orgTenantId: string,
  credentialType: string,
  version: number,
  fields: RecordField[],
): Record<string, any> {
  const property = (type: RecordFieldType) => {
    if (type === 'number') return { type: 'number' }
    if (type === 'yes_no') return { type: 'boolean' }
    if (type === 'date') return { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    return { type: 'string', minLength: 1, maxLength: 500 }
  }
  return {
    // Scoped per organisation: two organisations may define the same name with different fields.
    $id: `urn:credentis:record:${orgTenantId}:${credentialType}:${version}`,
    type: 'object',
    required: ['credentialSubject'],
    properties: {
      credentialSubject: {
        type: 'object',
        additionalProperties: false,
        required: fields.filter((field) => field.required).map((field) => field.key),
        properties: Object.fromEntries(
          fields.map((field) => [field.key, { title: field.label, ...property(field.type) }]),
        ),
      },
    },
  }
}

type RegisterModel = (
  orgTenantId: string,
  credentialType: string,
  version: number,
  jsonSchema: Record<string, any>,
) => Promise<string>

async function registerWithIssuer(
  orgTenantId: string,
  credentialType: string,
  version: number,
  jsonSchema: Record<string, any>,
): Promise<string> {
  const { getTenantById } = await import('../../persistence/TenantRepository')
  const issuerDid = getTenantById(orgTenantId)?.issuerDid
  if (!issuerDid) throw new StatusException('The organisation issuer is not ready yet. Try again shortly.', 409)
  const { registerRecordModels } = await import('../modelRegistry')
  const schemaIds = await registerRecordModels(orgTenantId, issuerDid, [
    { name: credentialType, jsonSchema, schemaVersion: `${version}.0.0` },
  ])
  return schemaIds[credentialType]
}

/**
 * Simple record types an organisation defines for its connected systems. Changing fields
 * publishes a new version; records already sent keep the version they were sent with.
 */
export class OrgRecordTypeService {
  public constructor(private readonly register: RegisterModel = registerWithIssuer) {}

  public list(orgTenantId: string, includeRetired = false): OrgRecordType[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT * FROM org_record_types WHERE org_tenant_id = ?
         AND ${includeRetired ? "status != 'superseded'" : "status = 'active'"}
         ORDER BY label COLLATE NOCASE`,
      )
      .all(orgTenantId) as OrgRecordTypeRow[]
    return rows.map((row) => this.toType(row))
  }

  public active(orgTenantId: string, credentialType: string): (OrgRecordType & { schemaId: string }) | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT * FROM org_record_types WHERE org_tenant_id = ? AND credential_type = ? AND status = 'active' LIMIT 1`,
      )
      .get(orgTenantId, credentialType) as OrgRecordTypeRow | undefined
    return row ? { ...this.toType(row), schemaId: row.schema_id } : undefined
  }

  public async create(orgTenantId: string, actorId: string, input: OrgRecordTypeInput): Promise<OrgRecordType> {
    const label = String(input?.label || '').trim()
    if (label.length < 3 || label.length > 60)
      throw new StatusException('Name the record type (3 to 60 characters)', 400)
    if (RESERVED_LABEL_WORDS.test(label)) {
      throw new StatusException(
        'That name describes something Credentis issues itself (identity, authority, payments, receipts or tax). Choose another name.',
        400,
      )
    }
    const credentialType = credentialTypeForLabel(label)
    const previous = DatabaseManager.getDatabase()
      .prepare(
        `SELECT MAX(version) AS version, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
           FROM org_record_types WHERE org_tenant_id = ? AND lower(credential_type) = lower(?)`,
      )
      .get(orgTenantId, credentialType) as { version: number | null; active: number | null }
    if (previous?.active)
      throw new StatusException('A record type with this name already exists. Edit it instead.', 409)
    // A retired type comes back as its next version, so earlier records keep their meaning.
    return this.publish(orgTenantId, actorId, credentialType, label, input, Number(previous?.version || 0) + 1)
  }

  /** Publish a new version with the given fields. The previous version stops being sent. */
  public async update(
    orgTenantId: string,
    actorId: string,
    credentialType: string,
    input: Partial<OrgRecordTypeInput>,
  ): Promise<OrgRecordType> {
    const current = this.active(orgTenantId, credentialType)
    if (!current) throw new StatusException('Record type not found', 404)
    return this.publish(
      orgTenantId,
      actorId,
      credentialType,
      current.label,
      {
        label: current.label,
        description: input?.description === undefined ? current.description || undefined : input.description,
        fields: input?.fields === undefined ? current.fields : input.fields,
      },
      current.version + 1,
    )
  }

  public retire(orgTenantId: string, credentialType: string): OrgRecordType {
    const current = this.active(orgTenantId, credentialType)
    if (!current) throw new StatusException('Record type not found', 404)
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(`UPDATE org_record_types SET status = 'retired', retired_at = ? WHERE id = ?`)
      .run(now, current.id)
    const { schemaId: _schemaId, ...type } = current
    return { ...type, status: 'retired', retiredAt: now }
  }

  /** Check claims against the active version; returns that version. */
  public validateClaims(orgTenantId: string, credentialType: string, claims: Record<string, unknown>): OrgRecordType {
    const type = this.active(orgTenantId, credentialType)
    if (!type) throw new StatusException('This record type is not set up for the organisation', 404)
    const result = schemaStore.validate(type.schemaId, { credentialSubject: claims })
    if (!result.valid) {
      const errors = (result.errors || [])
        .slice(0, 5)
        .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
        .join('; ')
      throw new StatusException(`Fields do not match the record type: ${errors || 'invalid fields'}`, 400)
    }
    const { schemaId: _schemaId, ...version } = type
    return version
  }

  private async publish(
    orgTenantId: string,
    actorId: string,
    credentialType: string,
    label: string,
    input: OrgRecordTypeInput,
    version: number,
  ): Promise<OrgRecordType> {
    const fields = normaliseRecordFields(input?.fields)
    const description =
      String(input?.description || '')
        .trim()
        .slice(0, 280) || null
    const schemaId = await this.register(
      orgTenantId,
      credentialType,
      version,
      jsonSchemaForRecord(orgTenantId, credentialType, version, fields),
    )
    if (!schemaId) throw new StatusException('The record type could not be registered', 500)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      db.prepare(
        `UPDATE org_record_types SET status = 'superseded', retired_at = ?
         WHERE org_tenant_id = ? AND credential_type = ? AND status = 'active'`,
      ).run(now, orgTenantId, credentialType)
      db.prepare(
        `INSERT INTO org_record_types (id, org_tenant_id, credential_type, label, description, version, fields,
           schema_id, status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      ).run(
        id,
        orgTenantId,
        credentialType,
        label,
        description,
        version,
        JSON.stringify(fields),
        schemaId,
        actorId || null,
        now,
      )
    })()
    return this.toType(db.prepare('SELECT * FROM org_record_types WHERE id = ?').get(id) as OrgRecordTypeRow)
  }

  private toType(row: OrgRecordTypeRow): OrgRecordType {
    return {
      id: row.id,
      credentialType: row.credential_type,
      label: row.label,
      description: row.description,
      version: Number(row.version),
      fields: JSON.parse(row.fields),
      status: row.status as OrgRecordType['status'],
      createdAt: row.created_at,
      retiredAt: row.retired_at,
    }
  }
}

export const orgRecordTypeService = new OrgRecordTypeService()

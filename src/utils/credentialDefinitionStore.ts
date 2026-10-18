import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'

export interface RegisterCredentialDefinitionRequest {
  name: string
  version: string
  schemaId: string
  issuerDid: string
  credentialType: string[]
  claimsTemplate?: Record<string, unknown>
  format?: 'jwt_vc' | 'sd_jwt' | 'jwt_vc_json' | 'jwt_vc_json-ld'
  tenantId?: string
}

export interface CredentialDefinitionStoreRecord extends RegisterCredentialDefinitionRequest {
  credentialDefinitionId: string
  createdAt: string
}

class CredentialDefinitionStore {
  public register(input: RegisterCredentialDefinitionRequest): CredentialDefinitionStoreRecord | { error: string } {
    const tenantId = input.tenantId || 'global'

    // Check if definition already exists for this tenant+name+version+issuer
    const existing = this.findByNameVersionIssuer(input.name, input.version, input.issuerDid, tenantId)
    if (existing) {
      return { error: 'Credential definition with name+version+issuer already exists for this tenant' }
    }

    const record: CredentialDefinitionStoreRecord = {
      credentialDefinitionId: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
      tenantId,
    }

    // Persist to database
    const db = DatabaseManager.getDatabase()
    const insert = db.prepare(`
      INSERT INTO credential_definitions 
      (id, tenant_id, credential_definition_id, schema_id, definition_data, issuer_did, tag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insert.run(
      randomUUID(),
      tenantId,
      record.credentialDefinitionId,
      record.schemaId,
      JSON.stringify({
        name: record.name,
        version: record.version,
        credentialType: record.credentialType,
        claimsTemplate: record.claimsTemplate,
        format: record.format,
      }),
      record.issuerDid,
      `${record.name}@${record.version}`,
      record.createdAt,
    )

    return record
  }

  public list(tenantId?: string): CredentialDefinitionStoreRecord[] {
    const db = DatabaseManager.getDatabase()
    const query = tenantId
      ? db.prepare('SELECT * FROM credential_definitions WHERE tenant_id = ? ORDER BY created_at DESC')
      : db.prepare('SELECT * FROM credential_definitions ORDER BY created_at DESC')

    const rows = (tenantId ? query.all(tenantId) : query.all()) as Array<{
      credential_definition_id: string
      schema_id: string
      definition_data: string
      issuer_did: string
      created_at: string
      tenant_id: string
    }>

    return rows.map((row) => {
      const data = JSON.parse(row.definition_data)
      return {
        credentialDefinitionId: row.credential_definition_id,
        schemaId: row.schema_id,
        issuerDid: row.issuer_did,
        createdAt: row.created_at,
        tenantId: row.tenant_id,
        ...data,
      }
    })
  }

  /**
   * Resolve a definition by id, config id or type name. Pass the issuing tenant so a type name
   * shared by several organisations resolves to that organisation's own definition (and DID).
   */
  public get(id: string, tenantId?: string): CredentialDefinitionStoreRecord | undefined {
    const db = DatabaseManager.getDatabase()

    // Strip common format suffixes that may be appended to the credential type name
    // e.g., "GenericIDCredential_jwt_vc_json" -> "GenericIDCredential"
    const formatSuffixes = [
      '_jwt_vc_json',
      '_jwt_vc_json-ld',
      '_vc+sd-jwt',
      '_ldp_vc',
      '_mso_mdoc',
      '_jwt_vc',
      '_sd_jwt',
    ]
    let baseId = id
    for (const suffix of formatSuffixes) {
      if (id.endsWith(suffix)) {
        baseId = id.slice(0, -suffix.length)
        break
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[CredDefStore] Looking up credential definition - original: "${id}", base: "${baseId}"`)

    // First try to find by credential_definition_id (UUID)
    let row = db.prepare('SELECT * FROM credential_definitions WHERE credential_definition_id = ?').get(id) as
      | {
          credential_definition_id: string
          schema_id: string
          definition_data: string
          issuer_did: string
          created_at: string
          tenant_id: string
        }
      | undefined

    // If not found, try with the base ID (without format suffix)
    if (!row && baseId !== id) {
      row = db
        .prepare('SELECT * FROM credential_definitions WHERE credential_definition_id = ?')
        .get(baseId) as typeof row
    }

    if (!row && tenantId) {
      row = db
        .prepare(
          `
        SELECT * FROM credential_definitions
        WHERE tenant_id = ?
          AND (json_extract(definition_data, '$.name') = ? OR json_extract(definition_data, '$.credentialType') LIKE ?)
        ORDER BY created_at DESC
        LIMIT 1
      `,
        )
        .get(tenantId, baseId, `%"${baseId}"%`) as typeof row
    }

    // If not found, try to find by credential type name in the definition_data using base ID
    if (!row) {
      // SQLite json_extract to search in the credentialType array
      row = db
        .prepare(
          `
        SELECT * FROM credential_definitions 
        WHERE json_extract(definition_data, '$.credentialType') LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
        )
        .get(`%"${baseId}"%`) as typeof row
    }

    // Also try by name field using base ID
    if (!row) {
      row = db
        .prepare(
          `
        SELECT * FROM credential_definitions 
        WHERE json_extract(definition_data, '$.name') = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
        )
        .get(baseId) as typeof row
    }

    if (!row) {
      // eslint-disable-next-line no-console
      console.log(`[CredDefStore] No credential definition found for: "${id}" (base: "${baseId}")`)
      return undefined
    }

    // eslint-disable-next-line no-console
    console.log(`[CredDefStore] Found credential definition: ${row.credential_definition_id}`)

    const data = JSON.parse(row.definition_data)
    return {
      credentialDefinitionId: row.credential_definition_id,
      schemaId: row.schema_id,
      issuerDid: row.issuer_did,
      createdAt: row.created_at,
      tenantId: row.tenant_id,
      ...data,
    }
  }

  public findBySchema(schemaId: string, tenantId?: string): CredentialDefinitionStoreRecord[] {
    const db = DatabaseManager.getDatabase()
    const query = tenantId
      ? db.prepare('SELECT * FROM credential_definitions WHERE schema_id = ? AND tenant_id = ?')
      : db.prepare('SELECT * FROM credential_definitions WHERE schema_id = ?')

    const rows = (tenantId ? query.all(schemaId, tenantId) : query.all(schemaId)) as Array<{
      credential_definition_id: string
      schema_id: string
      definition_data: string
      issuer_did: string
      created_at: string
      tenant_id: string
    }>

    return rows.map((row) => {
      const data = JSON.parse(row.definition_data)
      return {
        credentialDefinitionId: row.credential_definition_id,
        schemaId: row.schema_id,
        issuerDid: row.issuer_did,
        createdAt: row.created_at,
        tenantId: row.tenant_id,
        ...data,
      }
    })
  }

  private findByNameVersionIssuer(
    name: string,
    version: string,
    issuerDid: string,
    tenantId: string,
  ): CredentialDefinitionStoreRecord | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `
      SELECT * FROM credential_definitions 
      WHERE tenant_id = ? AND issuer_did = ? AND json_extract(definition_data, '$.name') = ? AND json_extract(definition_data, '$.version') = ?
    `,
      )
      .get(tenantId, issuerDid, name, version) as
      | {
          credential_definition_id: string
          schema_id: string
          definition_data: string
          issuer_did: string
          created_at: string
          tenant_id: string
        }
      | undefined

    if (!row) return undefined

    const data = JSON.parse(row.definition_data)
    return {
      credentialDefinitionId: row.credential_definition_id,
      schemaId: row.schema_id,
      issuerDid: row.issuer_did,
      createdAt: row.created_at,
      tenantId: row.tenant_id,
      ...data,
    }
  }
}

export const credentialDefinitionStore = new CredentialDefinitionStore()

/**
 * Credential types issued with selective disclosure (IETF SD-JWT VC, format `vc+sd-jwt`).
 * Each claim is its own disclosure, so a share for one step reveals only the details the
 * request names (organisation, role, status, steps) and keeps the rest on the phone.
 * The staff card (EmployeeCredential) and the role card (OrgWorkflowActorCredential) are
 * the two cards people present at job and request steps.
 */
export const SELECTIVE_DISCLOSURE_VC_TYPES = ['EmployeeCredential', 'OrgWorkflowActorCredential'] as const

export const SD_JWT_CONFIG_SUFFIX = '_vc+sd-jwt'
export const JWT_VC_JSON_CONFIG_SUFFIX = '_jwt_vc_json'

export function isSelectiveDisclosureVcType(credentialType: string | undefined | null): boolean {
  return (SELECTIVE_DISCLOSURE_VC_TYPES as readonly string[]).includes(String(credentialType || ''))
}

/**
 * Disclosure frame for an SD-JWT card. Each ordinary claim is one disclosure.
 * A list of steps is disclosed one step at a time, so a request can ask for a
 * single step and the rest of the list stays on the phone.
 */
export function sdJwtDisclosureFrame(claims: Record<string, unknown>): Record<string, unknown> {
  const scalars: string[] = []
  const frame: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(claims)) {
    if (Array.isArray(value) && value.length > 0 && value.every((item) => item == null || typeof item !== 'object')) {
      frame[key] = { _sd: value.map((_, index) => index) }
      continue
    }
    scalars.push(key)
  }
  if (scalars.length > 0) frame._sd = scalars
  return frame
}

/** Issuer credential-configuration id used when offering `credentialType`. */
export function issuerConfigurationIdFor(credentialType: string): string {
  return `${credentialType}${isSelectiveDisclosureVcType(credentialType) ? SD_JWT_CONFIG_SUFFIX : JWT_VC_JSON_CONFIG_SUFFIX}`
}

/**
 * Credential configurations advertised by the issuer for one definition. Every definition is
 * offered as `jwt_vc_json`; selective-disclosure types are also offered as `vc+sd-jwt` with a
 * `vct` equal to the credential type so the holder stores an SD-JWT record.
 */
export function issuerConfigurationsForDefinition(def: {
  name: string
  credentialType?: string[]
  format?: string
}): Array<Record<string, unknown> & { id: string; format: string }> {
  const leafType =
    Array.isArray(def.credentialType) && def.credentialType.length
      ? def.credentialType[def.credentialType.length - 1]
      : def.name
  const idBases = Array.from(new Set([def.name, leafType].filter(Boolean)))
  const common = {
    cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:jwk'],
    credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
    proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] } },
  }

  return idBases.flatMap((base) => {
    const jwtId = `${base}${JWT_VC_JSON_CONFIG_SUFFIX}`
    const configs: Array<Record<string, unknown> & { id: string; format: string }> = [
      {
        id: jwtId,
        format: 'jwt_vc_json',
        scope: base,
        ...common,
        credential_definition: { type: def.credentialType || ['VerifiableCredential', base] },
        display: [{ name: base, locale: 'en-US' }],
      },
    ]
    if (isSelectiveDisclosureVcType(base) || def.format === 'sd_jwt') {
      const sdId = `${base}${SD_JWT_CONFIG_SUFFIX}`
      configs.push({
        id: sdId,
        format: 'vc+sd-jwt',
        scope: `${base}:sd`,
        vct: base,
        ...common,
        display: [{ name: base, locale: 'en-US' }],
      })
    }
    return configs
  })
}

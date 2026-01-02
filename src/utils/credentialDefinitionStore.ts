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

export interface CredentialDefinitionRecord extends RegisterCredentialDefinitionRequest {
  credentialDefinitionId: string
  createdAt: string
}

class CredentialDefinitionStore {
  public register(input: RegisterCredentialDefinitionRequest): CredentialDefinitionRecord | { error: string } {
    const tenantId = input.tenantId || 'global'

    // Check if definition already exists for this tenant+name+version+issuer
    const existing = this.findByNameVersionIssuer(input.name, input.version, input.issuerDid, tenantId)
    if (existing) {
      return { error: 'Credential definition with name+version+issuer already exists for this tenant' }
    }

    const record: CredentialDefinitionRecord = {
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
      record.createdAt
    )

    return record
  }

  public list(tenantId?: string): CredentialDefinitionRecord[] {
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

  public get(id: string): CredentialDefinitionRecord | undefined {
    const db = DatabaseManager.getDatabase()

    // Strip common format suffixes that may be appended to the credential type name
    // e.g., "GenericIDCredential_jwt_vc_json" -> "GenericIDCredential"
    const formatSuffixes = ['_jwt_vc_json', '_jwt_vc_json-ld', '_vc+sd-jwt', '_ldp_vc', '_mso_mdoc', '_jwt_vc', '_sd_jwt']
    let baseId = id
    for (const suffix of formatSuffixes) {
      if (id.endsWith(suffix)) {
        baseId = id.slice(0, -suffix.length)
        break
      }
    }

    console.log(`[CredDefStore] Looking up credential definition - original: "${id}", base: "${baseId}"`)

    // First try to find by credential_definition_id (UUID)
    let row = db.prepare('SELECT * FROM credential_definitions WHERE credential_definition_id = ?')
      .get(id) as {
        credential_definition_id: string
        schema_id: string
        definition_data: string
        issuer_did: string
        created_at: string
        tenant_id: string
      } | undefined

    // If not found, try with the base ID (without format suffix)
    if (!row && baseId !== id) {
      row = db.prepare('SELECT * FROM credential_definitions WHERE credential_definition_id = ?')
        .get(baseId) as typeof row
    }

    // If not found, try to find by credential type name in the definition_data using base ID
    if (!row) {
      // SQLite json_extract to search in the credentialType array
      row = db.prepare(`
        SELECT * FROM credential_definitions 
        WHERE json_extract(definition_data, '$.credentialType') LIKE ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(`%"${baseId}"%`) as typeof row
    }

    // Also try by name field using base ID
    if (!row) {
      row = db.prepare(`
        SELECT * FROM credential_definitions 
        WHERE json_extract(definition_data, '$.name') = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(baseId) as typeof row
    }

    if (!row) {
      console.log(`[CredDefStore] No credential definition found for: "${id}" (base: "${baseId}")`)
      return undefined
    }

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

  public findBySchema(schemaId: string, tenantId?: string): CredentialDefinitionRecord[] {
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
    tenantId: string
  ): CredentialDefinitionRecord | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT * FROM credential_definitions 
      WHERE tenant_id = ? AND issuer_did = ? AND json_extract(definition_data, '$.name') = ? AND json_extract(definition_data, '$.version') = ?
    `).get(tenantId, issuerDid, name, version) as {
      credential_definition_id: string
      schema_id: string
      definition_data: string
      issuer_did: string
      created_at: string
      tenant_id: string
    } | undefined

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

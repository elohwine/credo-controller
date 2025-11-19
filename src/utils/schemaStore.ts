import type { ErrorObject } from 'ajv'

import Ajv2020 from 'ajv/dist/2020'
import { randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'

export interface RegisterSchemaRequest {
  name: string
  version: string
  jsonSchema: Record<string, any>
  tenantId?: string
}

export interface RegisteredSchema extends RegisterSchemaRequest {
  schemaId: string
  createdAt: string
}

class SchemaStore {
  private ajv = new Ajv2020({ allErrors: true, strict: false })

  public register(input: RegisterSchemaRequest): RegisteredSchema | { error: string } {
    try {
      this.ajv.compile(input.jsonSchema)
    } catch (e: any) {
      return { error: 'Invalid JSON Schema: ' + e.message }
    }
    
    const tenantId = input.tenantId || 'global'
    const existing = this.find(input.name, input.version, tenantId)
    if (existing) {
      return { error: 'Schema with name+version already exists for this tenant' }
    }
    
    const schema: RegisteredSchema = {
      schemaId: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    }
    
    // Persist to database
    const db = DatabaseManager.getDatabase()
    const insert = db.prepare(`
      INSERT INTO json_schemas (id, tenant_id, schema_id, schema_data, name, version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    insert.run(
      randomUUID(),
      tenantId,
      schema.schemaId,
      JSON.stringify(schema.jsonSchema),
      schema.name,
      schema.version,
      schema.createdAt
    )
    
    return schema
  }

  public list(tenantId?: string): RegisteredSchema[] {
    const db = DatabaseManager.getDatabase()
    const query = tenantId
      ? db.prepare('SELECT * FROM json_schemas WHERE tenant_id = ? ORDER BY created_at DESC')
      : db.prepare('SELECT * FROM json_schemas ORDER BY created_at DESC')
    
    const rows = (tenantId ? query.all(tenantId) : query.all()) as Array<{
      schema_id: string
      schema_data: string
      name: string
      version: string
      created_at: string
      tenant_id: string
    }>
    
    return rows.map((row) => ({
      schemaId: row.schema_id,
      name: row.name,
      version: row.version,
      jsonSchema: JSON.parse(row.schema_data),
      createdAt: row.created_at,
      tenantId: row.tenant_id,
    }))
  }

  public get(schemaId: string): RegisteredSchema | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT * FROM json_schemas WHERE schema_id = ?').get(schemaId) as {
      schema_id: string
      schema_data: string
      name: string
      version: string
      created_at: string
      tenant_id: string
    } | undefined
    
    if (!row) return undefined
    
    return {
      schemaId: row.schema_id,
      name: row.name,
      version: row.version,
      jsonSchema: JSON.parse(row.schema_data),
      createdAt: row.created_at,
      tenantId: row.tenant_id,
    }
  }

  public find(name: string, version: string, tenantId?: string): RegisteredSchema | undefined {
    const db = DatabaseManager.getDatabase()
    const tid = tenantId || 'global'
    const row = db.prepare('SELECT * FROM json_schemas WHERE name = ? AND version = ? AND tenant_id = ?')
      .get(name, version, tid) as {
        schema_id: string
        schema_data: string
        name: string
        version: string
        created_at: string
        tenant_id: string
      } | undefined
    
    if (!row) return undefined
    
    return {
      schemaId: row.schema_id,
      name: row.name,
      version: row.version,
      jsonSchema: JSON.parse(row.schema_data),
      createdAt: row.created_at,
      tenantId: row.tenant_id,
    }
  }

  public validate(schemaId: string, data: any): { valid: boolean; errors?: ErrorObject[] } {
    const schema = this.get(schemaId)
    if (!schema)
      return {
        valid: false,
        errors: [
          { keyword: 'notFound', instancePath: '', schemaPath: '', params: {}, message: 'schema not found' },
        ] as any,
      }
    const validate = this.ajv.compile(schema.jsonSchema)
    const valid = validate(data)
    return { valid: !!valid, errors: validate.errors || undefined }
  }
}

export const schemaStore = new SchemaStore()

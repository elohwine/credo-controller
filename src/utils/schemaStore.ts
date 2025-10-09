import type { ErrorObject } from 'ajv'

import Ajv2020 from 'ajv/dist/2020'
import { randomUUID } from 'crypto'

export interface RegisterSchemaRequest {
  name: string
  version: string
  jsonSchema: Record<string, any>
}

export interface RegisteredSchema extends RegisterSchemaRequest {
  schemaId: string
  createdAt: string
}

class SchemaStore {
  private schemas: RegisteredSchema[] = []
  private ajv = new Ajv2020({ allErrors: true, strict: false })

  public register(input: RegisterSchemaRequest): RegisteredSchema | { error: string } {
    try {
      this.ajv.compile(input.jsonSchema)
    } catch (e: any) {
      return { error: 'Invalid JSON Schema: ' + e.message }
    }
    const existing = this.schemas.find((s) => s.name === input.name && s.version === input.version)
    if (existing) {
      return { error: 'Schema with name+version already exists' }
    }
    const schema: RegisteredSchema = {
      schemaId: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    }
    this.schemas.push(schema)
    return schema
  }

  public list() {
    return [...this.schemas]
  }
  public get(schemaId: string) {
    return this.schemas.find((s) => s.schemaId === schemaId)
  }
  public find(name: string, version: string) {
    return this.schemas.find((s) => s.name === name && s.version === version)
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

import { randomUUID } from 'crypto'

export interface RegisterCredentialDefinitionRequest {
  name: string
  version: string
  schemaId: string
  issuerDid: string
  credentialType: string[]
  claimsTemplate?: Record<string, unknown>
  format?: 'jwt_vc' | 'sd_jwt'
}

export interface CredentialDefinitionRecord extends RegisterCredentialDefinitionRequest {
  credentialDefinitionId: string
  createdAt: string
}

class CredentialDefinitionStore {
  private defs: CredentialDefinitionRecord[] = []

  public register(input: RegisterCredentialDefinitionRequest): CredentialDefinitionRecord | { error: string } {
    const exists = this.defs.find((def) => def.name === input.name && def.version === input.version)
    if (exists) {
      return { error: 'Credential definition with name+version already exists' }
    }
    const record: CredentialDefinitionRecord = {
      credentialDefinitionId: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    }
    this.defs.push(record)
    return record
  }

  public list(): CredentialDefinitionRecord[] {
    return [...this.defs]
  }

  public get(id: string): CredentialDefinitionRecord | undefined {
    return this.defs.find((def) => def.credentialDefinitionId === id)
  }

  public findBySchema(schemaId: string): CredentialDefinitionRecord[] {
    return this.defs.filter((def) => def.schemaId === schemaId)
  }
}

export const credentialDefinitionStore = new CredentialDefinitionStore()

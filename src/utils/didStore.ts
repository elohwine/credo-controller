export interface StoredDidRecord {
  did: string
  method: string
  keyRef: string
  createdAt: string
  type: 'key' | 'jwk' | 'web'
  didDocument?: any
  // Optional helpers for resolving signing keys from wallet
  publicKeyBase58?: string
  keyType?: 'Ed25519' | 'P-256'
}

class InMemoryDidStore {
  private records: StoredDidRecord[] = []

  public save(record: StoredDidRecord) {
    this.records.push(record)
  }

  public list() {
    return [...this.records]
  }

  public find(did: string) {
    return this.records.find((r) => r.did === did)
  }
}

export const didStore = new InMemoryDidStore()

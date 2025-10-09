import type { JWK } from 'jose'

import { createHash, randomUUID } from 'crypto'
import { importJWK, SignJWT } from 'jose'

// Simple in-memory dev-mode KMS. Replace with Vault/HSM integration later.

interface StoredKey {
  id: string
  type: 'ed25519' | 'jwk'
  privateKey: any
}

class DevKmsStore {
  private keys: Record<string, StoredKey> = {}
  private primary?: string

  public storeEd25519PrivateKey(raw: Buffer): string {
    const id = 'ed25519-' + randomUUID()
    this.keys[id] = { id, type: 'ed25519', privateKey: raw }
    this.primary ||= id
    return id
  }

  public storeJwkPrivateKey(jwk: any): string {
    const thumbprint = createHash('sha256').update(JSON.stringify(jwk)).digest('hex').slice(0, 16)
    const id = 'jwk-' + thumbprint
    this.keys[id] = { id, type: 'jwk', privateKey: jwk }
    this.primary ||= id
    return id
  }

  /**
   * Store a private JWK under a specific id (e.g., a DID URL verificationMethod id) for dev/testing.
   * WARNING: For development use only; do not persist raw keys in production.
   */
  public storePrivateJwkWithId(id: string, jwk: any): string {
    this.keys[id] = { id, type: 'jwk', privateKey: jwk }
    this.primary ||= id
    return id
  }

  public primaryKeyRef(): string | undefined {
    return this.primary
  }

  public signDetached(message: string): string {
    // Placeholder: NOT cryptographically secure. Replace with real signing using stored key material.
    return createHash('sha256').update(message).digest('base64url')
  }

  /**
   * Return stored private JWK for a given keyRef.
   */
  public getPrivateJwk(keyRef: string): JWK | undefined {
    const entry = this.keys[keyRef]
    if (!entry) return undefined
    if (entry.type !== 'jwk') return undefined
    return entry.privateKey as JWK
  }

  /**
   * Sign a JWT payload using a stored JWK private key via jose.
   * - Determines algorithm from the JWK (OKP/Ed25519 -> EdDSA, EC/P-256 -> ES256)
   * - Sets provided protected header fields (alg, kid, typ) if present, otherwise infers alg
   */
  public async signJwtWithJwk(
    keyRef: string,
    payload: Record<string, any>,
    protectedHeader: Partial<{ alg: string; kid: string; typ: string }>,
  ): Promise<string> {
    const jwk = this.getPrivateJwk(keyRef)
    if (!jwk) throw new Error(`No private JWK found for keyRef ${keyRef}`)

    let alg = protectedHeader.alg
    if (!alg) {
      if (jwk.kty === 'OKP' && (jwk as any).crv === 'Ed25519') alg = 'EdDSA'
      else if (jwk.kty === 'EC' && (jwk as any).crv === 'P-256') alg = 'ES256'
      else throw new Error('Unsupported JWK for JWT signing')
    }

    const keyLike = await importJWK(jwk as any, alg)
    const builder = new SignJWT(payload).setProtectedHeader({
      alg,
      ...(protectedHeader.kid ? { kid: protectedHeader.kid } : {}),
      typ: protectedHeader.typ || 'JWT',
    })

    // If iat/nbf/jti provided in payload, jose will include as-is; users should set beforehand.
    return await builder.sign(keyLike)
  }
}

export const kmsStore = new DevKmsStore()

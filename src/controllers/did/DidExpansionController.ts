import type { DidCreateResponse, CreateDidJwkRequest, PrepareDidWebRequest } from '../../types/api'
import type { Request as ExRequest } from 'express'

import { KeyType, TypedArrayEncoder } from '@credo-ts/core'
import bs58 from 'bs58'
import { JWK } from 'jose'
import { Controller, Post, Get, Route, Tags, Body, SuccessResponse, Security, Request, Path } from 'tsoa'

import { didStore } from '../../utils/didStore'

// Use request-scoped Pino logger attached by middleware

interface CreateDidKeyRequest {
  keyType?: 'Ed25519'
}

/**
 * DID Expansion Controller
 *
 * Provides lightweight endpoints to create and prepare DID methods beyond the legacy DIDComm controller set.
 * Methods supported:
 *  - did:key (Ed25519)
 *  - did:jwk (Ed25519, P-256 public keys encoded as JWK -> method-specific id = base64url(JWK))
 *  - did:web (prepare only: returns document + publish instructions, stores record)
 *
 * Design choices:
 *  - All key material generated via agent wallet (Askar) – no raw private keys returned
 *  - In-memory persistence via didStore (dev only)
 *  - For did:web we store record immediately even before remote publish so issuance flows can reference the DID
 *  - Verification endpoint fetches remote did.json for simple id match (extend later for hash/content integrity)
 */
@Route('dids')
@Tags('DID-Methods')
export class DidExpansionController extends Controller {
  @Post('create-key')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createDidKey(
    @Request() request: ExRequest,
    @Body() body: CreateDidKeyRequest,
  ): Promise<DidCreateResponse> {
    // Only Ed25519 supported; ignoring body.keyType for now
    // Use agent.dids.create so private key stays in Askar wallet managed by Credo
    const keyType = KeyType.Ed25519 // Only Ed25519 supported here per prompt
    const didCreate = await request.agent.dids.create({
      method: 'key',
      options: { keyType },
    })
    if (didCreate.didState.state !== 'finished') {
      this.setStatus(500)
      throw new Error('failed to create did:key')
    }
    const { did, didDocument } = didCreate.didState
    // Key ref: store fingerprint (last segment) for later signing lookup
    const vm = didDocument?.verificationMethod?.[0]
    const keyRef = vm?.id || did + '#key-1'
    // Try to derive base58 public key for convenience
    const publicKeyBase58: string | undefined = (vm as any)?.publicKeyBase58
    const createdAt = new Date().toISOString()
    const didDocumentJson = didDocument?.toJSON?.() || didDocument
    didStore.save({
      did,
      method: 'key',
      keyRef,
      createdAt,
      type: 'key',
      didDocument: didDocumentJson,
      publicKeyBase58,
      keyType: 'Ed25519',
    })
    request.logger?.info({ module: 'did', operation: 'createDidKey', did }, 'Created did:key')
    return { did, didDocument: didDocumentJson, keyRef, createdAt }
  }

  @Post('create-jwk')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createDidJwk(
    @Request() request: ExRequest,
    @Body() body: CreateDidJwkRequest,
  ): Promise<DidCreateResponse> {
    // Create wallet key, transform to did:jwk by base64url encoding sorted public JWK
    // did:jwk not natively supported as a registrar yet; derive from wallet key material.
    const desired = body.keyType || 'P-256'
    const keyType = desired === 'P-256' ? KeyType.P256 : KeyType.Ed25519
    const key = await request.agent.wallet.createKey({ keyType })

    // Build public JWK
    let publicJwk: JWK
    const publicKeyBytes = TypedArrayEncoder.fromBase58(key.publicKeyBase58)
    if (keyType === KeyType.Ed25519) {
      publicJwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(publicKeyBytes).toString('base64url'),
      }
    } else if (keyType === KeyType.P256) {
      // Expect uncompressed point (0x04 || X || Y)
      if (publicKeyBytes[0] !== 0x04 || publicKeyBytes.length !== 65) {
        this.setStatus(500)
        throw new Error('Unexpected P-256 public key format')
      }
      const x = publicKeyBytes.slice(1, 33)
      const y = publicKeyBytes.slice(33)
      publicJwk = {
        kty: 'EC',
        crv: 'P-256',
        x: Buffer.from(x).toString('base64url'),
        y: Buffer.from(y).toString('base64url'),
      }
    } else {
      this.setStatus(400)
      throw new Error('Unsupported key type for did:jwk')
    }
    const ordered: JWK = Object.keys(publicJwk)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = (publicJwk as any)[k]
        return acc
      }, {})
    const encoded = Buffer.from(JSON.stringify(ordered)).toString('base64url')
    const did = 'did:jwk:' + encoded
    const vmId = did + '#0'
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      verificationMethod: [
        {
          id: vmId,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: publicJwk,
        },
      ],
      authentication: [vmId],
      assertionMethod: [vmId],
    }
    const createdAt = new Date().toISOString()
    const keyRef = key.fingerprint || key.publicKeyBase58
    const publicKeyBase58 = key.publicKeyBase58
    // Dev-only: store a private JWK reference if available from wallet export (not all wallets expose). Here we can't
    // export the private key from Credo wallet. In dev/KMS we expect callers to separately import private JWK via admin.
    // Still, persist did record.
    didStore.save({
      did,
      method: 'jwk',
      keyRef,
      createdAt,
      type: 'jwk',
      didDocument,
      publicKeyBase58,
      keyType: desired,
    })
    request.logger?.info({ module: 'did', operation: 'createDidJwk', did }, 'Created did:jwk')
    return { did, didDocument, keyRef, createdAt }
  }

  /**
   * Prepare a did:web DID Document (no network write). Returns publish & verify instructions.
   */
  @Post('prepare-web')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async prepareDidWeb(
    @Request() request: ExRequest,
    @Body() body: PrepareDidWebRequest,
  ): Promise<DidCreateResponse & { publishInstructions: string; verifyCommand: string }> {
    // Construct did:web identifier + DID Document using either multibase key (Ed25519VerificationKey2020) or JWK form
    if (!body?.domain) {
      this.setStatus(400)
      throw new Error('domain required')
    }
    const rawDomain = body.domain.trim().toLowerCase()
    const domain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
    // did:web specification: host and path segments separated by ':'
    const methodSpecificId = domain.split('/').join(':')
    const did = 'did:web:' + methodSpecificId
    const keyMethod = body.keyMethod || 'jwk'
    const keyType = body.keyType || 'Ed25519'
    const walletKeyType = keyType === 'P-256' ? KeyType.P256 : KeyType.Ed25519
    const key = await request.agent.wallet.createKey({ keyType: walletKeyType })
    const publicKeyBytes = TypedArrayEncoder.fromBase58(key.publicKeyBase58)

    let verificationMethod: any
    let contextAdditions: string[] = []
    if (keyMethod === 'key') {
      // Use Ed25519VerificationKey2020 style (only valid for Ed25519)
      if (walletKeyType !== KeyType.Ed25519) {
        this.setStatus(400)
        throw new Error('keyMethod "key" only supported with Ed25519 currently')
      }
      // multicodec header for ed25519-pub 0xed01
      const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(publicKeyBytes)])
      const publicKeyMultibase = 'z' + bs58.encode(multicodec)
      verificationMethod = {
        id: did + '#key-1',
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      }
      contextAdditions = ['https://w3id.org/security/suites/ed25519-2020/v1']
    } else {
      // JWK representation
      if (walletKeyType === KeyType.Ed25519) {
        verificationMethod = {
          id: did + '#key-1',
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: {
            kty: 'OKP',
            crv: 'Ed25519',
            x: Buffer.from(publicKeyBytes).toString('base64url'),
          },
        }
      } else if (walletKeyType === KeyType.P256) {
        if (publicKeyBytes[0] !== 0x04 || publicKeyBytes.length !== 65) {
          this.setStatus(500)
          throw new Error('Unexpected P-256 public key format')
        }
        const x = publicKeyBytes.slice(1, 33)
        const y = publicKeyBytes.slice(33)
        verificationMethod = {
          id: did + '#key-1',
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: {
            kty: 'EC',
            crv: 'P-256',
            x: Buffer.from(x).toString('base64url'),
            y: Buffer.from(y).toString('base64url'),
          },
        }
      } else {
        this.setStatus(400)
        throw new Error('Unsupported key type for jwk method')
      }
    }

    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1', ...contextAdditions],
      id: did,
      verificationMethod: [verificationMethod],
      authentication: [verificationMethod.id],
      assertionMethod: [verificationMethod.id],
    }

    const didJson = JSON.stringify(didDocument, null, 2)
    const publishInstructions = [
      `1. Create directory: .well-known (at site root)`,
      `2. Save DID document to .well-known/did.json with the following content:\n${didJson}`,
      `3. Ensure server serves: https://${domain}/.well-known/did.json with content-type application/json`,
    ].join('\n\n')
    const verifyCommand = `curl -s https://${domain}/.well-known/did.json | jq .id`
    const createdAt = new Date().toISOString()
    const keyRef = key.fingerprint || key.publicKeyBase58
    const publicKeyBase58 = key.publicKeyBase58
    didStore.save({ did, method: 'web', keyRef, createdAt, type: 'web', didDocument, publicKeyBase58, keyType })
    request.logger?.info({ module: 'did', operation: 'prepareDidWeb', did, domain }, 'Prepared did:web')
    return { did, didDocument, publishInstructions, verifyCommand, keyRef, createdAt }
  }

  /** List stored DID records created via these endpoints */
  @Get('records')
  @Security('jwt', ['tenant'])
  public async listDidRecords(): Promise<any[]> {
    return didStore.list()
  }

  /** Verify a published did:web by fetching remote did.json via agent resolution and comparing id */
  @Get('verify-web/{domain}')
  @Security('jwt', ['tenant'])
  public async verifyPublishedDidWeb(
    @Request() request: ExRequest,
    @Path() domain: string,
  ): Promise<any> {
    const norm = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    const methodSpecificId = norm.split('/').join(':')
    const did = 'did:web:' + methodSpecificId
    const url = `https://${norm}/.well-known/did.json`
    try {
      request.logger?.info({ did }, 'Verifying did:web via agent resolution')
      const result = await request.agent.dids.resolve(did)
      const remote = result.didDocument
      const match = remote?.id === did
      return { did, url, match, remote, resolutionMetadata: result.didResolutionMetadata }
    } catch (e: any) {
      this.setStatus(502)
      return { did, url, match: false, error: e.message }
    }
  }
}

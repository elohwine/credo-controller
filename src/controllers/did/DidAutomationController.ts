import type { Request as ExRequest } from 'express'

import { KeyType } from '@credo-ts/core'
import { Controller, Post, Route, Security, Tags, Request } from 'tsoa'

import { didStore } from '../../utils/didStore'

interface CreateKeyDidResponse {
  did: string
  kid: string
  publicKeyBase58?: string
  didDocument?: any
}

@Tags('Dids')
@Route('/dids/automation')
@Security('jwt', ['tenant'])
export class DidAutomationController extends Controller {
  @Post('/key')
  public async createKeyDid(@Request() request: ExRequest): Promise<CreateKeyDidResponse> {
    const didResult = await request.agent.dids.create({
      method: 'key',
      options: { keyType: KeyType.Ed25519 },
    })
    if (didResult.didState.state !== 'finished' || !didResult.didState.did) {
      this.setStatus(500)
      throw new Error('failed to create did:key')
    }
    const did = didResult.didState.did
    const vm = didResult.didState.didDocument?.verificationMethod?.[0]
    const kid = vm?.id ?? `${did}#key-1`
    const publicKeyBase58 = extractPublicKeyBase58(vm)
    didStore.save({
      did,
      keyRef: kid,
      method: 'key',
      createdAt: new Date().toISOString(),
      type: 'key',
      publicKeyBase58,
      keyType: 'Ed25519',
      didDocument: didResult.didState.didDocument?.toJSON?.() ?? didResult.didState.didDocument,
    })
    return {
      did,
      kid,
      publicKeyBase58,
      didDocument: didResult.didState.didDocument?.toJSON?.() ?? didResult.didState.didDocument,
    }
  }
}

function extractPublicKeyBase58(verificationMethod?: any): string | undefined {
  if (!verificationMethod) return undefined
  if (verificationMethod.publicKeyBase58) return verificationMethod.publicKeyBase58
  if (typeof verificationMethod.publicKeyMultibase === 'string' && verificationMethod.publicKeyMultibase.startsWith('z')) {
    return verificationMethod.publicKeyMultibase.slice(1)
  }
  return undefined
}

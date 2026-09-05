import { gunzipSync } from 'zlib'
import { JsonTransformer, W3cCredentialService, W3cJsonLdVerifiableCredential } from '@credo-ts/core'
import type { Request as ExRequest } from 'express'
import type { CredentialStatus } from './SsiTypes'

const MINIMUM_STATUS_LIST_ENTRIES = 131_072
const MAX_STATUS_LIST_BYTES = 4 * 1024 * 1024

export interface CredentialStatusResult {
  status: CredentialStatus
  checked: boolean
  reasonCode?: string
  statusPurpose?: string
  statusListCredential?: string
  checkedAt?: string
}

export interface CredentialStatusResolver {
  resolve(input: {
    credentialId?: string
    credentialStatus?: unknown
    issuerRef?: string
    request?: ExRequest
  }): Promise<CredentialStatusResult>
}

type BitstringStatusListEntry = {
  type: 'BitstringStatusListEntry'
  statusPurpose: string
  statusListIndex: string
  statusListCredential: string
  statusSize?: number
  statusMessage?: Array<{ status: string; message: string }>
}

type BitstringStatusListCredential = {
  id?: string
  type?: string | string[]
  issuer?: unknown
  validFrom?: string
  validUntil?: string
  credentialSubject?: {
    type?: string | string[]
    statusPurpose?: string | string[]
    encodedList?: string
    ttl?: number
  }
  proof?: unknown
}

/**
 * W3C Bitstring Status List v1.0 resolver.
 *
 * This service deliberately returns `unknown` when an authoritative status
 * mechanism cannot be completely validated. Business policy must not treat
 * network failure, malformed status lists, or unverified status credentials as
 * equivalent to an active credential.
 */
export class CredentialStatusService implements CredentialStatusResolver {
  async resolve(input: {
    credentialId?: string
    credentialStatus?: unknown
    issuerRef?: string
    request?: ExRequest
  }): Promise<CredentialStatusResult> {
    const entry = this.normalizeStatusEntry(input.credentialStatus)
    if (!entry) {
      return this.result('unknown', false, 'credential_status_not_present')
    }

    if (entry.type !== 'BitstringStatusListEntry') {
      return this.result('unknown', false, 'unsupported_credential_status_type')
    }

    const statusSize = entry.statusSize ?? 1
    if (!Number.isInteger(statusSize) || statusSize <= 0 || statusSize > 8) {
      return this.result('unknown', false, 'invalid_status_size', entry)
    }

    const index = this.parseStatusListIndex(entry.statusListIndex)
    if (index === null) {
      return this.result('unknown', false, 'invalid_status_list_index', entry)
    }

    if (statusSize > 1 && (!entry.statusMessage || entry.statusMessage.length !== 2 ** statusSize)) {
      return this.result('unknown', false, 'invalid_status_messages', entry)
    }

    if (!this.isHttpUrl(entry.statusListCredential)) {
      return this.result('unknown', false, 'invalid_status_list_credential_url', entry)
    }

    try {
      const statusCredential = await this.fetchStatusListCredential(entry.statusListCredential)
      const verified = await this.verifyStatusListCredential(statusCredential, input.request)
      if (!verified) {
        return this.result('unknown', false, 'status_list_credential_unverified', entry)
      }

      const statusList = this.extractStatusList(statusCredential)
      if (!statusList) {
        return this.result('unknown', false, 'invalid_status_list_credential', entry)
      }

      if (!this.hasExpectedType(statusCredential.type, 'BitstringStatusListCredential')) {
        return this.result('unknown', false, 'invalid_status_list_credential_type', entry)
      }

      if (!this.matchesStatusPurpose(statusList.statusPurpose, entry.statusPurpose)) {
        return this.result('unknown', false, 'status_purpose_mismatch', entry)
      }

      const encodedList = statusList.encodedList
      if (typeof encodedList !== 'string' || encodedList.length === 0) {
        return this.result('unknown', false, 'encoded_status_list_missing', entry)
      }

      const expanded = this.decodeBitstring(encodedList)
      const minimumBytes = Math.ceil((MINIMUM_STATUS_LIST_ENTRIES * statusSize) / 8)
      if (expanded.length < minimumBytes) {
        return this.result('unknown', false, 'status_list_length_error', entry)
      }
      if (expanded.length > MAX_STATUS_LIST_BYTES) {
        return this.result('unknown', false, 'status_list_too_large', entry)
      }

      const bitOffset = index * statusSize
      if (bitOffset + statusSize > expanded.length * 8) {
        return this.result('unknown', false, 'status_list_index_out_of_range', entry)
      }

      const statusValue = this.readBitsMostSignificantFirst(expanded, bitOffset, statusSize)
      const valid = statusValue === 0

      return this.result(
        valid ? 'valid' : entry.statusPurpose === 'suspension' ? 'suspended' : 'revoked',
        true,
        valid ? 'credential_status_valid' : 'credential_status_invalid',
        entry
      )
    } catch (error) {
      input.request?.logger?.warn(
        { module: 'ssi-status', operation: 'resolve', statusListCredential: entry.statusListCredential },
        `Credential status retrieval/verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
      return this.result('unknown', false, 'status_retrieval_error', entry)
    }
  }

  private result(
    status: CredentialStatus,
    checked: boolean,
    reasonCode: string,
    entry?: BitstringStatusListEntry
  ): CredentialStatusResult {
    return {
      status,
      checked,
      reasonCode,
      statusPurpose: entry?.statusPurpose,
      statusListCredential: entry?.statusListCredential,
      checkedAt: new Date().toISOString(),
    }
  }

  private normalizeStatusEntry(value: unknown): BitstringStatusListEntry | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

    const candidate = value as Record<string, unknown>
    if (
      typeof candidate.statusPurpose !== 'string' ||
      typeof candidate.statusListIndex !== 'string' ||
      typeof candidate.statusListCredential !== 'string'
    ) {
      return undefined
    }

    return {
      type: typeof candidate.type === 'string' ? (candidate.type as BitstringStatusListEntry['type']) : 'BitstringStatusListEntry',
      statusPurpose: candidate.statusPurpose,
      statusListIndex: candidate.statusListIndex,
      statusListCredential: candidate.statusListCredential,
      statusSize: candidate.statusSize as number | undefined,
      statusMessage: Array.isArray(candidate.statusMessage) ? (candidate.statusMessage as BitstringStatusListEntry['statusMessage']) : undefined,
    }
  }

  private parseStatusListIndex(value: string): number | null {
    if (!/^(0|[1-9]\d*)$/.test(value)) return null
    const asBigInt = BigInt(value)
    if (asBigInt > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(asBigInt)
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  }

  private async fetchStatusListCredential(url: string): Promise<BitstringStatusListCredential | string> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vc+jwt, application/vc+ld+json, application/json, application/ld+json',
      },
      redirect: 'error',
    })

    if (!response.ok) throw new Error(`Status list HTTP ${response.status}`)

    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    if (text.length > 8 * 1024 * 1024) throw new Error('Status list response exceeds maximum payload size')

    if (contentType.includes('application/vc+jwt') || this.looksLikeJwt(text)) {
      return text.trim()
    }

    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid status list JSON')
    return parsed as BitstringStatusListCredential
  }

  private async verifyStatusListCredential(
    credential: BitstringStatusListCredential | string,
    request?: ExRequest
  ): Promise<boolean> {
    if (!request?.agent) return false

    const service = request.agent.dependencyManager.resolve(W3cCredentialService)
    if (typeof credential === 'string') {
      const result = await service.verifyCredential(request.agent as any, { credential })
      return result.isValid === true
    }

    const jsonLdCredential = JsonTransformer.fromJSON(credential, W3cJsonLdVerifiableCredential)
    const result = await service.verifyCredential(request.agent as any, { credential: jsonLdCredential })
    return result.isValid === true
  }

  private extractStatusList(
    credential: BitstringStatusListCredential | string
  ): { statusPurpose?: string | string[]; encodedList?: string } | undefined {
    if (typeof credential === 'string') {
      const parts = credential.split('.')
      if (parts.length !== 3) return undefined
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, any>
        return payload.credentialSubject ?? payload.vc?.credentialSubject
      } catch {
        return undefined
      }
    }

    return credential.credentialSubject
  }

  private hasExpectedType(type: unknown, expected: string): boolean {
    return Array.isArray(type) ? type.includes(expected) : type === expected
  }

  private matchesStatusPurpose(value: unknown, requested: string): boolean {
    return Array.isArray(value) ? value.includes(requested) : value === requested
  }

  private decodeBitstring(encodedList: string): Buffer {
    if (!encodedList.startsWith('u')) throw new Error('Unsupported status list multibase encoding')
    const compressed = Buffer.from(encodedList.slice(1), 'base64url')
    return gunzipSync(compressed, { finishFlush: 2 })
  }

  private readBitsMostSignificantFirst(bytes: Buffer, bitOffset: number, bitLength: number): number {
    let value = 0
    for (let i = 0; i < bitLength; i += 1) {
      const absoluteBit = bitOffset + i
      const byte = bytes[Math.floor(absoluteBit / 8)]
      const bitInByte = absoluteBit % 8
      const bit = (byte >> (7 - bitInByte)) & 1
      value = (value << 1) | bit
    }
    return value
  }

  private looksLikeJwt(value: string): boolean {
    const parts = value.trim().split('.')
    return parts.length === 3 && parts.every((part) => part.length > 0)
  }
}

export const credentialStatusService = new CredentialStatusService()

import { gunzipSync } from 'zlib'
import { JsonTransformer, W3cJsonLdVerifiableCredential } from '@credo-ts/core'
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

type BitstringStatusList = {
  statusPurpose?: string | string[]
  encodedList?: string
}

type BitstringStatusListCredential = {
  id?: string
  type?: string | string[]
  credentialSubject?: BitstringStatusList
}

export class CredentialStatusService implements CredentialStatusResolver {
  async resolve(input: {
    credentialId?: string
    credentialStatus?: unknown
    issuerRef?: string
    request?: ExRequest
  }): Promise<CredentialStatusResult> {
    const entry = this.normalizeStatusEntry(input.credentialStatus)
    if (!entry) return this.result('unknown', false, 'credential_status_not_present')

    const statusSize = entry.statusSize ?? 1
    if (!Number.isInteger(statusSize) || statusSize < 1 || statusSize > 8) {
      return this.result('unknown', false, 'invalid_status_size', entry)
    }

    if (statusSize > 1 && (!entry.statusMessage || entry.statusMessage.length !== 2 ** statusSize)) {
      return this.result('unknown', false, 'invalid_status_messages', entry)
    }

    const index = this.parseStatusListIndex(entry.statusListIndex)
    if (index === null) return this.result('unknown', false, 'invalid_status_list_index', entry)

    if (!this.isHttpsUrl(entry.statusListCredential)) {
      return this.result('unknown', false, 'invalid_status_list_credential_url', entry)
    }

    try {
      const statusCredential = await this.fetchStatusListCredential(entry.statusListCredential)
      if (!this.isConformingStatusListCredential(statusCredential)) {
        return this.result('unknown', false, 'invalid_status_list_credential', entry)
      }

      if (!(await this.verifyStatusListCredential(statusCredential, input.request))) {
        return this.result('unknown', false, 'status_list_credential_unverified', entry)
      }

      const statusList = this.extractStatusList(statusCredential)
      if (!statusList) return this.result('unknown', false, 'invalid_status_list_credential', entry)

      if (!this.matchesStatusPurpose(statusList.statusPurpose, entry.statusPurpose)) {
        return this.result('unknown', false, 'status_purpose_mismatch', entry)
      }

      const encodedList = statusList.encodedList
      if (typeof encodedList !== 'string' || encodedList.length === 0) {
        return this.result('unknown', false, 'encoded_status_list_missing', entry)
      }

      const expanded = this.decodeBitstring(encodedList)
      const requiredBytes = Math.ceil((MINIMUM_STATUS_LIST_ENTRIES * statusSize) / 8)
      if (expanded.length < requiredBytes) {
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
      if (statusValue === 0) return this.result('valid', true, 'credential_status_valid', entry)

      return this.result(
        entry.statusPurpose === 'suspension' ? 'suspended' : 'revoked',
        true,
        entry.statusMessage?.some(({ status }) => status === String(statusValue))
          ? 'credential_status_invalid'
          : 'credential_status_nonzero',
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
      candidate.type !== 'BitstringStatusListEntry' ||
      typeof candidate.statusPurpose !== 'string' ||
      typeof candidate.statusListIndex !== 'string' ||
      typeof candidate.statusListCredential !== 'string'
    ) {
      return undefined
    }

    return {
      type: 'BitstringStatusListEntry',
      statusPurpose: candidate.statusPurpose,
      statusListIndex: candidate.statusListIndex,
      statusListCredential: candidate.statusListCredential,
      statusSize: typeof candidate.statusSize === 'number' ? candidate.statusSize : undefined,
      statusMessage: Array.isArray(candidate.statusMessage)
        ? candidate.statusMessage.filter(
            (message): message is { status: string; message: string } =>
              !!message &&
              typeof message === 'object' &&
              typeof (message as Record<string, unknown>).status === 'string' &&
              typeof (message as Record<string, unknown>).message === 'string'
          )
        : undefined,
    }
  }

  private parseStatusListIndex(value: string): number | null {
    if (!/^(0|[1-9]\d*)$/.test(value)) return null
    const index = BigInt(value)
    if (index > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(index)
  }

  private isHttpsUrl(value: string): boolean {
    try {
      return new URL(value).protocol === 'https:'
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
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) throw new Error(`Status list HTTP ${response.status}`)

    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    if (text.length > 8 * 1024 * 1024) throw new Error('Status list response exceeds maximum payload size')

    if (contentType.includes('application/vc+jwt') || this.looksLikeJwt(text)) return text.trim()

    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid status list JSON')
    return parsed as BitstringStatusListCredential
  }

  private async verifyStatusListCredential(
    credential: BitstringStatusListCredential | string,
    request?: ExRequest
  ): Promise<boolean> {
    if (!request?.agent) return false

    if (typeof credential === 'string') {
      const result = await request.agent.w3cCredentials.verifyCredential({ credential })
      return result.isValid === true
    }

    const jsonLdCredential = JsonTransformer.fromJSON(credential, W3cJsonLdVerifiableCredential)
    const result = await request.agent.w3cCredentials.verifyCredential({ credential: jsonLdCredential })
    return result.isValid === true
  }

  private isConformingStatusListCredential(credential: BitstringStatusListCredential | string): boolean {
    if (typeof credential === 'string') {
      const parts = credential.split('.')
      if (parts.length !== 3) return false
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
        const vc = payload.vc as Record<string, unknown> | undefined
        return this.hasExpectedType(payload.type ?? vc?.type, 'BitstringStatusListCredential')
      } catch {
        return false
      }
    }

    return this.hasExpectedType(credential.type, 'BitstringStatusListCredential')
  }

  private extractStatusList(credential: BitstringStatusListCredential | string): BitstringStatusList | undefined {
    if (typeof credential === 'string') {
      const parts = credential.split('.')
      if (parts.length !== 3) return undefined
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
        const vc = payload.vc as Record<string, unknown> | undefined
        return (payload.credentialSubject ?? vc?.credentialSubject) as BitstringStatusList | undefined
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
    return gunzipSync(Buffer.from(encodedList.slice(1), 'base64url'))
  }

  private readBitsMostSignificantFirst(bytes: Buffer, bitOffset: number, bitLength: number): number {
    let value = 0
    for (let i = 0; i < bitLength; i += 1) {
      const absoluteBit = bitOffset + i
      const byte = bytes[Math.floor(absoluteBit / 8)]
      const bitInByte = absoluteBit % 8
      value = (value << 1) | ((byte >> (7 - bitInByte)) & 1)
    }
    return value
  }

  private looksLikeJwt(value: string): boolean {
    const parts = value.trim().split('.')
    return parts.length === 3 && parts.every((part) => part.length > 0)
  }
}

export const credentialStatusService = new CredentialStatusService()

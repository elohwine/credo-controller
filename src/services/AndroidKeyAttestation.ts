import type { BaseBlock } from 'asn1js'

import { X509Certificate as ParsedCertificate } from '@peculiar/x509'
import { Constructed, Integer, OctetString, Sequence, fromBER, Boolean as AsnBoolean } from 'asn1js'
import { createPublicKey, X509Certificate } from 'crypto'

import { StatusException } from '../errors'
import { rootLogger } from '../utils/pinoLogger'

type RevocationList = { entries: Record<string, { status: string }> }
let rootsCache: { until: number; values: X509Certificate[] } | undefined
let revocationCache: { until: number; value: RevocationList } | undefined

async function jsonFrom(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new StatusException('Device attestation validation is temporarily unavailable.', 503)
  return response.json()
}

function children(node: BaseBlock | undefined): BaseBlock[] {
  if (!(node instanceof Constructed)) throw new StatusException('Invalid Android key attestation structure.', 400)
  return node.valueBlock.value
}

function number(node: BaseBlock | undefined): number {
  if (!(node instanceof Integer)) throw new StatusException('Invalid Android key attestation number.', 400)
  return node.valueBlock.valueDec
}

function bytes(node: BaseBlock | undefined): Buffer {
  if (!(node instanceof OctetString)) throw new StatusException('Invalid Android key attestation bytes.', 400)
  return Buffer.from(node.valueBlock.valueHexView)
}

function tagged(list: BaseBlock[], tag: number): BaseBlock | undefined {
  const found = list.find((node) => node.idBlock.tagClass === 3 && node.idBlock.tagNumber === tag)
  return found ? children(found)[0] : undefined
}

async function trustedRoots(): Promise<X509Certificate[]> {
  if (rootsCache && rootsCache.until > Date.now()) return rootsCache.values
  const values = await jsonFrom('https://android.googleapis.com/attestation/root')
  if (!Array.isArray(values) || !values.length || !values.every((value) => typeof value === 'string')) {
    throw new StatusException('Android attestation trust roots are unavailable.', 503)
  }
  const certificates = values.map((pem: string) => new X509Certificate(pem))
  rootsCache = { until: Date.now() + 60 * 60 * 1000, values: certificates }
  return certificates
}

async function revocations(): Promise<RevocationList> {
  if (revocationCache && revocationCache.until > Date.now()) return revocationCache.value
  const value = await jsonFrom('https://android.googleapis.com/attestation/status')
  if (
    !value ||
    typeof value !== 'object' ||
    !('entries' in value) ||
    !value.entries ||
    typeof value.entries !== 'object'
  ) {
    throw new StatusException('Android attestation revocation information is unavailable.', 503)
  }
  const entries: RevocationList['entries'] = {}
  for (const [key, entry] of Object.entries(value.entries)) {
    if (!entry || typeof entry !== 'object' || !('status' in entry) || typeof entry.status !== 'string') {
      throw new StatusException('Invalid attestation revocation information.', 503)
    }
    entries[key.toLowerCase().replace(/^0+/, '')] = { status: entry.status }
  }
  const result = { entries }
  revocationCache = { until: Date.now() + 5 * 60 * 1000, value: result }
  return result
}

export async function verifyAndroidKeyAttestation(input: {
  publicJwk: Record<string, unknown>
  attestation: unknown
  challenge: string
  usage: 'login' | 'payment'
}): Promise<void> {
  if (input.publicJwk.d || input.publicJwk.kty !== 'EC' || input.publicJwk.crv !== 'P-256') {
    throw new StatusException('A P-256 public device key is required.', 400)
  }
  if (!input.attestation || typeof input.attestation !== 'object' || !('certificateChain' in input.attestation)) {
    throw new StatusException('Android key attestation certificates are required.', 400)
  }
  const chainData = input.attestation.certificateChain
  if (
    !Array.isArray(chainData) ||
    chainData.length < 2 ||
    chainData.length > 8 ||
    !chainData.every((item) => typeof item === 'string' && item.length < 24000)
  ) {
    throw new StatusException('Invalid Android attestation certificate chain.', 400)
  }
  const chain = chainData.map((item: string) => new X509Certificate(Buffer.from(item, 'base64')))
  const roots = await trustedRoots()
  const revoked = await revocations()
  for (let index = 0; index < chain.length; index++) {
    const certificate = chain[index]
    if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
      throw new StatusException('An Android attestation certificate has expired.', 403)
    }
    if (revoked.entries[certificate.serialNumber.toLowerCase().replace(/^0+/, '')]) {
      throw new StatusException('An Android attestation certificate was revoked.', 403)
    }
    if (
      index < chain.length - 1 &&
      (!chain[index + 1].ca ||
        !certificate.checkIssued(chain[index + 1]) ||
        !certificate.verify(chain[index + 1].publicKey))
    ) {
      throw new StatusException('Android attestation certificate signatures did not verify.', 403)
    }
  }
  const root = chain[chain.length - 1]
  const rootKey = root.publicKey.export({ type: 'spki', format: 'der' })
  if (
    !root.ca ||
    !root.verify(root.publicKey) ||
    !roots.some((trusted) => trusted.publicKey.export({ type: 'spki', format: 'der' }).equals(rootKey))
  ) {
    rootLogger.warn(
      { module: 'AndroidKeyAttestation', rootFingerprint: root.fingerprint256 },
      'Android attestation root is not trusted',
    )
    throw new StatusException('Android attestation root is not trusted.', 403)
  }
  const leafJwk = chain[0].publicKey.export({ format: 'jwk' })
  const expected = createPublicKey({ key: { ...input.publicJwk }, format: 'jwk' }).export({ format: 'jwk' })
  if (leafJwk.x !== expected.x || leafJwk.y !== expected.y) {
    throw new StatusException('The attested key does not match this device key.', 403)
  }
  // Only trust the extension nearest the pinned root, not a later attacker-added leaf.
  let extension: ArrayBuffer | undefined
  for (let index = chain.length - 2; index >= 0; index--) {
    const parsed = new ParsedCertificate(chain[index].raw)
    const candidate = parsed.getExtension('1.3.6.1.4.1.11129.2.1.17')
    if (candidate) {
      const attested = chain[index].publicKey.export({ format: 'jwk' })
      if (attested.x !== expected.x || attested.y !== expected.y) {
        throw new StatusException('The Android attestation belongs to a different key.', 403)
      }
      extension = candidate.value
      break
    }
  }
  if (!extension) throw new StatusException('Android key attestation extension is missing.', 403)
  const decoded = fromBER(extension)
  if (decoded.offset !== extension.byteLength || !(decoded.result instanceof Sequence)) {
    throw new StatusException('Android key attestation extension is invalid.', 400)
  }
  const fields = children(decoded.result)
  if (
    ![1, 2].includes(number(fields[1])) ||
    ![1, 2].includes(number(fields[3])) ||
    bytes(fields[4]).toString('utf8') !== input.challenge
  ) {
    throw new StatusException('Hardware attestation is not bound to this enrollment.', 403)
  }
  const software = children(fields[6])
  const hardware = children(fields[7])
  const auth = number(tagged(hardware, 504))
  const expectedAuth = input.usage === 'login' ? 3 : 2
  const purposes = children(tagged(hardware, 1)).map(number)
  const digests = children(tagged(hardware, 5)).map(number)
  if (
    tagged(hardware, 503) ||
    auth !== expectedAuth ||
    (tagged(hardware, 505) && number(tagged(hardware, 505)) !== 0) ||
    purposes.length !== 1 ||
    purposes[0] !== 2 ||
    !digests.includes(4) ||
    number(tagged(hardware, 2)) !== 3 ||
    number(tagged(hardware, 3)) !== 256 ||
    number(tagged(hardware, 10)) !== 1 ||
    number(tagged(hardware, 702)) !== 0
  ) {
    throw new StatusException('Device key authentication policy is not hardware-enforced.', 403)
  }
  const boot = children(tagged(hardware, 704))
  if (!(boot[1] instanceof AsnBoolean) || !boot[1].valueBlock.value || number(boot[2]) !== 0) {
    throw new StatusException('The phone must have a locked, verified Android boot state.', 403)
  }
  const appData = bytes(tagged(software, 709) || tagged(hardware, 709))
  const app = fromBER(appData)
  const appFields = children(app.result)
  const packageName = process.env.ANDROID_APP_PACKAGE || 'com.credentis.mobile'
  const digest = (process.env.ANDROID_APP_CERT_SHA256 || '').replace(/:/g, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new StatusException('Android signing-certificate verification is not configured.', 503)
  }
  if (
    !children(appFields[0]).some((node) => bytes(children(node)[0]).toString('utf8') === packageName) ||
    !children(appFields[1]).some((node) => bytes(node).toString('hex') === digest)
  ) {
    throw new StatusException('This key was not created by the trusted Credentis application.', 403)
  }
}

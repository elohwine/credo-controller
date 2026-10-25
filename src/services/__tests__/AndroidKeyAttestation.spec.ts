import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { webcrypto } from 'crypto'
import { BasicConstraintsExtension, Extension, X509CertificateGenerator } from '@peculiar/x509'
import * as asn from 'asn1js'

const crypto = webcrypto as Crypto
const challenge = 'fresh-server-challenge-0123456789abcdef'
const digest = '12'.repeat(32)
const OID = '1.3.6.1.4.1.11129.2.1.17'
const validity = { notBefore: new Date(Date.now() - 86400000), notAfter: new Date(Date.now() + 86400000) }
const octets = (value: string) => new asn.OctetString({ valueHex: new TextEncoder().encode(value).buffer })
const tagged = (tagNumber: number, value: asn.BaseBlock) =>
  new asn.Constructed({
    idBlock: { tagClass: 3, tagNumber },
    value: [value],
  })
function extension(
  options: {
    challenge?: string
    securityLevel?: number
    authType?: number
    locked?: boolean
    noAuth?: boolean
    origin?: number
  } = {},
) {
  const appId = new asn.Sequence({
    value: [
      new asn.Set({
        value: [new asn.Sequence({ value: [octets('com.credentis.mobile'), new asn.Integer({ value: 1 })] })],
      }),
      new asn.Set({ value: [new asn.OctetString({ valueHex: Uint8Array.from(Buffer.from(digest, 'hex')).buffer })] }),
    ],
  })
  const policy = [
    tagged(1, new asn.Set({ value: [new asn.Integer({ value: 2 })] })),
    tagged(2, new asn.Integer({ value: 3 })),
    tagged(3, new asn.Integer({ value: 256 })),
    tagged(5, new asn.Set({ value: [new asn.Integer({ value: 4 })] })),
    tagged(10, new asn.Integer({ value: 1 })),
    tagged(504, new asn.Integer({ value: options.authType ?? 3 })),
    tagged(702, new asn.Integer({ value: options.origin ?? 0 })),
    tagged(
      704,
      new asn.Sequence({
        value: [
          octets('verified-boot-key'),
          new asn.Boolean({ value: options.locked !== false }),
          new asn.Enumerated({ value: 0 }),
          octets('verified-boot-hash'),
        ],
      }),
    ),
    ...(options.noAuth ? [tagged(503, new asn.Null())] : []),
  ]
  return new Extension(
    OID,
    false,
    new asn.Sequence({
      value: [
        new asn.Integer({ value: 300 }),
        new asn.Enumerated({ value: options.securityLevel ?? 1 }),
        new asn.Integer({ value: 300 }),
        new asn.Enumerated({ value: 1 }),
        octets(options.challenge || challenge),
        octets(''),
        new asn.Sequence({ value: [tagged(709, new asn.OctetString({ valueHex: appId.toBER(false) }))] }),
        new asn.Sequence({ value: policy }),
      ],
    }).toBER(false),
  )
}

describe('Android hardware attestation verification', () => {
  let rootKeys: CryptoKeyPair
  let deviceKeys: CryptoKeyPair
  let root: Awaited<ReturnType<typeof X509CertificateGenerator.createSelfSigned>>
  let publicJwk: JsonWebKey
  let verify: (typeof import('../AndroidKeyAttestation'))['verifyAndroidKeyAttestation']
  let rootPem: string
  let status: Record<string, { status: string }>
  const oldDigest = process.env.ANDROID_APP_CERT_SHA256
  const oldPackage = process.env.ANDROID_APP_PACKAGE
  let serial = 10
  async function leaf(options: Parameters<typeof extension>[0] = {}, isCa = false) {
    serial += 1
    return X509CertificateGenerator.create(
      {
        subject: 'CN=Device',
        issuer: 'CN=Test Root',
        publicKey: deviceKeys.publicKey,
        signingKey: rootKeys.privateKey,
        ...validity,
        serialNumber: serial.toString(16),
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        extensions: [new BasicConstraintsExtension(isCa, undefined, true), extension(options)],
      },
      crypto,
    )
  }
  async function input(options: Parameters<typeof extension>[0] = {}, usage: 'login' | 'payment' = 'login') {
    const certificate = await leaf(options)
    return {
      publicJwk: { ...publicJwk },
      challenge,
      usage,
      attestation: { certificateChain: [certificate.toString('base64'), root.toString('base64')] },
    }
  }
  beforeAll(async () => {
    rootKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    deviceKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    publicJwk = await crypto.subtle.exportKey('jwk', deviceKeys.publicKey)
    root = await X509CertificateGenerator.createSelfSigned(
      {
        name: 'CN=Test Root',
        keys: rootKeys,
        ...validity,
        serialNumber: '01',
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        extensions: [new BasicConstraintsExtension(true, undefined, true)],
      },
      crypto,
    )
    rootPem = root.toString('pem')
  })
  beforeEach(async () => {
    jest.resetModules()
    ;({ verifyAndroidKeyAttestation: verify } = await import('../AndroidKeyAttestation'))
    process.env.ANDROID_APP_CERT_SHA256 = digest
    delete process.env.ANDROID_APP_PACKAGE
    status = {}
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/root')) return new Response(JSON.stringify([rootPem]))
      if (String(url).endsWith('/status')) return new Response(JSON.stringify({ entries: status }))
      throw new Error('Unexpected attestation network request')
    })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    if (oldDigest === undefined) delete process.env.ANDROID_APP_CERT_SHA256
    else process.env.ANDROID_APP_CERT_SHA256 = oldDigest
    if (oldPackage === undefined) delete process.env.ANDROID_APP_PACKAGE
    else process.env.ANDROID_APP_PACKAGE = oldPackage
  })
  it('accepts a pinned hardware chain with a fresh nonce and the actual app signing certificate', async () => {
    await expect(verify(await input())).resolves.toBeUndefined()
  })
  it('accepts a reissued Google root certificate with the same pinned public key', async () => {
    const reissued = await X509CertificateGenerator.createSelfSigned(
      {
        name: 'CN=Test Root',
        keys: rootKeys,
        ...validity,
        serialNumber: '02',
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        extensions: [new BasicConstraintsExtension(true, undefined, true)],
      },
      crypto,
    )
    expect(reissued.toString('pem')).not.toBe(rootPem)
    const value = await input()
    value.attestation.certificateChain[1] = reissued.toString('base64')
    await expect(verify(value)).resolves.toBeUndefined()
  })
  it('rejects a root with the same subject but a different public key', async () => {
    const untrustedKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const otherRoot = await X509CertificateGenerator.createSelfSigned(
      {
        name: 'CN=Test Root',
        keys: untrustedKeys,
        ...validity,
        serialNumber: '03',
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        extensions: [new BasicConstraintsExtension(true, undefined, true)],
      },
      crypto,
    )
    rootPem = otherRoot.toString('pem')
    try {
      await expect(verify(await input())).rejects.toThrow('Android attestation root is not trusted.')
    } finally {
      rootPem = root.toString('pem')
    }
  })
  it('separates login screen-lock fallback from biometric-only payment policy', async () => {
    await expect(verify(await input({ authType: 2 }, 'payment'))).resolves.toBeUndefined()
    await expect(verify(await input({ authType: 3 }, 'payment'))).rejects.toMatchObject({ status: 403 })
    await expect(verify(await input({ authType: 2 }))).rejects.toMatchObject({ status: 403 })
  })
  it('rejects a fabricated chain despite hardware-backed flags', async () => {
    const value = await input()
    value.attestation.certificateChain[0] = Buffer.from('not a certificate').toString('base64')
    await expect(verify(value)).rejects.toThrow()
  })
  it('rejects wrong challenge, software security and unlocked boot', async () => {
    await expect(verify(await input({ challenge: 'copied challenge' }))).rejects.toMatchObject({ status: 403 })
    await expect(verify(await input({ securityLevel: 0 }))).rejects.toMatchObject({ status: 403 })
    await expect(verify(await input({ locked: false }))).rejects.toMatchObject({ status: 403 })
    await expect(verify(await input({ noAuth: true }))).rejects.toMatchObject({ status: 403 })
    await expect(verify(await input({ origin: 2 }))).rejects.toMatchObject({ status: 403 })
  })
  it('rejects a submitted key that is not the attested certificate key', async () => {
    const value = await input()
    value.publicJwk = await crypto.subtle.exportKey('jwk', rootKeys.publicKey)
    await expect(verify(value)).rejects.toMatchObject({ status: 403 })
  })
  it('rejects revoked certificates and the wrong application signing digest', async () => {
    const certificate = await leaf()
    status[certificate.serialNumber.replace(/^0+/, '').toLowerCase()] = { status: 'REVOKED' }
    await expect(
      verify({
        publicJwk: { ...publicJwk },
        challenge,
        usage: 'login',
        attestation: { certificateChain: [certificate.toString('base64'), root.toString('base64')] },
      }),
    ).rejects.toMatchObject({ status: 403 })
    process.env.ANDROID_APP_CERT_SHA256 = '34'.repeat(32)
    await expect(verify(await input())).rejects.toMatchObject({ status: 403 })
  })
  it('fails closed if trusted certificate configuration or revocation lookup is unavailable', async () => {
    delete process.env.ANDROID_APP_CERT_SHA256
    await expect(verify(await input())).rejects.toMatchObject({ status: 503 })
  })
  it('does not let an attacker extend an attested certificate with a different leaf key', async () => {
    const attested = await leaf({}, true)
    const child = await X509CertificateGenerator.create(
      {
        subject: 'CN=Fake Device',
        issuer: 'CN=Device',
        publicKey: rootKeys.publicKey,
        signingKey: deviceKeys.privateKey,
        ...validity,
        serialNumber: 'aabb',
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
        extensions: [new BasicConstraintsExtension(false, undefined, true), extension()],
      },
      crypto,
    )
    const attackerJwk = await crypto.subtle.exportKey('jwk', rootKeys.publicKey)
    await expect(
      verify({
        publicJwk: { ...attackerJwk },
        challenge,
        usage: 'login',
        attestation: {
          certificateChain: [child.toString('base64'), attested.toString('base64'), root.toString('base64')],
        },
      }),
    ).rejects.toThrow('different key')
  })
})

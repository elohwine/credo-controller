import { describe, expect, test } from '@jest/globals'
import { walletQrKind, shouldAcceptScannedOffer } from '../credo-ui/mobile/lib/walletScan'

describe('holder wallet QR dispatch', () => {
  test.each([
    'openid4vp://authorize?request_uri=https%3A%2F%2Fapi.example%2Frequest',
    'openid4vp://?client_id=did%3Akey%3Az6Mk&request=signed-request',
    'openid-vc://authorize?request_uri=https%3A%2F%2Fapi.example%2Frequest',
    'https://wallet.example/present?request_uri=https%3A%2F%2Fapi.example%2Frequest',
  ])('routes a presentation to consent, even in legacy save mode: %s', (qr) => {
    const kind = walletQrKind(qr)
    expect(kind).toBe('presentation-request')
    for (const mode of [null, 'wallet', 'save-credential', 'verify-presentation']) {
      expect(shouldAcceptScannedOffer(kind, mode)).toBe(false)
    }
  })

  test.each([
    'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fapi.example%2Foffer',
    'openid-credential-offer://?credential_offer=%7B%7D',
    'openid-initiate-issuance://?credential_offer_uri=https%3A%2F%2Fapi.example%2Foffer',
    'https://wallet.example?credential_offer_uri=https%3A%2F%2Fapi.example%2Foffer&request_uri=wrapper',
  ])('preserves credential issuance dispatch: %s', (qr) => {
    const kind = walletQrKind(qr)
    expect(kind).toBe('credential-offer')
    expect(shouldAcceptScannedOffer(kind, 'wallet')).toBe(true)
  })

  test.each(['', 'not a QR URL', 'https://example.com', 'https://example.com/path/request_uri=fake'])(
    'does not submit unrecognized QR data as a credential offer: %s',
    (qr) => {
      const kind = walletQrKind(qr)
      expect(kind).toBe('unknown')
      expect(shouldAcceptScannedOffer(kind, 'wallet')).toBe(false)
    },
  )
})
